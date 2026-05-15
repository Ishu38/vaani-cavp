import React, { useState, useEffect } from "react";
import {
  getClassroom,
  getClassroomStudents,
  getClassroomAnalytics,
  addStudent,
  removeStudent,
  getConsentStatus,
} from "../../utils/api.js";

export default function ClassDetailPage({ classroomId, onBack, onAnalyzeStudent, onSelectStudent }) {
  const [classroom, setClassroom] = useState(null);
  const [students, setStudents] = useState([]);
  const [analytics, setAnalytics] = useState([]);
  const [tab, setTab] = useState("roster");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState({
    name: "", speakerId: "", parentEmail: "", parentPhone: "", gender: "child", l1Language: "auto",
  });
  const [adding, setAdding] = useState(false);
  const [consentMap, setConsentMap] = useState({});

  function loadData() {
    setLoading(true);
    Promise.all([
      getClassroom(classroomId),
      getClassroomStudents(classroomId),
    ])
      .then(([cls, stds]) => {
        setClassroom(cls);
        const studentList = Array.isArray(stds) ? stds : stds.students || [];
        setStudents(studentList);
        // Load consent for each student
        studentList.forEach((st) => {
          if (st.speakerId) {
            getConsentStatus(st.speakerId)
              .then((c) => setConsentMap((prev) => ({ ...prev, [st.speakerId]: c })))
              .catch(() => {});
          }
        });
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  function loadAnalytics() {
    getClassroomAnalytics(classroomId)
      .then((data) => setAnalytics(Array.isArray(data) ? data : data.data || data.analytics || []))
      .catch((err) => setError(err.message));
  }

  useEffect(() => { loadData(); }, [classroomId]);
  useEffect(() => { if (tab === "analytics") loadAnalytics(); }, [tab]);

  async function handleAddStudent(e) {
    e.preventDefault();
    setAdding(true);
    setError(null);
    try {
      await addStudent(classroomId, addForm);
      setAddForm({ name: "", speakerId: "", parentEmail: "", parentPhone: "", gender: "child", l1Language: "auto" });
      setShowAddForm(false);
      loadData();
    } catch (err) {
      setError(err.message);
    } finally {
      setAdding(false);
    }
  }

  async function handleRemoveStudent(studentId) {
    if (!confirm("Remove this student from the classroom?")) return;
    try {
      await removeStudent(classroomId, studentId);
      loadData();
    } catch (err) {
      setError(err.message);
    }
  }

  function consentBadge(speakerId) {
    const c = consentMap[speakerId];
    if (!c) return <span style={{ ...s.badge, background: "#f3f4f6", color: "#9ca3af" }}>Unknown</span>;
    const status = c.status || c.consentStatus || "none";
    if (status === "granted" || status === "active")
      return <span style={{ ...s.badge, background: "#dcfce7", color: "#16a34a" }}>Granted</span>;
    if (status === "pending")
      return <span style={{ ...s.badge, background: "#fef9c3", color: "#ca8a04" }}>Pending</span>;
    if (status === "revoked" || status === "denied")
      return <span style={{ ...s.badge, background: "#fef2f2", color: "#dc2626" }}>Revoked</span>;
    return <span style={{ ...s.badge, background: "#f3f4f6", color: "#9ca3af" }}>None</span>;
  }

  function cifColor(score) {
    if (score < 0.3) return "#22c55e";
    if (score <= 0.6) return "#eab308";
    return "#ef4444";
  }

  function trendArrow(trend) {
    if (trend === "improving" || trend === "up")
      return <span style={{ color: "#22c55e", fontWeight: 700 }}>&#9650;</span>;
    if (trend === "declining" || trend === "down")
      return <span style={{ color: "#ef4444", fontWeight: 700 }}>&#9660;</span>;
    return <span style={{ color: "#9ca3af", fontWeight: 700 }}>&#8212;</span>;
  }

  if (loading) return <div style={s.center}>Loading classroom...</div>;

  const sortedAnalytics = [...analytics].sort((a, b) => (a.latestCifScore || 0) - (b.latestCifScore || 0));

  return (
    <div style={s.wrapper}>
      <button onClick={onBack} style={s.backBtn}>&larr; Back to Classes</button>

      <div style={s.header}>
        <h2 style={s.title}>{classroom?.name || "Classroom"}</h2>
        <p style={s.subtitle}>
          {classroom?.grade && `Grade ${classroom.grade}`}
          {classroom?.section && ` - Section ${classroom.section}`}
          {classroom?.academicYear && ` | ${classroom.academicYear}`}
        </p>
      </div>

      {error && <div style={s.errorMsg}>{error}</div>}

      {/* Tab switcher */}
      <div style={s.tabRow}>
        {["roster", "analytics"].map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={tab === t ? s.tabActive : s.tab}
          >
            {t === "roster" ? "Roster" : "Analytics"}
          </button>
        ))}
      </div>

      {/* ROSTER TAB */}
      {tab === "roster" && (
        <div>
          <button
            style={s.addBtn}
            onClick={() => setShowAddForm(!showAddForm)}
          >
            {showAddForm ? "Cancel" : "+ Add Student"}
          </button>

          {showAddForm && (
            <form onSubmit={handleAddStudent} style={s.formCard}>
              <div style={s.formGrid}>
                <label style={s.fieldWrap}>
                  <span style={s.label}>Name</span>
                  <input style={s.input} value={addForm.name} onChange={(e) => setAddForm({ ...addForm, name: e.target.value })} placeholder="Student name" required />
                </label>
                <label style={s.fieldWrap}>
                  <span style={s.label}>Speaker ID</span>
                  <input style={s.input} value={addForm.speakerId} onChange={(e) => setAddForm({ ...addForm, speakerId: e.target.value })} placeholder="e.g., BHOJ001" required />
                </label>
                <label style={s.fieldWrap}>
                  <span style={s.label}>Parent Email</span>
                  <input style={s.input} type="email" value={addForm.parentEmail} onChange={(e) => setAddForm({ ...addForm, parentEmail: e.target.value })} placeholder="parent@email.com" />
                </label>
                <label style={s.fieldWrap}>
                  <span style={s.label}>Parent Phone</span>
                  <input style={s.input} value={addForm.parentPhone} onChange={(e) => setAddForm({ ...addForm, parentPhone: e.target.value })} placeholder="+91..." />
                </label>
                <label style={s.fieldWrap}>
                  <span style={s.label}>Gender</span>
                  <select style={s.input} value={addForm.gender} onChange={(e) => setAddForm({ ...addForm, gender: e.target.value })}>
                    <option value="child">Child</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                  </select>
                </label>
                <label style={s.fieldWrap}>
                  <span style={s.label}>L1 Language</span>
                  <select style={s.input} value={addForm.l1Language} onChange={(e) => setAddForm({ ...addForm, l1Language: e.target.value })}>
                    <option value="auto">Auto-detect</option>
                    <option value="bho">Bhojpuri</option>
                    <option value="hin">Hindi</option>
                    <option value="ben">Bangla</option>
                    <option value="ori">Odia</option>
                  </select>
                </label>
              </div>
              <button type="submit" style={s.submitBtn} disabled={adding || !addForm.name || !addForm.speakerId}>
                {adding ? "Adding..." : "Add Student"}
              </button>
            </form>
          )}

          {students.length === 0 ? (
            <p style={s.empty}>No students in this classroom yet.</p>
          ) : (
            <div style={s.tableWrap}>
              <table style={s.table}>
                <thead>
                  <tr>
                    <th style={s.th}>Name</th>
                    <th style={s.th}>Speaker ID</th>
                    <th style={s.th}>Gender</th>
                    <th style={s.th}>L1 Language</th>
                    <th style={s.th}>Consent</th>
                    <th style={s.th}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {students.map((st, i) => (
                    <tr key={st._id || st.id || i} style={i % 2 === 0 ? s.trEven : s.trOdd}>
                      <td style={s.td}>
                        <span
                          style={s.nameLink}
                          onClick={() => onSelectStudent && onSelectStudent(st)}
                        >
                          {st.name || "—"}
                        </span>
                      </td>
                      <td style={s.td}>{st.speakerId || "—"}</td>
                      <td style={s.td}>{st.gender || "—"}</td>
                      <td style={s.td}>{st.l1Language || "—"}</td>
                      <td style={s.td}>{consentBadge(st.speakerId)}</td>
                      <td style={s.td}>
                        <div style={{ display: "flex", gap: 8 }}>
                          <button
                            style={s.smallBtn}
                            onClick={() => onAnalyzeStudent && onAnalyzeStudent(st)}
                          >
                            Analyze
                          </button>
                          <button
                            style={s.smallDanger}
                            onClick={() => handleRemoveStudent(st._id || st.id)}
                          >
                            Remove
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ANALYTICS TAB */}
      {tab === "analytics" && (
        <div>
          {sortedAnalytics.length === 0 ? (
            <p style={s.empty}>No analytics data yet. Run analyses on students to see results here.</p>
          ) : (
            <div style={s.tableWrap}>
              <table style={s.table}>
                <thead>
                  <tr>
                    <th style={s.th}>Name</th>
                    <th style={s.th}>CIF Score</th>
                    <th style={s.th}>Accuracy</th>
                    <th style={s.th}>Analyses</th>
                    <th style={s.th}>Last Analysis</th>
                    <th style={s.th}>Trend</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedAnalytics.map((a, i) => (
                    <tr key={a.speakerId || i} style={i % 2 === 0 ? s.trEven : s.trOdd}>
                      <td style={s.td}>{a.studentName || "—"}</td>
                      <td style={s.td}>
                        <div style={s.cifCell}>
                          <div style={s.progressBarBg}>
                            <div
                              style={{
                                ...s.progressBarFill,
                                width: `${Math.min((a.latestCifScore || 0) * 100, 100)}%`,
                                background: cifColor(a.latestCifScore || 0),
                              }}
                            />
                          </div>
                          <span style={{ fontWeight: 700, fontSize: 13, color: cifColor(a.latestCifScore || 0) }}>
                            {a.latestCifScore != null ? a.latestCifScore.toFixed(2) : "—"}
                          </span>
                        </div>
                      </td>
                      <td style={s.td}>
                        {a.latestAccuracy != null ? `${(a.latestAccuracy * 100).toFixed(0)}%` : "—"}
                      </td>
                      <td style={s.td}>{a.analysisCount ?? 0}</td>
                      <td style={s.td}>
                        {a.lastAnalysisDate ? new Date(a.lastAnalysisDate).toLocaleDateString() : "—"}
                      </td>
                      <td style={s.td}>{trendArrow(a.trend)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const s = {
  wrapper: { maxWidth: 1100, margin: "0 auto", padding: "32px 16px" },
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
  header: { marginBottom: 24 },
  title: { fontSize: 28, fontWeight: 800, color: "#111", margin: 0 },
  subtitle: { fontSize: 15, color: "#6b7280", marginTop: 6 },
  errorMsg: { background: "#fef2f2", color: "#dc2626", padding: "12px 16px", borderRadius: 10, marginBottom: 16, fontSize: 14 },
  tabRow: { display: "flex", gap: 4, marginBottom: 24, background: "#f3f4f6", borderRadius: 10, padding: 4, width: "fit-content" },
  tab: {
    padding: "8px 20px",
    borderRadius: 8,
    border: "none",
    background: "transparent",
    color: "#6b7280",
    fontWeight: 600,
    fontSize: 14,
    cursor: "pointer",
  },
  tabActive: {
    padding: "8px 20px",
    borderRadius: 8,
    border: "none",
    background: "#fff",
    color: "#111",
    fontWeight: 700,
    fontSize: 14,
    cursor: "pointer",
    boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
  },
  addBtn: {
    padding: "10px 20px",
    borderRadius: 8,
    border: "none",
    background: "#00A699",
    color: "#fff",
    fontWeight: 700,
    fontSize: 13,
    cursor: "pointer",
    marginBottom: 16,
  },
  formCard: {
    background: "#fff",
    borderRadius: 14,
    padding: 24,
    marginBottom: 20,
    boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
    border: "1px solid #e5e7eb",
  },
  formGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12, marginBottom: 16 },
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
  empty: { color: "#9ca3af", fontSize: 14, textAlign: "center", padding: 48 },
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
  nameLink: { color: "#00A699", fontWeight: 600, cursor: "pointer", textDecoration: "underline" },
  badge: {
    padding: "3px 10px",
    borderRadius: 6,
    fontWeight: 600,
    fontSize: 12,
  },
  smallBtn: {
    padding: "6px 12px",
    borderRadius: 6,
    border: "1px solid #00A699",
    background: "transparent",
    color: "#00A699",
    fontWeight: 600,
    fontSize: 12,
    cursor: "pointer",
  },
  smallDanger: {
    padding: "6px 12px",
    borderRadius: 6,
    border: "1px solid #ef4444",
    background: "transparent",
    color: "#ef4444",
    fontWeight: 600,
    fontSize: 12,
    cursor: "pointer",
  },
  cifCell: { display: "flex", alignItems: "center", gap: 8 },
  progressBarBg: {
    width: 80,
    height: 8,
    borderRadius: 4,
    background: "#f3f4f6",
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    borderRadius: 4,
    transition: "width 0.3s",
  },
};
