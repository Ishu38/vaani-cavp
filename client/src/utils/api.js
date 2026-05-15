import {
  saveAudioBlob,
  saveSession,
  getSessions,
  saveContrastiveSession,
  getContrastiveSessions,
  deleteSession,
  deleteContrastiveSession,
  clearAllData,
  getStorageEstimate,
} from "./localDb.js";

// Same-origin "/api" is the default — works in dev (Vite proxy) and any
// deployment where the SPA and gateway share an origin. Set VITE_API_BASE_URL
// at build time to point the SPA at a separate API host
// (e.g. "https://api.vaaani.in") for subdomain-split deployments.
const RAW_BASE = (import.meta.env.VITE_API_BASE_URL || "/api").trim();
const BASE = RAW_BASE.endsWith("/") ? RAW_BASE.slice(0, -1) : RAW_BASE;

// ── Profile key normalization ────────────────────────────────────────────
// MongoDB stores camelCase but client components expect snake_case
// (matching the FastAPI engine's original response format)

const PROFILE_KEY_MAP = {
  featureExtraction: "feature_extraction",
  aiClassification: "ai_classification",
  phonemeAnalysis: "phoneme_analysis",
  morphemeBoundary: "morpheme_boundary",
  prosodicProfile: "prosodic_profile",
  connectedSpeech: "connected_speech",
  voiceQuality: "voice_quality",
  l1Interference: "l1_interference",
  bhojpuriInterference: "bhojpuri_interference",
  l1Language: "l1_language",
  l1DisplayName: "l1_display_name",
  cifAnalysis: "cif_analysis",
  processingTimeMs: "processing_time_ms",
  audioFilename: "audio_filename",
  speakerId: "speakerId",
  studentName: "studentName",
  createdAt: "createdAt",
};

function normalizeProfile(profile) {
  if (!profile || typeof profile !== "object") return profile;
  const out = {};
  for (const [key, value] of Object.entries(profile)) {
    const mapped = PROFILE_KEY_MAP[key] || key;
    out[mapped] = value;
  }
  return out;
}

// ── Auth state ───────────────────────────────────────────────────────────
// JWT is stored in an httpOnly cookie (set by the server, immune to XSS).
// The browser sends it automatically — we never touch the token in JS.
// Only user metadata is kept in localStorage for UI display.

let _user = null;
try {
  _user = JSON.parse(localStorage.getItem("vp_user") || "null");
} catch {
  localStorage.removeItem("vp_user");
}

function setAuth(_token, user) {
  // Token is in the httpOnly cookie (set by server) — we don't store it.
  // Migrate: clear any legacy localStorage token
  localStorage.removeItem("vp_token");
  _user = user;
  localStorage.setItem("vp_user", JSON.stringify(user));
}

export function clearAuth() {
  _user = null;
  localStorage.removeItem("vp_token");
  localStorage.removeItem("vp_user");
  // Tell server to clear the httpOnly cookie
  fetch(`${BASE}/auth/logout`, { method: "POST", credentials: "include" }).catch(() => {});
}

export function getToken() {
  // Token lives in httpOnly cookie — JS cannot and should not read it
  return null;
}

export function getUser() {
  return _user;
}

export function isAuthenticated() {
  return !!_user;
}

/** Refresh the locally cached user object from /api/auth/me. Called on app
 *  boot when a session cookie is present so the SPA picks up newer profile
 *  fields (age / IELTS centre / registration number) saved server-side
 *  during a previous report download. Returns the fresh user, or null if
 *  the session is no longer valid. */
export async function refreshUser() {
  try {
    const fresh = await jsonFetch(`${BASE}/auth/me`);
    _user = fresh;
    localStorage.setItem("vp_user", JSON.stringify(fresh));
    return fresh;
  } catch {
    return null;
  }
}

/** Patch the candidate profile fields (name/age/ielts_centre_name/
 *  registration_number, plus phone/dob/nativeLanguage/preparingFor/
 *  targetBand/address). Empty strings are ignored server-side. Returns
 *  the updated user; also writes through to the local cache. */
