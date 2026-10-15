#!/usr/bin/env node
/**
 * fetch.mjs — pull one week's readings (the Torah selection and the haftarah) from Hebcal and Sefaria and start a sheet data file.
 *
 *   node scripts/fetch.mjs                       # next Shabbat, on the calendar customs/crc.json names
 *   node scripts/fetch.mjs --date 2026-10-10     # a specific Shabbat
 *   node scripts/fetch.mjs --ref "Isaiah 42:5-43:10" --date 2026-10-10   # override the haftarah
 *   node scripts/fetch.mjs --torah-pick aliyah:1-2   # the Torah selection: aliyah:N[-M], aliyah:M, triennial, full
 *   node scripts/fetch.mjs --torah "Genesis 6:9-7:16" # ... or a range of Daniel's own
 *   node scripts/fetch.mjs --no-torah            # a haftarah-only week: no Torah reading, no aliyot list
 *   node scripts/fetch.mjs --out weeks            # output root (default: weeks)
 *   node scripts/fetch.mjs --known 2026-10-17-noach,2026-10-24-lech-lecha   # weeks that exist only in Drive
 *   node scripts/fetch.mjs --no-texts             # skip the texts files
 *   node scripts/fetch.mjs --customs crc          # whose customs (default crc: customs/crc.json)
 *   node scripts/fetch.mjs --no-carry             # do not copy last year's fitting entries in (by default they come in as status "carried", with "See also")
 *   node scripts/fetch.mjs --prior <dir>          # last year's week folder restored from Drive, instead of the web library
 *
 * Writes weeks/<slug>/sheet.json (schema 3: the Torah selection, when there is one, then the
 * haftarah; Hebcal's aliyot list in `leyning`), and per reading candidates.json / candidates-torah.json
 * (every commentary Sefaria links to the passage, grouped by source) and texts.json / texts-torah.json
 * (the core commentators chapter by chapter, and the linked Talmud, midrash, liturgy, Targum and Zohar
 * segments), each held under about 2 MB. Without a selection (CRC picks weekly) it prints the aliyot
 * for the briefing; run it again with the pick and the kept sheet.json gains its Torah reading. It
 * never otherwise overwrites an existing sheet.json; use --force to replace it. The candidates and
 * texts files are refreshed every run. Sefaria calls are retried (three tries, with backoff).
 * Every run writes prior.json: the latest earlier sheet for the same parashah (from the public
 * library, read-only, or --prior), or why there is none.
 *
 * Dependency-free: Node 18+ with global fetch.
 */

import { mkdir, writeFile, readFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defaultHaftarahFor } from "./rites.mjs";
import { createRequire } from "node:module";
import { loadCustoms } from "./customs.mjs";
import { leyningOf, parsePick, defaultPick, selectTorah, aliyotLines } from "./leyning.mjs";
import { migrate3 } from "./migrate.mjs";
import { READING_FILES, PRIOR_FILE } from "./week-files.mjs";
import { lookupPrior, applyPrior } from "./prior.mjs";
import { parashahKeysOf } from "../site/app/parashot.js";

const L = createRequire(import.meta.url)("../template/lib.js");

