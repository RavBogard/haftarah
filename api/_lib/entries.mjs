// api/_lib/entries.mjs — what save_entries, update_sheet and set_status do to a sheet, as pure functions.
// Glosses have no id in the sheet schema; save_entries gives each new gloss `id: "g-" + 8 hex` (derived like an
// entry id) so it can be updated and rejected by id. Print and web ignore the field.
import { createRequire } from "node:module";
import { gate } from "../../scripts/build.mjs";
const L = createRequire(import.meta.url)("../../template/lib.js");

const clone = x => JSON.parse(JSON.stringify(x));
const readingOf = (sheet, id) => { const r = L.readings(sheet).find(x => x.id === id); if (!r) throw new Error(`no reading ${id} in this sheet`); return r; };
// Glosses have no ids in the schema; the server gives each one `id: "g-" + 8 hex` the same way, so it can be updated and rejected.
const glossId = (g, readingId) => L.entryId({ ...g, source: "gloss", sourceRef: g.lemma || "" }, readingId).replace(/^e-/, "g-");

/** Upsert commentary entries and glosses (by id; `type: "gloss"` marks a gloss) and glossary items (by term); remove by id. */
export function upsertEntries(sheet, readingId, { entries = [], glossary = [], remove = [] } = {}) {
  const out = clone(sheet);
  const r = readingOf(out, readingId);
  r.commentary = r.commentary || []; r.glosses = r.glosses || []; out.glossary = out.glossary || [];
  const touched = [];
  for (const raw of entries) {
    const { type, ...e } = raw;
    const list = type === "gloss" ? r.glosses : r.commentary;
    if (e.id) {
      const cur = r.commentary.find(x => x.id === e.id) || r.glosses.find(x => x.id === e.id);   // an update by id needs no type
      if (!cur) throw new Error(`no entry ${e.id} to update in ${readingId}`);
      Object.assign(cur, e);
      touched.push(e.id);
    } else {
      const item = { ...e };
      item.id = type === "gloss" ? glossId(item, readingId) : L.entryId(item, readingId);
      let n = 2; const base = item.id;
      while (list.some(x => x.id === item.id)) item.id = `${base}-${n++}`;
      list.push(item);
      touched.push(item.id);
    }
  }
  let glossaryTouched = 0;
  for (const g of glossary) { const i = out.glossary.findIndex(x => x.term === g.term); if (i >= 0) out.glossary[i] = { ...out.glossary[i], ...g }; else out.glossary.push(g); glossaryTouched++; }
  for (const id of remove) { r.commentary = r.commentary.filter(x => x.id !== id); r.glosses = r.glosses.filter(x => x.id !== id); }
  return { sheet: out, touched, glossaryTouched };
}

/** The citation gate's problems for the touched entries, keyed by id ([] when clean). */
export function validateEntries(sheet, readingId, ids, { biblio = null } = {}) {
  const view = L.readingView(sheet, readingId);
  const problems = gate(view, biblio);
  const r = readingOf(sheet, readingId);
  const out = new Map();
  for (const id of ids) {
    const e = (r.commentary || []).find(x => x.id === id);
    if (!e) { out.set(id, []); continue; }   // a gloss: lint covers it
    const where = `${e.chapter ? e.chapter + ":" : ""}${e.verse} ${e.source}`;
    out.set(id, problems.filter(p => p.endsWith(where) || p.includes(`(${where})`)));
  }
  return out;
}

/** Ask Sefaria whether each ref resolves (one call per distinct ref): ok / missing / unknown (could not ask). */
export async function verifyRefs(refs, { fetchImpl = globalThis.fetch } = {}) {
  const out = new Map();
  for (const ref of refs) {
    if (!ref || out.has(ref)) continue;
    try {
      const res = await fetchImpl(`https://www.sefaria.org/api/v3/texts/${encodeURIComponent(ref)}?return_format=default`, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(8000) });
      if (res.status === 404 || res.status === 400) { out.set(ref, "missing"); continue; }
      if (!res.ok) { out.set(ref, "unknown"); continue; }
      const j = await res.json().catch(() => null);
      out.set(ref, j && !j.error && Array.isArray(j.versions) && j.versions.length ? "ok" : "missing");
    } catch { out.set(ref, "unknown"); }
  }
  return out;
}

const PATCHABLE = ["openingNote", "glossary", "nextWeek", "credits", "highlights", "places", "mapRegion", "timeline"];
/** JSON-merge the allowed keys (objects merge one level, lists and scalars replace) and each reading's incipit. */
export function applyPatch(sheet, patch) {
  const out = clone(sheet), changed = [];
  for (const [k, v] of Object.entries(patch || {})) {
    if (k === "readings") {
      for (const [id, rp] of Object.entries(v || {})) {
        const r = readingOf(out, id);
        for (const [rk, rv] of Object.entries(rp || {})) { if (rk !== "incipit") throw new Error(`readings.${id}.${rk}: only incipit can be patched on a reading`); r.incipit = { ...(r.incipit || {}), ...rv }; changed.push(`readings.${id}.incipit`); }
      }
      continue;
    }
    if (!PATCHABLE.includes(k)) throw new Error(`${k} cannot be patched; use save_entries for entries and glosses`);
    out[k] = v && typeof v === "object" && !Array.isArray(v) && out[k] && typeof out[k] === "object" && !Array.isArray(out[k]) ? { ...out[k], ...v } : v;
    changed.push(k);
  }
  return { sheet: out, changed };
}

/** status "rejected" or null on commentary entries and glosses, by id, in any reading. */
export function setStatuses(sheet, ids, status) {
  const out = clone(sheet); let changed = 0;
  for (const id of ids) {
    const item = L.readings(out).flatMap(r => [...(r.commentary || []), ...(r.glosses || [])]).find(x => x.id === id);
    if (!item) throw new Error(`no entry ${id} in this sheet`);
    if (status) item.status = status; else delete item.status;
    changed++;
  }
  return { sheet: out, changed };
}
