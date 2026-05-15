import React, { useState } from "react";
import { recordIeltsConsent } from "../utils/api.js";

const CONSENT_STORAGE_KEY = "vp_dpdp_consent_v1";

export function hasGivenConsent() {
  try {
    const raw = localStorage.getItem(CONSENT_STORAGE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    return !!parsed?.acceptedAt;
  } catch {
    return false;
  }
}

export function getConsentRecord() {
  try {
    const raw = localStorage.getItem(CONSENT_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function clearConsent() {
  try { localStorage.removeItem(CONSENT_STORAGE_KEY); } catch {}
}

function persistConsent(record) {
  try {
    localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(record));
  } catch {}
}

export default function ConsentGate({ open, onAccept, onCancel }) {
  const [step, setStep] = useState("age"); // age | adult | minor | guardian
  const [ageBand, setAgeBand] = useState(null);
  const [guardianName, setGuardianName] = useState("");
  const [guardianEmail, setGuardianEmail] = useState("");
  const [agreeProcess, setAgreeProcess] = useState(false);
  const [agreeMinor, setAgreeMinor] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);

  if (!open) return null;

  const reset = () => {
    setStep("age");
    setAgeBand(null);
    setGuardianName("");
    setGuardianEmail("");
    setAgreeProcess(false);
    setAgreeMinor(false);
  };

  const handleCancel = () => {
    reset();
    onCancel?.();
  };

  // Persist consent server-side (Mongo) before writing localStorage. The
  // gateway's analyze endpoints check Mongo, not localStorage, so without
  // this round-trip every submit comes back 403 "Consent required" even
  // though the SPA thinks consent is given.
  const persistBoth = async (record) => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      await recordIeltsConsent(["voice_processing", "transcript_storage"]);
      persistConsent(record);
      onAccept?.(record);
      reset();
    } catch (err) {
      if (err?.status === 401) {
        setSubmitError("Please sign in first — consent is recorded against your account.");
      } else {
        setSubmitError(err?.message || "Could not record consent on the server. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleAdultAccept = () => {
    persistBoth({
      version: 1,
      acceptedAt: new Date().toISOString(),
      ageBand: "18+",
      processing: true,
    });
  };

  const handleMinorAccept = () => {
    if (!guardianName.trim() || !guardianEmail.trim() || !agreeMinor) return;
    persistBoth({
      version: 1,
      acceptedAt: new Date().toISOString(),
      ageBand: "14-17",
      guardianName: guardianName.trim(),
      guardianEmail: guardianEmail.trim(),
      processing: true,
    });
  };

  return (
    <div className="cg-backdrop" role="dialog" aria-modal="true" aria-label="Vaani consent">
      <div className="cg-card">
        <div className="cg-head">
          <div className="cg-mark">V</div>
          <div>
            <div className="cg-title">Before you record</div>
            <div className="cg-sub">DPDP Act 2023 — consent for voice processing</div>
          </div>
        </div>

        {step === "age" && (
          <>
            <p className="cg-body">
              Vaani processes your voice to score your speaking. Indian law (Digital Personal Data Protection Act,
              2023) requires us to confirm your age and obtain consent before we do that.
            </p>
            <p className="cg-body">How old are you?</p>
            <div className="cg-options">
              <button
                type="button"
                className={`cg-option ${ageBand === "18+" ? "cg-option--selected" : ""}`}
                onClick={() => setAgeBand("18+")}
              >
                <span className="cg-option-mark">18 +</span>
                <span className="cg-option-label">I am an adult.</span>
              </button>
              <button
                type="button"
                className={`cg-option ${ageBand === "14-17" ? "cg-option--selected" : ""}`}
                onClick={() => setAgeBand("14-17")}
              >
                <span className="cg-option-mark">14–17</span>
                <span className="cg-option-label">I am a minor (parent/guardian consent required).</span>
              </button>
              <button
                type="button"
                className={`cg-option ${ageBand === "<14" ? "cg-option--selected" : ""}`}
                onClick={() => setAgeBand("<14")}
              >
                <span className="cg-option-mark">&lt; 14</span>
                <span className="cg-option-label">Younger than 14.</span>
              </button>
            </div>

            {ageBand === "<14" && (
              <div className="cg-block">
                Vaani is built for IELTS &amp; TOEFL candidates aged 14 and over. Please come back when you're a bit
                older — or speak to a parent about whether the school-pilot version (separate product) is right for you.
              </div>
            )}

            <div className="cg-actions">
              <button type="button" className="tp-btn tp-btn--ghost" onClick={handleCancel}>Not now</button>
              <button
                type="button"
                className="tp-btn tp-btn--primary"
                disabled={!ageBand || ageBand === "<14"}
                onClick={() => setStep(ageBand === "18+" ? "adult" : "minor")}
              >
                Continue
              </button>
            </div>
          </>
        )}

        {step === "adult" && (
          <>
            <p className="cg-body">
              You're confirming you're 18 or older. Here's what you're consenting to:
            </p>
            <ul className="cg-list">
              <li>Vaani records your voice and uploads it to our analysis service.</li>
              <li>The recording is processed in-memory; we delete it as soon as the band result is returned.</li>
              <li>If you generate a PDF report, the metadata you enter is rendered onto the PDF and not retained.</li>
              <li>Access logs (IP, user-agent) are kept 30 days for abuse prevention, then rotated.</li>
              <li>You can withdraw consent and request data erasure anytime by emailing <a className="tp-link" href="mailto:neilshankarray@vaaani.in">neilshankarray@vaaani.in</a>.</li>
            </ul>
            <label className="cg-check">
              <input
                type="checkbox"
                checked={agreeProcess}
                onChange={(e) => setAgreeProcess(e.target.checked)}
              />
              <span>I agree to Vaani processing my voice recording for IELTS / TOEFL diagnostic scoring under the Digital Personal Data Protection Act, 2023.</span>
            </label>
            <div className="cg-actions">
              <button type="button" className="tp-btn tp-btn--ghost" onClick={() => setStep("age")}>Back</button>
              <button
                type="button"
                className="tp-btn tp-btn--primary"
                disabled={!agreeProcess || submitting}
                onClick={handleAdultAccept}
              >
                {submitting ? "Saving…" : "Agree & record"}
              </button>
              {submitError && (
                <div className="tp-alert tp-alert--error" style={{ marginTop: 12, gridColumn: "1 / -1" }}>
                  {submitError}
                </div>
              )}
            </div>
          </>
        )}

        {step === "minor" && (
          <>
            <p className="cg-body">
              Indian law requires verifiable parent or legal guardian consent before we process voice data from
              anyone under 18. Please ask your parent or guardian to fill this in with you.
            </p>
            <div className="cg-form-grid">
              <label className="cg-field">
                <span>Parent / guardian full name</span>
                <input
                  type="text"
                  className="tp-input"
                  value={guardianName}
                  onChange={(e) => setGuardianName(e.target.value)}
                  placeholder="As on government ID"
                />
              </label>
              <label className="cg-field">
                <span>Parent / guardian email</span>
                <input
                  type="email"
                  className="tp-input"
                  value={guardianEmail}
                  onChange={(e) => setGuardianEmail(e.target.value)}
                  placeholder="We email a confirmation copy"
                />
              </label>
            </div>
            <p className="cg-fine">
              By entering this information, the parent/guardian named above (i) confirms they are the legal
              guardian of the candidate; (ii) consents to Vaani processing the candidate's voice recording for
              IELTS / TOEFL diagnostic scoring; (iii) understands recordings are processed in-memory and deleted
              after scoring; (iv) may withdraw consent at any time by emailing
              {" "}<a className="tp-link" href="mailto:neilshankarray@vaaani.in">neilshankarray@vaaani.in</a>.
            </p>
            <label className="cg-check">
              <input
                type="checkbox"
                checked={agreeMinor}
                onChange={(e) => setAgreeMinor(e.target.checked)}
              />
              <span>I am the parent/legal guardian and I agree on behalf of the candidate.</span>
            </label>
            <div className="cg-actions">
              <button type="button" className="tp-btn tp-btn--ghost" onClick={() => setStep("age")}>Back</button>
              <button
                type="button"
                className="tp-btn tp-btn--primary"
                disabled={!guardianName.trim() || !guardianEmail.trim() || !agreeMinor || submitting}
                onClick={handleMinorAccept}
              >
                {submitting ? "Saving…" : "Confirm guardian consent"}
              </button>
              {submitError && (
                <div className="tp-alert tp-alert--error" style={{ marginTop: 12, gridColumn: "1 / -1" }}>
                  {submitError}
                </div>
              )}
            </div>
          </>
        )}

        <div className="cg-footnote">
          This consent flow is provided as the in-product DPDP gate. The accompanying long-form consent text and
          legal warranties are governed by Vaani's Privacy Policy. <a className="tp-link" href="#" onClick={(e) => { e.preventDefault(); window.dispatchEvent(new CustomEvent("vaani:nav", { detail: { page: "privacy" } })); handleCancel(); }}>Read the full Privacy Policy</a>.
        </div>
      </div>
    </div>
  );
}
