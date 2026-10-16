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

/** The citation gate's problems for the touched entries, keyed by id ([] when clean). Each entry is gated alone. */
export function validateEntries(sheet, readingId, ids, { biblio = null } = {}) {
  const view = L.readingView(sheet, readingId);
  const r = readingOf(sheet, readingId);
  const out = new Map();
  for (const id of ids) {
    const e = (r.commentary || []).find(x => x.id === id);
    if (!e) { out.set(id, []); continue; }   // a gloss: lint covers it
    const { status, ...alone } = e;   // a rejected entry is still checked when it is saved
    out.set(id, gate({ ...view, commentary: [alone] }, biblio).filter(p => p !== "incipit.en is empty"));   // the incipit is the reading's, not the entry's
  }
  return out;
}

/**
 * Ask Sefaria whether each ref resolves (one call per distinct ref, four at a time, 8 seconds each, all of
 * them within `deadlineMs`): ok / missing / unknown (could not ask, or no answer by the deadline).
 */
export async function verifyRefs(refs, { fetchImpl = globalThis.fetch, deadlineMs = 20_000, concurrency = 4 } = {}) {
  const todo = [...new Set(refs.filter(Boolean))];
  const out = new Map(todo.map(ref => [ref, "unknown"]));
  const deadline = AbortSignal.timeout(deadlineMs);
  const ask = async ref => {
    const res = await fetchImpl(`https://www.sefaria.org/api/v3/texts/${encodeURIComponent(ref)}?return_format=default`, { headers: { accept: "application/json" }, signal: AbortSignal.any([AbortSignal.timeout(8000), deadline]) });
    if (res.status === 404 || res.status === 400) return "missing";
    if (!res.ok) return "unknown";
    const j = await res.json();   // a body that fails or times out is "unknown" (the catch below), not "missing"
    return j && !j.error && Array.isArray(j.versions) && j.versions.length ? "ok" : "missing";
  };
  let next = 0;
  const worker = async () => { while (next < todo.length && !deadline.aborted) { const ref = todo[next++]; try { out.set(ref, await ask(ref)); } catch { out.set(ref, "unknown"); } } };
  let timer;
  const stop = new Promise(res => { timer = setTimeout(res, deadlineMs); });
  await Promise.race([Promise.all(Array.from({ length: Math.min(concurrency, todo.length) }, worker)), stop]);
  clearTimeout(timer);
  return new Map(out);   // a copy: an answer arriving after the deadline changes nothing
}

const isObj = v => !!v && typeof v === "object" && !Array.isArray(v);
const isList = v => Array.isArray(v);
// Each patchable key and the shape its value must have.
const SHAPES = {
  openingNote: [isObj, "an object"], credits: [isObj, "an object"], nextWeek: [v => v === null || isObj(v), "an object or null"],
  glossary: [isList, "a list"], highlights: [isList, "a list"], places: [isList, "a list"], timeline: [isList, "a list"],
  mapRegion: [v => v === null || typeof v === "string" || (isList(v) && v.length === 4 && v.every(n => typeof n === "number" && Number.isFinite(n))), "a string, a list of four numbers, or null"],
};
const PATCHABLE = Object.keys(SHAPES);
/** JSON-merge the allowed keys (objects merge one level, lists and scalars replace) and each reading's incipit. */
export function applyPatch(sheet, patch) {
  const out = clone(sheet), changed = [];
  for (const [k, v] of Object.entries(patch || {})) {
    if (k === "readings") {
      for (const [id, rp] of Object.entries(v || {})) {
        const r = readingOf(out, id);
        for (const [rk, rv] of Object.entries(rp || {})) {
          if (rk !== "incipit") throw new Error(`readings.${id}.${rk}: only incipit can be patched on a reading`);
          if (!isObj(rv)) throw new Error(`readings.${id}.incipit: incipit must be an object`);
          r.incipit = { ...(r.incipit || {}), ...rv }; changed.push(`readings.${id}.incipit`);
        }
      }
      continue;
    }
    if (!PATCHABLE.includes(k)) throw new Error(`${k} cannot be patched; use save_entries for entries and glosses`);
    if (!SHAPES[k][0](v)) throw new Error(`${k} must be ${SHAPES[k][1]}`);
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
