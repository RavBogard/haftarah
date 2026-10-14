#!/usr/bin/env node
/**
 * fetch.mjs — pull one week's haftarah from Sefaria and start a sheet data file.
 *
 *   node scripts/fetch.mjs                       # next Shabbat (Diaspora schedule)
 *   node scripts/fetch.mjs --date 2026-10-10     # a specific Shabbat
 *   node scripts/fetch.mjs --ref "Isaiah 42:5-43:10" --date 2026-10-10   # override the reading
 *   node scripts/fetch.mjs --out weeks            # output root (default: weeks)
 *   node scripts/fetch.mjs --known 2026-10-17-noach,2026-10-24-lech-lecha   # weeks that exist only in Drive
 *   node scripts/fetch.mjs --no-texts             # skip texts.json
 *
 * Writes weeks/<slug>/sheet.json (text + metadata, no commentary yet) and
 * weeks/<slug>/candidates.json (every commentary Sefaria links to the passage,
 * grouped by source, for the rabbi to approve from) and weeks/<slug>/texts.json
 * (the core commentators' text on the passage, chapter by chapter, and the
 * linked Talmud, midrash, liturgy, Targum and Zohar segments). Never overwrites
 * an existing sheet.json; use --force to replace it. candidates.json and
 * texts.json are refreshed every run.
 *
 * Dependency-free: Node 18+ with global fetch.
 */

