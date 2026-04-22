"""ELAN Annotation Format (.eaf) Export

Generates standard ELAN XML files from voice profile analysis results.
Produces a multi-tier annotation corpus suitable for:
  - PhD linguistic research
  - Corpus-based phonological studies
  - Cross-speaker contrastive analysis
  - Longitudinal acquisition tracking

ELAN spec: https://archive.mpi.nl/tla/elan/documentation

Tiers generated:
  1. Transcription       — Word-level transcript with timestamps
  2. Phonemes            — Phone-level segmentation (from forced alignment or Wav2Vec)
  3. Prosody             — Intonation patterns, stress, rhythm annotations
  4. L1_Interference     — Detected L1 transfer patterns with severity
  5. Voice_Quality       — Phonation type, breathiness, creak annotations
  6. Cognitive_Load      — Filled pauses, hesitations, self-corrections
  7. Connected_Speech    — Assimilation, elision, linking events
  8. CIF_Score           — Overall Contrastive Interference Index per segment
  9. Emotion             — Emotional valence/arousal labels
  10. Speaker_Metadata   — Speaker ID, language, session info
"""

from __future__ import annotations

import logging
import time
import uuid
from pathlib import Path
from typing import Any
from xml.etree.ElementTree import Element, SubElement, tostring
from xml.dom import minidom

logger = logging.getLogger(__name__)

# ELAN namespace and schema
ELAN_SCHEMA = "http://www.mpi.nl/tools/elan/EAFv3.0.xsd"
ELAN_FORMAT = "3.0"


def _ts_id(counter: list[int]) -> str:
    """Generate a unique time slot ID."""
    counter[0] += 1
    return f"ts{counter[0]}"


def _ann_id(counter: list[int]) -> str:
    """Generate a unique annotation ID."""
    counter[0] += 1
    return f"a{counter[0]}"


def _ms_to_elan(ms: float) -> int:
    """Convert milliseconds (float) to ELAN time value (int ms)."""
    return int(round(ms))


