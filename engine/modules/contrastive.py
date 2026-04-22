"""CONTRASTIVE COMPARISON ENGINE
Compares two voice profiles (L1 vs L2, pre vs post, speaker A vs B)
and produces an interference/difference report.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

import numpy as np


@dataclass
class DimensionDiff:
    dimension: str
    sample_a_value: float
    sample_b_value: float
    absolute_diff: float
    percent_diff: float
    significance: str  # "low", "moderate", "high", "critical"


@dataclass
class ContrastiveReport:
    sample_a_id: str
    sample_b_id: str
    phoneme_interference_score: float   # 0-100
    prosodic_divergence_score: float    # 0-100
    voice_quality_similarity: float     # 0-1
    fluency_gap: float                  # 0-100
    rhythm_class_match: bool
    formant_differences: list[DimensionDiff]
    pitch_differences: list[DimensionDiff]
    quality_differences: list[DimensionDiff]
    overall_contrastive_score: float    # 0-100, higher = more different
    key_interference_patterns: list[str]
    recommendations: list[str]


def _diff(name: str, a: float, b: float) -> DimensionDiff:
    abs_d = abs(a - b)
    pct = (abs_d / abs(a) * 100) if a != 0 else 0
    if pct > 50:
        sig = "critical"
    elif pct > 25:
        sig = "high"
    elif pct > 10:
        sig = "moderate"
    else:
        sig = "low"
    return DimensionDiff(
        dimension=name,
        sample_a_value=round(a, 2),
        sample_b_value=round(b, 2),
        absolute_diff=round(abs_d, 2),
        percent_diff=round(pct, 2),
        significance=sig,
    )


def compare_profiles(
    profile_a: dict[str, Any],
    profile_b: dict[str, Any],
    sample_a_id: str = "sample_a",
    sample_b_id: str = "sample_b",
) -> ContrastiveReport:
    """Compare two full voice profiles contrastively."""
    # Extract sub-profiles
    pa_formants = profile_a.get("phoneme_analysis", {}).get("formant_means", {})
    pb_formants = profile_b.get("phoneme_analysis", {}).get("formant_means", {})
    pa_pitch = profile_a.get("prosodic_profile", {}).get("speech_rate_syl_per_sec", 0)
    pb_pitch = profile_b.get("prosodic_profile", {}).get("speech_rate_syl_per_sec", 0)

    # Formant differences
    formant_diffs = [
        _diff(f"F{i}", pa_formants.get(f"f{i}", 0), pb_formants.get(f"f{i}", 0))
        for i in range(1, 5)
    ]

    # Pitch differences
    pa_pros = profile_a.get("prosodic_profile", {})
    pb_pros = profile_b.get("prosodic_profile", {})
    pa_rhythm = pa_pros.get("rhythm", {})
    pb_rhythm = pb_pros.get("rhythm", {})
    pa_into = pa_pros.get("intonation", {})
    pb_into = pb_pros.get("intonation", {})

    pitch_diffs = [
        _diff("speech_rate", pa_pitch, pb_pitch),
        _diff("nPVI_vocalic", pa_rhythm.get("npvi_v", 0), pb_rhythm.get("npvi_v", 0)),
        _diff("percent_V", pa_rhythm.get("percent_v", 0), pb_rhythm.get("percent_v", 0)),
        _diff("prosodic_score", pa_pros.get("prosodic_score", 0), pb_pros.get("prosodic_score", 0)),
    ]

    # Voice quality differences
    pa_vq = profile_a.get("voice_quality", {})
    pb_vq = profile_b.get("voice_quality", {})
    pa_breath = pa_vq.get("breathiness", {})
    pb_breath = pb_vq.get("breathiness", {})
    pa_creak = pa_vq.get("creakiness", {})
    pb_creak = pb_vq.get("creakiness", {})

    quality_diffs = [
        _diff("HNR", pa_breath.get("hnr", 0), pb_breath.get("hnr", 0)),
        _diff("CPP", pa_breath.get("cpp", 0), pb_breath.get("cpp", 0)),
        _diff("breathiness_index", pa_breath.get("breathiness_index", 0), pb_breath.get("breathiness_index", 0)),
        _diff("creak_index", pa_creak.get("creak_index", 0), pb_creak.get("creak_index", 0)),
        _diff("jitter", pa_creak.get("jitter_local", 0), pb_creak.get("jitter_local", 0)),
        _diff("shimmer", pa_creak.get("shimmer_local", 0), pb_creak.get("shimmer_local", 0)),
    ]

    # Composite scores
    phoneme_interference = abs(
        profile_a.get("phoneme_analysis", {}).get("interference_score", 50)
        - profile_b.get("phoneme_analysis", {}).get("interference_score", 50)
    )

    prosodic_divergence = np.mean([d.percent_diff for d in pitch_diffs]) if pitch_diffs else 0
    vq_diffs_vals = [d.percent_diff for d in quality_diffs]
    vq_similarity = max(0, 1.0 - np.mean(vq_diffs_vals) / 100) if vq_diffs_vals else 0.5

    fluency_a = profile_a.get("connected_speech", {}).get("fluency_score", 50)
    fluency_b = profile_b.get("connected_speech", {}).get("fluency_score", 50)
    fluency_gap = abs(fluency_a - fluency_b)

    rhythm_match = pa_rhythm.get("rhythm_class", "") == pb_rhythm.get("rhythm_class", "")

    # Overall contrastive score
    all_pcts = [d.percent_diff for d in formant_diffs + pitch_diffs + quality_diffs]
    overall = min(100.0, float(np.mean(all_pcts))) if all_pcts else 50.0

    # Key patterns
    patterns: list[str] = []
    critical = [d for d in formant_diffs + pitch_diffs + quality_diffs if d.significance in ("high", "critical")]
    for d in critical:
        patterns.append(f"{d.dimension}: {d.significance} difference ({d.percent_diff:.1f}%)")

    if not rhythm_match:
        patterns.append(f"Rhythm class mismatch: {pa_rhythm.get('rhythm_class', '?')} vs {pb_rhythm.get('rhythm_class', '?')}")

    # Recommendations
    recs: list[str] = []
    formant_critical = [d for d in formant_diffs if d.significance in ("high", "critical")]
    if formant_critical:
        recs.append("Focus on vowel production — significant formant deviations detected")
    if not rhythm_match:
        recs.append("Work on rhythm patterns — L1 rhythm type is transferring to L2")
    if fluency_gap > 30:
        recs.append("Connected speech practice needed — large fluency gap between samples")
    if any(d.dimension == "jitter" and d.significance in ("high", "critical") for d in quality_diffs):
        recs.append("Monitor voice quality — elevated perturbation measures")

    return ContrastiveReport(
        sample_a_id=sample_a_id,
        sample_b_id=sample_b_id,
        phoneme_interference_score=round(phoneme_interference, 2),
        prosodic_divergence_score=round(float(prosodic_divergence), 2),
        voice_quality_similarity=round(float(vq_similarity), 4),
        fluency_gap=round(fluency_gap, 2),
        rhythm_class_match=rhythm_match,
        formant_differences=formant_diffs,
        pitch_differences=pitch_diffs,
        quality_differences=quality_diffs,
        overall_contrastive_score=round(overall, 2),
        key_interference_patterns=patterns,
        recommendations=recs,
    )