// Register lookup by Sefaria index title prefix. Anything not matched is
// reported as "unclassified" for the rabbi to place.
const REGISTERS = [
  [/^(Rashi|Rashbam|Bekhor Shor|Rabbeinu Bahya|Radak|Ralbag|Malbim|Metzudat David|Metzudat Zion|Abarbanel|Targum Jonathan|Targum|Ibn Ezra|Ramban|Sforno|Chizkuni|Marot HaTzoveot|Ahavat Yehonatan|Tze'enah Ure'enah|Maor VaShemesh|Tiferet Shlomo|Kli Yakar|Alshich|Or HaChaim|Siftei Chakhamim|Gur Aryeh|Rambam|Sefer HaShorashim|Machberet Menachem)/, "traditional"],
  [/^(Steinsaltz|Haamek Davar|Cassuto|The Early Prophets, by Everett Fox|Tribal Lands|Mishnat Eretz Yisrael|Da'at Mikra|Hirsch|Sacks|Netziv|Depths of Yonah|Peninei Halakhah)/, "modern"],
];

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const v = process.argv[i + 1];
  return v && !v.startsWith("--") ? v : true;
}

function nextShabbat(from = new Date()) {
  const d = new Date(Date.UTC(from.getFullYear(), from.getMonth(), from.getDate()));
  const add = (6 - d.getUTCDay() + 7) % 7;
  d.setUTCDate(d.getUTCDate() + add);
  return d.toISOString().slice(0, 10);
}

const HEADERS = { accept: "application/json", "user-agent": "crc-haftarah-sheet/1.0" };
const wait = ms => new Promise(r => setTimeout(r, ms));

/** fn(attempt), tried up to delays.length + 1 times; an error `retryable` refuses is thrown at once. */
export async function withRetry(fn, { delays = [1500, 4000], sleepImpl = wait, retryable = () => true } = {}) {
  for (let attempt = 0; ; attempt++) {
    try { return await fn(attempt); }
    catch (err) {
      if (attempt >= delays.length || !retryable(err)) throw err;
      await sleepImpl(delays[attempt]);
    }
  }
}

/** GET JSON; a network error, a 5xx or a 429 (too many requests) is retried, any other 4xx is not. */
export async function getJSON(url, { fetchImpl = globalThis.fetch, sleepImpl = wait } = {}) {
  return withRetry(async () => {
    const res = await fetchImpl(url, { headers: HEADERS });
    if (!res.ok) { const e = new Error(`${res.status} ${res.statusText} for ${url}`); e.status = res.status; throw e; }
    return res.json();
  }, { sleepImpl, retryable: e => e.status === 429 || !(e.status >= 400 && e.status < 500) });
}

/** Hebcal's leyning item for one date, on the customs' calendar (Diaspora: i=off). */
export const leyningUrl = (date, customs) => `https://www.hebcal.com/leyning?cfg=json&start=${date}&end=${date}&i=${customs.calendar.diaspora ? "off" : "on"}`;

function slugify(s) {
  return s.toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

// ---- Sefaria HTML cleanup ---------------------------------------------------

const BREAK_TRAIL_RE = /(?:&nbsp;|\s)*<span class="mam-spi-(samekh|pe)">\{[ספ]\}<\/span>(?:&nbsp;|\s|<br\s*\/?>)*$/;
const BREAK_MID_RE = /(?:&nbsp;|\s)*<span class="mam-spi-(samekh|pe)">\{[ספ]\}<\/span>(?:&nbsp;|\s|<br\s*\/?>)*/g;

export function cleanHebrew(html) {
  let brk = null;
  let out = html.replace(/(?:&nbsp;|\s)+$/g, "").replace(/(<br\s*\/?>\s*)+$/g, "").trim();
  // trailing marker = Masoretic paragraph break after this verse
  out = out.replace(BREAK_TRAIL_RE, (_, kind) => {
    brk = kind === "pe" ? "petuchah" : "setumah";
    return "";
  });
  // mid-verse marker (pisqa be'emtza pasuq) = visible gap inside the line
  out = out.replace(BREAK_MID_RE, ' <span class="pisqa"></span> ');
  // A MAM footnote inside the Hebrew (Genesis 7:11: a note on the spelling in other manuscripts) is
  // neither printed nor a word of the reading.
  out = out.replace(/<sup class="footnote-marker">[^<]*<\/sup>/g, "").replace(/<i class="footnote">(?:<i>.*?<\/i>|(?!<\/i>)[\s\S])*?<\/i>/g, "");
  out = out.replace(/<br\s*\/?>/g, " ").replace(/\s{2,}/g, " ").trim();
  return { he: out, break: brk };
}

// The note body may itself hold <i>…</i> (e.g. "Taking <i>pukh</i> as a byform…"), so match one level of nesting.
const FOOTNOTE_RE = /<sup class="footnote-marker">(.*?)<\/sup><i class="footnote">((?:<i>.*?<\/i>|(?!<\/i>)[\s\S])*?)<\/i>/g;

export function cleanEnglish(html) {
  const notes = [];
  let out = html.replace(FOOTNOTE_RE, (_, marker, body) => {
    let lemma = null;
    const m = body.match(/^<b>(.*?)\s*<\/b>\s*(.*)$/s);
    let text = body;
    if (m) { lemma = m[1].trim(); text = m[2].trim(); }
    notes.push({ marker: marker.trim(), lemma, text });
    return `<sup class="fn">${marker.trim()}</sup>`;
  });
  out = out.replace(/\s+/g, " ").trim();
  return { en: out, notes };
}

function flattenVerses(textArr, sections, toSections) {
  // Sefaria returns a flat array for one chapter, nested arrays across chapters.
  const startCh = Number(sections[0]), startV = Number(sections[1] ?? 1);
  const out = [];
  if (textArr.length && Array.isArray(textArr[0])) {
    textArr.forEach((chapter, ci) => {
      const ch = startCh + ci;
      const v0 = ci === 0 ? startV : 1;
      chapter.forEach((t, vi) => out.push({ chapter: ch, verse: v0 + vi, text: t }));
    });
  } else {
    textArr.forEach((t, vi) => out.push({ chapter: startCh, verse: startV + vi, text: t }));
  }
  return out;
}

function firstWords(he, n = 3) {
  const plain = he.replace(/<[^>]+>/g, "").replace(/&nbsp;|&thinsp;/g, " ").replace(/\{[ספ]\}/g, "").trim();
  return plain.split(/\s+/).filter(w => !/^[׀]$/.test(w)).slice(0, n).join(" ");
}

// Words a haftarah's name never ends on: the incipit stops before them.
const FUNCTION_WORDS = new Set(["לא", "כי", "אשר", "את", "על", "אל", "גם", "כן", "אם", "הנה", "עד", "מן", "כל", "בי", "לי", "לו", "יהוה"]);
// Disjunctive accents strong enough to end a phrase: etnachta, segolta, zaqef qatan and gadol, tipcha, revia, sof pasuq.
const PAUSE = /[֑֖֒֔֕֗׃]/;

// The words a haftarah is known by: two to four from the start of the first verse, ending at the
// first strong pause and never on a function word like לֹא.
export function incipitHe(he) {
  const words = firstWords(he, 6).split(" ").filter(Boolean);
  const out = [];
  for (const w of words) {
    if (out.length >= 2 && FUNCTION_WORDS.has(stripMarks(w).replace(/[־׃]/g, "").replace(/^ו/, ""))) break;
    out.push(w);
    if (out.length >= 2 && PAUSE.test(w)) break;
    if (out.length === 4) break;
  }
  return out.join(" ").replace(/[׃]$/, "");
}

// The JPS words for the incipit: the first line of poetry, or the prose up to the first clause
// break after three words. Footnote keys and markup are dropped; trailing punctuation too.
export function incipitEn(en) {
  const strip = s => s.replace(/<sup[^>]*>.*?<\/sup>/g, "").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
  const lines = String(en || "").split(/<br\s*\/?>/i).map(strip).filter(Boolean);
  if (!lines.length) return "";
  let s = lines[0];
  if (lines.length === 1) {
    const re = /[,;:.!?—]/g;
    let m;
    while ((m = re.exec(s))) if (s.slice(0, m.index).trim().split(/\s+/).length >= 3) { s = s.slice(0, m.index); break; }
  }
  return s.replace(/^[—–\-\s"“]+/, "").replace(/[\s,;:.!?—–"”]+$/, "");
}

function stripMarks(he) {
  // Remove nikud and te'amim for display titles.
  return he.normalize("NFD").replace(/[֑-ֽֿ-ׇ]/g, "").normalize("NFC");
}

// ---- texts.json: the commentary and linked texts themselves -------------------
//
// candidates.json lists what Sefaria links to the passage; texts.json holds the words, so drafting
// does not need a tool call per ref. Core commentators come chapter by chapter; Talmud, midrash,
// liturgy, Targum, Tosefta, Mishnah, top halakhah and Zohar come segment by segment.

export const CORE_COMMENTATORS = ["Rashi", "Radak", "Ibn Ezra", "Ralbag", "Malbim", "Metzudat David", "Metzudat Zion", "Abarbanel", "Shadal", "Steinsaltz", "Targum Jonathan"];
// The Torah's core list (torah-and-library.md section 3): the Torah draws five to seven times the
// commentary a haftarah does, so only these are fetched by chapter, in this order, and the last ones
// give way first when the file would pass its budget. Titles Sefaria lacks as "<X> on <Book>" are
// listed in notFetched, as for the haftarah.
export const TORAH_CORE = ["Rashi", "Ramban", "Ibn Ezra", "Sforno", "Rashbam", "Or HaChaim", "Kli Yakar", "Chizkuni", "Shadal", "Steinsaltz", "Haamek Davar", "Rabbeinu Bahya", "Bekhor Shor"];
// Set aside from the Torah's candidates: glosses on Rashi and the like, and quoting commentaries,
// which sort to the top by link count and bury the commentators (Mechokekei Yehudah alone: 646 links on Noach).
const SUPER_COMMENTARY = /^(Siftei Chakhamim|Mizrachi|Gur Aryeh|Divrei David|Be'er BaSadeh|Mechokekei Yehudah|Yahel Ohr|Nachalat Yaakov|Levush HaOrah|Imrei Shefer)/;
const TEXTS_BUDGET = 1.9 * 1024 * 1024; // bytes as written (JSON, indent 1); texts.json stays under ~2 MB
const SECTION_BLOCK_CHARS = 2500;       // one verse's comment this long that is followed by silent verses is a section
const SECTION_STYLE_MEAN = 800;         // a commentary averaging this much per commented verse...
const SECTION_STYLE_COVERAGE = 0.6;     // ...and commenting on fewer than this share of verses files by section

const CLASSIC_MIDRASH = /(Rabbah\b|Tanchuma|Pesikta|Mekhilta|Sifrei (Devarim|Bamidbar)|^Sifra|Pirkei DeRabbi Eliezer|Tanna DeBei Eliyahu|Midrash Tehillim|Midrash Mishlei|Midrash Shmuel|Yalkut Shimoni|Aggadat Bereshit|Seder Olam|Midrash Tannaim|Avot DeRabbi Natan)/;
const TOP_HALAKHAH = /^(Mishneh Torah|Shulchan Arukh|Tur\b|Arukh HaShulchan|Kitzur Shulchan Arukh|Abudarham|Mishnah Berurah|Sefer HaChinukh)/;

// Which linked texts to fetch, and in what order. Lower tier = fetched first and kept first when
// the size budget runs out.
export function linkTier(source, category) {
  if (category === "Talmud") return { tier: 1, cap: 60, label: "Talmud" };
  if (category === "Mishnah" || category === "Tosefta") return { tier: 1, cap: 20, label: category };
  if (category === "Midrash") {
    if (/^Ein Yaakov/.test(source)) return { tier: 4, cap: 20, label: "Midrash" }; // aggadah of the Talmud, a parallel
    return CLASSIC_MIDRASH.test(source) ? { tier: 2, cap: 200, label: "Midrash" } : { tier: 4, cap: 40, label: "Midrash" };
  }
  if (category === "Liturgy") return { tier: 3, cap: 30, label: "Liturgy" };
  if (category === "Targum") return { tier: 3, cap: 20, label: "Targum" };
  if (category === "Halakhah" && TOP_HALAKHAH.test(source)) return { tier: 4, cap: 15, label: "Halakhah" };
  if (category === "Kabbalah" && /^Zohar( Chadash)?$/.test(source)) return { tier: 5, cap: 25, label: "Zohar" };
  return null;
}

const verseOf = a => String(a).replace(/^.*?(\d+:\d+)(?:[-–]\S*)?$/, "$1");

// Raw Sefaria links -> the linked texts worth fetching: one entry per ref (anchors merged), capped
// per kind, in fetch order. Core commentaries (fetched by chapter) are left out.
export function selectLinked(links, skipIndexes = new Set()) {
  const byRef = new Map();
  for (const l of links) {
    const source = l.index_title || l.collectiveTitle?.en || l.ref.replace(/\s+\d.*$/, "");
    if (skipIndexes.has(source)) continue;
    const t = linkTier(source, l.category);
    if (!t) continue;
    const e = byRef.get(l.ref) || { ref: l.ref, source, category: l.category, kind: t.label, tier: t.tier, anchors: [] };
    const a = l.anchorRef;
    if (a && !e.anchors.includes(a)) e.anchors.push(a);
    byRef.set(l.ref, e);
  }
  const anchorKey = e => (e.anchors[0] || "").replace(/^\D+/, "").split(/[:\-]/).map(Number);
  const all = [...byRef.values()].sort((a, b) => {
    if (a.tier !== b.tier) return a.tier - b.tier;
    const [ac, av] = anchorKey(a), [bc, bv] = anchorKey(b);
    return (ac - bc) || (av - bv) || a.ref.localeCompare(b.ref, undefined, { numeric: true });
  });
  const used = new Map();
  const out = [], skipped = [];
  for (const e of all) {
    const cap = linkTier(e.source, e.category).cap;
    const n = used.get(e.kind + e.tier) || 0;
    if (n >= cap) { skipped.push(e); continue; }
    used.set(e.kind + e.tier, n + 1);
    out.push(e);
  }
  return { selected: out, skipped };
}

// One chapter of a commentary: which verses to keep and which comments are section-filed.
//   verseLens[v-1] = characters of comment on verse v (0 = silent)
//   rangeVerses    = the verses of this chapter that are in the reading
// A comment is section-filed when it is followed by silent verses and is long, or the commentary
// as a whole writes long comments on few verses (Abarbanel). Such a comment covers every silent
// verse after it. A section-filed comment just before the range is kept when it covers the range's
// first verse. Returns { keep: Map(verse -> {sectionFiled, coversFrom, coversTo}), coverage: Map(silentVerse -> verse) }.
export function planChapter(verseLens, rangeVerses) {
  const n = verseLens.length;
  const range = [...rangeVerses].filter(v => v >= 1 && v <= n).sort((a, b) => a - b);
  const keep = new Map(), coverage = new Map();
  if (!range.length) return { keep, coverage };
  const spoken = [];
  for (let v = 1; v <= n; v++) if (verseLens[v - 1] > 0) spoken.push(v);
  if (!spoken.length) return { keep, coverage };
  const mean = spoken.reduce((s, v) => s + verseLens[v - 1], 0) / spoken.length;
  const sectionStyle = spoken.length / n < SECTION_STYLE_COVERAGE && mean >= SECTION_STYLE_MEAN;
  const first = range[0], last = range[range.length - 1];
  const inRange = new Set(range);
  spoken.forEach((v, i) => {
    const coversTo = (spoken[i + 1] ?? n + 1) - 1;
    const section = coversTo > v && (sectionStyle || verseLens[v - 1] >= SECTION_BLOCK_CHARS);
    const reaches = section && v < first && coversTo >= first;
    if (!inRange.has(v) && !reaches) return;
    if (v > last) return;
    keep.set(v, section ? { sectionFiled: true, coversFrom: v, coversTo } : { sectionFiled: false });
    if (section) for (let u = v + 1; u <= coversTo; u++) if (inRange.has(u)) coverage.set(u, v);
  });
  return { keep, coverage };
}

const textLen = t => Array.isArray(t) ? t.reduce((s, x) => s + textLen(x), 0) : String(t || "").replace(/<[^>]+>/g, "").trim().length;
const rtrim = s => typeof s === "string" ? s.replace(/\s+$/, "") : s;

// One chapter's v3 response -> segments keyed by exact ref, plus coverage notes.
export function chapterSegments(tx, book, chapter, rangeVerses) {
  const index = tx.indexTitle;
  const heV = (tx.versions || []).find(v => v.languageFamilyName === "hebrew");
  const enVs = (tx.versions || []).filter(v => v.languageFamilyName === "english");
  if (!heV && !enVs.length) return { segments: {}, coverage: {} };
  const base = heV || enVs[0];
  const verseArr = i => (heV?.text?.[i] ?? null);
  const n = Math.max(heV?.text?.length || 0, ...enVs.map(v => v.text?.length || 0));
  const lens = [];
  for (let i = 0; i < n; i++) lens.push(Math.max(textLen(verseArr(i)), ...enVs.map(v => textLen(v.text?.[i]))));
  const { keep, coverage } = planChapter(lens, rangeVerses);
  const short = index.replace(/ on .*$/, "");
  const segments = {};
  for (const [v, info] of keep) {
    const heArr = verseArr(v - 1);
    const segs = Array.isArray(heArr) || enVs.some(e => Array.isArray(e.text?.[v - 1]));
    const count = segs ? Math.max(Array.isArray(heArr) ? heArr.length : 0, ...enVs.map(e => Array.isArray(e.text?.[v - 1]) ? e.text[v - 1].length : 0)) : 1;
    for (let s = 0; s < count; s++) {
      const pick = t => segs ? (Array.isArray(t) ? t[s] : undefined) : t;
      const he = rtrim(pick(heArr) || "");
      const en = enVs.map(e => ({ versionTitle: e.versionTitle, text: rtrim(pick(e.text?.[v - 1]) || "") })).filter(e => e.text);
      if (!he && !en.length) continue;
      const ref = segs ? `${index} ${chapter}:${v}:${s + 1}` : `${index} ${chapter}:${v}`;
      const seg = { verse: `${book} ${chapter}:${v}`, he };
      if (en.length) seg.en = en;
      if (info.sectionFiled) Object.assign(seg, {
        sectionFiled: true,
        coversFrom: `${book} ${chapter}:${info.coversFrom}`,
        coversTo: `${book} ${chapter}:${info.coversTo}`,
        note: `${short}'s comment under ${chapter}:${info.coversFrom} covers ${chapter}:${info.coversFrom}–${info.coversTo}${info.coversFrom < Math.min(...rangeVerses) ? "; it sits before the reading starts" : ""}.`,
      });
      segments[ref] = seg;
    }
  }
  const cov = {};
  for (const [u, v] of coverage) cov[`${book} ${chapter}:${u}`] = `${index} ${chapter}:${v}`;
  return { segments, coverage: cov, heVersion: heV?.versionTitle || null, enVersions: enVs.map(e => e.versionTitle) };
}

async function sefariaText(ref, { fetchImpl = globalThis.fetch, sleepImpl = wait } = {}) {
  const url = `https://www.sefaria.org/api/v3/texts/${encodeURIComponent(ref)}?version=hebrew&version=${encodeURIComponent("english|all")}&return_format=default`;
  try {
    return await withRetry(async () => {
      const res = await fetchImpl(url, { headers: HEADERS });
      if (res.status === 404 || res.status === 400) return null;
      if (!res.ok) throw new Error(String(res.status));
      const j = await res.json();
      return j && !j.error && Array.isArray(j.versions) && j.versions.length ? j : null;
    }, { sleepImpl });
  } catch { return null; }
}

async function pool(items, size, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
    while (next < items.length) { const i = next++; out[i] = await fn(items[i], i); }
  }));
  return out;
}

