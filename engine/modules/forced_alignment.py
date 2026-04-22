"""Forced Alignment — WebMAUS (BAS Web Services) + MFA (Montreal Forced Aligner)

Provides phone-level segmentation with precise boundaries, replacing
approximate Wav2Vec2 CTC phoneme timing.

Pipeline priority:
  1. MFA (local, faster, no network dependency)
  2. WebMAUS (BAS REST API fallback)
  3. Wav2Vec2 CTC (existing fallback — already in ai_classification.py)
"""

from __future__ import annotations

import json
import logging
import os
import shutil
import subprocess
import tempfile
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

# BAS Web Services endpoint for MAUS
BAS_MAUS_URL = "https://clarin.phonetik.uni-muenchen.de/BASWebServices/services/runMAUS"

# Allow skipping the network fallback entirely (useful for offline / slow links)
SKIP_WEBMAUS = os.getenv("SKIP_WEBMAUS", "0").lower() in {"1", "true", "yes"}
WEBMAUS_TIMEOUT = int(os.getenv("WEBMAUS_TIMEOUT", "15"))


@dataclass
class PhoneSegment:
    """A single phone-level segment from forced alignment."""
    phone: str
    start_ms: float
    end_ms: float
    duration_ms: float
    confidence: float = 1.0
    source: str = "mfa"  # "mfa" | "webmaus" | "wav2vec"


@dataclass
class AlignmentResult:
    """Complete forced alignment output."""
    phones: list[PhoneSegment] = field(default_factory=list)
    words: list[dict[str, Any]] = field(default_factory=list)
    source: str = "none"
    textgrid_path: str | None = None
    success: bool = False
    error: str | None = None


# ── TextGrid Parser ──────────────────────────────────────────────────────

def _parse_textgrid(tg_path: Path) -> tuple[list[PhoneSegment], list[dict]]:
    """Parse a Praat TextGrid file (long or short format) into phone segments."""
    text = tg_path.read_text(encoding="utf-8", errors="replace")
    phones: list[PhoneSegment] = []
    words: list[dict] = []

    if '"IntervalTier"' in text or "IntervalTier" in text:
        phones, words = _parse_textgrid_long(text)
    else:
        phones, words = _parse_textgrid_short(text)

    return phones, words


def _parse_textgrid_long(text: str) -> tuple[list[PhoneSegment], list[dict]]:
    """Parse long-format TextGrid."""
    import re

    phones: list[PhoneSegment] = []
    words: list[dict] = []

    # Split into tiers
    tier_blocks = re.split(r'item\s*\[\d+\]', text)

    for block in tier_blocks:
        is_phone_tier = bool(re.search(r'name\s*=\s*"(phones?|segments?)"', block, re.I))
        is_word_tier = bool(re.search(r'name\s*=\s*"(words?)"', block, re.I))

        if not (is_phone_tier or is_word_tier):
            continue

        intervals = re.findall(
            r'xmin\s*=\s*([\d.]+)\s*xmax\s*=\s*([\d.]+)\s*text\s*=\s*"([^"]*)"',
            block,
        )

        for xmin_s, xmax_s, label in intervals:
            xmin = float(xmin_s)
            xmax = float(xmax_s)
            label = label.strip()
            if not label or label in {"", "sp", "sil", "SIL", "<p:>"}:
                continue

            start_ms = round(xmin * 1000, 2)
            end_ms = round(xmax * 1000, 2)
            dur_ms = round((xmax - xmin) * 1000, 2)

            if is_phone_tier:
                phones.append(PhoneSegment(
                    phone=label, start_ms=start_ms, end_ms=end_ms,
                    duration_ms=dur_ms, source="mfa",
                ))
            elif is_word_tier:
                words.append({
                    "word": label, "start_ms": start_ms,
                    "end_ms": end_ms, "duration_ms": dur_ms,
                })

    return phones, words


def _parse_textgrid_short(text: str) -> tuple[list[PhoneSegment], list[dict]]:
    """Parse short-format TextGrid (fallback)."""
    import re

    phones: list[PhoneSegment] = []
    lines = text.strip().split("\n")

    i = 0
    while i < len(lines):
        line = lines[i].strip().strip('"')
        if line.lower() in ("phones", "phone"):
            # Skip ahead to intervals
            while i < len(lines) and not lines[i].strip().replace('"', '').replace('.', '').replace('-', '').isdigit():
                i += 1
            # Parse intervals: xmin, xmax, label triplets
            while i + 2 < len(lines):
                try:
                    xmin = float(lines[i].strip())
                    xmax = float(lines[i + 1].strip())
                    label = lines[i + 2].strip().strip('"')
                    i += 3
                    if not label or label in {"", "sp", "sil"}:
                        continue
                    phones.append(PhoneSegment(
                        phone=label,
                        start_ms=round(xmin * 1000, 2),
                        end_ms=round(xmax * 1000, 2),
                        duration_ms=round((xmax - xmin) * 1000, 2),
                        source="mfa",
                    ))
                except (ValueError, IndexError):
                    break
        i += 1

    return phones, []


