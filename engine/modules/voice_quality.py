"""VOICE QUALITY MODULE
HNR, CPP, spectral tilt, breathiness/creakiness indices,
nasality estimation, vocal register classification.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

import numpy as np


@dataclass
class BreathinessProfile:
    h1_h2_diff: float       # H1-H2: higher = more breathy
    h1_a1_diff: float       # H1-A1
    h1_a3_diff: float       # H1-A3: spectral tilt measure
    cpp: float              # Cepstral Peak Prominence
    hnr: float
    breathiness_index: float  # 0-1 composite
    classification: str       # "breathy", "modal", "pressed"


@dataclass
class CreakProfile:
    jitter_local: float
    jitter_rap: float
    shimmer_local: float
    shimmer_apq3: float
    subharmonic_ratio: float
    creak_index: float        # 0-1 composite
    has_vocal_fry: bool


@dataclass
class NasalityProfile:
    a1_p0_diff: float       # A1-P0: nasal coupling (clip-average proxy from bw_f1)
    bandwidth_f1: float     # clip-mean F1 bandwidth (wider = more nasal)
    nasality_index: float   # 0-1 composite (clip-level)
    nasal_segments_detected: int       # count of contiguous nasal frame runs >=30ms
    nasal_frame_fraction: float = 0.0  # nasal frames / voiced frames, 0-1
    voiced_frames: int = 0             # total voiced frames analyzed
    nasal_frames: int = 0              # voiced frames classified as nasalized
    nasal_segments: list[dict[str, float]] = field(default_factory=list)  # [{start,end,dur}]


@dataclass
class VocalRegister:
    register: str           # "chest", "head", "mixed", "falsetto", "vocal_fry"
    f0_range: tuple[float, float]
    intensity_range: tuple[float, float]
    register_breaks: int


@dataclass
class VoiceQualityProfile:
    breathiness: BreathinessProfile
    creakiness: CreakProfile
    nasality: NasalityProfile
    register: VocalRegister
    spectral_tilt: float
    long_term_spectrum: list[float]
    overall_quality_score: float  # 0-100
    clinical_flags: list[str]
    # Mirrors formant tracking_ok so the layman card can hide all
    # voice-quality metrics in one check (without having to read the
    # raw parselmouth.formants block, which the gateway does not persist
    # into attempt.acoustic).
    tracking_ok: bool = True
    tracking_reason: str = ""


def detect_nasal_segments(
    audio_path: str | None,
    max_formant: float = 5500.0,
    frame_step: float = 0.01,
    window_length: float = 0.025,
    f0_min: float = 60.0,
    bw_f1_thresh: float = 250.0,
    nasal_band: tuple[float, float] = (200.0, 400.0),
    ratio_thresh: float = 0.8,
    min_segment_s: float = 0.03,
) -> dict[str, Any]:
    """Frame-level nasal-vowel detector.

    For each voiced frame:
      - measure per-frame F1 bandwidth via parselmouth Burg formants,
      - FFT the 25 ms window and take energy in the nasal-pole band (200-400 Hz)
        vs energy in the F1 band (F1 +/- 100 Hz),
      - classify as nasalized iff bandwidth_f1 > bw_f1_thresh AND
        nasal-band / F1-band energy ratio > ratio_thresh.

    Contiguous nasal frames are grouped into segments with a minimum duration of
    min_segment_s. Returns counts, per-segment timings, and the nasal-frame
    fraction relative to voiced frames.
    """
    default = {
        "nasal_segments_detected": 0,
        "nasal_frame_fraction": 0.0,
        "voiced_frames": 0,
        "nasal_frames": 0,
        "nasal_segments": [],
    }
    if not audio_path:
        return default
    try:
        import parselmouth  # type: ignore
    except Exception:
        return default
    try:
        snd = parselmouth.Sound(str(audio_path))
    except Exception:
        return default

    y = np.asarray(snd.values).astype(np.float64)
    if y.ndim > 1:
        y = y[0]
    sr = float(snd.sampling_frequency)
    if sr <= 0 or len(y) < int(window_length * sr):
        return default

    try:
        pitch = snd.to_pitch(time_step=frame_step, pitch_floor=f0_min, pitch_ceiling=600.0)
        formant = snd.to_formant_burg(
            time_step=frame_step, max_number_of_formants=5,
            maximum_formant=max_formant, window_length=window_length,
            pre_emphasis_from=50.0,
        )
    except Exception:
        return default

    win_len = int(window_length * sr)
    hop = int(frame_step * sr)
    if win_len <= 8 or hop <= 0:
        return default
    window = np.hanning(win_len)
    freqs = np.fft.rfftfreq(win_len, 1.0 / sr)
    nasal_mask = (freqs >= nasal_band[0]) & (freqs <= nasal_band[1])

    voiced_frames = 0
    nasal_frames = 0
    classifications: list[int] = []
    t_centers: list[float] = []

    half = win_len // 2
    for center_sample in range(half, len(y) - half, hop):
        t = center_sample / sr
        t_centers.append(t)
        try:
            f0 = pitch.get_value_at_time(t)
        except Exception:
            f0 = None
        if not f0 or np.isnan(f0) or f0 < f0_min:
            classifications.append(0)
            continue
        try:
            f1 = formant.get_value_at_time(1, t)
            bw1 = formant.get_bandwidth_at_time(1, t)
        except Exception:
            classifications.append(0)
            continue
        if f1 is None or bw1 is None or np.isnan(f1) or np.isnan(bw1) or f1 <= 0:
            classifications.append(0)
            continue
        voiced_frames += 1

        frame = y[center_sample - half : center_sample + half] * window
        spec = np.abs(np.fft.rfft(frame))
        e_nasal = float(np.sum(spec[nasal_mask] ** 2))
        f1_lo = max(f1 - 100.0, max(nasal_band[1] + 50.0, 450.0))
        f1_hi = f1 + 100.0
        f1_m = (freqs >= f1_lo) & (freqs <= f1_hi)
        e_f1 = float(np.sum(spec[f1_m] ** 2)) + 1e-12
        ratio = e_nasal / e_f1

        is_nasal = bw1 > bw_f1_thresh and ratio > ratio_thresh
        if is_nasal:
            nasal_frames += 1
            classifications.append(1)
        else:
            classifications.append(0)

    if not classifications or voiced_frames == 0:
        return default

    segments: list[dict[str, float]] = []
    start_idx: int | None = None
    for i, c in enumerate(classifications):
        if c == 1 and start_idx is None:
            start_idx = i
        elif c == 0 and start_idx is not None:
            dur = (i - start_idx) * frame_step
            if dur >= min_segment_s:
                segments.append({
                    "start": round(t_centers[start_idx], 3),
                    "end": round(t_centers[i], 3),
                    "duration_s": round(dur, 3),
                })
            start_idx = None
    if start_idx is not None:
        dur = (len(classifications) - start_idx) * frame_step
        if dur >= min_segment_s:
            segments.append({
                "start": round(t_centers[start_idx], 3),
                "end": round(t_centers[-1], 3),
                "duration_s": round(dur, 3),
            })

    return {
        "nasal_segments_detected": len(segments),
        "nasal_frame_fraction": round(nasal_frames / voiced_frames, 4),
        "voiced_frames": voiced_frames,
        "nasal_frames": nasal_frames,
        "nasal_segments": segments,
    }


def _compute_spectral_harmonics(
    formant_data: dict[str, Any],
    voice_quality_data: dict[str, Any],
) -> dict[str, float]:
    """Approximate harmonic measures from available data."""
    # These are approximations; clinical use would need direct spectral analysis
    hnr = voice_quality_data.get("hnr", 0)
    spectral_tilt = voice_quality_data.get("spectral_tilt", 0)

    # H1-H2 approximated from spectral tilt
    h1_h2 = spectral_tilt * 0.7 if spectral_tilt > 0 else 0
    h1_a1 = spectral_tilt * 0.5
    h1_a3 = spectral_tilt * 1.2

    # A1-P0 for nasality (approximated from F1 bandwidth)
    bw_f1 = formant_data.get("bandwidth_f1", 80)
    a1_p0 = max(0, bw_f1 - 80) / 10  # normalized deviation from typical

    return {
        "h1_h2": h1_h2,
        "h1_a1": h1_a1,
        "h1_a3": h1_a3,
        "a1_p0": a1_p0,
    }


def profile_voice_quality(
    formant_data: dict[str, Any],
    pitch_data: dict[str, Any],
    voice_quality_data: dict[str, Any],
    librosa_features: dict[str, Any],
    audio_path: str | None = None,
) -> VoiceQualityProfile:
    """Comprehensive voice quality profiling."""
    harmonics = _compute_spectral_harmonics(formant_data, voice_quality_data)

    hnr = voice_quality_data.get("hnr", 0)
    cpp = voice_quality_data.get("cpp", 0)
    jitter = voice_quality_data.get("jitter_local", 0)
    jitter_rap = voice_quality_data.get("jitter_rap", 0)
    shimmer = voice_quality_data.get("shimmer_local", 0)
    shimmer_apq3 = voice_quality_data.get("shimmer_apq3", 0)
    spectral_tilt = voice_quality_data.get("spectral_tilt", 0)

    # --- Breathiness ---
    breathiness_idx = 0.0
    if harmonics["h1_h2"] > 5:
        breathiness_idx += 0.3
    if hnr < 10:
        breathiness_idx += 0.3
    if cpp < 5:
        breathiness_idx += 0.2
    if spectral_tilt > 10:
        breathiness_idx += 0.2
    breathiness_idx = min(1.0, breathiness_idx)

    if breathiness_idx > 0.6:
        breath_class = "breathy"
    elif breathiness_idx < 0.2:
        breath_class = "pressed"
    else:
        breath_class = "modal"

    breathiness = BreathinessProfile(
        h1_h2_diff=round(harmonics["h1_h2"], 2),
        h1_a1_diff=round(harmonics["h1_a1"], 2),
        h1_a3_diff=round(harmonics["h1_a3"], 2),
        cpp=round(cpp, 2),
        hnr=round(hnr, 2),
        breathiness_index=round(breathiness_idx, 4),
        classification=breath_class,
    )

    # --- Creakiness ---
    creak_idx = 0.0
    if jitter > 0.02:
        creak_idx += 0.3
    if shimmer > 0.1:
        creak_idx += 0.2
    if jitter_rap > 0.01:
        creak_idx += 0.2

    # Subharmonic ratio approximation
    subharmonic = jitter * 10  # rough proxy
    creak_idx = min(1.0, creak_idx + subharmonic * 0.1)
    has_fry = creak_idx > 0.5 and pitch_data.get("min_f0", 100) < 80

    creakiness = CreakProfile(
        jitter_local=round(jitter, 6),
        jitter_rap=round(jitter_rap, 6),
        shimmer_local=round(shimmer, 6),
        shimmer_apq3=round(shimmer_apq3, 6),
        subharmonic_ratio=round(subharmonic, 4),
        creak_index=round(creak_idx, 4),
        has_vocal_fry=has_fry,
    )

    # --- Nasality ---
    # Old formula was (mean_bw_f1 - 80) / 200, which saturated at 1.0 on
    # most real recordings because mean F1 bandwidth across a whole clip
    # (silences, fricatives, burg outliers included) is routinely
    # 200-500 Hz — well above the nasal-vowel range. Three of four
    # 2026-05-08 eval clips reported 100 % nasality as a result.
    #
    # Honest signal: nasal_frame_fraction comes from a frame-level
    # detector (detect_nasal_segments) that checks each voiced frame's
    # F1 bandwidth AND the energy ratio in the 250-450 Hz nasal band.
    # That fraction directly answers "what share of voiced speech was
    # nasalised", which is exactly what the layman card reports.
    seg_info = detect_nasal_segments(audio_path)
    bw_f1 = formant_data.get("bandwidth_f1", 80)
    formant_tracking_ok = bool(formant_data.get("tracking_ok", True))
    if not formant_tracking_ok:
        # Without a usable formant trajectory we can't trust the frame-
        # level nasal classifier either (it consults F1 bandwidth per
        # frame). Surface 0.0 with a marker so downstream layers and the
        # client can hide the metric instead of inventing a number.
        nasality_idx = 0.0
    else:
        nasality_idx = float(seg_info["nasal_frame_fraction"])
        # Hard cap a hair below 1.0 — even strongly nasal Indian English
        # clips rarely exceed 60 % nasal frames; anything ≥ 0.95 almost
        # always indicates classifier saturation rather than real
        # pathology.
        if nasality_idx > 0.95:
            nasality_idx = 0.95
    nasality = NasalityProfile(
        a1_p0_diff=round(harmonics["a1_p0"], 2),
        bandwidth_f1=round(bw_f1, 2),
        nasality_index=round(nasality_idx, 4),
        nasal_segments_detected=int(seg_info["nasal_segments_detected"]),
        nasal_frame_fraction=float(seg_info["nasal_frame_fraction"]),
        voiced_frames=int(seg_info["voiced_frames"]),
        nasal_frames=int(seg_info["nasal_frames"]),
        nasal_segments=list(seg_info["nasal_segments"]),
    )

    # --- Vocal Register ---
    mean_f0 = pitch_data.get("mean_f0", 150)
    min_f0 = pitch_data.get("min_f0", 75)
    max_f0 = pitch_data.get("max_f0", 300)
    mean_int = voice_quality_data.get("mean_intensity", 60)
    int_std = voice_quality_data.get("intensity_std", 5)

    if has_fry:
        reg = "vocal_fry"
    elif mean_f0 > 400:
        reg = "falsetto"
    elif mean_f0 > 250:
        reg = "head"
    elif mean_f0 > 150:
        reg = "mixed"
    else:
        reg = "chest"

    register = VocalRegister(
        register=reg,
        f0_range=(round(min_f0, 1), round(max_f0, 1)),
        intensity_range=(round(mean_int - int_std, 1), round(mean_int + int_std, 1)),
        register_breaks=0,
    )

    # --- Long-term spectrum (from librosa spectral contrast) ---
    lts = librosa_features.get("spectral_contrast_mean", [])

    # --- Overall quality score ---
    flags: list[str] = []
    score = 70.0

    if hnr > 15:
        score += 10
    elif hnr < 7:
        score -= 15
        flags.append("low HNR — possible pathology or noise")

    if jitter > 0.02:
        score -= 10
        flags.append("elevated jitter")
    if shimmer > 0.1:
        score -= 10
        flags.append("elevated shimmer")
    if breathiness_idx > 0.7:
        score -= 5
        flags.append("significant breathiness")
    if creak_idx > 0.6:
        score -= 5
        flags.append("significant creakiness/vocal fry")
    if nasality_idx > 0.5:
        flags.append("elevated nasality")

    score = min(100.0, max(0.0, score))

    return VoiceQualityProfile(
        breathiness=breathiness,
        creakiness=creakiness,
        nasality=nasality,
        register=register,
        spectral_tilt=round(spectral_tilt, 2),
        long_term_spectrum=[round(v, 2) for v in lts],
        overall_quality_score=round(score, 2),
        clinical_flags=flags,
        tracking_ok=bool(formant_data.get("tracking_ok", True)),
        tracking_reason=str(formant_data.get("tracking_reason", "")),
    )
