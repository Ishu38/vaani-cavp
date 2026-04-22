"""CONTRASTIVE INTERFERENCE FIELD (CIF) MODEL

A novel mathematical framework that treats L1 and L2 (English) as
competing attractor fields in acoustic feature space.

The child's actual speech production is modeled as a state vector S in
high-dimensional acoustic space. Two attractor points -- A_L1 (L1 target)
and A_L2 (English target) -- exert competing pulls. The Contrastive Interference
Index (CII) measures where S falls between these attractors.

Supports multiple L1 languages: Bhojpuri, Hindi, Bangla, Odia.

Definitions:
    CII(S) = d(S, A_L2) / (d(S, A_L1) + d(S, A_L2))
    where d is weighted Mahalanobis distance.

    CII = 0  -> perfect L2 (English) production
    CII = 1  -> pure L1 transfer
    CII = 0.5 -> equal pull from both languages

Per-dimension decomposition:
    CII_phoneme, CII_prosody, CII_rhythm, CII_voice, CII_fluency

Trajectory prediction:
    CII(t) = CII_0 * exp(-lambda * t) + CII_inf

Author: Neil Shankar Ray, IIT Patna
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Any

import numpy as np
from scipy.optimize import curve_fit


# ── Attractor definitions ────────────────────────────────────────────────
# Each attractor is a dict of feature_name -> (expected_value, weight, natural_std)
# natural_std is used to normalize deviations (Mahalanobis-style)

# Per-L1 attractors: what L1-dominant speech sounds like for each language
L1_ATTRACTORS: dict[str, dict[str, tuple[float, float, float]]] = {
    "bho": {  # Bhojpuri: 6 vowels, strong retroflex, syllable-timed
        "f1_mean": (620, 1.0, 80), "f2_mean": (1350, 1.0, 150),
        "vowel_space_area": (130000, 1.2, 30000), "phoneme_accuracy": (0.45, 1.5, 0.15),
        "interference_score": (70, 1.0, 15),
        "npvi_v": (32, 1.3, 8), "percent_v": (58, 1.0, 5), "prosodic_score": (35, 1.0, 12),
        "speech_rate_syl": (3.2, 0.8, 0.8), "pause_to_speech": (0.35, 0.8, 0.1),
        "delta_c": (25, 1.0, 8),
        "hnr": (11, 0.7, 4), "jitter": (0.025, 0.7, 0.01), "voice_quality_score": (55, 0.8, 12),
        "fluency_score": (25, 1.2, 10), "coarticulation_index": (0.35, 1.0, 0.15),
        "cognitive_load": (60, 0.8, 15),
    },
    "hin": {  # Hindi: 10 vowels, retroflex, better English exposure typically
        "f1_mean": (590, 1.0, 80), "f2_mean": (1400, 1.0, 150),
        "vowel_space_area": (170000, 1.2, 35000), "phoneme_accuracy": (0.55, 1.5, 0.15),
        "interference_score": (55, 1.0, 15),
        "npvi_v": (35, 1.3, 8), "percent_v": (55, 1.0, 5), "prosodic_score": (42, 1.0, 12),
        "speech_rate_syl": (3.5, 0.8, 0.8), "pause_to_speech": (0.30, 0.8, 0.1),
        "delta_c": (30, 1.0, 8),
        "hnr": (12, 0.7, 4), "jitter": (0.022, 0.7, 0.01), "voice_quality_score": (58, 0.8, 12),
        "fluency_score": (32, 1.2, 10), "coarticulation_index": (0.40, 1.0, 0.15),
        "cognitive_load": (52, 0.8, 15),
    },
    "ben": {  # Bangla: 7 vowels, retroflex, strong nasalization
        "f1_mean": (610, 1.0, 80), "f2_mean": (1380, 1.0, 150),
        "vowel_space_area": (145000, 1.2, 30000), "phoneme_accuracy": (0.48, 1.5, 0.15),
        "interference_score": (65, 1.0, 15),
        "npvi_v": (30, 1.3, 8), "percent_v": (57, 1.0, 5), "prosodic_score": (38, 1.0, 12),
        "speech_rate_syl": (3.3, 0.8, 0.8), "pause_to_speech": (0.33, 0.8, 0.1),
        "delta_c": (27, 1.0, 8),
        "hnr": (11, 0.7, 4), "jitter": (0.024, 0.7, 0.01), "voice_quality_score": (56, 0.8, 12),
        "fluency_score": (28, 1.2, 10), "coarticulation_index": (0.37, 1.0, 0.15),
        "cognitive_load": (58, 0.8, 15),
    },
    "ori": {  # Odia: 6 vowels, strong retroflex, similar to Bhojpuri
        "f1_mean": (615, 1.0, 80), "f2_mean": (1340, 1.0, 150),
        "vowel_space_area": (135000, 1.2, 30000), "phoneme_accuracy": (0.47, 1.5, 0.15),
        "interference_score": (68, 1.0, 15),
        "npvi_v": (33, 1.3, 8), "percent_v": (57, 1.0, 5), "prosodic_score": (36, 1.0, 12),
        "speech_rate_syl": (3.2, 0.8, 0.8), "pause_to_speech": (0.34, 0.8, 0.1),
        "delta_c": (26, 1.0, 8),
        "hnr": (11, 0.7, 4), "jitter": (0.024, 0.7, 0.01), "voice_quality_score": (55, 0.8, 12),
        "fluency_score": (26, 1.2, 10), "coarticulation_index": (0.36, 1.0, 0.15),
        "cognitive_load": (59, 0.8, 15),
    },
}

DEFAULT_L1_CODE = "bho"

# English L2 attractor (what native-like English sounds like)
ATTRACTOR_L2: dict[str, tuple[float, float, float]] = {
    # Phoneme features
    "f1_mean":              (480, 1.0, 80),       # wider vowel space
    "f2_mean":              (1650, 1.0, 150),     # broader F2 range
    "vowel_space_area":     (280000, 1.2, 40000), # larger VSA (12+ vowels)
    "phoneme_accuracy":     (0.88, 1.5, 0.08),   # high accuracy
    "interference_score":   (10, 1.0, 8),          # low interference

    # Prosody features
    "npvi_v":               (62, 1.3, 8),          # stress-timed
    "percent_v":            (42, 1.0, 5),          # lower vocalic proportion
    "prosodic_score":       (82, 1.0, 10),         # high nativeness

    # Rhythm features
    "speech_rate_syl":      (5.0, 0.8, 0.8),      # natural rate
    "pause_to_speech":      (0.18, 0.8, 0.06),    # less pausing
    "delta_c":              (55, 1.0, 10),         # high consonantal variability

    # Voice quality features
    "hnr":                  (18, 0.7, 4),          # clear voice
    "jitter":               (0.012, 0.7, 0.005),  # low jitter
    "voice_quality_score":  (80, 0.8, 8),          # good quality

    # Fluency features
    "fluency_score":        (70, 1.2, 12),         # strong connected speech
    "coarticulation_index": (0.75, 1.0, 0.12),    # smooth coarticulation
    "cognitive_load":       (20, 0.8, 10),         # low effort
}


# ── Feature groupings for per-dimension CII ──────────────────────────────

DIMENSION_FEATURES: dict[str, list[str]] = {
    "phoneme": ["f1_mean", "f2_mean", "vowel_space_area", "phoneme_accuracy", "interference_score"],
    "prosody": ["npvi_v", "percent_v", "prosodic_score"],
    "rhythm":  ["speech_rate_syl", "pause_to_speech", "delta_c"],
    "voice":   ["hnr", "jitter", "voice_quality_score"],
    "fluency": ["fluency_score", "coarticulation_index", "cognitive_load"],
}


# ── Result dataclasses ───────────────────────────────────────────────────

@dataclass
class DimensionCII:
    name: str
    cii: float               # 0-1
    severity: str            # "Low", "Mild", "Moderate", "High", "Critical"
    distance_to_l1: float
    distance_to_l2: float
    features_used: list[str]
    bar: str                 # visual bar e.g. "████████░░"


@dataclass
class TrajectoryPrediction:
    cii_initial: float       # CII_0
    cii_residual: float      # CII_inf (asymptotic floor)
    decay_rate: float        # lambda
    predicted_cii_8w: float  # predicted CII at 8 weeks
    weeks_to_moderate: float | None   # weeks to reach CII < 0.5
    weeks_to_mild: float | None       # weeks to reach CII < 0.3
    confidence: str          # "high", "moderate", "low"


@dataclass
class CIFResult:
    overall_cii: float
    overall_severity: str
    dimensions: list[DimensionCII]
    state_vector: dict[str, float]
    trajectory: TrajectoryPrediction | None
    methodology: str


# ── Core math ────────────────────────────────────────────────────────────

def _weighted_mahalanobis(
    state: dict[str, float],
    attractor: dict[str, tuple[float, float, float]],
    features: list[str],
) -> float:
    """Compute weighted Mahalanobis-style distance from state to attractor.

    For each feature:
        contribution = weight * ((state_val - attractor_val) / sigma)^2

    Distance = sqrt(sum of contributions)

    This normalizes each feature by its natural standard deviation (sigma)
    so that all features contribute proportionally regardless of unit scale.
    The weight further controls clinical importance.
    """
    total = 0.0
    n_used = 0

    for feat in features:
        if feat not in state or feat not in attractor:
            continue
        s_val = state[feat]
        a_val, weight, sigma = attractor[feat]

        if sigma <= 0:
            continue

        normalized_diff = (s_val - a_val) / sigma
        total += weight * (normalized_diff ** 2)
        n_used += 1

    if n_used == 0:
        return 0.0

    # Normalize by number of features so dimensions with more features
    # don't dominate the overall CII
    return math.sqrt(total / n_used)


def _compute_cii(d_l1: float, d_l2: float) -> float:
    """CII = d(S, A_L2) / (d(S, A_L1) + d(S, A_L2))

    Returns 0 when speech is at the English attractor,
    1 when at the L1 attractor.
    """
    denominator = d_l1 + d_l2
    if denominator < 1e-10:
        return 0.5  # equidistant / no signal
    return d_l2 / denominator


def _classify_severity(cii: float) -> str:
    if cii >= 0.75:
        return "Critical"
    elif cii >= 0.60:
        return "High"
    elif cii >= 0.45:
        return "Moderate"
    elif cii >= 0.25:
        return "Mild"
    else:
        return "Low"


def _make_bar(cii: float, width: int = 10) -> str:
    """Generate visual bar: ████████░░"""
    filled = max(0, min(width, round(cii * width)))
    empty = width - filled
    return "\u2588" * filled + "\u2591" * empty


# ── Trajectory prediction ────────────────────────────────────────────────

def _exponential_decay(t: np.ndarray, cii_0: float, lam: float, cii_inf: float) -> np.ndarray:
    """CII(t) = CII_0 * exp(-lambda * t) + CII_inf"""
    return cii_0 * np.exp(-lam * t) + cii_inf


def predict_trajectory(
    historical_ciis: list[tuple[float, float]],  # [(week_number, cii_value), ...]
    current_cii: float,
) -> TrajectoryPrediction:
    """Fit exponential decay to historical CII values and predict future.

    If insufficient history, uses population-level defaults for lambda.
    """
    confidence = "low"

    if len(historical_ciis) >= 4:
        # Enough data to fit the curve
        try:
            t_data = np.array([h[0] for h in historical_ciis])
            cii_data = np.array([h[1] for h in historical_ciis])

            # Initial guesses
            p0 = [cii_data[0], 0.05, 0.15]
            bounds = ([0, 0.001, 0], [1.5, 0.5, 0.8])

            popt, pcov = curve_fit(_exponential_decay, t_data, cii_data, p0=p0, bounds=bounds, maxfev=5000)
            cii_0, lam, cii_inf = popt
            confidence = "high" if len(historical_ciis) >= 8 else "moderate"
        except (RuntimeError, ValueError):
            # Fit failed, use defaults
            cii_0 = current_cii
            lam = 0.034  # population average
            cii_inf = 0.12
            confidence = "low"
    elif len(historical_ciis) >= 2:
        # Minimal data — estimate lambda from two-point slope
        t1, c1 = historical_ciis[0]
        t2, c2 = historical_ciis[-1]
        dt = t2 - t1
        if dt > 0 and c1 > c2 and c1 > 0.15:
            lam = -math.log(max(0.01, (c2 - 0.12) / (c1 - 0.12))) / dt
            lam = max(0.005, min(0.3, lam))
        else:
            lam = 0.034
        cii_0 = current_cii
        cii_inf = 0.12
        confidence = "low"
    else:
        # No history — use population defaults
        cii_0 = current_cii
        lam = 0.034
        cii_inf = 0.12
        confidence = "low"

    # Predict at 8 weeks from now
    predicted_8w = cii_0 * math.exp(-lam * 8) + cii_inf

    # Weeks to reach moderate (CII < 0.5)
    weeks_to_moderate = None
    if current_cii >= 0.5 and cii_inf < 0.5:
        target = 0.5 - cii_inf
        if cii_0 > 0 and target > 0 and target < cii_0:
            weeks_to_moderate = round(-math.log(target / cii_0) / lam, 1)

    # Weeks to reach mild (CII < 0.3)
    weeks_to_mild = None
    if current_cii >= 0.3 and cii_inf < 0.3:
        target = 0.3 - cii_inf
        if cii_0 > 0 and target > 0 and target < cii_0:
            weeks_to_mild = round(-math.log(target / cii_0) / lam, 1)

    return TrajectoryPrediction(
        cii_initial=round(cii_0, 4),
        cii_residual=round(cii_inf, 4),
        decay_rate=round(lam, 4),
        predicted_cii_8w=round(max(cii_inf, predicted_8w), 4),
        weeks_to_moderate=weeks_to_moderate,
        weeks_to_mild=weeks_to_mild,
        confidence=confidence,
    )


# ── Feature extraction from pipeline results ─────────────────────────────

def _extract_state_vector(profile: dict[str, Any]) -> dict[str, float]:
    """Extract the acoustic state vector S from pipeline results.

    Maps every relevant score/measurement from the 10-layer pipeline
    into the feature space defined by the attractors.
    """
    state: dict[str, float] = {}

    # ── From phoneme_analysis ──
    pa = profile.get("phoneme_analysis", {})
    state["phoneme_accuracy"] = float(pa.get("overall_accuracy", 0))
    state["interference_score"] = float(pa.get("interference_score", 50))
    state["vowel_space_area"] = float(pa.get("vowel_space_area", 0))

    formant_means = pa.get("formant_means", {})
    state["f1_mean"] = float(formant_means.get("f1", 0))
    state["f2_mean"] = float(formant_means.get("f2", 0))

    # If phoneme_analysis formants are zero, try feature_extraction
    if state["f1_mean"] == 0:
        fe = profile.get("feature_extraction", {})
        praat = fe.get("parselmouth", {})
        formants = praat.get("formants", {})
        state["f1_mean"] = float(formants.get("f1_mean", 0))
        state["f2_mean"] = float(formants.get("f2_mean", 0))
        if state["vowel_space_area"] == 0:
            state["vowel_space_area"] = float(formants.get("vowel_space_area", 0))

    # ── From prosodic_profile ──
    pp = profile.get("prosodic_profile", {})
    rhythm = pp.get("rhythm", {})
    state["npvi_v"] = float(rhythm.get("npvi_v", 0))
    state["percent_v"] = float(rhythm.get("percent_v", 50))
    state["delta_c"] = float(rhythm.get("delta_c", 0))
    state["prosodic_score"] = float(pp.get("prosodic_score", 50))
    state["speech_rate_syl"] = float(pp.get("speech_rate_syl_per_sec", 0))
    state["pause_to_speech"] = float(pp.get("pause_to_speech_ratio", 0))

    # ── From voice_quality ──
    vq = profile.get("voice_quality", {})
    breathiness = vq.get("breathiness", {})
    creakiness = vq.get("creakiness", {})
    state["hnr"] = float(breathiness.get("hnr", 0))
    state["jitter"] = float(creakiness.get("jitter_local", 0))
    state["voice_quality_score"] = float(vq.get("overall_quality_score", 50))

    # ── From connected_speech ──
    cs = profile.get("connected_speech", {})
    state["fluency_score"] = float(cs.get("fluency_score", 0))
    state["coarticulation_index"] = float(cs.get("coarticulation_index", 0))

    # ── From morpheme_boundary ──
    mb = profile.get("morpheme_boundary", {})
    cog = mb.get("cognitive_load", {})
    state["cognitive_load"] = float(cog.get("score", 50))

    return state


# ── Main entry point ─────────────────────────────────────────────────────

def compute_cif(
    profile: dict[str, Any],
    l1_code: str = DEFAULT_L1_CODE,
    historical_ciis: list[tuple[float, float]] | None = None,
) -> dict[str, Any]:
    """Compute the Contrastive Interference Field analysis.

    Args:
        profile: Full pipeline result dict from _run_full_pipeline
        l1_code: L1 language code ("bho", "hin", "ben", "ori")
        historical_ciis: Optional list of (week, cii) tuples for trajectory fitting

    Returns:
        Dict suitable for JSON serialization containing full CIF analysis.
    """
    state = _extract_state_vector(profile)
    attractor_l1 = L1_ATTRACTORS.get(l1_code, L1_ATTRACTORS[DEFAULT_L1_CODE])

    from modules.l1_targets import get_l1_profile
    l1_profile = get_l1_profile(l1_code)
    l1_display_name = l1_profile.display_name

    # ── Per-dimension CII ──
    dimensions: list[DimensionCII] = []
    dimension_ciis: list[float] = []
    dimension_weights: list[float] = []

    for dim_name, features in DIMENSION_FEATURES.items():
        d_l1 = _weighted_mahalanobis(state, attractor_l1, features)
        d_l2 = _weighted_mahalanobis(state, ATTRACTOR_L2, features)
        cii = _compute_cii(d_l1, d_l2)

        # Weight dimensions by their clinical importance for overall CII
        # Phoneme and rhythm deviations are the most perceptually salient
        dim_weight = {
            "phoneme": 1.5,
            "prosody": 1.3,
            "rhythm":  1.2,
            "voice":   0.7,
            "fluency": 1.3,
        }.get(dim_name, 1.0)

        dimensions.append(DimensionCII(
            name=dim_name,
            cii=round(cii, 4),
            severity=_classify_severity(cii),
            distance_to_l1=round(d_l1, 4),
            distance_to_l2=round(d_l2, 4),
            features_used=features,
            bar=_make_bar(cii),
        ))
        dimension_ciis.append(cii)
        dimension_weights.append(dim_weight)

    # ── Overall CII (weighted average of dimension CIIs) ──
    w_arr = np.array(dimension_weights)
    c_arr = np.array(dimension_ciis)
    overall_cii = float(np.average(c_arr, weights=w_arr))

    # ── Trajectory prediction ──
    trajectory = None
    if historical_ciis is not None:
        trajectory = predict_trajectory(historical_ciis, overall_cii)
    else:
        # Still provide a default prediction using population lambda
        trajectory = predict_trajectory([], overall_cii)

    result = CIFResult(
        overall_cii=round(overall_cii, 4),
        overall_severity=_classify_severity(overall_cii),
        dimensions=dimensions,
        state_vector={k: round(v, 4) for k, v in state.items()},
        trajectory=trajectory,
        methodology=(
            f"Contrastive Interference Field (CIF) Model v2.0 -- "
            f"Weighted Mahalanobis distance from L1 ({l1_display_name}) and L2 (English) "
            f"attractor points in 17-dimensional acoustic feature space. "
            f"CII = d(S,A_L2) / (d(S,A_L1) + d(S,A_L2)). "
            f"Trajectory: CII(t) = CII_0 * exp(-lambda*t) + CII_inf."
        ),
    )

    # Serialize to dict
    return _serialize_cif(result)


def _serialize_cif(result: CIFResult) -> dict[str, Any]:
    """Convert CIFResult to a JSON-serializable dict."""
    return {
        "overall_cii": result.overall_cii,
        "overall_severity": result.overall_severity,
        "dimensions": [
            {
                "name": d.name.capitalize(),
                "cii": d.cii,
                "severity": d.severity,
                "distance_to_l1": d.distance_to_l1,
                "distance_to_l2": d.distance_to_l2,
                "features_used": d.features_used,
                "bar": d.bar,
            }
            for d in result.dimensions
        ],
        "state_vector": result.state_vector,
        "trajectory": {
            "cii_initial": result.trajectory.cii_initial,
            "cii_residual": result.trajectory.cii_residual,
            "decay_rate": result.trajectory.decay_rate,
            "predicted_cii_8w": result.trajectory.predicted_cii_8w,
            "weeks_to_moderate": result.trajectory.weeks_to_moderate,
            "weeks_to_mild": result.trajectory.weeks_to_mild,
            "confidence": result.trajectory.confidence,
        } if result.trajectory else None,
        "methodology": result.methodology,
    }
