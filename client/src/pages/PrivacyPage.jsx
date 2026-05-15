import React from "react";
import { useNavigate } from "react-router-dom";

// Pin the displayed "last updated" to the actual policy revision date.
// Using new Date() makes the page show today's date on every render, which
// silently misrepresents the policy as freshly revised. Bump this constant
// (and TermsPage's) whenever the policy text genuinely changes.
const PRIVACY_LAST_UPDATED = "2026-05-08";

export default function PrivacyPage() {
  const navigate = useNavigate();
  const updated = new Date(PRIVACY_LAST_UPDATED).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  return (
    <section className="tp-info">
      <button className="tp-btn tp-btn--ghost tp-btn--sm" onClick={() => navigate("/")}>← Back</button>
      <h1 className="tp-info-h1">Privacy Policy</h1>
      <p className="tp-info-muted">Last updated: {updated}</p>

      <div className="tp-info-card tp-info-card--wide">
        <div className="tp-info-card-title">What we collect</div>
        <p>
          Vaani processes three kinds of data: (1) the audio you record for an IELTS or TOEFL practice session,
          (2) metadata you enter into the report form — name, age, IELTS centre name, registration number, and test
          date, and (3) technical information required to run the service, including your browser's user-agent and
          IP address captured in short-term access logs.
        </p>
      </div>

      <div className="tp-info-card tp-info-card--wide">
        <div className="tp-info-card-title">How we use it</div>
        <ul>
          <li>Your audio is analysed in-memory and immediately deleted after the band result is returned. It is not stored on disk beyond the duration of the request.</li>
          <li>The PDF report is assembled in-memory and streamed directly to your browser; a copy is not retained by the service.</li>
          <li>Report-form metadata is echoed onto the PDF you download and is not retained server-side.</li>
          <li>Access logs are kept for 30 days for abuse-prevention and debugging, then rotated.</li>
        </ul>
      </div>

      <div className="tp-info-card tp-info-card--wide">
        <div className="tp-info-card-title">What we do not do</div>
        <ul>
          <li>We do not sell, share, or transfer your audio or text to third parties.</li>
          <li>We do not train production models on your recordings without a separate, explicit research consent.</li>
          <li>We do not use cookies for advertising.</li>
        </ul>
      </div>

      <div className="tp-info-card tp-info-card--wide">
        <div className="tp-info-card-title">Your rights</div>
        <p>
          Under India's Digital Personal Data Protection Act, 2023, you have the right to access, correct, and erase
          any personal data associated with your use of Vaani. Write to <a href="mailto:neilshankarray@vaaani.in" className="tp-link">neilshankarray@vaaani.in</a>{" "}
          and we will respond within 30 days.
        </p>
      </div>

      <div className="tp-info-card tp-info-card--wide">
        <div className="tp-info-card-title">Disclaimer</div>
        <p className="tp-info-muted">
          Vaani is an automated diagnostic estimate and is not an official IELTS or TOEFL score. It is provided as a
          preparation aid. Candidates must still sit an examined IELTS or TOEFL session for any certified score.
        </p>
      </div>
    </section>
  );
}
