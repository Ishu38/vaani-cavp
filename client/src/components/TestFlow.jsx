import React, { useEffect, useMemo, useState } from "react";
import CaptionedRecorder from "./CaptionedRecorder.jsx";
import { IELTSBandCard, TOEFLTaskCard } from "./BandScoreCard.jsx";
import QuotaPill from "./QuotaPill.jsx";
import UpgradeModal from "./UpgradeModal.jsx";
import { clearConsent } from "./ConsentGate.jsx";
import {
  getIELTSPrompts,
  getTOEFLPrompts,
  analyzeIELTS,
  analyzeTOEFL,
  downloadIELTSReport,
  saveLastVaaniResult,
  getQuota,
} from "../utils/api.js";

// Production L1 scope: Bengali + Hindi only — the substrates Vaani's CIF
// attractors are empirically calibrated against. Other Indian L1s remain
// in the engine code for future calibration work but are deliberately not
// surfaced in the UI; advertising an uncalibrated L1 would mislabel the
// speaker against a literature-default attractor.
const L1_OPTIONS = [
  ["hin", "Hindi"],
  ["ben", "Bangla"],
];

/**
 * Map a free-text nativeLanguage from the user's profile to one of the
 * supported L1 codes. Returns null if the declared language is outside
 * the calibrated scope; the caller falls back to forcing the user to
 * pick from the dropdown rather than silently auto-scoring. */
function nativeLanguageToL1Code(nativeLanguage) {
  if (!nativeLanguage || typeof nativeLanguage !== "string") return null;
  const norm = nativeLanguage.trim().toLowerCase();
  if (/^(bangla|bengali|bn)\b/.test(norm)) return "ben";
  if (/^(hindi|hi)\b/.test(norm)) return "hin";
  return null;
}

/**
 * Honest progress state during analyze. The full neuro-symbolic pipeline
 * (Whisper + spaCy-trf + 6 layers including MLAF symbolic + CIF + IELTS
 * 18-layer acoustic pipeline takes 55-90s — telling users that upfront
 * keeps them from refreshing or assuming the app is broken. The staged
 * messages roughly map to what's actually happening server-side.
 */
function AnalyzingProgress({ jobState }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, []);

  // Prefer the server's reported stage (from BullMQ progress hook) if
  // available; otherwise fall back to a time-based guess that maps to
  // the actual engine layers (Whisper → forced alignment → Praat
  // formants/pitch/voice-quality → spectral features → L1 detection →
  // CIF + MLAF abductive). Vaani runs the full 6-layer analysis on
  // every submission to produce a voice-unique profile; this takes
  // 1.5-4 minutes and we tell the user that upfront.
  let stage = "Transcribing your speech (Whisper)…";
  if (jobState === "waiting") stage = "Queued — waiting for engine availability…";
  else if (jobState?.stage === "forwarding_to_engine") stage = "Forwarding your audio to the engine…";
  else if (jobState?.stage === "persisting_attempt") stage = "Saving your result…";
  else if (jobState?.stage === "done") stage = "Done — opening your report…";
  else {
    if (elapsed >= 15) stage = "Aligning phonemes…";
    if (elapsed >= 30) stage = "Measuring formants, pitch, and voice quality (Praat)…";
    if (elapsed >= 90) stage = "Detecting L1 interference patterns…";
    if (elapsed >= 150) stage = "Computing your L1 transfer profile (CIF)…";
    if (elapsed >= 210) stage = "Finalising your Pronunciation band report…";
    if (elapsed >= 270) stage = "Almost there — last layer is wrapping up.";
  }

  return (
    <div className="tp-analyzing" role="status" aria-live="polite">
      <div className="tp-spinner" />
      <div>
        <div className="tp-analyzing-title">{stage}</div>
        <div className="tp-analyzing-sub">
          {elapsed}s elapsed · Vaani runs 6 acoustic + symbolic layers per submission to give you a voice-unique profile · this typically takes 1.5–4 minutes · don't refresh the page.
        </div>
      </div>
    </div>
  );
}

