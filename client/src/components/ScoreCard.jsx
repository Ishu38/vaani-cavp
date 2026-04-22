import React from "react";

export default function ScoreCard({ title, score, max = 100, items = [], color = "#7c3aed" }) {
  const safeScore = typeof score === "number" && isFinite(score) ? score : 0;
  const pct = Math.min(100, Math.max(0, (safeScore / max) * 100));

  return (
    <div style={styles.card}>
      <div style={styles.header}>
        <span style={styles.title}>{title}</span>
        <span style={{ ...styles.score, color }}>{safeScore.toFixed(1)}</span>
      </div>
      <div style={styles.barBg}>
        <div style={{ ...styles.barFill, width: `${pct}%`, background: color }} />
      </div>
      {items.length > 0 && (
        <ul style={styles.list}>
          {items.map((item, i) => (
            <li key={i} style={styles.item}>{item}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

const styles = {
  card: {
    background: "#fff",
    border: "1px solid #f3f4f6",
    borderRadius: 12,
    padding: 16,
    minWidth: 200,
    flex: "1 1 200px",
    boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
  },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  title: { color: "#6b7280", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.8, fontWeight: 600 },
  score: { fontSize: 24, fontWeight: 800 },
  barBg: { height: 4, background: "#f3f4f6", borderRadius: 2, overflow: "hidden" },
  barFill: { height: "100%", borderRadius: 2, transition: "width 0.6s ease" },
  list: { margin: "10px 0 0", padding: "0 0 0 16px", fontSize: 12, color: "#9ca3af" },
  item: { marginBottom: 3 },
};
