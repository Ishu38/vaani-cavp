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


def transcribe(
    audio_path: str | Path,
    model_name: str = "base",
    device: str = "cuda",
) -> TranscriptionResult:
    """Transcribe audio file using OpenAI Whisper."""
    audio_path = Path(audio_path)
    if not audio_path.exists():
        raise FileNotFoundError(f"Audio file not found: {audio_path}")

    model = _load_whisper(model_name, device)
    result = model.transcribe(
        str(audio_path),
        task="transcribe",
        verbose=False,
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

    return TranscriptionResult(
        text=result["text"].strip(),
        language=result.get("language", "unknown"),
        language_probability=result.get("language_probability", 0.0)
        if "language_probability" in result
        else 0.0,
        segments=segments,
        duration_seconds=duration,
    )


def get_word_timestamps(
    audio_path: str | Path,
    model_name: str = "base",
    device: str = "cuda",
) -> list[dict[str, Any]]:
    """Extract word-level timestamps using Whisper with word_timestamps."""
    model = _load_whisper(model_name, device)
    result = model.transcribe(
        str(audio_path),
        word_timestamps=True,
        verbose=False,
    )
    words: list[dict[str, Any]] = []
    for seg in result.get("segments", []):
        for w in seg.get("words", []):
            words.append({
                "word": w["word"].strip(),
                "start": round(w["start"], 3),
                "end": round(w["end"], 3),
                "probability": round(w.get("probability", 0.0), 4),
            })
    return words
