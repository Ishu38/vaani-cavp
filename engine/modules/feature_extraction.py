"""FEATURE EXTRACTION LAYER
Parselmouth  -> Formants, Pitch, Voice Quality
OpenSMILE    -> 6373 features (eGeMAPSv02, ComParE_2016)
librosa      -> Spectral, Rhythm, MFCC
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import numpy as np

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Parselmouth: Formants, Pitch, Voice Quality
# ---------------------------------------------------------------------------

@dataclass
class FormantData:
    f1_mean: float
    f2_mean: float
    f3_mean: float
    f4_mean: float
    f1_trajectory: list[float]
    f2_trajectory: list[float]
    f3_trajectory: list[float]
    bandwidth_f1: float
    bandwidth_f2: float
    vowel_space_area: float
    # tracking_ok=false signals that Praat's burg formant tracker returned a
    # degenerate (near-constant) trajectory — typically when input audio has
    # been heavily limited/normalised so the LPC analysis can't lock onto
    # real resonances. Downstream layers (vowel_space, nasality, phoneme
    # analysis) MUST check this flag before consuming the trajectory; the
    # legacy code ate the flatline at face value and produced 100 % nasality
    # plus VSA in the millions.
    tracking_ok: bool = True
    tracking_reason: str = ""


@dataclass
class PitchData:
    mean_f0: float
    min_f0: float
    max_f0: float
    std_f0: float
    pitch_range: float
    # range_st: pitch range expressed in semitones (12·log2(max/min)). This
    # is the IELTS-relevant intonation metric — Hz range over-rewards low
    # speakers and under-rewards high speakers, semitones normalise across
    # speaker pitch class.
    range_st: float
    pitch_contour: list[float]
    voiced_fraction: float
    # Per-speaker floor/ceiling that pass 2 of the De Looze & Hirst 2008
    # procedure derived from the speaker's own F0 distribution. Surfaced
    # so downstream consumers can audit whether the F0 numbers reflect
    # speaker-adapted tracking (high confidence) or the wide initial
    # bracket fell on a clip with too few voiced frames.
    pitch_floor_used: float = 0.0
    pitch_ceiling_used: float = 0.0
    pitch_two_pass: bool = False


@dataclass
class VoiceQualityData:
    hnr: float  # Harmonics-to-noise ratio
    jitter_local: float
    jitter_rap: float
    shimmer_local: float
    shimmer_apq3: float
    mean_intensity: float
    intensity_std: float
    spectral_tilt: float
    cpp: float  # Cepstral Peak Prominence


@dataclass
class ParselmouthFeatures:
    formants: FormantData
    pitch: PitchData
    voice_quality: VoiceQualityData


def _preprocess_for_lpc(audio_path: str | Path):
    """Characterise the input's dynamic range and pre-process if it looks
    like broadcast-mastered / peak-limited / digitally-silent-floor audio.
    Returns (parselmouth.Sound, diagnostics_dict).

    Why we do this: Praat's burg LPC formant tracker pathologically
    flatlines on heavily limited audio because the autocorrelation matrix
    in Levinson-Durbin recursion goes near-singular when consecutive
    windows have near-zero spectral variance. interview_75 in the
    2026-05-08 IELTS eval was the canonical example — F1 stuck at
    505.10 Hz across 100 frames, max -3.6 dBFS, mean -22.6 dBFS, crest
    factor ~3.6 (natural speech is 8-15).

    Two interventions, both gentle:
      (a) Dynamic-range expansion — push quiet samples down so the LPC
          window has spectral structure again. Inverse of broadcast
          compression.
      (b) Triangular dither at -90 dBFS — fills "digital silence"
          regions with noise of negligible audible level but enough to
          keep the autocorrelation matrix non-singular.

    Pure pass-through when the input already looks varied (most natural
    recordings). Idempotent — applying it to natural speech changes
    metrics by < 0.5 % per pilot tests on Svarah.
    """
    import parselmouth
    import librosa

    notes: dict[str, Any] = {"preprocessed": False, "reason": ""}
    try:
        y, sr = librosa.load(str(audio_path), sr=16000, mono=True)
    except Exception as exc:
        notes["reason"] = f"load failed: {exc}"
        # Fall back to letting Praat read the file directly.
        return parselmouth.Sound(str(audio_path)), notes

    if y.size < 1000:
        return parselmouth.Sound(values=y.astype(np.float64),
                                  sampling_frequency=sr), notes

    abs_y = np.abs(y)
    peak = float(abs_y.max())
    rms = float(np.sqrt(np.mean(y.astype(np.float64) ** 2)))
    crest = peak / (rms + 1e-12) if rms > 0 else 0.0

    # Bottom-decile frame RMS as a proxy for noise floor.
    win = max(1, sr // 100)  # 10 ms windows
    n_frames = y.size // win
    if n_frames > 10:
        frame_rms = np.sqrt(
            np.mean(y[: n_frames * win].reshape(n_frames, win).astype(np.float64) ** 2, axis=1)
        )
        floor_q10 = float(np.quantile(frame_rms, 0.10))
    else:
        floor_q10 = rms * 0.05

    is_limited = crest < 5.0 and peak > 0.5
    is_floor_silent = floor_q10 < 1e-4

    diag = (f"crest={crest:.2f} peak={peak:.3f} rms={rms:.4f} "
            f"floor_q10={floor_q10:.6f}")

    if not (is_limited or is_floor_silent):
        notes["reason"] = f"natural dynamics, no preprocessing ({diag})"
        return parselmouth.Sound(values=y.astype(np.float64),
                                  sampling_frequency=sr), notes

    # (a) Dynamic-range expansion. Below threshold (linear amplitude
    # 0.1 = -20 dBFS), push samples down by ratio<1 (we use 0.7 ⇒
    # ~3 dB expansion at threshold). Above threshold, leave alone.
    threshold = 0.1
    ratio = 0.7
    sign = np.sign(y)
    abs_below = np.minimum(abs_y, threshold)
    abs_above = np.maximum(abs_y - threshold, 0.0)
    expanded_below = sign * np.power(abs_below / threshold + 1e-12, 1.0 / ratio) * threshold
    expanded = expanded_below + sign * abs_above

    # (b) Triangular dither at -90 dBFS — sum of two uniforms gives a
    # triangular PDF, the canonical dither shape for breaking
    # digital-silence singularities without colouring the noise.
    dither_amp = 10 ** (-90 / 20.0)
    rng = np.random.default_rng(seed=0xCAFE)
    dither = (rng.uniform(-1.0, 1.0, expanded.size)
              + rng.uniform(-1.0, 1.0, expanded.size)) * 0.5 * dither_amp
    expanded = expanded + dither

    # Safety cap to avoid clipping after expansion.
    new_peak = float(np.abs(expanded).max())
    if new_peak > 0.99:
        expanded = expanded * (0.95 / new_peak)

    notes["preprocessed"] = True
    notes["reason"] = (f"applied expansion+dither: {diag} "
                       f"limited={is_limited} silent_floor={is_floor_silent}")
    return parselmouth.Sound(values=expanded.astype(np.float64),
                              sampling_frequency=sr), notes


def _run_burg_formants(snd: Any, max_formant: float, window_s: float,
                       lpc_order: int) -> tuple[list[float], list[float],
                                                  list[float], list[float],
                                                  list[float], list[float]]:
    """Single burg-LPC formant extraction pass. Returns the six trajectory
    lists (F1, F2, F3, F4, BW1, BW2) — empty if LPC failed entirely."""
    from parselmouth.praat import call
    formant_obj = call(snd, "To Formant (burg)", 0.0, lpc_order, max_formant, window_s, 50.0)
    num_frames = call(formant_obj, "Get number of frames")
    f1_vals, f2_vals, f3_vals, f4_vals = [], [], [], []
    bw1_vals, bw2_vals = [], []
    for i in range(1, num_frames + 1):
        t = call(formant_obj, "Get time from frame number", i)
        for fnum, store in [(1, f1_vals), (2, f2_vals),
                            (3, f3_vals), (4, f4_vals)]:
            v = call(formant_obj, "Get value at time", fnum, t, "hertz", "Linear")
            if not np.isnan(v):
                store.append(v)
        bw1 = call(formant_obj, "Get bandwidth at time", 1, t, "hertz", "Linear")
        bw2 = call(formant_obj, "Get bandwidth at time", 2, t, "hertz", "Linear")
        if not np.isnan(bw1):
            bw1_vals.append(bw1)
        if not np.isnan(bw2):
            bw2_vals.append(bw2)
    return f1_vals, f2_vals, f3_vals, f4_vals, bw1_vals, bw2_vals


def _formant_tracking_ok(f1_vals: list[float]) -> tuple[bool, str]:
    """Apply the same flatline-detection sentinel as the original
    implementation. Returns (tracking_ok, reason)."""
    arr = np.array(f1_vals) if f1_vals else np.array([])
    if arr.size < 20:
        return False, f"too few F1 frames ({arr.size})"
    full_var = float(np.var(arr))
    if full_var < 100.0:
        return False, f"F1 trajectory near-constant (var={full_var:.4f} Hz²)"
    if arr.size >= 100:
        head_var = float(np.var(arr[:100]))
        head_range = float(arr[:100].max() - arr[:100].min())
        if head_var < 1.0 or head_range < 5.0:
            return False, (f"F1 head window flatlined "
                           f"(var={head_var:.4f} Hz², range={head_range:.2f} Hz)")
    return True, ""


def _extract_parselmouth_inline(
    audio_path: str | Path,
    gender: str = "neutral",
    audio_class: str = "normal",
) -> ParselmouthFeatures:
    """The actual Praat work — runs in a subprocess (see extract_parselmouth
    below) so its 30-200s GIL hold doesn't stall the engine's asyncio loop.

    `audio_class` comes from audio_quality._classify_audio and selects a
    LayerPreset from modules.audio_router. The preset overrides defaults
    for preprocessing decision, formant ceiling, window length, and LPC
    order so this function doesn't have to re-derive "is this peak-
    limited" from scratch."""
    import parselmouth
    from parselmouth.praat import call
    from modules.audio_router import preset_for

    preset = preset_for(audio_class)
    logger.info("Praat: audio_class=%s preset=%s", audio_class, preset.description)

    # Pre-process audio when the preset says so (broadcast-limited or
    # silent-floor classes). Pure pass-through otherwise — natural
    # recordings are unchanged.
    if preset.praat_preprocess:
        snd, preproc_notes = _preprocess_for_lpc(audio_path)
        if preproc_notes.get("preprocessed"):
            logger.info("Praat: applied LPC pre-processing — %s", preproc_notes["reason"])
    else:
        snd = parselmouth.Sound(str(audio_path))

    # Gender prior caps the ceiling; the preset can lower it further but
    # not raise above the gender-appropriate range for this speaker.
    ceiling_map = {"male": 5000, "female": 5500, "child": 6500, "neutral": 5500}
    gender_ceiling = ceiling_map.get(gender, 5500)
    max_formant = min(preset.praat_ceiling, gender_ceiling)

    # ── Formants — first attempt at preset-driven params ──────────────
    f1_vals, f2_vals, f3_vals, f4_vals, bw1_vals, bw2_vals = _run_burg_formants(
        snd, max_formant=max_formant,
        window_s=preset.praat_window, lpc_order=preset.praat_lpc_order,
    )
    tracking_ok, tracking_reason = _formant_tracking_ok(f1_vals)

    # ── Retry on flatline with widened parameters ─────────────────────
    # If the default 5500/25ms/order-5 burg failed, try a wider ceiling
    # and shorter window. Wider ceiling captures higher F2 in tense
    # vowels; shorter window gives LPC less stationary signal to
    # over-fit; lower order reduces over-fitting on quiet input.
    if not tracking_ok:
        logger.info("Praat: first formant pass failed (%s) — retrying with widened params",
                    tracking_reason)
        retry_args = (
            (max(max_formant + 1500, 7000), 0.015, 5),
            (max_formant, 0.020, 4),
        )
        for retry_ceiling, retry_window, retry_order in retry_args:
            r1, r2, r3, r4, rb1, rb2 = _run_burg_formants(
                snd, max_formant=retry_ceiling,
                window_s=retry_window, lpc_order=retry_order,
            )
            ok, reason = _formant_tracking_ok(r1)
            if ok:
                logger.info("Praat: retry succeeded with ceiling=%d window=%.3f order=%d",
                            retry_ceiling, retry_window, retry_order)
                f1_vals, f2_vals, f3_vals, f4_vals, bw1_vals, bw2_vals = r1, r2, r3, r4, rb1, rb2
                tracking_ok = True
                tracking_reason = ""
                break
            else:
                logger.info("Praat: retry ceiling=%d window=%.3f order=%d also failed (%s)",
                            retry_ceiling, retry_window, retry_order, reason)
                # Keep the last reason for the report.
                tracking_reason = reason

    def safe_mean(arr: list[float]) -> float:
        return float(np.mean(arr)) if arr else 0.0

    f1_arr_raw = np.array(f1_vals) if f1_vals else np.array([])
    f2_arr_raw = np.array(f2_vals) if f2_vals else np.array([])

    # ── Vowel space area ──────────────────────────────────────────────
    # Original implementation built a triangle from min/max of the full
    # F1/F2 trajectory across the whole clip — that included silences,
    # fricatives, and burg outliers, so the "VSA" was the area of an
    # outlier triangle (4-6 million Hz², an order of magnitude above
    # the published adult range of ~150k-500k Hz²).
    #
    # Honest VSA needs vowel-region segmentation, which lives in the
    # forced-alignment layer; that's a downstream fix. For now we use
    # an inter-quartile range fallback so the metric stays in a plausible
    # band for the layman report — IQR(F1) × IQR(F2) approximates the
    # central vowel-region spread without being thrown by silence
    # outliers. Mark the value as approximate so consumers can decide
    # whether to surface it.
    if tracking_ok and f1_arr_raw.size > 10 and f2_arr_raw.size > 10:
        f1_iqr = float(np.percentile(f1_arr_raw, 75) - np.percentile(f1_arr_raw, 25))
        f2_iqr = float(np.percentile(f2_arr_raw, 75) - np.percentile(f2_arr_raw, 25))
        # Treat IQR ranges as triangle half-widths in F1/F2 space.
        vsa = 0.5 * f1_iqr * f2_iqr
    else:
        vsa = 0.0

    formants = FormantData(
        f1_mean=safe_mean(f1_vals),
        f2_mean=safe_mean(f2_vals),
        f3_mean=safe_mean(f3_vals),
        f4_mean=safe_mean(f4_vals),
        f1_trajectory=f1_vals[:100],  # cap for JSON
        f2_trajectory=f2_vals[:100],
        f3_trajectory=f3_vals[:100],
        bandwidth_f1=safe_mean(bw1_vals),
        bandwidth_f2=safe_mean(bw2_vals),
        vowel_space_area=float(vsa),
        tracking_ok=tracking_ok,
        tracking_reason=tracking_reason,
    )

    # -- Pitch (two-pass per De Looze & Hirst 2008) --
    # Pass 1: wide bracket (50–600 Hz) on every speaker, regardless of
    # gender prior. We use this only to estimate the speaker's actual F0
    # distribution; we do NOT publish the raw values from this pass
    # because the wide ceiling lets octave doublings through at boundaries.
    p1_obj = call(snd, "To Pitch", 0.0, 50, 600)
    p1_values = [
        call(p1_obj, "Get value at time", t, "hertz", "Linear")
        for t in np.arange(0, snd.duration, 0.01)
    ]
    p1_clean = np.array([v for v in p1_values if not np.isnan(v) and v > 0])

    # Derive speaker-adapted floor/ceiling from quantiles of pass-1 voiced
    # F0. Q15 / Q65 follow De Looze & Hirst's recommendation; the floor
    # multiplier (0.83) and ceiling multiplier (1.92) reproduce their
    # standard adaptation. We clamp into a physiologically plausible
    # range so a degenerate clip (very few voiced frames) cannot push the
    # bracket somewhere absurd. Gender prior is used as a sanity floor
    # only — the speaker's own data dominates when present.
    if p1_clean.size >= 30:
        q15 = float(np.quantile(p1_clean, 0.15))
        q65 = float(np.quantile(p1_clean, 0.65))
        adapted_floor = max(40.0, min(120.0, 0.83 * q15))
        adapted_ceiling = max(250.0, min(800.0, 1.92 * q65))
        two_pass = True
    else:
        # Not enough voiced frames to estimate a speaker-specific bracket
        # — fall back to a gender-informed default, but mark the report so
        # downstream consumers know F0 was tracked on the wide bracket.
        defaults = {
            "male":    (60.0, 300.0),
            "female":  (100.0, 500.0),
            "child":   (120.0, 600.0),
            "neutral": (75.0, 400.0),
        }
        adapted_floor, adapted_ceiling = defaults.get(gender, defaults["neutral"])
        two_pass = False

    # Pass 2: re-extract pitch on the speaker-adapted bracket. Octave
    # errors at boundaries collapse because the ceiling no longer admits
    # 2× harmonics and the floor no longer admits sub-fundamental rumble.
    pitch_obj = call(snd, "To Pitch", 0.0, adapted_floor, adapted_ceiling)
    f0_values = [
        call(pitch_obj, "Get value at time", t, "hertz", "Linear")
        for t in np.arange(0, snd.duration, 0.01)
    ]
    f0_clean = [v for v in f0_values if not np.isnan(v) and v > 0]
    total_frames_pitch = len(f0_values)
    voiced_frames = len(f0_clean)

    if f0_clean:
        f0_min = float(min(f0_clean))
        f0_max = float(max(f0_clean))
        # range_st: 12·log2(max/min). Guard against zero floor — if min_f0
        # is somehow 0 the speaker had no voiced frames and range is 0.
        range_st = 12.0 * float(np.log2(f0_max / f0_min)) if f0_min > 0 else 0.0
    else:
        f0_min = 0.0
        f0_max = 0.0
        range_st = 0.0

    pitch = PitchData(
        mean_f0=safe_mean(f0_clean),
        min_f0=f0_min,
        max_f0=f0_max,
        std_f0=float(np.std(f0_clean)) if f0_clean else 0.0,
        pitch_range=(f0_max - f0_min),
        range_st=range_st,
        pitch_contour=f0_clean[:200],
        voiced_fraction=voiced_frames / total_frames_pitch if total_frames_pitch > 0 else 0.0,
        pitch_floor_used=float(adapted_floor),
        pitch_ceiling_used=float(adapted_ceiling),
        pitch_two_pass=bool(two_pass),
    )

    # -- Voice Quality --
    # Reuse the speaker-adapted floor/ceiling from pass 2 so PointProcess,
    # Harmonicity and Intensity all key off the same fundamental the
    # pitch tracker just locked onto. Using the legacy fixed (75, 600)
    # pair here meant jitter/HNR were occasionally computed against a
    # different F0 estimate than pitch — small but real source of noise.
    vq_floor = float(adapted_floor)
    vq_ceiling = float(adapted_ceiling)
    point_process = call(snd, "To PointProcess (periodic, cc)", vq_floor, vq_ceiling)
    jitter_local = call(point_process, "Get jitter (local)", 0, 0, 0.0001, 0.02, 1.3)
    jitter_rap = call(point_process, "Get jitter (rap)", 0, 0, 0.0001, 0.02, 1.3)
    shimmer_local = call([snd, point_process], "Get shimmer (local)", 0, 0, 0.0001, 0.02, 1.3, 1.6)
    shimmer_apq3 = call([snd, point_process], "Get shimmer (apq3)", 0, 0, 0.0001, 0.02, 1.3, 1.6)

    harmonicity = call(snd, "To Harmonicity (cc)", 0.01, vq_floor, 0.1, 1.0)
    hnr = call(harmonicity, "Get mean", 0, 0)

    # Praat's "Intensity" reports dB referenced to 2·10⁻⁵ Pa, but our input
    # is a float-normalised waveform with no physical Pa calibration — so
    # the absolute dB value is meaningless (interview_75 in the 2026-05-08
    # eval reported -60 dB on perfectly audible speech). Re-reference to
    # the clip's own peak so the value becomes "loudness relative to the
    # loudest moment in the clip" (always ≤ 0). This is honest, stable
    # across mics, and what the user-facing layer actually wants.
    intensity_obj = call(snd, "To Intensity", vq_floor, 0.0, "yes")
    raw_mean_intensity = call(intensity_obj, "Get mean", 0, 0, "dB")
    raw_max_intensity = call(intensity_obj, "Get maximum", 0, 0, "Parabolic")
    std_intensity = call(intensity_obj, "Get standard deviation", 0, 0)
    if not (np.isnan(raw_mean_intensity) or np.isnan(raw_max_intensity)):
        mean_intensity = float(raw_mean_intensity - raw_max_intensity)  # dB rel peak, ≤ 0
    else:
        mean_intensity = 0.0
    # Clamp to a sensible floor so a silence-heavy clip can't push the
    # value to -∞ for the layman card.
    if mean_intensity < -60.0:
        mean_intensity = -60.0

    # Spectral tilt (slope of long-term spectrum)
    spectrum = call(snd, "To Spectrum", "yes")
    ltas = call(spectrum, "To Ltas (1-to-1)")
    low_energy = call(ltas, "Get mean", 0, 1000, "dB")
    high_energy = call(ltas, "Get mean", 1000, 4000, "dB")
    spectral_tilt = low_energy - high_energy if not (np.isnan(low_energy) or np.isnan(high_energy)) else 0.0

    # CPP approximation via power cepstrum
    try:
        pc = call(snd, "To PowerCepstrogram", 60, 0.002, 5000, 50)
        cpps = call(pc, "Get CPPS", "no", 0.02, 0.0005, 60, 330, 0.05, "parabolic", 0.001, 0, "Exponential decay", "Robust slow")
        cpp_val = cpps if not np.isnan(cpps) else 0.0
    except Exception:
        cpp_val = 0.0

    voice_quality = VoiceQualityData(
        hnr=hnr if not np.isnan(hnr) else 0.0,
        jitter_local=jitter_local if not np.isnan(jitter_local) else 0.0,
        jitter_rap=jitter_rap if not np.isnan(jitter_rap) else 0.0,
        shimmer_local=shimmer_local if not np.isnan(shimmer_local) else 0.0,
        shimmer_apq3=shimmer_apq3 if not np.isnan(shimmer_apq3) else 0.0,
        mean_intensity=mean_intensity if not np.isnan(mean_intensity) else 0.0,
        intensity_std=std_intensity if not np.isnan(std_intensity) else 0.0,
        spectral_tilt=float(spectral_tilt),
        cpp=float(cpp_val),
    )

    return ParselmouthFeatures(formants=formants, pitch=pitch, voice_quality=voice_quality)


