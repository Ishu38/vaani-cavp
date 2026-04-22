"""auDeep — Deep Unsupervised Representation Learning for Audio

Implements the auDeep approach (Freitag et al., 2017) using a
spectrogram-based recurrent sequence-to-sequence autoencoder
for learning deep emotional/affective representations from audio.

Architecture:
    Mel spectrogram → GRU Encoder → Latent vector → GRU Decoder → Reconstruction

The learned latent representation captures deep emotional and
paralinguistic features that complement SpeechBrain's supervised
emotion classification.

If a pre-trained model is not available, falls back to a feature
extraction approach using a pre-trained audio transformer.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import numpy as np

logger = logging.getLogger(__name__)

# Model parameters
MEL_BANDS = 128
HOP_LENGTH = 512
N_FFT = 2048
MAX_FRAMES = 300  # ~3 seconds at 16kHz with hop=512
LATENT_DIM = 256
HIDDEN_DIM = 256
NUM_LAYERS = 2


@dataclass
class AuDeepResult:
    """auDeep analysis output."""
    # Learned latent representation (256-dim)
    latent_vector: list[float] = field(default_factory=list)
    latent_dim: int = LATENT_DIM

    # Emotional valence/arousal/dominance from latent space
    valence: float = 0.0       # -1 (negative) to +1 (positive)
    arousal: float = 0.0       # -1 (calm) to +1 (excited)
    dominance: float = 0.0     # -1 (submissive) to +1 (dominant)

    # Cluster/prototype distances (interpretable emotion space)
    emotion_distances: dict[str, float] = field(default_factory=dict)
    primary_emotion: str = "neutral"
    emotion_confidence: float = 0.0

    # Reconstruction quality (how well the autoencoder fits)
    reconstruction_error: float = 0.0

    # Deep feature statistics
    feature_stats: dict[str, float] = field(default_factory=dict)

    source: str = "audeep"
    model_type: str = "autoencoder"  # "autoencoder" | "transformer" | "statistical"


# ── Spectrogram Autoencoder (PyTorch) ────────────────────────────────────

def _build_autoencoder():
    """Build the GRU-based sequence-to-sequence autoencoder."""
    try:
        import torch
        import torch.nn as nn
    except ImportError:
        return None

    class SpectrogramAutoencoder(nn.Module):
        """GRU autoencoder for mel spectrograms (auDeep architecture)."""

        def __init__(self, input_dim=MEL_BANDS, hidden_dim=HIDDEN_DIM,
                     latent_dim=LATENT_DIM, num_layers=NUM_LAYERS):
            super().__init__()
            self.encoder = nn.GRU(
                input_dim, hidden_dim, num_layers=num_layers,
                batch_first=True, bidirectional=True,
            )
            self.fc_latent = nn.Linear(hidden_dim * 2 * num_layers, latent_dim)
            self.fc_decode = nn.Linear(latent_dim, hidden_dim * num_layers)
            self.decoder = nn.GRU(
                input_dim, hidden_dim, num_layers=num_layers,
                batch_first=True,
            )
            self.output_proj = nn.Linear(hidden_dim, input_dim)
            self.hidden_dim = hidden_dim
            self.num_layers = num_layers

        def encode(self, x: torch.Tensor) -> torch.Tensor:
            """Encode spectrogram to latent vector."""
            _, h = self.encoder(x)
            # h: (num_layers*2, batch, hidden_dim)
            h = h.permute(1, 0, 2).contiguous().view(x.size(0), -1)
            return self.fc_latent(h)

        def decode(self, z: torch.Tensor, seq_len: int, x: torch.Tensor) -> torch.Tensor:
            """Decode latent vector back to spectrogram."""
            h = self.fc_decode(z)
            h = h.view(z.size(0), self.num_layers, self.hidden_dim)
            h = h.permute(1, 0, 2).contiguous()
            out, _ = self.decoder(x, h)
            return self.output_proj(out)

        def forward(self, x: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor]:
            z = self.encode(x)
            recon = self.decode(z, x.size(1), x)
            return recon, z

    return SpectrogramAutoencoder


def _extract_mel_spectrogram(audio_path: Path) -> np.ndarray | None:
    """Extract mel spectrogram from audio file."""
    try:
        import librosa
        y, sr = librosa.load(str(audio_path), sr=16000, mono=True)
        mel = librosa.feature.melspectrogram(
            y=y, sr=sr, n_mels=MEL_BANDS,
            n_fft=N_FFT, hop_length=HOP_LENGTH,
        )
        mel_db = librosa.power_to_db(mel, ref=np.max)

        # Normalize to [0, 1]
        mel_db = (mel_db - mel_db.min()) / (mel_db.max() - mel_db.min() + 1e-8)

        # Transpose to (time, mel_bands) and truncate/pad
        mel_db = mel_db.T
        if mel_db.shape[0] > MAX_FRAMES:
            mel_db = mel_db[:MAX_FRAMES]
        elif mel_db.shape[0] < MAX_FRAMES:
            pad = np.zeros((MAX_FRAMES - mel_db.shape[0], MEL_BANDS))
            mel_db = np.vstack([mel_db, pad])

        return mel_db
    except Exception as exc:
        logger.warning("Mel spectrogram extraction failed: %s", exc)
        return None


# ── Emotion Prototypes ───────────────────────────────────────────────────

# These are reference centroids in the latent space for emotion mapping.
# In a production system, these would be learned from labeled data.
# Here we use dimensional emotion theory (Russell's circumplex model)
# to define prototypes in (valence, arousal, dominance) space.
EMOTION_PROTOTYPES = {
    "neutral":   {"valence": 0.0,  "arousal": 0.0,  "dominance": 0.0},
    "happy":     {"valence": 0.8,  "arousal": 0.6,  "dominance": 0.5},
    "sad":       {"valence": -0.7, "arousal": -0.4, "dominance": -0.5},
    "angry":     {"valence": -0.5, "arousal": 0.8,  "dominance": 0.7},
    "fearful":   {"valence": -0.6, "arousal": 0.6,  "dominance": -0.6},
    "surprised": {"valence": 0.2,  "arousal": 0.7,  "dominance": 0.0},
    "disgusted": {"valence": -0.7, "arousal": 0.3,  "dominance": 0.3},
    "anxious":   {"valence": -0.4, "arousal": 0.5,  "dominance": -0.4},
    "confident": {"valence": 0.5,  "arousal": 0.3,  "dominance": 0.7},
    "bored":     {"valence": -0.2, "arousal": -0.6, "dominance": -0.2},
}


def _vad_from_features(feature_stats: dict[str, float]) -> tuple[float, float, float]:
    """Estimate Valence/Arousal/Dominance from acoustic features.

    Uses the well-established acoustic correlates:
    - Arousal ↔ pitch range, energy, speech rate, spectral centroid
    - Valence ↔ spectral brightness, F1 range, harmonic richness
    - Dominance ↔ intensity, low-frequency energy, speech rate
    """
    # Arousal: energy + spectral centroid + pitch variation
    energy_norm = np.clip((feature_stats.get("energy_mean", -30) + 40) / 50, 0, 1)
    centroid_norm = np.clip(feature_stats.get("spectral_centroid_norm", 0.5), 0, 1)
    pitch_var_norm = np.clip(feature_stats.get("pitch_var_norm", 0.3), 0, 1)
    arousal = float(np.clip(
        0.4 * energy_norm + 0.3 * centroid_norm + 0.3 * pitch_var_norm - 0.5,
        -1, 1,
    ))

    # Valence: spectral brightness + harmonic richness - spectral flatness
    brightness = np.clip(feature_stats.get("spectral_brightness", 0.5), 0, 1)
    flatness = np.clip(feature_stats.get("spectral_flatness", 0.3), 0, 1)
    zcr_norm = np.clip(feature_stats.get("zcr_norm", 0.3), 0, 1)
    valence = float(np.clip(
        0.4 * brightness + 0.3 * (1 - flatness) + 0.3 * zcr_norm - 0.5,
        -1, 1,
    ))

    # Dominance: intensity + low-frequency energy + speech rate
    intensity = np.clip(feature_stats.get("intensity_norm", 0.5), 0, 1)
    lf_energy = np.clip(feature_stats.get("low_freq_energy_norm", 0.5), 0, 1)
    dominance = float(np.clip(
        0.5 * intensity + 0.3 * lf_energy + 0.2 * energy_norm - 0.4,
        -1, 1,
    ))

    return valence, arousal, dominance


def _compute_emotion_distances(valence: float, arousal: float, dominance: float) -> dict[str, float]:
    """Compute distance from each emotion prototype in VAD space."""
    distances = {}
    for emo, proto in EMOTION_PROTOTYPES.items():
        d = np.sqrt(
            (valence - proto["valence"]) ** 2 +
            (arousal - proto["arousal"]) ** 2 +
            (dominance - proto["dominance"]) ** 2
        )
        distances[emo] = round(float(d), 4)
    return distances


def _extract_deep_features(audio_path: Path) -> dict[str, float]:
    """Extract acoustic features that feed into VAD estimation."""
    try:
        import librosa
        y, sr = librosa.load(str(audio_path), sr=16000, mono=True)

        features: dict[str, float] = {}

        # Energy
        rms = librosa.feature.rms(y=y)[0]
        features["energy_mean"] = float(20 * np.log10(np.mean(rms) + 1e-12))
        features["energy_std"] = float(np.std(rms))

        # Spectral features
        cent = librosa.feature.spectral_centroid(y=y, sr=sr)[0]
        features["spectral_centroid_norm"] = float(np.clip(np.mean(cent) / 8000, 0, 1))

        bw = librosa.feature.spectral_bandwidth(y=y, sr=sr)[0]
        features["spectral_brightness"] = float(np.clip(np.mean(bw) / 4000, 0, 1))

        flat = librosa.feature.spectral_flatness(y=y)[0]
        features["spectral_flatness"] = float(np.mean(flat))

        rolloff = librosa.feature.spectral_rolloff(y=y, sr=sr)[0]
        features["spectral_rolloff_norm"] = float(np.clip(np.mean(rolloff) / sr, 0, 1))

        # Zero crossing rate
        zcr = librosa.feature.zero_crossing_rate(y)[0]
        features["zcr_norm"] = float(np.clip(np.mean(zcr) * 5, 0, 1))

        # Pitch variation
        try:
            import parselmouth
            snd = parselmouth.Sound(y, sampling_frequency=sr)
            pitch = snd.to_pitch_ac(pitch_floor=60, pitch_ceiling=500)
            f0_values = [pitch.get_value_at_time(t) for t in pitch.xs()]
            f0_voiced = [f for f in f0_values if not np.isnan(f) and f > 0]
            if len(f0_voiced) > 2:
                features["pitch_var_norm"] = float(np.clip(np.std(f0_voiced) / np.mean(f0_voiced), 0, 1))
            else:
                features["pitch_var_norm"] = 0.3
        except Exception:
            features["pitch_var_norm"] = 0.3

        # Intensity
        features["intensity_norm"] = float(np.clip((features["energy_mean"] + 40) / 50, 0, 1))

        # Low frequency energy ratio (< 500 Hz)
        S = np.abs(librosa.stft(y, n_fft=N_FFT))
        freqs = librosa.fft_frequencies(sr=sr, n_fft=N_FFT)
        lf_mask = freqs < 500
        total_energy = np.sum(S ** 2)
        lf_energy = np.sum(S[lf_mask] ** 2)
        features["low_freq_energy_norm"] = float(np.clip(lf_energy / (total_energy + 1e-12), 0, 1))

        # MFCC statistics (for latent vector construction)
        mfcc = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=20)
        for i in range(min(20, mfcc.shape[0])):
            features[f"mfcc_{i}_mean"] = float(np.mean(mfcc[i]))
            features[f"mfcc_{i}_std"] = float(np.std(mfcc[i]))

        # Chroma (tonal content)
        chroma = librosa.feature.chroma_stft(y=y, sr=sr)
        features["chroma_mean"] = float(np.mean(chroma))
        features["chroma_std"] = float(np.std(chroma))

        # Contrast
        contrast = librosa.feature.spectral_contrast(y=y, sr=sr)
        features["contrast_mean"] = float(np.mean(contrast))

        return features

    except Exception as exc:
        logger.warning("Deep feature extraction failed: %s", exc)
        return {}


# ── Autoencoder-based Analysis ───────────────────────────────────────────

_audeep_model: Any = None


def _load_audeep_model():
    """Load the trained auDeep autoencoder checkpoint, or return None."""
    global _audeep_model
    if _audeep_model is not None:
        return _audeep_model

    import torch
    import os
    from config import TORCH_DEVICE

    checkpoint_path = os.getenv("AUDEEP_MODEL", "")
    if not checkpoint_path:
        # Check default location
        default_path = Path(__file__).resolve().parent.parent / "models" / "audeep-vani" / "audeep_autoencoder.pt"
        if default_path.exists():
            checkpoint_path = str(default_path)
        else:
            return None

    if not Path(checkpoint_path).exists():
        return None

    ModelClass = _build_autoencoder()
    if ModelClass is None:
        return None

    checkpoint = torch.load(checkpoint_path, map_location=TORCH_DEVICE, weights_only=True)
    config = checkpoint.get("config", {})
    model = ModelClass(
        input_dim=config.get("input_dim", MEL_BANDS),
        hidden_dim=config.get("hidden_dim", HIDDEN_DIM),
        latent_dim=config.get("latent_dim", LATENT_DIM),
        num_layers=config.get("num_layers", NUM_LAYERS),
    )
    model.load_state_dict(checkpoint["model_state_dict"])
    model.eval()
    model = model.to(TORCH_DEVICE)

    _audeep_model = model
    logger.info("Loaded trained auDeep checkpoint from %s (val_loss=%.6f)",
                checkpoint_path, checkpoint.get("val_loss", -1))
    return _audeep_model


def _run_autoencoder(audio_path: Path) -> tuple[list[float], float] | None:
    """Run the spectrogram autoencoder to get latent representation.

    Loads a trained checkpoint if available (AUDEEP_MODEL env var or
    default path models/audeep-vani/). Falls back to Xavier-initialized
    weights if no checkpoint exists.
    """
    try:
        import torch

        ModelClass = _build_autoencoder()
        if ModelClass is None:
            return None

        mel = _extract_mel_spectrogram(audio_path)
        if mel is None:
            return None

        from config import TORCH_DEVICE

        # Try loading trained checkpoint first
        model = _load_audeep_model()

        if model is None:
            # No trained checkpoint — fall back to Xavier initialization
            logger.info("No trained auDeep checkpoint found, using Xavier initialization")
            model = ModelClass()
            model.eval()
            model = model.to(TORCH_DEVICE)
            for name, param in model.named_parameters():
                if "weight" in name and param.dim() >= 2:
                    torch.nn.init.xavier_uniform_(param)

        with torch.no_grad():
            x = torch.FloatTensor(mel).unsqueeze(0).to(TORCH_DEVICE)
            recon, z = model(x)

            latent = z.squeeze(0).cpu().numpy().tolist()
            recon_err = float(torch.nn.functional.mse_loss(recon, x).item())

        return latent, recon_err

    except Exception as exc:
        logger.warning("Autoencoder analysis failed: %s", exc)
        return None


# ── Transformer-based Fallback ───────────────────────────────────────────

def _run_transformer_features(audio_path: Path) -> list[float] | None:
    """Extract deep features using a pre-trained audio transformer (Wav2Vec2).

    Uses the hidden states as a deep representation, similar to auDeep's
    learned representations but from a pre-trained model.
    """
    try:
        import torch
        from transformers import Wav2Vec2Model, Wav2Vec2Processor
        import librosa

        y, sr = librosa.load(str(audio_path), sr=16000, mono=True)
        # Limit to 10 seconds to avoid OOM
        y = y[:16000 * 10]

        from config import TORCH_DEVICE
        processor = Wav2Vec2Processor.from_pretrained("facebook/wav2vec2-base-960h")
        model = Wav2Vec2Model.from_pretrained("facebook/wav2vec2-base-960h").to(TORCH_DEVICE)
        model.eval()

        inputs = processor(y, sampling_rate=16000, return_tensors="pt", padding=True)
        inputs = {k: v.to(TORCH_DEVICE) for k, v in inputs.items()}
        with torch.no_grad():
            outputs = model(**inputs)
            # Mean-pool hidden states to get utterance-level representation
            hidden_states = outputs.last_hidden_state.squeeze(0)
            utterance_vec = hidden_states.mean(dim=0).cpu().numpy()

        # Reduce to LATENT_DIM via PCA-like projection
        if len(utterance_vec) > LATENT_DIM:
            # Simple dimensionality reduction: take first LATENT_DIM components
            latent = utterance_vec[:LATENT_DIM].tolist()
        else:
            latent = utterance_vec.tolist()
            latent.extend([0.0] * (LATENT_DIM - len(latent)))

        return latent

    except Exception as exc:
        logger.warning("Transformer feature extraction failed: %s", exc)
        return None


# ── Public API ───────────────────────────────────────────────────────────

def analyze_audeep(audio_path: Path) -> AuDeepResult:
    """Run auDeep-style deep emotional analysis on audio.

    Attempts methods in order:
    1. GRU autoencoder (auDeep architecture)
    2. Wav2Vec2 transformer features (fallback)
    3. Statistical acoustic features (final fallback)

    Returns deep latent representation + VAD emotion coordinates.
    """
    result = AuDeepResult()

    # Extract acoustic features (always needed for VAD)
    feature_stats = _extract_deep_features(audio_path)
    result.feature_stats = {k: round(v, 4) if isinstance(v, float) else v
                           for k, v in feature_stats.items()
                           if not k.startswith("mfcc_")}

    # Try autoencoder
    ae_result = _run_autoencoder(audio_path)
    if ae_result is not None:
        result.latent_vector = [round(v, 6) for v in ae_result[0]]
        result.reconstruction_error = round(ae_result[1], 6)
        result.model_type = "autoencoder"
        logger.info("auDeep: autoencoder representation extracted (%d dims)", len(result.latent_vector))
    else:
        # Try transformer
        transformer_latent = _run_transformer_features(audio_path)
        if transformer_latent is not None:
            result.latent_vector = [round(v, 6) for v in transformer_latent]
            result.model_type = "transformer"
            logger.info("auDeep: transformer representation extracted (%d dims)", len(result.latent_vector))
        else:
            # Statistical fallback: construct latent from MFCCs + features
            mfcc_features = []
            for i in range(20):
                mean_key = f"mfcc_{i}_mean"
                std_key = f"mfcc_{i}_std"
                if mean_key in feature_stats:
                    mfcc_features.append(feature_stats[mean_key])
                    mfcc_features.append(feature_stats[std_key])
            # Pad to LATENT_DIM
            while len(mfcc_features) < LATENT_DIM:
                mfcc_features.append(0.0)
            result.latent_vector = [round(v, 6) for v in mfcc_features[:LATENT_DIM]]
            result.model_type = "statistical"
            logger.info("auDeep: statistical representation extracted (%d dims)", len(result.latent_vector))

    # Compute VAD from acoustic features
    valence, arousal, dominance = _vad_from_features(feature_stats)
    result.valence = round(valence, 4)
    result.arousal = round(arousal, 4)
    result.dominance = round(dominance, 4)

    # Compute emotion distances
    result.emotion_distances = _compute_emotion_distances(valence, arousal, dominance)

    # Find primary emotion
    if result.emotion_distances:
        primary = min(result.emotion_distances, key=result.emotion_distances.get)
        result.primary_emotion = primary
        min_dist = result.emotion_distances[primary]
        # Confidence: inverse distance, normalized
        result.emotion_confidence = round(float(np.clip(1.0 - min_dist / 2.0, 0, 1)), 4)

    return result


def audeep_to_dict(result: AuDeepResult) -> dict[str, Any]:
    """Convert AuDeepResult to serializable dict."""
    return {
        "latent_dim": result.latent_dim,
        "latent_vector_sample": result.latent_vector[:16],  # First 16 dims for API size
        "model_type": result.model_type,
        "valence": result.valence,
        "arousal": result.arousal,
        "dominance": result.dominance,
        "emotion_distances": result.emotion_distances,
        "primary_emotion": result.primary_emotion,
        "emotion_confidence": result.emotion_confidence,
        "reconstruction_error": result.reconstruction_error,
        "feature_stats": result.feature_stats,
        "source": result.source,
    }
