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
    confidence: float = 0.0   # wav2vec CTC posterior, used to weight aggregates
    notes: str = ""


@dataclass
class PhonemeAnalysisResult:
    phoneme_scores: list[PhonemeScore]
    overall_accuracy: float
    # Confidence-bounded estimate of overall_accuracy. Reported as a 95% CI
    # derived from the wav2vec CTC posterior weighting — honest framing,
    # avoids a single false-precision point estimate. The wav2vec model
    # used is not fine-tuned on Indian L2 English, so per-phoneme posteriors
    # carry real model uncertainty; weighting low-conf phones less and
    # surfacing the CI lets the report reader see the measurement variance.
    overall_accuracy_lower: float
    overall_accuracy_upper: float
    overall_accuracy_n_eff: float
    vowel_space_area: float
    vowel_space_deviation: float
    formant_means: dict[str, float]
    phoneme_inventory_size: int
    missing_target_phonemes: list[str]
    substitution_patterns: list[dict[str, str]]
    interference_score: float  # 0-100, higher = more L1 interference


# Standard English vowel formant targets (adult neutral, ARPAbet keys)
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

# IPA → ARPAbet mapping. Phoneme spans arrive from wav2vec_phoneme_ctc as
# IPA / X-SAMPA-ish strings (espeak vocab); ENGLISH_VOWEL_TARGETS keys
# are ARPAbet. Without this mapping every IPA vowel fails the
# `ph in ENGLISH_VOWEL_TARGETS` check and `missing_target_phonemes`
# returns the full ARPAbet vowel set on every clip (the 2026-05-08 eval
# bug). Includes:
#   - Pure IPA vowel symbols (i, ɪ, ɛ, æ, ...)
#   - Pure IPA consonant symbols (θ, ð, ʃ, ʒ, ŋ, ...)
#   - espeak digit phoneme tokens (3, 0) that are NOT stress marks
#   - Common length-marked variants (we also strip ː and : before lookup)
_IPA_TO_ARPABET: dict[str, str] = {
    # Vowels
    "i":  "IY", "y":  "IY",
    "ɪ":  "IH",
    "e":  "EH", "ɛ":  "EH",
    "æ":  "AE", "a":  "AE",
    "ɑ":  "AA", "ɒ":  "AA",
    "ɔ":  "AO",
    "ʊ":  "UH",
    "u":  "UW",
    "ʌ":  "AH", "ə":  "AH",
    "ɝ":  "ER", "ɜ":  "ER", "ɚ":  "ER",
    # espeak's mid-central tokens that are *not* stress digits.
    "3":  "ER", "@":  "AH",
    # R-coloured combinations the espeak head emits as one span.
    "ɑɹ": "AR", "ɔɹ": "OR", "ɛɹ": "ER", "ɪɹ": "IR", "ʊɹ": "UR",
    # Consonants. ARPAbet has its own labels (TH, DH, SH, ZH, NG, CH, JH).
    "θ":  "TH", "ð":  "DH",
    "ʃ":  "SH", "ʒ":  "ZH",
    "ŋ":  "NG",
    "tʃ": "CH", "dʒ": "JH",
    "ɹ":  "R",  "ɾ":  "R",
    "ɫ":  "L",  "ɬ":  "L",
    "ʔ":  "Q",
    "x":  "HH",
    # espeak's deletion / ø sentinel — keep as a label rather than empty
    # so the regression invariant treats it as a real symbol.
    "0":  "DEL",
}


def _to_arpabet(phoneme: str) -> str:
    """Normalise a phoneme label to ARPAbet for comparison against
    ENGLISH_VOWEL_TARGETS. Already-ARPAbet labels pass through; IPA /
    espeak labels are mapped via _IPA_TO_ARPABET; everything else returns
    the upper-cased input so non-vowel symbols (consonants) keep their
    identity for substitution accounting.

    Stress-digit handling: ARPAbet annotates lexical stress as a trailing
    digit on a letter token (e.g. "AH0", "ER1", "IY2"). espeak's vocab
    however contains *digit-only* phoneme tokens like "3" (mid-central
    vowel) and "0" (deletion sentinel) — those must be preserved. We
    only strip a trailing digit when at least one alphabetic character
    precedes it. The 2026-05-09 Svarah regression failed on every clip
    that used /ɜː/ because the legacy stripper turned "3:" into "" — that
    in turn nulled the produced field and the substitution invariant
    flagged the empty entry."""
    if not phoneme:
        return ""
    p = phoneme.strip()
    # Strip IPA length marks (the colon-style ː and ASCII : both occur in
    # espeak output, depending on whose stripping ran first).
    p = p.replace("ː", "").replace(":", "")
    # Conditional stress-digit strip: only when alphabetic chars precede.
    if p and p[-1].isdigit() and any(c.isalpha() for c in p[:-1]):
        while p and p[-1].isdigit():
            p = p[:-1]
    if not p:
        return ""
    # Direct vowel-target lookup (already ARPAbet).
    upper = p.upper()
    if upper in ENGLISH_VOWEL_TARGETS:
        return upper
    # IPA / espeak mapping on the case-preserved original.
    mapped = _IPA_TO_ARPABET.get(p.lower())
    if mapped is None:
        mapped = _IPA_TO_ARPABET.get(p)
    if mapped is not None:
        return mapped
    # Fallback: keep the upper-cased token rather than dropping to empty
    # — preserves info for substitution rendering even when we don't have
    # a clean ARPAbet equivalent.
    return upper


