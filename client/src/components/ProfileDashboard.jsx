import React from "react";
import ScoreCard from "./ScoreCard.jsx";
import SpectrogramView from "./SpectrogramView.jsx";
import PitchContour from "./PitchContour.jsx";

export default function ProfileDashboard({ profile, label = "Voice Profile" }) {
  if (!profile) return null;

  const pa = profile.phoneme_analysis || {};
  const mb = profile.morpheme_boundary || {};
  const pp = profile.prosodic_profile || {};
  const cs = profile.connected_speech || {};
  const vq = profile.voice_quality || {};
  const fe = profile.feature_extraction || {};
  const tr = profile.transcription || {};
  const nlpData = profile.nlp || {};
  const bh = profile.l1_interference || profile.bhojpuri_interference || {};
  const l1Name = profile.l1_display_name || "Bhojpuri";

  return (
    <div style={styles.wrap}>
      <h3 style={styles.heading}>{label}</h3>

      {/* Transcript */}
      {tr.text && (
        <div style={styles.transcriptBox}>
          <span style={styles.transcriptLabel}>What we heard ({tr.language})</span>
          <p style={styles.transcriptText}>"{tr.text}"</p>
          <span style={styles.meta}>
            Length: {tr.duration_seconds?.toFixed(1)}s | Analyzed in {profile.processing_time_ms?.toFixed(0)}ms
          </span>
        </div>
      )}

      {/* Score cards */}
      <div style={styles.scoreGrid}>
        <ScoreCard title="Sound Accuracy" score={(pa.overall_accuracy || 0) * 100} color="#22c55e"
          items={pa.missing_target_phonemes?.length ? [`Missing sounds: ${pa.missing_target_phonemes.join(", ")}`] : []} />
        <ScoreCard title="Mother Tongue Influence" score={pa.interference_score || 0} color="#ef4444"
          items={(pa.substitution_patterns || []).slice(0, 2).map(s => `${s.target}: ${s.note}`)} />
        <ScoreCard title="Mental Effort" score={mb.cognitive_load?.score || 0} color="#f59e0b"
          items={mb.cognitive_load?.indicators || []} />
        <ScoreCard title="Confidence Level" score={mb.emotional_stress?.score || 0} color="#a855f7"
          items={mb.emotional_stress?.stress_indicators || []} />
        <ScoreCard title="Rhythm & Flow" score={pp.prosodic_score || 0} color="#0891b2"
          items={[`Rhythm type: ${pp.rhythm?.rhythm_class || "?"}`, `Tone pattern: ${pp.intonation?.pattern || "?"}`, `Speed: ${pp.speech_rate_syl_per_sec?.toFixed(1)} syllables/sec`]} />
        <ScoreCard title="Fluency" score={cs.fluency_score || 0} color="#10b981"
          items={[`Sound blending: ${cs.assimilations?.length || 0}`, `Word linking: ${cs.linkings?.length || 0}`, `Shortcuts: ${cs.reductions?.length || 0}`]} />
        <ScoreCard title="Voice Clarity" score={vq.overall_quality_score || 0} color="#3b82f6"
          items={vq.clinical_flags || []} />
      </div>

      {/* Visualizations */}
      <div style={styles.vizGrid}>
        <SpectrogramView melData={fe.librosa?.mel_spectrogram_db} />
        <PitchContour contour={fe.parselmouth?.pitch?.pitch_contour} />
      </div>

      {/* L1 Interference */}
      {bh.detected_patterns?.length > 0 && (
        <div style={styles.interferenceSection}>
          <div style={styles.interferenceHeader}>
            <h4 style={styles.interferenceTitle}>{l1Name} Influence Found in Speech</h4>
            <span style={styles.interferenceScore}>Score: {bh.l1_interference_score ?? bh.bhojpuri_interference_score}</span>
          </div>
          {bh.detected_patterns.map((pat, i) => (
            <div key={i} style={styles.interferenceCard}>
              <div style={styles.interferenceCardHead}>
                <span style={styles.patternName}>{pat.pattern?.replace(/_/g, " ")}</span>
                <span style={{
                  ...styles.severityBadge,
                  background: pat.severity === "high" ? "#fef2f2" : "#fffbeb",
                  color: pat.severity === "high" ? "#991b1b" : "#92400e",
                  borderColor: pat.severity === "high" ? "#fecaca" : "#fde68a",
                }}>{pat.severity}</span>
              </div>
              <p style={styles.evidence}>{pat.evidence}</p>
              <p style={styles.remediation}>{pat.remediation}</p>
            </div>
          ))}
          {bh.risk_areas?.length > 0 && (
            <div style={styles.riskRow}>
              {bh.risk_areas.map((r, i) => (
                <span key={i} style={styles.riskTag}>{r.replace(/_/g, " ")}</span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Codeswitching */}
      {mb.codeswitching?.switch_points?.length > 0 && (
        <div style={styles.section}>
          <h4 style={styles.sectionTitle}>Language Switching</h4>
          <div style={styles.tagRow}>
            {mb.codeswitching.switch_points.map((sp, i) => (
              <span key={i} style={styles.tag}>
                {sp.from_language} → {sp.to_language} @ {sp.position_ms}ms ({sp.switch_type})
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Morphemes */}
      {nlpData.syntax?.morphemes?.length > 0 && (
        <div style={styles.section}>
          <h4 style={styles.sectionTitle}>Word Structure</h4>
          <div style={styles.tagRow}>
            {nlpData.syntax.morphemes.slice(0, 20).map((m, i) => (
              <span key={i} style={styles.morphTag}>
                {m.word}: {m.prefixes?.join("-") || ""}{m.prefixes?.length ? "-" : ""}{m.root}{m.suffixes?.length ? "-" : ""}{m.suffixes?.join("-") || ""} ({m.morpheme_count})
              </span>
            ))}
          </div>
          <span style={styles.meta}>Avg. words per sentence: {nlpData.syntax.mlu} | Total syllables: {nlpData.syntax.syllable_count}</span>
        </div>
      )}

      {/* Voice Details */}
      <div style={styles.section}>
        <h4 style={styles.sectionTitle}>Voice Details</h4>
        <div style={styles.detailGrid}>
          {[
            ["Pitch Range", vq.register?.register || "?"],
            ["Breathiness", `${vq.breathiness?.classification || "?"} (${(vq.breathiness?.breathiness_index * 100)?.toFixed(0)}%)`],
            ["Vocal Fry", vq.creakiness?.has_vocal_fry ? "Yes" : "No"],
            ["Voice Clarity", `${vq.breathiness?.hnr?.toFixed(1)} dB`],
            ["Nasal Sound", `${(vq.nasality?.nasality_index * 100)?.toFixed(0)}%`],
            ["Vowel Range", `${pa.vowel_space_area?.toFixed(0)} Hz\u00B2`],
          ].map(([label, value], i) => (
            <div key={i} style={styles.detailItem}>
              <span style={styles.detailLabel}>{label}</span>
              <span style={styles.detailValue}>{value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const styles = {
  wrap: { marginBottom: 32 },
  heading: { fontSize: 20, fontWeight: 800, color: "#111827", marginBottom: 16, paddingBottom: 12, borderBottom: "2px solid #f3f4f6" },

  transcriptBox: {
    background: "#faf5ff", border: "1px solid #e9d5ff", borderRadius: 12, padding: 18, marginBottom: 20,
  },
  transcriptLabel: { color: "#7c3aed", fontSize: 11, textTransform: "uppercase", letterSpacing: 1, fontWeight: 700 },
  transcriptText: { color: "#374151", fontSize: 15, margin: "8px 0", lineHeight: 1.6, fontStyle: "italic" },
  meta: { color: "#9ca3af", fontSize: 12 },

  scoreGrid: { display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 20 },
  vizGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 },

  // L1 interference
  interferenceSection: {
    background: "#fff", border: "2px solid #fecaca", borderRadius: 12, padding: 20, marginBottom: 20,
  },
  interferenceHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 },
  interferenceTitle: { fontSize: 16, fontWeight: 700, color: "#991b1b", margin: 0 },
  interferenceScore: { background: "#fef2f2", color: "#991b1b", padding: "4px 12px", borderRadius: 20, fontSize: 13, fontWeight: 700 },
  interferenceCard: {
    background: "#fefce8", border: "1px solid #fde68a", borderRadius: 8, padding: 14, marginBottom: 10,
  },
  interferenceCardHead: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  patternName: { fontSize: 14, fontWeight: 700, color: "#374151", textTransform: "capitalize" },
  severityBadge: { padding: "2px 10px", borderRadius: 12, fontSize: 11, fontWeight: 700, border: "1px solid" },
  evidence: { fontSize: 13, color: "#6b7280", margin: "4px 0" },
  remediation: { fontSize: 13, color: "#166534", margin: "4px 0", fontWeight: 500 },
  riskRow: { display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 },
  riskTag: {
    background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 20, padding: "3px 12px",
    fontSize: 11, color: "#991b1b", fontWeight: 600,
  },

  // Sections
  section: { background: "#fff", border: "1px solid #f3f4f6", borderRadius: 12, padding: 18, marginBottom: 16, boxShadow: "0 1px 3px rgba(0,0,0,0.04)" },
  sectionTitle: { fontSize: 14, fontWeight: 700, color: "#374151", margin: "0 0 10px" },
  tagRow: { display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 6 },
  tag: {
    background: "#faf5ff", border: "1px solid #e9d5ff", borderRadius: 20, padding: "4px 12px",
    fontSize: 12, color: "#6d28d9", fontWeight: 500,
  },
  morphTag: {
    background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 20, padding: "4px 12px",
    fontSize: 12, color: "#166534", fontWeight: 500,
  },
  detailGrid: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 },
  detailItem: { textAlign: "center", padding: 10, background: "#fafafa", borderRadius: 8 },
  detailLabel: { display: "block", color: "#9ca3af", fontSize: 10, textTransform: "uppercase", fontWeight: 600, letterSpacing: 0.5 },
  detailValue: { display: "block", color: "#111827", fontSize: 15, fontWeight: 700, marginTop: 4 },
};
