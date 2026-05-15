"""CONTRASTIVE ACOUSTIC VOICE PROFILING — FastAPI Engine

Main orchestration server. 10 processing layers:
  1. TRANSCRIPTION  — Whisper
  2. FEATURE EXTRACTION — Parselmouth, librosa, OpenSMILE
  3. AI CLASSIFICATION — Wav2Vec 2.0, SpeechBrain, langdetect
  4. NLP — spaCy, NLTK
  5. PHONEME ANALYSIS — Formant extraction, vowel space, accuracy scoring
  6. MORPHEME BOUNDARY — Cognitive load, emotional stress, codeswitching
  7. PROSODIC PROFILING — Rhythm, intonation, stress patterns
  8. CONNECTED SPEECH — Assimilation, elision, linking
  9. VOICE QUALITY — HNR, breathiness, nasality, register
  10. L1 INTERFERENCE — Bhojpuri, Hindi, Bangla, Odia detection + CIF model
"""

import asyncio
import logging
import os
import time
import uuid
from pathlib import Path
from typing import Any, Dict

from fastapi import FastAPI, File, Form, HTTPException, UploadFile, Request, Security, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import APIKeyHeader
from pydantic import BaseModel
from slowapi import Limiter
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from starlette.responses import JSONResponse

from config import WHISPER_MODEL, WHISPER_DEVICE, TORCH_DEVICE, SPACY_MODEL, UPLOAD_DIR, ENGINE_API_KEY
from utils.serializers import to_dict

# Maximum upload size: 50 MB
MAX_UPLOAD_BYTES = 50 * 1024 * 1024

# Maximum time for a single analysis pipeline run (seconds)
ANALYSIS_TIMEOUT = int(os.getenv("ANALYSIS_TIMEOUT", "300"))  # 5 minutes

# Pipeline concurrency limit. The Whisper model + Wav2Vec instances are global
# singletons sharing a single GPU's KV-cache; running them in parallel from
# `asyncio.to_thread` corrupts attention state and yields
# `RuntimeError: Key and Value must have the same sequence length`. We
# serialize pipeline runs with a semaphore — concurrent HTTP requests queue
# behind it instead of racing on shared model state. Tune via PIPELINE_CONCURRENCY
# only if you genuinely have multiple GPUs and per-GPU model copies.
PIPELINE_CONCURRENCY = max(1, int(os.getenv("PIPELINE_CONCURRENCY", "1")))
_pipeline_sem: asyncio.Semaphore | None = None  # initialized on startup
_shutting_down: bool = False  # set True on SIGTERM/SIGINT; reject new work
_pipeline_busy_since: float = 0.0  # monotonic timestamp when semaphore was acquired

# Stamped on every analyze response so consumers can pin results to an engine build.
ENGINE_VERSION = os.getenv("ENGINE_VERSION", "vaani-engine@2026.05")

# Acoustic-core mode. When true (default in production), the pipeline runs
# only the layers that produce *measured* acoustic features — Whisper +
# forced alignment + Praat (formants/pitch/voice-quality) + librosa rhythm
# + Layer 4b acoustic substitution pairing + Layer 10 L1-catalog matching
# + CIF (against calibrated L1s only). Non-acoustic / interpretive layers
# (spaCy morphology+syntax linguistic scoring, MLAF formal grammar, Layer
# 10b syntactic L1, Layer 11 abductive) are skipped — they remain as
# optional add-ons gated by their own env flags but the core surface
# never depends on them. Set ACOUSTIC_CORE_ONLY=false to restore the full
# pipeline (e.g. for calibration or research runs).
ACOUSTIC_CORE_ONLY = os.getenv("ACOUSTIC_CORE_ONLY", "true").lower() in ("1", "true", "yes")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)
logger.info("Engine config: device=%s, whisper_model=%s, spacy=%s", TORCH_DEVICE, WHISPER_MODEL, SPACY_MODEL)

# ── Rate Limiting ────────────────────────────────────────────────────────
limiter = Limiter(key_func=get_remote_address)

app = FastAPI(
    title="Contrastive Acoustic Voice Profiling Engine",
    version="1.0.0",
)
app.state.limiter = limiter

@app.exception_handler(RateLimitExceeded)
async def rate_limit_handler(request: Request, exc: RateLimitExceeded):
    return JSONResponse(
        status_code=429,
        content={"detail": "Rate limit exceeded. Please try again later."},
    )


# Global handler for explicit-but-uncalibrated L1 codes. resolve_l1_code()
# raises UnsupportedL1Error rather than silently downgrading to the default
# attractor, but only one endpoint catches it inline — every other endpoint
# that resolves an L1 would otherwise surface a 500. This handler turns it
# into a clean 422 with the offending code so gateway/clients can show a
# precise "L1 'xx' is not supported in this release" message.
from modules.l1_targets import (
    UnsupportedL1Error,
    CALIBRATED_L1_CODES,
)


@app.exception_handler(UnsupportedL1Error)
async def unsupported_l1_handler(request: Request, exc: UnsupportedL1Error):
    return JSONResponse(
        status_code=422,
        content={
            "detail": str(exc),
            "code": getattr(exc, "code", None),
            "supported": sorted(CALIBRATED_L1_CODES),
        },
    )

# ── API Key Authentication ───────────────────────────────────────────────
_api_key_header = APIKeyHeader(name="X-Engine-API-Key", auto_error=False)

async def verify_engine_api_key(api_key: str = Security(_api_key_header)) -> str:
    """Verify the shared secret between NestJS server and this engine."""
    if not ENGINE_API_KEY:
        # In production, refuse unauthenticated requests
        env = os.getenv("ENVIRONMENT", os.getenv("NODE_ENV", "development"))
        if env == "production":
            raise HTTPException(status_code=500, detail="ENGINE_API_KEY is not configured — refusing to run unauthenticated in production")
        logger.warning("ENGINE_API_KEY not set — engine is unauthenticated (development mode only)")
        return ""
    if not api_key or api_key != ENGINE_API_KEY:
        raise HTTPException(status_code=403, detail="Invalid or missing engine API key")
    return api_key

_cors_env = os.getenv("CORS_ORIGINS", "")
_cors_origins = [o.strip() for o in _cors_env.split(",") if o.strip()] if _cors_env else [
    "http://localhost:3001",
    "http://localhost:5173",
    "http://127.0.0.1:3001",
    "http://127.0.0.1:5173",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_methods=["GET", "POST"],
    allow_headers=["Authorization", "Content-Type", "X-Engine-API-Key"],
)

UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


# ── Stale upload cleanup (safety net) ────────────────────────────────────
# Runs hourly to catch any uploads not cleaned up by endpoint finally blocks
_STALE_FILE_AGE_SECONDS = 3600  # 1 hour


async def _cleanup_stale_uploads():
    """Periodically delete upload files older than 1 hour (safety net)."""
    while True:
        await asyncio.sleep(3600)
        try:
            now = time.time()
            count = 0
            for f in UPLOAD_DIR.iterdir():
                if f.is_file() and (now - f.stat().st_mtime) > _STALE_FILE_AGE_SECONDS:
                    f.unlink(missing_ok=True)
                    count += 1
            if count:
                logger.info("Stale upload cleanup: removed %d orphaned files", count)
        except Exception as exc:
            logger.warning("Stale upload cleanup error: %s", exc)


@app.on_event("startup")
async def _start_cleanup_task():
    global _pipeline_sem, _shutting_down
    _pipeline_sem = asyncio.Semaphore(PIPELINE_CONCURRENCY)
    _shutting_down = False
    logger.info("Pipeline serialization: semaphore size=%d", PIPELINE_CONCURRENCY)
    asyncio.create_task(_cleanup_stale_uploads())
    asyncio.create_task(_prewarm_models())


@app.on_event("shutdown")
async def _stop_gracefully():
    """Refuse new work and let in-flight requests complete within a grace period."""
    global _shutting_down
    _shutting_down = True
    logger.info("Shutdown signal received — refusing new pipeline submissions")


async def _prewarm_models():
    """Force-load Whisper + spaCy + Wav2Vec2 + spawn parselmouth subprocess on startup
    so the first analyze request doesn't pay the model-load tax."""
    import time
    t_start = time.time()
    logger.info("Pre-warming Whisper (%s) + spaCy (%s) + Wav2Vec2 + Praat subprocess…", WHISPER_MODEL, SPACY_MODEL)
    try:
        from modules.transcription import _load_whisper
        from modules.nlp_layer import _load_spacy
        from modules.feature_extraction import prewarm_praat_pool
        await asyncio.to_thread(_load_whisper, WHISPER_MODEL, TORCH_DEVICE)
        logger.info("Whisper warm in %.1fs", time.time() - t_start)
        t_spacy = time.time()
        await asyncio.to_thread(_load_spacy, SPACY_MODEL)
        logger.info("spaCy warm in %.1fs", time.time() - t_spacy)
        t_praat = time.time()
        await asyncio.to_thread(prewarm_praat_pool)
        logger.info("Praat subprocess warm in %.1fs", time.time() - t_praat)
        # Pre-load Wav2Vec2 models (cold-load tax: 20-30s on first request)
        try:
            t_wav = time.time()
            from modules.ai_classification import _load_wav2vec, _load_wav2vec_phoneme
            await asyncio.to_thread(_load_wav2vec)
            logger.info("Wav2Vec2 letter-CTC warm in %.1fs", time.time() - t_wav)
            t_wavp = time.time()
            await asyncio.to_thread(_load_wav2vec_phoneme)
            logger.info("Wav2Vec2 phoneme-CTC warm in %.1fs", time.time() - t_wavp)
        except Exception as e:
            logger.warning("Wav2Vec2 pre-warm failed (non-fatal): %s", e)
        logger.info("Pre-warm complete in %.1fs total", time.time() - t_start)
    except Exception as e:
        logger.warning("Pre-warm failed (non-fatal): %s", e)