def analyze_phonemes(
    phoneme_spans: list[dict[str, Any]],
    formant_data: dict[str, Any],
    word_timestamps: list[dict[str, Any]] | None = None,
    substitution_events: list[dict[str, Any]] | None = None,
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
        ph = _to_arpabet(span.get("phoneme", ""))
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
            confidence=round(float(conf or 0.0), 4),
            notes=notes,
        ))

    # Missing phonemes (expected in English but not produced)
    produced = {s.phoneme for s in scores}
    missing = [ph for ph in ENGLISH_VOWEL_TARGETS if ph not in produced]

    # Vowel space deviation from standard English
    standard_vsa = 250000.0  # approximate standard English VSA
    actual_vsa = formant_data.get("vowel_space_area", 0)
    vsa_dev = abs(actual_vsa - standard_vsa) / standard_vsa if standard_vsa > 0 else 0

    # ── Cross-layer fusion: incorporate Phase 4 NW substitution events ──
    # Each ref-vs-recognized substitution is a higher-confidence interference
    # signal than a formant deviation alone. Append events to substitutions list
    # so downstream consumers see both sources, and re-compute interference
    # from the union.
    # Drop substitution events whose target_phone OR produced_phone is
    # blank (the layman card otherwise renders "AH → ?" or "; ; ; əw" —
    # both seen in the 2026-05-08 evals before/after the IPA mapping fix).
    nw_events = [
        ev for ev in (substitution_events or [])
        if str(ev.get("target_phone", "")).strip()
        and str(ev.get("produced_phone", "")).strip()
    ]
    nw_n = len(nw_events)
    if nw_n:
        for ev in nw_events:
            substitutions.append({
                "target": _to_arpabet(ev.get("target_phone", "")),
                "produced": _to_arpabet(ev.get("produced_phone", "")),
                "event_type": ev.get("event_type", "substitution"),
                "start_ms": ev.get("start_ms", 0),
                "end_ms": ev.get("end_ms", 0),
                "confidence": ev.get("confidence", 0.0),
                "source": "wav2vec_phoneme_pairing",
                "note": ev.get("label", ""),
            })

    # Interference score combines formant signals with NW evidence rate.
    # When NW events are present they dominate (higher precision); fall back
    # to formant signals when wav2vec pairing was unavailable.
    if nw_n and scores:
        # Per-phone substitution rate, scaled to 0-100. Each event contributes
        # by its confidence (higher confidence → stronger evidence).
        denom = max(len(scores), nw_n)
        weighted = sum(float(ev.get("confidence", 0.0)) for ev in nw_events) / denom
        interference = min(100.0, weighted * 100 + (np.mean(interference_signals) * 25 if interference_signals else 0))
    elif interference_signals:
        interference = min(100.0, np.mean(interference_signals) * 50)
    else:
        interference = max(0.0, 100.0 - np.mean([s.accuracy for s in scores]) * 100) if scores else 50.0

    # Overall accuracy: weighted by wav2vec posterior so low-confidence
    # phoneme predictions (where the ASR is uncertain) contribute less to
    # the aggregate than high-confidence ones. The wav2vec model is not
    # fine-tuned on Indian L2 English; treating every phoneme as equally
    # informative would let model uncertainty masquerade as speaker error.
    if scores:
        accs = np.array([s.accuracy for s in scores], dtype=float)
        # confidences: clamp to a small floor so a few zero-conf frames
        # cannot zero-weight the entire aggregate; floor=0.05 still
        # preserves meaningful relative weighting.
        confs = np.clip(np.array([s.confidence for s in scores], dtype=float), 0.05, 1.0)
        weight_sum = float(confs.sum())
        if weight_sum > 0:
            base_acc = float((accs * confs).sum() / weight_sum)
            # Weighted variance (Cochran's design-effect form).
            wvar = float(((confs * (accs - base_acc) ** 2).sum()) / weight_sum)
            # Effective sample size — Kish's formula. Drops below N when
            # confidence is unevenly distributed across phones, which is
            # exactly when the point estimate carries less information.
            n_eff = float((weight_sum ** 2) / float((confs ** 2).sum()))
        else:
            base_acc = float(accs.mean())
            wvar = float(accs.var())
            n_eff = float(len(scores))
        # 95% CI from the SE of the weighted mean.
        se = (wvar / max(n_eff, 1.0)) ** 0.5
        ci_lower = max(0.0, base_acc - 1.96 * se)
        ci_upper = min(1.0, base_acc + 1.96 * se)
    else:
        base_acc = 0.0
        ci_lower = 0.0
        ci_upper = 0.0
        n_eff = 0.0

    # NW-event penalty applied to the weighted point estimate (and the CI
    # endpoints, so the CI travels with the report).
    if nw_n and scores:
        nw_penalty = min(0.4, nw_n / max(len(scores), 1) * 0.3)
        overall = max(0.0, base_acc - nw_penalty)
        ci_lower = max(0.0, ci_lower - nw_penalty)
        ci_upper = max(0.0, ci_upper - nw_penalty)
    else:
        overall = base_acc

    return PhonemeAnalysisResult(
        phoneme_scores=scores,
        overall_accuracy=round(overall, 4),
        overall_accuracy_lower=round(ci_lower, 4),
        overall_accuracy_upper=round(ci_upper, 4),
        overall_accuracy_n_eff=round(n_eff, 2),
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
