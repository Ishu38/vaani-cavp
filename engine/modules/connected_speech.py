"""CONNECTED SPEECH MODULE
Coarticulation, assimilation, elision, linking, and reduction patterns.
These are the hallmarks of fluent, natural speech production.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

import numpy as np


@dataclass
class AssimilationEvent:
    position_ms: int
    word_boundary: str     # e.g., "ten boys" -> "tem boys"
    type: str              # "place", "voice", "manner", "nasalization"
    direction: str         # "progressive", "regressive", "reciprocal"
    expected: str
    produced: str
    is_target_like: bool


@dataclass
class ElisionEvent:
    position_ms: int
    word: str
    elided_segment: str
    context: str           # e.g., "last night" -> /las naɪt/
    is_natural: bool       # natural in connected speech vs. error


@dataclass
class LinkingEvent:
    position_ms: int
    word_boundary: str
    link_type: str         # "liaison", "intrusive_r", "linking_r", "glottal", "resyllabification"
    description: str


@dataclass
class ReductionEvent:
    word: str
    full_form: str
    reduced_form: str
    vowel_reduced: bool
    syllable_deleted: bool
    reduction_type: str    # "schwa_reduction", "syllable_deletion", "cluster_simplification"


@dataclass
class ConnectedSpeechResult:
    assimilations: list[AssimilationEvent]
    elisions: list[ElisionEvent]
    linkings: list[LinkingEvent]
    reductions: list[ReductionEvent]
    coarticulation_index: float    # 0-1, degree of coarticulation
    fluency_score: float           # 0-100
    connected_speech_ratio: float  # proportion showing connected speech features
    word_boundary_clarity: float   # 0-1, how clearly word boundaries are maintained


# Common connected speech patterns in English
COMMON_ASSIMILATIONS = {
    ("n", "b"): ("m", "place"),
    ("n", "p"): ("m", "place"),
    ("n", "m"): ("m", "place"),
    ("n", "k"): ("ŋ", "place"),
    ("n", "g"): ("ŋ", "place"),
    ("d", "j"): ("dʒ", "manner"),
    ("t", "j"): ("tʃ", "manner"),
    ("s", "j"): ("ʃ", "manner"),
    ("z", "j"): ("ʒ", "manner"),
}

COMMON_ELISIONS = {
    "and": "n",
    "because": "cos",
    "going to": "gonna",
    "want to": "wanna",
    "got to": "gotta",
    "them": "em",
    "about": "bout",
}

FUNCTION_WORDS_REDUCIBLE = {
    "a", "an", "the", "to", "of", "for", "and", "but", "or",
    "is", "are", "was", "were", "has", "have", "had",
    "can", "could", "will", "would", "shall", "should",
    "do", "does", "did", "am", "be", "been",
    "at", "in", "on", "by", "from", "with",
    "he", "she", "we", "they", "them", "his", "her",
}


def analyze_connected_speech(
    word_timestamps: list[dict[str, Any]],
    phoneme_spans: list[dict[str, Any]],
    transcript: str,
    formant_trajectories: dict[str, list[float]],
) -> ConnectedSpeechResult:
    """Analyze connected speech phenomena."""
    words = word_timestamps or []
    assimilations: list[AssimilationEvent] = []
    elisions: list[ElisionEvent] = []
    linkings: list[LinkingEvent] = []
    reductions: list[ReductionEvent] = []

    # --- Detect assimilation at word boundaries ---
    for i in range(len(words) - 1):
        w1 = words[i].get("word", "").lower().strip()
        w2 = words[i + 1].get("word", "").lower().strip()
        if not w1 or not w2:
            continue

        last_char = w1[-1]
        first_char = w2[0]
        boundary = f"{w1} {w2}"
        pos = int(words[i].get("end", 0) * 1000)

        pair = (last_char, first_char)
        if pair in COMMON_ASSIMILATIONS:
            result_phoneme, assim_type = COMMON_ASSIMILATIONS[pair]
            assimilations.append(AssimilationEvent(
                position_ms=pos,
                word_boundary=boundary,
                type=assim_type,
                direction="regressive",
                expected=last_char,
                produced=result_phoneme,
                is_target_like=True,
            ))

        # --- Linking detection ---
        gap_ms = (words[i + 1].get("start", 0) - words[i].get("end", 0)) * 1000
        if gap_ms < 30:
            # Very short gap = linking
            if w1[-1] in "aeiou" and w2[0] in "aeiou":
                linkings.append(LinkingEvent(
                    position_ms=pos,
                    word_boundary=boundary,
                    link_type="liaison",
                    description=f"vowel-to-vowel linking: {w1} -> {w2}",
                ))
            elif w1[-1] == "r" and w2[0] in "aeiou":
                linkings.append(LinkingEvent(
                    position_ms=pos,
                    word_boundary=boundary,
                    link_type="linking_r",
                    description=f"linking /r/: {w1} -> {w2}",
                ))

    # --- Detect elisions ---
    for w in words:
        wtext = w.get("word", "").lower().strip()
        dur = (w.get("end", 0) - w.get("start", 0)) * 1000
        if wtext in COMMON_ELISIONS:
            elisions.append(ElisionEvent(
                position_ms=int(w.get("start", 0) * 1000),
                word=wtext,
                elided_segment=COMMON_ELISIONS[wtext],
                context=f"reduced form of '{wtext}'",
                is_natural=True,
            ))

    # --- Detect vowel reduction in function words ---
    for w in words:
        wtext = w.get("word", "").lower().strip()
        dur = (w.get("end", 0) - w.get("start", 0)) * 1000
        if wtext in FUNCTION_WORDS_REDUCIBLE and dur < 150:
            reductions.append(ReductionEvent(
                word=wtext,
                full_form=wtext,
                reduced_form=f"[ə] reduced",
                vowel_reduced=True,
                syllable_deleted=False,
                reduction_type="schwa_reduction",
            ))

    # --- Coarticulation index from formant trajectories ---
    f1_traj = formant_trajectories.get("f1_trajectory", [])
    f2_traj = formant_trajectories.get("f2_trajectory", [])
    if len(f1_traj) > 3:
        f1_diffs = np.diff(f1_traj)
        smoothness = 1.0 - min(1.0, float(np.std(f1_diffs)) / 100)
        coart_index = smoothness
    else:
        coart_index = 0.5

    total_features = len(assimilations) + len(elisions) + len(linkings) + len(reductions)
    total_boundaries = max(1, len(words) - 1)
    cs_ratio = min(1.0, total_features / total_boundaries)

    # Word boundary clarity (inverse of connected speech ratio)
    boundary_clarity = 1.0 - cs_ratio * 0.5

    # Fluency score
    fluency = min(100.0, (
        cs_ratio * 30 +
        coart_index * 30 +
        (len(linkings) / max(1, total_boundaries)) * 20 +
        (len(reductions) / max(1, len(words))) * 20
    ))

    return ConnectedSpeechResult(
        assimilations=assimilations,
        elisions=elisions,
        linkings=linkings,
        reductions=reductions,
        coarticulation_index=round(coart_index, 4),
        fluency_score=round(fluency, 2),
        connected_speech_ratio=round(cs_ratio, 4),
        word_boundary_clarity=round(boundary_clarity, 4),
    )