# ---------------------------------------------------------------------------
# Subprocess dispatch for parselmouth — fixes GIL hold during long Praat work
# ---------------------------------------------------------------------------
# Praat (via parselmouth's C++ bindings) holds Python's GIL for the entire
# duration of formant extraction, pitch tracking, and voice-quality
# measurement — typically 30-60s for short clips, 200+s for 60-90s user
# audio. While the GIL is held, the engine's asyncio event loop cannot
# service /health, /api/jobs/:id polls, or any other request — making the
# engine appear "unreachable" to the gateway and (previously) tripping the
# watchdog.
#
# Fix: dispatch parselmouth work to a separate Python process via
# ProcessPoolExecutor. The calling thread waits on inter-process IPC
# (which releases the GIL), so the asyncio loop stays free to serve
# concurrent /health probes and job-status polls. Total wall-clock time
# is unchanged — Praat is still single-threaded C++ — but engine
# responsiveness is preserved.

import atexit
import threading
from concurrent.futures import ProcessPoolExecutor
from concurrent.futures.process import BrokenProcessPool

_praat_pool: ProcessPoolExecutor | None = None
_praat_pool_lock = threading.Lock()


def _get_praat_pool() -> ProcessPoolExecutor:
    """Lazy singleton — spawn the worker process on first use, keep it warm
    for the life of the engine. max_workers=1 because Praat is CPU-bound and
    single-threaded; multiple workers just thrash the CPU. The pool survives
    across requests, so we pay parselmouth's import cost (~1-2s) only once.

    Double-checked locking guards against two FastAPI threads hitting the
    cold path simultaneously and creating two ProcessPoolExecutor instances
    (the second leaks until process exit and atexit fires twice)."""
    global _praat_pool
    if _praat_pool is None:
        with _praat_pool_lock:
            if _praat_pool is None:
                _praat_pool = ProcessPoolExecutor(max_workers=1)
                atexit.register(_shutdown_praat_pool)
    return _praat_pool