def generate_eaf(
    profile: dict[str, Any],
    audio_path: Path | str,
    speaker_id: str = "anonymous",
    student_name: str = "Student",
    language: str = "en",
    l1_language: str = "bho",
    session_id: str | None = None,
) -> str:
    """Generate a complete ELAN .eaf XML document from analysis results.

    Args:
        profile: Full pipeline output dict (all 10 layers).
        audio_path: Path to the source audio file.
        speaker_id: Unique speaker identifier.
        student_name: Display name.
        language: Target language code.
        l1_language: L1 language code.
        session_id: Optional session identifier.

    Returns:
        EAF XML as a formatted string.
    """
    audio_path = Path(audio_path)
    session_id = session_id or f"session_{int(time.time())}"
    ts_counter = [0]
    ann_counter = [0]

    # ── Root element ─────────────────────────────────────────────────
    root = Element("ANNOTATION_DOCUMENT")
    root.set("AUTHOR", "Contrastive Voice Profiling Engine")
    root.set("DATE", time.strftime("%Y-%m-%dT%H:%M:%S+00:00"))
    root.set("FORMAT", ELAN_FORMAT)
    root.set("VERSION", ELAN_FORMAT)
    root.set("xmlns:xsi", "http://www.w3.org/2001/XMLSchema-instance")
    root.set("xsi:noNamespaceSchemaLocation", ELAN_SCHEMA)

    # ── Header ───────────────────────────────────────────────────────
    header = SubElement(root, "HEADER")
    header.set("MEDIA_FILE", "")
    header.set("TIME_UNITS", "milliseconds")

    media = SubElement(header, "MEDIA_DESCRIPTOR")
    media.set("MEDIA_URL", f"file:///{audio_path.resolve()}")
    media.set("MIME_TYPE", "audio/x-wav")
    media.set("RELATIVE_MEDIA_URL", f"./{audio_path.name}")

    # Properties
    for key, val in [
        ("speaker_id", speaker_id),
        ("student_name", student_name),
        ("l1_language", l1_language),
        ("target_language", language),
        ("session_id", session_id),
        ("generator", "contrastive-voice-profiling-engine"),
    ]:
        prop = SubElement(header, "PROPERTY")
        prop.set("NAME", key)
        prop.text = str(val)

    # ── Collect all time points ──────────────────────────────────────
    time_slots: list[tuple[str, int]] = []

    def _add_ts(ms: float) -> str:
        ts_id = _ts_id(ts_counter)
        time_slots.append((ts_id, _ms_to_elan(ms)))
        return ts_id

    # ── Build tiers ──────────────────────────────────────────────────
    tiers_data: list[dict] = []

    # Tier 1: Transcription (word-level)
    _build_transcription_tier(profile, tiers_data, _add_ts, ann_counter)

    # Tier 2: Phonemes
    _build_phoneme_tier(profile, tiers_data, _add_ts, ann_counter)

    # Tier 3: Prosody
    _build_prosody_tier(profile, tiers_data, _add_ts, ann_counter)

    # Tier 4: L1 Interference
    _build_l1_tier(profile, tiers_data, _add_ts, ann_counter, l1_language)

    # Tier 5: Voice Quality
    _build_voice_quality_tier(profile, tiers_data, _add_ts, ann_counter)

    # Tier 6: Cognitive Load
    _build_cognitive_load_tier(profile, tiers_data, _add_ts, ann_counter)

    # Tier 7: Connected Speech
    _build_connected_speech_tier(profile, tiers_data, _add_ts, ann_counter)

    # Tier 8: CIF Score
    _build_cif_tier(profile, tiers_data, _add_ts, ann_counter)

    # Tier 9: Emotion
    _build_emotion_tier(profile, tiers_data, _add_ts, ann_counter)

    # Tier 10: Metadata (single span)
    _build_metadata_tier(
        profile, tiers_data, _add_ts, ann_counter,
        speaker_id, student_name, language, l1_language, session_id,
    )

    # ── Write TIME_ORDER ─────────────────────────────────────────────
    time_order = SubElement(root, "TIME_ORDER")
    # Sort by time value for valid EAF
    time_slots.sort(key=lambda x: x[1])
    for ts_id, ts_val in time_slots:
        ts_el = SubElement(time_order, "TIME_SLOT")
        ts_el.set("TIME_SLOT_ID", ts_id)
        ts_el.set("TIME_VALUE", str(ts_val))

    # ── Write TIERs ──────────────────────────────────────────────────
    for tier_info in tiers_data:
        tier_el = SubElement(root, "TIER")
        tier_el.set("LINGUISTIC_TYPE_REF", tier_info.get("type_ref", "default-lt"))
        tier_el.set("TIER_ID", tier_info["tier_id"])
        if "participant" in tier_info:
            tier_el.set("PARTICIPANT", tier_info["participant"])
        if "annotator" in tier_info:
            tier_el.set("ANNOTATOR", tier_info["annotator"])

        for ann in tier_info.get("annotations", []):
            ann_el = SubElement(tier_el, "ANNOTATION")
            align_ann = SubElement(ann_el, "ALIGNABLE_ANNOTATION")
            align_ann.set("ANNOTATION_ID", ann["id"])
            align_ann.set("TIME_SLOT_REF1", ann["ts1"])
            align_ann.set("TIME_SLOT_REF2", ann["ts2"])
            value_el = SubElement(align_ann, "ANNOTATION_VALUE")
            value_el.text = ann["value"]

    # ── Linguistic Types ─────────────────────────────────────────────
    ling_types = [
        "default-lt", "phoneme-lt", "prosody-lt", "interference-lt",
        "voice-quality-lt", "cognitive-lt", "connected-speech-lt",
        "cif-lt", "emotion-lt", "metadata-lt",
    ]
    for lt in ling_types:
        lt_el = SubElement(root, "LINGUISTIC_TYPE")
        lt_el.set("GRAPHIC_REFERENCES", "false")
        lt_el.set("LINGUISTIC_TYPE_ID", lt)
        lt_el.set("TIME_ALIGNABLE", "true")

    # ── Constraints ──────────────────────────────────────────────────
    for stereo, desc in [
        ("Time_Subdivision", "Time subdivision of parent annotation's time interval"),
        ("Symbolic_Subdivision", "Symbolic subdivision of parent annotation's time interval"),
        ("Symbolic_Association", "1-1 association with a parent annotation"),
        ("Included_In", "Time included in parent annotation's time interval"),
    ]:
        con = SubElement(root, "CONSTRAINT")
        con.set("DESCRIPTION", desc)
        con.set("STEREOTYPE", stereo)

    # ── Format and return ────────────────────────────────────────────
    raw_xml = tostring(root, encoding="unicode")
    parsed = minidom.parseString(raw_xml)
    return parsed.toprettyxml(indent="  ", encoding=None)


