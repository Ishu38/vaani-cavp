import React from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";

export default function ProgressTracker({ data }) {
  if (!data || !data.trajectory || data.trajectory.length === 0) {
    return (
      <div style={styles.empty}>
        No sessions found for this student. Run analyses first to build a trajectory.
      </div>
    );
  }

  const sessions = data.trajectory.map((p, i) => ({
    session: `#${data.count - i}`,
    date: new Date(p.createdAt).toLocaleDateString(),
    phoneme: (p.phoneme_analysis?.overall_accuracy || 0) * 100,
    interference: p.phoneme_analysis?.interference_score || 0,
    prosody: p.prosodic_profile?.prosodic_score || 0,
    fluency: p.connected_speech?.fluency_score || 0,
    voiceQuality: p.voice_quality?.overall_quality_score || 0,
    cognitiveLoad: p.morpheme_boundary?.cognitive_load?.score || 0,
    emotionalStress: p.morpheme_boundary?.emotional_stress?.score || 0,
  })).reverse();

  // Compute improvement
  const first = sessions[0] || {};
  const last = sessions[sessions.length - 1] || {};
  const improvements = [
    { dim: "Phoneme Accuracy", from: first.phoneme, to: last.phoneme, color: "#22c55e" },
    { dim: "L1 Interference", from: first.interference, to: last.interference, color: "#ef4444", inverted: true },
    { dim: "Prosodic Score", from: first.prosody, to: last.prosody, color: "#06b6d4" },
    { dim: "Fluency", from: first.fluency, to: last.fluency, color: "#10b981" },
    { dim: "Voice Quality", from: first.voiceQuality, to: last.voiceQuality, color: "#3b82f6" },
  ];

  return (
    <div style={styles.container}>
      <h3 style={styles.heading}>Progress Over {data.count} Sessions</h3>

      {/* Improvement badges */}
      <div style={styles.badgeRow}>
        {improvements.map((imp) => {
          const delta = imp.to - imp.from;
          const improved = imp.inverted ? delta < 0 : delta > 0;
          return (
            <div key={imp.dim} style={styles.badge}>
              <span style={styles.badgeLabel}>{imp.dim}</span>
              <span style={{ ...styles.badgeDelta, color: improved ? "#22c55e" : "#ef4444" }}>
                {delta > 0 ? "+" : ""}{delta.toFixed(1)}
              </span>
              <span style={styles.badgeCurrent}>{imp.to.toFixed(1)}</span>
            </div>
          );
        })}
      </div>

      {/* Main trajectory chart */}
      <div style={styles.chartWrap}>
        <h4 style={styles.chartTitle}>Skill Trajectory</h4>
        <ResponsiveContainer width="100%" height={350}>
          <LineChart data={sessions}>
            <CartesianGrid strokeDasharray="3 3" stroke="#222" />
            <XAxis dataKey="date" stroke="#555" tick={{ fontSize: 10 }} />
            <YAxis stroke="#555" tick={{ fontSize: 10 }} domain={[0, 100]} />
            <Tooltip
              contentStyle={{ background: "#16213e", border: "1px solid #333", fontSize: 12, borderRadius: 6 }}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Line type="monotone" dataKey="phoneme" name="Phoneme Accuracy" stroke="#22c55e" strokeWidth={2} dot={{ r: 3 }} />
            <Line type="monotone" dataKey="prosody" name="Prosodic Score" stroke="#06b6d4" strokeWidth={2} dot={{ r: 3 }} />
            <Line type="monotone" dataKey="fluency" name="Fluency" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} />
            <Line type="monotone" dataKey="voiceQuality" name="Voice Quality" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Interference & stress chart */}
      <div style={styles.chartWrap}>
        <h4 style={styles.chartTitle}>Interference & Cognitive Load (lower is better)</h4>
        <ResponsiveContainer width="100%" height={250}>
          <LineChart data={sessions}>
            <CartesianGrid strokeDasharray="3 3" stroke="#222" />
            <XAxis dataKey="date" stroke="#555" tick={{ fontSize: 10 }} />
            <YAxis stroke="#555" tick={{ fontSize: 10 }} domain={[0, 100]} />
            <Tooltip contentStyle={{ background: "#16213e", border: "1px solid #333", fontSize: 12, borderRadius: 6 }} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Line type="monotone" dataKey="interference" name="L1 Interference" stroke="#ef4444" strokeWidth={2} dot={{ r: 3 }} />
            <Line type="monotone" dataKey="cognitiveLoad" name="Cognitive Load" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} />
            <Line type="monotone" dataKey="emotionalStress" name="Emotional Stress" stroke="#a855f7" strokeWidth={2} dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Session list */}
      <div style={styles.sessionList}>
        <h4 style={styles.chartTitle}>Session History</h4>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Session</th>
              <th style={styles.th}>Date</th>
              <th style={styles.th}>Phoneme</th>
              <th style={styles.th}>Interference</th>
              <th style={styles.th}>Prosody</th>
              <th style={styles.th}>Fluency</th>
              <th style={styles.th}>Quality</th>
            </tr>
          </thead>
          <tbody>
            {sessions.map((s, i) => (
              <tr key={i}>
                <td style={styles.td}>{s.session}</td>
                <td style={styles.td}>{s.date}</td>
                <td style={{ ...styles.td, color: "#22c55e" }}>{s.phoneme.toFixed(1)}</td>
                <td style={{ ...styles.td, color: "#ef4444" }}>{s.interference.toFixed(1)}</td>
                <td style={{ ...styles.td, color: "#06b6d4" }}>{s.prosody.toFixed(1)}</td>
                <td style={{ ...styles.td, color: "#10b981" }}>{s.fluency.toFixed(1)}</td>
                <td style={{ ...styles.td, color: "#3b82f6" }}>{s.voiceQuality.toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const styles = {
  container: {
    background: "#0f0f23",
    border: "1px solid #222",
    borderRadius: 12,
    padding: 24,
  },
  heading: {
    color: "#fff",
    fontSize: 18,
    fontWeight: 800,
    margin: "0 0 16px",
  },
  empty: {
    background: "#1a1a2e",
    border: "1px solid #333",
    borderRadius: 8,
    padding: 40,
    textAlign: "center",
    color: "#666",
    fontSize: 14,
  },
  badgeRow: { display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 24 },
  badge: {
    background: "#1a1a2e",
    border: "1px solid #333",
    borderRadius: 8,
    padding: "10px 16px",
    flex: "1 1 140px",
    textAlign: "center",
  },
  badgeLabel: { display: "block", color: "#666", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5 },
  badgeDelta: { display: "block", fontSize: 18, fontWeight: 800, marginTop: 4 },
  badgeCurrent: { display: "block", color: "#888", fontSize: 11, marginTop: 2 },
  chartWrap: { marginBottom: 24 },
  chartTitle: { color: "#aaa", fontSize: 13, marginBottom: 10 },
  sessionList: { marginTop: 16 },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 12 },
  th: {
    textAlign: "left",
    padding: "8px 10px",
    borderBottom: "1px solid #333",
    color: "#666",
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  td: { padding: "6px 10px", borderBottom: "1px solid #1a1a2e", color: "#ccc" },
};