function CueCard({ prompt, testType }) {
  if (!prompt) return null;
  if (testType === "ielts") {
    return (
      <div className="tp-cuecard">
        <div className="tp-cuecard-kicker">IELTS Speaking — Part 2</div>
        <div className="tp-cuecard-title">{prompt.prompt_text}</div>
        {prompt.bullet_points && (
          <div className="tp-cuecard-section">
            <div className="tp-cuecard-section-label">You should say</div>
            <ul className="tp-cuecard-bullets">
              {prompt.bullet_points.map((b, i) => <li key={i}>{b}</li>)}
            </ul>
          </div>
        )}
        {prompt.explain && (
          <div className="tp-cuecard-section">
            <div className="tp-cuecard-section-label">And</div>
            <div className="tp-cuecard-explain">{prompt.explain}</div>
          </div>
        )}
      </div>
    );
  }
  return (
    <div className="tp-cuecard">
      <div className="tp-cuecard-kicker">TOEFL iBT Speaking — Task {prompt.task_number || 1}</div>
      {prompt.stimulus && (
        <div className="tp-cuecard-section">
          <div className="tp-cuecard-section-label">Reading stimulus</div>
          <div className="tp-cuecard-explain">{prompt.stimulus}</div>
        </div>
      )}
      {prompt.concept && (
        <div className="tp-cuecard-section">
          <div className="tp-cuecard-section-label">Concept</div>
          <div className="tp-cuecard-explain">{prompt.concept}</div>
        </div>
      )}
      {prompt.example && (
        <div className="tp-cuecard-section">
          <div className="tp-cuecard-section-label">Example</div>
          <div className="tp-cuecard-explain">{prompt.example}</div>
        </div>
      )}
      <div className="tp-cuecard-title">{prompt.prompt_text}</div>
    </div>
  );
}

function OptionsBar({ l1, onL1, gender, onGender }) {
  return (
    <div className="tp-options">
      <label className="tp-option">
        <span className="tp-option-label">Your first language</span>
        <select value={l1} onChange={(e) => onL1(e.target.value)} className="tp-select">
          {L1_OPTIONS.map(([v, lbl]) => <option key={v} value={v}>{lbl}</option>)}
        </select>
        <span className="tp-option-hint">
          Pick your L1 — it sets the attractor weights for pronunciation scoring. We pre-fill from your account profile when set; you can override here.
        </span>
      </label>
      <label className="tp-option">
        <span className="tp-option-label">Voice range</span>
        <select value={gender} onChange={(e) => onGender(e.target.value)} className="tp-select">
          <option value="neutral">Neutral / adult</option>
          <option value="male">Male adult</option>
          <option value="female">Female adult</option>
        </select>
      </label>
    </div>
  );
}