# ── Tier Builders ────────────────────────────────────────────────────────

def _build_transcription_tier(profile, tiers, add_ts, ann_ctr):
    """Tier 1: Word-level transcription with timestamps."""
    trans = profile.get("transcription", {})
    word_ts = trans.get("word_timestamps", [])

    annotations = []
    for w in word_ts:
        if not w.get("word"):
            continue
        start = w.get("start", 0) * 1000 if w.get("start", 0) < 100 else w.get("start", 0)
        end = w.get("end", 0) * 1000 if w.get("end", 0) < 100 else w.get("end", 0)
        ts1 = add_ts(start)
        ts2 = add_ts(end)
        annotations.append({
            "id": _ann_id(ann_ctr),
            "ts1": ts1, "ts2": ts2,
            "value": w["word"],
        })

    # If no word timestamps, use segment-level
    if not annotations:
        for seg in trans.get("segments", []):
            ts1 = add_ts(seg["start"] * 1000)
            ts2 = add_ts(seg["end"] * 1000)
            annotations.append({
                "id": _ann_id(ann_ctr),
                "ts1": ts1, "ts2": ts2,
                "value": seg.get("text", "").strip(),
            })

    tiers.append({
        "tier_id": "Transcription",
        "type_ref": "default-lt",
        "participant": "Speaker",
        "annotator": "whisper",
        "annotations": annotations,
    })


def _build_phoneme_tier(profile, tiers, add_ts, ann_ctr):
    """Tier 2: Phone-level segmentation."""
    # Try forced alignment first, fall back to phoneme_analysis
    fa = profile.get("forced_alignment", {})
    phones = fa.get("phones", [])

    # Fall back to Wav2Vec phoneme spans
    if not phones:
        pa = profile.get("phoneme_analysis", {})
        phones = pa.get("phoneme_details", [])

    annotations = []
    for p in phones:
        phone = p.get("phone") or p.get("phoneme", "")
        start = p.get("start_ms", 0)
        end = p.get("end_ms", start + p.get("duration_ms", 50))
        if not phone:
            continue
        ts1 = add_ts(start)
        ts2 = add_ts(end)
        conf = p.get("confidence", 0)
        source = p.get("source", "wav2vec")
        label = f"{phone} [{source}:{conf:.2f}]" if conf else phone
        annotations.append({
            "id": _ann_id(ann_ctr),
            "ts1": ts1, "ts2": ts2,
            "value": label,
        })

    tiers.append({
        "tier_id": "Phonemes",
        "type_ref": "phoneme-lt",
        "annotator": "forced_alignment",
        "annotations": annotations,
    })


def _build_prosody_tier(profile, tiers, add_ts, ann_ctr):
    """Tier 3: Prosodic annotations (intonation, stress, rhythm)."""
    prosody = profile.get("prosodic_profile", {})
    annotations = []

    # Intonation pattern annotations
    intonation = prosody.get("intonation", {})
    if intonation:
        pattern = intonation.get("pattern", "unknown")
        boundary_tones = intonation.get("boundary_tones", [])
        duration_ms = profile.get("transcription", {}).get("duration_seconds", 5) * 1000

        ts1 = add_ts(0)
        ts2 = add_ts(duration_ms)
        annotations.append({
            "id": _ann_id(ann_ctr),
            "ts1": ts1, "ts2": ts2,
            "value": f"Intonation: {pattern} | Tones: {', '.join(boundary_tones) if boundary_tones else 'N/A'}",
        })

    # Rhythm classification
    rhythm = prosody.get("rhythm", {})
    if rhythm:
        rhythm_class = rhythm.get("rhythm_class", "unknown")
        npvi = rhythm.get("nPVI_V", 0)
        duration_ms = profile.get("transcription", {}).get("duration_seconds", 5) * 1000
        ts1 = add_ts(0)
        ts2 = add_ts(duration_ms)
        annotations.append({
            "id": _ann_id(ann_ctr),
            "ts1": ts1, "ts2": ts2,
            "value": f"Rhythm: {rhythm_class} (nPVI={npvi:.1f})",
        })

    # Stressed words
    stress = prosody.get("stress_patterns", [])
    for s in stress:
        if s.get("stressed"):
            start = s.get("start", 0)
            end = s.get("end", start + 200)
            # Convert seconds to ms if needed
            if start < 100:
                start *= 1000
                end *= 1000
            ts1 = add_ts(start)
            ts2 = add_ts(end)
            annotations.append({
                "id": _ann_id(ann_ctr),
                "ts1": ts1, "ts2": ts2,
                "value": f"STRESS: {s.get('word', '')}",
            })

    tiers.append({
        "tier_id": "Prosody",
        "type_ref": "prosody-lt",
        "annotator": "prosodic_profiling",
        "annotations": annotations,
    })


