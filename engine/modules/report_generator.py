"""PDF DIAGNOSTIC REPORT GENERATOR
Generates a parent-friendly PDF report with spectrograms, scores,
interference patterns, and remediation recommendations.
"""

from __future__ import annotations

import io
import logging
from datetime import datetime
from pathlib import Path
from typing import Any

import numpy as np

logger = logging.getLogger(__name__)


def _generate_spectrogram_image(audio_path: str | Path) -> bytes | None:
    """Generate a publication-quality spectrogram PNG using librosa + matplotlib."""
    try:
        import librosa
        import librosa.display
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt

        y, sr = librosa.load(str(audio_path), sr=22050)
        fig, axes = plt.subplots(3, 1, figsize=(10, 8), tight_layout=True)

        # Mel spectrogram
        mel = librosa.feature.melspectrogram(y=y, sr=sr, n_mels=128)
        mel_db = librosa.power_to_db(mel, ref=np.max)
        img = librosa.display.specshow(mel_db, sr=sr, x_axis="time", y_axis="mel", ax=axes[0], cmap="magma")
        axes[0].set_title("Mel Spectrogram", fontsize=12, fontweight="bold", color="#333")
        fig.colorbar(img, ax=axes[0], format="%+2.0f dB")

        # Waveform
        librosa.display.waveshow(y, sr=sr, ax=axes[1], color="#0891b2")
        axes[1].set_title("Waveform", fontsize=12, fontweight="bold", color="#333")

        # MFCC
        mfcc = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=13)
        img2 = librosa.display.specshow(mfcc, sr=sr, x_axis="time", ax=axes[2], cmap="coolwarm")
        axes[2].set_title("MFCC (Vocal Tract Shape)", fontsize=12, fontweight="bold", color="#333")
        fig.colorbar(img2, ax=axes[2])

        buf = io.BytesIO()
        fig.savefig(buf, format="png", dpi=150, bbox_inches="tight", facecolor="white")
        plt.close(fig)
        buf.seek(0)
        return buf.read()
    except Exception as exc:
        logger.warning("Spectrogram image generation failed: %s", exc)
        return None


def _generate_formant_plot(formant_data: dict[str, Any]) -> bytes | None:
    """Generate F1/F2 vowel space plot."""
    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt

        fig, ax = plt.subplots(1, 1, figsize=(6, 5))

        f1_traj = formant_data.get("f1_trajectory", [])
        f2_traj = formant_data.get("f2_trajectory", [])

        if f1_traj and f2_traj:
            ax.scatter(f2_traj[:50], f1_traj[:50], alpha=0.3, s=8, color="#0891b2", label="Produced")

        # Plot English targets
        from modules.l1_targets import ENGLISH_VOWEL_FORMANTS
        for vowel, (f1, f2) in ENGLISH_VOWEL_FORMANTS.items():
            ax.annotate(vowel, (f2, f1), fontsize=9, color="#ef4444", fontweight="bold",
                       ha="center", va="center",
                       bbox=dict(boxstyle="round,pad=0.2", facecolor="white", edgecolor="#ef4444", alpha=0.7))

        ax.set_xlabel("F2 (Hz)", fontsize=11)
        ax.set_ylabel("F1 (Hz)", fontsize=11)
        ax.set_title("Vowel Space: Produced vs English Targets", fontsize=12, fontweight="bold")
        ax.invert_xaxis()
        ax.invert_yaxis()
        ax.legend(fontsize=9)
        ax.grid(True, alpha=0.3)

        buf = io.BytesIO()
        fig.savefig(buf, format="png", dpi=150, bbox_inches="tight", facecolor="white")
        plt.close(fig)
        buf.seek(0)
        return buf.read()
    except Exception as exc:
        logger.warning("Formant plot failed: %s", exc)
        return None


