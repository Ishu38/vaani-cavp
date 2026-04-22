"""PROSODIC PROFILING MODULE
F0 contour analysis, rhythm metrics (PVI, %V, nPVI, rPVI),
stress patterns, intonation contour classification.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

import numpy as np


@dataclass
class RhythmMetrics:
    percent_v: float         # %V — proportion of vocalic intervals
    delta_v: float           # deltaV — variability of vocalic intervals
    delta_c: float           # deltaC — variability of consonantal intervals
    npvi_v: float            # nPVI — normalized pairwise variability (vocalic)
    rpvi_c: float            # rPVI — raw pairwise variability (consonantal)
    varco_v: float           # VarcoV — variation coefficient of vocalic intervals
    varco_c: float           # VarcoC — variation coefficient of consonantal intervals
    rhythm_class: str        # "stress-timed", "syllable-timed", "mora-timed"


@dataclass
class IntonationContour:
    pattern: str             # "falling", "rising", "fall-rise", "rise-fall", "flat"
    boundary_tones: list[str]  # ToBI style: H%, L%, H-L%, L-H%
    pitch_accents: list[dict[str, Any]]
    declination_rate: float  # Hz/second baseline declination


@dataclass
class StressPattern:
    word: str
    stressed_syllable: int
    stress_type: str         # "primary", "secondary"
    duration_ratio: float    # stressed/unstressed duration ratio
    intensity_ratio: float   # stressed/unstressed intensity ratio
    f0_ratio: float         # stressed/unstressed F0 ratio


@dataclass
class ProsodicProfile:
    rhythm: RhythmMetrics
    intonation: IntonationContour
    stress_patterns: list[StressPattern]
    speech_rate_syl_per_sec: float
    mean_syllable_duration_ms: float
    pause_to_speech_ratio: float
    prosodic_score: float  # 0-100 overall prosodic nativeness


def _compute_rhythm_metrics(
    word_timestamps: list[dict[str, Any]],
) -> RhythmMetrics:
    """Compute rhythm metrics from word-level timing."""
    vocalic_intervals: list[float] = []
    consonantal_intervals: list[float] = []

    for w in word_timestamps:
        word = w.get("word", "")
        dur = (w.get("end", 0) - w.get("start", 0)) * 1000
        if dur <= 0:
            continue

        # Approximate V/C intervals from orthography
        vowels_in_word = sum(1 for c in word.lower() if c in "aeiou")
        consonants_in_word = sum(1 for c in word.lower() if c.isalpha() and c not in "aeiou")
        total_letters = vowels_in_word + consonants_in_word

        if total_letters > 0:
            v_dur = dur * (vowels_in_word / total_letters)
            c_dur = dur * (consonants_in_word / total_letters)
            if v_dur > 0:
                vocalic_intervals.append(v_dur)
            if c_dur > 0:
                consonantal_intervals.append(c_dur)

    v_arr = np.array(vocalic_intervals) if vocalic_intervals else np.array([0])
    c_arr = np.array(consonantal_intervals) if consonantal_intervals else np.array([0])

    total_duration = np.sum(v_arr) + np.sum(c_arr)
    percent_v = (np.sum(v_arr) / total_duration * 100) if total_duration > 0 else 0
    delta_v = float(np.std(v_arr))
    delta_c = float(np.std(c_arr))

    # nPVI (normalized pairwise variability index)
    def npvi(intervals: np.ndarray) -> float:
        if len(intervals) < 2:
            return 0.0
        diffs = []
        for i in range(len(intervals) - 1):
            mean_pair = (intervals[i] + intervals[i + 1]) / 2
            if mean_pair > 0:
                diffs.append(abs(intervals[i] - intervals[i + 1]) / mean_pair)
        return float(np.mean(diffs) * 100) if diffs else 0.0

    # rPVI (raw pairwise variability)
    def rpvi(intervals: np.ndarray) -> float:
        if len(intervals) < 2:
            return 0.0
        return float(np.mean([abs(intervals[i] - intervals[i + 1]) for i in range(len(intervals) - 1)]))

    npvi_v = npvi(v_arr)
    rpvi_c = rpvi(c_arr)

    varco_v = (delta_v / np.mean(v_arr) * 100) if np.mean(v_arr) > 0 else 0
    varco_c = (delta_c / np.mean(c_arr) * 100) if np.mean(c_arr) > 0 else 0

    # Rhythm class heuristic — calibrated 2026-04-21 on 50-clip Svarah set.
    # Bangla L1: nPVI mean 56, varco 55 (syllable-timed in Indian English reads);
    # Hindi L1: nPVI 71, varco 86 (stress-timed); Tamil L1: nPVI 60, varco 51.
    # Old thresholds (nPVI>55 stress, <35 syllable) placed Bangla in stress-timed.
    if npvi_v > 75 or varco_v > 80:
        rhythm_class = "stress-timed"
    elif npvi_v < 60 and varco_v < 70:
        rhythm_class = "syllable-timed"
    else:
        rhythm_class = "mixed"

    return RhythmMetrics(
        percent_v=round(percent_v, 2),
        delta_v=round(delta_v, 2),
        delta_c=round(delta_c, 2),
        npvi_v=round(npvi_v, 2),
        rpvi_c=round(rpvi_c, 2),
        varco_v=round(float(varco_v), 2),
        varco_c=round(float(varco_c), 2),
        rhythm_class=rhythm_class,
    )


def _analyze_intonation(pitch_contour: list[float]) -> IntonationContour:
    """Classify intonation pattern from pitch contour."""
    if not pitch_contour or len(pitch_contour) < 4:
        return IntonationContour(
            pattern="flat",
            boundary_tones=[],
            pitch_accents=[],
            declination_rate=0.0,
        )

    arr = np.array(pitch_contour)
    first_quarter = np.mean(arr[: len(arr) // 4])
    last_quarter = np.mean(arr[3 * len(arr) // 4 :])
    mid = np.mean(arr[len(arr) // 4 : 3 * len(arr) // 4])

    # Pattern classification
    if last_quarter < first_quarter * 0.85:
        pattern = "falling"
        boundary_tones = ["L%"]
    elif last_quarter > first_quarter * 1.15:
        pattern = "rising"
        boundary_tones = ["H%"]
    elif mid > first_quarter * 1.1 and last_quarter < mid * 0.9:
        pattern = "rise-fall"
        boundary_tones = ["L-H%", "H-L%"]
    elif mid < first_quarter * 0.9 and last_quarter > mid * 1.1:
        pattern = "fall-rise"
        boundary_tones = ["H-L%", "L-H%"]
    else:
        pattern = "flat"
        boundary_tones = ["L%"]

    # Pitch accents (local maxima)
    accents: list[dict[str, Any]] = []
    for i in range(1, len(arr) - 1):
        if arr[i] > arr[i - 1] and arr[i] > arr[i + 1]:
            accents.append({
                "position": i,
                "f0": round(float(arr[i]), 1),
                "type": "H*",
            })

    # Declination rate (linear regression slope)
    x = np.arange(len(arr))
    if len(arr) > 2:
        slope = float(np.polyfit(x, arr, 1)[0])
        # Convert to Hz/sec (assuming ~10ms per frame)
        decl_rate = slope * 100
    else:
        decl_rate = 0.0

    return IntonationContour(
        pattern=pattern,
        boundary_tones=boundary_tones,
        pitch_accents=accents[:20],
        declination_rate=round(decl_rate, 2),
    )


def profile_prosody(
    word_timestamps: list[dict[str, Any]],
    pitch_data: dict[str, Any],
    duration_seconds: float,
    total_pause_ms: float,
) -> ProsodicProfile:
    """Full prosodic profiling."""
    rhythm = _compute_rhythm_metrics(word_timestamps)
    intonation = _analyze_intonation(pitch_data.get("pitch_contour", []))

    # Stress patterns (approximate from duration + intensity)
    stress_patterns: list[StressPattern] = []
    words = word_timestamps or []
    durations = [(w.get("end", 0) - w.get("start", 0)) * 1000 for w in words]
    mean_dur = np.mean(durations) if durations else 100

    for i, w in enumerate(words):
        dur = durations[i] if i < len(durations) else 100
        ratio = dur / mean_dur if mean_dur > 0 else 1.0
        if ratio > 1.2:
            stress_patterns.append(StressPattern(
                word=w.get("word", ""),
                stressed_syllable=1,
                stress_type="primary",
                duration_ratio=round(ratio, 2),
                intensity_ratio=1.0,
                f0_ratio=1.0,
            ))

    syllable_count = sum(max(1, sum(1 for c in w.get("word", "") if c.lower() in "aeiou")) for w in words)
    syl_rate = syllable_count / duration_seconds if duration_seconds > 0 else 0
    mean_syl_dur = (duration_seconds * 1000) / syllable_count if syllable_count > 0 else 0
    pause_ratio = (total_pause_ms / 1000) / duration_seconds if duration_seconds > 0 else 0

    # Prosodic nativeness score (heuristic)
    score = 50.0
    if 4.0 <= syl_rate <= 6.5:
        score += 15
    if rhythm.rhythm_class == "stress-timed":
        score += 10
    if intonation.pattern in ("falling", "rise-fall"):
        score += 10
    if 0.1 <= pause_ratio <= 0.3:
        score += 15
    score = min(100.0, max(0.0, score))

    return ProsodicProfile(
        rhythm=rhythm,
        intonation=intonation,
        stress_patterns=stress_patterns[:30],
        speech_rate_syl_per_sec=round(syl_rate, 2),
        mean_syllable_duration_ms=round(mean_syl_dur, 2),
        pause_to_speech_ratio=round(pause_ratio, 4),
        prosodic_score=round(score, 2),
    )
