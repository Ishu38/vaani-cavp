import React from "react";
import { useNavigate } from "react-router-dom";

export default function AboutPage() {
  const navigate = useNavigate();
  return (
    <section className="tp-info">
      <button className="tp-btn tp-btn--ghost tp-btn--sm" onClick={() => navigate("/")}>← Back</button>
      <h1 className="tp-info-h1">About Vaani</h1>
      <p className="tp-info-lede">
        Vaani is a speaking diagnostic for IELTS and TOEFL candidates, purpose-built for Indian learners of English as
        a second language. It returns a detailed band estimate in under a minute, with coach advice tuned to the
        L1 interference patterns of Bhojpuri, Hindi, Bangla, Odia, Tamil, and Telugu speakers.
      </p>

      <div className="tp-info-grid">
        <div className="tp-info-card">
          <div className="tp-info-card-title">What Vaani does</div>
          <ul>
            <li>Records your response in the browser with live captions.</li>
            <li>Runs forced phoneme alignment, prosodic profiling, and acoustic L1 catalogue matching.</li>
            <li>Maps the signal to a 0–9 <b>Pronunciation</b> band only — Fluency, Lexical, and Grammatical Range require a human examiner and are explicitly not produced.</li>
            <li>Generates a personalised PDF report with coach advice on the L1 transfer patterns the engine actually heard.</li>
          </ul>
        </div>
        <div className="tp-info-card">
          <div className="tp-info-card-title">What makes Vaani different</div>
          <ul>
            <li>Calibrated against <b>published acoustic-phonetic literature</b> for 6 Indian L1 profiles (Bengali, Hindi, Tamil, Telugu, Marathi, Gujarati), not generic Western L2 models.</li>
            <li>Deterministic acoustic scoring — same audio yields the same band, every time; no LLM in the band-mapping loop.</li>
            <li>Honest reliability notes: every report flags alignment quality, sample duration, and degraded layers.</li>
            <li>No long-term storage of your audio; the file is deleted as soon as the report is produced.</li>
          </ul>
        </div>
      </div>
    </section>
  );
}
