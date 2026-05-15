import React, { useState, useEffect } from "react";
import { getDashboard } from "../../utils/api.js";

export default function DashboardHome({ onNavigate }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    getDashboard()
      .then(setData)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={s.center}>Loading dashboard...</div>;
  if (error) return <div style={s.center}>Error: {error}</div>;

  const recent = data?.recentAnalyses || [];
  const avgCif =
    recent.length > 0
      ? (recent.reduce((sum, r) => sum + (r.cifScore || 0), 0) / recent.length).toFixed(2)
      : "N/A";

  function cifColor(score) {
    if (score < 0.3) return "#22c55e";
    if (score <= 0.6) return "#eab308";
    return "#ef4444";
  }

  return (
    <div style={s.wrapper}>
      <div style={s.header}>
        <h2 style={s.title}>Teacher Dashboard</h2>
        <p style={s.subtitle}>Overview of your classrooms and student analyses</p>
      </div>

      {/* Stat cards */}
      <div style={s.statRow}>
        {[
          { label: "Total Students", value: data?.totalStudents ?? 0 },
          { label: "Total Classrooms", value: data?.totalClassrooms ?? 0 },
          { label: "Total Analyses", value: data?.totalAnalyses ?? 0 },
          { label: "Avg CIF Score", value: avgCif },
        ].map((stat, i) => (
          <div key={i} style={s.statCard}>
            <span style={s.statValue}>{stat.value}</span>
            <span style={s.statLabel}>{stat.label}</span>
          </div>
        ))}
      </div>

      {/* Quick Actions */}
      <div style={s.section}>
        <h3 style={s.sectionTitle}>Quick Actions</h3>
        <div style={s.actionRow}>
          <button style={s.actionBtn} onClick={() => onNavigate("single")}>
            New Analysis
          </button>
          <button style={s.actionBtn} onClick={() => onNavigate("classes")}>
            Add Student
          </button>
          <button style={s.actionBtn} onClick={() => onNavigate("classes")}>
            View Classes
          </button>
        </div>
      </div>

      {/* Recent Analyses */}
      <div style={s.section}>
        <h3 style={s.sectionTitle}>Recent Analyses</h3>
        {recent.length === 0 ? (
          <p style={s.empty}>No analyses yet. Run your first analysis to see results here.</p>
        ) : (
          <div style={s.tableWrap}>
            <table style={s.table}>
              <thead>
                <tr>
                  <th style={s.th}>Student Name</th>
                  <th style={s.th}>Speaker ID</th>
                  <th style={s.th}>CIF Score</th>
                  <th style={s.th}>Date</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((r, i) => (
                  <tr key={i} style={i % 2 === 0 ? s.trEven : s.trOdd}>
                    <td style={s.td}>{r.studentName || "—"}</td>
                    <td style={s.td}>{r.speakerId || "—"}</td>
                    <td style={s.td}>
                      <span
                        style={{
                          ...s.cifBadge,
                          backgroundColor: cifColor(r.cifScore) + "20",
                          color: cifColor(r.cifScore),
                        }}
                      >
                        {r.cifScore != null ? r.cifScore.toFixed(2) : "—"}
                      </span>
                    </td>
                    <td style={s.td}>
                      {r.date ? new Date(r.date).toLocaleDateString() : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

const s = {
  wrapper: { maxWidth: 1100, margin: "0 auto", padding: "32px 16px" },
  center: { textAlign: "center", padding: 64, color: "#666", fontSize: 16 },
  header: { marginBottom: 32 },
  title: { fontSize: 28, fontWeight: 800, color: "#111", margin: 0 },
  subtitle: { fontSize: 15, color: "#6b7280", marginTop: 6 },
  statRow: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, marginBottom: 32 },
  statCard: {
    background: "#fff",
    borderRadius: 14,
    padding: "28px 24px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 8,
    boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
    border: "1px solid #e5e7eb",
  },
  statValue: { fontSize: 32, fontWeight: 800, color: "#111" },
  statLabel: { fontSize: 13, fontWeight: 600, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.5 },
  section: { marginBottom: 32 },
  sectionTitle: { fontSize: 18, fontWeight: 700, color: "#111", marginBottom: 16 },
  actionRow: { display: "flex", gap: 12, flexWrap: "wrap" },
  actionBtn: {
    padding: "12px 24px",
    borderRadius: 10,
    border: "none",
    background: "#00A699",
    color: "#fff",
    fontWeight: 700,
    fontSize: 14,
    cursor: "pointer",
  },
  empty: { color: "#9ca3af", fontSize: 14 },
  tableWrap: { overflowX: "auto", borderRadius: 12, border: "1px solid #e5e7eb" },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 14 },
  th: {
    textAlign: "left",
    padding: "12px 16px",
    fontWeight: 700,
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    color: "#6b7280",
    background: "#f8f9fa",
    borderBottom: "1px solid #e5e7eb",
  },
  td: { padding: "12px 16px", borderBottom: "1px solid #f3f4f6" },
  trEven: { background: "#fff" },
  trOdd: { background: "#fafafa" },
  cifBadge: {
    padding: "4px 10px",
    borderRadius: 6,
    fontWeight: 700,
    fontSize: 13,
  },
};