def _assess_degraded_layers(profile: dict[str, Any]) -> list[dict[str, Any]]:
    """Inspect the pipeline output for degradation flags across all layers.

    Returns a list of {layer, severity, reason} dicts. Severity levels:
      - "degraded"  — layer ran but with reduced fidelity
      - "unavailable" — layer failed entirely / skipped in this mode
      - "low_confidence" — layer ran but input quality undermines trust

    This is surfaced in the API response so UIs can render confidence indicators
    and users understand why a band might carry higher variance.
    """
    degraded: list[dict[str, Any]] = []

    # Layer 1: Transcription
    tx = profile.get("transcription") or {}
    if tx.get("language") == "unknown":
        degraded.append({"layer": "transcription", "severity": "degraded", "reason": "language detection failed"})

    # Layer 1b: Forced Alignment
    fa = profile.get("forced_alignment") or {}
    fa_quality = fa.get("quality") or "unavailable"
    if fa_quality == "unavailable":
        degraded.append({"layer": "forced_alignment", "severity": "unavailable", "reason": fa.get("error", "no aligner available")})
    elif fa_quality == "low":
        degraded.append({"layer": "forced_alignment", "severity": "low_confidence", "reason": f"ran on {fa.get('source', 'fallback')} — boundaries are interpolated, not acoustically aligned"})

    # Layer 2: Feature Extraction (Praat)
    fe_pm = (profile.get("feature_extraction") or {}).get("parselmouth") or {}
    if fe_pm.get("tracking_ok") is False and fe_pm.get("tracking_reason"):
        degraded.append({"layer": "feature_extraction.parselmouth", "severity": "degraded", "reason": fe_pm.get("tracking_reason")})

    # Layer 2b: VoiceSauce
    vs = profile.get("voicesauce") or {}
    if vs.get("error"):
        degraded.append({"layer": "voicesauce", "severity": "unavailable", "reason": vs.get("error")})

    # Layer 3b: auDeep
    ad = profile.get("audeep") or {}
    if ad.get("error"):
        degraded.append({"layer": "audeep", "severity": "unavailable", "reason": ad.get("error")})

    # Layer 4: NLP — morphology / syntax skipped in acoustic-core
    nlp = profile.get("nlp") or {}
    if nlp.get("morphology") is None and nlp.get("syntax") is None:
        degraded.append({"layer": "nlp.morphosyntax", "severity": "unavailable", "reason": "skipped in acoustic-core mode — FC/LR/GRA criteria not scored"})

    # Layer 4b: MLAF Formal Grammar
    fg = nlp.get("formal_grammar") or {}
    if not fg.get("available", True):
        degraded.append({"layer": "nlp.formal_grammar", "severity": "unavailable", "reason": fg.get("reason_unavailable", "skipped")})

    # Layer 4b: Phoneme Pairing
    events = profile.get("event_summary") or {}
    if events.get("total_events", 0) == 0:
        degraded.append({"layer": "phoneme_pairing", "severity": "degraded", "reason": "no substitution/insertion/deletion events — forced alignment and/or wav2vec CTC may be unavailable"})

    # Layer 5: Phoneme Analysis
    pa = profile.get("phoneme_analysis") or {}
    if pa.get("overall_accuracy") is None:
        degraded.append({"layer": "phoneme_analysis", "severity": "unavailable", "reason": "no phoneme spans available for accuracy scoring"})

    # Layer 9: Voice Quality
    vq = profile.get("voice_quality") or {}
    if vq.get("tracking_ok") is False and vq.get("tracking_reason"):
        degraded.append({"layer": "voice_quality", "severity": "degraded", "reason": vq.get("tracking_reason")})

    # Layer 10: L1 Interference
    l1 = profile.get("l1_interference") or {}
    if l1.get("l1_interference_score", 0) == 0 and not l1.get("detected_patterns"):
        degraded.append({"layer": "l1_interference", "severity": "low_confidence", "reason": "no L1 interference patterns detected — may indicate insufficient audio or uncalibrated L1"})

    # Layer 10b: Syntactic L1
    sl1 = profile.get("l1_interference_syntactic") or {}
    if not sl1.get("available", True):
        degraded.append({"layer": "l1_interference_syntactic", "severity": "unavailable", "reason": sl1.get("reason_unavailable", "skipped")})

    # CIF Trajectory
    cif = profile.get("cif_analysis") or {}
    if cif.get("trajectory_unavailable_reason"):
        degraded.append({"layer": "cif_trajectory", "severity": "low_confidence", "reason": cif.get("trajectory_unavailable_reason")})

    # Audio quality
    aq = profile.get("audio_quality") or {}
    if aq.get("data_quality_score", 1.0) < 0.5:
        degraded.append({"layer": "audio_quality", "severity": "low_confidence", "reason": f"data quality score {aq.get('data_quality_score', 0):.2f} — consider re-recording in a quieter environment"})

    return degraded


async def _run_pipeline_serialized(audio_path: Path, gender: str, run_opensmile: bool, run_sb: bool, l1_language: str = "auto", audio_class: str = "normal", fast_mode: bool = False) -> dict[str, Any]:
    """Acquire the pipeline semaphore, then run the full pipeline in a worker thread.

    Concurrent callers queue here — Whisper + Wav2Vec are shared global singletons
    and parallel access corrupts their CUDA attention state.

    During shutdown, rejects new submissions immediately with 503 so callers
    get a clean error instead of an indefinite hang.
    """
    global _pipeline_busy_since
    if _shutting_down:
        raise HTTPException(503, "Engine is shutting down — retry in a few seconds")
    assert _pipeline_sem is not None, "_pipeline_sem not initialized — startup did not complete"
    async with _pipeline_sem:
        if _shutting_down:
            raise HTTPException(503, "Engine is shutting down — retry in a few seconds")
        _pipeline_busy_since = time.monotonic()
        try:
            return await asyncio.wait_for(
                asyncio.to_thread(_run_full_pipeline, audio_path, gender, run_opensmile, run_sb, l1_language, audio_class, fast_mode),
                timeout=ANALYSIS_TIMEOUT,
            )
        finally:
            _pipeline_busy_since = 0.0


# ── Pydantic models ──────────────────────────────────────────────────────

class HealthResponse(BaseModel):
    status: str


class AnalysisRequest(BaseModel):
    gender: str = "neutral"
    language: str = "en"
    opensmile_features: bool = False
    run_speechbrain: bool = False


# ── Helpers ───────────────────────────────────────────────────────────────

async def _save_upload(upload: UploadFile) -> Path:
    import subprocess

    # Use UUID filename to eliminate path traversal risk entirely
    ext = Path(upload.filename).suffix.lower() if upload.filename else ".wav"
    allowed_ext = {".wav", ".mp3", ".ogg", ".webm", ".flac", ".m4a", ".opus"}
    if ext not in allowed_ext:
        ext = ".wav"
    unique_name = f"{uuid.uuid4()}{ext}"
    dest = UPLOAD_DIR / unique_name

    content = await upload.read()
    if not content:
        raise HTTPException(400, "Uploaded file is empty")
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, f"File too large (max {MAX_UPLOAD_BYTES // (1024*1024)}MB)")
    dest.write_bytes(content)

    # Convert non-wav formats to wav using ffmpeg (Praat/Parselmouth requires wav)
    if dest.suffix.lower() in {".webm", ".ogg", ".m4a", ".mp3", ".flac", ".opus"}:
        wav_dest = dest.with_suffix(".wav")
        try:
            proc = subprocess.run(
                ["ffmpeg", "-y", "-i", str(dest), "-ar", "16000", "-ac", "1", str(wav_dest)],
                capture_output=True, timeout=120,
            )
            if proc.returncode != 0:
                stderr = proc.stderr.decode(errors="replace")
                logger.error("ffmpeg conversion failed: %s", stderr)
                raise HTTPException(500, "Audio conversion failed")
            # Validate converted file
            if not wav_dest.exists() or wav_dest.stat().st_size < 44:
                raise HTTPException(500, "Audio conversion produced invalid output")
            dest.unlink(missing_ok=True)
            dest = wav_dest
        except subprocess.TimeoutExpired:
            dest.unlink(missing_ok=True)
            raise HTTPException(500, "Audio conversion timed out")
        except FileNotFoundError:
            raise HTTPException(500, "ffmpeg not installed — cannot convert audio")

    return dest


