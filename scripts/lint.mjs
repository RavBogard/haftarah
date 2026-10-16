#!/usr/bin/env node
/**
 * lint.mjs — check a week's entries before anything renders. build.mjs runs it after the citation
 * gate: errors stop the build and name the entry; warnings print and the build goes on.
 *
 *   node scripts/lint.mjs weeks/<slug>          # report
 *   node scripts/lint.mjs weeks/<slug> --fix    # also rewrite gloss lemmas to the exact verse text
 *
 * Checks (citation rules stay in build.mjs's gate):
 *   - a gloss's Hebrew lemma occurs in its verse (error if not at all; warning, fixable, when it
 *     matches only after normalizing mark order, accents, meteg, or by consonants)
 *   - a gloss's English anchor occurs in its verse's English (error if not)
 *   - a gloss anchor that overlaps or touches a JPS note marker (two keys would stack)
 *   - a named source with no line in template/voices.json
 *   - more entries in a reading than customs.entryCap (warning, with the count by register)
 *   - masculine God-language (He/His/Him/Himself/Lord/King/Father) in anything written for the sheet
 *   - word counts: commentary 25–120, historians 60–130, glosses 12–35
 *   - an entry carried from last year's sheet (status "carried"), so it is kept or cut on purpose
 *   - a schema-3 entry with no id (carry-forward and the web's links depend on ids)
 */
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { loadCustoms } from "./customs.mjs";

const L = createRequire(import.meta.url)("../template/lib.js");
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export const WORD_LIMITS = { commentary: [25, 120], critical: [60, 130], gloss: [12, 35] };

const visible = x => x && x.status !== "rejected";
const plain = html => L.plainText(html).text.trim();
export const wordCount = html => plain(html).split(/\s+/).filter(w => /[\p{L}\p{N}]/u.test(w)).length;
const vref = x => `${x.chapter != null ? x.chapter + ":" : ""}${x.verse}`;
const findVerse = (data, x) => (data.verses || []).find(v => v.verse === x.verse && (x.chapter == null || v.chapter === x.chapter));