def _build_l1_tier(profile, tiers, add_ts, ann_ctr, l1_language):
    """Tier 4: L1 interference patterns."""
    l1 = profile.get("l1_interference", {})
    annotations = []

    duration_ms = profile.get("transcription", {}).get("duration_seconds", 5) * 1000

    # Overall interference score
    interference_score = l1.get("interference_score", 0)
    display_name = l1.get("l1_display_name", l1_language)
    ts1 = add_ts(0)
    ts2 = add_ts(duration_ms)
    annotations.append({
        "id": _ann_id(ann_ctr),
        "ts1": ts1, "ts2": ts2,
        "value": f"L1={display_name} | Interference={interference_score}/100",
    })

    # Individual detected patterns
    patterns = l1.get("detected_patterns", [])
    for pat in patterns:
        name = pat.get("pattern") or pat.get("name", "unknown")
        severity = pat.get("severity", "low")
        evidence = pat.get("evidence", "")
        remediation = pat.get("remediation", "")

        ts1 = add_ts(0)
        ts2 = add_ts(duration_ms)
        value = f"[{severity.upper()}] {name}"
        if evidence:
            value += f" | {evidence}"
        if remediation:
            value += f" | FIX: {remediation}"

        annotations.append({
            "id": _ann_id(ann_ctr),
            "ts1": ts1, "ts2": ts2,
            "value": value,
        })

    tiers.append({
        "tier_id": "L1_Interference",
        "type_ref": "interference-lt",
        "annotator": "l1_targets",
        "annotations": annotations,
    })


def _build_voice_quality_tier(profile, tiers, add_ts, ann_ctr):
    """Tier 5: Voice quality annotations."""
    vq = profile.get("voice_quality", {})
    vs = profile.get("voicesauce", {})
    annotations = []

    duration_ms = profile.get("transcription", {}).get("duration_seconds", 5) * 1000

    # Phonation type
    phonation = vs.get("phonation_type") or vq.get("breathiness", {}).get("classification", "modal")
    register = vq.get("register", {}).get("type", "unknown")

    ts1 = add_ts(0)
    ts2 = add_ts(duration_ms)
    annotations.append({
        "id": _ann_id(ann_ctr),
        "ts1": ts1, "ts2": ts2,
        "value": f"Phonation: {phonation} | Register: {register}",
    })

    # VoiceSauce measures
    if vs:
        h1h2 = vs.get("H1_H2", {})
        cpp = vs.get("CPP", {})
        shr = vs.get("SHR", {})
        ts1 = add_ts(0)
        ts2 = add_ts(duration_ms)
        annotations.append({
            "id": _ann_id(ann_ctr),
            "ts1": ts1, "ts2": ts2,
            "value": (
                f"H1-H2={h1h2.get('mean', 0):.1f}dB | "
                f"CPP={cpp.get('mean', 0):.1f}dB | "
                f"SHR={shr.get('mean', 0):.3f} | "
                f"Breathiness={vs.get('breathiness_index', 0):.2f} | "
                f"Creak={vs.get('creak_index', 0):.2f}"
            ),
        })

    # Nasality
    nas = vq.get("nasality", {})
    if nas:
        ts1 = add_ts(0)
        ts2 = add_ts(duration_ms)
        annotations.append({
            "id": _ann_id(ann_ctr),
            "ts1": ts1, "ts2": ts2,
            "value": f"Nasality index: {nas.get('nasality_index', 0):.2f}",
        })

    tiers.append({
        "tier_id": "Voice_Quality",
        "type_ref": "voice-quality-lt",
        "annotator": "voice_quality+voicesauce",
        "annotations": annotations,
    })


