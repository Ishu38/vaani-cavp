"""
Fine-tune OpenAI Whisper on Vani-collected audio + corrected transcripts.

Reads the JSONL manifest produced by export_training_data.py and fine-tunes
the Whisper model using HuggingFace Transformers Seq2SeqTrainer.

Usage:
    # Basic (uses base model, 10 epochs):
    python engine/scripts/finetune_whisper.py \
        --manifest ./training_data/whisper/manifest.jsonl

    # Custom:
    python engine/scripts/finetune_whisper.py \
        --manifest ./training_data/whisper/manifest.jsonl \
        --base-model openai/whisper-small \
        --output ./models/whisper-vani \
        --epochs 20 \
        --batch-size 4 \
        --learning-rate 1e-5
"""

from __future__ import annotations

import argparse
import json
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
import torch
from torch.utils.data import Dataset

import librosa
from transformers import (
    WhisperFeatureExtractor,
    WhisperForConditionalGeneration,
    WhisperProcessor,
    WhisperTokenizer,
    Seq2SeqTrainer,
    Seq2SeqTrainingArguments,
)
import evaluate


# ---------------------------------------------------------------------------
# Mapping from openai-whisper model names to HuggingFace model IDs
# ---------------------------------------------------------------------------
WHISPER_HF_MAP: dict[str, str] = {
    "tiny": "openai/whisper-tiny",
    "base": "openai/whisper-base",
    "small": "openai/whisper-small",
    "medium": "openai/whisper-medium",
    "large": "openai/whisper-large-v3",
}


@dataclass
class WhisperSample:
    audio_filepath: str
    text: str
    duration: float
    language: str = "en"


def load_manifest(path: Path) -> list[WhisperSample]:
    samples: list[WhisperSample] = []
    with open(path) as f:
        for line in f:
            obj = json.loads(line)
            samples.append(WhisperSample(
                audio_filepath=obj["audio_filepath"],
                text=obj["text"],
                duration=obj.get("duration", 0.0),
                language=obj.get("language", "en"),
            ))
    return samples


class WhisperDataset(Dataset):
    def __init__(
        self,
        samples: list[WhisperSample],
        feature_extractor: WhisperFeatureExtractor,
        tokenizer: WhisperTokenizer,
        max_duration: float = 30.0,
    ) -> None:
        self.samples = samples
        self.feature_extractor = feature_extractor
        self.tokenizer = tokenizer
        self.max_duration = max_duration

    def __len__(self) -> int:
        return len(self.samples)

    def __getitem__(self, idx: int) -> dict:
        sample = self.samples[idx]

        audio, sr = librosa.load(sample.audio_filepath, sr=16000)
        max_samples = int(self.max_duration * 16000)
        if len(audio) > max_samples:
            audio = audio[:max_samples]

        input_features = self.feature_extractor(
            audio, sampling_rate=16000, return_tensors="np"
        ).input_features[0]

        labels = self.tokenizer(sample.text).input_ids

        return {
            "input_features": input_features,
            "labels": labels,
        }


@dataclass
class DataCollatorSpeechSeq2Seq:
    processor: WhisperProcessor
    decoder_start_token_id: int

    def __call__(self, features: list[dict]) -> dict:
        input_features = [{"input_features": f["input_features"]} for f in features]
        batch = self.processor.feature_extractor.pad(input_features, return_tensors="pt")

        label_features = [{"input_ids": f["labels"]} for f in features]
        labels_batch = self.processor.tokenizer.pad(label_features, return_tensors="pt")
        labels = labels_batch["input_ids"].masked_fill(
            labels_batch.attention_mask.ne(1), -100
        )

        # Remove BOS token if the decoder prepends it
        if (labels[:, 0] == self.decoder_start_token_id).all().cpu().item():
            labels = labels[:, 1:]

        batch["labels"] = labels
        return batch


def compute_wer(pred, tokenizer) -> dict:
    wer_metric = evaluate.load("wer")
    pred_ids = pred.predictions
    label_ids = pred.label_ids

    label_ids[label_ids == -100] = tokenizer.pad_token_id

    pred_str = tokenizer.batch_decode(pred_ids, skip_special_tokens=True)
    label_str = tokenizer.batch_decode(label_ids, skip_special_tokens=True)

    wer = 100 * wer_metric.compute(predictions=pred_str, references=label_str)
    return {"wer": wer}


