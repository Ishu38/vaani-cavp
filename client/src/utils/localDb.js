const DB_NAME = "VoiceProfileLocal";
const DB_VERSION = 1;

const STORES = {
  sessions: "sessions",       // analysis results + metadata
  audioBlobs: "audioBlobs",   // raw audio files as Blobs
  contrastive: "contrastive", // contrastive reports
};

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const db = e.target.result;

      if (!db.objectStoreNames.contains(STORES.sessions)) {
        const s = db.createObjectStore(STORES.sessions, { keyPath: "id", autoIncrement: true });
        s.createIndex("speakerId", "speakerId", { unique: false });
        s.createIndex("createdAt", "createdAt", { unique: false });
      }

      if (!db.objectStoreNames.contains(STORES.audioBlobs)) {
        db.createObjectStore(STORES.audioBlobs, { keyPath: "id", autoIncrement: true });
      }

      if (!db.objectStoreNames.contains(STORES.contrastive)) {
        const c = db.createObjectStore(STORES.contrastive, { keyPath: "id", autoIncrement: true });
        c.createIndex("speakerId", "speakerId", { unique: false });
        c.createIndex("createdAt", "createdAt", { unique: false });
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx(db, storeName, mode = "readonly") {
  const transaction = db.transaction(storeName, mode);
  return transaction.objectStore(storeName);
}

function reqToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// ── Audio Blobs ──────────────────────────────────────────────────────────

export async function saveAudioBlob(file, label = "") {
  const db = await openDb();
  const blob = file instanceof Blob ? file : new Blob([file]);
  const record = {
    blob,
    name: file.name || label || "recording.webm",
    size: blob.size,
    label,
    createdAt: new Date().toISOString(),
  };
  const id = await reqToPromise(tx(db, STORES.audioBlobs, "readwrite").add(record));
  db.close();
  return id;
}

export async function getAudioBlob(id) {
  const db = await openDb();
  const record = await reqToPromise(tx(db, STORES.audioBlobs).get(id));
  db.close();
  return record || null;
}

export async function deleteAudioBlob(id) {
  const db = await openDb();
  await reqToPromise(tx(db, STORES.audioBlobs, "readwrite").delete(id));
  db.close();
}

// ── Sessions (single analysis) ──────────────────────────────────────────

export async function saveSession(profile, meta = {}) {
  const db = await openDb();
  const record = {
    speakerId: meta.speakerId || "anonymous",
    studentName: meta.studentName || "",
    gender: meta.gender || "neutral",
    audioId: meta.audioId || null,
    profile,
    createdAt: new Date().toISOString(),
  };
  const id = await reqToPromise(tx(db, STORES.sessions, "readwrite").add(record));
  db.close();
  return id;
}

export async function getSessions(speakerId = null, limit = 50) {
  const db = await openDb();
  const store = tx(db, STORES.sessions);
  const all = await reqToPromise(store.getAll());
  db.close();

  let results = all;
  if (speakerId) {
    results = results.filter((s) => s.speakerId === speakerId);
  }
  results.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return results.slice(0, limit);
}

export async function getSession(id) {
  const db = await openDb();
  const record = await reqToPromise(tx(db, STORES.sessions).get(id));
  db.close();
  return record || null;
}

export async function deleteSession(id) {
  const db = await openDb();
  const store = tx(db, STORES.sessions, "readwrite");
  const session = await reqToPromise(store.get(id));
  await reqToPromise(store.delete(id));
  db.close();
  if (session?.audioId) {
    await deleteAudioBlob(session.audioId).catch(() => {});
  }
}

// ── Contrastive Reports ─────────────────────────────────────────────────

export async function saveContrastiveSession(report, profileA, profileB, meta = {}) {
  const db = await openDb();
  const record = {
    speakerId: meta.speakerId || "anonymous",
    studentName: meta.studentName || "",
    gender: meta.gender || "neutral",
    audioIdA: meta.audioIdA || null,
    audioIdB: meta.audioIdB || null,
    contrastiveReport: report,
    profileA,
    profileB,
    createdAt: new Date().toISOString(),
  };
  const id = await reqToPromise(tx(db, STORES.contrastive, "readwrite").add(record));
  db.close();
  return id;
}

export async function getContrastiveSessions(speakerId = null, limit = 50) {
  const db = await openDb();
  const store = tx(db, STORES.contrastive);
  const all = await reqToPromise(store.getAll());
  db.close();

  let results = all;
  if (speakerId) {
    results = results.filter((s) => s.speakerId === speakerId);
  }
  results.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return results.slice(0, limit);
}

export async function deleteContrastiveSession(id) {
  const db = await openDb();
  const store = tx(db, STORES.contrastive, "readwrite");
  const record = await reqToPromise(store.get(id));
  await reqToPromise(store.delete(id));
  db.close();
  if (record?.audioIdA) await deleteAudioBlob(record.audioIdA).catch(() => {});
  if (record?.audioIdB) await deleteAudioBlob(record.audioIdB).catch(() => {});
}

// ── Utility ─────────────────────────────────────────────────────────────

export async function clearAllData() {
  const db = await openDb();
  await Promise.all(
    Object.values(STORES).map(
      (name) => reqToPromise(tx(db, name, "readwrite").clear())
    )
  );
  db.close();
}

export async function getStorageEstimate() {
  if (navigator.storage?.estimate) {
    const est = await navigator.storage.estimate();
    return { used: est.usage, quota: est.quota };
  }
  return null;
}
