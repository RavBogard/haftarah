#!/usr/bin/env node
/**
 * digest.mjs — a one-page overview of what Sefaria has on the week's passage.
 *
 *   node scripts/digest.mjs weeks/<slug>
 *
 * Reads texts.json and candidates.json (and texts-torah.json and candidates-torah.json when the week
 * has a Torah selection), prints the overview and writes weeks/<slug>/digest.md: the Torah calendar
 * (Hebcal's aliyot and the selection), then one digest per reading, Torah first. Per verse: which core commentators have text there (section-filed
 * comments named), and the Talmud, midrash, liturgy, Targum and Zohar refs anchored there with the
 * opening words of each. Reference works, quoting commentaries, "Sources and References" indexes and
 * Kabbalah other than the Zohar are dropped; Chasidut, Musar and the rest of the long tail are
 * counted on one line at the end.
 *
 * Dependency-free: Node 18+.
 */

import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { READING_FILES, PRIOR_FILE } from "./week-files.mjs";
import { aliyotMarkdown } from "./leyning.mjs";
import { lastTimeMarkdown } from "./prior.mjs";

const L = createRequire(import.meta.url)("../template/lib.js");

const OPENING_CHARS = 100;
const OPENINGS_PER_VERSE = 6;
const ALSO_PER_VERSE = 5;

// What the digest does with a source Sefaria links to the passage.
//   "list"  per verse, with its opening   "also"  per verse, ref only
//   "end"   one line at the end           "tail"  counted at the end   "drop"  not mentioned
export function classify(source, category, book) {
  if (category === "Reference" || category === "Quoting Commentary") return "drop";
  if (/^Sources and References on/.test(source)) return "drop";
  if (category === "Kabbalah") return /^Zohar( Chadash)?$/.test(source) ? "also" : "drop";
  if (category === "Talmud" || category === "Mishnah" || category === "Tosefta" || category === "Liturgy" || category === "Targum") return "list";
  if (category === "Midrash") return /^Ein Yaakov/.test(source) ? "also" : "list";
  if (category === "Halakhah") return /^(Mishneh Torah|Shulchan Arukh|Tur\b|Arukh HaShulchan|Kitzur Shulchan Arukh|Abudarham|Mishnah Berurah)/.test(source) ? "end" : "tail";
  if (category === "Commentary" && book && source.endsWith(` on ${book}`)) return "commentator";
  return "tail";
}

const ENTITIES = { "&nbsp;": " ", "&amp;": "&", "&quot;": '"', "&#39;": "'", "&lt;": "<", "&gt;": ">", "&thinsp;": " " };