def _build_cognitive_load_tier(profile, tiers, add_ts, ann_ctr):
    """Tier 6: Cognitive load markers (filled pauses, hesitations)."""
    mb = profile.get("morpheme_boundary", {})
    cog = mb.get("cognitive_load", {})
    annotations = []

    # Filled pauses
    indicators = cog.get("indicators", [])
    for ind in indicators:
        if isinstance(ind, str):
            # Simple string indicator — create utterance-level annotation
            duration_ms = profile.get("transcription", {}).get("duration_seconds", 5) * 1000
            ts1 = add_ts(0)
            ts2 = add_ts(duration_ms)
            annotations.append({
                "id": _ann_id(ann_ctr),
                "ts1": ts1, "ts2": ts2,
                "value": f"COGNITIVE: {ind}",
            })
        elif isinstance(ind, dict):
            start = ind.get("start_ms", 0)
            end = ind.get("end_ms", start + 200)
            ts1 = add_ts(start)
            ts2 = add_ts(end)
            annotations.append({
                "id": _ann_id(ann_ctr),
                "ts1": ts1, "ts2": ts2,
                "value": f"COGNITIVE: {ind.get('type', 'marker')} — {ind.get('description', '')}",
            })

    # Overall score
    score = cog.get("score", 0)
    if score > 0:
        duration_ms = profile.get("transcription", {}).get("duration_seconds", 5) * 1000
        ts1 = add_ts(0)
        ts2 = add_ts(duration_ms)
        annotations.append({
            "id": _ann_id(ann_ctr),
            "ts1": ts1, "ts2": ts2,
            "value": f"Cognitive Load Score: {score}/100",
        })

    tiers.append({
        "tier_id": "Cognitive_Load",
        "type_ref": "cognitive-lt",
        "annotator": "morpheme_boundary",
        "annotations": annotations,
    })


def _build_connected_speech_tier(profile, tiers, add_ts, ann_ctr):
    """Tier 7: Connected speech processes (assimilation, elision, linking)."""
    cs = profile.get("connected_speech", {})
    annotations = []

    for process_type in ["assimilations", "elisions", "linkings", "reductions"]:
        events = cs.get(process_type, [])
        for ev in events:
            if isinstance(ev, dict):
                start = ev.get("start_ms", ev.get("position_ms", 0))
                end = ev.get("end_ms", start + 150)
                label = ev.get("label") or ev.get("type", process_type.rstrip("s"))
                context = ev.get("context", "")

                ts1 = add_ts(start)
                ts2 = add_ts(end)
                value = f"[{process_type.upper().rstrip('S')}] {label}"
                if context:
                    value += f" | {context}"
                annotations.append({
                    "id": _ann_id(ann_ctr),
                    "ts1": ts1, "ts2": ts2,
                    "value": value,
                })

    # Fluency score
    fluency = cs.get("fluency_score", 0)
    if fluency > 0:
        duration_ms = profile.get("transcription", {}).get("duration_seconds", 5) * 1000
        ts1 = add_ts(0)
        ts2 = add_ts(duration_ms)
        annotations.append({
            "id": _ann_id(ann_ctr),
            "ts1": ts1, "ts2": ts2,
            "value": f"Fluency Score: {fluency}/100",
        })

    tiers.append({
        "tier_id": "Connected_Speech",
        "type_ref": "connected-speech-lt",
        "annotator": "connected_speech",
        "annotations": annotations,
    })


def _build_cif_tier(profile, tiers, add_ts, ann_ctr):
    """Tier 8: CIF (Contrastive Interference Field) scores."""
    cif = profile.get("cif_analysis", {})
    annotations = []

    duration_ms = profile.get("transcription", {}).get("duration_seconds", 5) * 1000

    overall_cii = cif.get("overall_cii", 0)
    severity = cif.get("overall_severity", "unknown")

    ts1 = add_ts(0)
    ts2 = add_ts(duration_ms)
    annotations.append({
        "id": _ann_id(ann_ctr),
        "ts1": ts1, "ts2": ts2,
        "value": f"CII={overall_cii:.3f} [{severity}]",
    })

    # Per-dimension CII
    dimensions = cif.get("dimensions", {})
    for dim_name, dim_data in dimensions.items():
        if isinstance(dim_data, dict):
            dim_cii = dim_data.get("cii", 0)
            ts1 = add_ts(0)
            ts2 = add_ts(duration_ms)
            annotations.append({
                "id": _ann_id(ann_ctr),
                "ts1": ts1, "ts2": ts2,
                "value": f"CIF-{dim_name}: {dim_cii:.3f}",
            })

    tiers.append({
        "tier_id": "CIF_Score",
        "type_ref": "cif-lt",
        "annotator": "cif_model",
        "annotations": annotations,
    })


