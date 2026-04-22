from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")


def _detect_device() -> str:
    """Auto-detect best available device: cuda > cpu."""
    explicit = os.getenv("WHISPER_DEVICE")
    if explicit:
        return explicit
    try:
        import torch
        if torch.cuda.is_available():
            return "cuda"
    except ImportError:
        pass
    return "cpu"


WHISPER_MODEL: str = os.getenv("WHISPER_MODEL", "base")
WHISPER_DEVICE: str = _detect_device()
TORCH_DEVICE: str = WHISPER_DEVICE  # Shared device for all torch models

# Use lighter spaCy model on CPU to avoid transformer overhead
SPACY_MODEL: str = os.getenv(
    "SPACY_MODEL",
    "en_core_web_trf" if WHISPER_DEVICE == "cuda" else "en_core_web_sm",
)

UPLOAD_DIR: Path = Path(os.getenv("UPLOAD_DIR", "./uploads")).resolve()
NLTK_DATA: Path = Path.home() / "nltk_data"

# Shared secret for server-to-engine authentication
ENGINE_API_KEY: str = os.getenv("ENGINE_API_KEY", "")