// Plain-text opening of a Sefaria text (string or nested array of strings), about n characters.
export function opening(text, n = OPENING_CHARS) {
  const flat = Array.isArray(text) ? text.flat(Infinity).filter(Boolean).join(" ") : String(text || "");
  let s = flat
    .replace(/<sup[^>]*>.*?<\/sup>\s*<i class="footnote">[\s\S]*?<\/i>/g, "")
    .replace(/<sup[^>]*>.*?<\/sup>/g, "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&[a-z#0-9]+;/gi, m => ENTITIES[m] ?? " ")
    .replace(/\s+/g, " ")
    .trim();
  if (s.length <= n) return s;
  s = s.slice(0, n);
  const cut = s.lastIndexOf(" ");
  return (cut > n * 0.6 ? s.slice(0, cut) : s).replace(/[\s,;:.—–-]+$/, "") + "…";
}

// English opening when there is an English version (skipping ones marked as another language, e.g. "[hu]"), else Hebrew.
export function englishOpening(entry, n = OPENING_CHARS) {
  const en = (entry.en || []).find(v => !/\[[a-z]{2}\]/.test(v.versionTitle || "")) || null;
  if (en && opening(en.text, n)) return opening(en.text, n);
  const he = opening(entry.he, n);
  return he ? `(Hebrew) ${he}` : "";
}

const cv = ref => (String(ref).match(/(\d+:\d+)(?:[-–](\d+(?::\d+)?))?\s*$/) || [])[0] || String(ref);
const shortName = index => index.replace(/ on .*$/, "");

const CLASSIC_MIDRASH = /(Rabbah\b|Tanchuma|Pesikta|Mekhilta|Sifrei (Devarim|Bamidbar)|^Sifra|Pirkei DeRabbi Eliezer|Tanna DeBei Eliyahu|Midrash Tehillim|Midrash Mishlei|Midrash Shmuel|Yalkut Shimoni|Aggadat Bereshit|Seder Olam|Midrash Tannaim)/;
const KIND_ORDER = { Talmud: 1, Mishnah: 1, Tosefta: 1, Liturgy: 2, Targum: 2, Midrash: 3, "Later midrash": 4, "Ein Yaakov": 5, Zohar: 6 };
const kindOf = (source, category) => category === "Kabbalah" ? "Zohar"
  : category === "Midrash" ? (/^Ein Yaakov/.test(source) ? "Ein Yaakov" : CLASSIC_MIDRASH.test(source) ? "Midrash" : "Later midrash")
  : category;

// texts.json (+ candidates.json for the tail) -> markdown.
export function buildDigest({ texts, candidates, book, verses: sheetVerses }) {
  book = book || (texts?.verses?.[0] || "").replace(/\s+\d.*$/, "") || (candidates?.ref || "").replace(/\s+\d.*$/, "");
  const ref = texts?.ref || candidates?.ref || "";
  const verses = texts?.verses?.length ? texts.verses : sheetVerses?.length ? sheetVerses : verseListFromCandidates(candidates);
  const perVerse = new Map(verses.map(v => [v, { listed: [], also: [] }]));
  const firstVerse = anchors => (anchors || []).map(a => `${book} ${cv(a).replace(/[-–].*$/, "")}`).find(a => perVerse.has(a));

  // Linked texts.
  const seen = new Set();
  const endLines = [];
  const place = (r, source, category, anchors, text) => {
    if (seen.has(r)) return;
    seen.add(r);
    let how = classify(source, category, book);
    if (how === "drop" || how === "tail" || how === "commentator") return;
    if (kindOf(source, category) === "Later midrash") how = "also";
    if (how === "end") { endLines.push(r); return; }
    const v = firstVerse(anchors);
    if (!v) return;
    const others = (anchors || []).map(cv).filter(a => `${book} ${a}` !== v);
    const item = { ref: r, kind: kindOf(source, category), others, text };
    (how === "list" && text !== null ? perVerse.get(v).listed : perVerse.get(v).also).push(item);
  };
  for (const [r, e] of Object.entries(texts?.linked || {})) place(r, e.source, e.category, e.anchors, englishOpening(e));
  for (const e of texts?.notFetched?.linkedOverCap || []) place(e.ref, e.source, e.category || (e.kind === "Zohar" ? "Kabbalah" : e.kind), e.anchors, null);
  for (const r of texts?.notFetched?.linkedOverBudget || []) seen.add(r);

  // Without texts.json, fall back to candidates: refs of single-verse groups go to that verse.
  if (!texts && candidates) {
    for (const g of candidates.sources || []) {
      const how = classify(g.source, g.category, book);
      if (how !== "list" && how !== "also") continue;
      for (const r of g.refs || []) place(r, g.source, g.category, g.verses.length === 1 ? g.verses : [], null);
    }
  }

  // Commentators per verse.
  const coms = Object.values(texts?.commentaries || {});
  const core = coms.filter(c => c.core).map(c => c.index);
  const extra = coms.filter(c => !c.core).map(c => c.index);
  const has = new Map(verses.map(v => [v, new Map()]));
  for (const c of coms) {
    for (const s of Object.values(c.segments)) {
      if (!has.has(s.verse)) continue;
      if (!has.get(s.verse).has(c.index)) has.get(s.verse).set(c.index, s.sectionFiled ? `${cv(s.coversFrom)}–${cv(s.coversTo).split(":")[1]}` : "");
    }
    for (const [v, segRef] of Object.entries(c.coverage || {})) if (has.has(v) && !has.get(v).has(c.index)) has.get(v).set(c.index, `via ${cv(segRef)}`);
  }
  if (!texts && candidates) {
    for (const g of candidates.sources || []) if (classify(g.source, g.category, book) === "commentator") {
      (g.verses || []).forEach(v => has.get(v)?.set(g.source, ""));
      core.push(g.source);
    }
  }

  const out = [];
  out.push(`# ${ref}: digest`);
  const sectionFiled = coms.filter(c => Object.values(c.segments).some(s => s.sectionFiled));
  const head = [];
  if (texts) head.push(`${coms.length} commentaries and ${Object.keys(texts.linked || {}).length} linked texts in texts.json`);
  else head.push("texts.json missing: refs from candidates.json, no openings");
  for (const c of sectionFiled) {
    const blocks = [...new Set(Object.values(c.segments).filter(s => s.sectionFiled).map(s => `${cv(s.coversFrom)}–${cv(s.coversTo).split(":")[1]}`))];
    head.push(`${shortName(c.index)} files by section (${blocks.join(", ")}): read the block, not the verse`);
  }
  if (texts?.notFetched?.commentaries?.length) head.push(`Not on Sefaria: ${texts.notFetched.commentaries.map(shortName).join(", ")}`);
  out.push(head.join(". ") + ".");
  if (core.length) out.push(`Core: ${core.map(shortName).join(", ")}.${extra.length ? ` Also on file: ${extra.map(shortName).join(", ")}.` : ""}`);

  for (const v of verses) {
    const slot = perVerse.get(v);
    const h = has.get(v) || new Map();
    out.push("", `## ${cv(v)}`);
    const present = core.filter(c => h.has(c));
    const missing = core.filter(c => !h.has(c));
    const label = c => { const x = h.get(c); return x ? `${shortName(c)} (${x.startsWith("via") ? x : `block ${x}`})` : shortName(c); };
    let line;
    if (!core.length) line = "none on file";
    else if (!missing.length && core.length >= 3) line = "all core";
    else if (missing.length && missing.length <= present.length && core.length >= 3) line = `all core but ${missing.map(shortName).join(", ")}`;
    else line = present.length ? present.map(shortName).join(", ") : "no core commentator";
    const notes = present.filter(c => h.get(c)).map(label);
    const extras = extra.filter(c => h.has(c)).map(label);
    out.push(`Commentators: ${line}${notes.length ? `; ${notes.join("; ")}` : ""}${extras.length ? `. Also ${extras.join(", ")}` : ""}.`);
    const listed = slot.listed.sort((a, b) => (KIND_ORDER[a.kind] || 9) - (KIND_ORDER[b.kind] || 9));
    for (const it of listed.slice(0, OPENINGS_PER_VERSE)) {
      out.push(`- ${it.kind} · ${it.ref}${it.others.length ? ` (also ${it.others.join(", ")})` : ""}${it.text ? `: ${it.text}` : ""}`);
    }
    const also = [...listed.slice(OPENINGS_PER_VERSE), ...slot.also.sort((a, b) => (KIND_ORDER[a.kind] || 9) - (KIND_ORDER[b.kind] || 9))];
    if (also.length) out.push(alsoLine(also));
  }

  // Unplaced refs (no anchor among the reading's verses).
  if (endLines.length) out.push("", `Halakhah: ${endLines.slice(0, ALSO_PER_VERSE).join("; ")}${endLines.length > ALSO_PER_VERSE ? `; +${endLines.length - ALSO_PER_VERSE} more` : ""}.`);

  // Long tail, counted.
  if (candidates) {
    const tail = new Map(), dropped = new Map();
    for (const g of candidates.sources || []) {
      const how = classify(g.source, g.category, book);
      const m = how === "tail" ? tail : how === "drop" ? dropped : null;
      if (!m) continue;
      const k = g.category || "Other";
      const x = m.get(k) || { works: 0, links: 0 };
      x.works++; x.links += g.count || 0;
      m.set(k, x);
    }
    const fmt = m => [...m.entries()].sort((a, b) => b[1].links - a[1].links).map(([k, x]) => `${k} ${x.works} (${x.links} links)`).join(", ");
    if (tail.size) out.push("", `Not listed: ${fmt(tail)}.`);
    if (dropped.size) out.push(`Dropped as noise: ${fmt(dropped)}.`);
  }
  return out.join("\n") + "\n";
}

// "Also: 9 Midrash, 3 Zohar. Bereshit Rabbah 26:6; ...; +8 more." Counts by kind, then the first few refs.
export function alsoLine(items, n = ALSO_PER_VERSE) {
  const counts = new Map();
  for (const it of items) counts.set(it.kind, (counts.get(it.kind) || 0) + 1);
  const head = items.length > n ? `${[...counts].map(([k, c]) => `${c} ${k}`).join(", ")}. ` : "";
  const refs = items.slice(0, n).map(it => it.ref).join("; ");
  return `Also: ${head}${refs}${items.length > n ? `; +${items.length - n} more` : ""}.`;
}

function verseListFromCandidates(candidates) {
  const all = new Set();
  for (const g of candidates?.sources || []) if (g.category === "Commentary" || g.category === "Targum") (g.verses || []).forEach(v => all.add(v));
  return [...all].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

async function readJSON(p) {
  try { return JSON.parse(await readFile(p, "utf8")); } catch { return null; }
}

// What the digest needs from sheet.json for one reading: the book and the verse refs, read through
// readingView so a schema-3 week gives the same answer as its schema-2 original. It never throws: a
// reading the sheet does not hold, or a sheet with none, says nothing, as no sheet does, and the
// digest falls back to texts.json's own verses.
export function digestInput(sheet, readingId = null) {
  let view = null;
  try {
    if (sheet && (!readingId || L.readings(sheet).some(r => r.id === readingId))) view = L.readingView(sheet, readingId || undefined);
  } catch { view = null; }
  return { book: view?.haftarah?.book, verses: (view?.verses || []).map(v => v.ref).filter(Boolean) };
}

/** The week's digest.md: the Torah calendar when the sheet has one, then a digest per reading, Torah first. */
export function weekDigest({ sheet, readings, prior = null }) {
  const parts = [];
  if (sheet && sheet.leyning) parts.push(aliyotMarkdown(sheet.leyning, L.readings(sheet).find(r => r.kind === "torah") || null));
  if (prior) parts.push(lastTimeMarkdown(prior, sheet));
  for (const kind of ["torah", "haftarah"]) {
    const x = readings[kind];
    if (!x || (!x.texts && !x.candidates)) continue;
    parts.push(buildDigest({ texts: x.texts, candidates: x.candidates, ...digestInput(sheet, kind) }));
  }
  return parts.join("\n");
}

/** digest.md for a week folder from its texts and candidates files; returns the markdown. Throws when there is nothing to digest. */
export async function writeDigest(dir) {
  const sheet = await readJSON(join(dir, "sheet.json"));
  const readings = {};
  for (const kind of ["torah", "haftarah"]) {
    const f = READING_FILES[kind];
    readings[kind] = { texts: await readJSON(join(dir, f.texts)), candidates: await readJSON(join(dir, f.candidates)) };
  }
  if (!Object.values(readings).some(x => x.texts || x.candidates)) throw new Error(`No texts.json or candidates.json in ${dir}; run fetch.mjs first.`);
  const md = weekDigest({ sheet, readings, prior: await readJSON(join(dir, PRIOR_FILE)) });
  await writeFile(join(dir, "digest.md"), md, "utf8");
  return md;
}

async function main() {
  const dir = process.argv[2];
  if (!dir) { console.error("usage: node scripts/digest.mjs weeks/<slug>"); process.exit(1); }
  process.stdout.write(await writeDigest(dir));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch(err => { console.error(err.message || err); process.exit(1); });
}