export async function updateProfile(patch) {
  const fresh = await jsonFetch(`${BASE}/auth/profile`, {
    method: "PATCH",
    body: JSON.stringify(patch || {}),
  });
  _user = fresh;
  localStorage.setItem("vp_user", JSON.stringify(fresh));
  return fresh;
}

/** Upload a new avatar image. Server validates png/jpeg/webp ≤ 2MB, pushes
 *  to R2, persists the URL, and returns the refreshed user. */
export async function uploadAvatar(file) {
  const form = new FormData();
  form.append("avatar", file);
  const fresh = await formFetch(`${BASE}/auth/avatar`, form);
  _user = fresh;
  localStorage.setItem("vp_user", JSON.stringify(fresh));
  return fresh;
}

// ── Saved attempts (history) ─────────────────────────────────────────────

export async function listAttempts() {
  return jsonFetch(`${BASE}/attempts`);
}

export async function getAttempt(id) {
  return jsonFetch(`${BASE}/attempts/${encodeURIComponent(id)}`);
}

export async function deleteAttempt(id) {
  return jsonFetch(`${BASE}/attempts/${encodeURIComponent(id)}`, { method: "DELETE" });
}

// ── Fetch helpers ────────────────────────────────────────────────────────
// credentials: "include" tells the browser to send httpOnly cookies

/** Read the CSRF token from the vp_csrf cookie (set by server, JS-readable) */
function getCsrfToken() {
  const match = document.cookie.match(/(?:^|;\s*)vp_csrf=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : "";
}

export class ApiError extends Error {
  constructor(message, { status = 0, code = "unknown", original = null, details = null } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.original = original;
    // Structured server-error body (parsed JSON). Currently surfaces:
    //   - 402 quota_exceeded / feature_blocked → { code, plan, used, limit,
    //     resetsAt, upgradeUrl, message }
    // Caller checks `err.status === 402 && err.details?.code === "quota_exceeded"`
    // to render the upgrade modal instead of a generic toast.
    this.details = details;
  }
}

function classifyHttpStatus(status) {
  if (status === 401) return "auth_expired";
  if (status === 402) return "payment_required";
  if (status === 403) return "forbidden";
  if (status === 404) return "not_found";
  if (status === 408) return "timeout";
  if (status === 429) return "rate_limited";
  if (status === 503) return "engine_busy";
  if (status >= 500 && status < 600) return "engine_down";
  return "http_error";
}

async function safeFetch(url, options) {
  try {
    return await fetch(url, options);
  } catch (e) {
    // Network-level failure: TypeError, AbortError, or DNS / offline
    const offline = typeof navigator !== "undefined" && navigator.onLine === false;
    throw new ApiError(
      offline ? "You appear to be offline." : "Could not reach the Vaani service.",
      { status: 0, code: offline ? "offline" : "network", original: e },
    );
  }
}

async function jsonFetch(url, options = {}) {
  const res = await safeFetch(url, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      "X-CSRF-Token": getCsrfToken(),
      ...options.headers,
    },
  });
  if (res.status === 401) {
    clearAuth();
    throw new ApiError("Session expired — please sign in again.", { status: 401, code: "auth_expired" });
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(
      body.message || body.error || res.statusText,
      { status: res.status, code: classifyHttpStatus(res.status), details: body || null },
    );
  }
  return res.json();
}

async function formFetch(url, formData) {
  const res = await safeFetch(url, {
    method: "POST",
    credentials: "include",
    headers: {
      "X-CSRF-Token": getCsrfToken(),
    },
    body: formData,
  });
  if (res.status === 401) {
    clearAuth();
    throw new ApiError("Session expired — please sign in again.", { status: 401, code: "auth_expired" });
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(
      body.message || body.error || res.statusText,
      { status: res.status, code: classifyHttpStatus(res.status), details: body || null },
    );
  }
  return res.json();
}

// ── Auth endpoints ───────────────────────────────────────────────────────

export async function signup({ name, email, password, role, school, schoolId }) {
  const data = await jsonFetch(`${BASE}/auth/signup`, {
    method: "POST",
    body: JSON.stringify({ name, email, password, role, school, schoolId }),
  });
  setAuth(data.access_token, data.user);
  return data;
}

