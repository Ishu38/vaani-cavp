"""PHONEME ANALYSIS MODULE
Formant extraction, VOT, spectral moments, phoneme inventory scoring.
Contrastive: compare L1 phoneme system against L2 production.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

import numpy as np


@dataclass
class PhonemeScore:
    phoneme: str
    accuracy: float  # 0-1
    f1_deviation: float
    f2_deviation: float
    duration_ms: float
    expected_duration_ms: float
    notes: str = ""


@dataclass
class PhonemeAnalysisResult:
    phoneme_scores: list[PhonemeScore]
    overall_accuracy: float
    vowel_space_area: float
    vowel_space_deviation: float
    formant_means: dict[str, float]
    phoneme_inventory_size: int
    missing_target_phonemes: list[str]
    substitution_patterns: list[dict[str, str]]
    interference_score: float  # 0-100, higher = more L1 interference


# Standard English vowel formant targets (adult neutral)
ENGLISH_VOWEL_TARGETS: dict[str, tuple[float, float]] = {
    "IY": (270, 2290),   # /i/ as in "beat"
    "IH": (390, 1990),   # /ɪ/ as in "bit"
    "EH": (530, 1840),   # /ɛ/ as in "bet"
    "AE": (660, 1720),   # /ae/ as in "bat"
    "AA": (730, 1090),   # /ɑ/ as in "bot"
    "AO": (570, 840),    # /ɔ/ as in "bought"
    "UH": (440, 1020),   # /ʊ/ as in "book"
    "UW": (300, 870),    # /u/ as in "boot"
    "AH": (640, 1190),   # /ʌ/ as in "but"
    "ER": (490, 1350),   # /ɝ/ as in "bird"
}


def analyze_phonemes(
    phoneme_spans: list[dict[str, Any]],
    formant_data: dict[str, Any],
    word_timestamps: list[dict[str, Any]] | None = None,
) -> PhonemeAnalysisResult:
    """
    Analyze phoneme production quality contrastively.

    Args:
        phoneme_spans: from Wav2Vec output [{phoneme, start_ms, end_ms, confidence}]
        formant_data: from parselmouth {f1_mean, f2_mean, f1_trajectory, f2_trajectory, vowel_space_area}
        word_timestamps: from Whisper [{word, start, end}]
    """
    scores: list[PhonemeScore] = []
    substitutions: list[dict[str, str]] = []
    interference_signals: list[float] = []

    f1_traj = formant_data.get("f1_trajectory", [])
    f2_traj = formant_data.get("f2_trajectory", [])

    for span in phoneme_spans:
        ph = span.get("phoneme", "").upper()
        conf = span.get("confidence", 0.0)
        dur = span.get("end_ms", 0) - span.get("start_ms", 0)

        f1_dev = 0.0
        f2_dev = 0.0
        expected_dur = 80.0  # default ms

        if ph in ENGLISH_VOWEL_TARGETS:
            target_f1, target_f2 = ENGLISH_VOWEL_TARGETS[ph]
            actual_f1 = formant_data.get("f1_mean", 0)
            actual_f2 = formant_data.get("f2_mean", 0)
            f1_dev = abs(actual_f1 - target_f1) / target_f1 if target_f1 > 0 else 0
            f2_dev = abs(actual_f2 - target_f2) / target_f2 if target_f2 > 0 else 0
            expected_dur = 120.0  # vowels longer

        accuracy = conf * (1.0 - min(f1_dev, 1.0) * 0.3 - min(f2_dev, 1.0) * 0.3)
        accuracy = max(0.0, min(1.0, accuracy))

        notes = ""
        if f1_dev > 0.3 or f2_dev > 0.3:
            notes = "significant formant deviation — possible L1 interference"
            interference_signals.append(f1_dev + f2_dev)
            substitutions.append({
                "target": ph,
                "produced_f1": str(round(formant_data.get("f1_mean", 0))),
                "produced_f2": str(round(formant_data.get("f2_mean", 0))),
                "note": notes,
            })

        scores.append(PhonemeScore(
            phoneme=ph,
            accuracy=round(accuracy, 4),
            f1_deviation=round(f1_dev, 4),
            f2_deviation=round(f2_dev, 4),
            duration_ms=dur,
            expected_duration_ms=expected_dur,
            notes=notes,
        ))

    # Missing phonemes (expected in English but not produced)
    produced = {s.phoneme for s in scores}
    missing = [ph for ph in ENGLISH_VOWEL_TARGETS if ph not in produced]

    # Vowel space deviation from standard English
    standard_vsa = 250000.0  # approximate standard English VSA
    actual_vsa = formant_data.get("vowel_space_area", 0)
    vsa_dev = abs(actual_vsa - standard_vsa) / standard_vsa if standard_vsa > 0 else 0

    # Interference score (0-100)
    if interference_signals:
        interference = min(100.0, np.mean(interference_signals) * 50)
    else:
        interference = max(0.0, 100.0 - np.mean([s.accuracy for s in scores]) * 100) if scores else 50.0

    overall = float(np.mean([s.accuracy for s in scores])) if scores else 0.0

    return PhonemeAnalysisResult(
        phoneme_scores=scores,
        overall_accuracy=round(overall, 4),
        vowel_space_area=actual_vsa,
        vowel_space_deviation=round(vsa_dev, 4),
        formant_means={
            "f1": formant_data.get("f1_mean", 0),
            "f2": formant_data.get("f2_mean", 0),
            "f3": formant_data.get("f3_mean", 0),
            "f4": formant_data.get("f4_mean", 0),
        },
        phoneme_inventory_size=len(produced),
        missing_target_phonemes=missing,
        substitution_patterns=substitutions,
        interference_score=round(interference, 2),
    )
