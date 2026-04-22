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
    asyncio.create_task(_cleanup_stale_uploads())


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


def _run_full_pipeline(audio_path: Path, gender: str, run_opensmile: bool, run_sb: bool, l1_language: str = "auto") -> dict[str, Any]:
    """Run the full processing pipeline synchronously (called via to_thread)."""
    from modules.transcription import transcribe, get_word_timestamps
    from modules.feature_extraction import extract_parselmouth, extract_librosa, extract_opensmile
    from modules.ai_classification import classify_phonemes, classify_speechbrain, detect_language
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

    # ── Layer 1: Transcription ────────────────────────────────────────
    logger.info("Layer 1: Transcription")
    transcription = transcribe(audio_path, WHISPER_MODEL, WHISPER_DEVICE)
    word_ts = get_word_timestamps(audio_path, WHISPER_MODEL, WHISPER_DEVICE)
    results["transcription"] = {
        "text": transcription.text,
        "language": transcription.language,
        "language_probability": transcription.language_probability,
        "duration_seconds": transcription.duration_seconds,
        "segments": [{"start": s.start, "end": s.end, "text": s.text} for s in transcription.segments],
        "word_timestamps": word_ts,
    }

    # ── Layer 1b: Forced Alignment (WebMAUS + MFA) ────────────────────
    logger.info("Layer 1b: Forced Alignment (MFA → WebMAUS fallback)")
    alignment = None
    try:
        alignment = forced_align(
            audio_path=audio_path,
            transcript=transcription.text,
            language=transcription.language or "en",
        )
        if alignment.success:
            results["forced_alignment"] = {
                "source": alignment.source,
                "num_phones": len(alignment.phones),
                "phones": alignment_to_phoneme_spans(alignment),
                "words": alignment.words,
                "textgrid_path": alignment.textgrid_path,
            }
            logger.info("Forced alignment: %d phones via %s", len(alignment.phones), alignment.source)
        else:
            results["forced_alignment"] = {
                "source": "none",
                "error": alignment.error,
                "num_phones": 0,
                "phones": [],
            }
            logger.warning("Forced alignment unavailable: %s", alignment.error)
    except Exception as exc:
        logger.warning("Forced alignment failed: %s", exc)
        results["forced_alignment"] = {"source": "none", "error": str(exc), "num_phones": 0, "phones": []}

    # ── Layer 2: Feature Extraction ───────────────────────────────────
    logger.info("Layer 2: Feature Extraction")
    praat = extract_parselmouth(audio_path, gender)
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
    logger.info("Layer 3: AI Classification")
    wav2vec = None
    lang_detect = None
    try:
        wav2vec = classify_phonemes(audio_path)
    except Exception as exc:
        logger.warning("Wav2Vec classification failed: %s", exc)
    try:
        lang_detect = detect_language(transcription.text)
    except Exception as exc:
        logger.warning("Language detection failed: %s", exc)
    results["ai_classification"] = {
        "wav2vec": to_dict(wav2vec) if wav2vec else None,
        "language_detection": to_dict(lang_detect) if lang_detect else None,
    }
    if run_sb:
        try:
            sb = classify_speechbrain(audio_path)
            results["ai_classification"]["speechbrain"] = to_dict(sb)
        except Exception as exc:
            logger.warning("SpeechBrain classification failed: %s", exc)

    # ── Layer 3b: auDeep Emotional Representations ────────────────────
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
    logger.info("Layer 4: NLP")
    morph = analyze_morphology(transcription.text, SPACY_MODEL)
    syntax = analyze_syntax(transcription.text)
    phoneme_inv = None
    if wav2vec:
        phoneme_seq = [p.phoneme for p in wav2vec.phonemes]
        phoneme_inv = analyze_phoneme_inventory(phoneme_seq)
    results["nlp"] = {
        "morphology": to_dict(morph),
        "syntax": to_dict(syntax),
        "phoneme_inventory": to_dict(phoneme_inv) if phoneme_inv else None,
    }

    formant_dict = to_dict(praat.formants)
    pitch_dict = to_dict(praat.pitch)
    vq_dict = to_dict(praat.voice_quality)
    librosa_dict = to_dict(lib)

    # ── Layer 5: Phoneme Analysis ──────────────────────────────────
    logger.info("Layer 5: Phoneme Analysis")
    # Prefer forced alignment phones over Wav2Vec CTC (more precise boundaries)
    phoneme_spans = []
    fa_phones = results.get("forced_alignment", {}).get("phones", [])
    if fa_phones:
        phoneme_spans = fa_phones
        logger.info("Using forced alignment phonemes (%d phones) for downstream analysis", len(phoneme_spans))
    elif wav2vec:
        phoneme_spans = [to_dict(p) for p in wav2vec.phonemes]
        logger.info("Using Wav2Vec CTC phonemes (%d phones) for downstream analysis", len(phoneme_spans))
    pa = analyze_phonemes(phoneme_spans, formant_dict, word_ts)
    results["phoneme_analysis"] = to_dict(pa)

    # ── Layer 6: Morpheme Boundary + Cognitive Load ────────────────
    logger.info("Layer 6: Morpheme Boundary + Cognitive Load")
    morpheme_list = [to_dict(m) for m in syntax.morphemes] if syntax.morphemes else []
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

    # ── Layer 8: Connected Speech ──────────────────────────────────
    logger.info("Layer 8: Connected Speech")
    cs = analyze_connected_speech(
        word_timestamps=word_ts,
        phoneme_spans=phoneme_spans,
        transcript=transcription.text,
        formant_trajectories=formant_dict,
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

    # ── Layer 10: L1 Interference Detection (Bhojpuri/Hindi/Bangla/Odia)
    logger.info("Layer 10: L1 Interference Detection")
    from modules.l1_targets import detect_l1_interference, resolve_l1_code
    # Try langdetect result first, then Whisper's detected language as fallback
    detected_iso = None
    if lang_detect and hasattr(lang_detect, "language"):
        detected_iso = lang_detect.language
    elif isinstance(lang_detect, dict):
        detected_iso = lang_detect.get("language")
    if not detected_iso and transcription.language:
        detected_iso = transcription.language
    l1_code = resolve_l1_code(detected_iso, l1_language)
    logger.info("L1 resolution: detected_iso=%s, explicit=%s, resolved=%s", detected_iso, l1_language, l1_code)

    rhythm_dict = to_dict(pp.rhythm) if hasattr(pp, "rhythm") else results.get("prosodic_profile", {}).get("rhythm", {})
    intonation_dict = to_dict(pp.intonation) if hasattr(pp, "intonation") else results.get("prosodic_profile", {}).get("intonation", {})
    nasality_dict = (results.get("voice_quality", {}) or {}).get("nasality", {}) or {}
    l1_result = detect_l1_interference(
        l1_code=l1_code,
        formant_data=formant_dict,
        pitch_data=pitch_dict,
        rhythm_data=rhythm_dict,
        phoneme_spans=phoneme_spans,
        intonation_data=intonation_dict,
        nasality_data=nasality_dict,
    )
    results["l1_interference"] = l1_result
    results["bhojpuri_interference"] = l1_result  # backwards compat
    results["l1_language"] = l1_code
    results["l1_display_name"] = l1_result.get("l1_display_name", "Bhojpuri")

    # ── CIF Model — Contrastive Interference Index ─────────────────
    logger.info("Computing CIF Model")
    from modules.cif_model import compute_cif
    cif_result = compute_cif(results, l1_code=l1_code)
    results["cif_analysis"] = cif_result

    results["processing_time_ms"] = round((time.time() - t0) * 1000, 2)
    return results


# ── Routes ────────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {"status": "ok", "device": TORCH_DEVICE, "whisper_model": WHISPER_MODEL}


ALLOWED_L1 = {"auto", "bho", "hin", "ben", "ori", "tam", "tel"}


@app.post("/api/analyze", dependencies=[Depends(verify_engine_api_key)], response_model=None)
@limiter.limit("10/minute")
async def analyze(
    request: Request,
    audio: UploadFile = File(...),
    gender: str = Form("neutral"),
    run_opensmile: str = Form("false"),
    run_speechbrain: str = Form("false"),
    l1_language: str = Form("auto"),
) -> dict[str, Any]:
    """Full voice profile analysis for a single audio file."""
    if not audio.filename:
        raise HTTPException(400, "No audio file provided")

    allowed = {".wav", ".mp3", ".ogg", ".webm", ".flac", ".m4a"}
    ext = Path(audio.filename).suffix.lower()
    if ext not in allowed:
        raise HTTPException(400, f"Unsupported format: {ext}")

    if l1_language not in ALLOWED_L1:
        raise HTTPException(400, f"Invalid l1_language: must be one of {sorted(ALLOWED_L1)}")

    audio_path = await _save_upload(audio)
    timed_out = False
    try:
        result = await asyncio.wait_for(
            asyncio.to_thread(
                _run_full_pipeline,
                audio_path,
                gender,
                run_opensmile.lower() == "true",
                run_speechbrain.lower() == "true",
                l1_language,
            ),
            timeout=ANALYSIS_TIMEOUT,
        )
        return {"status": "ok", "profile": result}
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
) -> dict[str, Any]:
    """Compare two audio samples contrastively (e.g., L1 vs L2)."""
    if l1_language not in ALLOWED_L1:
        raise HTTPException(400, f"Invalid l1_language: must be one of {sorted(ALLOWED_L1)}")

    from modules.contrastive import compare_profiles

    path_a = await _save_upload(audio_a)
    path_b = await _save_upload(audio_b)
    timed_out = False

    try:
        # Run sequentially — GPU models (Whisper, Wav2Vec) are not thread-safe
        # Double timeout since two full pipelines run
        profile_a = await asyncio.wait_for(
            asyncio.to_thread(_run_full_pipeline, path_a, gender, False, False, l1_language),
            timeout=ANALYSIS_TIMEOUT,
        )
        profile_b = await asyncio.wait_for(
            asyncio.to_thread(_run_full_pipeline, path_b, gender, False, False, l1_language),
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
    from modules.transcription import transcribe, get_word_timestamps

    audio_path = await _save_upload(audio)
    timed_out = False
    try:
        async def _do_transcribe():
            result = await asyncio.to_thread(transcribe, audio_path, WHISPER_MODEL, WHISPER_DEVICE)
            words = await asyncio.to_thread(get_word_timestamps, audio_path, WHISPER_MODEL, WHISPER_DEVICE)
            return result, words

        result, words = await asyncio.wait_for(_do_transcribe(), timeout=ANALYSIS_TIMEOUT)
        return {
            "status": "ok",
            "text": result.text,
            "language": result.language,
            "segments": [{"start": s.start, "end": s.end, "text": s.text} for s in result.segments],
            "word_timestamps": words,
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
) -> Any:
    """Generate a PDF diagnostic report for parents."""
    if l1_language not in ALLOWED_L1:
        raise HTTPException(400, f"Invalid l1_language: must be one of {sorted(ALLOWED_L1)}")

    from fastapi.responses import Response
    from modules.report_generator import generate_pdf_report

    audio_path = await _save_upload(audio)
    timed_out = False
    try:
        async def _do_report():
            profile = await asyncio.to_thread(
                _run_full_pipeline, audio_path, gender, False, False, l1_language,
            )
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
            profile = await asyncio.to_thread(
                _run_full_pipeline, audio_path, gender, False, False, l1_language,
            )
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


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
