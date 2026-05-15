"""Audio quality gate at /api/*/analyze ingress.

Vaani CAVP rev 3 surfaces only acoustic measurement. That contract requires
the underlying audio to actually carry usable signal. Without this gate, a
candidate can upload a silent / clipped / 0.5-second / pure-noise file and
still receive an IELTS band — fabricated from whatever the pipeline coaxes
out of garbage. This module measures four cheap, well-defined acoustic
properties and returns a structured verdict so the API layer can either
proceed or refuse with a citable reason.

Same shape as the language gate already shipped: when audio is unusable the
endpoint sets `ielts: null` (or `toefl: null`) and returns warnings — never
a fabricated score.

Measurements (all from a single mono 16k-resampled read; ~50 ms on a 10s clip):

    duration_seconds      — clip length
    rms_dbfs              — loudness (root-mean-square, dB relative to full scale)
    peak_dbfs             — peak amplitude (dB FS); ≥ -0.1 dB FS suggests clipping
    clipping_ratio        — fraction of samples within 0.5 dB of full scale
    snr_db                — signal-to-noise ratio (top-decile vs bottom-decile RMS)
    speech_presence_ratio — fraction of frames whose RMS is ≥ noise floor + 6 dB

Thresholds were chosen conservatively from typical IELTS Speaking submissions
(phone-recorded, conversational, 16-32 kHz). They reject obvious failure
modes without being so tight that legitimate Indian-English candidates fail.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
import soundfile as sf


# ── Thresholds (each rejection is independent) ───────────────────────────
MIN_DURATION_S = 3.0           # IELTS Part 2 long turn is 1-2 min; <3s is clearly truncated
MAX_DURATION_S = 240.0         # >4 min for an IELTS task is suspicious / unsupported
MIN_RMS_DBFS = -45.0           # below this is essentially silence / inaudible
CLIPPING_THRESHOLD = 0.05      # >5% of samples saturated → clipped
MIN_SNR_DB = 6.0               # below this is heavy noise dominating speech
MIN_SPEECH_PRESENCE = 0.20     # at least 20% of frames must contain energy above floor

# Frame parameters for SNR + speech-presence estimation
_FRAME_MS = 30
_HOP_MS = 15

# Module version stamped on every quality report so consumers can pin behaviour.
AUDIO_QUALITY_VERSION = "audio-quality@1.0"


@dataclass
class AudioQualityReport:
    passed: bool
    duration_seconds: float
    rms_dbfs: float
    peak_dbfs: float
    clipping_ratio: float
    snr_db: float
    speech_presence_ratio: float
    sample_rate: int
    channels: int
    reject_reasons: list[str] = field(default_factory=list)
    # audio_class: a single tag describing what this recording looks
    # like to the rest of the pipeline. The router (engine main.py)
    # uses it to pick layer-specific parameter presets without each
    # layer having to re-derive "is this peak-limited?" from scratch.
    # Values: clean | normal | quiet | clipped | limited | silent_floor
    #       | short | rejected
    audio_class: str = "normal"
    data_quality_score: float = 0.0
    version: str = AUDIO_QUALITY_VERSION

    def to_dict(self) -> dict:
        return {
            "passed": self.passed,
            "duration_seconds": round(self.duration_seconds, 3),
            "rms_dbfs": round(self.rms_dbfs, 2),
            "peak_dbfs": round(self.peak_dbfs, 2),
            "clipping_ratio": round(self.clipping_ratio, 5),
            "snr_db": round(self.snr_db, 2),
            "speech_presence_ratio": round(self.speech_presence_ratio, 4),
            "sample_rate": self.sample_rate,
            "channels": self.channels,
            "reject_reasons": list(self.reject_reasons),
            "audio_class": self.audio_class,
            "data_quality_score": round(self.data_quality_score, 3),
            "version": self.version,
        }


def _classify_audio(
    *,
    duration: float,
    rms_dbfs: float,
    peak_dbfs: float,
    clipping_ratio: float,
    snr_db: float,
    rms_linear: float,
    floor_q10: float,
    crest: float,
    rejected: bool,
) -> str:
    """Tag the recording with a class the router can act on. Order
    matters: rejection wins over everything; then specific defects
    (clipping, silent floor) win over generic loudness tiers."""
    if rejected:
        return "rejected"
    if duration < 5.0:
        return "short"
    if clipping_ratio > 0.005:
        return "clipped"
    if floor_q10 < 1e-4 and crest >= 5.0:
        # Digitally silent gaps (broadcast-mastered podcast-style audio).
        return "silent_floor"
    if crest < 5.0 and rms_linear > 0.05:
        # Dynamic range crushed by broadcast limiting / aggressive compression.
        return "limited"
    if rms_dbfs < -38.0:
        return "quiet"
    if snr_db >= 35.0 and clipping_ratio == 0:
        return "clean"
    return "normal"


def _to_dbfs(rms: float) -> float:
    """Convert linear RMS [0, 1] → dB FS, with a safe floor."""
    if rms <= 1e-10:
        return -200.0
    return 20.0 * math.log10(rms)


def _frame_rms(samples: np.ndarray, sr: int) -> np.ndarray:
    """Per-frame RMS using a sliding window. Returns RMS values for each hop."""
    frame_len = max(1, int(sr * _FRAME_MS / 1000))
    hop_len = max(1, int(sr * _HOP_MS / 1000))
    if samples.size < frame_len:
        return np.array([float(np.sqrt(np.mean(samples.astype(np.float64) ** 2)))])
    n_frames = 1 + (samples.size - frame_len) // hop_len
    out = np.empty(n_frames, dtype=np.float64)
    for i in range(n_frames):
        start = i * hop_len
        seg = samples[start:start + frame_len].astype(np.float64)
        out[i] = float(np.sqrt(np.mean(seg ** 2)))
    return out


def assess_audio_quality(audio_path: Path) -> AudioQualityReport:
    """Read the audio file and produce a quality report. Pure measurement —
    never raises on bad audio; the caller decides the response shape.

    Honours the "never raises" contract by catching anything sf.read can throw
    (corrupt container, unsupported codec, missing file, permission errors)
    and returning a `passed=False` report tagged with `unreadable_audio:<reason>`.
    Callers that previously had to wrap this in try/except can drop that.
    """
    try:
        samples, sr = sf.read(str(audio_path), always_2d=False)
    except Exception as exc:  # noqa: BLE001 — soundfile raises a mix of types
        return AudioQualityReport(
            passed=False,
            duration_seconds=0.0,
            rms_dbfs=-200.0,
            peak_dbfs=-200.0,
            clipping_ratio=0.0,
            snr_db=-200.0,
            speech_presence_ratio=0.0,
            sample_rate=0,
            channels=0,
            reject_reasons=[f"unreadable_audio: {type(exc).__name__}"],
        )
    if samples.ndim == 2:
        channels = samples.shape[1]
        # Mix to mono for analysis (preserve original channel count for the report).
        mono = samples.mean(axis=1)
    else:
        channels = 1
        mono = samples

    duration = float(mono.size) / float(max(1, sr))

    # If the file is empty, skip math and report directly.
    if mono.size == 0:
        return AudioQualityReport(
            passed=False,
            duration_seconds=0.0,
            rms_dbfs=-200.0,
            peak_dbfs=-200.0,
            clipping_ratio=0.0,
            snr_db=-200.0,
            speech_presence_ratio=0.0,
            sample_rate=int(sr),
            channels=int(channels),
            reject_reasons=["empty_audio"],
        )

    # Normalize to [-1, 1] regardless of source dtype (sf.read already does
    # this for float dtypes; ints arrive scaled by sf when subtype-aware).
    if mono.dtype.kind in ("i", "u"):
        max_abs = float(np.iinfo(mono.dtype).max)
        mono = mono.astype(np.float64) / max_abs
    else:
        mono = mono.astype(np.float64)

    abs_mono = np.abs(mono)
    peak = float(abs_mono.max()) if abs_mono.size else 0.0
    rms = float(np.sqrt(np.mean(mono ** 2))) if mono.size else 0.0
    rms_dbfs = _to_dbfs(rms)
    peak_dbfs = _to_dbfs(peak)

    clipping_ratio = float((abs_mono >= 0.997).mean())  # ~ -0.026 dB FS

    frame_rms = _frame_rms(mono, sr)
    if frame_rms.size >= 10:
        sorted_frames = np.sort(frame_rms)
        # Bottom decile = noise floor estimate; top decile = signal estimate.
        noise_floor = float(np.median(sorted_frames[: max(1, len(sorted_frames) // 10)]))
        signal_top = float(np.median(sorted_frames[-max(1, len(sorted_frames) // 10):]))
        # Cap the displayed SNR at the physical ceiling for consumer
        # mics/digital audio (~80 dB). Without this, a recording with a
        # truly silent noise floor (interview_75 in the 2026-05-08 eval)
        # produces SNR ≈ 183 dB because the bottom-decile RMS is at the
        # _to_dbfs() floor of -200 dBFS. The QC check still uses the raw
        # value to gate; only the user-visible field is clamped.
        raw_snr = _to_dbfs(signal_top) - _to_dbfs(noise_floor)
        snr_db = min(80.0, raw_snr)
        # Speech-presence: frames whose dBFS is at least 6 dB above the noise floor.
        floor_dbfs = _to_dbfs(noise_floor)
        speech_presence = float(np.mean([_to_dbfs(v) >= floor_dbfs + 6.0 for v in frame_rms]))
    else:
        # Too short to estimate reliably; still produce a number for completeness.
        snr_db = 0.0
        speech_presence = 0.0

    reasons: list[str] = []
    if duration < MIN_DURATION_S:
        reasons.append(
            f"duration_too_short: {duration:.2f}s < {MIN_DURATION_S}s minimum"
        )
    if duration > MAX_DURATION_S:
        reasons.append(
            f"duration_too_long: {duration:.1f}s > {MAX_DURATION_S}s maximum"
        )
    if rms_dbfs < MIN_RMS_DBFS:
        reasons.append(
            f"too_quiet: RMS {rms_dbfs:.1f} dBFS < {MIN_RMS_DBFS} dBFS — recording is essentially silent"
        )
    if clipping_ratio > CLIPPING_THRESHOLD:
        reasons.append(
            f"clipped: {clipping_ratio*100:.1f}% of samples saturated (>{CLIPPING_THRESHOLD*100:.0f}% threshold)"
        )
    if snr_db < MIN_SNR_DB and frame_rms.size >= 10:
        reasons.append(
            f"low_snr: {snr_db:.1f} dB < {MIN_SNR_DB} dB — noise dominates speech"
        )
    if speech_presence < MIN_SPEECH_PRESENCE and frame_rms.size >= 10:
        reasons.append(
            f"insufficient_speech: only {speech_presence*100:.0f}% of frames contain speech-level energy"
        )

    # Floor estimate for the audio-class tagger: bottom-decile RMS in
    # linear units. Same statistic the LPC pre-processor uses to detect
    # digitally-silent gaps.
    floor_q10 = float(np.quantile(frame_rms, 0.10)) if frame_rms.size >= 10 else rms * 0.05
    crest = peak / (rms + 1e-12) if rms > 0 else 0.0
    audio_class = _classify_audio(
        duration=duration, rms_dbfs=rms_dbfs, peak_dbfs=peak_dbfs,
        clipping_ratio=clipping_ratio, snr_db=snr_db,
        rms_linear=rms, floor_q10=floor_q10, crest=crest,
        rejected=bool(reasons),
    )

    # Data quality score (0.0 - 1.0) encoding how reliable the audio is for
    # downstream acoustic measurement. Dimensions weighted equally, each
    # sub-scores 0-1. Useful for rubrics that want to degrade gracefully
    # rather than reject outright.
    dur_score = min(1.0, duration / 60.0)  # 60s = ideal, below 3s = near-zero
    dur_score = max(0.0, dur_score)
    snr_score = min(1.0, snr_db / 30.0) if snr_db > 0 else 0.0
    speech_score = min(1.0, speech_presence / 0.80) if speech_presence > 0 else 0.0
    clipping_penalty = min(1.0, clipping_ratio * 10.0)  # 10% clipping = 1.0 penalty
    clip_score = 1.0 - clipping_penalty
    quality_score = round((dur_score * 0.20 + snr_score * 0.30 + speech_score * 0.35 + clip_score * 0.15), 3)
    quality_score = max(0.0, min(1.0, quality_score))

    return AudioQualityReport(
        passed=len(reasons) == 0,
        duration_seconds=duration,
        rms_dbfs=rms_dbfs,
        peak_dbfs=peak_dbfs,
        clipping_ratio=clipping_ratio,
        snr_db=snr_db,
        speech_presence_ratio=speech_presence,
        sample_rate=int(sr),
        channels=int(channels),
        reject_reasons=reasons,
        audio_class=audio_class,
        data_quality_score=quality_score,
    )


def report_to_warning(report: AudioQualityReport) -> str:
    """Build the warning string the analyze endpoint surfaces when the gate fails.

    Mirrors the existing language-gate warning style: lead with the verdict,
    then enumerate measured numbers so the user can fix their recording.
    """
    bullets = "; ".join(report.reject_reasons) or "no signal"
    return (
        f"Audio quality gate failed ({bullets}). Bands not produced — please re-record. "
        f"Measured: duration={report.duration_seconds:.1f}s, "
        f"RMS={report.rms_dbfs:.1f} dBFS, peak={report.peak_dbfs:.1f} dBFS, "
        f"clipping={report.clipping_ratio*100:.1f}%, "
        f"SNR={report.snr_db:.1f} dB, speech-presence={report.speech_presence_ratio*100:.0f}%."
    )