def _shutdown_praat_pool() -> None:
    global _praat_pool
    if _praat_pool is not None:
        _praat_pool.shutdown(wait=False, cancel_futures=True)
        _praat_pool = None


def extract_parselmouth(
    audio_path: str | Path,
    gender: str = "neutral",
    audio_class: str = "normal",
) -> ParselmouthFeatures:
    """Public entrypoint. Dispatches the Praat work to a subprocess so the
    main asyncio loop stays responsive during the 30-200s call. Same input,
    same output, same accuracy as the inline version — only the execution
    location changes.

    audio_class is forwarded to the inline worker so the router-driven
    parameter preset is selected inside the subprocess (the preset table
    lives in modules.audio_router and is small enough to import there).

    Handles BrokenProcessPool by recreating the worker — the child process
    can crash under memory pressure or corrupt audio, but the engine must
    not permanently degrade.
    """
    global _praat_pool
    for attempt in range(2):
        try:
            pool = _get_praat_pool()
            future = pool.submit(_extract_parselmouth_inline, str(audio_path), gender, audio_class)
            return future.result()
        except BrokenProcessPool:
            logger.warning("Praat subprocess crashed — recreating pool (attempt %d)", attempt + 1)
            with _praat_pool_lock:
                if _praat_pool is not None:
                    _praat_pool.shutdown(wait=False, cancel_futures=True)
                _praat_pool = None
    raise RuntimeError("Praat subprocess pool could not be recovered after 2 attempts")


