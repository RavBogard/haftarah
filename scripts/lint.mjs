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
 *   - masculine God-language (He/His/Him/Himself/Lord/King/Father) in anything written for the sheet
 *   - word counts: commentary 25–120, historians 60–130, glosses 12–35
 */
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

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

export function lint(data, { voices = {} } = {}) {
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

  return { errors, warnings, fixes };
}

export function applyFixes(data, fixes) {
  for (const f of fixes) if (data.glosses?.[f.index]?.[f.field] === f.from) data.glosses[f.index][f.field] = f.to;
  return data;
}

export const formatLint = list => list.map(x => `  - ${x.where}: ${x.msg}`).join("\n");

/**
 * Lint a sheet of either schema: its primary reading, through readingView. With fix, the gloss fixes
 * are written into `file` itself (the view shares the reading's glosses).
 */
export function lintSheet(file, { voices = {}, fix = false } = {}) {
  const view = L.readingView(file);
  const r = lint(view, { voices });
  if (fix && r.fixes.length) applyFixes(view, r.fixes);
  return r;
}

export async function loadVoices() {
  return JSON.parse(await readFile(join(ROOT, "template", "voices.json"), "utf8"));
}

async function main() {
  const dirArg = process.argv.slice(2).find(a => !a.startsWith("--"));
  if (!dirArg) { console.error("usage: node scripts/lint.mjs weeks/<slug> [--fix]"); process.exit(1); }
  const sheetPath = join(resolve(dirArg), "sheet.json");
  const raw = await readFile(sheetPath, "utf8");
  const data = JSON.parse(raw);
  const fix = process.argv.includes("--fix");
  const r = lintSheet(data, { voices: await loadVoices(), fix });
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
