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


@dataclass
class PitchData:
    mean_f0: float
    min_f0: float
    max_f0: float
    std_f0: float
    pitch_range: float
    pitch_contour: list[float]
    voiced_fraction: float


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


def extract_parselmouth(audio_path: str | Path, gender: str = "neutral") -> ParselmouthFeatures:
    """Extract formants, pitch, and voice quality using Parselmouth (Praat)."""
    import parselmouth
    from parselmouth.praat import call

    snd = parselmouth.Sound(str(audio_path))

    # Gender-specific formant ceiling
    ceiling_map = {"male": 5000, "female": 5500, "child": 6500, "neutral": 5500}
    max_formant = ceiling_map.get(gender, 5500)

    # -- Formants --
    formant_obj = call(snd, "To Formant (burg)", 0.0, 5, max_formant, 0.025, 50.0)
    num_frames = call(formant_obj, "Get number of frames")

    f1_vals, f2_vals, f3_vals, f4_vals = [], [], [], []
    bw1_vals, bw2_vals = [], []
    for i in range(1, num_frames + 1):
        t = call(formant_obj, "Get time from frame number", i)
        for fnum, store in [(1, f1_vals), (2, f2_vals), (3, f3_vals), (4, f4_vals)]:
            v = call(formant_obj, "Get value at time", fnum, t, "hertz", "Linear")
            if not np.isnan(v):
                store.append(v)
        bw1 = call(formant_obj, "Get bandwidth at time", 1, t, "hertz", "Linear")
        bw2 = call(formant_obj, "Get bandwidth at time", 2, t, "hertz", "Linear")
        if not np.isnan(bw1):
            bw1_vals.append(bw1)
        if not np.isnan(bw2):
            bw2_vals.append(bw2)

    def safe_mean(arr: list[float]) -> float:
        return float(np.mean(arr)) if arr else 0.0

    # Vowel space area (triangle: F1/F2 of /i/, /a/, /u/ approximated from extremes)
    f1_arr, f2_arr = np.array(f1_vals or [0]), np.array(f2_vals or [0])
    if len(f1_arr) > 2 and len(f2_arr) > 2:
        corners = np.array([
            [np.min(f1_arr), np.max(f2_arr)],  # /i/ region
            [np.max(f1_arr), np.mean(f2_arr)],  # /a/ region
            [np.min(f1_arr), np.min(f2_arr)],  # /u/ region
        ])
        vsa = 0.5 * abs(
            (corners[1, 0] - corners[0, 0]) * (corners[2, 1] - corners[0, 1])
            - (corners[2, 0] - corners[0, 0]) * (corners[1, 1] - corners[0, 1])
        )
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
    )

    # -- Pitch --
    pitch_obj = call(snd, "To Pitch", 0.0, 75, 600)
    f0_values = [
        call(pitch_obj, "Get value at time", t, "hertz", "Linear")
        for t in np.arange(0, snd.duration, 0.01)
    ]
    f0_clean = [v for v in f0_values if not np.isnan(v) and v > 0]
    total_frames_pitch = len(f0_values)
    voiced_frames = len(f0_clean)

    pitch = PitchData(
        mean_f0=safe_mean(f0_clean),
        min_f0=float(min(f0_clean)) if f0_clean else 0.0,
        max_f0=float(max(f0_clean)) if f0_clean else 0.0,
        std_f0=float(np.std(f0_clean)) if f0_clean else 0.0,
        pitch_range=(max(f0_clean) - min(f0_clean)) if f0_clean else 0.0,
        pitch_contour=f0_clean[:200],
        voiced_fraction=voiced_frames / total_frames_pitch if total_frames_pitch > 0 else 0.0,
    )

    # -- Voice Quality --
    point_process = call(snd, "To PointProcess (periodic, cc)", 75, 600)
    jitter_local = call(point_process, "Get jitter (local)", 0, 0, 0.0001, 0.02, 1.3)
    jitter_rap = call(point_process, "Get jitter (rap)", 0, 0, 0.0001, 0.02, 1.3)
    shimmer_local = call([snd, point_process], "Get shimmer (local)", 0, 0, 0.0001, 0.02, 1.3, 1.6)
    shimmer_apq3 = call([snd, point_process], "Get shimmer (apq3)", 0, 0, 0.0001, 0.02, 1.3, 1.6)

    harmonicity = call(snd, "To Harmonicity (cc)", 0.01, 75, 0.1, 1.0)
    hnr = call(harmonicity, "Get mean", 0, 0)

    intensity_obj = call(snd, "To Intensity", 75, 0.0, "yes")
    mean_intensity = call(intensity_obj, "Get mean", 0, 0, "dB")
    std_intensity = call(intensity_obj, "Get standard deviation", 0, 0)

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


def extract_librosa(audio_path: str | Path) -> LibrosaFeatures:
    """Extract spectral, rhythm, and MFCC features using librosa."""
    import librosa

    y, sr = librosa.load(str(audio_path), sr=22050)

    # MFCC
    mfcc = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=13)
    mfcc_mean = np.mean(mfcc, axis=1).tolist()
    mfcc_std = np.std(mfcc, axis=1).tolist()

    # Spectral features
    cent = librosa.feature.spectral_centroid(y=y, sr=sr)
    bw = librosa.feature.spectral_bandwidth(y=y, sr=sr)
    rolloff = librosa.feature.spectral_rolloff(y=y, sr=sr)
    contrast = librosa.feature.spectral_contrast(y=y, sr=sr)
    flatness = librosa.feature.spectral_flatness(y=y)
    zcr = librosa.feature.zero_crossing_rate(y)
    rms = librosa.feature.rms(y=y)

    # Tempo
    tempo_val, _ = librosa.beat.beat_track(y=y, sr=sr)
    tempo_scalar = float(tempo_val[0]) if hasattr(tempo_val, '__len__') else float(tempo_val)

    # Chroma
    chroma = librosa.feature.chroma_stft(y=y, sr=sr)
    chroma_mean = np.mean(chroma, axis=1).tolist()

    # Mel spectrogram (downsampled for JSON transport)
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
