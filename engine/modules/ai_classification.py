"""AI CLASSIFICATION LAYER
Wav2Vec 2.0   -> Phoneme identification
SpeechBrain   -> Emotion + Accent classification
langdetect    -> Language identification
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import numpy as np

logger = logging.getLogger(__name__)

# Lazy-loaded singletons
_wav2vec_model: Any = None
_wav2vec_processor: Any = None
_emotion_classifier: Any = None


# ---------------------------------------------------------------------------
# Wav2Vec 2.0: Phoneme-level identification
# ---------------------------------------------------------------------------

@dataclass
class PhonemeSpan:
    phoneme: str
    start_ms: int
    end_ms: int
    confidence: float


@dataclass
class Wav2VecResult:
    phonemes: list[PhonemeSpan]
    raw_transcript: str
    model_name: str


def _load_wav2vec() -> tuple[Any, Any]:
    global _wav2vec_model, _wav2vec_processor
    if _wav2vec_model is None:
        from config import TORCH_DEVICE
        from transformers import Wav2Vec2ForCTC, Wav2Vec2Processor
        model_id = "facebook/wav2vec2-base-960h"
        logger.info("Loading Wav2Vec2 model: %s on %s", model_id, TORCH_DEVICE)
        _wav2vec_processor = Wav2Vec2Processor.from_pretrained(model_id)
        _wav2vec_model = Wav2Vec2ForCTC.from_pretrained(model_id).to(TORCH_DEVICE)
        _wav2vec_model.eval()
    return _wav2vec_model, _wav2vec_processor


def classify_phonemes(audio_path: str | Path) -> Wav2VecResult | None:
    """Identify phonemes from audio using Wav2Vec 2.0."""
    try:
        import torch
        import librosa
        from config import TORCH_DEVICE

        model, processor = _load_wav2vec()
        y, sr = librosa.load(str(audio_path), sr=16000)

        inputs = processor(y, sampling_rate=16000, return_tensors="pt", padding=True)
        inputs = {k: v.to(TORCH_DEVICE) for k, v in inputs.items()}
        with torch.no_grad():
            logits = model(**inputs).logits

        probs = torch.softmax(logits, dim=-1)
        predicted_ids = torch.argmax(logits, dim=-1)
        transcript = processor.batch_decode(predicted_ids)[0]

        # Extract phoneme-level spans
        ids = predicted_ids[0].tolist()
        prob_vals = probs[0].max(dim=-1).values.tolist()
        vocab = processor.tokenizer.get_vocab()
        id_to_char = {v: k for k, v in vocab.items()}

        ms_per_frame = (len(y) / sr * 1000) / len(ids) if ids else 0
        phonemes: list[PhonemeSpan] = []
        prev_id = -1
        for i, (pid, conf) in enumerate(zip(ids, prob_vals)):
            if pid == prev_id or pid == processor.tokenizer.pad_token_id:
                prev_id = pid
                continue
            char = id_to_char.get(pid, "?")
            if char == "|":
                char = " "
            phonemes.append(PhonemeSpan(
                phoneme=char,
                start_ms=int(i * ms_per_frame),
                end_ms=int((i + 1) * ms_per_frame),
                confidence=round(conf, 4),
            ))
            prev_id = pid

        return Wav2VecResult(
            phonemes=phonemes,
            raw_transcript=transcript,
            model_name="facebook/wav2vec2-base-960h",
        )
    except ImportError:
        logger.warning("transformers/torch not installed, skipping Wav2Vec")
        return None
    except Exception as exc:
        logger.warning("Wav2Vec classification failed: %s", exc)
        return None


# ---------------------------------------------------------------------------
# SpeechBrain: Emotion + Accent classification
# ---------------------------------------------------------------------------

@dataclass
class EmotionResult:
    label: str
    scores: dict[str, float]
    model_name: str


@dataclass
class AccentResult:
    accent: str
    confidence: float
    top_accents: dict[str, float]


@dataclass
class SpeechBrainResult:
    emotion: EmotionResult | None
    accent: AccentResult | None


def classify_speechbrain(audio_path: str | Path) -> SpeechBrainResult:
    """Classify emotion and accent using SpeechBrain."""
    emotion: EmotionResult | None = None
    accent: AccentResult | None = None

    # Emotion recognition
    try:
        from config import TORCH_DEVICE
        from speechbrain.inference.interfaces import foreign_class
        emotion_model = foreign_class(
            source="speechbrain/emotion-recognition-wav2vec2-IEMOCAP",
            pymodule_file="custom_interface.py",
            classname="CustomEncoderWav2vec2Classifier",
            savedir="/tmp/speechbrain_emotion",
            run_opts={"device": TORCH_DEVICE},
        )
        out_prob, score, index, label = emotion_model.classify_file(str(audio_path))
        probs = out_prob.squeeze().tolist()
        labels = ["neutral", "happy", "sad", "angry"]
        scores = {l: round(float(p), 4) for l, p in zip(labels, probs)} if len(probs) == len(labels) else {}
        emotion = EmotionResult(
            label=label[0] if isinstance(label, list) else str(label),
            scores=scores,
            model_name="speechbrain/emotion-recognition-wav2vec2-IEMOCAP",
        )
    except Exception as exc:
        logger.warning("SpeechBrain emotion failed: %s", exc)

    # Accent classification
    try:
        from config import TORCH_DEVICE
        from speechbrain.inference.classifiers import EncoderClassifier
        accent_model = EncoderClassifier.from_hparams(
            source="speechbrain/lang-id-commonlanguage_ecapa",
            savedir="/tmp/speechbrain_accent",
            run_opts={"device": TORCH_DEVICE},
        )
        out_prob, score, index, label = accent_model.classify_file(str(audio_path))
        accent = AccentResult(
            accent=label[0] if isinstance(label, list) else str(label),
            confidence=round(float(score.squeeze()), 4),
            top_accents={},
        )
    except Exception as exc:
        logger.warning("SpeechBrain accent failed: %s", exc)

    return SpeechBrainResult(emotion=emotion, accent=accent)


# ---------------------------------------------------------------------------
# langdetect: Language identification from text
# ---------------------------------------------------------------------------

@dataclass
class LanguageDetection:
    language: str
    confidence: float
    all_languages: dict[str, float]


def detect_language(text: str) -> LanguageDetection:
    """Detect language from text using langdetect."""
    try:
        from langdetect import detect_langs
        results = detect_langs(text)
        top = results[0]
        all_langs = {str(r.lang): round(float(r.prob), 4) for r in results}
        return LanguageDetection(
            language=str(top.lang),
            confidence=round(float(top.prob), 4),
            all_languages=all_langs,
        )
    except Exception as exc:
        logger.warning("Language detection failed: %s", exc)
        return LanguageDetection(language="unknown", confidence=0.0, all_languages={})
