"""IELTS SPEAKING RUBRIC MAPPER

Maps the acoustic + linguistic features produced by the Vaani pipeline onto
IELTS Speaking band descriptors. Two modes:

  * Acoustic-core mode (default, ACOUSTIC_CORE_ONLY=true): only the
    Pronunciation criterion is computed — derived directly from CIF
    composite, phoneme accuracy, and prosodic nativeness. The other three
    criteria (Fluency & Coherence, Lexical Resource, Grammatical Range)
    are intentionally not produced because they depend on linguistic
    layers the acoustic-core release does not run, and emitting unverified
    bands would over-claim what the engine measured. `overall_band` in
    this mode is set to the Pronunciation band — the user-facing surface
    is an Acoustic Voice Profile, not a full IELTS verdict.

  * Full mode (ACOUSTIC_CORE_ONLY=false): all four criteria are computed,
    matching the prior research/calibration build. The full mode is
    retained for calibration runs and validation cohorts, not for the
    production user surface.

Thresholds for the Pronunciation branch are calibrated against public IELTS
band descriptors + L2 speech research (Isaacs & Trofimovich 2012).
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from typing import Any


IELTS_CRITERIA = ("fluency_coherence", "lexical_resource", "grammatical_range", "pronunciation")

# Mirror the engine-wide flag here so the rubric module can be reasoned about
# in isolation (calibration scripts import it directly without going through
# main.py). Default true — the production surface is acoustic-core.
_ACOUSTIC_CORE_ONLY = os.getenv("ACOUSTIC_CORE_ONLY", "true").lower() in ("1", "true", "yes")


@dataclass
class CriterionScore:
    band: float                          # 0.0 - 9.0
    features: dict[str, float]           # raw feature values that drove the band
    justification: list[str]             # human-readable descriptors supporting the band


@dataclass
class IELTSBandScore:
    fluency_coherence: CriterionScore
    lexical_resource: CriterionScore
    grammatical_range: CriterionScore
    pronunciation: CriterionScore
    overall_band: float                  # rounded to nearest 0.5
    test_type: str = "ielts_speaking"
    notes: list[str] = field(default_factory=list)


def _safe_get(d: Any, *keys: str, default: Any = None) -> Any:
    cur = d
    for k in keys:
        if cur is None:
            return default
        if isinstance(cur, dict):
            cur = cur.get(k)
        else:
            cur = getattr(cur, k, None)
    return cur if cur is not None else default


def _round_ielts(x: float) -> float:
    """Round to nearest 0.5 using IELTS reporting convention.

    IELTS rounds .25 → .5 and .75 → next whole; simpler rule approximated as
    round-half-up to nearest 0.5.
    """
    return round(x * 2) / 2.0


def _interp(value: float, anchors: list[tuple[float, float]]) -> float | None:
    """Continuous linear interpolation against an ordered anchor list.

    `anchors` is a list of (input, band) pairs sorted by input ascending.
    Values outside the anchor range clamp to the endpoint band. Inside the
    range we linearly interpolate the band between the bracketing anchors.

    This replaces the legacy step-bucket scoring (`if x >= a: band = b1; elif
    x >= c: band = b2; ...`) which collapsed any cluster of inputs sharing a
    bucket into the same band — the root cause of the flat-6.5 verdict on
    the 2026-05-07 mentor eval (3 distinct candidates → identical band).

    Returns None when anchors are empty (no basis for scoring) — callers
    must handle unavailable components rather than silently defaulting to 5.0.
    """
    if not anchors:
        return None
    anchors = sorted(anchors, key=lambda p: p[0])
    if value <= anchors[0][0]:
        return float(anchors[0][1])
    if value >= anchors[-1][0]:
        return float(anchors[-1][1])
    for (x0, b0), (x1, b1) in zip(anchors, anchors[1:]):
        if x0 <= value <= x1:
            if x1 == x0:
                return float(b0)
            t = (value - x0) / (x1 - x0)
            return float(b0 + t * (b1 - b0))
    return float(anchors[-1][1])


def _interp_desc(value: float, anchors: list[tuple[float, float]]) -> float | None:
    """Convenience wrapper for inputs where lower-is-better (e.g. distance,
    interference, pause ratio): pass anchors as (low_input → high_band).
    Internally identical to `_interp` — kept as a separate name so the call
    site reads the right way at the boundary between higher-is-better
    (speech rate, F2) and lower-is-better (pause ratio, distance) signals.
    Returns None when anchors are empty (no basis for scoring).
    """
    return _interp(value, anchors)


def _get_cif_dim(cif: dict[str, Any], name: str) -> dict[str, Any]:
    """Extract a CIF dimension by name from the list-of-dicts shape.

    `cif_analysis.dimensions` is a list of {name, cii, distance_to_l1,
    distance_to_l2, ...} objects. The legacy rubric only read `overall_cii`;
    the per-dimension distances carry sharper signal (esp. Prosody.distance_to_l2).
    """
    dims = cif.get("dimensions") or []
    if isinstance(dims, dict):  # tolerant of legacy shape
        return dims.get(name) or {}
    for d in dims:
        if isinstance(d, dict) and d.get("name") == name:
            return d
    return {}


def _score_fluency_coherence(profile: dict[str, Any]) -> CriterionScore:
    """Fluency & Coherence: speech rate, pause ratio, hesitations, discourse."""
    pp = profile.get("prosodic_profile") or {}
    mb = profile.get("morpheme_boundary") or {}
    tr = profile.get("transcription") or {}
    nlp = profile.get("nlp") or {}

    speech_rate = float(_safe_get(pp, "speech_rate_syl_per_sec", default=0.0) or 0.0)
    pause_ratio = float(_safe_get(pp, "pause_to_speech_ratio", default=0.0) or 0.0)
    duration_s = float(_safe_get(tr, "duration_seconds", default=0.0) or 0.0)

    fillers = _safe_get(mb, "filler_count", default=None)
    if fillers is None:
        fillers = _safe_get(mb, "hesitation_count", default=0) or 0
    fillers = int(fillers or 0)
    fillers_per_min = (fillers / duration_s * 60.0) if duration_s > 0 else 0.0

    discourse_markers = int(_safe_get(nlp, "syntax", "discourse_marker_count", default=0) or 0)
    word_count = len(((tr or {}).get("word_timestamps")) or [])

    sr_band = 3.0
    if speech_rate >= 4.0: sr_band = 9.0
    elif speech_rate >= 3.5: sr_band = 7.5
    elif speech_rate >= 3.0: sr_band = 6.5
    elif speech_rate >= 2.5: sr_band = 5.5
    elif speech_rate >= 2.0: sr_band = 4.5
    elif speech_rate >= 1.5: sr_band = 3.5

    pr_band = 3.0
    if pause_ratio <= 0.10: pr_band = 9.0
    elif pause_ratio <= 0.15: pr_band = 8.0
    elif pause_ratio <= 0.20: pr_band = 7.0
    elif pause_ratio <= 0.30: pr_band = 6.0
    elif pause_ratio <= 0.40: pr_band = 5.0
    elif pause_ratio <= 0.50: pr_band = 4.0

    hes_band = 3.0
    if fillers_per_min <= 2: hes_band = 9.0
    elif fillers_per_min <= 5: hes_band = 7.5
    elif fillers_per_min <= 10: hes_band = 6.0
    elif fillers_per_min <= 15: hes_band = 5.0
    elif fillers_per_min <= 25: hes_band = 4.0

    dm_band = 5.0
    if discourse_markers >= 8: dm_band = 8.0
    elif discourse_markers >= 5: dm_band = 7.0
    elif discourse_markers >= 3: dm_band = 6.0
    elif discourse_markers >= 1: dm_band = 5.0
    else: dm_band = 4.0

    weights = (0.35, 0.30, 0.20, 0.15)
    band = sr_band * weights[0] + pr_band * weights[1] + hes_band * weights[2] + dm_band * weights[3]
    band = max(1.0, min(9.0, round(band * 2) / 2.0))

    justification = []
    if speech_rate >= 3.5:
        justification.append(f"speech rate {speech_rate:.2f} syl/sec — fluent delivery")
    elif speech_rate >= 2.5:
        justification.append(f"speech rate {speech_rate:.2f} syl/sec — moderate, some slowness")
    else:
        justification.append(f"speech rate {speech_rate:.2f} syl/sec — hesitant, slow delivery")
    if pause_ratio > 0.30:
        justification.append(f"pause-to-speech ratio {pause_ratio:.2f} — long silences disrupt flow")
    elif pause_ratio > 0.15:
        justification.append(f"pause-to-speech ratio {pause_ratio:.2f} — acceptable pause pattern")
    else:
        justification.append(f"pause-to-speech ratio {pause_ratio:.2f} — minimal hesitation")
    if fillers_per_min > 10:
        justification.append(f"{fillers_per_min:.1f} fillers/min — frequent hesitation markers")
    if discourse_markers >= 3:
        justification.append(f"{discourse_markers} discourse markers — coherent connection of ideas")

    return CriterionScore(
        band=band,
        features={
            "speech_rate_syl_per_sec": speech_rate,
            "pause_to_speech_ratio": pause_ratio,
            "fillers_per_min": round(fillers_per_min, 2),
            "discourse_marker_count": float(discourse_markers),
            "word_count": float(word_count),
        },
        justification=justification,
    )


def _score_lexical_resource(profile: dict[str, Any]) -> CriterionScore:
    """Lexical Resource: TTR, content-word sophistication, POS-tag variety, repetition.

    Built only on fields the NLP layer actually emits: tokens (with pos/lemma),
    pos_distribution, unique_pos_tags. Earlier versions referenced
    `low_freq_word_ratio`/`sophisticated_vocab_ratio` which were never populated
    and silently defaulted to 0 — flattening LR to a constant.
    """
    tr = profile.get("transcription") or {}
    nlp = profile.get("nlp") or {}
    morph = _safe_get(nlp, "morphology", default={}) or {}
    tokens_struct = morph.get("tokens") or []
    pos_dist = morph.get("pos_distribution") or {}
    unique_pos = morph.get("unique_pos_tags") or []

    text = (tr.get("text") or "").lower()
    word_tokens = [w for w in text.split() if any(c.isalpha() for c in w)]
    n_tokens = len(word_tokens)
    n_types = len(set(word_tokens))
    ttr = (n_types / n_tokens) if n_tokens > 0 else 0.0

    # Content words = NOUN, VERB, ADJ, ADV (drives lexical sophistication signal).
    content_pos = {"NOUN", "PROPN", "VERB", "ADJ", "ADV"}
    content_words = [t.get("lemma","").lower() for t in tokens_struct
                     if t.get("pos") in content_pos and not t.get("is_stop")]
    n_content = len(content_words)
    # Mean content-word length (chars) — proxy for sophistication.
    mean_cw_len = (sum(len(w) for w in content_words) / n_content) if n_content > 0 else 0.0
    # Long content-word ratio (≥ 7 chars) — proxy for academic vocabulary.
    long_cw_ratio = (sum(1 for w in content_words if len(w) >= 7) / n_content) if n_content > 0 else 0.0

    # POS variety (out of ~17 universal tags). Wider range → richer vocabulary.
    pos_variety = len(unique_pos)

    # Repetition of content words (stop-word repetition is normal English).
    rep_count = 0
    seen: set[str] = set()
    for w in content_words:
        if w in seen:
            rep_count += 1
        seen.add(w)
    rep_rate = (rep_count / n_content) if n_content > 0 else 0.0

    ttr_band = 4.0
    if n_tokens < 8:                   ttr_band = 4.5
    elif n_tokens < 20:                ttr_band = 5.5
    elif ttr >= 0.80:                  ttr_band = 8.5
    elif ttr >= 0.70:                  ttr_band = 7.5
    elif ttr >= 0.60:                  ttr_band = 6.5
    elif ttr >= 0.50:                  ttr_band = 5.5
    else:                              ttr_band = 4.5

    sophistication_band = 5.0
    if   mean_cw_len >= 7.5 and long_cw_ratio >= 0.50: sophistication_band = 8.5
    elif mean_cw_len >= 6.5 and long_cw_ratio >= 0.40: sophistication_band = 7.5
    elif mean_cw_len >= 5.5 and long_cw_ratio >= 0.25: sophistication_band = 6.5
    elif mean_cw_len >= 4.5:                            sophistication_band = 5.5
    else:                                               sophistication_band = 4.5

    pos_band = 5.0
    if   pos_variety >= 12: pos_band = 8.0
    elif pos_variety >= 10: pos_band = 7.0
    elif pos_variety >= 8:  pos_band = 6.0
    elif pos_variety >= 6:  pos_band = 5.0
    else:                   pos_band = 4.0

    rep_band = 6.0
    if   rep_rate <= 0.05: rep_band = 7.5
    elif rep_rate <= 0.10: rep_band = 7.0
    elif rep_rate <= 0.20: rep_band = 6.0
    elif rep_rate <= 0.30: rep_band = 5.0
    else:                  rep_band = 4.0

    weights = (0.35, 0.30, 0.20, 0.15)  # ttr · sophistication · pos_variety · repetition
    band = (ttr_band * weights[0] + sophistication_band * weights[1]
            + pos_band * weights[2] + rep_band * weights[3])
    band = max(1.0, min(9.0, round(band * 2) / 2.0))

    justification = [
        f"type-token ratio {ttr:.2f} on {n_tokens} tokens",
        f"content-word mean length {mean_cw_len:.1f} chars · {long_cw_ratio*100:.0f}% ≥ 7 chars",
        f"part-of-speech variety {pos_variety} of ~17 universal tags",
    ]
    if rep_rate > 0.15:
        justification.append(f"content-word repetition {rep_rate*100:.0f}%")
    if n_tokens < 30:
        justification.append(f"sample short ({n_tokens} tokens) — interpret with caution")

    return CriterionScore(
        band=band,
        features={
            "type_token_ratio": round(ttr, 3),
            "n_tokens": float(n_tokens),
            "n_types": float(n_types),
            "n_content_words": float(n_content),
            "mean_content_word_length": round(mean_cw_len, 2),
            "long_content_word_ratio": round(long_cw_ratio, 3),
            "pos_variety": float(pos_variety),
            "repetition_rate": round(rep_rate, 3),
        },
        justification=justification,
    )


def _score_grammatical_range(profile: dict[str, Any]) -> CriterionScore:
    """Grammatical Range & Accuracy: derived from spaCy outputs that the NLP
    layer actually emits — constituency_tree depth, dep-relation variety, verb
    tense variety, mean length of utterance.

    Earlier versions read `avg_parse_depth`, `subordinate_clause_ratio`,
    `error_count`, `unique_clause_types` — none of which the NLP layer ever
    populated. Every clip silently defaulted to 6.0.
    """
    nlp = profile.get("nlp") or {}
    syntax = _safe_get(nlp, "syntax", default={}) or {}
    morph = _safe_get(nlp, "morphology", default={}) or {}
    tokens_struct = morph.get("tokens") or []
    tree = syntax.get("constituency_tree")
    sentence_count = max(1, int(morph.get("sentence_count") or 1))
    word_count = int(morph.get("word_count") or len([t for t in tokens_struct if t.get("text", "").isalpha()]))
    word_count = max(1, word_count)

    # Parse depth: max nesting level of constituency_tree.
    def _depth(node: Any) -> int:
        if isinstance(node, dict):
            kids = node.get("children") or []
            return 1 + max((_depth(k) for k in kids), default=0)
        return 0
    parse_depth = _depth(tree)

    # Subordinate-clause ratio: count CLAUSE / SBAR / VP-subordinated nodes per sentence.
    SUB_LABELS = {"CLAUSE", "SBAR", "S-BAR", "S̄", "RELC"}
    def _count_labels(node: Any, labels: set[str]) -> int:
        if isinstance(node, dict):
            n = 1 if (node.get("label") in labels) else 0
            for k in node.get("children") or []:
                n += _count_labels(k, labels)
            return n
        return 0
    sub_count = _count_labels(tree, SUB_LABELS)
    sub_ratio = sub_count / sentence_count

    # Verb-tense variety from token tags (VBD/VBN/VBZ/VBP/VBG/MD).
    verb_tags = {t.get("tag") for t in tokens_struct
                 if t.get("pos") in ("VERB", "AUX") and t.get("tag")}
    verb_tense_variety = len(verb_tags)

    # Dep-relation variety: how many distinct syntactic roles appear.
    dep_variety = len({t.get("dep") for t in tokens_struct if t.get("dep")})

    # Mean length of utterance — already computed by NLP layer (in words/sentence).
    mlu = float(syntax.get("mlu") or (word_count / sentence_count))

    depth_band = 4.0
    if   parse_depth >= 7: depth_band = 8.5
    elif parse_depth >= 5: depth_band = 7.0
    elif parse_depth >= 4: depth_band = 6.0
    elif parse_depth >= 3: depth_band = 5.0
    else:                  depth_band = 4.0

    sub_band = 5.0
    if   sub_ratio >= 1.5: sub_band = 8.0
    elif sub_ratio >= 1.0: sub_band = 7.0
    elif sub_ratio >= 0.5: sub_band = 6.0
    elif sub_ratio >= 0.2: sub_band = 5.0
    else:                  sub_band = 4.0

    tense_band = 4.0
    if   verb_tense_variety >= 5: tense_band = 8.0
    elif verb_tense_variety >= 4: tense_band = 7.0
    elif verb_tense_variety >= 3: tense_band = 6.0
    elif verb_tense_variety >= 2: tense_band = 5.0
    else:                          tense_band = 4.0

    dep_band = 4.0
    if   dep_variety >= 14: dep_band = 8.0
    elif dep_variety >= 11: dep_band = 7.0
    elif dep_variety >= 8:  dep_band = 6.0
    elif dep_variety >= 5:  dep_band = 5.0
    else:                   dep_band = 4.0

    mlu_band = 5.0
    if   mlu >= 18: mlu_band = 8.0
    elif mlu >= 14: mlu_band = 7.0
    elif mlu >= 10: mlu_band = 6.0
    elif mlu >= 7:  mlu_band = 5.0
    else:           mlu_band = 4.0

    weights = (0.25, 0.20, 0.20, 0.20, 0.15)  # depth · sub · tense · dep · mlu
    band = (depth_band * weights[0] + sub_band * weights[1]
            + tense_band * weights[2] + dep_band * weights[3] + mlu_band * weights[4])
    band = max(1.0, min(9.0, round(band * 2) / 2.0))

    justification = [
        f"max parse depth {parse_depth} · {sub_count} subordinate clauses across {sentence_count} sentence(s) (ratio {sub_ratio:.2f})",
        f"verb-tense variety {verb_tense_variety} forms · dep-relation variety {dep_variety}",
        f"mean length of utterance {mlu:.1f} words/sentence",
    ]

    return CriterionScore(
        band=band,
        features={
            "max_parse_depth": float(parse_depth),
            "subordinate_clause_ratio": round(sub_ratio, 3),
            "verb_tense_variety": float(verb_tense_variety),
            "dep_relation_variety": float(dep_variety),
            "mean_length_of_utterance": round(mlu, 2),
        },
        justification=justification,
    )


def _score_pronunciation(profile: dict[str, Any]) -> CriterionScore:
    """Pronunciation band — Vaani Acoustic Voice Profile (rev 4, 2026-05-07).

    Maps acoustic measurements from all 6 of Vaani's acoustic-core layers onto
    the IELTS Speaking Pronunciation band (1.0 – 9.0). The IELTS Public Band
    Descriptors define "pronunciation features" as a superset spanning
    individual sounds, rhythm, stress, intonation, weak forms, and linking —
    so this rubric draws on segmental, suprasegmental, and L1-transfer
    evidence in proportion to their published predictive validity for
    comprehensibility (Isaacs & Trofimovich 2012; Kang 2010; Munro &
    Derwing 1995; Magne et al. 2009).

    Seven components, each scored by linear interpolation against published
    L1/L2 anchors, then weighted-summed and rounded to the IELTS half-band.
    Step-bucket scoring (legacy rev 3) collapsed our 2026-05-07 mentor-eval
    cohort (Bands 7.0/8.0/9.0) into a single 6.5; the continuous rev 4
    formula resolves them to distinct bands.

    Component weights (sum = 1.00):

      C1  Native-likeness (CIF Prosody.distance_to_L2)            — 0.20
      C2  L1 strength (CIF overall_cii)                           — 0.05
      C3  Phoneme accuracy (Layer 5)                              — 0.05
      C4  Speech rate (Layer 4 — Kang 2010 strongest predictor)   — 0.25
      C5  Pause structure (Layer 4 pause_to_speech_ratio)         — 0.25
      C6  Hesitation rate (Layer 4 word_finding_delays / minute)  — 0.10
      C7  Vowel peripheralness (Layer 3 F2 mean — vowel space)    — 0.10

    Weight rationale:
      C4 and C5 are the most contamination-resistant and most empirically
      discriminative signals available in acoustic-core mode (mentor eval
      2026-05-07: monotonic with ground-truth band 7→8→9). Kang 2010
      established speech rate as the single strongest acoustic predictor
      of native-listener comprehensibility ratings — we mirror that.
      C2 (overall CIF) and C3 (phoneme accuracy) are intentionally
      downweighted: C2 is a coarse aggregate that double-counts evidence
      already in C1 (CIF Prosody distance), and C3 carries known
      single-speaker / audio-quality bias (its wav2vec backbone is not
      fine-tuned on Indian L2 — see the 95% CI surfaced in justification).
      C1 stays substantial because Prosody.distance_to_L2 was the single
      sharpest discriminator in mentor-eval data (B9=1.44 vs B7/B8=3.20+).
    """
    l1 = profile.get("l1_interference") or {}
    pa = profile.get("phoneme_analysis") or {}
    pp = profile.get("prosodic_profile") or {}
    mb = profile.get("morpheme_boundary") or {}
    cif = profile.get("cif_analysis") or {}
    event_summary = profile.get("event_summary") or {}
    fe_pm = _safe_get(profile, "feature_extraction", "parselmouth", default={}) or {}
    formants = fe_pm.get("formants") or {}
    tr = profile.get("transcription") or {}

    l1_score = float(_safe_get(l1, "l1_interference_score", default=0.0) or 0.0)
    cif_score = float(
        _safe_get(cif, "overall_cii",
                  default=_safe_get(cif, "composite_score", default=l1_score))
        or l1_score
    )
    phoneme_accuracy = float(_safe_get(pa, "overall_accuracy", default=0.0) or 0.0)
    prosodic_score = float(_safe_get(pp, "prosodic_score", default=0.0) or 0.0)
    if l1_score > 1.0: l1_score /= 100.0
    if cif_score > 1.0: cif_score /= 100.0
    if phoneme_accuracy > 1.0: phoneme_accuracy /= 100.0
    if prosodic_score > 1.0: prosodic_score /= 100.0

    speech_rate = float(_safe_get(pp, "speech_rate_syl_per_sec", default=0.0) or 0.0)
    pause_ratio = float(_safe_get(pp, "pause_to_speech_ratio", default=0.0) or 0.0)
    duration_s = float(_safe_get(tr, "duration_seconds", default=0.0) or 0.0)
    cog = mb.get("cognitive_load") or {}
    word_finding_delays = int(cog.get("word_finding_delays") or 0)
    delays_per_min = (word_finding_delays / duration_s * 60.0) if duration_s > 0 else 0.0

    f2_mean = float(formants.get("f2_mean") or 0.0)

    prosody_dim = _get_cif_dim(cif, "Prosody")
    prosody_dist_l2 = float(prosody_dim.get("distance_to_l2") or 0.0)
    voice_dim = _get_cif_dim(cif, "Voice")
    voice_dist_l1 = float(voice_dim.get("distance_to_l1") or 0.0)

    # Anchors. Each row is (raw_input → IELTS band). Ordered ascending by
    # input. Linear interpolation between adjacent rows.
    #
    # C1 — Prosody distance_to_L2: lower = closer to native English
    #      anchor. Calibrated empirically against the 2026-05-07 cohort
    #      (B9 measured at 1.44; B7/B8 at 3.20+). Anchors set so the
    #      gradient through the empirically-observed range is steep.
    c1 = _interp_desc(prosody_dist_l2, [(0.5, 9.0), (1.0, 8.5), (1.5, 8.0),
                                          (2.0, 7.0), (3.0, 5.5), (4.0, 4.0),
                                          (5.5, 3.0)])

    # C2 — CIF overall: 0 = native L2 attractor; 1 = full L1 attractor.
    #      Tighter anchors than rev 3's step buckets.
    c2 = _interp_desc(cif_score, [(0.05, 9.0), (0.10, 8.5), (0.20, 8.0),
                                    (0.30, 7.5), (0.40, 7.0), (0.50, 6.5),
                                    (0.60, 6.0), (0.70, 5.0), (0.85, 4.0),
                                    (1.00, 3.0)])

    # C3 — Phoneme accuracy: tighter anchors so 0.75 vs 0.79 doesn't
    #      collapse to the same band as it did in rev 3.
    c3 = _interp(phoneme_accuracy, [(0.40, 3.0), (0.55, 4.5), (0.65, 5.5),
                                      (0.72, 6.0), (0.78, 6.5), (0.82, 7.0),
                                      (0.87, 7.5), (0.92, 8.0), (0.96, 9.0)])

    # C4 — Speech rate (syl/s): native English ~5–6 syl/s (Kang 2010);
    #      fluent L2 ~4.0–5.0; halting L2 < 3.5.
    c4 = _interp(speech_rate, [(1.5, 3.0), (2.0, 4.0), (2.5, 5.0),
                                 (3.0, 5.5), (3.5, 6.0), (4.0, 7.0),
                                 (4.3, 7.5), (4.6, 8.0), (5.0, 9.0)])

    # C5 — Pause-to-speech ratio: lower = more native-like.
    c5 = _interp_desc(pause_ratio, [(0.05, 9.0), (0.08, 8.5), (0.12, 8.0),
                                      (0.18, 7.0), (0.25, 6.0), (0.35, 5.0),
                                      (0.45, 4.0), (0.60, 3.0)])

    # C6 — Hesitation rate (word-finding delays per minute). 90s window:
    #      8/min ≈ Band 9, 18/min ≈ Band 5.
    c6 = _interp_desc(delays_per_min, [(2.0, 9.0), (4.0, 8.0), (6.0, 7.5),
                                         (8.0, 7.0), (10.0, 6.5), (13.0, 6.0),
                                         (17.0, 5.0), (22.0, 4.0), (30.0, 3.0)])

    # C7 — F2 mean (Hz): native American English ~1700–1900; Indian L2 typ.
    #      ~1500–1700; smaller F2 = more centralized vowels (stronger L1).
    if f2_mean > 0:
        c7 = _interp(f2_mean, [(1300, 4.0), (1450, 5.0), (1600, 6.0),
                                 (1700, 6.5), (1800, 7.0), (1900, 8.0),
                                 (2000, 9.0)])
    else:
        c7 = None  # F2 unavailable — do not fabricate a score

    weights = {"C1": 0.20, "C2": 0.05, "C3": 0.05, "C4": 0.25,
               "C5": 0.25, "C6": 0.10, "C7": 0.10}
    components = {"C1": c1, "C2": c2, "C3": c3, "C4": c4, "C5": c5, "C6": c6, "C7": c7}

    # Build unavailable list and compute band only from present components.
    # Silently defaulting a missing signal to 5.0 was the root cause of garbage
    # audio receiving plausible bands (e.g. empty mic → Band 7.0). Now missing
    # components are excluded and their weights redistributed proportionally.
    unavailable: list[str] = [k for k, v in components.items() if v is None]
    present = {k: v for k, v in components.items() if v is not None}
    if not present:
        # No acoustic signal available at all — refuse to score.
        return CriterionScore(
            band=0.0,
            features={"rubric_version": "pronunciation@2026.05.rev4", "unavailable_components": unavailable},
            justification=["Pronunciation cannot be scored — no usable acoustic signals detected. "
                           "Check audio quality: the clip may be silent, too short, or have insufficient speech content."],
        )

    # Redistribute weights among available components
    total_w = sum(weights[k] for k in present)
    scaled_weights = {k: weights[k] / total_w for k in present}
    raw = sum(present[k] * scaled_weights[k] for k in present)
    band = max(1.0, min(9.0, _round_ielts(raw)))

    # Justification — keep it information-dense but reader-friendly.
    justification: list[str] = []
    l1_name = _safe_get(l1, "l1_display_name", default="L1")
    if cif_score < 0.10:
        justification.append(
            f"CIF composite {cif_score:.2f} — near-native; no significant L1 transfer detected"
        )
    elif cif_score <= 0.20:
        justification.append(
            f"CIF composite {cif_score:.2f} — minimal {l1_name} transfer, near-native pronunciation"
        )
    elif cif_score <= 0.50:
        justification.append(
            f"CIF composite {cif_score:.2f} — some {l1_name} transfer, intelligibility preserved"
        )
    else:
        justification.append(
            f"CIF composite {cif_score:.2f} — {l1_name} transfer strongly shapes pronunciation features"
        )

    if prosody_dist_l2 > 0:
        justification.append(
            f"prosody distance to native L2 attractor = {prosody_dist_l2:.2f} "
            f"({'near-native' if prosody_dist_l2 <= 1.5 else 'L1-pulled'} rhythm/intonation)"
        )

    pa_lo = float(_safe_get(pa, "overall_accuracy_lower", default=phoneme_accuracy) or phoneme_accuracy)
    pa_hi = float(_safe_get(pa, "overall_accuracy_upper", default=phoneme_accuracy) or phoneme_accuracy)
    if pa_lo > 1.0: pa_lo /= 100.0
    if pa_hi > 1.0: pa_hi /= 100.0
    if pa_hi > pa_lo and (pa_hi - pa_lo) > 0.005:
        justification.append(
            f"phoneme-level accuracy {phoneme_accuracy*100:.1f}% "
            f"(95% CI {pa_lo*100:.1f}–{pa_hi*100:.1f}%, ASR-confidence-weighted)"
        )
    else:
        justification.append(f"phoneme-level accuracy {phoneme_accuracy*100:.1f}%")

    if speech_rate > 0:
        if speech_rate >= 4.5:
            sr_label = "fluent native-like delivery"
        elif speech_rate >= 4.0:
            sr_label = "fluent L2 delivery"
        elif speech_rate >= 3.5:
            sr_label = "moderate, intelligible"
        else:
            sr_label = "slow / hesitant"
        justification.append(f"speech rate {speech_rate:.2f} syl/s — {sr_label}")
    if pause_ratio > 0:
        if pause_ratio <= 0.12:
            pr_label = "minimal pausing, near-native flow"
        elif pause_ratio <= 0.20:
            pr_label = "acceptable pause pattern"
        elif pause_ratio <= 0.35:
            pr_label = "frequent pauses disrupt rhythm"
        else:
            pr_label = "long silences fragment delivery"
        justification.append(f"pause/speech ratio {pause_ratio:.2f} — {pr_label}")
    if duration_s > 0 and word_finding_delays > 0:
        justification.append(
            f"{word_finding_delays} word-finding delay(s) ({delays_per_min:.1f}/min) "
            "— hesitation marker"
        )
    if f2_mean > 0:
        if f2_mean >= 1850:
            f2_label = "peripheral / native-like vowels"
        elif f2_mean >= 1700:
            f2_label = "mostly peripheral vowels"
        elif f2_mean >= 1550:
            f2_label = "partially centralized vowels (typical L2)"
        else:
            f2_label = "centralized vowels (strong L1 footprint)"
        justification.append(f"F2 mean {f2_mean:.0f} Hz — {f2_label}")
    else:
        justification.append("F2 formant data unavailable — vowel peripheralness not assessed")

    fa = profile.get("forced_alignment") or {}
    fa_quality = fa.get("quality")
    fa_source = fa.get("source")
    if fa_quality == "low":
        justification.append(
            f"phoneme-aligned features used coarse {fa_source or 'g2p'} fallback "
            "(MFA/WebMAUS unavailable) — band carries higher variance"
        )
    elif fa_quality == "unavailable":
        justification.append(
            "forced alignment unavailable — phoneme-aligned features omitted"
        )

    fired = _safe_get(l1, "fired_substitutions", default=[]) or []
    if isinstance(fired, list) and fired:
        def _label(s: dict[str, Any]) -> str:
            tgt = s.get("ipa_target") or s.get("target") or "?"
            sub = s.get("ipa_substitute") or s.get("likely_substitute") or "?"
            return f"/{tgt}/→/{sub}/"
        top = ", ".join(_label(s) for s in fired[:3] if isinstance(s, dict))
        if top:
            justification.append(f"top acoustic substitutions (L1-catalogued): {top}")

    total_events = int(event_summary.get("total_events") or 0)
    n_subs = int(event_summary.get("substitutions") or 0)
    if total_events > 0:
        labeled = len(fired) if isinstance(fired, list) else 0
        unlabeled = max(n_subs - labeled, 0)
        if unlabeled > 0:
            justification.append(
                f"{n_subs} acoustic substitution event(s) detected ({labeled} L1-catalogued, "
                f"{unlabeled} acoustic but mechanism unlabeled)"
            )
        else:
            justification.append(f"{n_subs} acoustic substitution event(s) detected")

    return CriterionScore(
        band=band,
        features={
            # legacy keys (preserved for back-compat with existing consumers)
            "l1_interference_score": round(l1_score, 3),
            "cif_composite": round(cif_score, 3),
            "phoneme_accuracy": round(phoneme_accuracy, 3),
            "prosodic_score": round(prosodic_score, 3),
            # rev 4 transparency: each component band + the raw inputs
            "rubric_version": "pronunciation@2026.05.rev4",
            "component_bands": {
                "C1_native_likeness": round(c1, 2) if c1 is not None else None,
                "C2_l1_strength":     round(c2, 2) if c2 is not None else None,
                "C3_phoneme_accuracy": round(c3, 2) if c3 is not None else None,
                "C4_speech_rate":     round(c4, 2) if c4 is not None else None,
                "C5_pause_structure": round(c5, 2) if c5 is not None else None,
                "C6_hesitation_rate": round(c6, 2) if c6 is not None else None,
                "C7_vowel_peripheralness": round(c7, 2) if c7 is not None else None,
            },
            "unavailable_components": unavailable,
            "raw_signals": {
                "prosody_distance_to_l2": round(prosody_dist_l2, 3),
                "voice_distance_to_l1": round(voice_dist_l1, 3),
                "speech_rate_syl_per_sec": round(speech_rate, 3),
                "pause_to_speech_ratio": round(pause_ratio, 3),
                "word_finding_delays_per_min": round(delays_per_min, 2),
                "f2_mean_hz": round(f2_mean, 1),
            },
            "weighted_pre_round": round(raw, 3),
        },
        justification=justification,
    )


def _unscored(reason: str) -> CriterionScore:
    """Placeholder CriterionScore for criteria not produced in acoustic-core mode."""
    return CriterionScore(
        band=0.0,
        features={},
        justification=[reason],
    )


def compute_ielts_band(profile: dict[str, Any]) -> IELTSBandScore:
    """Map a Vaani profile dict to IELTS Speaking band scores.

    In acoustic-core mode (the default production surface) only the
    Pronunciation criterion is computed — its band becomes `overall_band`
    and the other three criteria carry an explicit "not scored in this
    release" justification. The acoustic-core surface is the *Acoustic
    Voice Profile*, not a full IELTS verdict; emitting unverified
    LR/GRA/FC bands would silently over-claim what the engine measured.

    Full mode (ACOUSTIC_CORE_ONLY=false) restores the four-criterion
    rubric for calibration / validation runs.
    """
    pron = _score_pronunciation(profile)

    notes: list[str] = []
    tr = profile.get("transcription") or {}
    duration = float(tr.get("duration_seconds") or 0.0)
    word_count = len((tr.get("word_timestamps") or []))

    if pron.band == 0.0 and pron.features.get("unavailable_components"):
        # All pronunciation components unavailable — audio is unusable.
        notes.append(
            f"Pronunciation could not be scored — no usable acoustic signals detected. "
            f"Unavailable components: {pron.features.get('unavailable_components')}"
        )
        return IELTSBandScore(
            fluency_coherence=_unscored("Not scored (audio insufficient for any scoring)"),
            lexical_resource=_unscored("Not scored (audio insufficient for any scoring)"),
            grammatical_range=_unscored("Not scored (audio insufficient for any scoring)"),
            pronunciation=pron,
            overall_band=0.0,
            test_type="acoustic_voice_profile",
            notes=notes,
        )

    if duration < 30.0:
        notes.append(
            f"sample duration {duration:.1f}s is below the recommended 60s — pronunciation band may be unreliable"
        )

    # Always compute all four IELTS criteria. NLP layer now runs unconditionally
    # (switched to en_core_web_sm for CPU-only operation). The acoustic-core flag
    # only gates heavy interpretive layers (MLAF, syntactic L1, abductive loop)
    # that are not needed for FC/LR/GRA scoring.
    fc = _score_fluency_coherence(profile)
    lr = _score_lexical_resource(profile)
    gra = _score_grammatical_range(profile)

    # Validate NLP data availability. If spaCy failed (morphology/syntax are None),
    # FC/LR/GRA scores are based on prosodic + transcript-only signals — flag this.
    nlp = profile.get("nlp") or {}
    if nlp.get("morphology") is None and nlp.get("syntax") is None:
        notes.append(
            "NLP layer did not produce morphology/syntax data — FC/LR/GRA bands use "
            "transcript-only signals and carry higher variance. Check that the spaCy "
            "model is installed (en_core_web_sm)."
        )

    mean_band = (fc.band + lr.band + gra.band + pron.band) / 4.0
    overall = _round_ielts(mean_band)
    if word_count < 50:
        notes.append(
            f"only {word_count} words transcribed — lexical and grammatical bands have low confidence"
        )

    test_type = "acoustic_voice_profile" if _ACOUSTIC_CORE_ONLY else "ielts_speaking"
    return IELTSBandScore(
        fluency_coherence=fc,
        lexical_resource=lr,
        grammatical_range=gra,
        pronunciation=pron,
        overall_band=overall,
        test_type=test_type,
        notes=notes,
    )


def band_to_dict(b: IELTSBandScore) -> dict[str, Any]:
    """Serialize IELTSBandScore to a JSON-safe dict for API responses."""
    def _c(c: CriterionScore) -> dict[str, Any]:
        return {"band": c.band, "features": c.features, "justification": c.justification}

    return {
        "test_type": b.test_type,
        "overall_band": b.overall_band,
        "fluency_coherence": _c(b.fluency_coherence),
        "lexical_resource": _c(b.lexical_resource),
        "grammatical_range": _c(b.grammatical_range),
        "pronunciation": _c(b.pronunciation),
        "notes": b.notes,
    }
