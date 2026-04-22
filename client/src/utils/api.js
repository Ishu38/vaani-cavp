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

const BASE = "/api";

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

// ── Fetch helpers ────────────────────────────────────────────────────────
// credentials: "include" tells the browser to send httpOnly cookies

/** Read the CSRF token from the vp_csrf cookie (set by server, JS-readable) */
function getCsrfToken() {
  const match = document.cookie.match(/(?:^|;\s*)vp_csrf=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : "";
}

async function jsonFetch(url, options = {}) {
  const res = await fetch(url, {
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
    throw new Error("Session expired — please login again");
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || body.error || res.statusText);
  }
  return res.json();
}

async function formFetch(url, formData) {
  const res = await fetch(url, {
    method: "POST",
    credentials: "include",
    headers: {
      "X-CSRF-Token": getCsrfToken(),
    },
    body: formData,
  });
  if (res.status === 401) {
    clearAuth();
    throw new Error("Session expired — please login again");
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || body.error || res.statusText);
  }
  return res.json();
}

// ── Auth endpoints ───────────────────────────────────────────────────────

export async function signup({ name, email, password, role, school, schoolId }) {
  const res = await fetch(`${BASE}/auth/signup`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, email, password, role, school, schoolId }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || body.error || "Signup failed");
  }
  const data = await res.json();
  setAuth(data.access_token, data.user);
  return data;
}

export async function login({ email, password }) {
  const res = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || body.error || "Invalid credentials");
  }
  const data = await res.json();
  setAuth(data.access_token, data.user);
  return data;
}

export async function getMe() {
  return jsonFetch(`${BASE}/auth/me`);
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
    if (status.state === "failed") throw new Error(status.error || "Analysis failed");

    if (Date.now() - start > timeout) {
      throw new Error("Analysis timed out");
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

// ── Local storage exports ───────────────────────────────────────────────

export { getSessions as getLocalSessions };
export { getContrastiveSessions as getLocalContrastiveSessions };
export { deleteSession as deleteLocalSession };
export { deleteContrastiveSession as deleteLocalContrastiveSession };
export { clearAllData as clearLocalData };
export { getStorageEstimate as getLocalStorageEstimate };
