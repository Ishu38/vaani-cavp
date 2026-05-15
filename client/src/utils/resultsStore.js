// Local results store — stamps each scored response with a stable, shareable id
// and persists the full result blob in localStorage so /results/:id can render
// without a round-trip to the server.

const STORAGE_KEY = "vp_results_v1";
const MAX_KEEP = 25;

function readAll() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeAll(map) {
  try {
    const ids = Object.keys(map);
    if (ids.length > MAX_KEEP) {
      // Drop oldest first
      ids
        .sort((a, b) => (map[a].createdAt || 0) - (map[b].createdAt || 0))
        .slice(0, ids.length - MAX_KEEP)
        .forEach((id) => delete map[id]);
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // localStorage full or disabled — best effort
  }
}

function makeId() {
  const random = Math.random().toString(36).slice(2, 9);
  const stamp = Date.now().toString(36);
  return `${stamp}-${random}`;
}

export function saveResult(result, meta = {}) {
  const map = readAll();
  const id = makeId();
  map[id] = {
    id,
    createdAt: Date.now(),
    testType: meta.testType || (result?.toefl ? "toefl" : "ielts"),
    promptId: meta.promptId || null,
    l1Code: meta.l1Code || result?.profile?.l1_language || null,
    l1DisplayName: meta.l1DisplayName || result?.profile?.l1_display_name || null,
    result,
  };
  writeAll(map);
  return id;
}

export function loadResult(id) {
  const map = readAll();
  return map[id] || null;
}

export function listResults() {
  const map = readAll();
  return Object.values(map).sort((a, b) => b.createdAt - a.createdAt);
}

export function deleteResult(id) {
  const map = readAll();
  delete map[id];
  writeAll(map);
}