export async function login({ email, password }) {
  const data = await jsonFetch(`${BASE}/auth/login`, {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  setAuth(data.access_token, data.user);
  return data;
}

export async function getMe() {
  return jsonFetch(`${BASE}/auth/me`);
}

export async function signInWithGoogle(credential) {
  const data = await jsonFetch(`${BASE}/auth/google`, {
    method: "POST",
    body: JSON.stringify({ credential }),
  });
  setAuth(data.access_token, data.user);
  return data;
}

// ── Phone OTP auth ─────────────────────────────────────────────────────

export async function sendPhoneOtp(phone) {
  return jsonFetch(`${BASE}/auth/phone/send`, {
    method: "POST",
    body: JSON.stringify({ phone }),
  });
}

export async function verifyPhoneOtp(phone, otp) {
  const data = await jsonFetch(`${BASE}/auth/phone/verify`, {
    method: "POST",
    body: JSON.stringify({ phone, otp }),
  });
  setAuth(data.access_token, data.user);
  return data;
}

// ── Analysis endpoints (job-based) ───────────────────────────────────────

export async function submitAnalysis(file, options = {}) {
  const form = new FormData();
  form.append("audio", file);
  if (options.gender) form.append("gender", options.gender);
  if (options.speakerId) form.append("speakerId", options.speakerId);
  if (options.studentName) form.append("studentName", options.studentName);
  if (options.schoolId) form.append("schoolId", options.schoolId);
  if (options.language) form.append("language", options.language);
  if (options.opensmile) form.append("opensmile", "true");
  if (options.speechbrain) form.append("speechbrain", "true");
  if (options.l1Language) form.append("l1Language", options.l1Language);

  const data = await formFetch(`${BASE}/analysis/submit`, form);

  // Save audio locally for offline reference
  try {
    await saveAudioBlob(file, file.name || "single_recording");
  } catch (e) {
    console.warn("Local audio save failed:", e);
  }

  return data; // { jobId }
}

export async function submitContrastive(fileA, fileB, options = {}) {
  const form = new FormData();
  form.append("audio_a", fileA);
  form.append("audio_b", fileB);
  if (options.gender) form.append("gender", options.gender);
  if (options.speakerId) form.append("speakerId", options.speakerId);
  if (options.studentName) form.append("studentName", options.studentName);
  if (options.schoolId) form.append("schoolId", options.schoolId);
  if (options.labelA) form.append("labelA", options.labelA);
  if (options.labelB) form.append("labelB", options.labelB);
  if (options.l1Language) form.append("l1Language", options.l1Language);

  const data = await formFetch(`${BASE}/analysis/contrastive`, form);

  try {
    await saveAudioBlob(fileA, "L1_recording");
    await saveAudioBlob(fileB, "L2_recording");
  } catch (e) {
    console.warn("Local audio save failed:", e);
  }

  return data; // { jobId }
}

export async function pollJob(jobId) {
  return jsonFetch(`${BASE}/analysis/job/${encodeURIComponent(jobId)}`);
}

/**
 * Poll a job until completion or failure.
 * Returns the final job status object.
 * @param {string} jobId
 * @param {object} opts - { interval: ms, timeout: ms, onProgress: fn }
 */
export async function waitForJob(jobId, opts = {}) {
  const interval = opts.interval || 2000;
  const timeout = opts.timeout || 300000; // 5 min default
  const onProgress = opts.onProgress || (() => {});
  const start = Date.now();

  while (true) {
    const status = await pollJob(jobId);
    onProgress(status);

    if (status.state === "completed") return status;
    if (status.state === "failed") {
      throw new ApiError(status.error || "Analysis failed on the engine.", { status: 0, code: "engine_failed" });
    }

    if (Date.now() - start > timeout) {
      throw new ApiError(
        "Analysis took longer than expected. Try a shorter recording, or try again in a moment.",
        { status: 0, code: "timeout" },
      );
    }

    await new Promise((r) => setTimeout(r, interval));
  }
}

// ── Profile endpoints ────────────────────────────────────────────────────

export async function getProfile(profileId) {
  const raw = await jsonFetch(`${BASE}/profiles/${encodeURIComponent(profileId)}`);
  return normalizeProfile(raw);
}

export async function getTrajectory(speakerId, limit) {
  const safeSpeakerId = encodeURIComponent(speakerId);
  const url = limit
    ? `${BASE}/profiles/trajectory/${safeSpeakerId}?limit=${limit}`
    : `${BASE}/profiles/trajectory/${safeSpeakerId}`;
  const raw = await jsonFetch(url);
  // Server returns a raw array; ProgressTracker expects { trajectory, count }
  const arr = Array.isArray(raw) ? raw : [];
  return { trajectory: arr.map(normalizeProfile), count: arr.length };
}

export async function getSchoolProfiles(schoolId) {
  return jsonFetch(`${BASE}/profiles/school/${encodeURIComponent(schoolId)}`);
}

export async function getReport(reportId) {
  return jsonFetch(`${BASE}/profiles/report/${encodeURIComponent(reportId)}`);
}

export async function getReportsBySpeaker(speakerId) {
  return jsonFetch(`${BASE}/profiles/reports/${encodeURIComponent(speakerId)}`);
}

// ── Legacy direct-to-engine endpoints (kept for backwards compat) ────────

export async function analyzeAudio(file, options = {}) {
  const { jobId } = await submitAnalysis(file, options);
  // console.log("[analyzeAudio] jobId:", jobId);

  const jobResult = await waitForJob(jobId, { onProgress: options.onProgress });
  // console.log("[analyzeAudio] job completed:", jobResult);

  // Fetch the full profile to return in the same shape the UI expects
  let profile = null;
  const profileId = jobResult.result?.profileId;
  if (profileId) {
    // console.log("[analyzeAudio] fetching profile:", profileId);
    profile = await getProfile(profileId);
    // console.log("[analyzeAudio] profile keys:", Object.keys(profile || {}));

    // Save to local IndexedDB
    try {
      await saveSession(profile, {
        speakerId: options.speakerId,
        studentName: options.studentName,
        gender: options.gender,
      });
    } catch (e) {
      console.warn("Local save failed:", e);
    }
  } else {
    console.warn("[analyzeAudio] No profileId in job result:", jobResult);
  }

  return { status: "ok", profile, jobId, jobResult };
}

export async function contrastiveAnalysis(fileA, fileB, options = {}) {
  const { jobId } = await submitContrastive(fileA, fileB, options);
  // console.log("[contrastiveAnalysis] jobId:", jobId);

  const jobResult = await waitForJob(jobId, { onProgress: options.onProgress });
  // console.log("[contrastiveAnalysis] job completed:", jobResult);

  // Fetch the full report + profiles to return in the shape the UI expects
  let report = null;
  let profile_a = null;
  let profile_b = null;

  if (jobResult.result?.reportId) {
    // console.log("[contrastiveAnalysis] fetching report:", jobResult.result.reportId);
    report = await getReport(jobResult.result.reportId);
    // console.log("[contrastiveAnalysis] report keys:", Object.keys(report || {}));
    profile_a = normalizeProfile(report.profileA);
    profile_b = normalizeProfile(report.profileB);

    try {
      await saveContrastiveSession(
        report.contrastiveData,
        profile_a,
        profile_b,
        {
          speakerId: options.speakerId,
          studentName: options.studentName,
          gender: options.gender,
        },
      );
    } catch (e) {
      console.warn("Local save failed:", e);
    }
  }

  return {
    status: "ok",
    contrastive_report: report?.contrastiveData,
    profile_a,
    profile_b,
    jobId,
    jobResult,
  };
}

export async function submitBatch(files, options = {}) {
  const form = new FormData();
  for (const file of files) {
    form.append("audios", file);
  }
  if (options.gender) form.append("gender", options.gender);
  if (options.speakerId) form.append("speakerId", options.speakerId);
  if (options.studentName) form.append("studentName", options.studentName);
  if (options.l1Language) form.append("l1Language", options.l1Language);
  if (options.opensmile) form.append("opensmile", "true");
  if (options.speechbrain) form.append("speechbrain", "true");

  return formFetch(`${BASE}/analysis/batch`, form); // { jobIds: [...] }
}

export async function batchAnalyze(files, options = {}) {
  const { jobIds } = await submitBatch(files, options);

  // Poll all jobs in parallel
  const jobResults = await Promise.all(
    jobIds.map((jobId) => waitForJob(jobId, { onProgress: options.onProgress })),
  );

  // Fetch profiles and save locally
  const results = await Promise.all(
    jobResults.map(async (jobResult, i) => {
      const profileId = jobResult.result?.profileId;
      let profile = null;
      if (profileId) {
        profile = await getProfile(profileId);
        try {
          await saveSession(profile, {
            speakerId: options.speakerId,
            studentName: options.studentName,
            gender: options.gender,
          });
        } catch (e) {
          console.warn("Local save failed for batch item:", e);
        }
      }
      return { profile, jobId: jobIds[i], jobResult };
    }),
  );

  return { status: "ok", results };
}

export async function getHealth() {
  const res = await fetch(`${BASE}/health`, { credentials: "include" });
  return res.json();
}

export async function downloadReport(file, options = {}) {
  const form = new FormData();
  form.append("audio", file);
  form.append("gender", options.gender || "child");
  form.append("student_name", options.studentName || "Student");
  form.append("student_id", options.speakerId || "");

  const res = await fetch(`${BASE}/report`, {
    method: "POST",
    credentials: "include",
    body: form,
  });
  if (!res.ok) throw new Error("Report generation failed");

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `voice_report_${options.speakerId || "student"}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── Dashboard & Classes endpoints ────────────────────────────────────────

export async function getDashboard() {
  return jsonFetch(`${BASE}/dashboard`);
}

export async function getClassrooms() {
  return jsonFetch(`${BASE}/classes`);
}

export async function getClassroom(id) {
  return jsonFetch(`${BASE}/classes/${encodeURIComponent(id)}`);
}

export async function createClassroom(data) {
  return jsonFetch(`${BASE}/classes`, { method: 'POST', body: JSON.stringify(data) });
}

export async function updateClassroom(id, data) {
  return jsonFetch(`${BASE}/classes/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(data) });
}

