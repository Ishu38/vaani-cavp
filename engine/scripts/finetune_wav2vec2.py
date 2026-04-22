"""
Fine-tune Wav2Vec2 for phoneme recognition on Vani-collected data.

Reads the JSONL manifest produced by export_training_data.py and fine-tunes
facebook/wav2vec2-base-960h with CTC loss for improved phoneme segmentation.

Usage:
    # Basic:
    python engine/scripts/finetune_wav2vec2.py \
        --manifest ./training_data/wav2vec2/manifest.jsonl

    # Custom:
    python engine/scripts/finetune_wav2vec2.py \
        --manifest ./training_data/wav2vec2/manifest.jsonl \
        --base-model facebook/wav2vec2-base-960h \
        --output ./models/wav2vec2-vani \
        --epochs 30 \
        --batch-size 4
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import torch
from torch.utils.data import Dataset

import librosa
from transformers import (
    Wav2Vec2CTCTokenizer,
    Wav2Vec2FeatureExtractor,
    Wav2Vec2ForCTC,
    Wav2Vec2Processor,
    Trainer,
    TrainingArguments,
)
import evaluate


def load_manifest(path: Path) -> list[dict]:
    samples: list[dict] = []
    with open(path) as f:
        for line in f:
            samples.append(json.loads(line))
    return samples


def build_vocab(samples: list[dict]) -> dict[str, int]:
    """Build phoneme vocabulary from all training samples."""
    phonemes: set[str] = set()
    for s in samples:
        for p in s.get("phoneme_labels", []):
            ph = p.get("phoneme", "").strip()
            if ph:
                phonemes.add(ph)

    vocab: dict[str, int] = {"<pad>": 0, "<unk>": 1, "|": 2}
    for i, ph in enumerate(sorted(phonemes), start=3):
        vocab[ph] = i

    return vocab


class PhonemeDataset(Dataset):
    def __init__(
        self,
        samples: list[dict],
        feature_extractor: Wav2Vec2FeatureExtractor,
        vocab: dict[str, int],
        max_duration: float = 15.0,
    ) -> None:
        self.samples = samples
        self.feature_extractor = feature_extractor
        self.vocab = vocab
        self.max_duration = max_duration
        self.unk_id = vocab.get("<unk>", 1)

    def __len__(self) -> int:
        return len(self.samples)

    def __getitem__(self, idx: int) -> dict:
        sample = self.samples[idx]

        audio, sr = librosa.load(sample["audio_filepath"], sr=16000)
        max_samples = int(self.max_duration * 16000)
        if len(audio) > max_samples:
            audio = audio[:max_samples]

        inputs = self.feature_extractor(
            audio, sampling_rate=16000, return_tensors="np", padding=False
        )

        # Build label sequence from phoneme labels
        labels = []
        for p in sample.get("phoneme_labels", []):
            ph = p.get("phoneme", "").strip()
            if ph:
                labels.append(self.vocab.get(ph, self.unk_id))

        return {
            "input_values": inputs.input_values[0],
            "labels": labels,
        }


class DataCollatorCTC:
    def __init__(self, feature_extractor: Wav2Vec2FeatureExtractor, pad_token_id: int = 0) -> None:
        self.feature_extractor = feature_extractor
        self.pad_token_id = pad_token_id

    def __call__(self, features: list[dict]) -> dict:
        input_features = [{"input_values": f["input_values"]} for f in features]
        batch = self.feature_extractor.pad(
            input_features, padding=True, return_tensors="pt"
        )

        label_features = [f["labels"] for f in features]
        max_label_len = max(len(l) for l in label_features)
        padded_labels = []
        for l in label_features:
            padded = l + [-100] * (max_label_len - len(l))
            padded_labels.append(padded)

        batch["labels"] = torch.tensor(padded_labels, dtype=torch.long)
        return batch


def main() -> None:
    parser = argparse.ArgumentParser(description="Fine-tune Wav2Vec2 for phoneme recognition")
    parser.add_argument("--manifest", type=str, required=True, help="Path to wav2vec2 manifest.jsonl")
    parser.add_argument("--base-model", type=str, default="facebook/wav2vec2-base-960h")
    parser.add_argument("--output", type=str, default="./models/wav2vec2-vani", help="Output directory")
    parser.add_argument("--epochs", type=int, default=30)
    parser.add_argument("--batch-size", type=int, default=4)
    parser.add_argument("--learning-rate", type=float, default=3e-5)
    parser.add_argument("--warmup-steps", type=int, default=500)
    parser.add_argument("--freeze-feature-encoder", action="store_true", default=True,
                        help="Freeze CNN feature encoder (recommended for small datasets)")
    parser.add_argument("--eval-split", type=float, default=0.1)
    parser.add_argument("--fp16", action="store_true", default=torch.cuda.is_available())
    args = parser.parse_args()

    output_dir = Path(args.output).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    print(f"Loading manifest: {args.manifest}")
    all_samples = load_manifest(Path(args.manifest))
    print(f"  Total samples: {len(all_samples)}")

    # Build phoneme vocabulary
    vocab = build_vocab(all_samples)
    print(f"  Vocabulary size: {len(vocab)} phonemes")

    # Save vocab for inference
    vocab_path = output_dir / "vocab.json"
    with open(vocab_path, "w") as f:
        json.dump(vocab, f, indent=2, ensure_ascii=False)

    # Initialize tokenizer from vocab
    tokenizer = Wav2Vec2CTCTokenizer(
        str(vocab_path),
        unk_token="<unk>",
        pad_token="<pad>",
        word_delimiter_token="|",
    )

    feature_extractor = Wav2Vec2FeatureExtractor.from_pretrained(args.base_model)
    processor = Wav2Vec2Processor(feature_extractor=feature_extractor, tokenizer=tokenizer)

    print(f"Loading model: {args.base_model}")
    model = Wav2Vec2ForCTC.from_pretrained(
        args.base_model,
        ctc_loss_reduction="mean",
        pad_token_id=vocab["<pad>"],
        vocab_size=len(vocab),
        ignore_mismatched_sizes=True,
    )

    if args.freeze_feature_encoder:
        model.freeze_feature_encoder()
        print("  Feature encoder frozen (only fine-tuning transformer layers)")

    # Train/eval split
    np.random.seed(42)
    indices = np.random.permutation(len(all_samples))
    split = int(len(all_samples) * (1 - args.eval_split))
    train_samples = [all_samples[i] for i in indices[:split]]
    eval_samples = [all_samples[i] for i in indices[split:]]
    print(f"  Train: {len(train_samples)}, Eval: {len(eval_samples)}")

    train_dataset = PhonemeDataset(train_samples, feature_extractor, vocab)
    eval_dataset = PhonemeDataset(eval_samples, feature_extractor, vocab)

    data_collator = DataCollatorCTC(feature_extractor=feature_extractor, pad_token_id=vocab["<pad>"])

    # Metrics
    wer_metric = evaluate.load("wer")
    reverse_vocab = {v: k for k, v in vocab.items()}

    def compute_metrics(pred) -> dict:
        logits = pred.predictions
        pred_ids = np.argmax(logits, axis=-1)
        label_ids = pred.label_ids

        # Decode predictions (CTC greedy)
        pred_strs = []
        for seq in pred_ids:
            phones = []
            prev = -1
            for tok in seq:
                if tok != prev and tok != vocab["<pad>"]:
                    phones.append(reverse_vocab.get(tok, "<unk>"))
                prev = tok
            pred_strs.append(" ".join(phones))

        # Decode labels
        label_strs = []
        for seq in label_ids:
            phones = [reverse_vocab.get(tok, "") for tok in seq if tok != -100]
            label_strs.append(" ".join(phones))

        per = 100 * wer_metric.compute(predictions=pred_strs, references=label_strs)
        return {"per": per}

    training_args = TrainingArguments(
        output_dir=str(output_dir),
        per_device_train_batch_size=args.batch_size,
        per_device_eval_batch_size=args.batch_size,
        gradient_accumulation_steps=max(1, 8 // args.batch_size),
        learning_rate=args.learning_rate,
        warmup_steps=args.warmup_steps,
        num_train_epochs=args.epochs,
        fp16=args.fp16,
        eval_strategy="epoch",
        save_strategy="epoch",
        save_total_limit=3,
        load_best_model_at_end=True,
        metric_for_best_model="per",
        greater_is_better=False,
        logging_steps=25,
        report_to=["tensorboard"],
        push_to_hub=False,
        dataloader_num_workers=2,
        group_by_length=True,
    )

    trainer = Trainer(
        args=training_args,
        model=model,
        train_dataset=train_dataset,
        eval_dataset=eval_dataset,
        data_collator=data_collator,
        compute_metrics=compute_metrics,
        processing_class=processor.feature_extractor,
    )

    print("\nStarting fine-tuning...")
    trainer.train()

    print(f"\nSaving model to {output_dir}")
    trainer.save_model(str(output_dir))
    processor.save_pretrained(str(output_dir))

    print("\nDone! To use your fine-tuned model in Vani:")
    print(f"  Update ai_classification.py to load from: {output_dir}")
    print("  Or set WAV2VEC_MODEL={} in .env".format(output_dir))


if __name__ == "__main__":
    main()
