import React, { useState, useEffect } from "react";
import { getClassrooms, createClassroom } from "../../utils/api.js";

export default function ClassListPage({ onSelectClass, onNavigate }) {
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", grade: "", section: "", academicYear: "" });
  const [creating, setCreating] = useState(false);

  function loadClasses() {
    setLoading(true);
    getClassrooms()
      .then((data) => setClasses(Array.isArray(data) ? data : data.classes || []))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => { loadClasses(); }, []);

  async function handleCreate(e) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    try {
      await createClassroom(form);
      setForm({ name: "", grade: "", section: "", academicYear: "" });
      setShowForm(false);
      loadClasses();
    } catch (err) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  }

  if (loading) return <div style={s.center}>Loading classrooms...</div>;

  return (
    <div style={s.wrapper}>
      <div style={s.headerRow}>
        <div>
          <h2 style={s.title}>My Classrooms</h2>
          <p style={s.subtitle}>Manage your classrooms and student rosters</p>
        </div>
        <button style={s.createBtn} onClick={() => setShowForm(!showForm)}>
          {showForm ? "Cancel" : "+ Create Classroom"}
        </button>
      </div>

      {error && <div style={s.errorMsg}>{error}</div>}

      {/* Inline create form */}
      {showForm && (
        <form onSubmit={handleCreate} style={s.formCard}>
          <h3 style={s.formTitle}>New Classroom</h3>
          <div style={s.formGrid}>
            <label style={s.fieldWrap}>
              <span style={s.label}>Name</span>
              <input
                style={s.input}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g., Section A English"
                required
              />
            </label>
            <label style={s.fieldWrap}>
              <span style={s.label}>Grade</span>
              <input
                style={s.input}
                value={form.grade}
                onChange={(e) => setForm({ ...form, grade: e.target.value })}
                placeholder="e.g., 5"
              />
            </label>
            <label style={s.fieldWrap}>
              <span style={s.label}>Section</span>
              <input
                style={s.input}
                value={form.section}
                onChange={(e) => setForm({ ...form, section: e.target.value })}
                placeholder="e.g., A"
              />
            </label>
            <label style={s.fieldWrap}>
              <span style={s.label}>Academic Year</span>
              <input
                style={s.input}
                value={form.academicYear}
                onChange={(e) => setForm({ ...form, academicYear: e.target.value })}
                placeholder="e.g., 2025-26"
              />
            </label>
          </div>
          <button type="submit" style={s.submitBtn} disabled={creating || !form.name}>
            {creating ? "Creating..." : "Create Classroom"}
          </button>
        </form>
      )}

      {/* Class grid */}
      {classes.length === 0 ? (
        <p style={s.empty}>No classrooms yet. Create one to get started.</p>
      ) : (
        <div style={s.grid}>
          {classes.map((c) => (
            <div key={c._id || c.id} style={s.card}>
              <h3 style={s.cardName}>{c.name}</h3>
              <p style={s.cardMeta}>
                {c.grade && `Grade ${c.grade}`}
                {c.section && ` - Section ${c.section}`}
              </p>
              <p style={s.cardStudents}>
                {c.studentCount ?? c.students?.length ?? 0} students
              </p>
              {c.academicYear && (
                <p style={s.cardYear}>{c.academicYear}</p>
              )}
              <button
                style={s.viewBtn}
                onClick={() => onSelectClass(c._id || c.id)}
              >
                View
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const s = {
  wrapper: { maxWidth: 1100, margin: "0 auto", padding: "32px 16px" },
  center: { textAlign: "center", padding: 64, color: "#666", fontSize: 16 },
  headerRow: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24, flexWrap: "wrap", gap: 16 },
  title: { fontSize: 28, fontWeight: 800, color: "#111", margin: 0 },
  subtitle: { fontSize: 15, color: "#6b7280", marginTop: 6 },
  createBtn: {
    padding: "12px 24px",
    borderRadius: 10,
    border: "none",
    background: "#00A699",
    color: "#fff",
    fontWeight: 700,
    fontSize: 14,
    cursor: "pointer",
  },
  errorMsg: { background: "#fef2f2", color: "#dc2626", padding: "12px 16px", borderRadius: 10, marginBottom: 16, fontSize: 14 },
  formCard: {
    background: "#fff",
    borderRadius: 14,
    padding: 24,
    marginBottom: 24,
    boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
    border: "1px solid #e5e7eb",
  },
  formTitle: { fontSize: 16, fontWeight: 700, color: "#111", margin: "0 0 16px 0" },
  formGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 16 },
  fieldWrap: { display: "flex", flexDirection: "column", gap: 4 },
  label: { fontSize: 12, fontWeight: 600, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.5 },
  input: {
    padding: "10px 12px",
    borderRadius: 8,
    border: "1px solid #d1d5db",
    fontSize: 14,
    outline: "none",
    transition: "border-color 0.2s",
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
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 16 },
  card: {
    background: "#fff",
    borderRadius: 14,
    padding: 24,
    boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
    border: "1px solid #e5e7eb",
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  cardName: { fontSize: 18, fontWeight: 700, color: "#111", margin: 0 },
  cardMeta: { fontSize: 14, color: "#6b7280", margin: 0 },
  cardStudents: { fontSize: 14, fontWeight: 600, color: "#374151", margin: 0 },
  cardYear: { fontSize: 13, color: "#9ca3af", margin: 0 },
  viewBtn: {
    marginTop: 8,
    padding: "8px 16px",
    borderRadius: 8,
    border: "1px solid #00A699",
    background: "transparent",
    color: "#00A699",
    fontWeight: 700,
    fontSize: 13,
    cursor: "pointer",
    alignSelf: "flex-start",
  },
};