function IELTSReportForm({ audioBlob, selectedPrompt, l1, gender, authed, onRequireSignIn, user }) {
  // Pre-fill from the signed-in user's saved profile so they don't re-type
  // the same details every report. Backend persists these on each report
  // submission (testprep.controller fire-and-forget). First-time signed-in
  // users get just their Google name pre-filled — the rest stay empty.
  const [name, setName] = useState(() => user?.name || "");
  const [age, setAge] = useState(() => user?.age || "");
  const [centre, setCentre] = useState(() => user?.ielts_centre_name || "");
  const [regNo, setRegNo] = useState(() => user?.registration_number || "");
  const [testDate, setTestDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [downloading, setDownloading] = useState(false);
  const [err, setErr] = useState(null);

  // If the user object updates after mount (e.g. /auth/me refresh resolves
  // shortly after sign-in), repopulate empty fields. Don't clobber whatever
  // the user has already typed in this session.
  useEffect(() => {
    if (!user) return;
    if (!name && user.name) setName(user.name);
    if (!age && user.age) setAge(user.age);
    if (!centre && user.ielts_centre_name) setCentre(user.ielts_centre_name);
    if (!regNo && user.registration_number) setRegNo(user.registration_number);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, user?.age, user?.ielts_centre_name, user?.registration_number, user?.name]);

  if (!audioBlob) return null;

  const submit = async (e) => {
    e.preventDefault();
    if (!authed) {
      onRequireSignIn?.("Sign in to download your IELTS report and save it to your history.");
      return;
    }
    setErr(null);
    setDownloading(true);
    try {
      const file = new File([audioBlob], `ielts-response-${Date.now()}.webm`,
        { type: audioBlob.type || "audio/webm" });
      await downloadIELTSReport(file, {
        gender,
        l1Language: l1,
        ageGroup: "adult",
        name: name.trim() || "Candidate",
        age: age.trim(),
        centreName: centre.trim(),
        registrationNumber: regNo.trim(),
        testDate,
        promptId: selectedPrompt?.prompt_id || "",
      });
      // Backend already persists these to the user profile in a fire-and-forget
      // call inside the report handler — no extra round-trip needed here.
    } catch (e) {
      setErr(e.message || "Failed to generate report");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <form className="tp-card" onSubmit={submit}>
      <div className="tp-kicker">Download Professional Report</div>
      <div className="tp-card-title" style={{ fontSize: 20 }}>Generate Official PDF</div>
      <div className="tp-card-sub">
        Fill in your details below. Re-runs the analysis server-side, applies your details to the report header, and
        downloads a candidate-ready PDF with personal coach advice.
      </div>

      <div className="tp-form-grid">
        <label className="tp-form-field">
          <span>Candidate Name</span>
          <input className="tp-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name as on ID" required />
        </label>
        <label className="tp-form-field">
          <span>Age</span>
          <input className="tp-input" type="number" min="14" max="80" value={age} onChange={(e) => setAge(e.target.value)} placeholder="e.g. 24" />
        </label>
        <label className="tp-form-field">
          <span>IELTS Centre Name</span>
          <input className="tp-input" value={centre} onChange={(e) => setCentre(e.target.value)} placeholder="e.g. British Council Kolkata" />
        </label>
        <label className="tp-form-field">
          <span>Registration Number</span>
          <input className="tp-input" value={regNo} onChange={(e) => setRegNo(e.target.value)} placeholder="e.g. IRN2026040123" />
        </label>
        <label className="tp-form-field">
          <span>Test Date</span>
          <input className="tp-input" type="date" value={testDate} onChange={(e) => setTestDate(e.target.value)} />
        </label>
      </div>

      {err && <div className="tp-alert tp-alert--error">{err}</div>}

      <div className="tp-action-row" style={{ marginTop: 12 }}>
        <button className="tp-btn tp-btn--primary" type="submit" disabled={downloading}>
          {downloading ? "Generating PDF…" : authed ? "Download PDF Report" : "Sign in to download PDF"}
        </button>
        <span className="tp-hint">
          {authed
            ? "Takes 20–45 seconds. PDF opens via your browser download."
            : "We save your history and reports once you sign in with Google."}
        </span>
      </div>
    </form>
  );
}

export default function TestFlow({ testType, onExit, authed, onRequireSignIn, user }) {
  const [prompts, setPrompts] = useState([]);
  const [taskFilter, setTaskFilter] = useState(1);
  const [selectedPrompt, setSelectedPrompt] = useState(null);
  // Start L1 from the user's declared native language. Auto-detect was
  // removed in the acoustic-core release because Whisper returns "en" for
  // English speech and the candidate's L1 cannot be inferred from the
  // signal alone. We require the user to pick one of the calibrated
  // substrates ({Hindi, Bangla}); if their profile doesn't already match
  // we default to Hindi (the most representative Indian-L2 substrate) and
  // surface the dropdown so they can correct it before scoring.
  const [l1, setL1] = useState(() => nativeLanguageToL1Code(user?.nativeLanguage) || "hin");
  const [gender, setGender] = useState("neutral");
  const [loadingPrompts, setLoadingPrompts] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [jobProgress, setJobProgress] = useState(null);
  const [result, setResult] = useState(null);
  const [lastBlob, setLastBlob] = useState(null);
  const [error, setError] = useState(null);
  // Quota + upgrade prompt. We fetch on mount and re-fetch after every
  // successful submit so the pill counts down in real time. Failures are
  // silent — quota is informational, not gating (the gateway re-checks
  // server-side on every submit).
  const [quota, setQuota] = useState(null);
  const [upgradeDetails, setUpgradeDetails] = useState(null);

  const refreshQuota = React.useCallback(() => {
    getQuota().then(setQuota).catch(() => {});
  }, []);
  useEffect(() => { refreshQuota(); }, [refreshQuota]);

  const config = useMemo(() => {
    if (testType === "ielts") {
      return { prepSec: 60, responseSec: 120, responseMinSec: 60 };
    }
    if (taskFilter === 1) {
      return { prepSec: 15, responseSec: 45, responseMinSec: 25 };
    }
    return { prepSec: 30, responseSec: 60, responseMinSec: 40 };
  }, [testType, taskFilter]);

  useEffect(() => {
    let cancelled = false;
    setLoadingPrompts(true);
    setError(null);
    const fetcher = testType === "ielts"
      ? getIELTSPrompts().then((d) => d.prompts || [])
      : getTOEFLPrompts(taskFilter).then((d) => {
        const t = (d.tasks || []).find((x) => x.task_number === taskFilter);
        return (t?.prompts || []).map((p) => ({ ...p, task_number: t?.task_number }));
      });
    fetcher
      .then((list) => {
        if (cancelled) return;
        setPrompts(list);
        setSelectedPrompt(list[0] || null);
      })
      .catch((e) => { if (!cancelled) setError(e.message || "Failed to load prompts"); })
      .finally(() => { if (!cancelled) setLoadingPrompts(false); });
    return () => { cancelled = true; };
  }, [testType, taskFilter]);

  const handleComplete = async ({ blob }) => {
    if (!selectedPrompt) return;
    setAnalyzing(true);
    setJobProgress(null);
    setError(null);
    setResult(null);
    setLastBlob(blob);
    try {
      const file = new File([blob], `response-${Date.now()}.webm`, { type: blob.type || "audio/webm" });
      let data;
      if (testType === "ielts") {
        data = await analyzeIELTS(file, {
          gender,
          l1Language: l1,
          promptId: selectedPrompt.prompt_id,
          onProgress: (s) => setJobProgress(s?.progress || s?.state || null),
        });
      } else {
        data = await analyzeTOEFL(file, {
          gender,
          l1Language: l1,
          taskNumber: taskFilter,
          promptId: selectedPrompt.prompt_id,
          onProgress: (s) => setJobProgress(s?.progress || s?.state || null),
        });
      }
      setResult(data);

      try {
        if (testType === "ielts" && data?.ielts) {
          const i = data.ielts;
          const isAcousticCore = i.test_type === "acoustic_voice_profile" || !!data.acoustic_voice_profile;
          // In acoustic-core mode only Pronunciation is scored; the other
          // three are explicit zero-with-justification placeholders. Save
          // only the scored criteria so Coach's "weakest criterion" logic
          // doesn't fixate on an unscored field.
          const criteria = isAcousticCore
            ? { pronunciation: i.pronunciation?.band }
            : {
                fluency_coherence: i.fluency_coherence?.band,
                lexical_resource: i.lexical_resource?.band,
                grammatical_range: i.grammatical_range?.band,
                pronunciation: i.pronunciation?.band,
              };
          const weakest = Object.entries(criteria)
            .filter(([, v]) => typeof v === "number" && v > 0)
            .sort((a, b) => a[1] - b[1])[0]?.[0] || null;
          saveLastVaaniResult({
            test_type: isAcousticCore ? "acoustic_voice_profile" : "ielts",
            overall_band: i.overall_band,
            weakest_criterion: weakest,
            criterion_bands: criteria,
            l1_display_name: data?.profile?.l1_display_name || null,
            l1_code: data?.profile?.l1_language || null,
          });
        } else if (testType === "toefl" && data?.toefl) {
          const t = data.toefl;
          saveLastVaaniResult({
            test_type: "toefl",
            overall_band: t.task_score,
            weakest_criterion: null,
            criterion_bands: {
              delivery: t.delivery?.score,
              language_use: t.language_use?.score,
              topic_development: t.topic_development?.score,
            },
            l1_display_name: data?.profile?.l1_display_name || null,
            l1_code: data?.profile?.l1_language || null,
          });
        }
      } catch {}
    } catch (e) {
      // 402 = quota_exceeded or feature_blocked. Show the upgrade modal
      // instead of a generic error toast. The structured details are on
      // ApiError.details (api.js parses the response body for any non-2xx).
      if (e?.status === 402 && e?.details) {
        setUpgradeDetails(e.details);
        // Quota state may now be stale — refresh so the pill flips to "0 left"
        // even though this submit was rejected before any Attempt was created.
        refreshQuota();
      } else if (e?.status === 403 && /consent/i.test(String(e?.message || ""))) {
        // Server says consent isn't on file even though localStorage says it is
        // (legacy gate-only flow). Clear local consent so the gate re-opens.
        try { clearConsent(); } catch {}
        setError("Please reload the page and accept the consent dialog — your earlier consent wasn't recorded on the server.");
      } else {
        setError(String(e?.message || "Scoring failed"));
      }
    } finally {
      setAnalyzing(false);
      // Successful or not, refresh the quota so the pill stays accurate.
      refreshQuota();
    }
  };

  return (
    <div className="tp-flow">
      <div className="tp-flow-head">
        <button className="tp-btn tp-btn--ghost tp-btn--sm" onClick={onExit}>← Back</button>
        <div className="tp-flow-title">
          {testType === "ielts" ? "IELTS Speaking — Part 2 (long turn)" : `TOEFL iBT Speaking — Task ${taskFilter}`}
        </div>
      </div>

      {testType === "toefl" && (
        <div className="tp-tabs">
          {[1, 2, 3].map((n) => (
            <button
              key={n}
              className={`tp-tab ${taskFilter === n ? "tp-tab--active" : ""}`}
              onClick={() => { setTaskFilter(n); setResult(null); setSelectedPrompt(null); }}
            >
              Task {n}
            </button>
          ))}
        </div>
      )}

      <QuotaPill quota={quota} />

      <OptionsBar l1={l1} onL1={setL1} gender={gender} onGender={setGender} />

      {error && <div className="tp-alert tp-alert--error">{error}</div>}
      <UpgradeModal details={upgradeDetails} onClose={() => setUpgradeDetails(null)} />

      {loadingPrompts ? (
        <div className="tp-loading">Loading prompts…</div>
      ) : (
        <>
          {prompts.length > 1 && (
            <div className="tp-prompt-picker">
              <label className="tp-option-label">Choose a prompt</label>
              <select
                className="tp-select tp-select--wide"
                value={selectedPrompt?.prompt_id || ""}
                onChange={(e) => {
                  const p = prompts.find((x) => x.prompt_id === e.target.value);
                  setSelectedPrompt(p || null);
                  setResult(null);
                }}
              >
                {prompts.map((p) => (
                  <option key={p.prompt_id} value={p.prompt_id}>
                    {(p.topic ? `[${p.topic}] ` : "") + (p.prompt_text?.slice(0, 90) || p.prompt_id)}
                  </option>
                ))}
              </select>
            </div>
          )}

          <CueCard prompt={selectedPrompt} testType={testType} />

          <CaptionedRecorder
            key={selectedPrompt?.prompt_id || "none"}
            prepSec={config.prepSec}
            responseSec={config.responseSec}
            responseMinSec={config.responseMinSec}
            onComplete={handleComplete}
          />

          {analyzing && <AnalyzingProgress jobState={jobProgress} />}

          {result && testType === "ielts" && <IELTSBandCard result={result} />}
          {result && testType === "toefl" && <TOEFLTaskCard result={result} />}
          {result && testType === "ielts" && lastBlob && (
            <IELTSReportForm
              audioBlob={lastBlob}
              selectedPrompt={selectedPrompt}
              l1={l1}
              gender={gender}
              authed={authed}
              user={user}
              onRequireSignIn={onRequireSignIn}
            />
          )}
        </>
      )}
    </div>
  );
}
