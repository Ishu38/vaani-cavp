import React, { useState, useEffect } from "react";
import { getConsentStatus, requestConsent, requestDeletion, getTrajectory } from "../../utils/api.js";
import ProgressTracker from "../../components/ProgressTracker.jsx";

export default function StudentDetailPage({ speakerId, studentName, onBack, onAnalyze }) {
  const [consent, setConsent] = useState(null);
  const [trajectory, setTrajectory] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [requesting, setRequesting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [consentForm, setConsentForm] = useState({ parentEmail: "", parentName: "" });
  const [showConsentForm, setShowConsentForm] = useState(false);

  useEffect(() => {
    if (!speakerId) return;
    setLoading(true);
    Promise.all([
      getConsentStatus(speakerId).catch(() => null),
      getTrajectory(speakerId).catch(() => null),
    ])
      .then(([c, t]) => {
        setConsent(c);
        setTrajectory(t);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [speakerId]);

  async function handleRequestConsent(e) {
    e.preventDefault();
    setRequesting(true);
    setError(null);
    try {
      await requestConsent({
        studentSpeakerId: speakerId,
        parentEmail: consentForm.parentEmail,
        parentName: consentForm.parentName,
      });
      setShowConsentForm(false);
      // Reload consent status
      const c = await getConsentStatus(speakerId).catch(() => null);
      setConsent(c);
    } catch (err) {
      setError(err.message);
    } finally {
      setRequesting(false);
    }
  }

  async function handleDeleteData() {
    if (!confirm("This will permanently delete ALL analysis data for this student. This action cannot be undone. Continue?")) return;
    setDeleting(true);
    setError(null);
    try {
      await requestDeletion(speakerId);
      alert("Deletion request submitted successfully.");
      setTrajectory(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setDeleting(false);
    }
  }

  function consentBadge() {
    if (!consent) return <span style={{ ...s.badge, background: "#f3f4f6", color: "#9ca3af" }}>No Record</span>;
    const status = consent.status || consent.consentStatus || "none";
    if (status === "granted" || status === "active")
      return <span style={{ ...s.badge, background: "#dcfce7", color: "#16a34a" }}>Granted</span>;
    if (status === "pending")
      return <span style={{ ...s.badge, background: "#fef9c3", color: "#ca8a04" }}>Pending</span>;
    if (status === "revoked" || status === "denied")
      return <span style={{ ...s.badge, background: "#fef2f2", color: "#dc2626" }}>Revoked</span>;
    return <span style={{ ...s.badge, background: "#f3f4f6", color: "#9ca3af" }}>None</span>;
  }

  const consentStatus = consent?.status || consent?.consentStatus || "none";
  const sessions = trajectory?.trajectory || [];

  if (loading) return <div style={s.center}>Loading student details...</div>;

  return (
    <div style={s.wrapper}>
      <button onClick={onBack} style={s.backBtn}>&larr; Back</button>

      {/* Header */}
      <div style={s.headerCard}>
        <div style={s.headerInfo}>
          <h2 style={s.title}>{studentName || "Student"}</h2>
          <p style={s.meta}>Speaker ID: <strong>{speakerId}</strong></p>
          {sessions.length > 0 && sessions[0]?.l1_language && (
            <p style={s.meta}>L1 Language: <strong>{sessions[0].l1_language}</strong></p>
          )}
        </div>
        <div style={s.headerRight}>
          <div style={s.consentRow}>
            <span style={s.consentLabel}>Consent Status:</span>
            {consentBadge()}
          </div>
        </div>
      </div>

      {error && <div style={s.errorMsg}>{error}</div>}

      {/* Actions */}
      <div style={s.actionRow}>
        <button style={s.primaryBtn} onClick={onAnalyze}>
          Run New Analysis
        </button>

        {(consentStatus === "none" || !consent) && (
          <button style={s.secondaryBtn} onClick={() => setShowConsentForm(!showConsentForm)}>
            {showConsentForm ? "Cancel" : "Request Consent"}
          </button>
        )}

        <button style={s.dangerBtn} onClick={handleDeleteData} disabled={deleting}>
          {deleting ? "Requesting..." : "Delete All Data"}
        </button>
      </div>

      {/* Consent form */}
      {showConsentForm && (
        <form onSubmit={handleRequestConsent} style={s.formCard}>
          <h3 style={s.formTitle}>Request Parental Consent</h3>
          <div style={s.formGrid}>
            <label style={s.fieldWrap}>
              <span style={s.label}>Parent Name</span>
              <input
                style={s.input}
                value={consentForm.parentName}
                onChange={(e) => setConsentForm({ ...consentForm, parentName: e.target.value })}
                placeholder="Parent's name"
                required
              />
            </label>
            <label style={s.fieldWrap}>
              <span style={s.label}>Parent Email</span>
              <input
                style={s.input}
                type="email"
                value={consentForm.parentEmail}
                onChange={(e) => setConsentForm({ ...consentForm, parentEmail: e.target.value })}
                placeholder="parent@email.com"
                required
              />
            </label>
          </div>
          <button type="submit" style={s.submitBtn} disabled={requesting}>
            {requesting ? "Sending..." : "Send Consent Request"}
          </button>
        </form>
      )}

      {/* CIF Trajectory */}
      <div style={s.section}>
        <h3 style={s.sectionTitle}>CIF Trajectory</h3>
        {trajectory && sessions.length > 0 ? (
          <ProgressTracker data={trajectory} />
        ) : (
          <p style={s.empty}>No analysis history yet. Run an analysis to start tracking progress.</p>
        )}
      </div>

      {/* Session list */}
      <div style={s.section}>
        <h3 style={s.sectionTitle}>Analysis Sessions ({sessions.length})</h3>
        {sessions.length === 0 ? (
          <p style={s.empty}>No sessions recorded.</p>
        ) : (
          <div style={s.sessionList}>
            {sessions.map((sess, i) => {
              const cifScore = sess.cif_analysis?.composite_intelligibility_factor
                ?? sess.cifAnalysis?.compositeIntelligibilityFactor
                ?? null;
              const date = sess.createdAt || sess.created_at;
              return (
                <div key={i} style={s.sessionCard}>
                  <div style={s.sessionInfo}>
                    <span style={s.sessionDate}>
                      {date ? new Date(date).toLocaleString() : `Session ${i + 1}`}
                    </span>
                    {cifScore != null && (
                      <span
                        style={{
                          ...s.cifBadge,
                          backgroundColor: cifColorBg(cifScore),
                          color: cifColorText(cifScore),
                        }}
                      >
                        CIF: {cifScore.toFixed(3)}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function cifColorText(score) {
  if (score < 0.3) return "#16a34a";
  if (score <= 0.6) return "#ca8a04";
  return "#dc2626";
}

function cifColorBg(score) {
  if (score < 0.3) return "#dcfce7";
  if (score <= 0.6) return "#fef9c3";
  return "#fef2f2";
}

const s = {
  wrapper: { maxWidth: 900, margin: "0 auto", padding: "32px 16px" },
  center: { textAlign: "center", padding: 64, color: "#666", fontSize: 16 },
  backBtn: {
    padding: "8px 16px",
    borderRadius: 8,
    border: "1px solid #d1d5db",
    background: "#fff",
    color: "#374151",
    fontWeight: 600,
    fontSize: 13,
    cursor: "pointer",
    marginBottom: 16,
  },
  headerCard: {
    background: "#fff",
    borderRadius: 16,
    padding: 28,
    marginBottom: 24,
    boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
    border: "1px solid #e5e7eb",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    flexWrap: "wrap",
    gap: 16,
  },
  headerInfo: {},
  headerRight: { display: "flex", alignItems: "center" },
  title: { fontSize: 26, fontWeight: 800, color: "#111", margin: 0 },
  meta: { fontSize: 14, color: "#6b7280", margin: "4px 0 0 0" },
  consentRow: { display: "flex", alignItems: "center", gap: 8 },
  consentLabel: { fontSize: 13, fontWeight: 600, color: "#6b7280" },
  badge: {
    padding: "4px 12px",
    borderRadius: 6,
    fontWeight: 700,
    fontSize: 12,
  },
  errorMsg: { background: "#fef2f2", color: "#dc2626", padding: "12px 16px", borderRadius: 10, marginBottom: 16, fontSize: 14 },
  actionRow: { display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 24 },
  primaryBtn: {
    padding: "12px 24px",
    borderRadius: 10,
    border: "none",
    background: "#00A699",
    color: "#fff",
    fontWeight: 700,
    fontSize: 14,
    cursor: "pointer",
  },
  secondaryBtn: {
    padding: "12px 24px",
    borderRadius: 10,
    border: "1px solid #00A699",
    background: "transparent",
    color: "#00A699",
    fontWeight: 700,
    fontSize: 14,
    cursor: "pointer",
  },
  dangerBtn: {
    padding: "12px 24px",
    borderRadius: 10,
    border: "1px solid #ef4444",
    background: "transparent",
    color: "#ef4444",
    fontWeight: 700,
    fontSize: 14,
    cursor: "pointer",
  },
  formCard: {
    background: "#fff",
    borderRadius: 14,
    padding: 24,
    marginBottom: 24,
    boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
    border: "1px solid #e5e7eb",
  },
  formTitle: { fontSize: 16, fontWeight: 700, color: "#111", margin: "0 0 16px 0" },
  formGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, marginBottom: 16 },
  fieldWrap: { display: "flex", flexDirection: "column", gap: 4 },
  label: { fontSize: 12, fontWeight: 600, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.5 },
  input: {
    padding: "10px 12px",
    borderRadius: 8,
    border: "1px solid #d1d5db",
    fontSize: 14,
    outline: "none",
  },
  submitBtn: {
    padding: "10px 20px",
    borderRadius: 8,
    border: "none",
    background: "#111",
    color: "#fff",
    fontWeight: 700,
    fontSize: 14,
    cursor: "pointer",
  },
  section: { marginBottom: 32 },
  sectionTitle: { fontSize: 18, fontWeight: 700, color: "#111", marginBottom: 16 },
  empty: { color: "#9ca3af", fontSize: 14 },
  sessionList: { display: "flex", flexDirection: "column", gap: 8 },
  sessionCard: {
    background: "#fff",
    borderRadius: 10,
    padding: "14px 20px",
    border: "1px solid #e5e7eb",
    boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
  },
  sessionInfo: { display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 },
  sessionDate: { fontSize: 14, fontWeight: 600, color: "#374151" },
  cifBadge: {
    padding: "4px 12px",
    borderRadius: 6,
    fontWeight: 700,
    fontSize: 13,
  },
};
