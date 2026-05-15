import React, { useEffect, useState } from "react";
import { Link, Navigate, useOutletContext } from "react-router-dom";
import { listAttempts, deleteAttempt } from "../utils/api.js";

function formatWhen(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function HistoryPage() {
  // Outlet context is null for a brief tick during route transitions; guard so
  // we don't read .user off undefined and crash before the redirect fires.
  const { user } = useOutletContext() || {};
  const [attempts, setAttempts] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!user) return undefined;
    let alive = true;
    listAttempts()
      .then((rows) => {
        if (alive) setAttempts(Array.isArray(rows) ? rows : []);
      })
      .catch((err) => {
        if (alive) {
          setAttempts([]);
          setError(err?.message || "Could not load your history");
        }
      });
    return () => {
      alive = false;
    };
  }, [user]);

  if (!user) return <Navigate to="/" replace />;

  const onDelete = async (id) => {
    if (!confirm("Delete this attempt? This cannot be undone.")) return;
    try {
      await deleteAttempt(id);
      setAttempts((rows) => rows.filter((a) => a.id !== id));
    } catch (err) {
      setError(err.message || "Delete failed");
    }
  };

  return (
    <main className="tp-section">
      <div className="tp-card">
        <div className="tp-card-header">
          <div>
            <h1 className="tp-card-title">Your practice history</h1>
            <p className="tp-card-sub">
              Every signed-in IELTS or TOEFL Speaking attempt is saved automatically. Tap an entry to
              re-open the full acoustic breakdown and coach feedback.
            </p>
          </div>
        </div>

        {attempts === null && <div>Loading…</div>}
        {attempts && attempts.length === 0 && (
          <div className="tp-card-sub" style={{ marginTop: 16 }}>
            You haven't recorded a mock yet.{" "}
            <Link to="/practice/ielts" className="tp-link">
              Record your first IELTS Speaking mock →
            </Link>
          </div>
        )}
        {attempts && attempts.length > 0 && (
          <ul className="tp-history-list">
            {attempts.map((a) => (
              <li key={a.id} className="tp-history-row">
                <Link to={`/history/${a.id}`} className="tp-history-link">
                  <div className="tp-history-band">{a.bandOverall || "—"}</div>
                  <div className="tp-history-meta">
                    <div className="tp-history-title">
                      {a.testType === "toefl" ? "TOEFL Speaking" : "IELTS Speaking"}
                      {a.promptText ? <span className="tp-history-prompt"> · {a.promptText.slice(0, 80)}</span> : null}
                    </div>
                    <div className="tp-history-when">{formatWhen(a.createdAt)}</div>
                  </div>
                </Link>
                <button
                  type="button"
                  className="tp-btn tp-btn--ghost tp-btn--sm"
                  onClick={() => onDelete(a.id)}
                  aria-label="Delete attempt"
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
        {error && <div style={{ marginTop: 14, color: "#c1432d" }}>{error}</div>}
      </div>
    </main>
  );
}