def _build_emotion_tier(profile, tiers, add_ts, ann_ctr):
    """Tier 9: Emotional analysis annotations."""
    annotations = []
    duration_ms = profile.get("transcription", {}).get("duration_seconds", 5) * 1000

    # SpeechBrain emotion
    ai = profile.get("ai_classification", {})
    sb = ai.get("speechbrain", {})
    if sb:
        emotion = sb.get("emotion", {})
        if emotion:
            label = emotion.get("label", "unknown")
            conf = emotion.get("confidence", 0)
            ts1 = add_ts(0)
            ts2 = add_ts(duration_ms)
            annotations.append({
                "id": _ann_id(ann_ctr),
                "ts1": ts1, "ts2": ts2,
                "value": f"SpeechBrain: {label} ({conf:.2f})",
            })

    # auDeep emotion
    audeep = profile.get("audeep", {})
    if audeep:
        primary = audeep.get("primary_emotion", "neutral")
        conf = audeep.get("emotion_confidence", 0)
        v = audeep.get("valence", 0)
        a = audeep.get("arousal", 0)
        d = audeep.get("dominance", 0)
        ts1 = add_ts(0)
        ts2 = add_ts(duration_ms)
        annotations.append({
            "id": _ann_id(ann_ctr),
            "ts1": ts1, "ts2": ts2,
            "value": f"auDeep: {primary} ({conf:.2f}) | V={v:.2f} A={a:.2f} D={d:.2f}",
        })

    tiers.append({
        "tier_id": "Emotion",
        "type_ref": "emotion-lt",
        "annotator": "speechbrain+audeep",
        "annotations": annotations,
    })


def _build_metadata_tier(profile, tiers, add_ts, ann_ctr,
                         speaker_id, student_name, language, l1_language, session_id):
    """Tier 10: Session metadata."""
    duration_ms = profile.get("transcription", {}).get("duration_seconds", 5) * 1000
    processing_ms = profile.get("processing_time_ms", 0)

    ts1 = add_ts(0)
    ts2 = add_ts(duration_ms)

    meta_str = (
        f"Speaker: {speaker_id} ({student_name}) | "
        f"L1: {l1_language} → L2: {language} | "
        f"Session: {session_id} | "
        f"Processing: {processing_ms:.0f}ms"
    )

    tiers.append({
        "tier_id": "Speaker_Metadata",
        "type_ref": "metadata-lt",
        "participant": speaker_id,
        "annotations": [{
            "id": _ann_id(ann_ctr),
            "ts1": ts1, "ts2": ts2,
            "value": meta_str,
        }],
    })


# ── Public API ───────────────────────────────────────────────────────────

def export_eaf(
    profile: dict[str, Any],
    audio_path: Path | str,
    output_path: Path | str | None = None,
    speaker_id: str = "anonymous",
    student_name: str = "Student",
    language: str = "en",
    l1_language: str = "bho",
    session_id: str | None = None,
) -> tuple[str, Path]:
    """Export analysis results to ELAN .eaf format.

    Args:
        profile: Full pipeline output dict.
        audio_path: Path to source audio.
        output_path: Where to save the .eaf file. If None, saves next to audio.
        speaker_id: Speaker identifier.
        student_name: Display name.
        language: Target language.
        l1_language: L1 language code.
        session_id: Session identifier.

    Returns:
        Tuple of (eaf_xml_string, output_path).
    """
    audio_path = Path(audio_path)
    if output_path is None:
        output_path = audio_path.with_suffix(".eaf")
    else:
        output_path = Path(output_path)

    eaf_xml = generate_eaf(
        profile=profile,
        audio_path=audio_path,
        speaker_id=speaker_id,
        student_name=student_name,
        language=language,
        l1_language=l1_language,
        session_id=session_id,
    )

    output_path.write_text(eaf_xml, encoding="utf-8")
    logger.info("ELAN export saved to %s", output_path)

    return eaf_xml, output_path