/** Drop whole commentaries from the end (the least central first) until the set fits `budget` bytes as written; the first always stays. */
export function capToBudget(commentaries, budget = TEXTS_BUDGET) {
  const kept = { ...commentaries }, dropped = [];
  const order = Object.keys(kept);
  while (order.length > 1 && Buffer.byteLength(JSON.stringify(kept, null, 1)) > budget) { const k = order.pop(); delete kept[k]; dropped.unshift(k); }
  return { kept, dropped };
}

/**
 * texts.json for one reading. The budget covers the file as written: the wrapper (ref, verses, the
 * notFetched lists) is reserved first, and linked texts are let go from the end until the whole file fits.
 * `getText` is Sefaria's v3 text call (injectable for tests).
 */
export async function buildTexts({ ref, book, verses, links, groups, core = CORE_COMMENTATORS, extras = true, capCommentaries = false, budget = TEXTS_BUDGET, getText = sefariaText, now = () => new Date() }) {
  const chapters = new Map();
  for (const v of verses) { if (!chapters.has(v.chapter)) chapters.set(v.chapter, new Set()); chapters.get(v.chapter).add(v.verse); }

  // Core commentators, plus (for a haftarah) any other "<X> on <Book>" commentary linked to three or more verses.
  const indexes = core.map(c => `${c} on ${book}`);
  if (extras) for (const g of groups.values()) {
    if (g.category === "Commentary" && g.source.endsWith(` on ${book}`) && !/^Sources and References/.test(g.source) && g.verses.size >= 3 && !indexes.includes(g.source)) indexes.push(g.source);
  }
  const jobs = indexes.flatMap(index => [...chapters.keys()].map(ch => ({ index, ch })));
  const results = await pool(jobs, 4, async ({ index, ch }) => ({ index, ch, tx: await getText(`${index} ${ch}`) }));

  let commentaries = {};
  const missing = [];
  for (const { index, ch, tx } of results) {
    if (!tx || tx.indexTitle !== index) { if (!missing.includes(index)) missing.push(index); continue; }
    const { segments, coverage, heVersion, enVersions } = chapterSegments(tx, book, ch, chapters.get(ch));
    const c = commentaries[index] ||= { index, core: core.some(n => index === `${n} on ${book}`), versions: { he: heVersion, en: [] }, segments: {}, coverage: {} };
    for (const e of enVersions || []) if (!c.versions.en.includes(e)) c.versions.en.push(e);
    Object.assign(c.segments, segments);
    Object.assign(c.coverage, coverage);
  }
  for (const [k, c] of Object.entries(commentaries)) if (!Object.keys(c.segments).length) { delete commentaries[k]; missing.push(k); }
  const missingNow = missing.filter(m => !commentaries[m]);
  const fetchedAt = now().toISOString();
  const verseRefs = verses.map(v => `${book} ${v.chapter}:${v.verse}`);
  const overCap = list => list.map(e => ({ ref: e.ref, source: e.source, category: e.category, kind: e.kind, anchors: e.anchors }));
  // The wrapper's share of the file, reserved before the commentaries and linked texts are fitted.
  const reserve = Buffer.byteLength(JSON.stringify({ ref, fetched: fetchedAt, verses: verseRefs, commentaries: {}, linked: {}, notFetched: {
    commentaries: missingNow, linkedOverCap: overCap(selectLinked(links, new Set(Object.keys(commentaries))).skipped), linkedOverBudget: [], linkedFailed: [], commentariesOverBudget: [] } }, null, 1));
  const room = Math.max(0, budget - reserve);
  let overBudgetCommentaries = [];
  if (capCommentaries) ({ kept: commentaries, dropped: overBudgetCommentaries } = capToBudget(commentaries, room));

  // Linked texts.
  const { selected, skipped } = selectLinked(links, new Set(Object.keys(commentaries)));
  const fetched = await pool(selected, 4, async e => ({ e, tx: await getText(e.ref) }));
  let bytes = Buffer.byteLength(JSON.stringify(commentaries, null, 1));
  const linked = {};
  const overBudget = [], failed = [];
  for (const { e, tx } of fetched) {
    if (!tx) { failed.push(e.ref); continue; }
    const heV = tx.versions.find(v => v.languageFamilyName === "hebrew");
    const en = tx.versions.filter(v => v.languageFamilyName === "english").map(v => ({ versionTitle: v.versionTitle, text: Array.isArray(v.text) ? v.text : rtrim(v.text) })).filter(v => textLen(v.text));
    const entry = { source: e.source, category: e.category, kind: e.kind, anchors: e.anchors, he: heV ? (Array.isArray(heV.text) ? heV.text : rtrim(heV.text)) : "", heVersion: heV?.versionTitle || null, en };
    const size = Buffer.byteLength(JSON.stringify({ [e.ref]: entry }, null, 1));
    if (bytes + size > room) { overBudget.push(e.ref); continue; }
    bytes += size;
    linked[e.ref] = entry;
  }

  const notFetched = {
    commentaries: missingNow,
    linkedOverCap: overCap(skipped),
    linkedOverBudget: overBudget,
    linkedFailed: failed,
  };
  if (capCommentaries) notFetched.commentariesOverBudget = overBudgetCommentaries;
  const out = { ref, fetched: fetchedAt, verses: verseRefs, commentaries, linked, notFetched };
  // The reserve is an estimate (nesting indents every line once more): let go of linked texts from the
  // end, then (for the Torah) commentaries, until the file as written fits.
  const written = () => Buffer.byteLength(JSON.stringify(out, null, 1));
  while (written() > budget) {
    const lk = Object.keys(linked);
    if (lk.length) { const k = lk[lk.length - 1]; delete linked[k]; overBudget.unshift(k); continue; }
    const ck = Object.keys(commentaries);
    if (capCommentaries && ck.length > 1) { const k = ck[ck.length - 1]; delete commentaries[k]; overBudgetCommentaries.unshift(k); continue; }
    break;
  }
  return out;
}

