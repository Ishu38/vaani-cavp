"""MORPHEME BOUNDARY MODULE
Acoustic correlates of morpheme boundaries, duration patterns.

Sub-modules:
  - Cognitive Load: pause patterns, speech rate variability, filled pauses
  - Emotional Stress: pitch range, intensity variation, jitter/shimmer
  - Codeswitching Mapping: language switches, phonological system changes
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

import numpy as np


# ---------------------------------------------------------------------------
# Main: Morpheme Boundary Detection
# ---------------------------------------------------------------------------

@dataclass
class BoundaryMarker:
    position_ms: int
    word_before: str
    word_after: str
    pause_duration_ms: float
    boundary_type: str  # "morpheme", "word", "phrase", "clause"
    acoustic_cue: str   # "pause", "pitch_reset", "lengthening", "glottal"
    confidence: float


@dataclass
class MorphemeBoundaryResult:
    boundaries: list[BoundaryMarker]
    total_pause_time_ms: float
    mean_pause_duration_ms: float
    articulation_rate: float  # syllables/sec excluding pauses
    speaking_rate: float      # syllables/sec including pauses
    boundary_density: float   # boundaries per second
    cognitive_load: CognitiveLoadResult
    emotional_stress: EmotionalStressResult
    codeswitching: CodeswitchingResult


# ---------------------------------------------------------------------------
# Cognitive Load
# ---------------------------------------------------------------------------

@dataclass
class FilledPause:
    type: str         # "um", "uh", "er", "like", "you know"
    position_ms: int
    duration_ms: float


@dataclass
class CognitiveLoadResult:
    score: float  # 0-100
    filled_pauses: list[FilledPause]
    filled_pause_rate: float  # per minute
    silent_pause_rate: float  # per minute
    mean_silent_pause_ms: float
    speech_rate_variability: float  # coefficient of variation
    word_finding_delays: int  # pauses > 500ms mid-utterance
    self_corrections: int
    indicators: list[str]


FILLED_PAUSE_MARKERS = {"um", "uh", "er", "erm", "ah", "like", "you know", "i mean", "sort of", "kind of"}


def _detect_cognitive_load(
    word_timestamps: list[dict[str, Any]],
    transcript: str,
    pitch_data: dict[str, Any],
    duration_seconds: float,
) -> CognitiveLoadResult:
    """Detect cognitive load from pause patterns and speech rate variability."""
    filled_pauses: list[FilledPause] = []
    silent_pauses: list[float] = []
    word_durations: list[float] = []
    self_corrections = 0
    word_finding_delays = 0

    words = word_timestamps or []
    for i, w in enumerate(words):
        dur = (w.get("end", 0) - w.get("start", 0)) * 1000
        word_durations.append(dur)

        # Filled pauses
        wtext = w.get("word", "").lower().strip()
        if wtext in FILLED_PAUSE_MARKERS:
            filled_pauses.append(FilledPause(
                type=wtext,
                position_ms=int(w.get("start", 0) * 1000),
                duration_ms=dur,
            ))

        # Silent pauses between words
        if i > 0:
            gap = (w.get("start", 0) - words[i - 1].get("end", 0)) * 1000
            if gap > 50:  # >50ms counts as a pause
                silent_pauses.append(gap)
                if gap > 500:
                    word_finding_delays += 1

        # Self-corrections (repeated word starts)
        if i > 0:
            prev = words[i - 1].get("word", "").lower().strip()
            if prev and wtext and prev[:2] == wtext[:2] and prev != wtext:
                self_corrections += 1

    minutes = duration_seconds / 60 if duration_seconds > 0 else 1
    filled_rate = len(filled_pauses) / minutes
    silent_rate = len(silent_pauses) / minutes
    mean_silent = float(np.mean(silent_pauses)) if silent_pauses else 0.0

    # Speech rate variability (CV of word durations)
    cv = float(np.std(word_durations) / np.mean(word_durations)) if word_durations and np.mean(word_durations) > 0 else 0.0

    # Score: higher = more cognitive load
    score = min(100.0, (
        filled_rate * 5 +
        word_finding_delays * 10 +
        self_corrections * 8 +
        cv * 30 +
        (mean_silent / 100)
    ))

    indicators: list[str] = []
    if filled_rate > 5:
        indicators.append("high filled pause rate")
    if word_finding_delays > 2:
        indicators.append("frequent word-finding delays")
    if cv > 0.6:
        indicators.append("highly variable speech rate")
    if self_corrections > 1:
        indicators.append("self-corrections detected")
    if mean_silent > 300:
        indicators.append("long silent pauses")

    return CognitiveLoadResult(
        score=round(score, 2),
        filled_pauses=filled_pauses,
        filled_pause_rate=round(filled_rate, 2),
        silent_pause_rate=round(silent_rate, 2),
        mean_silent_pause_ms=round(mean_silent, 2),
        speech_rate_variability=round(cv, 4),
        word_finding_delays=word_finding_delays,
        self_corrections=self_corrections,
        indicators=indicators,
    )


# ---------------------------------------------------------------------------
# Emotional Stress
# ---------------------------------------------------------------------------

@dataclass
class EmotionalStressResult:
    score: float  # 0-100
    pitch_range_hz: float
    pitch_variability: float
    intensity_variability: float
    jitter_percent: float
    shimmer_percent: float
    speech_tempo_change: float
    stress_indicators: list[str]


def _detect_emotional_stress(
    pitch_data: dict[str, Any],
    voice_quality: dict[str, Any],
    duration_seconds: float,
) -> EmotionalStressResult:
    """Detect emotional stress from acoustic correlates."""
    pitch_range = pitch_data.get("pitch_range", 0)
    pitch_std = pitch_data.get("std_f0", 0)
    mean_f0 = pitch_data.get("mean_f0", 0)
    pitch_var = pitch_std / mean_f0 if mean_f0 > 0 else 0

    jitter = voice_quality.get("jitter_local", 0) * 100
    shimmer = voice_quality.get("shimmer_local", 0) * 100
    intensity_std = voice_quality.get("intensity_std", 0)

    # Stress score
    score = min(100.0, (
        (pitch_range / 300) * 20 +
        pitch_var * 40 +
        jitter * 5 +
        shimmer * 3 +
        (intensity_std / 10) * 15
    ))

    indicators: list[str] = []
    if pitch_range > 200:
        indicators.append("wide pitch excursions")
    if jitter > 1.5:
        indicators.append("elevated jitter — vocal tension")
    if shimmer > 5:
        indicators.append("elevated shimmer — breathiness/strain")
    if intensity_std > 8:
        indicators.append("high intensity variation")
    if pitch_var > 0.3:
        indicators.append("high pitch variability — possible anxiety")

    return EmotionalStressResult(
        score=round(score, 2),
        pitch_range_hz=round(pitch_range, 2),
        pitch_variability=round(pitch_var, 4),
        intensity_variability=round(intensity_std, 2),
        jitter_percent=round(jitter, 4),
        shimmer_percent=round(shimmer, 4),
        speech_tempo_change=0.0,
        stress_indicators=indicators,
    )


# ---------------------------------------------------------------------------
# Codeswitching Mapping
# ---------------------------------------------------------------------------

@dataclass
class SwitchPoint:
    position_ms: int
    from_language: str
    to_language: str
    trigger_word: str
    switch_type: str  # "intersentential", "intrasentential", "tag"
    acoustic_marker: str


@dataclass
class CodeswitchingResult:
    switch_points: list[SwitchPoint]
    switch_frequency: float  # per minute
    dominant_language: str
    secondary_languages: list[str]
    matrix_language: str  # Myers-Scotton Matrix Language Frame
    phonological_adaptation: float  # 0-1 how much L2 phonology adapts to L1
    borrowing_vs_switching: dict[str, int]


def _detect_codeswitching(
    word_timestamps: list[dict[str, Any]],
    language_per_segment: list[dict[str, Any]],
    transcript: str,
    duration_seconds: float = 0.0,
) -> CodeswitchingResult:
    """Map codeswitching patterns between languages."""
    switch_points: list[SwitchPoint] = []
    lang_counts: dict[str, int] = {}

    # Track language per word/segment
    segments = language_per_segment or []
    prev_lang = ""

    for seg in segments:
        lang = seg.get("language", "unknown")
        lang_counts[lang] = lang_counts.get(lang, 0) + 1

        if prev_lang and lang != prev_lang:
            switch_type = "intersentential"
            if seg.get("is_mid_sentence", False):
                switch_type = "intrasentential"

            switch_points.append(SwitchPoint(
                position_ms=int(seg.get("start_ms", 0)),
                from_language=prev_lang,
                to_language=lang,
                trigger_word=seg.get("text", ""),
                switch_type=switch_type,
                acoustic_marker="pause" if seg.get("preceded_by_pause", False) else "none",
            ))
        prev_lang = lang

    # Determine dominant / matrix language
    sorted_langs = sorted(lang_counts.items(), key=lambda x: x[1], reverse=True)
    dominant = sorted_langs[0][0] if sorted_langs else "unknown"
    secondary = [l for l, _ in sorted_langs[1:]]

    duration_min = max(0.0167, duration_seconds / 60) if duration_seconds > 0 else max(1.0, len(word_timestamps) / 150)
    freq = len(switch_points) / duration_min

    return CodeswitchingResult(
        switch_points=switch_points,
        switch_frequency=round(freq, 2),
        dominant_language=dominant,
        secondary_languages=secondary,
        matrix_language=dominant,
        phonological_adaptation=0.0,
        borrowing_vs_switching={"borrowing": 0, "switching": len(switch_points)},
    )


# ---------------------------------------------------------------------------
# Main orchestrator
# ---------------------------------------------------------------------------

def analyze_morpheme_boundaries(
    word_timestamps: list[dict[str, Any]],
    transcript: str,
    pitch_data: dict[str, Any],
    voice_quality: dict[str, Any],
    duration_seconds: float,
    morphemes: list[dict[str, Any]],
    language_segments: list[dict[str, Any]] | None = None,
) -> MorphemeBoundaryResult:
    """Full morpheme boundary analysis with sub-modules."""
    words = word_timestamps or []
    boundaries: list[BoundaryMarker] = []
    total_pause = 0.0

    # Detect acoustic boundaries at morpheme/word junctions
    for i in range(1, len(words)):
        gap_ms = (words[i].get("start", 0) - words[i - 1].get("end", 0)) * 1000
        if gap_ms > 30:
            btype = "word"
            if gap_ms > 200:
                btype = "phrase"
            if gap_ms > 500:
                btype = "clause"

            boundaries.append(BoundaryMarker(
                position_ms=int(words[i].get("start", 0) * 1000),
                word_before=words[i - 1].get("word", ""),
                word_after=words[i].get("word", ""),
                pause_duration_ms=round(gap_ms, 2),
                boundary_type=btype,
                acoustic_cue="pause" if gap_ms > 100 else "lengthening",
                confidence=min(1.0, gap_ms / 300),
            ))
            total_pause += gap_ms

    mean_pause = float(np.mean([b.pause_duration_ms for b in boundaries])) if boundaries else 0.0
    syllable_count = sum(max(1, sum(1 for c in w.get("word", "") if c.lower() in "aeiou")) for w in words)
    speaking_time = duration_seconds
    articulation_time = speaking_time - (total_pause / 1000)

    art_rate = syllable_count / articulation_time if articulation_time > 0 else 0
    speak_rate = syllable_count / speaking_time if speaking_time > 0 else 0
    boundary_density = len(boundaries) / speaking_time if speaking_time > 0 else 0

    cognitive = _detect_cognitive_load(words, transcript, pitch_data, duration_seconds)
    emotional = _detect_emotional_stress(pitch_data, voice_quality, duration_seconds)
    codeswitch = _detect_codeswitching(words, language_segments or [], transcript, duration_seconds)

    return MorphemeBoundaryResult(
        boundaries=boundaries,
        total_pause_time_ms=round(total_pause, 2),
        mean_pause_duration_ms=round(mean_pause, 2),
        articulation_rate=round(art_rate, 2),
        speaking_rate=round(speak_rate, 2),
        boundary_density=round(boundary_density, 4),
        cognitive_load=cognitive,
        emotional_stress=emotional,
        codeswitching=codeswitch,
    )
