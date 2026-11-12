"use strict";

(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.DraftRecovery = api;
})(typeof window !== "undefined" ? window : null, function () {
  const prefix = "cw-monitor-local-draft-v1";
  const maxAgeMs = 7 * 24 * 60 * 60 * 1000;
  const fields = Object.freeze({
    marker: ["selectedId", "name", "facility", "easting", "northing", "date", "level", "note"],
    observation: ["pointId", "date", "reading", "note"]
  });

  function key(username, projectId, kind) {
    if (!fields[kind] || !username || !projectId) return "";
    return `${prefix}:${encodeURIComponent(String(username).toLowerCase())}:${encodeURIComponent(String(projectId))}:${kind}`;
  }

  function sanitize(kind, values) {
    if (!fields[kind] || !values || typeof values !== "object" || Array.isArray(values)) return null;
    const result = {};
    for (const field of fields[kind]) {
      const value = values[field];
      if (typeof value !== "string" || value.length > 2048) return null;
      result[field] = value;
    }
    return result;
  }

  function write(storage, username, projectId, kind, values, revision, now = Date.now()) {
    const storageKey = key(username, projectId, kind);
    const data = sanitize(kind, values);
    if (!storageKey || !data || !Number.isFinite(now)) return false;
    try {
      storage.setItem(storageKey, JSON.stringify({ version: 1, savedAt: now, revision: String(revision || ""), data }));
      return true;
    } catch { return false; }
  }

  function read(storage, username, projectId, kind, now = Date.now()) {
    const storageKey = key(username, projectId, kind);
    if (!storageKey) return null;
    try {
      const raw = storage.getItem(storageKey);
      if (!raw) return null;
      const value = JSON.parse(raw);
      if (value.version !== 1 || !Number.isFinite(value.savedAt) || value.savedAt > now || now - value.savedAt > maxAgeMs || typeof value.revision !== "string") {
        storage.removeItem(storageKey);
        return null;
      }
      const data = sanitize(kind, value.data);
      if (data) return { savedAt: value.savedAt, revision: value.revision, data };
    } catch { /* Invalid or inaccessible storage is not a recoverable draft. */ }
    try { storage.removeItem(storageKey); } catch {}
    return null;
  }

  function remove(storage, username, projectId, kind) {
    const storageKey = key(username, projectId, kind);
    if (!storageKey) return false;
    try { storage.removeItem(storageKey); return true; } catch { return false; }
  }

  return { key, write, read, remove };
});