def generate_pdf_report(
    profile: dict[str, Any],
    audio_path: str | Path | None = None,
    student_name: str = "Student",
    student_id: str = "",
) -> bytes:
    """Generate a comprehensive PDF diagnostic report."""
    try:
        from reportlab.lib import colors
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.lib.units import mm, cm
        from reportlab.platypus import (
            SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image,
            PageBreak, HRFlowable,
        )
        from reportlab.lib.enums import TA_CENTER, TA_LEFT
    except ImportError:
        return _generate_simple_pdf(profile, student_name, student_id, audio_path)

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, topMargin=1.5 * cm, bottomMargin=1.5 * cm)

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle("Title2", parent=styles["Title"], fontSize=20, textColor=colors.HexColor("#0891b2"))
    heading_style = ParagraphStyle("Heading2b", parent=styles["Heading2"], textColor=colors.HexColor("#1e293b"))
    body_style = styles["Normal"]
    small_style = ParagraphStyle("Small", parent=body_style, fontSize=9, textColor=colors.grey)

    elements: list[Any] = []

    # Title
    elements.append(Paragraph("Contrastive Acoustic Voice Profile", title_style))
    elements.append(Paragraph("Diagnostic Report", styles["Heading3"]))
    elements.append(Spacer(1, 5 * mm))
    elements.append(HRFlowable(width="100%", color=colors.HexColor("#0891b2"), thickness=2))
    elements.append(Spacer(1, 5 * mm))

    # Student info
    info_data = [
        ["Student Name:", student_name, "Student ID:", student_id or "N/A"],
        ["Date:", datetime.now().strftime("%B %d, %Y"), "Language:", profile.get("transcription", {}).get("language", "N/A")],
    ]
    info_table = Table(info_data, colWidths=[80, 150, 80, 150])
    info_table.setStyle(TableStyle([
        ("FONTSIZE", (0, 0), (-1, -1), 10),
        ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
        ("FONTNAME", (2, 0), (2, -1), "Helvetica-Bold"),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    elements.append(info_table)
    elements.append(Spacer(1, 8 * mm))

    # Transcript
    transcript = profile.get("transcription", {}).get("text", "")
    if transcript:
        elements.append(Paragraph("What Was Said:", heading_style))
        elements.append(Paragraph(f'"{transcript}"', ParagraphStyle("Quote", parent=body_style, fontSize=11, textColor=colors.HexColor("#334155"), leftIndent=10)))
        elements.append(Spacer(1, 5 * mm))

    # Score summary
    elements.append(Paragraph("Score Summary", heading_style))
    pa = profile.get("phoneme_analysis", {})
    mb = profile.get("morpheme_boundary", {})
    pp = profile.get("prosodic_profile", {})
    cs = profile.get("connected_speech", {})
    vq = profile.get("voice_quality", {})
    l1_data = profile.get("l1_interference", profile.get("bhojpuri_interference", {}))
    l1_name = profile.get("l1_display_name", l1_data.get("l1_display_name", "L1"))

    score_data = [
        ["Measure", "Score", "What It Means"],
        ["Phoneme Accuracy", f"{(pa.get('overall_accuracy', 0) * 100):.1f} / 100", "How correctly English sounds are produced"],
        ["L1 Interference", f"{pa.get('interference_score', 0):.1f} / 100", f"How much {l1_name} patterns affect English (lower = better)"],
        [f"{l1_name} Interference", f"{l1_data.get('l1_interference_score', l1_data.get('bhojpuri_interference_score', 0)):.1f} / 100", f"Specific {l1_name} sound patterns detected"],
        ["Prosodic Score", f"{pp.get('prosodic_score', 0):.1f} / 100", "Rhythm, stress, and intonation quality"],
        ["Fluency", f"{cs.get('fluency_score', 0):.1f} / 100", "How smoothly words connect together"],
        ["Cognitive Load", f"{mb.get('cognitive_load', {}).get('score', 0):.1f} / 100", "Mental effort during speech (lower = easier)"],
        ["Voice Quality", f"{vq.get('overall_quality_score', 0):.1f} / 100", "Overall voice health and clarity"],
    ]
    score_table = Table(score_data, colWidths=[120, 80, 260])
    score_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0891b2")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f8fafc")]),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
    ]))
    elements.append(score_table)
    elements.append(Spacer(1, 8 * mm))

    # Spectrogram images
    if audio_path:
        spec_img = _generate_spectrogram_image(audio_path)
        if spec_img:
            elements.append(PageBreak())
            elements.append(Paragraph("Voice Visualization", heading_style))
            elements.append(Paragraph(
                "These images show your child's voice patterns. The colors represent energy at different frequencies.",
                small_style,
            ))
            elements.append(Spacer(1, 3 * mm))
            elements.append(Image(io.BytesIO(spec_img), width=16 * cm, height=12 * cm))
            elements.append(Spacer(1, 5 * mm))

        formant_img = _generate_formant_plot(profile.get("feature_extraction", {}).get("parselmouth", {}).get("formants", {}))
        if formant_img:
            elements.append(Paragraph("Vowel Space", heading_style))
            elements.append(Paragraph(
                "Blue dots show where your child's vowels land. Red labels show where English vowels should be. "
                "The gap between them shows which vowels need practice.",
                small_style,
            ))
            elements.append(Spacer(1, 3 * mm))
            elements.append(Image(io.BytesIO(formant_img), width=12 * cm, height=10 * cm))

    # CIF intent summary — plain-English read of the diagnosis
    cif_data = profile.get("cif_analysis", {}) or {}
    if cif_data.get("intent_summary"):
        elements.append(PageBreak())
        elements.append(Paragraph("Diagnostic Summary", heading_style))
        elements.append(Paragraph(cif_data["intent_summary"], body_style))
        elements.append(Spacer(1, 4 * mm))

    # Fired substitution patterns (acoustic evidence + remediation drill)
    fired = cif_data.get("fired_substitutions") or l1_data.get("fired_substitutions") or []
    if fired:
        elements.append(Paragraph(f"{l1_name}→English Transfer Patterns Detected", heading_style))
        elements.append(Paragraph(
            f"Each row below names a specific sound transfer with acoustic evidence "
            f"in this recording, plus a drill the teacher can run.",
            body_style,
        ))
        elements.append(Spacer(1, 3 * mm))

        for sub in fired[:12]:
            target = sub.get("target", "?")
            substitute = sub.get("likely_substitute", "?")
            arrow = f"/{sub.get('ipa_target', target)}/ → /{sub.get('ipa_substitute', substitute)}/"
            grade = sub.get("evidence_grade", "heuristic")
            events = sub.get("events") or []

            grade_label = {
                "phoneme_aligned": f"phoneme-aligned ({len(events)} event{'s' if len(events) != 1 else ''})",
                "heuristic": "acoustic-marker heuristic",
            }.get(grade, grade)

            sub_data = [
                ["Substitution:", f"{target} → {substitute}    ({arrow})"],
                ["Why:", sub.get("description", "")],
                ["Acoustic evidence:", sub.get("evidence", "")],
                ["Severity / confidence:", f"{sub.get('severity', '?')} / {sub.get('confidence', '?')}  ({grade_label})"],
            ]
            # Per-event timestamps when phoneme-aligned (max 6 to keep PDF compact)
            if events:
                ts_lines = []
                for ev in events[:6]:
                    start_s = (ev.get("start_ms") or 0) / 1000.0
                    end_s = (ev.get("end_ms") or 0) / 1000.0
                    conf = ev.get("confidence", 0)
                    ts_lines.append(f"@{start_s:.2f}s–{end_s:.2f}s  ({ev.get('label', '')})  conf={conf}")
                if len(events) > 6:
                    ts_lines.append(f"… +{len(events) - 6} more event(s)")
                sub_data.append(["Timestamps:", "\n".join(ts_lines)])
            sub_data.append(["Drill:", sub.get("remediation", "")])

            sub_table = Table(sub_data, colWidths=[110, 350])
            sub_table.setStyle(TableStyle([
                ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 9),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
                ("TOPPADDING", (0, 0), (-1, -1), 3),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LINEBELOW", (0, -1), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
            ]))
            elements.append(sub_table)
            elements.append(Spacer(1, 4 * mm))

    # L1 interference acoustic markers (broader patterns: rhythm, vowel space, etc)
    if l1_data.get("detected_patterns"):
        elements.append(Paragraph(f"{l1_name} Acoustic Interference Markers", heading_style))
        elements.append(Paragraph(
            f"These are broader acoustic markers (rhythm, vowel space, intonation) "
            f"where {l1_name} is shaping English production.",
            body_style,
        ))
        elements.append(Spacer(1, 3 * mm))

        for pat in l1_data["detected_patterns"]:
            pat_data = [
                ["Pattern:", pat.get("pattern", "").replace("_", " ").title()],
                ["Evidence:", pat.get("evidence", "")],
                ["Severity:", pat.get("severity", "")],
                ["What to Practice:", pat.get("remediation", "")],
            ]
            pat_table = Table(pat_data, colWidths=[100, 360])
            pat_table.setStyle(TableStyle([
                ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 9),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
                ("TOPPADDING", (0, 0), (-1, -1), 3),
                ("LINEBELOW", (0, -1), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
            ]))
            elements.append(pat_table)
            elements.append(Spacer(1, 4 * mm))

    # Recommendations
    elements.append(Paragraph("Recommendations for Parents", heading_style))
    recs = [
        "Practice the specific sounds listed above for 10-15 minutes daily.",
        "Focus on one sound pattern per week.",
        "Read English storybooks aloud together — this builds natural rhythm.",
        "Record your child reading and play it back — self-monitoring helps.",
        "Praise effort, not perfection — confidence is key to speaking improvement.",
    ]
    if l1_data.get("detected_patterns"):
        for pat in l1_data["detected_patterns"]:
            if pat.get("remediation"):
                recs.append(pat["remediation"])

    for i, rec in enumerate(recs, 1):
        elements.append(Paragraph(f"{i}. {rec}", body_style))
        elements.append(Spacer(1, 2 * mm))

    elements.append(Spacer(1, 10 * mm))
    elements.append(HRFlowable(width="100%", color=colors.grey, thickness=0.5))
    elements.append(Paragraph(
        f"Generated by Contrastive Acoustic Voice Profiling System | {datetime.now().strftime('%Y-%m-%d %H:%M')}",
        small_style,
    ))

    doc.build(elements)
    buf.seek(0)
    return buf.read()