# ── MFA (Montreal Forced Aligner) ────────────────────────────────────────

def _mfa_available() -> bool:
    """Check if MFA is installed and accessible."""
    return shutil.which("mfa") is not None


def _run_mfa(audio_path: Path, transcript: str, language: str = "english") -> AlignmentResult:
    """Run Montreal Forced Aligner on audio + transcript."""
    if not _mfa_available():
        return AlignmentResult(source="mfa", error="MFA not installed")

    tmpdir = tempfile.mkdtemp(prefix="mfa_")
    try:
        # MFA expects a directory with matched .wav + .txt files
        stem = "input"
        wav_dest = Path(tmpdir) / f"{stem}.wav"
        txt_dest = Path(tmpdir) / f"{stem}.txt"
        out_dir = Path(tmpdir) / "output"
        out_dir.mkdir()

        # Copy/convert audio to WAV 16kHz mono
        if audio_path.suffix.lower() == ".wav":
            shutil.copy2(audio_path, wav_dest)
        else:
            proc = subprocess.run(
                ["ffmpeg", "-y", "-i", str(audio_path), "-ar", "16000", "-ac", "1", str(wav_dest)],
                capture_output=True, timeout=60,
            )
            if proc.returncode != 0:
                return AlignmentResult(source="mfa", error="Audio conversion failed for MFA")

        # Write transcript
        txt_dest.write_text(transcript.strip(), encoding="utf-8")

        # Map language to MFA dictionary/acoustic model names
        dict_name = _mfa_model_name(language, "dictionary")
        acoustic_name = _mfa_model_name(language, "acoustic")

        # Run MFA align
        cmd = [
            "mfa", "align",
            str(tmpdir),
            dict_name,
            acoustic_name,
            str(out_dir),
            "--clean",
            "--single_speaker",
            "--output_format", "long_textgrid",
        ]

        logger.info("Running MFA: %s", " ".join(cmd))
        proc = subprocess.run(cmd, capture_output=True, timeout=300, text=True)

        if proc.returncode != 0:
            logger.warning("MFA failed: %s", proc.stderr[:500])
            return AlignmentResult(source="mfa", error=f"MFA exit code {proc.returncode}")

        # Find output TextGrid
        tg_files = list(out_dir.rglob("*.TextGrid"))
        if not tg_files:
            return AlignmentResult(source="mfa", error="MFA produced no TextGrid output")

        tg_path = tg_files[0]
        phones, words = _parse_textgrid(tg_path)

        # Copy TextGrid to uploads for persistence
        persistent_tg = audio_path.with_suffix(".TextGrid")
        shutil.copy2(tg_path, persistent_tg)

        return AlignmentResult(
            phones=phones,
            words=words,
            source="mfa",
            textgrid_path=str(persistent_tg),
            success=True,
        )

    except subprocess.TimeoutExpired:
        return AlignmentResult(source="mfa", error="MFA timed out (300s)")
    except Exception as exc:
        logger.exception("MFA alignment failed")
        return AlignmentResult(source="mfa", error=str(exc))
    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)


def _mfa_model_name(language: str, model_type: str) -> str:
    """Map language code to MFA model name."""
    mapping = {
        "en": ("english_mfa", "english_mfa"),
        "hi": ("hindi_cv", "hindi_cv"),
        "bn": ("bengali_cv", "bengali_cv"),
        "or": ("odia_cv", "odia_cv"),
    }
    pair = mapping.get(language, ("english_mfa", "english_mfa"))
    return pair[0] if model_type == "dictionary" else pair[1]


# ── WebMAUS (BAS Web Services) ───────────────────────────────────────────