// ---- one reading ------------------------------------------------------------------

/** One passage, verse-aligned in the customs' two versions; every verse names its book (schema 3). */
export async function fetchPassage(ref, { versions, get = getJSON }) {
  const refPath = encodeURIComponent(ref.replace(/\s+/g, " "));
  const tx = await get(`https://www.sefaria.org/api/v3/texts/${refPath}?version=hebrew|${encodeURIComponent(versions.he)}&version=english|${encodeURIComponent(versions.en)}&return_format=default`);
  const heV = (tx.versions || []).find(v => v.languageFamilyName === "hebrew");
  const enV = (tx.versions || []).find(v => v.languageFamilyName === "english");
  if (!heV || !enV) throw new Error("Sefaria did not return both versions for " + ref);
  const heVerses = flattenVerses(heV.text, tx.sections, tx.toSections);
  const enVerses = flattenVerses(enV.text, tx.sections, tx.toSections);
  const book = tx.book || tx.indexTitle || ref.replace(/\s+\d.*$/, "");
  const verses = heVerses.map((hv, i) => {
    const { he, break: brk } = cleanHebrew(hv.text || "");
    const { en, notes } = cleanEnglish((enVerses[i] && enVerses[i].text) || "");
    return { ref: `${book} ${hv.chapter}:${hv.verse}`, book, chapter: hv.chapter, verse: hv.verse, he, en, notes, break: brk };
  });
  return { ref, heRef: tx.heRef || null, book, verses };
}