def _run_full_pipeline(audio_path: Path, gender: str, run_opensmile: bool, run_sb: bool, l1_language: str = "auto", audio_class: str = "normal", fast_mode: bool = False) -> dict[str, Any]:
    """Run the full processing pipeline synchronously (called via to_thread)."""
    from modules.transcription import transcribe
    from modules.feature_extraction import extract_parselmouth, extract_librosa, extract_opensmile
    from modules.ai_classification import classify_phonemes, classify_phonemes_ipa, classify_speechbrain, detect_language
    from modules.nlp_layer import analyze_morphology, analyze_syntax, analyze_phoneme_inventory
    from modules.phoneme_analysis import analyze_phonemes
    from modules.morpheme_boundary import analyze_morpheme_boundaries
    from modules.prosodic_profiling import profile_prosody
    from modules.connected_speech import analyze_connected_speech
    from modules.voice_quality import profile_voice_quality
    from modules.forced_alignment import forced_align, alignment_to_phoneme_spans
    from modules.voicesauce import analyze_voicesauce, voicesauce_to_dict
    from modules.audeep import analyze_audeep, audeep_to_dict

    results: dict[str, Any] = {}
    t0 = time.time()

    # ── Fast Mode: trim audio to first 15s for rapid analysis ─────
    # Full Praat formant tracking on a 60s clip takes 90+s; on a 15s
    # window it takes ~15-20s. The first 15s carries enough acoustic
    # signal for all CIF dimensions: prosody baseline, voice quality, L1
    # formant footprint.
    if fast_mode:
        import subprocess as _sp
        _trimmed = audio_path.with_name(audio_path.stem + "_trim15.wav")
        try:
            _sp.run(["ffmpeg", "-y", "-i", str(audio_path), "-t", "15", "-ar", "16000", "-ac", "1", str(_trimmed)],
                    capture_output=True, timeout=30, check=True)
            if _trimmed.exists() and _trimmed.stat().st_size > 44:
                logger.info("Fast mode: trimmed audio to first 15s (%.1f KB)", _trimmed.stat().st_size/1024)
                audio_path = _trimmed
        except Exception:
            logger.warning("Fast mode audio trim failed — using full clip")

    # ── Layer 1: Transcription (single Whisper pass — text + word timestamps) ──
    # Fast mode: CPU-only whisper-tiny (~2-3s vs 5-8s for base on GPU).
    # The tiny model has lower word accuracy but preserves prosodic boundaries,
    # formant alignment, and rhythm features — all the acoustic-core surface needs.
    wh_model = "tiny" if fast_mode else WHISPER_MODEL
    wh_device = "cpu" if fast_mode else WHISPER_DEVICE
    logger.info("Layer 1: Transcription (%s on %s, fast=%s)", wh_model, wh_device, fast_mode)
    transcription = transcribe(audio_path, wh_model, wh_device, word_timestamps=True)
    results["transcription"] = {
        "text": transcription.text,
        "language": transcription.language,
        "language_probability": transcription.language_probability,
        "duration_seconds": transcription.duration_seconds,
        "segments": [{"start": s.start, "end": s.end, "text": s.text} for s in transcription.segments],
        "word_timestamps": transcription.word_timestamps,
    }

    # ── Layer 1b: Forced Alignment (wav2vec2-CTC) ────────────────────
    # Fast mode: skip GPU-dependent forced alignment. Whisper word
    # timestamps are sufficient for prosody/rhythm/voice-quality scoring.
    # This saves 5-8s of GPU time and avoids the wav2vec2-CTC model load.
    if fast_mode:
        logger.info("Layer 1b: Forced Alignment — skipped (fast mode)")
        results["forced_alignment"] = {
            "source": "none",
            "quality": "unavailable",
            "error": "skipped in fast mode",
            "num_phones": 0,
            "phones": [],
        }
    else:
        logger.info("Layer 1b: Forced Alignment (wav2vec2-CTC)")
        _ALIGNMENT_QUALITY = {
            "wav2vec2_ctc": "high",
            "none":         "unavailable",
        }
        alignment = None
        try:
            alignment = forced_align(
                audio_path=audio_path,
                transcript=transcription.text,
                language=transcription.language or "en",
                word_timestamps=transcription.word_timestamps,
            )
            if alignment.success:
                _align_quality = _ALIGNMENT_QUALITY.get(alignment.source, "low")
                results["forced_alignment"] = {
                    "source": alignment.source,
                    "quality": _align_quality,
                    "num_phones": len(alignment.phones),
                    "phones": alignment_to_phoneme_spans(alignment),
                    "words": alignment.words,
                    "textgrid_path": alignment.textgrid_path,
                }
                logger.info("Forced alignment: %d phones via %s (quality=%s)",
                            len(alignment.phones), alignment.source, _align_quality)
            else:
                results["forced_alignment"] = {
                    "source": "none",
                    "quality": "unavailable",
                    "error": alignment.error,
                    "num_phones": 0,
                    "phones": [],
                }
                logger.warning("Forced alignment unavailable: %s", alignment.error)
        except Exception as exc:
            logger.warning("Forced alignment failed: %s", exc)
            results["forced_alignment"] = {"source": "none", "error": str(exc), "num_phones": 0, "phones": []}

    # ── Layer 2: Feature Extraction ───────────────────────────────────
    logger.info("Layer 2: Feature Extraction (audio_class=%s)", audio_class)
    praat = extract_parselmouth(audio_path, gender, audio_class=audio_class)
    lib = extract_librosa(audio_path)
    results["feature_extraction"] = {
        "parselmouth": to_dict(praat),
        "librosa": to_dict(lib),
    }
    if run_opensmile:
        osm = extract_opensmile(audio_path)
        if osm:
            results["feature_extraction"]["opensmile"] = to_dict(osm)

    # ── Layer 2b: VoiceSauce Spectral Measures ────────────────────────
    if fast_mode:
        logger.info("Layer 2b: VoiceSauce — skipped (fast mode)")
        results["voicesauce"] = {"source": "voicesauce", "reason_unavailable": "skipped in fast mode"}
    else:
        logger.info("Layer 2b: VoiceSauce Spectral Analysis")
        try:
            vs_result = analyze_voicesauce(audio_path, gender)
            results["voicesauce"] = voicesauce_to_dict(vs_result)
            logger.info("VoiceSauce: phonation=%s, breathiness=%.2f, creak=%.2f",
                         vs_result.phonation_type, vs_result.breathiness_index, vs_result.creak_index)
        except Exception as exc:
            logger.warning("VoiceSauce analysis failed: %s", exc)
            results["voicesauce"] = {"source": "voicesauce", "error": str(exc)}

    # ── Layer 3: AI Classification ────────────────────────────────────
    # Fast mode: skip GPU-dependent Wav2Vec2 CTC models (letter + phoneme).
    # Language detection (langdetect) is CPU-only and always runs.
    logger.info("Layer 3: AI Classification")
    wav2vec = None
    wav2vec_ipa = None
    lang_detect = None
    if not fast_mode:
        try:
            wav2vec = classify_phonemes(audio_path)
        except Exception as exc:
            logger.warning("Wav2Vec letter CTC classification failed: %s", exc)
        try:
            wav2vec_ipa = classify_phonemes_ipa(audio_path)
            if wav2vec_ipa:
                logger.info("Wav2Vec phoneme CTC: %d spans via %s",
                            len(wav2vec_ipa.phonemes), wav2vec_ipa.model_name)
        except Exception as exc:
            logger.warning("Wav2Vec phoneme CTC classification failed: %s", exc)
    else:
        logger.info("Wav2Vec2 CTC models skipped in fast mode")
    try:
        lang_detect = detect_language(transcription.text)
    except Exception as exc:
        logger.warning("Language detection failed: %s", exc)
    results["ai_classification"] = {
        "wav2vec": to_dict(wav2vec) if wav2vec else None,
        "wav2vec_phoneme": to_dict(wav2vec_ipa) if wav2vec_ipa else None,
        "language_detection": to_dict(lang_detect) if lang_detect else None,
    }
    if run_sb:
        try:
            sb = classify_speechbrain(audio_path)
            results["ai_classification"]["speechbrain"] = to_dict(sb)
        except Exception as exc:
            logger.warning("SpeechBrain classification failed: %s", exc)

    # ── Layer 3b: auDeep Emotional Representations ────────────────────
    if fast_mode:
        logger.info("Layer 3b: auDeep — skipped (fast mode)")
        results["audeep"] = {"source": "audeep", "reason_unavailable": "skipped in fast mode"}
    else:
        logger.info("Layer 3b: auDeep Deep Emotional Analysis")
        try:
            audeep_result = analyze_audeep(audio_path)
            results["audeep"] = audeep_to_dict(audeep_result)
            logger.info("auDeep: %s (%.2f) via %s, V=%.2f A=%.2f D=%.2f",
                         audeep_result.primary_emotion, audeep_result.emotion_confidence,
                         audeep_result.model_type,
                         audeep_result.valence, audeep_result.arousal, audeep_result.dominance)
        except Exception as exc:
            logger.warning("auDeep analysis failed: %s", exc)
            results["audeep"] = {"source": "audeep", "error": str(exc)}

    # ── Layer 4: NLP ──────────────────────────────────────────────────
    # In acoustic-core mode we skip morphology+syntax — these are linguistic,
    # not acoustic, and feed only the LR/GRA rubric branches that the
    # acoustic-core release does not surface. We still keep phoneme
    # inventory because it derives from wav2vec phoneme output (signal,
    # not text). Always run NLP for FC/LR/GRA support — the lighter sm model
    # is CPU-viable (~300ms per text) and produces morphology/syntax signals
    # the rubric needs. Only the heavier linguistic layers (MLAF, syntactic
    # L1, abductive) remain gated behind ACOUSTIC_CORE_ONLY.
    logger.info("Layer 4: NLP")
    try:
        morph = analyze_morphology(transcription.text, SPACY_MODEL)
        syntax = analyze_syntax(transcription.text)
    except Exception as exc:
        logger.warning("Layer 4 NLP failed: %s — FC/LR/GRA will degrade", exc)
        morph = None
        syntax = None
    phoneme_inv = None
    if wav2vec:
        phoneme_seq = [p.phoneme for p in wav2vec.phonemes]
        phoneme_inv = analyze_phoneme_inventory(phoneme_seq)
    results["nlp"] = {
        "morphology": to_dict(morph) if morph else None,
        "syntax": to_dict(syntax) if syntax else None,
        "phoneme_inventory": to_dict(phoneme_inv) if phoneme_inv else None,
    }

    # ── Layer 4b: MLAF Formal Grammar (W1, 2026-05-06) ─────────────
    # Symbolic phrase-structure analysis via SWI-Prolog. Pure CPU.
    # If SWI-Prolog is not installed, returns available=False gracefully.
    # Feeds from spaCy parse trees (already running) — no extra cost.
    logger.info("Layer 4b: MLAF Formal Grammar")
    try:
        from modules.nlp_layer import analyze_formal_grammar
        formal = analyze_formal_grammar(transcription.text, SPACY_MODEL)
        results["nlp"]["formal_grammar"] = formal
        if formal.get("available"):
            s = formal.get("summary", {})
            logger.info("Layer 4b: %d/%d clauses parsed, %d violations %s",
                        s.get("parsed_clauses", 0), s.get("total_clauses", 0),
                        s.get("total_violations", 0), s.get("by_kind", {}))
        else:
            logger.info("Layer 4b: unavailable (%s)", formal.get("reason_unavailable"))
    except Exception as exc:
        logger.warning("Layer 4b MLAF formal grammar failed: %s", exc)
        results["nlp"]["formal_grammar"] = {
            "available": False, "reason_unavailable": f"runtime error: {exc}",
        }

    formant_dict = to_dict(praat.formants)
    pitch_dict = to_dict(praat.pitch)
    vq_dict = to_dict(praat.voice_quality)
    librosa_dict = to_dict(lib)

    # ── Layer 4b: Phoneme Pairing (NW alignment) ─────────────────────
    # Run NW alignment between forced-aligned reference phones and wav2vec
    # phoneme-CTC output FIRST, so downstream layers (5 phoneme-analysis,
    # 8 connected-speech, 10 L1-detection) can all consume the events.
    logger.info("Layer 4b: Phoneme Pairing (NW alignment, ref vs wav2vec)")
    phoneme_spans = []
    fa_phones = results.get("forced_alignment", {}).get("phones", [])
    if fa_phones:
        phoneme_spans = fa_phones
        logger.info("Using forced alignment phonemes (%d phones) for downstream analysis", len(phoneme_spans))
    elif wav2vec:
        phoneme_spans = [to_dict(p) for p in wav2vec.phonemes]
        logger.info("Using Wav2Vec CTC phonemes (%d phones) for downstream analysis", len(phoneme_spans))
    word_ts = transcription.word_timestamps

    substitution_events: list[dict[str, Any]] = []
    event_summary: dict[str, Any] = {}
    pattern_evidence_pairs: list[tuple[Any, list[Any]]] = []  # raw, used by Layer 10
    try:
        from modules.phoneme_pairing import pair_phonemes, summarize_events
        if fa_phones and wav2vec_ipa and wav2vec_ipa.phonemes:
            _src = fa_phones[0].get("source") or ""
            if _src == "webmaus":
                ref_source = "catalog"
            elif _src == "whisper_g2p":
                ref_source = "espeak"          # phonemizer outputs eSpeak
            else:
                ref_source = "arpabet"          # MFA default
            _events = pair_phonemes(
                reference=fa_phones,
                recognized=wav2vec_ipa.phonemes,
                reference_source=ref_source,
                recognized_source="espeak",
                algorithm="nw",
            )
            substitution_events = [e.to_dict() for e in _events]
            event_summary = summarize_events(_events)
            pattern_evidence_pairs = [(e, _events) for e in _events]  # cache for L10 if needed
            logger.info("Layer 4b: %d events (sub=%d del=%d ins=%d)",
                        event_summary["total_events"], event_summary["substitutions"],
                        event_summary["deletions"], event_summary["insertions"])
        else:
            logger.info("Layer 4b: skipped (need forced_alignment + wav2vec_ipa)")
    except Exception as exc:
        logger.warning("Layer 4b phoneme pairing failed: %s", exc)
    results["substitution_events"] = substitution_events
    results["event_summary"] = event_summary

    # ── Layer 5: Phoneme Analysis (consumes Layer 4b events) ───────
    logger.info("Layer 5: Phoneme Analysis")
    pa = analyze_phonemes(phoneme_spans, formant_dict, word_ts, substitution_events=substitution_events)
    results["phoneme_analysis"] = to_dict(pa)

    # ── Layer 6: Morpheme Boundary + Cognitive Load ────────────────
    # Note: in acoustic-core mode `syntax` is None (Layer 4 spaCy syntax was
    # skipped). Layer 6 then runs without morpheme priors — the boundary
    # detector still produces pause/stress timing from acoustic data alone,
    # which is what the acoustic-core surface needs.
    logger.info("Layer 6: Morpheme Boundary + Cognitive Load")
    morpheme_list = [to_dict(m) for m in syntax.morphemes] if (syntax and syntax.morphemes) else []
    mb = analyze_morpheme_boundaries(
        word_timestamps=word_ts,
        transcript=transcription.text,
        pitch_data=pitch_dict,
        voice_quality=vq_dict,
        duration_seconds=transcription.duration_seconds,
        morphemes=morpheme_list,
    )
    results["morpheme_boundary"] = to_dict(mb)

    # ── Layer 7: Prosodic Profiling ────────────────────────────────
    logger.info("Layer 7: Prosodic Profiling")
    pp = profile_prosody(
        word_timestamps=word_ts,
        pitch_data=pitch_dict,
        duration_seconds=transcription.duration_seconds,
        total_pause_ms=mb.total_pause_time_ms,
    )
    results["prosodic_profile"] = to_dict(pp)

    # ── Layer 8: Connected Speech (consumes Layer 4b events) ───────
    logger.info("Layer 8: Connected Speech")
    cs = analyze_connected_speech(
        word_timestamps=word_ts,
        phoneme_spans=phoneme_spans,
        transcript=transcription.text,
        formant_trajectories=formant_dict,
        substitution_events=substitution_events,
    )
    results["connected_speech"] = to_dict(cs)

    # ── Layer 9: Voice Quality ─────────────────────────────────────
    logger.info("Layer 9: Voice Quality")
    vq = profile_voice_quality(
        formant_data=formant_dict,
        pitch_data=pitch_dict,
        voice_quality_data=vq_dict,
        librosa_features=librosa_dict,
        audio_path=str(audio_path),
    )
    results["voice_quality"] = to_dict(vq)

    # ── Layer 10: L1 Interference Detection (Bengali + Hindi only — calibrated)
    logger.info("Layer 10: L1 Interference Detection")
    from modules.l1_targets import (
        detect_l1_interference,
        resolve_l1_code,
        UnsupportedL1Error,
    )
    # Try langdetect result first, then Whisper's detected language as fallback
    detected_iso = None
    if lang_detect and hasattr(lang_detect, "language"):
        detected_iso = lang_detect.language
    elif isinstance(lang_detect, dict):
        detected_iso = lang_detect.get("language")
    if not detected_iso and transcription.language:
        detected_iso = transcription.language
    try:
        l1_code = resolve_l1_code(detected_iso, l1_language)
    except UnsupportedL1Error as exc:
        # An explicit, uncalibrated L1 — bubble up as a 422 so the gateway
        # surfaces a clear "not supported in this release" message instead of
        # silently scoring against a literature-default attractor.
        raise HTTPException(422, str(exc))
    logger.info("L1 resolution: detected_iso=%s, explicit=%s, resolved=%s", detected_iso, l1_language, l1_code)

    rhythm_dict = to_dict(pp.rhythm) if hasattr(pp, "rhythm") else results.get("prosodic_profile", {}).get("rhythm", {})
    intonation_dict = to_dict(pp.intonation) if hasattr(pp, "intonation") else results.get("prosodic_profile", {}).get("intonation", {})
    nasality_dict = (results.get("voice_quality", {}) or {}).get("nasality", {}) or {}

    # ── Match cached Layer-4b events to L1 catalog (no re-pairing) ──
    # Layer 4b above already produced substitution_events. Now resolve them
    # against the L1-specific SubstitutionPattern catalog so the L1 detector
    # can fire patterns with phoneme-aligned evidence + timestamps.
    pattern_evidence: dict[str, dict[str, Any]] = {}
    try:
        if substitution_events:
            from modules.l1_targets import get_l1_profile as _get_l1_profile
            from modules.phoneme_pairing import (
                SubstitutionEvent, match_events_to_patterns,
            )
            # Re-hydrate dicts back into SubstitutionEvent objects for matcher
            _events_obj = [
                SubstitutionEvent(
                    event_type=ev.get("event_type", "substitution"),
                    target_phone=ev.get("target_phone", ""),
                    produced_phone=ev.get("produced_phone", ""),
                    start_ms=float(ev.get("start_ms", 0)),
                    end_ms=float(ev.get("end_ms", 0)),
                    target_source=ev.get("target_source", ""),
                    confidence=float(ev.get("confidence", 0.0)),
                ) for ev in substitution_events
            ]
            _profile = _get_l1_profile(l1_code)
            grouped = match_events_to_patterns(_events_obj, _profile.substitution_patterns)
            pattern_evidence = {
                key: {"events": bundle["events"]}
                for key, bundle in grouped.items()
            }
            logger.info("Layer 10 catalog match: %d patterns fired with phoneme-aligned evidence",
                        len(pattern_evidence))
    except Exception as exc:
        logger.warning("Layer 10 catalog match failed: %s", exc)

    # (substitution_events + event_summary already written by Layer 4b above)

    l1_result = detect_l1_interference(
        l1_code=l1_code,
        formant_data=formant_dict,
        pitch_data=pitch_dict,
        rhythm_data=rhythm_dict,
        phoneme_spans=phoneme_spans,
        intonation_data=intonation_dict,
        nasality_data=nasality_dict,
        pattern_evidence=pattern_evidence,
    )
    results["l1_interference"] = l1_result
    results["bhojpuri_interference"] = l1_result  # backwards compat
    results["l1_language"] = l1_code
    results["l1_display_name"] = l1_result.get("l1_display_name", "Bhojpuri")

    # ── Layer 10b: Syntactic L1 Interference (MLAF port, W2) ──────
    # Pure Python, CPU-only, feeds from spaCy parse trees (already running).
    # Detects L1-specific syntactic transfer: article drop, SOV word order,
    # pro-drop, copula drop — all calibrated per L1 code.
    logger.info("Layer 10b: Syntactic L1 Interference")
    try:
        from modules.mlaf.syntactic_l1_interference import detect_syntactic_l1_interference
        syntactic_l1 = detect_syntactic_l1_interference(
            text=transcription.text, l1_code=l1_code, spacy_model=SPACY_MODEL,
        )
        results["l1_interference_syntactic"] = syntactic_l1.to_dict()
        if syntactic_l1.available:
            logger.info("Layer 10b: %d syntactic violations (%s)",
                        len(syntactic_l1.violations),
                        ", ".join(f"{k}={v}" for k, v in
                                  syntactic_l1.to_dict()["summary"]["by_kind"].items()) or "none")
        else:
            logger.info("Layer 10b: unavailable (%s)", syntactic_l1.reason_unavailable)
    except Exception as exc:
        logger.warning("Layer 10b syntactic L1 failed: %s", exc)
        results["l1_interference_syntactic"] = {
            "available": False, "reason_unavailable": f"runtime error: {exc}",
        }

    # ── CIF Model — Contrastive Interference Index (first pass) ─────
    logger.info("Computing CIF Model (first pass)")
    from modules.cif_model import compute_cif
    cif_result = compute_cif(results, l1_code=l1_code)
    results["cif_analysis"] = cif_result

    # ── Abductive Feedback Loop (W3, 2026-05-06) ───────────────────
    # Pure Python, CPU-only. Cross-validates acoustic L1 detection (Layer 10)
    # with syntactic L1 evidence (Layer 10b) and formal grammar violations
    # (Layer 4b). When 2+ modalities agree, confidence goes up. When they
    # disagree, scores adjust down. This is the reliability engine.
    logger.info("Layer 11: Abductive Feedback Loop")
    try:
        from modules.mlaf.abductive_loop import (
            apply_abductive_update, apply_updates_to_results, close_the_loop,
        )
        abduct = apply_abductive_update(
            pipeline_results=results,
            l1_code=l1_code,
            l1_acoustic=results.get("l1_interference"),
            l1_syntactic=results.get("l1_interference_syntactic"),
            nlp_parse=(results.get("nlp") or {}).get("formal_grammar"),
        )
        if abduct.available and abduct.updates:
            # Stash v1 BEFORE we mutate anything
            results["cif_analysis_v1"] = cif_result
            apply_updates_to_results(results, abduct.updates)
            cif_v2 = close_the_loop(results, l1_code=l1_code)
            if cif_v2 is not None:
                results["cif_analysis"] = cif_v2
                v1_cii = (cif_result or {}).get("overall_cii")
                v2_cii = cif_v2.get("overall_cii")
                logger.info("Layer 11: %d updates applied, CIF %s → %s",
                            len(abduct.updates),
                            f"{v1_cii:.3f}" if isinstance(v1_cii, (int, float)) else v1_cii,
                            f"{v2_cii:.3f}" if isinstance(v2_cii, (int, float)) else v2_cii)
            else:
                logger.warning("Layer 11: CIF v2 re-run failed; keeping v1")
                results.pop("cif_analysis_v1", None)
        else:
            logger.info("Layer 11: skipped (%s)", abduct.reason_unavailable)
        results["abductive_loop"] = abduct.to_dict()
    except Exception as exc:
        logger.warning("Layer 11 abductive loop failed: %s", exc)
        results["abductive_loop"] = {
            "available": False, "reason_unavailable": f"runtime error: {exc}",
        }

    results["processing_time_ms"] = round((time.time() - t0) * 1000, 2)
    return results


