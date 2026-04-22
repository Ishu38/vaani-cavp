"""VoiceSauce-equivalent Spectral Voice Quality Measures

Implements the gold-standard harmonic amplitude measurements from:
    Shue et al. (2011) "VoiceSauce: A program for voice analysis"

Measures computed:
    - H1, H2, H4: Amplitudes of 1st, 2nd, 4th harmonics
    - A1, A2, A3: Amplitudes of harmonics nearest F1, F2, F3
    - H1-H2: Open quotient proxy (breathiness)
    - H2-H4: Spectral tilt (phonation type)
    - H1-A1: First formant bandwidth proxy
    - H1-A3: High-frequency energy (pressed vs breathy)
    - H4-H2k: Mid-frequency spectral slope
    - CPP: Cepstral Peak Prominence (overall periodicity)
    - SHR: Subharmonic-to-Harmonic Ratio (creak/diplophonia)
    - Energy: Frame-level RMS energy

All measures are corrected for formant influence using the method from
Iseli & Alwan (2004) where applicable.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import numpy as np

logger = logging.getLogger(__name__)

# Analysis parameters (matching VoiceSauce defaults)
FRAME_LENGTH_MS = 25.0
FRAME_SHIFT_MS = 10.0
PRE_EMPHASIS = 0.97
FFT_SIZE = 4096


@dataclass
class VoiceSauceFrame:
    """Per-frame spectral measures."""
    time_ms: float
    f0: float
    H1: float = 0.0
    H2: float = 0.0
    H4: float = 0.0
    A1: float = 0.0
    A2: float = 0.0
    A3: float = 0.0
    H1_H2: float = 0.0
    H2_H4: float = 0.0
    H1_A1: float = 0.0
    H1_A3: float = 0.0
    H4_H2k: float = 0.0
    CPP: float = 0.0
    SHR: float = 0.0
    energy: float = 0.0


@dataclass
class VoiceSauceResult:
    """Aggregated VoiceSauce measurements across the utterance."""
    # Per-frame data
    frames: list[VoiceSauceFrame] = field(default_factory=list)
    num_voiced_frames: int = 0

    # Summary statistics (mean ± std over voiced frames)
    H1_H2_mean: float = 0.0
    H1_H2_std: float = 0.0
    H2_H4_mean: float = 0.0
    H2_H4_std: float = 0.0
    H1_A1_mean: float = 0.0
    H1_A1_std: float = 0.0
    H1_A3_mean: float = 0.0
    H1_A3_std: float = 0.0
    H4_H2k_mean: float = 0.0
    H4_H2k_std: float = 0.0
    CPP_mean: float = 0.0
    CPP_std: float = 0.0
    SHR_mean: float = 0.0
    SHR_std: float = 0.0
    energy_mean: float = 0.0
    energy_std: float = 0.0

    # Derived classifications
    phonation_type: str = "modal"       # breathy | modal | pressed | creaky
    breathiness_index: float = 0.0      # 0-1
    pressedness_index: float = 0.0      # 0-1
    creak_index: float = 0.0            # 0-1
    spectral_tilt: float = 0.0          # overall tilt (dB/octave)

    source: str = "voicesauce"


# ── Core Spectral Analysis ───────────────────────────────────────────────

def _get_f0_track(audio: np.ndarray, sr: int) -> list[tuple[float, float]]:
    """Extract F0 track using Parselmouth (Praat's autocorrelation method).

    Returns list of (time_ms, f0_hz) tuples. f0=0 for unvoiced frames.
    """
    try:
        import parselmouth
        snd = parselmouth.Sound(audio, sampling_frequency=sr)
        pitch = snd.to_pitch_ac(
            time_step=FRAME_SHIFT_MS / 1000.0,
            pitch_floor=60,
            pitch_ceiling=500,
        )
        times = pitch.xs()
        f0_track = []
        for t in times:
            f0 = pitch.get_value_at_time(t)
            if np.isnan(f0):
                f0 = 0.0
            f0_track.append((t * 1000, f0))
        return f0_track
    except Exception as exc:
        logger.warning("Parselmouth F0 extraction failed: %s", exc)
        return []


def _get_formants(audio: np.ndarray, sr: int, gender: str = "neutral") -> list[tuple[float, float, float, float]]:
    """Extract formant tracks F1-F3 using Parselmouth.

    Returns list of (time_ms, F1, F2, F3) tuples.
    """
    try:
        import parselmouth
        snd = parselmouth.Sound(audio, sampling_frequency=sr)
        max_formant = {"male": 5000, "female": 5500, "child": 6500}.get(gender, 5500)
        formant_obj = snd.to_formant_burg(
            time_step=FRAME_SHIFT_MS / 1000.0,
            max_number_of_formants=5,
            maximum_formant=max_formant,
        )
        times = formant_obj.xs()
        tracks = []
        for t in times:
            f1 = formant_obj.get_value_at_time(1, t)
            f2 = formant_obj.get_value_at_time(2, t)
            f3 = formant_obj.get_value_at_time(3, t)
            f1 = f1 if not np.isnan(f1) else 500
            f2 = f2 if not np.isnan(f2) else 1500
            f3 = f3 if not np.isnan(f3) else 2500
            tracks.append((t * 1000, f1, f2, f3))
        return tracks
    except Exception as exc:
        logger.warning("Parselmouth formant extraction failed: %s", exc)
        return []


def _harmonic_amplitude(spectrum_db: np.ndarray, freqs: np.ndarray, target_freq: float, search_bw: float = 20.0) -> float:
    """Find amplitude of the harmonic nearest to target_freq.

    Uses parabolic interpolation around the peak for sub-bin accuracy.
    """
    if target_freq <= 0:
        return -100.0

    lo = target_freq - search_bw
    hi = target_freq + search_bw
    mask = (freqs >= lo) & (freqs <= hi)
    if not np.any(mask):
        return -100.0

    subset = spectrum_db[mask]
    peak_idx = np.argmax(subset)

    # Parabolic interpolation
    if 0 < peak_idx < len(subset) - 1:
        alpha = float(subset[peak_idx - 1])
        beta = float(subset[peak_idx])
        gamma = float(subset[peak_idx + 1])
        denom = alpha - 2 * beta + gamma
        if abs(denom) > 1e-10:
            p = 0.5 * (alpha - gamma) / denom
            return beta - 0.25 * (alpha - gamma) * p
        return beta
    return float(subset[peak_idx])


def _compute_cpp(frame: np.ndarray, sr: int) -> float:
    """Compute Cepstral Peak Prominence (CPP).

    CPP measures the strength of the cepstral peak relative to the
    regression line through the cepstrum. Higher CPP = more periodic voice.
    """
    # Compute power cepstrum
    windowed = frame * np.hanning(len(frame))
    spectrum = np.fft.rfft(windowed, n=FFT_SIZE)
    log_power = np.log(np.abs(spectrum) ** 2 + 1e-12)
    cepstrum = np.abs(np.fft.irfft(log_power)) ** 2

    # Search for peak in quefrency range corresponding to 60-500 Hz
    min_q = int(sr / 500)
    max_q = int(sr / 60)
    max_q = min(max_q, len(cepstrum) - 1)

    if min_q >= max_q or max_q >= len(cepstrum):
        return 0.0

    cep_segment = cepstrum[min_q:max_q + 1]
    cep_db = 10 * np.log10(cep_segment + 1e-12)

    # Linear regression through cepstrum
    x = np.arange(len(cep_db))
    if len(x) < 2:
        return 0.0
    coeffs = np.polyfit(x, cep_db, 1)
    regression_line = np.polyval(coeffs, x)

    # CPP = peak above regression line
    peak_idx = np.argmax(cep_db)
    cpp = cep_db[peak_idx] - regression_line[peak_idx]
    return max(0.0, float(cpp))


def _compute_shr(frame: np.ndarray, sr: int, f0: float) -> float:
    """Compute Subharmonic-to-Harmonic Ratio (SHR).

    Detects presence of subharmonics (half-frequency energy), which
    indicates creaky voice / vocal fry / diplophonia.
    """
    if f0 <= 0:
        return 0.0

    windowed = frame * np.hanning(len(frame))
    spectrum = np.abs(np.fft.rfft(windowed, n=FFT_SIZE))
    freqs = np.fft.rfftfreq(FFT_SIZE, 1.0 / sr)

    # Amplitude at F0 (harmonic)
    h1_amp = _harmonic_amplitude(
        20 * np.log10(spectrum + 1e-12), freqs, f0, search_bw=15,
    )

    # Amplitude at F0/2 (subharmonic)
    sub_amp = _harmonic_amplitude(
        20 * np.log10(spectrum + 1e-12), freqs, f0 / 2, search_bw=15,
    )

    # SHR in dB
    shr_db = sub_amp - h1_amp
    # Normalize to 0-1 range: positive SHR = subharmonic present
    shr_norm = max(0.0, min(1.0, (shr_db + 10) / 30))
    return float(shr_norm)


def _formant_correction(harmonic_db: float, harmonic_freq: float,
                        formant_freq: float, formant_bw: float = 80.0) -> float:
    """Apply Iseli & Alwan (2004) formant correction to harmonic amplitude.

    Removes the influence of nearby formants on harmonic amplitudes,
    giving a more accurate measure of source spectral tilt.
    """
    if formant_freq <= 0 or formant_bw <= 0:
        return harmonic_db

    # Resonance gain at harmonic frequency due to formant
    r = np.exp(-np.pi * formant_bw / 16000)  # assuming 16kHz SR
    theta_h = 2 * np.pi * harmonic_freq / 16000
    theta_f = 2 * np.pi * formant_freq / 16000

    numerator = (1 - 2 * r * np.cos(theta_f) + r ** 2)
    denominator = (1 - 2 * r * np.cos(theta_h - theta_f) + r ** 2) * \
                  (1 - 2 * r * np.cos(theta_h + theta_f) + r ** 2)

    if denominator <= 0:
        return harmonic_db

    correction_db = 10 * np.log10(numerator / np.sqrt(denominator) + 1e-12)
    return harmonic_db - correction_db


# ── Main Analysis Function ───────────────────────────────────────────────

def analyze_voicesauce(
    audio_path: Path,
    gender: str = "neutral",
    f0_track: list[tuple[float, float]] | None = None,
    formant_track: list[tuple[float, float, float, float]] | None = None,
) -> VoiceSauceResult:
    """Run full VoiceSauce-equivalent analysis on an audio file.

    Args:
        audio_path: Path to WAV file.
        gender: Speaker gender for formant ceiling.
        f0_track: Pre-computed F0 track [(time_ms, f0_hz), ...].
        formant_track: Pre-computed formants [(time_ms, F1, F2, F3), ...].

    Returns:
        VoiceSauceResult with per-frame and aggregate measures.
    """
    import soundfile as sf

    audio, sr = sf.read(str(audio_path), dtype="float64")
    if audio.ndim > 1:
        audio = audio.mean(axis=1)

    # Resample to 16kHz if needed
    if sr != 16000:
        try:
            import librosa
            audio = librosa.resample(audio, orig_sr=sr, target_sr=16000)
            sr = 16000
        except ImportError:
            pass

    # Get F0 and formant tracks if not provided
    if f0_track is None:
        f0_track = _get_f0_track(audio, sr)
    if formant_track is None:
        formant_track = _get_formants(audio, sr, gender)

    # Pre-emphasis
    audio_pe = np.append(audio[0], audio[1:] - PRE_EMPHASIS * audio[:-1])

    frame_len = int(sr * FRAME_LENGTH_MS / 1000)
    frame_shift = int(sr * FRAME_SHIFT_MS / 1000)
    num_frames = (len(audio_pe) - frame_len) // frame_shift + 1

    # Build lookup for F0 and formants by time
    def _nearest(track, time_ms, default):
        if not track:
            return default
        best = min(track, key=lambda x: abs(x[0] - time_ms))
        return best

    frames: list[VoiceSauceFrame] = []
    voiced_data: dict[str, list[float]] = {
        k: [] for k in [
            "H1_H2", "H2_H4", "H1_A1", "H1_A3", "H4_H2k",
            "CPP", "SHR", "energy",
        ]
    }

    for i in range(min(num_frames, 2000)):  # Cap at 2000 frames (~20s)
        start = i * frame_shift
        frame = audio_pe[start:start + frame_len]
        time_ms = (start + frame_len / 2) / sr * 1000

        # Get F0 for this frame
        f0_entry = _nearest(f0_track, time_ms, (time_ms, 0.0))
        f0 = f0_entry[1]

        # RMS energy
        rms = float(np.sqrt(np.mean(frame ** 2)))
        energy_db = 20 * np.log10(rms + 1e-12)

        vs_frame = VoiceSauceFrame(time_ms=round(time_ms, 2), f0=f0, energy=energy_db)

        if f0 > 60:  # Voiced frame
            # Compute DFT
            windowed = frame * np.hanning(len(frame))
            spectrum = np.abs(np.fft.rfft(windowed, n=FFT_SIZE))
            spectrum_db = 20 * np.log10(spectrum + 1e-12)
            freqs = np.fft.rfftfreq(FFT_SIZE, 1.0 / sr)

            # Get formants for this frame
            fmt_entry = _nearest(formant_track, time_ms, (time_ms, 500, 1500, 2500))
            _, f1, f2, f3 = fmt_entry

            # Harmonic amplitudes
            h1 = _harmonic_amplitude(spectrum_db, freqs, f0)
            h2 = _harmonic_amplitude(spectrum_db, freqs, 2 * f0)
            h4 = _harmonic_amplitude(spectrum_db, freqs, 4 * f0)

            # Formant harmonics (nearest harmonic to each formant)
            a1 = _harmonic_amplitude(spectrum_db, freqs, f1, search_bw=f0 / 2)
            a2 = _harmonic_amplitude(spectrum_db, freqs, f2, search_bw=f0 / 2)
            a3 = _harmonic_amplitude(spectrum_db, freqs, f3, search_bw=f0 / 2)

            # 2kHz harmonic
            h2k = _harmonic_amplitude(spectrum_db, freqs, 2000, search_bw=f0 / 2)

            # Apply formant corrections (Iseli & Alwan 2004)
            h1_corr = _formant_correction(h1, f0, f1)
            h2_corr = _formant_correction(h2, 2 * f0, f1)
            a1_corr = a1  # A1 is already at F1, no correction needed
            a3_corr = _formant_correction(a3, f3, f3)

            # Compute measures
            vs_frame.H1 = h1_corr
            vs_frame.H2 = h2_corr
            vs_frame.H4 = _formant_correction(h4, 4 * f0, f2)
            vs_frame.A1 = a1_corr
            vs_frame.A2 = a2
            vs_frame.A3 = a3_corr
            vs_frame.H1_H2 = h1_corr - h2_corr
            vs_frame.H2_H4 = h2_corr - vs_frame.H4
            vs_frame.H1_A1 = h1_corr - a1_corr
            vs_frame.H1_A3 = h1_corr - a3_corr
            vs_frame.H4_H2k = vs_frame.H4 - h2k
            vs_frame.CPP = _compute_cpp(frame, sr)
            vs_frame.SHR = _compute_shr(frame, sr, f0)

            # Collect for statistics
            voiced_data["H1_H2"].append(vs_frame.H1_H2)
            voiced_data["H2_H4"].append(vs_frame.H2_H4)
            voiced_data["H1_A1"].append(vs_frame.H1_A1)
            voiced_data["H1_A3"].append(vs_frame.H1_A3)
            voiced_data["H4_H2k"].append(vs_frame.H4_H2k)
            voiced_data["CPP"].append(vs_frame.CPP)
            voiced_data["SHR"].append(vs_frame.SHR)
            voiced_data["energy"].append(energy_db)

        frames.append(vs_frame)

    # Aggregate statistics
    result = VoiceSauceResult(
        frames=frames,
        num_voiced_frames=len(voiced_data["H1_H2"]),
    )

    if result.num_voiced_frames > 0:
        for key in voiced_data:
            arr = np.array(voiced_data[key])
            setattr(result, f"{key}_mean", round(float(np.mean(arr)), 3))
            setattr(result, f"{key}_std", round(float(np.std(arr)), 3))

        # Derive phonation type and indices
        result.breathiness_index = _breathiness_index(result.H1_H2_mean, result.CPP_mean)
        result.pressedness_index = _pressedness_index(result.H1_H2_mean, result.H1_A3_mean)
        result.creak_index = _creak_index(result.SHR_mean, result.CPP_mean)
        result.spectral_tilt = round(result.H1_H2_mean + result.H1_A3_mean, 3)
        result.phonation_type = _classify_phonation(
            result.H1_H2_mean, result.CPP_mean, result.SHR_mean,
        )

    return result


def _breathiness_index(h1_h2: float, cpp: float) -> float:
    """Compute breathiness index (0-1).

    Breathy voice: high H1-H2 (> 5 dB), low CPP (< 5 dB).
    """
    h1h2_score = max(0, min(1, (h1_h2 - 0) / 15))
    cpp_score = max(0, min(1, (10 - cpp) / 10))
    return round(0.6 * h1h2_score + 0.4 * cpp_score, 3)


def _pressedness_index(h1_h2: float, h1_a3: float) -> float:
    """Compute pressedness index (0-1).

    Pressed voice: low H1-H2 (< 0 dB), low H1-A3 (high spectral energy).
    """
    h1h2_score = max(0, min(1, (3 - h1_h2) / 10))
    h1a3_score = max(0, min(1, (15 - h1_a3) / 30))
    return round(0.5 * h1h2_score + 0.5 * h1a3_score, 3)


def _creak_index(shr: float, cpp: float) -> float:
    """Compute creak index (0-1).

    Creaky voice: high SHR (subharmonics present), moderate CPP.
    """
    shr_score = max(0, min(1, shr * 2))
    return round(shr_score, 3)


def _classify_phonation(h1_h2: float, cpp: float, shr: float) -> str:
    """Classify phonation type from VoiceSauce measures."""
    if shr > 0.4:
        return "creaky"
    if h1_h2 > 8 and cpp < 5:
        return "breathy"
    if h1_h2 < -2:
        return "pressed"
    return "modal"


def voicesauce_to_dict(result: VoiceSauceResult) -> dict[str, Any]:
    """Convert VoiceSauceResult to serializable dict (excluding per-frame data for size)."""
    return {
        "num_voiced_frames": result.num_voiced_frames,
        "H1_H2": {"mean": result.H1_H2_mean, "std": result.H1_H2_std},
        "H2_H4": {"mean": result.H2_H4_mean, "std": result.H2_H4_std},
        "H1_A1": {"mean": result.H1_A1_mean, "std": result.H1_A1_std},
        "H1_A3": {"mean": result.H1_A3_mean, "std": result.H1_A3_std},
        "H4_H2k": {"mean": result.H4_H2k_mean, "std": result.H4_H2k_std},
        "CPP": {"mean": result.CPP_mean, "std": result.CPP_std},
        "SHR": {"mean": result.SHR_mean, "std": result.SHR_std},
        "energy": {"mean": result.energy_mean, "std": result.energy_std},
        "spectral_tilt": result.spectral_tilt,
        "phonation_type": result.phonation_type,
        "breathiness_index": result.breathiness_index,
        "pressedness_index": result.pressedness_index,
        "creak_index": result.creak_index,
        "source": result.source,
    }