// Capitalized pronouns and titles for God. Heuristic: a pronoun or title that opens a sentence (or
// a quotation) is skipped, since that is how a human "He" usually appears; "King David", "Father
// Abraham" (a title before a name) are skipped. Everything else is reported with its context.
const GOD_WORDS = /\b(He|His|Him|Himself|Lord|LORD|King|Father)\b/g;
export function godLanguage(html) {
  const text = plain(html);
  const hits = [];
  for (const m of text.matchAll(GOD_WORDS)) {
    const before = text.slice(0, m.index).replace(/\s+$/, "");
    const after = text.slice(m.index + m[0].length);
    const sentenceStart = !before || /[.!?:;]["'”’)]*$|["“‘(]$/.test(before);
    if (sentenceStart && m[0] !== "Lord" && m[0] !== "LORD" && m[0] !== "Himself") continue;
    if ((m[0] === "King" || m[0] === "Father") && /^ [A-Z][a-z]/.test(after)) continue;
    const a = Math.max(0, m.index - 30), b = Math.min(text.length, m.index + m[0].length + 30);
    hits.push({ word: m[0], snippet: (a ? "…" : "") + text.slice(a, b) + (b < text.length ? "…" : "") });
  }
  return hits;
}

export function lint(data, { voices = {}, basemap = null } = {}) {
  const errors = [], warnings = [], fixes = [];
  const err = (where, msg) => errors.push({ where, msg });
  const warn = (where, msg) => warnings.push({ where, msg });

  // ---- glosses ----
  (data.glosses || []).forEach((g, gi) => {
    if (!visible(g)) return;
    const where = `gloss ${vref(g)} ${g.lemma || "(no lemma)"}`;
    const v = findVerse(data, g);
    if (!v) { err(where, `no verse ${vref(g)} in this reading`); return; }
    if (g.lemma) {
      const hit = L.findHebrew(v.he, g.lemma);
      if (!hit) err(where, `Hebrew lemma not found in ${vref(v)}, even ignoring mark order, accents and vowels`);
      else if (hit.level !== "exact") {
        const why = hit.level === "normalized" ? "marks in a different order, or accents/meteg differ" : "same letters, different pointing";
        warn(where, `Hebrew lemma is not the verse's exact text (${why}); use “${hit.text}” (--fix)`);
        fixes.push({ index: gi, field: "lemma", from: g.lemma, to: hit.text });
      }
    }
    const words = wordCount(g.text);
    const [lo, hi] = WORD_LIMITS.gloss;
    if (words < lo || words > hi) warn(where, `${words} words (gloss ${lo}–${hi})`);
    if (!g.en) return;
    const en = L.findEnglish(v.en, g.en);
    if (!en) { err(where, `English anchor “${g.en}” not found in ${vref(v)}`); return; }
    // The gloss key goes right after its anchor. A JPS marker at that spot (or inside the anchor)
    // sets two letters together: "carbuncles^d^e".
    const p = L.plainText(v.en);
    for (const s of p.sups) {
      const inside = s.pos > en.pStart && s.pos < en.pEnd;
      const atEnd = s.pos >= en.pEnd && /^[,.;:!?"'’”)—–-]{0,2}$/.test(p.text.slice(en.pEnd, s.pos));
      if (inside || atEnd) warn(where, `English anchor “${g.en}” ${inside ? "contains" : "ends at"} JPS note ${s.key}; the two keys would stack`);
    }
    for (const n of v.notes || []) {
      if (!n.lemma) continue;
      const nh = L.findEnglish(v.en, n.lemma);
      if (nh && nh.pStart < en.pEnd && en.pStart < nh.pEnd && !p.sups.some(s => s.key === n.marker && (s.pos >= en.pStart && s.pos <= en.pEnd)))
        warn(where, `English anchor “${g.en}” overlaps JPS note ${n.marker} (“${n.lemma}”)`);
    }
  });

  // ---- commentary ----
  for (const e of (data.commentary || []).filter(visible)) {
    const where = `commentary ${vref(e)} ${e.source}`;
    const crit = e.register === "critical";
    const [lo, hi] = crit ? WORD_LIMITS.critical : WORD_LIMITS.commentary;
    const words = wordCount(e.text);
    if (words < lo || words > hi) warn(where, `${words} words (${crit ? "historians" : "commentary"} ${lo}–${hi})`);
    if (!crit && e.register !== "reference" && !L.voiceKey(e.source, voices))
      warn(where, `no identification in template/voices.json for “${e.source}” (the front page prints the name alone)`);
    for (const h of godLanguage(e.text)) warn(where, `God-language “${h.word}”: ${h.snippet}`);
    if (e.status === "carried") warn(where, `carried from ${e.carried || "an earlier sheet"}; it prints unless its status is set to "rejected"`);
  }

  // ---- God-language in everything else written for the sheet ----
  for (const g of (data.glosses || []).filter(visible))
    for (const h of godLanguage(g.text)) warn(`gloss ${vref(g)} ${g.lemma}`, `God-language “${h.word}”: ${h.snippet}`);
  for (const t of (data.glossary || []).filter(visible))
    for (const h of godLanguage(t.text)) warn(`glossary ${t.term}`, `God-language “${h.word}”: ${h.snippet}`);
  const on = data.openingNote || {};
  for (const [k, val] of [["calendar", on.calendar], ["setting", on.setting]])
    for (const para of [].concat(val || []))
      for (const h of godLanguage(para)) warn(`openingNote.${k}`, `God-language “${h.word}”: ${h.snippet}`);

  // ---- the figures: a crowded map, a label too long for its bar, a band taller than its space ----
  const places = Array.isArray(data.places) ? data.places : [];
  if (places.length > 12) warn("places", `${places.length} places; more than 12 labels crowd the map`);
  // A place beyond the basemap is never drawn (the automatic region stops at the basemap's box), and a map
  // with no place inside its frame draws nothing at all.
  if (places.length && basemap) {
    const located = places.filter(p => p && Number.isFinite(p.lat) && Number.isFinite(p.lon));
    const inside = (p, b) => p.lon >= b[0] && p.lon <= b[2] && p.lat >= b[1] && p.lat <= b[3];
    if (Array.isArray(basemap.box)) for (const p of located) if (!inside(p, basemap.box)) warn("places", `${p.name || p.id} lies outside the basemap and is left off the map`);
    const frame = L.mapFrame(places, data.mapRegion ?? null, basemap);
    if (!located.some(p => inside(p, frame))) warn("places", "places given but none inside the map");
  }
  const timeline = Array.isArray(data.timeline) ? data.timeline : [];
  for (const it of timeline)
    if (it && typeof it.label === "string" && it.label.length > 28) warn(`timeline ${it.id}`, `label is ${it.label.length} characters; keep it under 28 so it fits its bar`);
  if (timeline.length > 14) warn("timeline", `${timeline.length} items; more than 14 rows make the band taller than its space`);

  return { errors, warnings, fixes };
}

export function applyFixes(data, fixes) {
  for (const f of fixes) if (data.glosses?.[f.index]?.[f.field] === f.from) data.glosses[f.index][f.field] = f.to;
  return data;
}

export const formatLint = list => list.map(x => `  - ${x.where}: ${x.msg}`).join("\n");

/** A reading's printed entries by register (rejected ones left out; an unknown register is traditional, as it prints). */
export function entryCounts(reading) {
  const out = { total: 0, traditional: 0, modern: 0, critical: 0, reference: 0 };
  for (const e of (reading.commentary || []).filter(visible)) {
    out.total++;
    out[L.SIGLA[e.register] ? e.register : "traditional"]++;
  }
  return out;
}

/**
 * Lint a sheet of either schema: every reading that has verses (or the ids in `only`), each through
 * readingView. When the week has more than one reading, every message names its reading. Above
 * customs.entryCap a reading gets a warning with its count by register; the cap never stops a build.
 * With fix, the gloss fixes are written into `file` itself (each view shares its reading's glosses).
 */
export function lintSheet(file, { voices = {}, fix = false, customs = null, only = null, basemap = null } = {}) {
  const all = L.readings(file).filter(r => (r.verses || []).length);
  const multi = all.length > 1;
  const out = { errors: [], warnings: [], fixes: [], counts: [] };
  for (const r of all) {
    if (only && !only.includes(r.id)) continue;
    const view = L.readingView(file, r.id);
    const res = lint(view, { voices, basemap });
    const tag = x => (multi ? { ...x, where: `${r.id}: ${x.where}` } : x);
    // readingView drops ids, so a missing one is seen here, on the reading's own entries.
    if (Number(file.schema) >= 3)
      for (const e of (r.commentary || []).filter(visible).filter(e => !e.id))
        res.warnings.push({ where: `commentary ${vref(e)} ${e.source}`, msg: "has no id (run node scripts/migrate.mjs --to 3 or fetch again)" });
    out.errors.push(...res.errors.map(tag));
    out.warnings.push(...res.warnings.map(tag));
    if (fix && res.fixes.length) applyFixes(view, res.fixes);
    out.fixes.push(...res.fixes.map(f => (multi ? { ...f, reading: r.id } : f)));
    const c = entryCounts(r);
    const cap = customs && customs.entryCap ? customs.entryCap : null;
    out.counts.push({ reading: r.id, total: c.total, cap, traditional: c.traditional, modern: c.modern, critical: c.critical, reference: c.reference });
    if (cap && c.total > cap) out.warnings.push({ where: r.id, msg: `${c.total} entries, over the cap of ${cap} (${L.REGISTER_ORDER.map(k => `${k} ${c[k]}`).join(", ")})` });
  }
  return out;
}

export async function loadVoices() {
  return JSON.parse(await readFile(join(ROOT, "template", "voices.json"), "utf8"));
}

/** data/geo/basemap.json (read only, no gazetteer) when the week has places, else null; a missing file is null (the gate reports it). */
export async function loadBasemap(file, root = ROOT) {
  if (!(Array.isArray(file.places) && file.places.length)) return null;
  try { return JSON.parse(await readFile(join(root, "data", "geo", "basemap.json"), "utf8")); } catch { return null; }
}

async function main() {
  const args = process.argv.slice(2);
  const dirArg = args.find((a, i) => !a.startsWith("--") && args[i - 1] !== "--customs");
  if (!dirArg) { console.error("usage: node scripts/lint.mjs weeks/<slug> [--fix] [--customs <id>]"); process.exit(1); }
  const sheetPath = join(resolve(dirArg), "sheet.json");
  const raw = await readFile(sheetPath, "utf8");
  const data = JSON.parse(raw);
  const fix = process.argv.includes("--fix");
  const ci = process.argv.indexOf("--customs");
  const customs = await loadCustoms(ci > 0 ? process.argv[ci + 1] : "crc");
  const r = lintSheet(data, { voices: await loadVoices(), fix, customs, basemap: await loadBasemap(data) });
  for (const c of r.counts) console.log(`${c.reading}: ${c.total} entries (cap ${c.cap}): ${L.REGISTER_ORDER.map(k => `${k} ${c[k]}`).join(", ")}`);
  if (r.errors.length) console.error(`Lint errors:\n${formatLint(r.errors)}`);
  if (r.warnings.length) console.warn(`Lint warnings:\n${formatLint(r.warnings)}`);
  if (fix && r.fixes.length) {
    const indent = (raw.match(/^\{\r?\n([ \t]+)/) || [, "  "])[1];
    await writeFile(sheetPath, JSON.stringify(data, null, indent) + (raw.endsWith("\n") ? "\n" : ""), "utf8");
    console.log(`Fixed ${r.fixes.length} gloss lemma${r.fixes.length === 1 ? "" : "s"} in ${sheetPath}`);
  }
  if (!r.errors.length && !r.warnings.length) console.log("Lint clean.");
  process.exit(r.errors.length ? 1 : 0);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) main().catch(err => { console.error(err.message || err); process.exit(1); });
