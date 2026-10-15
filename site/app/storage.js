// Per-device preferences under one prefix, so later features (a reader's own highlights, the offline
// app) cannot collide with them. Every access is guarded: a private window or blocked site data
// throws, and the page must work the same without storage.
export const PREFIX = "haftarah:v1:";
const LEGACY = ["size", "theme", "trope"];   // the unprefixed keys of the first web release (2026-10-14)

export const key = name => PREFIX + name;
const storageOf = s => s || globalThis.localStorage;

export function load(name, storage) {
  try { return storageOf(storage).getItem(key(name)); } catch { return null; }
}

export function store(name, value, storage) {
  try { const s = storageOf(storage); value == null ? s.removeItem(key(name)) : s.setItem(key(name), String(value)); } catch {}
}

/** Move the legacy keys under the prefix once; a value already under the prefix wins. Returns the names moved. */
export function migrateKeys(storage) {
  const moved = [];
  try {
    const s = storageOf(storage);
    for (const name of LEGACY) {
      const old = s.getItem(name);
      if (old == null) continue;
      if (s.getItem(key(name)) == null) { s.setItem(key(name), old); moved.push(name); }
      s.removeItem(name);
    }
  } catch {}
  return moved;
}