def main() -> None:
    parser = argparse.ArgumentParser(description="Fine-tune Whisper on Vani data")
    parser.add_argument("--manifest", type=str, required=True, help="Path to whisper manifest.jsonl")
    parser.add_argument("--base-model", type=str, default="base",
                        help="Whisper model name (tiny/base/small/medium/large) or HuggingFace ID")
    parser.add_argument("--output", type=str, default="./models/whisper-vani", help="Output directory")
    parser.add_argument("--epochs", type=int, default=10)
    parser.add_argument("--batch-size", type=int, default=8)
    parser.add_argument("--learning-rate", type=float, default=1e-5)
    parser.add_argument("--warmup-steps", type=int, default=500)
    parser.add_argument("--eval-split", type=float, default=0.1, help="Fraction for eval set")
    parser.add_argument("--fp16", action="store_true", default=torch.cuda.is_available())
    args = parser.parse_args()

    model_id = WHISPER_HF_MAP.get(args.base_model, args.base_model)
    output_dir = Path(args.output).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    print(f"Loading model: {model_id}")
    feature_extractor = WhisperFeatureExtractor.from_pretrained(model_id)
    tokenizer = WhisperTokenizer.from_pretrained(model_id, language="English", task="transcribe")
    processor = WhisperProcessor.from_pretrained(model_id, language="English", task="transcribe")
    model = WhisperForConditionalGeneration.from_pretrained(model_id)
    model.generation_config.language = "English"
    model.generation_config.task = "transcribe"
    model.generation_config.forced_decoder_ids = None

    print(f"Loading manifest: {args.manifest}")
    all_samples = load_manifest(Path(args.manifest))
    print(f"  Total samples: {len(all_samples)}")

    # Train/eval split
    np.random.seed(42)
    indices = np.random.permutation(len(all_samples))
    split = int(len(all_samples) * (1 - args.eval_split))
    train_samples = [all_samples[i] for i in indices[:split]]
    eval_samples = [all_samples[i] for i in indices[split:]]
    print(f"  Train: {len(train_samples)}, Eval: {len(eval_samples)}")

    train_dataset = WhisperDataset(train_samples, feature_extractor, tokenizer)
    eval_dataset = WhisperDataset(eval_samples, feature_extractor, tokenizer)

    data_collator = DataCollatorSpeechSeq2Seq(
        processor=processor,
        decoder_start_token_id=model.config.decoder_start_token_id,
    )

    training_args = Seq2SeqTrainingArguments(
        output_dir=str(output_dir),
        per_device_train_batch_size=args.batch_size,
        per_device_eval_batch_size=args.batch_size,
        gradient_accumulation_steps=max(1, 16 // args.batch_size),
        learning_rate=args.learning_rate,
        warmup_steps=args.warmup_steps,
        num_train_epochs=args.epochs,
        fp16=args.fp16,
        eval_strategy="epoch",
        save_strategy="epoch",
        save_total_limit=3,
        load_best_model_at_end=True,
        metric_for_best_model="wer",
        greater_is_better=False,
        predict_with_generate=True,
        generation_max_length=225,
        logging_steps=25,
        report_to=["tensorboard"],
        push_to_hub=False,
        dataloader_num_workers=2,
    )

    trainer = Seq2SeqTrainer(
        args=training_args,
        model=model,
        train_dataset=train_dataset,
        eval_dataset=eval_dataset,
        data_collator=data_collator,
        compute_metrics=lambda pred: compute_wer(pred, tokenizer),
        processing_class=processor.feature_extractor,
    )

    print("\nStarting fine-tuning...")
    trainer.train()

    print(f"\nSaving model to {output_dir}")
    trainer.save_model(str(output_dir))
    processor.save_pretrained(str(output_dir))

    print("\nDone! To use your fine-tuned model:")
    print(f"  Set WHISPER_MODEL={output_dir} in .env")
    print("  Or load directly: whisper.load_model(str(output_dir))")


if __name__ == "__main__":
    main()
