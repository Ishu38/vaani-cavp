"""TRANSCRIPTION LAYER
WAV -> Whisper -> Text transcript
WAV -> phonetic segmentation timestamps
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import numpy as np

logger = logging.getLogger(__name__)

_whisper_model: Any = None


def _load_whisper(model_name: str = "base", device: str = "cuda") -> Any:
    global _whisper_model
    if _whisper_model is None:
        try:
            import whisper
            logger.info("Loading Whisper model '%s' on %s", model_name, device)
            _whisper_model = whisper.load_model(model_name, device=device)
        except Exception as exc:
            logger.warning("Whisper load failed (%s), falling back to CPU", exc)
            import whisper
            _whisper_model = whisper.load_model(model_name, device="cpu")
    return _whisper_model


@dataclass
class Segment:
    start: float
    end: float
    text: str
    avg_logprob: float = 0.0


@dataclass
class TranscriptionResult:
    text: str
    language: str
    language_probability: float
    segments: list[Segment] = field(default_factory=list)
    duration_seconds: float = 0.0
    word_timestamps: list[dict[str, Any]] = field(default_factory=list)


def _extract_words(result: dict[str, Any]) -> list[dict[str, Any]]:
    words: list[dict[str, Any]] = []
    for seg in result.get("segments", []):
        for w in seg.get("words", []) or []:
            words.append({
                "word": (w.get("word") or "").strip(),
                "start": round(w.get("start", 0.0), 3),
                "end": round(w.get("end", 0.0), 3),
                "probability": round(w.get("probability", 0.0), 4),
            })
    return words


def transcribe(
    audio_path: str | Path,
    model_name: str = "base",
    device: str = "cuda",
    word_timestamps: bool = True,
) -> TranscriptionResult:
    """Transcribe audio file using OpenAI Whisper.

    word_timestamps=True returns word-level alignment in the same pass — no
    second decode. Set False only for the lightweight /api/transcribe path
    where word alignment is not needed.
    """
    audio_path = Path(audio_path)
    if not audio_path.exists():
        raise FileNotFoundError(f"Audio file not found: {audio_path}")

    model = _load_whisper(model_name, device)

    # openai-whisper's transcribe() does not surface language probability in
    # its result dict — only the chosen language. Run detect_language() once
    # so we get a real confidence number for downstream gating.
    detected_lang: str | None = None
    detected_prob: float = 0.0
    try:
        import whisper as _w
        _audio = _w.load_audio(str(audio_path))
        _audio = _w.pad_or_trim(_audio)
        _mel = _w.log_mel_spectrogram(_audio, n_mels=model.dims.n_mels).to(model.device)
        _, _probs = model.detect_language(_mel)
        if _probs:
            detected_lang = max(_probs, key=_probs.get)
            detected_prob = float(_probs[detected_lang])
    except Exception as exc:
        logger.warning("language detection failed: %s", exc)

    result = model.transcribe(
        str(audio_path),
        task="transcribe",
        verbose=False,
        word_timestamps=word_timestamps,
    )

    segments = [
        Segment(
            start=seg["start"],
            end=seg["end"],
            text=seg["text"].strip(),
            avg_logprob=seg.get("avg_logprob", 0.0),
        )
        for seg in result.get("segments", [])
    ]

    duration = segments[-1].end if segments else 0.0
    words = _extract_words(result) if word_timestamps else []

    return TranscriptionResult(
        text=result["text"].strip(),
        language=result.get("language") or detected_lang or "unknown",
        language_probability=detected_prob,
        segments=segments,
        duration_seconds=duration,
        word_timestamps=words,
    )


def get_word_timestamps(
    audio_path: str | Path,
    model_name: str = "base",
    device: str = "cuda",
) -> list[dict[str, Any]]:
    """Back-compat shim — prefer transcribe(..., word_timestamps=True)."""
    return transcribe(audio_path, model_name, device, word_timestamps=True).word_timestamps