def _generate_simple_pdf(
    profile: dict[str, Any],
    student_name: str,
    student_id: str,
    audio_path: str | Path | None,
) -> bytes:
    """Fallback PDF generation without reportlab (plain text)."""
    import json

    lines = [
        "CONTRASTIVE ACOUSTIC VOICE PROFILE - DIAGNOSTIC REPORT",
        "=" * 55,
        f"Student: {student_name}",
        f"ID: {student_id}",
        f"Date: {datetime.now().strftime('%B %d, %Y')}",
        "",
        "SCORES:",
        f"  Phoneme Accuracy: {profile.get('phoneme_analysis', {}).get('overall_accuracy', 0) * 100:.1f}",
        f"  L1 Interference:  {profile.get('phoneme_analysis', {}).get('interference_score', 0):.1f}",
        f"  Prosodic Score:   {profile.get('prosodic_profile', {}).get('prosodic_score', 0):.1f}",
        f"  Fluency:          {profile.get('connected_speech', {}).get('fluency_score', 0):.1f}",
        f"  Voice Quality:    {profile.get('voice_quality', {}).get('overall_quality_score', 0):.1f}",
        "",
    ]

    cif = profile.get("cif_analysis", {}) or {}
    if cif.get("intent_summary"):
        lines.append("DIAGNOSTIC SUMMARY:")
        lines.append(f"  {cif['intent_summary']}")
        lines.append("")

    l1_fb = profile.get("l1_interference", profile.get("bhojpuri_interference", {}))
    l1_fb_name = profile.get("l1_display_name", l1_fb.get("l1_display_name", "L1"))

    fired = cif.get("fired_substitutions") or l1_fb.get("fired_substitutions") or []
    if fired:
        lines.append(f"{l1_fb_name.upper()}→ENGLISH TRANSFER PATTERNS:")
        for sub in fired[:12]:
            tgt = sub.get("target", "?")
            sb = sub.get("likely_substitute", "?")
            grade = sub.get("evidence_grade", "heuristic")
            events = sub.get("events") or []
            grade_tag = f"phoneme-aligned/{len(events)} ev" if events else "heuristic"
            lines.append(f"  - {tgt} -> {sb}  [{sub.get('severity', '?')}/{sub.get('confidence', '?')}/{grade_tag}]")
            lines.append(f"    Why: {sub.get('description', '')}")
            lines.append(f"    Evidence: {sub.get('evidence', '')}")
            for ev in events[:4]:
                start_s = (ev.get("start_ms") or 0) / 1000.0
                end_s = (ev.get("end_ms") or 0) / 1000.0
                lines.append(f"      @{start_s:.2f}s-{end_s:.2f}s  {ev.get('label', '')}  conf={ev.get('confidence', 0)}")
            if len(events) > 4:
                lines.append(f"      … +{len(events) - 4} more event(s)")
            lines.append(f"    Drill: {sub.get('remediation', '')}")
        lines.append("")

    lines.append(f"{l1_fb_name.upper()} ACOUSTIC MARKERS:")
    for pat in l1_fb.get("detected_patterns", []):
        lines.append(f"  - {pat.get('pattern', '')}: {pat.get('evidence', '')}")
        lines.append(f"    Practice: {pat.get('remediation', '')}")

    return "\n".join(lines).encode("utf-8")