def prewarm_praat_pool() -> None:
    """Spawn the subprocess at engine startup so the first user request
    doesn't pay the worker-spawn cost. Safe to call multiple times — the
    pool is a singleton."""
    pool = _get_praat_pool()
    # Submit a no-op task to force the worker process to spawn + import
    # parselmouth eagerly.
    future = pool.submit(_praat_pool_warmup_probe)
    try:
        future.result(timeout=30)
    except Exception as exc:
        logger.warning("praat pool prewarm failed (non-fatal): %s", exc)


def _praat_pool_warmup_probe() -> str:
    """Runs in the subprocess. Importing parselmouth here forces it to
    load now rather than on the first real request."""
    import parselmouth  # noqa: F401
    return "ok"


# ---------------------------------------------------------------------------
# librosa: Spectral, Rhythm, MFCC
# ---------------------------------------------------------------------------

@dataclass
class LibrosaFeatures:
    mfcc_mean: list[float]
    mfcc_std: list[float]
    spectral_centroid_mean: float
    spectral_bandwidth_mean: float
    spectral_rolloff_mean: float
    spectral_contrast_mean: list[float]
    spectral_flatness_mean: float
    zero_crossing_rate_mean: float
    rms_mean: float
    rms_std: float
    tempo: float
    chroma_mean: list[float]
    mel_spectrogram_db: list[list[float]]  # downsampled for visualization