const sefariaLinks = (ref, get = getJSON) => get(`https://www.sefaria.org/api/links/${encodeURIComponent(ref.replace(/\s+/g, " "))}?with_text=0`);

/** Sefaria's links → sources grouped for the rabbi to choose from. For the Torah, quoting commentaries and super-commentaries are set aside in `skipped`. */
export function candidatesFrom(links, { kind = "haftarah" } = {}) {
  const groups = new Map(), skipped = new Map();
  for (const l of links) {
    const title = l.index_title || l.collectiveTitle?.en || l.ref.replace(/\s+\d.*$/, "");
    if (kind === "torah" && (l.category === "Quoting Commentary" || SUPER_COMMENTARY.test(title))) {
      const s = skipped.get(title) || { source: title, category: l.category, count: 0 };
      s.count++; skipped.set(title, s);
      continue;
    }
    const g = groups.get(title) || { source: title, category: l.category, type: l.type, count: 0, verses: new Set(), hasEnglish: false, refs: [] };
    g.count++;
    g.hasEnglish = g.hasEnglish || !!l.sourceHasEn;
    for (const v of (l.anchorRefExpanded || [l.anchorRef])) g.verses.add(v);
    if (g.refs.length < 60) g.refs.push(l.ref);
    groups.set(title, g);
  }
  const candidates = [...groups.values()].map(g => {
    const register = g.category === "Reference" ? "reference" : (REGISTERS.find(([re]) => re.test(g.source)) || [null, g.category === "Commentary" || g.category === "Targum" || g.category === "Talmud" || g.category === "Midrash" || g.category === "Chasidut" || g.category === "Kabbalah" ? "traditional" : "unclassified"])[1];
    return { ...g, register, verses: [...g.verses].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })) };
  }).sort((a, b) => b.count - a.count);
  return { groups, candidates, skipped: [...skipped.values()].sort((a, b) => b.count - a.count) };
}

