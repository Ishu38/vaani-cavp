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

# Default to sm (small) model for CPU-viable NLP. The trf (transformer) model
# is GPU-dependent and only needed for MLAF formal grammar / research runs.
# en_core_web_sm provides POS tags, dependency parse, constituency tree —
# everything the FC/LR/GRA IELTS rubrics need — in ~300ms on CPU.
SPACY_MODEL: str = os.getenv("SPACY_MODEL", "en_core_web_sm")

UPLOAD_DIR: Path = Path(os.getenv("UPLOAD_DIR", "./uploads")).resolve()
NLTK_DATA: Path = Path.home() / "nltk_data"

# Shared secret for server-to-engine authentication
ENGINE_API_KEY: str = os.getenv("ENGINE_API_KEY", "")