def _run_webmaus(audio_path: Path, transcript: str, language: str = "eng-US") -> AlignmentResult:
    if SKIP_WEBMAUS:
        return AlignmentResult(source="webmaus", error="SKIP_WEBMAUS=1")
    """Run BAS WebMAUS for phonetic segmentation via REST API."""
    try:
        import requests
    except ImportError:
        return AlignmentResult(source="webmaus", error="requests library not installed")

    # Map language codes to BAS MAUS language codes
    lang_map = {
        "en": "eng-US", "hi": "hin", "bn": "ben", "or": "ori",
        "eng": "eng-US", "hin": "hin", "ben": "ben", "ori": "ori",
    }
    maus_lang = lang_map.get(language, "eng-US")

    try:
        with open(audio_path, "rb") as af:
            files = {"SIGNAL": (audio_path.name, af, "audio/wav")}
            data = {
                "TEXT": transcript,
                "LANGUAGE": maus_lang,
                "OUTFORMAT": "TextGrid",
                "MODUS": "standard",
                "INSKANTEXTGRID": "true",
                "INSORTTEXTGRID": "true",
            }

            logger.info("Calling WebMAUS API for language=%s (timeout=%ds)", maus_lang, WEBMAUS_TIMEOUT)
            resp = requests.post(BAS_MAUS_URL, files=files, data=data, timeout=WEBMAUS_TIMEOUT)

        if resp.status_code != 200:
            return AlignmentResult(source="webmaus", error=f"WebMAUS HTTP {resp.status_code}")

        # BAS returns XML with download link
        import xml.etree.ElementTree as ET
        root = ET.fromstring(resp.text)

        success_el = root.find(".//success")
        if success_el is None or success_el.text != "true":
            err_msg = root.findtext(".//message", "Unknown WebMAUS error")
            return AlignmentResult(source="webmaus", error=err_msg)

        download_url = root.findtext(".//downloadLink")
        if not download_url:
            return AlignmentResult(source="webmaus", error="No download link in response")

        # Download the TextGrid
        tg_resp = requests.get(download_url, timeout=WEBMAUS_TIMEOUT)
        if tg_resp.status_code != 200:
            return AlignmentResult(source="webmaus", error="Failed to download TextGrid")

        # Save TextGrid
        tg_path = audio_path.with_suffix(".WebMAUS.TextGrid")
        tg_path.write_text(tg_resp.text, encoding="utf-8")

        phones, words = _parse_textgrid(tg_path)

        # Re-tag source
        for p in phones:
            p.source = "webmaus"

        return AlignmentResult(
            phones=phones,
            words=words,
            source="webmaus",
            textgrid_path=str(tg_path),
            success=True,
        )

    except requests.Timeout:
        return AlignmentResult(source="webmaus", error="WebMAUS request timed out (120s)")
    except Exception as exc:
        logger.exception("WebMAUS alignment failed")
        return AlignmentResult(source="webmaus", error=str(exc))


# ── Public API ───────────────────────────────────────────────────────────

def forced_align(
    audio_path: Path,
    transcript: str,
    language: str = "en",
    prefer: str = "mfa",
) -> AlignmentResult:
    """Run forced alignment with fallback chain: MFA → WebMAUS.

    Args:
        audio_path: Path to WAV audio file (16kHz mono recommended).
        transcript: Plain text transcript of the audio.
        language: ISO 639-1 language code (en, hi, bn, or).
        prefer: Preferred aligner ("mfa" or "webmaus").

    Returns:
        AlignmentResult with phone-level segments and word boundaries.
    """
    if not transcript or not transcript.strip():
        return AlignmentResult(error="No transcript provided for alignment")

    # Attempt preferred aligner first
    if prefer == "webmaus":
        result = _run_webmaus(audio_path, transcript, language)
        if result.success:
            logger.info("WebMAUS alignment succeeded: %d phones", len(result.phones))
            return result
        logger.warning("WebMAUS failed (%s), falling back to MFA", result.error)
        result = _run_mfa(audio_path, transcript, language)
    else:
        result = _run_mfa(audio_path, transcript, language)
        if result.success:
            logger.info("MFA alignment succeeded: %d phones", len(result.phones))
            return result
        logger.warning("MFA failed (%s), falling back to WebMAUS", result.error)
        result = _run_webmaus(audio_path, transcript, language)

    if result.success:
        logger.info("%s alignment succeeded: %d phones", result.source, len(result.phones))
    else:
        logger.warning("All forced alignment methods failed: %s", result.error)

    return result


def alignment_to_phoneme_spans(alignment: AlignmentResult) -> list[dict[str, Any]]:
    """Convert AlignmentResult to the phoneme span format used by the rest of the pipeline.

    This produces the same structure as Wav2Vec2 CTC output in ai_classification.py,
    so downstream modules (phoneme_analysis, connected_speech, etc.) work unchanged.
    """
    spans = []
    for seg in alignment.phones:
        spans.append({
            "phoneme": seg.phone,
            "start_ms": seg.start_ms,
            "end_ms": seg.end_ms,
            "duration_ms": seg.duration_ms,
            "confidence": seg.confidence,
            "source": seg.source,
        })
    return spans
