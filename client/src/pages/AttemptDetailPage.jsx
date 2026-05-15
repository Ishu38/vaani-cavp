import React, { useEffect, useState } from "react";
import { Link, Navigate, useOutletContext, useParams } from "react-router-dom";
import { getAttempt } from "../utils/api.js";
import SixLayerReport from "../components/SixLayerReport.jsx";

function CriterionRow({ label, score }) {
  if (!score) return null;
  return (
    <div className="tp-detail-criterion">
      <div className="tp-detail-criterion-label">{label}</div>
      <div className="tp-detail-criterion-band">{score.band ?? "—"}</div>
      {Array.isArray(score.justification) && score.justification.length > 0 && (
        <ul className="tp-detail-criterion-just">
          {score.justification.map((j, i) => (
            <li key={i}>{j}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function AttemptDetailPage() {
  const { user } = useOutletContext();
  const { id } = useParams();
  const [attempt, setAttempt] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    getAttempt(id)
      .then((a) => alive && setAttempt(a))
      .catch((err) => alive && setError(err.message || "Could not load attempt"));
    return () => {
      alive = false;
    };
  }, [id]);

  if (!user) return <Navigate to="/" replace />;
  if (error) {
    return (
      <main className="tp-section">
        <div className="tp-card">
          <div style={{ color: "#c1432d" }}>{error}</div>
          <Link to="/history" className="tp-link">← Back to history</Link>
        </div>
      </main>
    );
  }
  if (!attempt) {
    return (
      <main className="tp-section">
        <div className="tp-card">Loading attempt…</div>
      </main>
    );
  }

  const bands = attempt.bands || {};
  const acoustic = attempt.acoustic || {};

  return (
    <main className="tp-section">
      <div className="tp-card">
        <Link to="/history" className="tp-link">← Back to history</Link>
        <div className="tp-card-header" style={{ marginTop: 8 }}>
          <div>
            <h1 className="tp-card-title">
              {attempt.testType === "toefl" ? "TOEFL Speaking attempt" : "IELTS Speaking attempt"}
            </h1>
            <p className="tp-card-sub">
              {new Date(attempt.createdAt).toLocaleString()}
              {attempt.promptText ? ` · ${attempt.promptText}` : ""}
            </p>
          </div>
          <div className="tp-detail-band-pill">
            <div className="tp-detail-band-pill-label">Overall</div>
            <div className="tp-detail-band-pill-value">{attempt.bandOverall || "—"}</div>
          </div>
        </div>

        <section className="tp-detail-section">
          <h2 className="tp-detail-h2">
            {bands.test_type === "acoustic_voice_profile" ? "Pronunciation band" : "Per-criterion scores"}
          </h2>
          {bands.test_type === "acoustic_voice_profile" ? (
            <CriterionRow label="Pronunciation" score={bands.pronunciation} />
          ) : (
            <>
              <CriterionRow label="Fluency & Coherence" score={bands.fluency_coherence} />
              <CriterionRow label="Lexical Resource" score={bands.lexical_resource} />
              <CriterionRow label="Grammatical Range" score={bands.grammatical_range} />
              <CriterionRow label="Pronunciation" score={bands.pronunciation} />
            </>
          )}
          {Array.isArray(bands.notes) && bands.notes.length > 0 && (
            <div className="tp-detail-notes">
              <div className="tp-detail-notes-title">Examiner notes</div>
              <ul>
                {bands.notes.map((n, i) => (
                  <li key={i}>{n}</li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <SixLayerReport attempt={attempt} />

        {Array.isArray(acoustic.warnings) && acoustic.warnings.length > 0 && (
          <section className="tp-detail-section">
            <h2 className="tp-detail-h2">Recording notes</h2>
            <ul className="tp-detail-warnings">
              {acoustic.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </section>
        )}

        {attempt.transcript && (
          <section className="tp-detail-section">
            <h2 className="tp-detail-h2">Transcript</h2>
            <p className="tp-detail-transcript">{attempt.transcript}</p>
          </section>
        )}
      </div>
    </main>
  );
}