/** A reading of the sheet from its passage: the incipit fetch proposes, the customs' versions, no entries yet. */
export function readingFrom(kind, passage, { titleEn, versions, fetched, extra = {} }) {
  const first = passage.verses[0] || { he: "", en: "" };
  return {
    id: kind, kind, ref: passage.ref, heRef: passage.heRef, book: passage.book, ...extra,
    incipit: { he: incipitHe(first.he), en: incipitEn(first.en) },
    title: { he: stripMarks(incipitHe(first.he)), en: titleEn },
    versions: { he: versions.he, en: versions.en }, fetched,
    verses: passage.verses, glosses: [], commentary: [],
  };
}

/** A new week's sheet.json, schema 3. */
export function freshSheet({ slug, date, item, conv, customs, special = null, readings, leyning = null, nextWeek = null }) {
  const sheet = {
    schema: 3,
    slug,
    status: "draft",
    shabbat: {
      civil: date,
      civilDisplay: new Date(date + "T12:00:00Z").toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" }),
      hebrew: conv.hebrew,
      hebrewEn: `${conv.hd} ${conv.hm} ${conv.hy}`,
      parashah: { en: item.name?.en, he: item.name?.he, ref: item.summary },
      special,
    },
    series: { name: customs.series.name, year: String(conv.hy) },
    readings,
    openingNote: { calendar: "", setting: [] },
    glossary: [],
    nextWeek,
    credits: { ...(customs.credits || {}) },
  };
  if (leyning) sheet.leyning = leyning;
  return sheet;
}

const count = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/**
 * A kept sheet.json and this run's Torah reading and aliyot. A schema-2 week with no Torah pick is
 * returned untouched. A Torah pick is added first in readings[] (a schema-2 week is migrated to hold
 * it); the same pick again changes nothing; a Torah reading nobody has worked on yet (no entries or
 * glosses, or only ones carried from last time) is replaced by a new pick, its carried entries with
 * it; one with any other entry or gloss is never replaced here.
 */
export function mergeWeek(existing, { torah = null, leyning = null } = {}) {
  const notes = [];
  const has = L.readings(existing).find(r => r.kind === "torah") || null;
  if (torah && has && has.ref === torah.ref) torah = null;
  // Worked on = any entry or gloss that is not a carried copy from last time; carried ones go with the old reading.
  const worked = r => [...(r.commentary || []), ...(r.glosses || [])].some(e => e.status !== "carried");
  if (torah && has && worked(has)) {
    throw new Error(`sheet.json's Torah reading (${has.ref}) already has ${count((has.commentary || []).length, "entry", "entries")} and ${count((has.glosses || []).length, "gloss", "glosses")}; --force replaces the whole sheet, or change readings[] by hand`);
  }
  const holdsLeyning = torah || Number(existing.schema) >= 3;
  const newLeyning = leyning && holdsLeyning && JSON.stringify(existing.leyning) !== JSON.stringify(leyning);
  if (!torah && !newLeyning) return { sheet: existing, changed: false, notes };
  const sheet = Number(existing.schema) >= 3 ? structuredClone(existing) : migrate3(existing);
  if (newLeyning) sheet.leyning = leyning;
  if (torah) {
    sheet.readings = [torah, ...(sheet.readings || []).filter(r => r.kind !== "torah")];
    notes.push(has ? `replaced the Torah reading ${has.ref} with ${torah.ref}` : `added the Torah reading ${torah.ref}`);
  }
  return { sheet, changed: true, notes };
}

/**
 * A schema-3 sheet with an id on every entry of every reading (existing ids kept, missing ones
 * filled); carry-forward depends on them. A schema-2 sheet, or one already complete, comes back as is.
 */
export function withEntryIds(sheet) {
  if (!(Number(sheet.schema) >= 3)) return { sheet, changed: false };
  if (L.readings(sheet).every(r => (r.commentary || []).every(e => e.id))) return { sheet, changed: false };
  const out = structuredClone(sheet);
  for (const r of L.readings(out)) L.assignEntryIds(r.commentary || [], r.id);
  return { sheet: out, changed: true };
}

/**
 * fetch's last step on the sheet: ids on every entry, then the prior (applyPrior). Ids come first so an
 * entry Daniel added by hand, without an id, is recognised as the prior's entry and not carried in again.
 */