# ── Routes ────────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    """Individualized health status with pipeline state visibility.

    Returns layer inventory, GPU telemetry, queue depth, and calibration
    scope so monitoring tools and load balancers can make informed decisions.
    """
    gpu_info: dict[str, Any] = {"available": False}
    try:
        import subprocess, json as _json
        out = subprocess.run(
            ["nvidia-smi", "--query-gpu=memory.used,memory.free,memory.total,temperature.gpu,utilization.gpu",
             "--format=csv,noheader,nounits"], capture_output=True, text=True, timeout=5)
        if out.returncode == 0:
            p = out.stdout.strip().split(",")
            gpu_info = {
                "available": True,
                "memory_used_mib": int(p[0]),
                "memory_free_mib": int(p[1]),
                "memory_total_mib": int(p[2]),
                "temperature_c": int(p[3]),
                "utilization_pct": int(p[4]),
            }
    except Exception:
        pass

    from modules.l1_targets import CALIBRATED_L1_CODES as _cal, L1_REGISTRY

    layers = {
        "1_transcription":       {"model": WHISPER_MODEL, "device": TORCH_DEVICE, "status": "loaded"},
        "1b_forced_alignment":   {"provider": "wav2vec2-ctc", "status": "loaded"},
        "2_feature_extraction":  {"providers": ["parselmouth", "librosa", "opensmile"], "status": "loaded"},
        "2b_voicesauce":         {"status": "loaded"},
        "3_ai_classification":   {"providers": ["wav2vec2", "langdetect"], "status": "loaded"},
        "3b_audeep":             {"status": "loaded"},
        "4_nlp":                 {"model": SPACY_MODEL, "status": "loaded"},
        "4b_mlaf_grammar":       {"status": "loaded"},
        "4b_phoneme_pairing":    {"status": "loaded"},
        "5_phoneme_analysis":    {"status": "loaded"},
        "6_morpheme_boundary":   {"status": "loaded"},
        "7_prosodic_profiling":  {"status": "loaded"},
        "8_connected_speech":    {"status": "loaded"},
        "9_voice_quality":       {"status": "loaded"},
        "10_l1_interference":    {"status": "loaded"},
        "10b_syntactic_l1":      {"status": "loaded"},
        "11_abductive_loop":     {"status": "loaded"},
        "cif_model":             {"status": "loaded"},
    }
    active = sum(1 for v in layers.values() if v["status"] == "loaded")
    skipped = sum(1 for v in layers.values() if v["status"] == "skipped")

    # Pipeline queue: how many callers are waiting for the semaphore
    queue_depth = 0
    busy_sec = 0.0
    waiting = 0
    if _pipeline_sem is not None:
        queue_depth = max(0, PIPELINE_CONCURRENCY - _pipeline_sem._value)
        waiting = len(w) if (w := getattr(_pipeline_sem, '_waiters', None)) else 0
        if _pipeline_busy_since > 0:
            busy_sec = time.monotonic() - _pipeline_busy_since

    return {
        "status": "ok" if busy_sec < 60 else "degraded",
        "device": TORCH_DEVICE,
        "whisper_model": WHISPER_MODEL,
        "spacy_model": SPACY_MODEL,
        "engine_version": ENGINE_VERSION,
        "acoustic_core_only": ACOUSTIC_CORE_ONLY,
        "pipeline": {
            "max_concurrency": PIPELINE_CONCURRENCY,
            "queue_depth": queue_depth,
            "waiting": waiting,
            "busy_sec": round(busy_sec, 1),
            "analysis_timeout_s": ANALYSIS_TIMEOUT,
            "stuck": busy_sec > 60,
        },
        "layers": layers,
        "layer_summary": {"total": len(layers), "active": active, "skipped": skipped},
        "calibrated_l1s": sorted(_cal),
        "registered_l1s": sorted(L1_REGISTRY.keys()),
        "gpu": gpu_info,
    }


# Production L1 scope: "ben"+"hin" are empirically calibrated against Svarah
# (CIF attractors fit on real data). "tam"+"tel"+"mar"+"guj" use literature-
# anchored acoustic-phonetic profiles (formant data, VOT ranges, substitution
# catalogs from published IPA/Phonetic studies). "bho"+"ori" remain in
# l1_targets.py registry but are NOT exposed — their attractor values are
# skeleton defaults. Expand this set as new profiles receive calibration.
ALLOWED_L1 = {"auto", "ben", "hin", "tam", "tel", "mar", "guj", "bho", "ori"}


@app.post("/api/analyze", dependencies=[Depends(verify_engine_api_key)], response_model=None)
@limiter.limit("30/minute")
async def analyze(
    request: Request,
    audio: UploadFile = File(...),
    gender: str = Form("neutral"),
    run_opensmile: str = Form("false"),
    run_speechbrain: str = Form("false"),
    l1_language: str = Form("auto"),
    l1Language: str = Form("auto"),  # camelCase alias — clients/server send either
) -> dict[str, Any]:
    """Full voice profile analysis for a single audio file."""
    if not audio.filename:
        raise HTTPException(400, "No audio file provided")

    allowed = {".wav", ".mp3", ".ogg", ".webm", ".flac", ".m4a"}
    ext = Path(audio.filename).suffix.lower()
    if ext not in allowed:
        raise HTTPException(400, f"Unsupported format: {ext}")

    # Prefer whichever field was actually set (i.e. != "auto"); both default to "auto"
    if l1Language != "auto":
        l1_language = l1Language
    if l1_language not in ALLOWED_L1:
        raise HTTPException(400, f"Invalid l1_language: must be one of {sorted(ALLOWED_L1)}")

    audio_path = await _save_upload(audio)
    timed_out = False
    t_start = time.time()
    try:
        from modules.audio_quality import assess_audio_quality, report_to_warning
        quality = assess_audio_quality(audio_path)
        if not quality.passed:
            return {
                "status": "rejected",
                "profile": None,
                "audio_quality": quality.to_dict(),
                "warnings": [report_to_warning(quality)],
                "engine_version": ENGINE_VERSION,
                "processing_time_sec": round(time.time() - t_start, 3),
            }

        result = await asyncio.wait_for(
            _run_pipeline_serialized(
                audio_path,
                gender,
                run_opensmile.lower() == "true",
                run_speechbrain.lower() == "true",
                l1_language,
                quality.audio_class,
            ),
            timeout=ANALYSIS_TIMEOUT,
        )
        result["audio_quality"] = quality.to_dict()

        # ── LayerResult roll-up for telemetry ─────────────────────────
        # Every layer's honesty flags collected into one shape so the
        # drift-detection job can read attempt logs uniformly.
        from modules.layer_result import (
            PipelineLayerSummary, from_audio_quality, from_alignment,
            from_praat_formants, from_voice_quality, from_phoneme_analysis,
            from_prosody,
        )
        summary = PipelineLayerSummary()
        summary.add(from_audio_quality(quality.to_dict()))
        summary.add(from_alignment(result.get("forced_alignment") or {}))
        praat_block = (result.get("feature_extraction") or {}).get("parselmouth") or {}
        summary.add(from_praat_formants(praat_block.get("formants") or {}))
        summary.add(from_voice_quality(result.get("voice_quality") or {}))
        summary.add(from_phoneme_analysis(result.get("phoneme_analysis") or {}))
        summary.add(from_prosody(result.get("prosodic_profile") or {}))
        result["layer_results"] = summary.to_dict()

        # ── Per-attempt telemetry append ──────────────────────────────
        # One JSONL line per /api/analyze response. Drift-detection job
        # reads the last 24h to surface saturation / failure-rate alarms.
        try:
            from modules.telemetry import append_attempt
            append_attempt(
                audio_class=quality.audio_class,
                processing_sec=time.time() - t_start,
                summary=summary,
                profile=result,
                l1_language=l1_language,
            )
        except Exception as tlog_exc:
            logger.warning("telemetry append failed: %s", tlog_exc)

        return {
            "status": "ok",
            "profile": result,
            "audio_quality": quality.to_dict(),
            "layer_results": result["layer_results"],
            "engine_version": ENGINE_VERSION,
            "processing_time_sec": round(time.time() - t_start, 3),
        }
    except asyncio.TimeoutError:
        timed_out = True
        logger.error("Analysis timed out after %ds", ANALYSIS_TIMEOUT)
        raise HTTPException(504, f"Analysis timed out after {ANALYSIS_TIMEOUT}s")
    except Exception as exc:
        logger.exception("Analysis failed")
        raise HTTPException(500, "Analysis failed")
    finally:
        if not timed_out:
            audio_path.unlink(missing_ok=True)


@app.post("/api/contrastive", dependencies=[Depends(verify_engine_api_key)], response_model=None)
@limiter.limit("5/minute")
async def contrastive_compare(
    request: Request,
    audio_a: UploadFile = File(...),
    audio_b: UploadFile = File(...),
    gender: str = Form("neutral"),
    label_a: str = Form("sample_a"),
    label_b: str = Form("sample_b"),
    l1_language: str = Form("auto"),
    l1Language: str = Form("auto"),
) -> dict[str, Any]:
    """Compare two audio samples contrastively (e.g., L1 vs L2)."""
    if l1Language != "auto":
        l1_language = l1Language
    if l1_language not in ALLOWED_L1:
        raise HTTPException(400, f"Invalid l1_language: must be one of {sorted(ALLOWED_L1)}")

    from modules.contrastive import compare_profiles

    path_a = await _save_upload(audio_a)
    path_b = await _save_upload(audio_b)
    timed_out = False

    try:
        # GPU models are non-reentrant — _run_pipeline_serialized acquires the
        # global pipeline semaphore, so concurrent /api/contrastive callers also
        # queue here.
        profile_a = await asyncio.wait_for(
            _run_pipeline_serialized(path_a, gender, False, False, l1_language),
            timeout=ANALYSIS_TIMEOUT,
        )
        profile_b = await asyncio.wait_for(
            _run_pipeline_serialized(path_b, gender, False, False, l1_language),
            timeout=ANALYSIS_TIMEOUT,
        )
        comparison = compare_profiles(profile_a, profile_b, label_a, label_b)
        return {
            "status": "ok",
            "profile_a": profile_a,
            "profile_b": profile_b,
            "contrastive_report": to_dict(comparison),
        }
    except asyncio.TimeoutError:
        timed_out = True
        logger.error("Contrastive analysis timed out after %ds", ANALYSIS_TIMEOUT)
        raise HTTPException(504, f"Analysis timed out after {ANALYSIS_TIMEOUT}s")
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Contrastive analysis failed")
        raise HTTPException(500, "Contrastive analysis failed")
    finally:
        if not timed_out:
            path_a.unlink(missing_ok=True)
            path_b.unlink(missing_ok=True)


@app.post("/api/transcribe", dependencies=[Depends(verify_engine_api_key)], response_model=None)
@limiter.limit("15/minute")
async def transcribe_only(
    request: Request,
    audio: UploadFile = File(...),
) -> dict[str, Any]:
    """Transcribe audio only (lightweight endpoint)."""
    from modules.transcription import transcribe

    audio_path = await _save_upload(audio)
    timed_out = False
    try:
        # transcribe() also calls the Whisper singleton — acquire the same
        # semaphore so concurrent /api/transcribe and /api/analyze callers
        # don't race on the model's KV-cache.
        assert _pipeline_sem is not None
        async with _pipeline_sem:
            result = await asyncio.wait_for(
                asyncio.to_thread(transcribe, audio_path, WHISPER_MODEL, WHISPER_DEVICE, True),
                timeout=ANALYSIS_TIMEOUT,
            )
        return {
            "status": "ok",
            "text": result.text,
            "language": result.language,
            "segments": [{"start": s.start, "end": s.end, "text": s.text} for s in result.segments],
            "word_timestamps": result.word_timestamps,
        }
    except asyncio.TimeoutError:
        timed_out = True
        logger.error("Transcription timed out after %ds", ANALYSIS_TIMEOUT)
        raise HTTPException(504, f"Transcription timed out after {ANALYSIS_TIMEOUT}s")
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Transcription failed")
        raise HTTPException(500, "Transcription failed")
    finally:
        if not timed_out:
            audio_path.unlink(missing_ok=True)


@app.post("/api/features", dependencies=[Depends(verify_engine_api_key)], response_model=None)
@limiter.limit("15/minute")
async def features_only(
    request: Request,
    audio: UploadFile = File(...),
    gender: str = Form("neutral"),
) -> dict[str, Any]:
    """Extract acoustic features only."""
    from modules.feature_extraction import extract_parselmouth, extract_librosa

    audio_path = await _save_upload(audio)
    timed_out = False
    try:
        async def _do_features():
            praat = await asyncio.to_thread(extract_parselmouth, audio_path, gender)
            lib = await asyncio.to_thread(extract_librosa, audio_path)
            return praat, lib

        praat, lib = await asyncio.wait_for(_do_features(), timeout=ANALYSIS_TIMEOUT)
        return {
            "status": "ok",
            "parselmouth": to_dict(praat),
            "librosa": to_dict(lib),
        }
    except asyncio.TimeoutError:
        timed_out = True
        logger.error("Feature extraction timed out after %ds", ANALYSIS_TIMEOUT)
        raise HTTPException(504, f"Feature extraction timed out after {ANALYSIS_TIMEOUT}s")
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Feature extraction failed")
        raise HTTPException(500, "Feature extraction failed")
    finally:
        if not timed_out:
            audio_path.unlink(missing_ok=True)


@app.post("/api/report", dependencies=[Depends(verify_engine_api_key)], response_model=None)
@limiter.limit("5/minute")
async def generate_report(
    request: Request,
    audio: UploadFile = File(...),
    gender: str = Form("neutral"),
    student_name: str = Form("Student"),
    student_id: str = Form(""),
    l1_language: str = Form("auto"),
    l1Language: str = Form("auto"),
) -> Any:
    """Generate a PDF diagnostic report for parents."""
    if l1Language != "auto":
        l1_language = l1Language
    if l1_language not in ALLOWED_L1:
        raise HTTPException(400, f"Invalid l1_language: must be one of {sorted(ALLOWED_L1)}")

    from fastapi.responses import Response
    from modules.report_generator import generate_pdf_report

    audio_path = await _save_upload(audio)
    timed_out = False
    try:
        async def _do_report():
            profile = await _run_pipeline_serialized(audio_path, gender, False, False, l1_language)
            pdf_bytes = await asyncio.to_thread(
                generate_pdf_report, profile, audio_path, student_name, student_id,
            )
            return pdf_bytes

        pdf_bytes = await asyncio.wait_for(_do_report(), timeout=ANALYSIS_TIMEOUT)
        import re
        safe_id = re.sub(r'[^a-zA-Z0-9_-]', '', student_id or 'report')[:50]
        filename = f"voice_report_{safe_id}_{int(time.time())}.pdf"
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )
    except asyncio.TimeoutError:
        timed_out = True
        logger.error("Report generation timed out after %ds", ANALYSIS_TIMEOUT)
        raise HTTPException(504, f"Report generation timed out after {ANALYSIS_TIMEOUT}s")
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Report generation failed")
        raise HTTPException(500, "Report generation failed")
    finally:
        if not timed_out:
            audio_path.unlink(missing_ok=True)


@app.post("/api/export/elan", dependencies=[Depends(verify_engine_api_key)], response_model=None)
@limiter.limit("5/minute")
async def export_elan(
    request: Request,
    audio: UploadFile = File(...),
    gender: str = Form("neutral"),
    speaker_id: str = Form("anonymous"),
    student_name: str = Form("Student"),
    l1_language: str = Form("auto"),
    session_id: str = Form(""),
) -> Any:
    """Run full analysis and export results as ELAN .eaf annotation file."""
    if l1_language not in ALLOWED_L1:
        raise HTTPException(400, f"Invalid l1_language: must be one of {sorted(ALLOWED_L1)}")

    from fastapi.responses import Response
    from modules.elan_export import export_eaf

    audio_path = await _save_upload(audio)
    timed_out = False
    try:
        async def _do_elan():
            profile = await _run_pipeline_serialized(audio_path, gender, False, False, l1_language)
            eaf_xml, _ = await asyncio.to_thread(
                export_eaf,
                profile=profile,
                audio_path=audio_path,
                speaker_id=speaker_id,
                student_name=student_name,
                language="en",
                l1_language=l1_language if l1_language != "auto" else "bho",
                session_id=session_id or None,
            )
            return eaf_xml

        eaf_xml = await asyncio.wait_for(_do_elan(), timeout=ANALYSIS_TIMEOUT)
        import re
        safe_id = re.sub(r'[^a-zA-Z0-9_-]', '', speaker_id or 'export')[:50]
        filename = f"annotation_{safe_id}_{int(time.time())}.eaf"
        return Response(
            content=eaf_xml.encode("utf-8"),
            media_type="application/xml",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )
    except asyncio.TimeoutError:
        timed_out = True
        logger.error("ELAN export timed out after %ds", ANALYSIS_TIMEOUT)
        raise HTTPException(504, f"ELAN export timed out after {ANALYSIS_TIMEOUT}s")
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("ELAN export failed")
        raise HTTPException(500, "ELAN export failed")
    finally:
        if not timed_out:
            audio_path.unlink(missing_ok=True)


_PROMPTS_DIR = Path(__file__).parent / "data" / "prompts"
_prompt_cache: dict[str, dict[str, Any]] = {}


def _load_prompts(filename: str) -> dict[str, Any]:
    import json
    if filename in _prompt_cache:
        return _prompt_cache[filename]
    path = _PROMPTS_DIR / filename
    if not path.exists():
        raise HTTPException(500, f"Prompt library missing: {filename}")
    with path.open("r", encoding="utf-8") as f:
        data = json.load(f)
    _prompt_cache[filename] = data
    return data


@app.get("/api/prompts/ielts", dependencies=[Depends(verify_engine_api_key)])
@limiter.limit("30/minute")
async def get_ielts_prompts(request: Request, topic: str | None = None) -> dict[str, Any]:
    """Return IELTS Speaking Part 2 cue cards. Optional ?topic= filter."""
    data = _load_prompts("ielts_part2.json")
    prompts = data.get("prompts", [])
    if topic:
        prompts = [p for p in prompts if p.get("topic") == topic]
    return {
        "status": "ok",
        "test_type": data.get("test_type"),
        "section": data.get("section"),
        "prep_time_sec": data.get("prep_time_sec"),
        "response_time_sec": data.get("response_time_sec"),
        "response_min_sec": data.get("response_min_sec"),
        "count": len(prompts),
        "prompts": prompts,
    }


@app.get("/api/prompts/toefl", dependencies=[Depends(verify_engine_api_key)])
@limiter.limit("30/minute")
async def get_toefl_prompts(request: Request, task_number: int | None = None) -> dict[str, Any]:
    """Return TOEFL Speaking prompts. Optional ?task_number= filter (1-3 in v1)."""
    data = _load_prompts("toefl_speaking.json")
    tasks = data.get("tasks", [])
    if task_number is not None:
        tasks = [t for t in tasks if t.get("task_number") == task_number]
    return {
        "status": "ok",
        "test_type": data.get("test_type"),
        "section": data.get("section"),
        "tasks": tasks,
    }


@app.post("/api/ielts/analyze", dependencies=[Depends(verify_engine_api_key)], response_model=None)
@limiter.limit("30/minute")
async def ielts_analyze(
    request: Request,
    audio: UploadFile = File(...),
    gender: str = Form("neutral"),
    l1_language: str = Form("auto"),
    prompt_id: str = Form(""),
    age_group: str = Form("adult"),
    mode: str = Form("full"),
) -> dict[str, Any]:
    """Score an IELTS Speaking Part 2 response. Returns band scores for the
    four IELTS criteria plus the overall band.

    `prompt_id` is optional and echoed back; scoring does not currently depend
    on which cue card was used, but v2 may add topic-development scoring.
    `age_group` defaults to `adult` — the rubric is calibrated for adult L2
    English speakers (IELTS candidates). Pass `child` only for legacy diagnostic.

    `mode` controls analysis depth:
      - "full" (default) — all 12 acoustic layers + NLP, ~35s
      - "fast" — acoustic core only (skip NLP, VoiceSauce, auDeep), ~12s
    """
    if mode not in ("full", "fast"):
        raise HTTPException(400, "mode must be 'full' or 'fast'")
    if not audio.filename:
        raise HTTPException(400, "No audio file provided")
    ext = Path(audio.filename).suffix.lower()
    if ext not in {".wav", ".mp3", ".ogg", ".webm", ".flac", ".m4a"}:
        raise HTTPException(400, f"Unsupported format: {ext}")
    if l1_language not in ALLOWED_L1:
        raise HTTPException(400, f"Invalid l1_language: must be one of {sorted(ALLOWED_L1)}")
    if age_group not in {"adult", "child"}:
        raise HTTPException(400, "age_group must be 'adult' or 'child'")

    from modules.ielts_rubric import compute_ielts_band, band_to_dict
    from modules.age_calibration import resolve_gender_for_age
    from modules.audio_quality import assess_audio_quality, report_to_warning

    resolved_gender = resolve_gender_for_age(gender, age_group)

    audio_path = await _save_upload(audio)
    timed_out = False
    t_start = time.time()
    try:
        # Audio quality gate (fast — runs before the 70s pipeline). Refuses to
        # score silent, clipped, too-short, or noise-dominated submissions.
        # Same shape as the language gate further down: warnings populated,
        # ielts payload null. We return early when audio is unusable rather
        # than burning GPU time on garbage and then masking the result.
        quality = assess_audio_quality(audio_path)
        if not quality.passed:
            return {
                "status": "ok",
                "prompt_id": prompt_id or None,
                "age_group": age_group,
                "ielts": None,
                "profile": None,
                "audio_quality": quality.to_dict(),
                "warnings": [report_to_warning(quality)],
                "engine_version": ENGINE_VERSION,
                "processing_time_sec": round(time.time() - t_start, 3),
            }

        profile = await asyncio.wait_for(
            _run_pipeline_serialized(audio_path, resolved_gender, False, False, l1_language, fast_mode=(mode == "fast")),
            timeout=ANALYSIS_TIMEOUT,
        )
        profile["age_group"] = age_group
        profile["audio_quality"] = quality.to_dict()

        # Language gate: refuse to score IELTS bands when the input is not
        # English. Vaani only meaningfully scores L2 English; native L1
        # speech (Hindi, Bengali, etc.) yields fabricated bands otherwise.
        warnings: list[str] = []
        ielts_payload: Any = None
        tx = profile.get("transcription") or {}
        detected = (tx.get("language") or "").lower()
        prob = float(tx.get("language_probability") or 0.0)
        if detected and detected != "en" and prob >= 0.5:
            warnings.append(
                f"Detected language is '{detected}' (confidence {prob:.2f}), not English. "
                "IELTS bands not produced. Please record an English response."
            )
        else:
            ielts_payload = band_to_dict(compute_ielts_band(profile))

        # Alignment-quality warning. When MFA + WebMAUS both failed and we
        # ran on the Whisper-g2p coarse fallback, phoneme boundaries are
        # interpolated rather than acoustically aligned — so the
        # substitution-event count and phoneme-accuracy estimate carry
        # higher variance. We surface this as a user-visible warning so
        # the report reader knows to weight the bands accordingly.
        fa = (profile.get("forced_alignment") or {})
        fa_quality = fa.get("quality") or "unavailable"
        if fa_quality == "low":
            warnings.append(
                f"Forced alignment ran on the Whisper-g2p fallback ({fa.get('num_phones', 0)} "
                "coarse phones); MFA and WebMAUS were unavailable. Phoneme-aligned "
                "measurements (substitution events, phoneme accuracy) carry higher "
                "variance on this clip — interpret the Pronunciation band as indicative."
            )
        elif fa_quality == "unavailable":
            warnings.append(
                "Forced alignment failed entirely; phoneme-aligned measurements "
                "(substitution events, phoneme accuracy) were not produced. "
                "The Pronunciation band reflects only formant/pitch/voice-quality features."
            )

        # Top-level alias: in acoustic-core mode the headline artefact is
        # the Acoustic Voice Profile (Pronunciation band + measured features),
        # not a four-criterion IELTS verdict. We surface it under the new
        # `acoustic_voice_profile` key while keeping `ielts` for back-compat
        # so existing clients keep working during the migration window.
        avp_payload = ielts_payload if (
            ielts_payload and ielts_payload.get("test_type") == "acoustic_voice_profile"
        ) else None

        # Degradation transparency: enumerate every layer that ran in a
        # degraded or unavailable state so the caller can adjust confidence.
        degraded = _assess_degraded_layers(profile)

        return {
            "status": "ok",
            "prompt_id": prompt_id or None,
            "age_group": age_group,
            "ielts": ielts_payload,
            "acoustic_voice_profile": avp_payload,
            "profile": profile,
            "audio_quality": quality.to_dict(),
            "degraded_layers": degraded,
            "warnings": warnings,
            "engine_version": ENGINE_VERSION,
            "processing_time_sec": round(time.time() - t_start, 3),
        }
    except asyncio.TimeoutError:
        timed_out = True
        logger.error("IELTS analysis timed out after %ds", ANALYSIS_TIMEOUT)
        raise HTTPException(504, f"IELTS analysis timed out after {ANALYSIS_TIMEOUT}s")
    except HTTPException:
        raise
    except Exception:
        logger.exception("IELTS analysis failed")
        raise HTTPException(500, "IELTS analysis failed")
    finally:
        if not timed_out:
            audio_path.unlink(missing_ok=True)


@app.post("/api/toefl/analyze", dependencies=[Depends(verify_engine_api_key)], response_model=None)
@limiter.limit("30/minute")
async def toefl_analyze(
    request: Request,
    audio: UploadFile = File(...),
    gender: str = Form("neutral"),
    l1_language: str = Form("auto"),
    task_number: int = Form(1),
    prompt_id: str = Form(""),
    age_group: str = Form("adult"),
) -> dict[str, Any]:
    """Score a single TOEFL iBT Speaking task response. task_number in {1,2,3,4}."""
    if not audio.filename:
        raise HTTPException(400, "No audio file provided")
    ext = Path(audio.filename).suffix.lower()
    if ext not in {".wav", ".mp3", ".ogg", ".webm", ".flac", ".m4a"}:
        raise HTTPException(400, f"Unsupported format: {ext}")
    if l1_language not in ALLOWED_L1:
        raise HTTPException(400, f"Invalid l1_language: must be one of {sorted(ALLOWED_L1)}")
    if task_number not in (1, 2, 3, 4):
        raise HTTPException(400, "task_number must be 1, 2, 3, or 4")
    if age_group not in {"adult", "child"}:
        raise HTTPException(400, "age_group must be 'adult' or 'child'")

    from modules.toefl_rubric import compute_toefl_task_score, task_to_dict
    from modules.age_calibration import resolve_gender_for_age
    from modules.audio_quality import assess_audio_quality, report_to_warning

    resolved_gender = resolve_gender_for_age(gender, age_group)

    audio_path = await _save_upload(audio)
    timed_out = False
    t_start = time.time()
    try:
        quality = assess_audio_quality(audio_path)
        if not quality.passed:
            return {
                "status": "ok",
                "prompt_id": prompt_id or None,
                "age_group": age_group,
                "toefl": None,
                "profile": None,
                "audio_quality": quality.to_dict(),
                "warnings": [report_to_warning(quality)],
                "engine_version": ENGINE_VERSION,
                "processing_time_sec": round(time.time() - t_start, 3),
            }

        profile = await asyncio.wait_for(
            _run_pipeline_serialized(audio_path, resolved_gender, False, False, l1_language),
            timeout=ANALYSIS_TIMEOUT,
        )
        profile["age_group"] = age_group
        profile["audio_quality"] = quality.to_dict()

        warnings: list[str] = []
        toefl_payload: Any = None
        tx = profile.get("transcription") or {}
        detected = (tx.get("language") or "").lower()
        prob = float(tx.get("language_probability") or 0.0)
        if detected and detected != "en" and prob >= 0.5:
            warnings.append(
                f"Detected language is '{detected}' (confidence {prob:.2f}), not English. "
                "TOEFL score not produced. Please record an English response."
            )
        else:
            toefl_payload = task_to_dict(compute_toefl_task_score(profile, task_number=task_number))

        return {
            "status": "ok",
            "prompt_id": prompt_id or None,
            "age_group": age_group,
            "toefl": toefl_payload,
            "profile": profile,
            "audio_quality": quality.to_dict(),
            "warnings": warnings,
            "engine_version": ENGINE_VERSION,
            "processing_time_sec": round(time.time() - t_start, 3),
        }
    except asyncio.TimeoutError:
        timed_out = True
        logger.error("TOEFL analysis timed out after %ds", ANALYSIS_TIMEOUT)
        raise HTTPException(504, f"TOEFL analysis timed out after {ANALYSIS_TIMEOUT}s")
    except HTTPException:
        raise
    except Exception:
        logger.exception("TOEFL analysis failed")
        raise HTTPException(500, "TOEFL analysis failed")
    finally:
        if not timed_out:
            audio_path.unlink(missing_ok=True)


@app.post("/api/ielts/report", dependencies=[Depends(verify_engine_api_key)], response_model=None)
@limiter.limit("5/minute")
async def ielts_report(
    request: Request,
    audio: UploadFile = File(...),
    gender: str = Form("neutral"),
    l1_language: str = Form("auto"),
    age_group: str = Form("adult"),
    name: str = Form("Candidate"),
    age: str = Form(""),
    centre_name: str = Form(""),
    registration_number: str = Form(""),
    test_date: str = Form(""),
    prompt_id: str = Form(""),
) -> Any:
    """Run the IELTS pipeline + generate a professional PDF report.

    Returns `application/pdf`. All metadata fields are echoed into the report
    header; only `audio` is strictly required.
    """
    if not audio.filename:
        raise HTTPException(400, "No audio file provided")
    ext = Path(audio.filename).suffix.lower()
    if ext not in {".wav", ".mp3", ".ogg", ".webm", ".flac", ".m4a"}:
        raise HTTPException(400, f"Unsupported format: {ext}")
    if l1_language not in ALLOWED_L1:
        raise HTTPException(400, f"Invalid l1_language: must be one of {sorted(ALLOWED_L1)}")
    if age_group not in {"adult", "child"}:
        raise HTTPException(400, "age_group must be 'adult' or 'child'")

    from fastapi.responses import Response, JSONResponse
    from modules.ielts_rubric import compute_ielts_band, band_to_dict
    from modules.ielts_report import generate_ielts_pdf
    from modules.age_calibration import resolve_gender_for_age
    from modules.audio_quality import assess_audio_quality, report_to_warning

    resolved_gender = resolve_gender_for_age(gender, age_group)

    audio_path = await _save_upload(audio)
    timed_out = False
    try:
        # Audio quality gate — refuse to generate a fabricated PDF on bad audio.
        # Returns JSON (not PDF) with the rejection reason; client should re-record.
        quality = assess_audio_quality(audio_path)
        if not quality.passed:
            return JSONResponse(
                status_code=422,
                content={
                    "status": "rejected",
                    "audio_quality": quality.to_dict(),
                    "warnings": [report_to_warning(quality)],
                    "engine_version": ENGINE_VERSION,
                },
            )

        profile = await asyncio.wait_for(
            _run_pipeline_serialized(audio_path, resolved_gender, False, False, l1_language),
            timeout=ANALYSIS_TIMEOUT,
        )
        profile["age_group"] = age_group
        profile["audio_quality"] = quality.to_dict()
        band = compute_ielts_band(profile)
        ielts_dict = band_to_dict(band)
        metadata = {
            "name": name,
            "age": age,
            "centre_name": centre_name,
            "registration_number": registration_number,
            "test_date": test_date,
            "l1_display_name": profile.get("l1_display_name"),
            "test_type": "IELTS Speaking — Part 2",
        }
        pdf_bytes = await asyncio.to_thread(generate_ielts_pdf, ielts_dict, profile, metadata)

        import re
        safe_name = re.sub(r'[^a-zA-Z0-9_-]', '', name or 'candidate')[:40] or 'candidate'
        filename = f"vaani_ielts_{safe_name}_{int(time.time())}.pdf"
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"',
                "X-Vaani-Band-Overall": f"{ielts_dict.get('overall_band'):.1f}",
            },
        )
    except asyncio.TimeoutError:
        timed_out = True
        logger.error("IELTS report timed out after %ds", ANALYSIS_TIMEOUT)
        raise HTTPException(504, f"Report generation timed out after {ANALYSIS_TIMEOUT}s")
    except HTTPException:
        raise
    except Exception:
        logger.exception("IELTS report generation failed")
        raise HTTPException(500, "IELTS report generation failed")
    finally:
        if not timed_out:
            audio_path.unlink(missing_ok=True)


class TOEFLSectionRequest(BaseModel):
    task_scores: list[float]


class GuidanceContextModel(BaseModel):
    overall_band: float | None = None
    weakest_criterion: str | None = None
    criterion_bands: dict[str, float] | None = None
    l1_display_name: str | None = None
    l1_code: str | None = None
    test_type: str | None = None
    last_session_age_sec: float | None = None


class GuidanceAskRequest(BaseModel):
    query: str
    context: GuidanceContextModel | None = None


@app.get("/api/guidance/topics", dependencies=[Depends(verify_engine_api_key)])
@limiter.limit("30/minute")
async def guidance_topics(request: Request) -> dict[str, Any]:
    """Return the browseable topic index for the Clarity Coach UI."""
    from modules.guidance import GuidanceGraph
    g = GuidanceGraph.load()
    return {
        "status": "ok",
        "version": g.version,
        "categories": g.topics(),
    }


@app.get("/api/guidance/node/{node_id}", dependencies=[Depends(verify_engine_api_key)])
@limiter.limit("60/minute")
async def guidance_node(request: Request, node_id: str) -> dict[str, Any]:
    """Fetch a specific curated node by id — used when the user clicks a related link."""
    from modules.guidance import GuidanceGraph
    g = GuidanceGraph.load()
    node = g.get(node_id)
    if not node:
        raise HTTPException(404, f"Unknown guidance node: {node_id}")
    related = [
        {"id": r, "title": (g.get(r) or {}).get("title", r)}
        for r in node.get("related", []) if g.get(r)
    ]
    return {
        "status": "ok",
        "node_id": node["id"],
        "category": node.get("category", "general"),
        "title": node.get("title", ""),
        "answer": node.get("answer", ""),
        "related": related,
        "confidence": 1.0,
        "personalised": False,
        "fallback": False,
    }


@app.post("/api/guidance/ask", dependencies=[Depends(verify_engine_api_key)])
@limiter.limit("30/minute")
async def guidance_ask(request: Request, body: GuidanceAskRequest) -> dict[str, Any]:
    """Answer a free-text guidance question using the curated knowledge graph.

    No LLM generation. If the intent matcher's best score falls below the
    confidence threshold, the response is the explicit fallback with a list
    of suggested topics — never a hallucinated answer.
    """
    from modules.guidance import GuidanceGraph, GuidanceContext

    query = (body.query or "").strip()
    if not query:
        raise HTTPException(400, "query must not be empty")
    if len(query) > 500:
        raise HTTPException(400, "query is too long (max 500 characters)")

    ctx = None
    if body.context is not None:
        ctx = GuidanceContext(
            overall_band=body.context.overall_band,
            weakest_criterion=body.context.weakest_criterion,
            criterion_bands=body.context.criterion_bands,
            l1_display_name=body.context.l1_display_name,
            l1_code=body.context.l1_code,
            test_type=body.context.test_type,
            last_session_age_sec=body.context.last_session_age_sec,
        )

    try:
        g = GuidanceGraph.load()
        ans = g.answer(query, context=ctx)
        from modules.guidance_llm import is_configured as _llm_ready
        return {
            "status": "ok",
            "node_id": ans.node_id,
            "category": ans.category,
            "title": ans.title,
            "answer": ans.answer,
            "related": ans.related,
            "confidence": ans.confidence,
            "personalised": ans.personalised,
            "fallback": ans.fallback,
            "neuro_active": ans.neuro,
            "neuro_configured": _llm_ready(),
        }
    except Exception as exc:
        # Never 500 the chat — degrade to a soft prompt-for-rephrase so the
        # candidate sees a usable reply instead of "Internal server error".
        logger.exception("guidance_ask failed: %s", exc)
        return {
            "status": "ok",
            "node_id": "_fallback",
            "category": "general",
            "title": "Let me try that again",
            "answer": (
                "I couldn't put together a confident answer for that one. "
                "Try rephrasing — for example, ask about a specific IELTS criterion, "
                "a pronunciation issue, or what to expect in a particular Speaking part."
            ),
            "related": [],
            "confidence": 0.0,
            "personalised": False,
            "fallback": True,
            "neuro_active": False,
            "neuro_configured": False,
        }


@app.post("/api/toefl/section-score", dependencies=[Depends(verify_engine_api_key)])
@limiter.limit("60/minute")
async def toefl_section_score(request: Request, body: TOEFLSectionRequest) -> dict[str, Any]:
    """Scale 4 TOEFL task scores (0-4 each) to the 0-30 section score."""
    from modules.toefl_rubric import scale_to_toefl_30
    if len(body.task_scores) != 4:
        raise HTTPException(400, "task_scores must contain exactly 4 values")
    for s in body.task_scores:
        if not (0.0 <= float(s) <= 4.0):
            raise HTTPException(400, "each task score must be in [0, 4]")
    raw_sum = sum(float(s) for s in body.task_scores)
    return {
        "status": "ok",
        "raw_sum": raw_sum,
        "scaled_score": scale_to_toefl_30(raw_sum),
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