import { mkdir, writeFile, access, readFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HEBREW_VERSION = "Miqra according to the Masorah";
const ENGLISH_VERSION = "THE JPS TANAKH: Gender-Sensitive Edition";

// Default (Ashkenazi) haftarah for each parashah. Used only to say what the
// reading would have been when a special Shabbat replaces it.
const DEFAULT_HAFTAROT = {
  "bereshit": "Isaiah 42:5-43:10",
  "noach": "Isaiah 54:1-55:5",
  "lech lecha": "Isaiah 40:27-41:16",
  "vayera": "II Kings 4:1-37",
  "chayei sara": "I Kings 1:1-31",
  "toldot": "Malachi 1:1-2:7",
  "vayetzei": "Hosea 12:13-14:10",
  "vayishlach": "Obadiah 1:1-21",
  "vayeshev": "Amos 2:6-3:8",
  "miketz": "I Kings 3:15-4:1",
  "vayigash": "Ezekiel 37:15-28",
  "vayechi": "I Kings 2:1-12",
  "shemot": "Isaiah 27:6-28:13; 29:22-23",
  "vaera": "Ezekiel 28:25-29:21",
  "bo": "Jeremiah 46:13-28",
  "beshalach": "Judges 4:4-5:31",
  "yitro": "Isaiah 6:1-7:6; 9:5-6",
  "mishpatim": "Jeremiah 34:8-22; 33:25-26",
  "terumah": "I Kings 5:26-6:13",
  "tetzaveh": "Ezekiel 43:10-27",
  "ki tisa": "I Kings 18:1-39",
  "vayakhel": "I Kings 7:40-50",
  "pekudei": "I Kings 7:51-8:21",
  "vayakhel pekudei": "I Kings 7:51-8:21",
  "vayikra": "Isaiah 43:21-44:23",
  "tzav": "Jeremiah 7:21-8:3; 9:22-23",
  "shmini": "II Samuel 6:1-7:17",
  "tazria": "II Kings 4:42-5:19",
  "metzora": "II Kings 7:3-20",
  "tazria metzora": "II Kings 7:3-20",
  "achrei mot": "Ezekiel 22:1-19",
  "kedoshim": "Amos 9:7-15",
  "achrei mot kedoshim": "Amos 9:7-15",
  "emor": "Ezekiel 44:15-31",
  "behar": "Jeremiah 32:6-27",
  "bechukotai": "Jeremiah 16:19-17:14",
  "behar bechukotai": "Jeremiah 16:19-17:14",
  "bamidbar": "Hosea 2:1-22",
  "nasso": "Judges 13:2-25",
  "behaalotcha": "Zechariah 2:14-4:7",
  "shlach": "Joshua 2:1-24",
  "korach": "I Samuel 11:14-12:22",
  "chukat": "Judges 11:1-33",
  "balak": "Micah 5:6-6:8",
  "chukat balak": "Micah 5:6-6:8",
  "pinchas": "I Kings 18:46-19:21",
  "matot": "Jeremiah 1:1-2:3",
  "masei": "Jeremiah 2:4-28; 3:4",
  "matot masei": "Jeremiah 2:4-28; 3:4",
  "devarim": "Isaiah 1:1-27",
  "vaetchanan": "Isaiah 40:1-26",
  "eikev": "Isaiah 49:14-51:3",
  "reeh": "Isaiah 54:11-55:5",
  "shoftim": "Isaiah 51:12-52:12",
  "ki teitzei": "Isaiah 54:1-10",
  "ki tavo": "Isaiah 60:1-22",
  "nitzavim": "Isaiah 61:10-63:9",
  "vayeilech": "Isaiah 55:6-56:8",
  "nitzavim vayeilech": "Isaiah 61:10-63:9",
  "haazinu": "II Samuel 22:1-51",
  "vezot haberakhah": "Joshua 1:1-18",
};

// Register lookup by Sefaria index title prefix. Anything not matched is
// reported as "unclassified" for the rabbi to place.
const REGISTERS = [
  [/^(Rashi|Radak|Ralbag|Malbim|Metzudat David|Metzudat Zion|Abarbanel|Targum Jonathan|Targum|Ibn Ezra|Ramban|Sforno|Chizkuni|Marot HaTzoveot|Ahavat Yehonatan|Tze'enah Ure'enah|Maor VaShemesh|Tiferet Shlomo|Kli Yakar|Alshich|Or HaChaim|Siftei Chakhamim|Gur Aryeh|Rambam|Sefer HaShorashim|Machberet Menachem)/, "traditional"],
  [/^(Steinsaltz|The Early Prophets, by Everett Fox|Tribal Lands|Mishnat Eretz Yisrael|Da'at Mikra|Hirsch|Sacks|Netziv|Depths of Yonah|Peninei Halakhah)/, "modern"],
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

async function getJSON(url) {
  const res = await fetch(url, { headers: { accept: "application/json", "user-agent": "crc-haftarah-sheet/1.0" } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return res.json();
}

function slugify(s) {
  return s.toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function normalizeParashah(name) {
  return name.toLowerCase().replace(/['’\-]/g, " ").replace(/\s+/g, " ").trim().replace(/ /g, " ");
}

// ---- Sefaria HTML cleanup ---------------------------------------------------

const BREAK_TRAIL_RE = /(?:&nbsp;|\s)*<span class="mam-spi-(samekh|pe)">\{[ספ]\}<\/span>(?:&nbsp;|\s|<br\s*\/?>)*$/;
const BREAK_MID_RE = /(?:&nbsp;|\s)*<span class="mam-spi-(samekh|pe)">\{[ספ]\}<\/span>(?:&nbsp;|\s|<br\s*\/?>)*/g;

function cleanHebrew(html) {
  let brk = null;
  let out = html.replace(/(?:&nbsp;|\s)+$/g, "").replace(/(<br\s*\/?>\s*)+$/g, "").trim();
  // trailing marker = Masoretic paragraph break after this verse
  out = out.replace(BREAK_TRAIL_RE, (_, kind) => {
    brk = kind === "pe" ? "petuchah" : "setumah";
    return "";
  });
  // mid-verse marker (pisqa be'emtza pasuq) = visible gap inside the line
  out = out.replace(BREAK_MID_RE, ' <span class="pisqa"></span> ');
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

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function sefariaText(ref) {
  const url = `https://www.sefaria.org/api/v3/texts/${encodeURIComponent(ref)}?version=hebrew&version=${encodeURIComponent("english|all")}&return_format=default`;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, { headers: { accept: "application/json", "user-agent": "crc-haftarah-sheet/1.0" } });
      if (res.status === 404 || res.status === 400) return null;
      if (!res.ok) throw new Error(String(res.status));
      const j = await res.json();
      return j && !j.error && Array.isArray(j.versions) && j.versions.length ? j : null;
    } catch {
      if (attempt === 0) await sleep(1500);
    }
  }
  return null;
}

async function pool(items, size, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
    while (next < items.length) { const i = next++; out[i] = await fn(items[i], i); }
  }));
  return out;
}

async function buildTexts({ haftRef, book, verses, links, groups }) {
  const chapters = new Map();
  for (const v of verses) { if (!chapters.has(v.chapter)) chapters.set(v.chapter, new Set()); chapters.get(v.chapter).add(v.verse); }

  // Core commentators, plus any other "<X> on <Book>" commentary linked to three or more verses.
  const indexes = CORE_COMMENTATORS.map(c => `${c} on ${book}`);
  for (const g of groups.values()) {
    if (g.category === "Commentary" && g.source.endsWith(` on ${book}`) && !/^Sources and References/.test(g.source) && g.verses.size >= 3 && !indexes.includes(g.source)) indexes.push(g.source);
  }
  const jobs = indexes.flatMap(index => [...chapters.keys()].map(ch => ({ index, ch })));
  const results = await pool(jobs, 4, async ({ index, ch }) => ({ index, ch, tx: await sefariaText(`${index} ${ch}`) }));

  const commentaries = {};
  const missing = [];
  for (const { index, ch, tx } of results) {
    if (!tx || tx.indexTitle !== index) { if (!missing.includes(index)) missing.push(index); continue; }
    const { segments, coverage, heVersion, enVersions } = chapterSegments(tx, book, ch, chapters.get(ch));
    const c = commentaries[index] ||= { index, core: CORE_COMMENTATORS.some(n => index === `${n} on ${book}`), versions: { he: heVersion, en: [] }, segments: {}, coverage: {} };
    for (const e of enVersions || []) if (!c.versions.en.includes(e)) c.versions.en.push(e);
    Object.assign(c.segments, segments);
    Object.assign(c.coverage, coverage);
  }
  for (const [k, c] of Object.entries(commentaries)) if (!Object.keys(c.segments).length) { delete commentaries[k]; missing.push(k); }
  const missingNow = missing.filter(m => !commentaries[m]);

  // Linked texts.
  const { selected, skipped } = selectLinked(links, new Set(Object.keys(commentaries)));
  const fetched = await pool(selected, 4, async e => ({ e, tx: await sefariaText(e.ref) }));
  let bytes = Buffer.byteLength(JSON.stringify(commentaries, null, 1));
  const linked = {};
  const overBudget = [], failed = [];
  for (const { e, tx } of fetched) {
    if (!tx) { failed.push(e.ref); continue; }
    const heV = tx.versions.find(v => v.languageFamilyName === "hebrew");
    const en = tx.versions.filter(v => v.languageFamilyName === "english").map(v => ({ versionTitle: v.versionTitle, text: Array.isArray(v.text) ? v.text : rtrim(v.text) })).filter(v => textLen(v.text));
    const entry = { source: e.source, category: e.category, kind: e.kind, anchors: e.anchors, he: heV ? (Array.isArray(heV.text) ? heV.text : rtrim(heV.text)) : "", heVersion: heV?.versionTitle || null, en };
    const size = Buffer.byteLength(JSON.stringify({ [e.ref]: entry }, null, 1));
    if (bytes + size > TEXTS_BUDGET) { overBudget.push(e.ref); continue; }
    bytes += size;
    linked[e.ref] = entry;
  }

  return {
    ref: haftRef,
    fetched: new Date().toISOString(),
    verses: verses.map(v => `${book} ${v.chapter}:${v.verse}`),
    commentaries,
    linked,
    notFetched: {
      commentaries: missingNow,
      linkedOverCap: skipped.map(e => ({ ref: e.ref, source: e.source, category: e.category, kind: e.kind, anchors: e.anchors })),
      linkedOverBudget: overBudget,
      linkedFailed: failed,
    },
  };
}

// ---- main -------------------------------------------------------------------

// The following Shabbat's reading; Daniel confirms it when the calendar offers a choice.
async function nextWeekFor(date) {
  const d = new Date(date + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + 7);
  const next = d.toISOString().slice(0, 10);
  try {
    const ley = await getJSON(`https://www.hebcal.com/leyning?cfg=json&start=${next}&end=${next}`);
    const it = (ley.items || [])[0];
    if (!it || !it.haftara) return null;
    return {
      shabbat: it.name?.en || "",
      special: it.reason?.haftara || null,
      ref: it.haftara,
      civilDisplay: new Date(next + "T12:00:00Z").toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" }),
    };
  } catch { return null; }
}

// Week folders already made for this Shabbat: local weeks/ plus --known slugs (the Drive working
// folder's subfolders, which a fresh cloud session cannot see).
export function weeksTaken(date, local = [], known = []) {
  return [...new Set([...local, ...known])].filter(d => d.startsWith(date)).sort();
}

async function main() {
  const date = arg("date", nextShabbat());
  const outRoot = arg("out", "weeks");
  const force = arg("force", false) === true;
  const refOverride = arg("ref", null);
  const known = String(arg("known", "") === true ? "" : arg("known", "")).split(",").map(s => s.trim()).filter(Boolean);
  const wantTexts = !process.argv.includes("--no-texts");

  // "This week" is ambiguous once the coming Shabbat already has a folder: name both Shabbatot and
  // stop, so the question to Daniel can offer the one after as well.
  if (arg("date", null) === null) {
    // Local folders plus --known slugs (the Drive working folder's week subfolders).
    const taken = weeksTaken(date, await readdir(outRoot).catch(() => []), known);
    if (taken.length) {
      const after = new Date(date + "T12:00:00Z"); after.setUTCDate(after.getUTCDate() + 7);
      const next = after.toISOString().slice(0, 10);
      const name = async d => { try { const it = (await getJSON(`https://www.hebcal.com/leyning?cfg=json&start=${d}&end=${d}`)).items?.[0]; return it ? `${it.name?.en}, haftarah ${it.haftara}` : "?"; } catch { return "?"; } };
      const local = new Set(await readdir(outRoot).catch(() => []));
      console.log(`${date} already has ${taken.map(t => local.has(t) ? `${outRoot}/${t}` : `${t} (Drive)`).join(", ")}.`);
      console.log(`  ${date}: ${await name(date)}\n  ${next}: ${await name(next)}`);
      console.log(`Run again with --date ${date} or --date ${next}.`);
      process.exit(2);
    }
  }

  console.log(`Shabbat ${date}`);

  // 1. Schedule: Hebcal leyning gives parashah, haftarah and the reason when special.
  const ley = await getJSON(`https://www.hebcal.com/leyning?cfg=json&start=${date}&end=${date}`);
  const item = (ley.items || [])[0];
  if (!item) throw new Error(`Hebcal has no reading for ${date}; is it a Shabbat?`);
  const conv = await getJSON(`https://www.hebcal.com/converter?cfg=json&gy=${date.slice(0, 4)}&gm=${+date.slice(5, 7)}&gd=${+date.slice(8, 10)}&g2h=1`);

  const haftRef = refOverride || item.haftara;
  if (!haftRef) throw new Error(`No haftarah listed for ${date} (${item.name?.en}).`);
  const special = item.reason?.haftara || null;
  const parashahKey = normalizeParashah(item.name?.en || "");
  const defaultHaftarah = DEFAULT_HAFTAROT[parashahKey] || null;

  console.log(`Parashat ${item.name?.en}; haftarah ${haftRef}${special ? ` (${special})` : ""}`);

  // 2. Text in both versions.
  const refPath = encodeURIComponent(haftRef.replace(/\s+/g, " "));
  const textUrl = `https://www.sefaria.org/api/v3/texts/${refPath}?version=hebrew|${encodeURIComponent(HEBREW_VERSION)}&version=english|${encodeURIComponent(ENGLISH_VERSION)}&return_format=default`;
  const tx = await getJSON(textUrl);
  const heV = tx.versions.find(v => v.languageFamilyName === "hebrew");
  const enV = tx.versions.find(v => v.languageFamilyName === "english");
  if (!heV || !enV) throw new Error("Sefaria did not return both versions for " + haftRef);

  const heVerses = flattenVerses(heV.text, tx.sections, tx.toSections);
  const enVerses = flattenVerses(enV.text, tx.sections, tx.toSections);
  const book = tx.book || tx.indexTitle || haftRef.replace(/\s+\d.*$/, "");

  const verses = heVerses.map((hv, i) => {
    const { he, break: brk } = cleanHebrew(hv.text || "");
    const { en, notes } = cleanEnglish((enVerses[i] && enVerses[i].text) || "");
    return { ref: `${book} ${hv.chapter}:${hv.verse}`, chapter: hv.chapter, verse: hv.verse, he, en, notes, break: brk };
  });

  // 3. Linked commentary, grouped by source.
  const links = await getJSON(`https://www.sefaria.org/api/links/${refPath}?with_text=0`);
  const groups = new Map();
  for (const l of links) {
    const title = l.index_title || l.collectiveTitle?.en || l.ref.replace(/\s+\d.*$/, "");
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

  // 4. Assemble the sheet skeleton.
  const slug = `${date}-${slugify(item.name?.en || "shabbat")}${special ? "-" + slugify(special.replace(/^Shabbat\s+/i, "")) : ""}`;
  const dir = join(outRoot, slug);
  await mkdir(dir, { recursive: true });

  const civilDisplay = new Date(date + "T12:00:00Z").toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
  const first = verses[0];
  const sheet = {
    schema: 2,
    slug,
    status: "draft",
    shabbat: {
      civil: date,
      civilDisplay,
      hebrew: conv.hebrew,
      hebrewEn: `${conv.hd} ${conv.hm} ${conv.hy}`,
      parashah: { en: item.name?.en, he: item.name?.he, ref: item.summary },
      special,
    },
    series: { name: "Torah from Scratch", year: String(conv.hy) },
    haftarah: {
      ref: haftRef,
      heRef: tx.heRef || null,
      book,
      incipit: { he: incipitHe(first.he), en: incipitEn(first.en) },
      title: { he: stripMarks(incipitHe(first.he)), en: special ? special.replace(/^Shabbat\s+/i, "") : `Haftarat ${item.name?.en}` },
      defaultHaftarah: special && defaultHaftarah !== haftRef ? defaultHaftarah : null,
      versions: { he: HEBREW_VERSION, en: ENGLISH_VERSION },
      fetched: new Date().toISOString(),
    },
    verses,
    glosses: [],
    commentary: [],
    openingNote: { calendar: "", setting: [] },
    glossary: [],
    nextWeek: await nextWeekFor(date),
    credits: {
      issuedBy: "Central Reform Congregation",
      editor: "Rabbi Daniel Bogard",
      signoff: "I chose and approved every entry on this sheet; summaries marked as such were drafted with Claude and read before printing. Tell me what I got wrong.",
    },
  };

  const sheetPath = join(dir, "sheet.json");
  let exists = false;
  try { await access(sheetPath); exists = true; } catch {}
  if (exists && !force) {
    console.log(`Kept existing ${sheetPath} (use --force to replace). Refreshed candidates only.`);
  } else {
    await writeFile(sheetPath, JSON.stringify(sheet, null, 2), "utf8");
    console.log(`Wrote ${sheetPath} (${verses.length} verses)`);
  }
  await writeFile(join(dir, "candidates.json"), JSON.stringify({ ref: haftRef, fetched: sheet.haftarah.fetched, sources: candidates }, null, 2), "utf8");
  console.log(`Wrote ${join(dir, "candidates.json")} (${candidates.length} sources, ${links.length} links)`);
  if (wantTexts) {
    const texts = await buildTexts({ haftRef, book, verses, links, groups });
    const body = JSON.stringify(texts, null, 1);
    await writeFile(join(dir, "texts.json"), body, "utf8");
    const segs = Object.values(texts.commentaries).reduce((s, c) => s + Object.keys(c.segments).length, 0);
    const sf = Object.values(texts.commentaries).flatMap(c => Object.entries(c.segments).filter(([, x]) => x.sectionFiled).map(([r]) => r));
    console.log(`Wrote ${join(dir, "texts.json")} (${(Buffer.byteLength(body) / 1024).toFixed(0)} KB: ${Object.keys(texts.commentaries).length} commentaries, ${segs} segments, ${Object.keys(texts.linked).length} linked texts)`);
    if (sf.length) console.log(`  section-filed: ${[...new Set(sf.map(r => r.replace(/:\d+$/, "")))].join(", ")}`);
    const nf = texts.notFetched;
    if (nf.commentaries.length) console.log(`  not on Sefaria: ${nf.commentaries.join(", ")}`);
    if (nf.linkedOverCap.length + nf.linkedOverBudget.length + nf.linkedFailed.length) console.log(`  linked not fetched: ${nf.linkedOverCap.length} over cap, ${nf.linkedOverBudget.length} over size budget, ${nf.linkedFailed.length} failed`);
    console.log(`  overview: node scripts/digest.mjs ${dir}`);
  }
  console.log(`\nNext: review candidates, add entries to sheet.json, then\n  node scripts/build.mjs ${dir} --png`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch(err => { console.error(err.message || err); process.exit(1); });
}