export function withPrior(sheet, prior, opts = {}) {
  const ids = withEntryIds(sheet);
  const ap = applyPrior(ids.sheet, prior, opts);
  return { sheet: ap.sheet, changed: ids.changed || ap.changed, added: ap.added };
}

// ---- main -------------------------------------------------------------------

// The following Shabbat's reading; Daniel confirms it when the calendar offers a choice.
export async function nextWeekFor(date, customs, get = getJSON) {
  const d = new Date(date + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + 7);
  const next = d.toISOString().slice(0, 10);
  try {
    const ley = await get(leyningUrl(next, customs));
    const it = (ley.items || [])[0];
    if (!it || !it.haftara) return null;
    // torahRef: next week's Torah reading as Hebcal's summary, en-dashed like the haftarah ref; the Torah sheet's colophon names it.
    const torahRef = typeof it.summary === "string" && it.summary.trim() ? L.enDash(it.summary.trim()) : null;
    return {
      shabbat: it.name?.en || "",
      special: it.reason?.haftara || null,
      ref: it.haftara,
      ...(torahRef ? { torahRef } : {}),
      civilDisplay: new Date(next + "T12:00:00Z").toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" }),
    };
  } catch { return null; }
}

// Week folders already made for this Shabbat: local weeks/ plus --known slugs (the Drive working
// folder's subfolders, which a fresh cloud session cannot see).
export function weeksTaken(date, local = [], known = []) {
  return [...new Set([...local, ...known])].filter(d => d.startsWith(date)).sort();
}

/** A flag that needs a value but was given none (arg() returns true then): the usage error, else null. */
export function missingValue({ prior = null, torah = null, pick = null } = {}) {
  if (prior === true) return "--prior needs a folder";
  if (torah === true) return `--torah needs a range, e.g. --torah "Genesis 6:9-7:16"`;
  if (pick === true) return "--torah-pick needs a pick: aliyah:N[-M], aliyah:M, triennial or full";
  return null;
}