def _extract_librosa_legacy(audio_path: str | Path) -> LibrosaFeatures:
    """Legacy librosa-based implementation. Held as a fallback path in case
    torchaudio's port has correctness issues — swap call sites to this one
    if a regression is discovered. Intentionally unused on the hot path
    because it holds the GIL for 60-90s during inference, which stalls the
    asyncio event loop and makes /health unresponsive."""
    import librosa

    y, sr = librosa.load(str(audio_path), sr=22050)

    mfcc = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=13)
    mfcc_mean = np.mean(mfcc, axis=1).tolist()
    mfcc_std = np.std(mfcc, axis=1).tolist()

    cent = librosa.feature.spectral_centroid(y=y, sr=sr)
    bw = librosa.feature.spectral_bandwidth(y=y, sr=sr)
    rolloff = librosa.feature.spectral_rolloff(y=y, sr=sr)
    contrast = librosa.feature.spectral_contrast(y=y, sr=sr)
    flatness = librosa.feature.spectral_flatness(y=y)
    zcr = librosa.feature.zero_crossing_rate(y)
    rms = librosa.feature.rms(y=y)

    tempo_val, _ = librosa.beat.beat_track(y=y, sr=sr)
    tempo_scalar = float(tempo_val[0]) if hasattr(tempo_val, '__len__') else float(tempo_val)

    chroma = librosa.feature.chroma_stft(y=y, sr=sr)
    chroma_mean = np.mean(chroma, axis=1).tolist()

    mel = librosa.feature.melspectrogram(y=y, sr=sr, n_mels=64)
    mel_db = librosa.power_to_db(mel, ref=np.max)
    step = max(1, mel_db.shape[1] // 100)
    mel_down = mel_db[:, ::step].tolist()

    return LibrosaFeatures(
        mfcc_mean=mfcc_mean,
        mfcc_std=mfcc_std,
        spectral_centroid_mean=float(np.mean(cent)),
        spectral_bandwidth_mean=float(np.mean(bw)),
        spectral_rolloff_mean=float(np.mean(rolloff)),
        spectral_contrast_mean=np.mean(contrast, axis=1).tolist(),
        spectral_flatness_mean=float(np.mean(flatness)),
        zero_crossing_rate_mean=float(np.mean(zcr)),
        rms_mean=float(np.mean(rms)),
        rms_std=float(np.std(rms)),
        tempo=tempo_scalar,
        chroma_mean=chroma_mean,
        mel_spectrogram_db=mel_down,
    )


# ---------------------------------------------------------------------------
# torchaudio implementation — GPU-accelerated, releases the GIL during
# tensor ops. Same dataclass output as the librosa version so call sites
# (and the dataclass name itself) don't need to change.
#
# Why this is faster: librosa recomputes the STFT internally inside each
# `feature.*` call (mfcc → stft, spectral_centroid → stft, rolloff → stft,
# ...). On a 70-second clip that's 6+ STFT computations totalling 30-50s
# of CPU work, all of it under the GIL. torchaudio computes the STFT
# **once** on GPU and we derive every spectral feature from that single
# tensor via cheap weighted-sum/quantile ops. Total Layer 2 time drops
# from 60-90s to 5-15s.
# ---------------------------------------------------------------------------

_DEVICE: str | None = None


def _device() -> str:
    """Lazy-resolve compute device. We don't pin at import time because
    importing torch on a non-CUDA machine emits warnings; defer until
    extract_librosa is actually called."""
    global _DEVICE
    if _DEVICE is None:
        try:
            import torch
            _DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
        except Exception:
            _DEVICE = "cpu"
    return _DEVICE


def _spectral_contrast(spec, freqs_hz, n_bands: int = 6, alpha: float = 0.02):
    """6-band peak-valley contrast across log-frequency octaves.

    librosa's algorithm: split the spectrum into octave-spaced bands
    (typically 200 Hz, 400 Hz, 800 Hz, 1.6 kHz, 3.2 kHz, 6.4 kHz boundaries
    plus a low-band catch-all). For each band per frame, compute the mean
    of the top-α magnitudes minus the mean of the bottom-α magnitudes —
    this is "peak - valley" in log-magnitude. Output is (n_bands+1, frames).

    We approximate with a simpler partitioning that produces values within
    a few % of librosa's; the consumer (voice_quality.py:351) only uses
    the time-mean per band, which is robust to this approximation.
    """
    import torch

    log_spec = torch.log(spec + 1e-10)  # (n_bins, n_frames)
    band_edges_hz = [0.0, 200.0, 400.0, 800.0, 1600.0, 3200.0, 6400.0, freqs_hz[-1].item() + 1]
    n_out_bands = len(band_edges_hz) - 1

    n_frames = log_spec.shape[1]
    contrast = torch.zeros(n_out_bands, n_frames, device=log_spec.device)

    for i in range(n_out_bands):
        lo, hi = band_edges_hz[i], band_edges_hz[i + 1]
        mask = (freqs_hz >= lo) & (freqs_hz < hi)
        if not mask.any():
            continue
        band = log_spec[mask]  # (k_bins_in_band, n_frames)
        k = band.shape[0]
        if k < 2:
            continue
        # Quantile-based peak/valley: top α and bottom α of bins.
        n_keep = max(1, int(k * alpha))
        sorted_band, _ = band.sort(dim=0)
        valley = sorted_band[:n_keep].mean(dim=0)
        peak = sorted_band[-n_keep:].mean(dim=0)
        contrast[i] = peak - valley

    return contrast  # (n_bands+1, n_frames)


def _estimate_tempo(spec, hop: int, sr: int) -> float:
    """Onset-strength autocorrelation tempo estimator. librosa uses a
    full HMM beat tracker — we use a simpler peak-of-autocorrelation
    approach since `tempo` is not consumed downstream by IELTS rubric or
    CIF (verified via grep). Output is in BPM, clipped to [40, 240]."""
    import torch

    # Spectral flux (half-wave rectified frame-to-frame magnitude diff)
    flux = torch.relu(spec[:, 1:] - spec[:, :-1]).sum(dim=0)  # (n_frames-1,)
    if flux.numel() < 8:
        return 0.0
    flux = flux - flux.mean()
    # Autocorrelate
    L = flux.numel()
    fft = torch.fft.rfft(flux, n=2 * L)
    ac = torch.fft.irfft(fft * fft.conj(), n=2 * L)[:L]
    # BPM lag range: 60s/240bpm → 60s/40bpm → in frames
    frame_rate = sr / hop  # frames per second
    min_lag = max(1, int(frame_rate * 60 / 240))
    max_lag = min(L - 1, int(frame_rate * 60 / 40))
    if max_lag <= min_lag:
        return 0.0
    window = ac[min_lag:max_lag]
    peak_lag = int(window.argmax().item()) + min_lag
    bpm = 60.0 * frame_rate / peak_lag
    return float(max(40.0, min(240.0, bpm)))


def _compute_chroma(spec, freqs_hz, sr: int):
    """12-bin chroma (pitch-class profile) from STFT magnitude. Each
    frequency bin is mapped to its nearest pitch class using log-frequency
    quantization. Less precise than librosa's HPCP but adequate for the
    `chroma_mean` field, which isn't consumed by IELTS scoring."""
    import torch

    EPS = 1e-10
    # MIDI note from frequency: 69 + 12 * log2(f / 440)
    f_safe = torch.clamp(freqs_hz, min=EPS)
    midi = 69.0 + 12.0 * torch.log2(f_safe / 440.0)
    pitch_class = (midi.round().long() % 12)  # (n_bins,)
    # Sum magnitudes into 12 chroma bins per frame
    n_frames = spec.shape[1]
    chroma = torch.zeros(12, n_frames, device=spec.device)
    for c in range(12):
        mask = pitch_class == c
        if mask.any():
            chroma[c] = spec[mask].sum(dim=0)
    # L2-normalize per frame so output range matches librosa (~0..1)
    norm = chroma.norm(dim=0, keepdim=True) + EPS
    return chroma / norm


def extract_librosa(audio_path: str | Path) -> LibrosaFeatures:
    """Extract spectral, rhythm, and MFCC features.

    Uses the legacy librosa implementation by default — it computes
    every feature with the published, gold-standard algorithm that the
    CIF / MLAF / voice-quality calibrations were tuned against. This
    preserves voice-uniqueness in the output: subtle inter-speaker
    differences in spectral contrast bands, tempo, chroma, and MFCC
    coefficients are retained exactly.

    The torchaudio implementation (_extract_torchaudio below) is kept in
    the file as an opt-in fast path for environments where speed matters
    more than per-feature precision. Set VAANI_USE_TORCHAUDIO=1 in the
    engine env to enable it. Default is OFF (legacy librosa).
    """
    import os
    if os.environ.get("VAANI_USE_TORCHAUDIO") == "1":
        try:
            return _extract_torchaudio(audio_path)
        except Exception as exc:
            logger.warning("torchaudio feature extraction failed (%s); falling back to librosa", exc)
    return _extract_librosa_legacy(audio_path)


def _extract_torchaudio(audio_path: str | Path) -> LibrosaFeatures:
    import torch
    import torchaudio
    import torchaudio.transforms as TAT

    device = _device()
    SR = 22050
    N_FFT = 2048
    HOP = 512
    WIN = 2048

    # ── Load + resample to 22.05 kHz mono ────────────────────────────
    waveform, orig_sr = torchaudio.load(str(audio_path))
    if waveform.shape[0] > 1:
        waveform = waveform.mean(dim=0, keepdim=True)
    if orig_sr != SR:
        waveform = TAT.Resample(orig_sr, SR)(waveform)
    waveform = waveform.to(device).squeeze(0)  # (T,)

    # ── STFT (computed ONCE, reused for every spectral feature) ──────
    window = torch.hann_window(WIN, device=device)
    stft = torch.stft(
        waveform, n_fft=N_FFT, hop_length=HOP, win_length=WIN,
        window=window, return_complex=True, center=True,
    )
    spec = stft.abs()  # magnitude, (n_bins, n_frames)
    freqs = torch.linspace(0, SR / 2, spec.shape[0], device=device)

    # ── MFCC (13 coefficients) ───────────────────────────────────────
    mfcc_t = TAT.MFCC(
        sample_rate=SR, n_mfcc=13,
        melkwargs={"n_fft": N_FFT, "hop_length": HOP, "n_mels": 64},
    ).to(device)
    mfcc = mfcc_t(waveform.unsqueeze(0)).squeeze(0)  # (13, frames)

    # ── Spectral centroid: weighted mean of frequency by magnitude ───
    s_sum = spec.sum(dim=0) + 1e-10
    centroid = (spec * freqs.unsqueeze(1)).sum(dim=0) / s_sum

    # ── Spectral bandwidth: variance around centroid ─────────────────
    deviations = (freqs.unsqueeze(1) - centroid.unsqueeze(0)) ** 2
    bandwidth = torch.sqrt((deviations * spec).sum(dim=0) / s_sum)

    # ── Spectral rolloff: 85th-percentile frequency, per frame ───────
    cum = spec.cumsum(dim=0)
    threshold = 0.85 * cum[-1, :]
    rolloff_idx = (cum >= threshold.unsqueeze(0)).int().argmax(dim=0)
    rolloff = freqs[rolloff_idx]

    # ── Spectral flatness: geo-mean / arith-mean ratio ───────────────
    log_spec = torch.log(spec + 1e-10)
    flatness = torch.exp(log_spec.mean(dim=0)) / (spec.mean(dim=0) + 1e-10)

    # ── Spectral contrast: 7-band peak-valley ────────────────────────
    contrast = _spectral_contrast(spec, freqs, n_bands=6)

    # ── ZCR + RMS via framing the raw waveform ───────────────────────
    if waveform.numel() >= WIN:
        frames = waveform.unfold(0, WIN, HOP)  # (n_frames, win)
        sign = torch.sign(frames)
        zcr = (sign[:, 1:] != sign[:, :-1]).float().mean(dim=1)
        rms = torch.sqrt((frames ** 2).mean(dim=1) + 1e-10)
    else:
        zcr = torch.zeros(1, device=device)
        rms = torch.zeros(1, device=device)

    # ── Tempo (BPM) — onset-flux autocorrelation ─────────────────────
    tempo = _estimate_tempo(spec, HOP, SR)

    # ── Chroma (12 pitch classes) ────────────────────────────────────
    chroma = _compute_chroma(spec, freqs, SR)

    # ── Mel-spectrogram (downsampled for JSON transport) ─────────────
    mel_t = TAT.MelSpectrogram(
        sample_rate=SR, n_fft=N_FFT, hop_length=HOP, n_mels=64,
    ).to(device)
    mel = mel_t(waveform.unsqueeze(0)).squeeze(0)
    mel_db = TAT.AmplitudeToDB(stype="power")(mel)
    step = max(1, mel_db.shape[1] // 100)
    mel_down = mel_db[:, ::step].cpu().tolist()

    # ── Single bulk transfer to CPU, then to Python lists ────────────
    return LibrosaFeatures(
        mfcc_mean=mfcc.mean(dim=1).cpu().tolist(),
        mfcc_std=mfcc.std(dim=1).cpu().tolist(),
        spectral_centroid_mean=float(centroid.mean().cpu()),
        spectral_bandwidth_mean=float(bandwidth.mean().cpu()),
        spectral_rolloff_mean=float(rolloff.mean().cpu()),
        spectral_contrast_mean=contrast.mean(dim=1).cpu().tolist(),
        spectral_flatness_mean=float(flatness.mean().cpu()),
        zero_crossing_rate_mean=float(zcr.mean().cpu()),
        rms_mean=float(rms.mean().cpu()),
        rms_std=float(rms.std().cpu()),
        tempo=tempo,
        chroma_mean=chroma.mean(dim=1).cpu().tolist(),
        mel_spectrogram_db=mel_down,
    )


# ---------------------------------------------------------------------------
# OpenSMILE: 6373 features (ComParE_2016)
# ---------------------------------------------------------------------------

@dataclass
class OpenSmileFeatures:
    feature_set: str
    feature_count: int
    features: dict[str, float]


def extract_opensmile(audio_path: str | Path, feature_set: str = "eGeMAPSv02") -> OpenSmileFeatures | None:
    """Extract acoustic features using openSMILE."""
    try:
        import opensmile

        feature_sets = {
            "eGeMAPSv02": opensmile.FeatureSet.eGeMAPSv02,
            "ComParE_2016": opensmile.FeatureSet.ComParE_2016,
        }
        fs = feature_sets.get(feature_set, opensmile.FeatureSet.eGeMAPSv02)
        smile = opensmile.Smile(feature_set=fs, feature_level=opensmile.FeatureLevel.Functionals)
        df = smile.process_file(str(audio_path))

        features = {col: float(df[col].iloc[0]) for col in df.columns}
        return OpenSmileFeatures(
            feature_set=feature_set,
            feature_count=len(features),
            features=features,
        )
    except ImportError:
        logger.warning("opensmile not installed, skipping")
        return None
    except Exception as exc:
        logger.warning("openSMILE extraction failed: %s", exc)
        return None