export async function deleteClassroom(id) {
  return jsonFetch(`${BASE}/classes/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function getClassroomStudents(classroomId) {
  return jsonFetch(`${BASE}/classes/${encodeURIComponent(classroomId)}/students`);
}

export async function addStudent(classroomId, data) {
  return jsonFetch(`${BASE}/classes/${encodeURIComponent(classroomId)}/students`, { method: 'POST', body: JSON.stringify(data) });
}

export async function removeStudent(classroomId, studentId) {
  return jsonFetch(`${BASE}/classes/${encodeURIComponent(classroomId)}/students/${encodeURIComponent(studentId)}`, { method: 'DELETE' });
}

export async function getClassroomAnalytics(classroomId) {
  return jsonFetch(`${BASE}/classes/${encodeURIComponent(classroomId)}/analytics`);
}

export async function getConsentStatus(studentSpeakerId) {
  return jsonFetch(`${BASE}/consent/status/${encodeURIComponent(studentSpeakerId)}`);
}

export async function requestConsent(data) {
  return jsonFetch(`${BASE}/consent/request`, { method: 'POST', body: JSON.stringify(data) });
}

export async function requestDeletion(studentSpeakerId) {
  return jsonFetch(`${BASE}/privacy/deletion-request`, { method: 'POST', body: JSON.stringify({ studentSpeakerId }) });
}

// ── Verification + reset + Google link ──────────────────────────────────

export async function requestPasswordReset(email) {
  return jsonFetch(`${BASE}/auth/password-reset/request`, {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export async function confirmPasswordReset({ email, token, newPassword }) {
  return jsonFetch(`${BASE}/auth/password-reset/confirm`, {
    method: "POST",
    body: JSON.stringify({ email, token, newPassword }),
  });
}

export async function verifyEmail({ email, token }) {
  return jsonFetch(`${BASE}/auth/verify-email`, {
    method: "POST",
    body: JSON.stringify({ email, token }),
  });
}

export async function resendVerificationEmail() {
  return jsonFetch(`${BASE}/auth/verify-email/resend`, { method: "POST" });
}

export async function confirmGoogleLink({ email, token }) {
  return jsonFetch(`${BASE}/auth/link-google/confirm`, {
    method: "POST",
    body: JSON.stringify({ email, token }),
  });
}

// ── IELTS self-consent (DPDP) ────────────────────────────────────────────
// Server-side counterpart to ConsentGate's localStorage write. Without this
// POST, the gateway returns 403 "Consent required" on every submit even
// though the SPA thinks consent is given.

export async function recordIeltsConsent(consentTypes) {
  return jsonFetch(`${BASE}/testprep/consent`, {
    method: "POST",
    body: JSON.stringify({
      consentVersion: "1.0",
      consentTypes: consentTypes || ["voice_processing", "transcript_storage"],
    }),
  });
}

export async function getIeltsConsentStatus() {
  return jsonFetch(`${BASE}/testprep/consent/status`);
}

// ── IELTS / TOEFL test prep endpoints ────────────────────────────────────

/** Current user plan + monthly mock quota usage. Returns shape:
 *  { plan, planExpired, planExpiresAt, monthly: { used, limit, remaining,
 *    resetsAt, unlimited }, features: { pdfReports, ... }, upgradeUrl }
 *  Used by TestFlow to show "X of 3 mocks remaining" before submission and
 *  to gate the PDF download CTA on free tier.
 */
export async function getQuota() {
  return jsonFetch(`${BASE}/testprep/quota`);
}

export async function getIELTSPrompts(topic) {
  const qs = topic ? `?topic=${encodeURIComponent(topic)}` : "";
  return jsonFetch(`${BASE}/testprep/prompts/ielts${qs}`);
}

export async function getTOEFLPrompts(taskNumber) {
  const qs = taskNumber ? `?task_number=${taskNumber}` : "";
  return jsonFetch(`${BASE}/testprep/prompts/toefl${qs}`);
}

/**
 * Submit + poll. The server now enqueues a BullMQ job and returns a
 * jobId immediately. We poll /testprep/jobs/:id every 2s until the
 * worker reports completed/failed. Caller can pass `onProgress` to
 * surface stage messages in the UI ("transcribing…", "scoring…").
 *
 * Compared to the previous synchronous flow: HTTP POSTs no longer
 * fight the 30-180s engine pipeline timeout — the upload+enqueue
 * returns in <1s, and polling keeps the client in sync without
 * any open long request that mobile networks tend to drop.
 */
export async function analyzeIELTS(file, options = {}) {
  const form = new FormData();
  form.append("audio", file);
  if (options.gender) form.append("gender", options.gender);
  if (options.l1Language) form.append("l1_language", options.l1Language);
  if (options.promptId) form.append("prompt_id", options.promptId);
  const submitted = await formFetch(`${BASE}/testprep/ielts/analyze`, form);
  return waitForTestPrepJob(submitted.jobId, options.onProgress);
}

export async function analyzeTOEFL(file, options = {}) {
  const form = new FormData();
  form.append("audio", file);
  if (options.gender) form.append("gender", options.gender);
  if (options.l1Language) form.append("l1_language", options.l1Language);
  if (options.taskNumber) form.append("task_number", String(options.taskNumber));
  if (options.promptId) form.append("prompt_id", options.promptId);
  const submitted = await formFetch(`${BASE}/testprep/toefl/analyze`, form);
  return waitForTestPrepJob(submitted.jobId, options.onProgress);
}

async function waitForTestPrepJob(jobId, onProgress) {
  const POLL_MS = 2000;
  // 720s ceiling — engine worker has a 600s timeout for the full neuro-
  // symbolic pipeline (Praat-heavy 90s audio ~3-4 min), plus headroom
  // for queue wait + final-poll latency. Vaani's product promise is a
  // precise, voice-unique profile per submission — we'd rather wait 4
  // minutes than truncate the analysis. Hitting this ceiling means the
  // engine genuinely hung; the user retry will land on a fresh job.
  const TIMEOUT_MS = 720_000;
  const start = Date.now();
  while (true) {
    if (Date.now() - start > TIMEOUT_MS) {
      throw new ApiError(
        "Scoring is taking longer than expected. Try again — your audio is queued, the engine may be catching up.",
        { status: 0, code: "engine_busy" },
      );
    }
    const status = await jsonFetch(`${BASE}/testprep/jobs/${encodeURIComponent(jobId)}`);
    if (typeof onProgress === "function") onProgress(status);
    if (status.state === "completed") return status.result;
    if (status.state === "failed") {
      throw new ApiError(
        status.error || "Analysis failed",
        { status: 0, code: "engine_error" },
      );
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

export async function toeflSectionScore(taskScores) {
  return jsonFetch(`${BASE}/testprep/toefl/section-score`, {
    method: "POST",
    body: JSON.stringify({ task_scores: taskScores }),
  });
}

export async function guidanceTopics() {
  return jsonFetch(`${BASE}/testprep/guidance/topics`);
}

export async function guidanceNode(nodeId) {
  return jsonFetch(`${BASE}/testprep/guidance/node/${encodeURIComponent(nodeId)}`);
}

export async function guidanceAsk(query, context) {
  return jsonFetch(`${BASE}/testprep/guidance/ask`, {
    method: "POST",
    body: JSON.stringify({ query, context: context || null }),
  });
}

export function saveLastVaaniResult(result) {
  try {
    const payload = {
      ...result,
      ts: Date.now(),
    };
    localStorage.setItem("vaani_last_result", JSON.stringify(payload));
  } catch {}
}

export function loadLastVaaniResult() {
  try {
    const raw = localStorage.getItem("vaani_last_result");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const ageSec = parsed.ts ? (Date.now() - parsed.ts) / 1000 : null;
    return { ...parsed, last_session_age_sec: ageSec };
  } catch {
    return null;
  }
}

export async function downloadIELTSReport(file, options = {}) {
  const form = new FormData();
  form.append("audio", file);
  if (options.gender) form.append("gender", options.gender);
  if (options.l1Language) form.append("l1_language", options.l1Language);
  if (options.ageGroup) form.append("age_group", options.ageGroup);
  if (options.name) form.append("name", options.name);
  if (options.age) form.append("age", String(options.age));
  if (options.centreName) form.append("centre_name", options.centreName);
  if (options.registrationNumber) form.append("registration_number", options.registrationNumber);
  if (options.testDate) form.append("test_date", options.testDate);
  if (options.promptId) form.append("prompt_id", options.promptId);

  // Enqueue and poll — same pattern as analyzeIELTS. Previously this
  // POST was synchronous and held the connection for the full 60-180s
  // pipeline, which the Cloudflare tunnel reliably killed at ~100s.
  const submitted = await formFetch(`${BASE}/testprep/ielts/report`, form);
  const result = await waitForTestPrepJob(submitted.jobId, options.onProgress);
  // Worker stored the PDF on disk; fetch it via the dedicated download
  // route (auth'd by the same job-owner rule as /jobs/:id).
  const pdfRes = await safeFetch(
    `${BASE}/testprep/jobs/${encodeURIComponent(submitted.jobId)}/pdf`,
    { credentials: "include", headers: { "X-CSRF-Token": getCsrfToken() } },
  );
  if (!pdfRes.ok) {
    const body = await pdfRes.json().catch(() => ({}));
    throw new ApiError(
      body.message || body.error || pdfRes.statusText,
      { status: pdfRes.status, code: classifyHttpStatus(pdfRes.status) },
    );
  }
  const disposition = pdfRes.headers.get("content-disposition") || "";
  const match = disposition.match(/filename="?([^";]+)/);
  const filename = match ? match[1] : (result?.filename || `vaani_ielts_${Date.now()}.pdf`);
  const blob = await pdfRes.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return { filename, band: pdfRes.headers.get("x-vaani-band-overall") || result?.band || "" };
}

// ── Local storage exports ───────────────────────────────────────────────

export { getSessions as getLocalSessions };
export { getContrastiveSessions as getLocalContrastiveSessions };
export { deleteSession as deleteLocalSession };
export { deleteContrastiveSession as deleteLocalContrastiveSession };
export { clearAllData as clearLocalData };
export { getStorageEstimate as getLocalStorageEstimate };