async function main() {
  const usage = missingValue({ prior: arg("prior", null), torah: arg("torah", null), pick: arg("torah-pick", null) });
  if (usage) throw new Error(usage);
  const customsArg = arg("customs", null);
  const customs = await loadCustoms(typeof customsArg === "string" ? customsArg : "crc");
  const date = arg("date", nextShabbat());
  const outRoot = arg("out", "weeks");
  const force = arg("force", false) === true;
  const refOverride = arg("ref", null);
  const known = String(arg("known", "") === true ? "" : arg("known", "")).split(",").map(s => s.trim()).filter(Boolean);
  const wantTexts = !process.argv.includes("--no-texts");
  const carry = !process.argv.includes("--no-carry");
  const priorArg = arg("prior", null);
  const noTorah = process.argv.includes("--no-torah");
  const torahArg = arg("torah", null), pickArg = arg("torah-pick", null);
  if (noTorah && (torahArg || pickArg)) throw new Error("--no-torah cannot be combined with --torah <ref> or --torah-pick");
  const pick = typeof torahArg === "string" ? { kind: "ref", ref: torahArg } : typeof pickArg === "string" ? parsePick(pickArg) : defaultPick(customs);
  if ((customs.toConfirm || []).length) console.log(`customs/${customs.id}.json: not yet confirmed by Daniel: ${customs.toConfirm.join(", ")}`);
  const hebcal = d => getJSON(leyningUrl(d, customs));

  // "This week" is ambiguous once the coming Shabbat already has a folder: name both Shabbatot and
  // stop, so the question to Daniel can offer the one after as well.
  if (arg("date", null) === null) {
    const taken = weeksTaken(date, await readdir(outRoot).catch(() => []), known);
    if (taken.length) {
      const after = new Date(date + "T12:00:00Z"); after.setUTCDate(after.getUTCDate() + 7);
      const next = after.toISOString().slice(0, 10);
      const name = async d => { try { const it = (await hebcal(d)).items?.[0]; return it ? `${it.name?.en}, haftarah ${it.haftara}` : "?"; } catch { return "?"; } };
      const local = new Set(await readdir(outRoot).catch(() => []));
      console.log(`${date} already has ${taken.map(t => local.has(t) ? `${outRoot}/${t}` : `${t} (Drive)`).join(", ")}.`);
      console.log(`  ${date}: ${await name(date)}\n  ${next}: ${await name(next)}`);
      console.log(`Run again with --date ${date} or --date ${next}.`);
      process.exit(2);
    }
  }

  console.log(`Shabbat ${date}`);

  // 1. Calendar: Hebcal's leyning item (parashah, haftarah, aliyot, the reason when special) and the Hebrew date.
  const item = ((await hebcal(date)).items || [])[0];
  if (!item) throw new Error(`Hebcal has no reading for ${date}; is it a Shabbat?`);
  const conv = await getJSON(`https://www.hebcal.com/converter?cfg=json&gy=${date.slice(0, 4)}&gm=${+date.slice(5, 7)}&gd=${+date.slice(8, 10)}&g2h=1`);
  const name = item.name?.en || "";
  const haftRef = refOverride || item.haftara;
  if (!haftRef) throw new Error(`No haftarah listed for ${date} (${name}).`);
  const special = item.reason?.haftara || null;
  const defaultHaftarah = defaultHaftarahFor(name, customs.haftarahRite);
  const leyning = noTorah ? null : leyningOf(item);
  console.log(`Parashat ${name}; haftarah ${haftRef}${special ? ` (${special})` : ""}`);
  if (leyning) console.log(aliyotLines(leyning).join("\n"));
  const fetched = new Date().toISOString();

  // 2. The haftarah, verse-aligned in both versions.
  const hp = await fetchPassage(haftRef, { versions: customs.versions });
  const haftarah = readingFrom("haftarah", hp, {
    titleEn: special ? special.replace(/^Shabbat\s+/i, "") : `Haftarat ${name}`, versions: customs.versions, fetched,
    extra: { defaultHaftarah: special && defaultHaftarah !== haftRef ? defaultHaftarah : null },
  });

  // 3. The Torah selection, when there is one: Daniel's pick, or the customs' standing rule.
  let torah = null;
  if (leyning && pick) {
    const sel = selectTorah(leyning, pick);
    const tp = await fetchPassage(sel.ref, { versions: customs.versions });
    torah = readingFrom("torah", tp, { titleEn: name, versions: customs.versions, fetched, extra: { selection: sel.selection, aliyot: leyning.aliyot, maftir: sel.maftir } });
    console.log(`Torah selection: ${sel.selection}, ${sel.ref} (${tp.verses.length} verses)${sel.maftir ? `; maftir ${sel.maftir.ref}${sel.maftir.reason ? ` (${sel.maftir.reason})` : ""}` : ""}`);
  } else if (leyning) {
    console.log(`Torah: no selection yet. Put the aliyot to Daniel in the briefing, then run again with --torah-pick aliyah:N[-M] (or aliyah:M, triennial, full) or --torah "<ref>".`);
  }

  // 4. sheet.json: a new week, or the kept one, with a Torah reading added when there is a new pick.
  const slug = `${date}-${slugify(name || "shabbat")}${special ? "-" + slugify(special.replace(/^Shabbat\s+/i, "")) : ""}`;
  const dir = join(outRoot, slug);
  await mkdir(dir, { recursive: true });
  const sheetPath = join(dir, "sheet.json");
  const existing = await readFile(sheetPath, "utf8").then(JSON.parse, () => null);
  let sheet, write = null;
  if (!existing || force) {
    sheet = freshSheet({ slug, date, item, conv, customs, special, readings: [torah, haftarah].filter(Boolean), leyning, nextWeek: await nextWeekFor(date, customs) });
    write = existing ? "Replaced" : "Wrote";
  } else {
    const m = mergeWeek(existing, { torah, leyning });
    for (const n of m.notes) console.log(`  ${n}`);
    sheet = m.sheet;
    if (m.changed) write = "Updated";
  }

  // 4b. Last time: the latest earlier sheet for this parashah. prior.json every run. By default (Daniel cuts), the pointer on the
  // sheet, the entries that fit this year's readings (status "carried") and the "See also" sentence,
  // unless --no-carry (then a new sheet gets the pointer only).
  const prior = await lookupPrior({ keys: parashahKeysOf(name), civil: date, priorDir: typeof priorArg === "string" ? priorArg : null });
  await writeFile(join(dir, PRIOR_FILE), JSON.stringify(prior, null, 1), "utf8");
  console.log(prior.slug ? `Last time: ${prior.slug} (${prior.hebrewEn}, from the ${prior.source})` : `Last time: none${prior.error ? ` (${prior.error})` : ""}`);
  // 4c. Every entry has an id first (carry-forward depends on them), so a hand-added entry is not carried in twice.
  const ap = withPrior(sheet, prior, { carry, fresh: !existing || force });
  if (ap.changed) { sheet = ap.sheet; if (!write) write = "Updated"; }
  if (ap.added.length) console.log(`  carried ${ap.added.length} entr${ap.added.length === 1 ? "y" : "ies"} from ${prior.slug}: ${ap.added.map(a => `${a.reading} ${a.chapter}:${a.verse} ${a.source}`).join("; ")}`);

  // 5. Write sheet.json.
  if (write) {
    await writeFile(sheetPath, JSON.stringify(sheet, null, 2), "utf8");
    console.log(`${write} ${sheetPath} (${L.readings(sheet).map(r => `${r.id}: ${(r.verses || []).length} verses`).join("; ")})`);
  } else console.log(`Kept existing ${sheetPath} (use --force to replace). Refreshed candidates and texts only.`);

  // 6. Candidates and texts, one pair of files per reading the sheet holds.
  for (const r of L.readings(sheet).filter(x => (x.verses || []).length && READING_FILES[x.kind])) {
    const files = READING_FILES[r.kind];
    const links = await sefariaLinks(r.ref);
    const { groups, candidates, skipped } = candidatesFrom(links, { kind: r.kind });
    const cand = { ref: r.ref, fetched, sources: candidates };
    if (r.kind === "torah") cand.skipped = skipped;
    await writeFile(join(dir, files.candidates), JSON.stringify(cand, null, 2), "utf8");
    console.log(`Wrote ${join(dir, files.candidates)} (${candidates.length} sources, ${links.length} links${skipped.length ? `; ${skipped.length} super-commentaries and quoting commentaries set aside` : ""})`);
    if (!wantTexts) continue;
    const opts = r.kind === "torah" ? { core: TORAH_CORE, extras: false, capCommentaries: true } : {};
    const texts = await buildTexts({ ref: r.ref, book: r.book, verses: r.verses, links, groups, ...opts });
    const body = JSON.stringify(texts, null, 1);
    await writeFile(join(dir, files.texts), body, "utf8");
    const segs = Object.values(texts.commentaries).reduce((s, c) => s + Object.keys(c.segments).length, 0);
    const sf = Object.values(texts.commentaries).flatMap(c => Object.entries(c.segments).filter(([, x]) => x.sectionFiled).map(([ref]) => ref));
    console.log(`Wrote ${join(dir, files.texts)} (${(Buffer.byteLength(body) / 1024).toFixed(0)} KB: ${Object.keys(texts.commentaries).length} commentaries, ${segs} segments, ${Object.keys(texts.linked).length} linked texts)`);
    if (sf.length) console.log(`  section-filed: ${[...new Set(sf.map(x => x.replace(/:\d+$/, "")))].join(", ")}`);
    const nf = texts.notFetched;
    if (nf.commentaries.length) console.log(`  not on Sefaria: ${nf.commentaries.join(", ")}`);
    if ((nf.commentariesOverBudget || []).length) console.log(`  over the size budget, not fetched: ${nf.commentariesOverBudget.join(", ")}`);
    if (nf.linkedOverCap.length + nf.linkedOverBudget.length + nf.linkedFailed.length) console.log(`  linked not fetched: ${nf.linkedOverCap.length} over cap, ${nf.linkedOverBudget.length} over size budget, ${nf.linkedFailed.length} failed`);
  }
  if (wantTexts) console.log(`  overview: node scripts/digest.mjs ${dir}`);
  console.log(`\nNext: review candidates, add entries to sheet.json, then\n  node scripts/build.mjs ${dir} --png`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch(err => { console.error(err.message || err); process.exit(1); });
}
