import React from "react";

const SEVERITY_COLORS = {
  Critical: { bg: "#fef2f2", border: "#fca5a5", text: "#991b1b", badge: "#dc2626" },
  High:     { bg: "#fff7ed", border: "#fdba74", text: "#9a3412", badge: "#ea580c" },
  Moderate: { bg: "#fffbeb", border: "#fcd34d", text: "#92400e", badge: "#d97706" },
  Mild:     { bg: "#f0fdf4", border: "#86efac", text: "#166534", badge: "#16a34a" },
  Low:      { bg: "#f0f9ff", border: "#7dd3fc", text: "#075985", badge: "#0284c7" },
};

function safe(val, decimals = 2) {
  return typeof val === "number" && isFinite(val) ? val.toFixed(decimals) : "—";
}

export default function CIFBreakdown({ cif, l1Name }) {
  if (!cif) return null;

  const { overall_cii, overall_severity, dimensions, trajectory, methodology } = cif;
  const displayL1 = l1Name || "L1";
  const overallColors = SEVERITY_COLORS[overall_severity] || SEVERITY_COLORS.Moderate;

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div>
          <h3 style={styles.title}>Mother Tongue Influence Analysis</h3>
          <p style={styles.subtitle}>How much the child's first language affects their English</p>
        </div>
        <div style={{ ...styles.overallBadge, background: overallColors.badge }}>
          Score: {safe(overall_cii)}
        </div>
      </div>

      {/* Overall gauge */}
      <div style={styles.gaugeSection}>
        <div style={styles.gaugeLabels}>
          <span style={styles.gaugeLabel}>Clear English</span>
          <span style={styles.gaugeLabel}>Strong {displayL1} influence</span>
        </div>
        <div style={styles.gaugeTrack}>
          <div
            style={{
              ...styles.gaugeFill,
              width: `${Math.min(100, (overall_cii || 0) * 100).toFixed(1)}%`,
              background: `linear-gradient(90deg, #0284c7, #16a34a, #d97706, #ea580c, #dc2626)`,
            }}
          />
          <div
            style={{
              ...styles.gaugeMarker,
              left: `${Math.min(100, overall_cii * 100).toFixed(1)}%`,
            }}
          />
        </div>
        <div style={{ ...styles.overallLabel, color: overallColors.text }}>
          Level: <strong>{overall_severity}</strong>
        </div>
      </div>

      {/* Dimension breakdown */}
      <div style={styles.breakdownSection}>
        <h4 style={styles.sectionTitle}>Area-by-Area Breakdown</h4>
        <div style={styles.dimensionList}>
          {(dimensions || []).map((dim) => {
            const colors = SEVERITY_COLORS[dim.severity] || SEVERITY_COLORS.Moderate;
            return (
              <div key={dim.name} style={{ ...styles.dimRow, background: colors.bg, borderColor: colors.border }}>
                <div style={styles.dimLeft}>
                  <span style={styles.dimName}>{dim.name}:</span>
                  <span style={styles.dimValue}>{safe(dim.cii)}</span>
                </div>
                <div style={styles.dimCenter}>
                  <div style={styles.dimBarTrack}>
                    {Array.from({ length: 10 }, (_, i) => (
                      <div
                        key={i}
                        style={{
                          ...styles.dimBarBlock,
                          background: i < Math.round((dim.cii || 0) * 10) ? colors.badge : "#e5e7eb",
                          opacity: i < Math.round((dim.cii || 0) * 10) ? 1 : 0.3,
                        }}
                      />
                    ))}
                  </div>
                </div>
                <div style={{ ...styles.dimBadge, background: colors.badge }}>
                  {dim.severity}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Trajectory prediction */}
      {trajectory && (
        <div style={styles.trajectorySection}>
          <h4 style={styles.sectionTitle}>Expected Improvement</h4>
          <div style={styles.trajGrid}>
            <div style={styles.trajCard}>
              <span style={styles.trajLabel}>Expected score in 8 weeks</span>
              <span style={styles.trajValue}>{safe(trajectory.predicted_cii_8w)}</span>
            </div>
            {trajectory.weeks_to_moderate != null && (
              <div style={styles.trajCard}>
                <span style={styles.trajLabel}>Weeks to reach "Moderate"</span>
                <span style={styles.trajValue}>{trajectory.weeks_to_moderate} weeks</span>
              </div>
            )}
            {trajectory.weeks_to_mild != null && (
              <div style={styles.trajCard}>
                <span style={styles.trajLabel}>Weeks to reach "Mild"</span>
                <span style={styles.trajValue}>{trajectory.weeks_to_mild} weeks</span>
              </div>
            )}
            <div style={styles.trajCard}>
              <span style={styles.trajLabel}>Lowest reachable score</span>
              <span style={styles.trajValue}>{safe(trajectory.cii_residual)}</span>
              <span style={styles.trajMeta}>Confidence: {trajectory.confidence}</span>
            </div>
          </div>

        </div>
      )}
    </div>
  );
}

const styles = {
  container: {
    background: "#fff",
    border: "1px solid #e5e7eb",
    borderRadius: 14,
    padding: 28,
    marginTop: 24,
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 24,
  },
  title: { fontSize: 20, fontWeight: 800, color: "#111827", margin: 0 },
  subtitle: { fontSize: 13, color: "#6b7280", marginTop: 4 },
  overallBadge: {
    color: "#fff",
    fontSize: 18,
    fontWeight: 800,
    padding: "10px 20px",
    borderRadius: 10,
    whiteSpace: "nowrap",
  },

  // Gauge
  gaugeSection: { marginBottom: 28 },
  gaugeLabels: {
    display: "flex",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  gaugeLabel: { fontSize: 11, color: "#9ca3af", fontWeight: 500 },
  gaugeTrack: {
    height: 12,
    background: "#f3f4f6",
    borderRadius: 6,
    position: "relative",
    overflow: "visible",
  },
  gaugeFill: {
    height: "100%",
    borderRadius: 6,
    transition: "width 0.6s ease",
  },
  gaugeMarker: {
    position: "absolute",
    top: -4,
    width: 4,
    height: 20,
    background: "#111827",
    borderRadius: 2,
    transform: "translateX(-2px)",
    transition: "left 0.6s ease",
  },
  overallLabel: { marginTop: 8, fontSize: 14, fontWeight: 600, textAlign: "center" },

  // Dimensions
  breakdownSection: { marginBottom: 28 },
  sectionTitle: { fontSize: 16, fontWeight: 700, color: "#111827", marginBottom: 12 },
  dimensionList: { display: "flex", flexDirection: "column", gap: 8 },
  dimRow: {
    display: "flex",
    alignItems: "center",
    padding: "12px 16px",
    borderRadius: 10,
    border: "1px solid",
    gap: 16,
  },
  dimLeft: { minWidth: 150, display: "flex", alignItems: "baseline", gap: 8 },
  dimName: { fontSize: 14, fontWeight: 700, color: "#374151" },
  dimValue: { fontSize: 16, fontWeight: 800, color: "#111827" },
  dimCenter: { flex: 1 },
  dimBarTrack: { display: "flex", gap: 3 },
  dimBarBlock: {
    width: 20,
    height: 20,
    borderRadius: 3,
    transition: "all 0.3s",
  },
  dimBadge: {
    color: "#fff",
    fontSize: 12,
    fontWeight: 700,
    padding: "4px 12px",
    borderRadius: 6,
    whiteSpace: "nowrap",
    minWidth: 70,
    textAlign: "center",
  },

  // Trajectory
  trajectorySection: { marginBottom: 24 },
  trajGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
    gap: 12,
    marginBottom: 16,
  },
  trajCard: {
    background: "#faf5ff",
    border: "1px solid #e9d5ff",
    borderRadius: 10,
    padding: "16px 18px",
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },
  trajLabel: { fontSize: 12, color: "#6b21a8", fontWeight: 600 },
  trajValue: { fontSize: 24, fontWeight: 800, color: "#7c3aed" },
  trajMeta: { fontSize: 11, color: "#9ca3af" },

};
