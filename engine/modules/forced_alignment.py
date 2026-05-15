"""Forced alignment — wav2vec2-CTC backend (single, only path).

Pre-2026-05-08 this module ran an MFA → WebMAUS → whisper-g2p fallback
chain. Each leg had its own failure mode:
  - MFA's HMM-GMM Viterbi collapsed on peak-limited / studio-mastered
    audio (interview_75 in the IELTS eval) and required widening beam to
    100/400 to recover. Conda-env install fragility, dictionary OOV
    issues, subprocess pool bookkeeping.
  - WebMAUS depended on a charity-run BAS endpoint, took 30-90s when
    healthy, and silently rotated parameter formats (we discovered the
    `/runMAUS` vs `/runPipeline` switch the hard way).
  - whisper-g2p fallback produced "low quality" alignment — coarse word
    interpolation, not phoneme-level acoustic locking.

This rewrite consolidates on the modern wav2vec2-CTC alignment stack
(see modules.wav2vec_ctc_align). It reuses the wav2vec2-espeak phoneme
model that Layer 3 already loads, runs locally on GPU, and is robust to
L2 / accented / processed audio because CTC alignment uses per-frame
posteriors instead of a Viterbi beam.

Public surface kept stable so downstream layers (main pipeline,
phoneme_analysis, connected_speech) don't need to change:
  - PhoneSegment / AlignmentResult dataclasses
  - forced_align(audio_path, transcript, language, ...) facade
  - alignment_to_phoneme_spans() format converter
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)


@dataclass
class PhoneSegment:
    """A single phone-level segment from forced alignment."""
    phone: str
    start_ms: float
    end_ms: float
    duration_ms: float
    confidence: float = 1.0
    source: str = "wav2vec2_ctc"


@dataclass
class AlignmentResult:
    """Complete forced alignment output."""
    phones: list[PhoneSegment] = field(default_factory=list)
    words: list[dict[str, Any]] = field(default_factory=list)
    source: str = "none"
    textgrid_path: str | None = None
    success: bool = False
    error: str | None = None


def forced_align(
    audio_path: Path,
    transcript: str,
    language: str = "en",
    prefer: str = "wav2vec2_ctc",
    word_timestamps: list[dict[str, Any]] | None = None,
) -> AlignmentResult:
    """Run forced alignment via wav2vec2 phoneme CTC.

    `prefer` and `word_timestamps` are accepted for backwards
    compatibility with the legacy MFA/WebMAUS/g2p caller signature in
    main.py — they are ignored here, since wav2vec2-CTC is the only
    backend.
    """
    if not transcript or not transcript.strip():
        return AlignmentResult(error="No transcript provided for alignment")

    try:
        from modules.wav2vec_ctc_align import align_with_wav2vec
    except ImportError as exc:
        logger.exception("wav2vec2-CTC aligner import failed")
        return AlignmentResult(error=f"aligner import failed: {exc}")

    out = align_with_wav2vec(audio_path, transcript, language=language)
    if not out.success:
        logger.warning("wav2vec2-CTC alignment failed: %s", out.error)
        return AlignmentResult(error=out.error or "alignment failed",
                               source="wav2vec2_ctc")

    phones: list[PhoneSegment] = []
    for p in out.phones:
        start = float(p["start_ms"])
        end = float(p["end_ms"])
        phones.append(PhoneSegment(
            phone=p.get("phoneme", p.get("label", "")),
            start_ms=start,
            end_ms=end,
            duration_ms=end - start,
            confidence=float(p.get("confidence", 1.0)),
            source="wav2vec2_ctc",
        ))

    logger.info("wav2vec2-CTC alignment succeeded: %d phones, %d words",
                len(phones), len(out.words))
    return AlignmentResult(
        phones=phones,
        words=list(out.words),
        source="wav2vec2_ctc",
        success=True,
    )


def alignment_to_phoneme_spans(alignment: AlignmentResult) -> list[dict[str, Any]]:
    """Convert AlignmentResult to the phoneme span format used by the rest
    of the pipeline. Same structure as Wav2Vec2 CTC output in
    ai_classification.py — downstream modules (phoneme_analysis,
    connected_speech, etc.) consume this unchanged."""
    spans = []
    for seg in alignment.phones:
        spans.append({
            "phoneme": seg.phone,
            "start_ms": seg.start_ms,
            "end_ms": seg.end_ms,
            "duration_ms": seg.duration_ms,
            "confidence": seg.confidence,
            "source": seg.source,
        })
    return spans
