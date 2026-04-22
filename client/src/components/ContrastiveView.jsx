import React from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";

export default function ContrastiveView({ report }) {
  if (!report) return null;

  const allDiffs = [
    ...(report.formant_differences || []),
    ...(report.pitch_differences || []),
    ...(report.quality_differences || []),
  ];

  const chartData = allDiffs.map((d) => ({
    name: d.dimension,
    diff: d.percent_diff,
    significance: d.significance,
  }));

  const sigColors = { low: "#22c55e", moderate: "#f59e0b", high: "#f97316", critical: "#ef4444" };

  return (
    <div style={styles.container}>
      <h3 style={styles.heading}>L1 vs English Comparison</h3>

      <div style={styles.scoreRow}>
        {[
          { label: "Overall Difference", val: report.overall_contrastive_score?.toFixed(1) ?? "—" },
          { label: "Sound Accuracy Gap", val: report.phoneme_interference_score?.toFixed(1) ?? "—" },
          { label: "Rhythm Difference", val: report.prosodic_divergence_score?.toFixed(1) ?? "—" },
          { label: "Fluency Gap", val: report.fluency_gap?.toFixed(1) ?? "—" },
          { label: "Voice Similarity", val: report.voice_quality_similarity != null ? `${(report.voice_quality_similarity * 100).toFixed(1)}%` : "—" },
          { label: "Rhythm Match", val: report.rhythm_class_match ? "Yes" : "No", color: report.rhythm_class_match ? "#22c55e" : "#ef4444" },
        ].map((item, i) => (
          <div key={i} style={styles.scoreBadge}>
            <span style={styles.scoreLabel}>{item.label}</span>
            <span style={{ ...styles.scoreVal, color: item.color || "#111827" }}>{item.val}</span>
          </div>
        ))}
      </div>

      {chartData.length > 0 && (
        <div style={styles.chartWrap}>
          <h4 style={styles.subhead}>Where the two samples differ most</h4>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData} layout="vertical" margin={{ left: 100 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis type="number" stroke="#d1d5db" tick={{ fontSize: 10, fill: "#9ca3af" }} />
              <YAxis dataKey="name" type="category" stroke="#d1d5db" tick={{ fontSize: 12, fill: "#374151" }} width={90} />
              <Tooltip contentStyle={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, fontSize: 12, boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }} />
              <Bar dataKey="diff" radius={[0, 6, 6, 0]}>
                {chartData.map((entry, i) => (
                  <Cell key={i} fill={sigColors[entry.significance] || "#d1d5db"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {report.key_interference_patterns?.length > 0 && (
        <div style={styles.section}>
          <h4 style={styles.subhead}>What we noticed</h4>
          <ul style={styles.list}>
            {report.key_interference_patterns.map((p, i) => (
              <li key={i} style={styles.listItem}>{p}</li>
            ))}
          </ul>
        </div>
      )}

      {report.recommendations?.length > 0 && (
        <div style={{ ...styles.section, background: "#f0fdf4", borderColor: "#bbf7d0" }}>
          <h4 style={{ ...styles.subhead, color: "#166534" }}>How to help</h4>
          <ul style={styles.list}>
            {report.recommendations.map((r, i) => (
              <li key={i} style={{ ...styles.listItem, color: "#166534" }}>{r}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

const styles = {
  container: { background: "#fff", border: "1px solid #f3f4f6", borderRadius: 16, padding: 28, boxShadow: "0 1px 3px rgba(0,0,0,0.04)" },
  heading: { fontSize: 20, fontWeight: 800, color: "#111827", margin: "0 0 20px" },
  scoreRow: { display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 24 },
  scoreBadge: {
    background: "#fafafa", border: "1px solid #f3f4f6", borderRadius: 12,
    padding: "12px 18px", textAlign: "center", flex: "1 1 130px",
  },
  scoreLabel: { display: "block", color: "#9ca3af", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600 },
  scoreVal: { display: "block", fontSize: 22, fontWeight: 800, marginTop: 4 },
  chartWrap: { marginBottom: 24 },
  subhead: { fontSize: 14, fontWeight: 700, color: "#374151", marginBottom: 12 },
  section: { background: "#fafafa", border: "1px solid #f3f4f6", borderRadius: 10, padding: 16, marginBottom: 16 },
  list: { margin: 0, padding: "0 0 0 20px", fontSize: 14, color: "#374151" },
  listItem: { marginBottom: 6, lineHeight: 1.5 },
};
