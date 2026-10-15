#!/usr/bin/env node
/**
 * words.mjs — the word analysis behind the web page's word panel (spec 5.5): for every Hebrew word
 * of a reading, what it is doing (STEPBible TAHOT morphology, OSHB as fallback), its dictionary word
 * (TBESH), and how often that word occurs in the whole Hebrew Bible. Precomputed at publish into
 * weeks/<slug>/words.json; the page fetches it on the first word tap.
 *
 *   node scripts/words.mjs weeks/<slug> [--source tahot|oshb]   # write weeks/<slug>/words.json
 *   node scripts/words.mjs --download                           # fetch STEP's files into the cache
 *   node scripts/words.mjs --frequency                          # rebuild data/words/frequency.json
 *   node scripts/words.mjs --check "Isaiah 54:1-55:5" ...       # alignment coverage for a live ref
 *
 * STEP's data (CC BY 4.0, "Data created by www.STEPBible.org based on work at Tyndale House
 * Cambridge") is cached outside the repo (HAFTARAH_CACHE or ~/.haftarah-cache/) and never committed;
 * what the site publishes is a trimmed, per-week derived file with the credit. The frequency table
 * (counts per dictionary word) is derived data and is committed.
 */
import { createRequire } from "node:module";
import { readFile, writeFile, mkdir, rename, access, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FREQUENCY_FILE = join(ROOT, "data", "words", "frequency.json");
export const CREDITS = {
  tahot: "Word analysis: STEPBible TAHOT and TBESH, data created by www.STEPBible.org based on work at Tyndale House Cambridge (CC BY 4.0), trimmed and aligned for this site.",
  oshb: "Word analysis: Open Scriptures Hebrew Bible morphology (CC BY 4.0); Westminster Leningrad Codex (public domain).",
};

const L = createRequire(import.meta.url)("../template/lib.js");

// ---- the books a sheet can draw on: Sefaria's name → STEP's code and file, OSHB's code ----
export const BOOKS = {
  Genesis: { step: "Gen", group: "Gen-Deu", osis: "Gen" }, Exodus: { step: "Exo", group: "Gen-Deu", osis: "Exod" },
  Leviticus: { step: "Lev", group: "Gen-Deu", osis: "Lev" }, Numbers: { step: "Num", group: "Gen-Deu", osis: "Num" },
  Deuteronomy: { step: "Deu", group: "Gen-Deu", osis: "Deut" },
  Joshua: { step: "Jos", group: "Jos-Est", osis: "Josh" }, Judges: { step: "Jdg", group: "Jos-Est", osis: "Judg" },
  "I Samuel": { step: "1Sa", group: "Jos-Est", osis: "1Sam" }, "II Samuel": { step: "2Sa", group: "Jos-Est", osis: "2Sam" },
  "I Kings": { step: "1Ki", group: "Jos-Est", osis: "1Kgs" }, "II Kings": { step: "2Ki", group: "Jos-Est", osis: "2Kgs" },
  Isaiah: { step: "Isa", group: "Isa-Mal", osis: "Isa" }, Jeremiah: { step: "Jer", group: "Isa-Mal", osis: "Jer" },
  Ezekiel: { step: "Ezk", group: "Isa-Mal", osis: "Ezek" }, Hosea: { step: "Hos", group: "Isa-Mal", osis: "Hos" },
  Joel: { step: "Jol", group: "Isa-Mal", osis: "Joel" }, Amos: { step: "Amo", group: "Isa-Mal", osis: "Amos" },
  Obadiah: { step: "Oba", group: "Isa-Mal", osis: "Obad" }, Jonah: { step: "Jon", group: "Isa-Mal", osis: "Jonah" },
  Micah: { step: "Mic", group: "Isa-Mal", osis: "Mic" }, Nahum: { step: "Nam", group: "Isa-Mal", osis: "Nah" },
  Habakkuk: { step: "Hab", group: "Isa-Mal", osis: "Hab" }, Zephaniah: { step: "Zep", group: "Isa-Mal", osis: "Zeph" },
  Haggai: { step: "Hag", group: "Isa-Mal", osis: "Hag" }, Zechariah: { step: "Zec", group: "Isa-Mal", osis: "Zech" },
  Malachi: { step: "Mal", group: "Isa-Mal", osis: "Mal" },
};

/** Consonants only, with the divine name as יי (as the page sets it), so MAM and Leningrad forms compare. */
export const skeleton = s => L.stripMarks(L.divineName(String(s == null ? "" : s)).html).replace(/[^א-ת]/g, "");

// ---- STEP TAHOT ----
// A word row: "<Book>.<ch>.<v>[(<heCh>.<heV>)]#<nn>=<type>\t<hebrew>\t<translit>\t<gloss>\t<dStrongs>\t<morph>\t<meaning variants>\t..."
// The ref is the English numbering with the Hebrew in brackets when it differs; rows are keyed here by
// the Hebrew. Punctuation follows a backslash in the Hebrew and the dStrongs. Type X rows are words
// from the Septuagint that are not in the Masoretic text.
const TAHOT_ROW = /^([A-Za-z0-9]+)\.(\d+)\.(\d+)(?:\((\d+)\.(\d+)\))?#(\d+)=(\S*)\t([^\t\n]*)\t[^\t\n]*\t([^\t\n]*)\t([^\t\n]*)\t([^\t\n]*)\t([^\t\n]*)(?:\t([^\t\n]*))?/gm;
// groups: 1 book, 2 ch, 3 v, 4 heCh, 5 heV, 6 n, 7 type, 8 hebrew, (transliteration skipped), 9 gloss, 10 dStrongs, 11 morph, 12 meaning variants, 13 spelling variants
// A Q(K) row names its ketiv in the meaning variants ("K= translit (hebrew) ..."); a Q(k) row, where the
// ketiv differs only in spelling, names it in the spelling variants ("L= ... ¦ ;K= hebrew").
const KETIV_IN_VARIANT = /K=\s*\S+\s*\(([^)]*)\)/;
const KETIV_IN_SPELLING = /K=\s*([^¦;\t]+)/;

function ketivOf(meaning, spelling) {
  const kv = KETIV_IN_VARIANT.exec(meaning || "") || KETIV_IN_SPELLING.exec(spelling || "");
  const k = kv ? kv[1].split("\\")[0].trim() : "";
  return k || null;
}

export function parseTahot(text, stepCode) {
  const out = new Map();
  TAHOT_ROW.lastIndex = 0;
  let m;
  while ((m = TAHOT_ROW.exec(text))) {
    if (m[1] !== stepCode || m[7].startsWith("X")) continue;
    const he = m[8].split("\\")[0];
    if (!he.trim()) continue;   // a ketiv-only row (no qere word): not a word of the reading as the page shows it
    const ch = m[4] ? +m[4] : +m[2], v = m[5] ? +m[5] : +m[3];
    const key = `${ch}:${v}`;
    if (!out.has(key)) out.set(key, []);
    const ketiv = m[7].startsWith("Q") ? ketivOf(m[12], m[13]) : null;
    out.get(key).push({ n: +m[6], type: m[7], he, gloss: m[9], strongs: m[10].split("\\")[0], morph: m[11], ketiv });
  }
  for (const rows of out.values()) rows.sort((a, b) => a.n - b.n);
  return out;
}

// ---- STEP TBESH: "eStrong#\tdStrong\tuStrong\tHebrew\tTransliteration\tMorph\tGloss\tMeaning" ----
export function parseTbesh(text) {
  const out = new Map();
  for (const line of String(text).split(/\r?\n/)) {
    const f = line.split("\t");
    if (f.length < 7 || !/^H\d{4}/.test(f[0])) continue;
    const d = (f[1] || "").trim().split(/\s+/)[0];
    if (!/^H\d{4}[A-Za-z]?$/.test(d)) continue;
    out.set(d, { he: f[3].trim(), gloss: f[6].trim(), morph: f[5].trim() });
  }
  return out;
}

// ---- OSHB morphhb (wlc/<osis>.xml): the fallback source, in the same row shape ----
const OSHB_PREFIX = { c: "H9002", b: "H9003", k: "H9004", l: "H9005", m: "H9006", s: "H9007", d: "H9009" };
const oshbStrong = part => {
  const m = /^(\d+)\s*([a-z])?$/.exec(part.trim());
  if (m) return `H${m[1].padStart(4, "0")}${m[2] ? m[2].toUpperCase() : ""}`;
  return OSHB_PREFIX[part.trim()] || part.trim();
};

// OSHB tags a prefix in the lemma ("c/7121") but not a pronominal suffix ("אֲדֹנָֽי/ו" has lemma "113" and
// morph "HNcmpc/Sp3ms"): the suffix's STEP number comes from the morph. A ketiv word is replaced by
// the qere in its note; the ketiv is kept on the row.
// OSHB pronominal-suffix tags → STEP's suffix numbers (possessive Ps on nouns, object Os on verbs and prepositions).
const SUFFIX_STRONG = {
  "1cs": ["H9020", "H9030"], "2ms": ["H9021", "H9031"], "2fs": ["H9022", "H9032"], "3ms": ["H9023", "H9033"], "3fs": ["H9024", "H9034"],
  "1cp": ["H9025", "H9035"], "2mp": ["H9026", "H9036"], "2fp": ["H9027", "H9037"], "3mp": ["H9028", "H9038"], "3fp": ["H9029", "H9039"],
  "1bs": ["H9020", "H9030"], "1bp": ["H9025", "H9035"], "3cp": ["H9028", "H9038"],
};

// Assumes OSHB's order: the type="x-ketiv" <w>s first, then the <note> with no whitespace before it
// (optional <seg>s only); verified against 1 Samuel alone.
const KETIV_GROUP = /((?:<w type="x-ketiv"[^>]*>[^<]*<\/w>(?:<seg [^>]*>[^<]*<\/seg>)?)+)<note type="variant"><catchWord>[^<]*<\/catchWord><rdg type="x-qere">([\s\S]*?)<\/rdg><\/note>/g;

export function parseOshb(xml, osisCode) {
  const out = new Map();
  const verseRe = /<verse osisID="([A-Za-z0-9]+)\.(\d+)\.(\d+)">([\s\S]*?)<\/verse>/g;
  let v;
  while ((v = verseRe.exec(xml))) {
    if (v[1] !== osisCode) continue;
    // A ketiv can be several words joined by a ketiv maqqef (מ/בן־ימין), and its qere one word or several:
    // word for word when the counts match, else the whole ketiv on the first qere word.
    const body = v[4].replace(KETIV_GROUP, (_, kGroup, qere) => {
      const ks = [...kGroup.matchAll(/<w [^>]*>([^<]*)<\/w>/g)].map(m => m[1]);
      let qi = 0;
      const qn = (qere.match(/<w /g) || []).length;
      return qere.replace(/<w /g, () => { const k = qn === ks.length ? ks[qi] : qi === 0 ? ks.join("־") : null; qi++; return k ? `<w data-ketiv="${k}" ` : "<w "; });
    });
    const rows = [];
    const wRe = /<w ([^>]*)>([^<]*)<\/w>/g;
    let w;
    while ((w = wRe.exec(body))) {
      const attr = name => { const m = new RegExp(`${name}="([^"]*)"`).exec(w[1]); return m ? m[1] : ""; };
      const morph = attr("morph"), morphParts = morph.replace(/^[HA]/, "").split("/");
      const lemma = attr("lemma").split("/").map(oshbStrong);
      const parts = [];
      let li = 0;
      for (const mp of morphParts) {
        if (/^S[dhnp]/.test(mp) && li >= lemma.length) {   // a suffix OSHB does not tag: its number from the morph
          const pgn = mp.slice(2), pair = SUFFIX_STRONG[pgn] || [];
          parts.push(/^S[dhn]/.test(mp) ? "H9011" : (morphParts[0].startsWith("N") || morphParts[0].startsWith("A") ? pair[0] : pair[1]) || "H9050");
        } else parts.push(lemma[li++] || "");
      }
      const found = parts.findIndex(p => p && !/^H90\d\d$/.test(p));
      const rootAt = found < 0 ? parts.length - 1 : found;   // ל/וֹ is all prefix and suffix: the suffix is the root, as in TAHOT
      const strongs = parts.map((p, i) => (i === rootAt ? `{${p}}` : p)).filter(Boolean).join("/");
      rows.push({ n: rows.length + 1, type: "L", he: w[2], gloss: "", strongs, morph, ketiv: attr("data-ketiv") || null });
    }
    if (rows.length) out.set(`${v[2]}:${v[3]}`, rows);
  }
  return out;
}

// ---- morphology codes (OSHB's scheme, which TAHOT follows with small additions) ----
// A code is one part per morpheme, split by "/": Hc/Vqw3ms = vav consecutive + verb Qal wayyiqtol 3ms.
export const STEMS = { q: "Qal", N: "Niphal", p: "Piel", P: "Pual", h: "Hiphil", H: "Hophal", t: "Hithpael", o: "Polel", O: "Polal", r: "Hithpolel", m: "Poel", M: "Poal", k: "Palel", K: "Pulal", Q: "Qal passive", l: "Pilpel", L: "Polpal", f: "Hithpalpel", D: "Nithpael", j: "Pealal", i: "Pilel", u: "Hothpaal", c: "Tiphil", v: "Hishtaphel", w: "Nithpalel", y: "Nithpoel", z: "Hithpoel" };
export const STEM_HINTS = { q: "simple action", N: "passive or reflexive", p: "intensive", P: "intensive, passive", h: "causing", H: "causing, passive", t: "reflexive", Q: "simple action, passive", o: "intensive", O: "intensive, passive", r: "reflexive", v: "reflexive" };
export const FORMS = {
  p: ["perfect", "completed action, usually past"], q: ["sequential perfect (weqatal)", "carries the story on; usually future or a command"],
  i: ["imperfect", "ongoing or future"], u: ["conjunctive imperfect (weyiqtol)", "so that …, may …"], w: ["narrative past (wayyiqtol)", "the usual past tense of a story"],
  h: ["cohortative", "let me, let us"], j: ["jussive", "let it; a wish or a command"], v: ["imperative", "a command"],
  r: ["active participle", "-ing; one who"], s: ["passive participle", "-ed; being"],
  a: ["infinitive absolute", "the bare verb, for emphasis"], c: ["infinitive construct", "to …"],
};
export const PARTICLES = { a: "affirmation", c: "conditional (if, for)", d: "the definite article (the)", e: "exhortation", i: "a question word", j: "an interjection", m: "demonstrative (this, that)", n: "negative (not)", o: "the object marker (אֶת)", r: "relative (which, that)" };
export const PERSON = { 1: "1st person", 2: "2nd person", 3: "3rd person" };
export const GENDER = { m: "masculine", f: "feminine", c: "common", b: "either gender" };
export const NUMBER = { s: "singular", p: "plural", d: "dual" };
export const STATE = { a: "absolute", c: "construct", d: "definite" };

function pgn(s, seg) { if (/^[123]/.test(s)) { seg.p = +s[0]; s = s.slice(1); } if (s[0] && GENDER[s[0]]) { seg.g = s[0]; s = s.slice(1); } if (s[0] && NUMBER[s[0]]) { seg.n = s[0]; s = s.slice(1); } return s; }
function gns(s, seg) { if (s[0] && GENDER[s[0]]) { seg.g = s[0]; s = s.slice(1); } if (s[0] && NUMBER[s[0]]) { seg.n = s[0]; s = s.slice(1); } if (s[0] && STATE[s[0]]) { seg.st = s[0]; s = s.slice(1); } return s; }

export function decodeMorph(code) {
  const s = String(code == null ? "" : code).replace(/^[HA]/, "");
  if (!s) return [];
  return s.split("/").map(part => {
    const k = part[0], rest = part.slice(1);
    switch (k) {
      case "c": return { k: "c" };
      case "C": return { k: "C" };
      case "D": return { k: "D" };
      case "R": return rest === "d" ? { k: "R", def: true } : { k: "R" };
      case "T": return { k: "T", kind: rest[0] || "" };
      case "V": { const seg = { k: "V", stem: rest[0], form: rest[1] }; const tail = rest.slice(2); if (seg.form === "r" || seg.form === "s") gns(tail, seg);
        else if (seg.form === "c" && /^[123]/.test(tail)) { seg.form = "h"; pgn(tail, seg); }   // TAHOT writes the cohortative as c + person (Vqc1cs)
        else if (!((seg.form === "a" || seg.form === "c") && /^[ac]?$/.test(tail))) pgn(tail, seg);   // an infinitive (Vqcc, Vqaa) has no person, gender or number
        return seg; }
      case "N": { const seg = { k: "N", kind: rest[0] }; const tail = rest.slice(1); if (seg.kind === "p") { if (tail[0]) seg.pk = tail[0]; } else gns(tail, seg); return seg; }
      case "A": { const seg = { k: "A", kind: rest[0] }; gns(rest.slice(1), seg); return seg; }
      case "P": { const seg = { k: "P", kind: rest[0] }; pgn(rest.slice(1), seg); return seg; }
      case "S": { const seg = { k: "S", kind: rest[0] }; if (seg.kind === "p") pgn(rest.slice(1), seg); return seg; }
      default: return { k: k || "?", raw: part };
    }
  });
}

/** A row's root dStrong (the braced one), or null. */
export const rootOf = row => { const m = /\{(H\d{4}[A-Za-z]?)\}/.exec(String(row && row.strongs || "")); return m ? m[1] : null; };

/** The row's morphemes: the decoded code zipped with its Hebrew pieces, glosses and dStrongs. */
export function segmentsOf(row) {
  const he = String(row.he || "").split("/"), gl = String(row.gloss || "").split("/").map(s => s.trim());
  const lem = String(row.strongs || "").split("/"), morph = decodeMorph(row.morph);
  return he.map((t, i) => {
    const seg = { ...(morph[i] || {}), t };
    if (!morph[i]) return { t };
    if (gl[i] != null && gl[i] !== "") seg.gl = gl[i];
    if (lem[i]) { seg.lem = lem[i].replace(/[{}]/g, ""); if (/^\{/.test(lem[i])) seg.root = true; }
    return seg;
  });
}

// ---- alignment: the page's words against the source's rows, by consonant skeleton ----
function lcs(a, b) {
  const n = a.length, m = b.length, dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const pairs = [];
  let i = 0, j = 0;
  while (i < n && j < m) { if (a[i] === b[j]) { pairs.push([i, j]); i++; j++; } else if (dp[i + 1][j] >= dp[i][j + 1]) i++; else j++; }
  return pairs;
}

/** pairs[i] = [page word index, row index]; missing = page words with no row. Nothing is guessed. */
export function alignVerse(pageWords, rows) {
  const pa = pageWords.map(skeleton), ra = rows.map(r => skeleton(String(r.he || "").replace(/\//g, "")));
  const pairs = lcs(pa, ra);
  const hit = new Set(pairs.map(p => p[0]));
  return { pairs, missing: pageWords.map((_, i) => i).filter(i => !hit.has(i)) };
}

// ---- the cache: STEP's files and OSHB's, outside the repo ----
export const cacheDir = (env = process.env, home = homedir()) => env.HAFTARAH_CACHE || join(home, ".haftarah-cache");
// Pinned to the commits the cache was downloaded from, so a later upstream change never alters a week unnoticed.
export const STEP_SHA = "bd09545c7a44b39ace20f16c0359915f2aa23a62";
export const OSHB_SHA = "3d15126fb1ef74867fc1434be1942e837932691f";
const STEP_RAW = `https://raw.githubusercontent.com/STEPBible/STEPBible-Data/${STEP_SHA}/`;
const tahotUrl = group => `${STEP_RAW}Translators%20Amalgamated%20OT%2BNT/${encodeURIComponent(`TAHOT ${group} - Translators Amalgamated Hebrew OT - STEPBible.org CC BY.txt`)}`;
export const STEP_FILES = {
  "Gen-Deu": { file: "step/TAHOT-Gen-Deu.txt", url: tahotUrl("Gen-Deu") },
  "Jos-Est": { file: "step/TAHOT-Jos-Est.txt", url: tahotUrl("Jos-Est") },
  "Job-Sng": { file: "step/TAHOT-Job-Sng.txt", url: tahotUrl("Job-Sng") },
  "Isa-Mal": { file: "step/TAHOT-Isa-Mal.txt", url: tahotUrl("Isa-Mal") },
  TBESH: { file: "step/TBESH.txt", url: `${STEP_RAW}Lexicons/${encodeURIComponent("TBESH - Translators Brief lexicon of Extended Strongs for Hebrew - STEPBible.org CC BY.txt")}` },
};
export const oshbFile = osis => ({ file: `oshb/${osis}.xml`, url: `https://raw.githubusercontent.com/openscriptures/morphhb/${OSHB_SHA}/wlc/${osis}.xml` });
const urlOf = file => Object.values(STEP_FILES).find(f => f.file === file)?.url || (file.startsWith("oshb/") ? oshbFile(basename(file, ".xml")).url : null);
const exists = p => access(p).then(() => true, () => false);

/** The cache paths of `files` (relative names), downloading each one the cache lacks; whole files only. */
export async function ensureFiles(files, { dir, fetchImpl = globalThis.fetch, log = console.log } = {}) {
  const out = [];
  for (const file of files) {
    const path = join(dir, file);
    if (!(await exists(path))) {
      const url = urlOf(file);
      if (!url) throw new Error(`${file}: no known source`);
      log(`downloading ${file} from ${url.replace(/%20/g, " ")}`);
      let res;
      try { res = await fetchImpl(url); } catch (err) { throw new Error(`${file}: network error: ${err.cause?.code || err.message}`); }
      if (!res.ok) throw new Error(`${file}: HTTP ${res.status} from ${url}`);
      await mkdir(dirname(path), { recursive: true });
      const tmp = `${path}.part`;
      try {
        await writeFile(tmp, Buffer.from(await res.arrayBuffer()));
        await rename(tmp, path);
      } catch (err) { await rm(tmp, { force: true }); throw err; }
    }
    out.push(path);
  }
  return out;
}

// ---- the frequency table: how often each dictionary word is tagged in the whole Hebrew Bible ----
const FREQ_ROW = /^[A-Za-z0-9]+\.\d+\.\d+(?:\(\d+\.\d+\))?#\d+=(\S*)\t[^\t\n]*\t[^\t\n]*\t[^\t\n]*\t([^\t\n]*)\t/gm;
export function frequencyTable(texts) {
  const freq = {};
  for (const text of texts) {
    FREQ_ROW.lastIndex = 0;
    let m;
    while ((m = FREQ_ROW.exec(text))) {
      if (m[1].startsWith("X")) continue;
      const lem = (/\{(H\d{4}[A-Za-z]?)\}/.exec(m[2]) || [])[1];
      if (lem) freq[lem] = (freq[lem] || 0) + 1;
    }
  }
  return freq;
}
async function loadFrequency() { try { return JSON.parse(await readFile(FREQUENCY_FILE, "utf8")); } catch { return {}; } }

// ---- words.json for one sheet ----
// A tag between two Hebrew letters of one word (MAM's <big>/<small> letters, a split trope span): the
// page keeps such a word whole (sheet.js wrapWords); publish names the verse so a split can be looked at.
const MARKS = "[\\u0591-\\u05BD\\u05BF\\u05C1\\u05C2\\u05C4\\u05C5\\u05C7]*";
const TAG_IN_WORD = new RegExp(`[א-ת]${MARKS}(?:<[^>]+>)+${MARKS}[א-ת]`);
export const tagInWord = heHtml => TAG_IN_WORD.test(String(heHtml == null ? "" : heHtml));

/**
 * sheet → { words, report }. `rows` holds, per reading id, the source's rows keyed "<ch>:<v>"; `lexicon`
 * is TBESH (a Map; empty for OSHB); `frequency` the table. A verse with words and no rows is an error
 * (nothing is guessed); a word that does not align is left out of its verse and named.
 */
export function wordsFor(sheet, { source = "tahot", rows, lexicon = new Map(), frequency = {} }) {
  const words = { schema: 1, slug: sheet.slug || "", source, credit: CREDITS[source], readings: {}, lemmas: {} };
  const report = { readings: {} };
  const lemma = d => { if (!(d in words.lemmas)) { const x = lexicon.get(d) || { he: "", gloss: "" }; words.lemmas[d] = { he: x.he, gloss: x.gloss, ...(frequency[d] ? { all: frequency[d] } : {}) }; } };
  for (const r of L.readings(sheet)) {
    if (!(r.verses || []).length) continue;
    const model = L.readingModel(sheet, r.id);
    const src = rows[r.id] || new Map();
    const out = { book: r.book || "", verses: {}, missing: [] };
    const rep = { words: 0, aligned: 0, missing: [], tagInWord: [] };
    for (const v of model.verses) {
      const page = L.verseWords(v.heHtml).map(w => w.text);
      if (!page.length) continue;
      const key = `${v.chapter}:${v.verse}`;
      if (tagInWord(v.heHtml)) rep.tagInWord.push(key);
      const vr = src.get(key);
      if (!vr || !vr.length) throw new Error(`words: ${r.book} ${key} has no rows in ${source}; STEP numbers verses by the English Bible, check the bracketed Hebrew refs`);
      const { pairs, missing } = alignVerse(page, vr);
      rep.words += page.length; rep.aligned += pairs.length;
      for (const i of missing) { out.missing.push(`${key}/${i}`); rep.missing.push(`${key}/${i} ${page[i]}`); }
      out.verses[key] = pairs.map(([i, j]) => {
        const row = vr[j], lem = rootOf(row);
        const seg = segmentsOf(row);
        for (const s of seg) if (s.lem) lemma(s.lem);
        return { i, seg, lem, morph: row.morph || "", ketiv: row.ketiv || null };
      });
    }
    words.readings[r.id] = out;
    report.readings[r.id] = rep;
  }
  return { words, report };
}

/** Read dir/sheet.json, load the sources from the cache, write dir/words.json, log one line per reading. */
export async function buildWords(dir, { source = "tahot", cache = cacheDir(), fetchImpl = globalThis.fetch, log = console.log, frequency = null } = {}) {
  const sheet = JSON.parse(await readFile(join(dir, "sheet.json"), "utf8"));
  const rows = {}, texts = new Map();
  const text = async file => { if (!texts.has(file)) texts.set(file, readFile((await ensureFiles([file], { dir: cache, fetchImpl, log }))[0], "utf8")); return texts.get(file); };
  for (const r of L.readings(sheet)) {
    if (!(r.verses || []).length) continue;
    const book = BOOKS[r.book];
    if (!book) throw new Error(`words: no word data for the book "${r.book}"`);
    rows[r.id] = source === "oshb" ? parseOshb(await text(oshbFile(book.osis).file), book.osis) : parseTahot(await text(STEP_FILES[book.group].file), book.step);
  }
  const lexicon = source === "oshb" ? new Map() : parseTbesh(await text(STEP_FILES.TBESH.file));
  const { words, report } = wordsFor(sheet, { source, rows, lexicon, frequency: frequency || (await loadFrequency()) });
  const file = join(dir, "words.json");
  const tmp = `${file}.part`;
  try {
    await writeFile(tmp, JSON.stringify(words));
    await rename(tmp, file);
  } catch (err) { await rm(tmp, { force: true }); throw err; }
  for (const [id, rep] of Object.entries(report.readings)) {
    log(`words    ${id}  ${rep.words} words, ${rep.aligned} with analysis, ${rep.missing.length} missing${rep.missing.length ? `: ${rep.missing.join(", ")}` : ""}`);
    if (rep.tagInWord.length) log(`words    ${id}  warning: a tag inside a word in ${rep.tagInWord.join(", ")} (the page keeps the word whole; check its analysis)`);
  }
  return { file, report };
}

/** Alignment coverage for a live reference (the MAM Hebrew from Sefaria, GET only), for the wave's checks. */
export async function checkRef(ref, { cache = cacheDir(), fetchImpl = globalThis.fetch, log = console.log } = {}) {
  const res = await fetchImpl(`https://www.sefaria.org/api/v3/texts/${encodeURIComponent(ref.replace(/\s+/g, " "))}?version=hebrew|${encodeURIComponent("Miqra according to the Masorah")}&return_format=default`);
  if (!res.ok) throw new Error(`Sefaria answered HTTP ${res.status} for ${ref}`);
  const tx = await res.json();
  const he = (tx.versions || [])[0];
  if (!he) throw new Error(`Sefaria has no Hebrew for ${ref}`);
  const book = tx.book || ref.replace(/\s+\d.*$/, ""), info = BOOKS[book];
  if (!info) throw new Error(`no word data for the book "${book}"`);
  const startCh = +tx.sections[0], startV = +(tx.sections[1] ?? 1), verses = [];
  const text = Array.isArray(he.text) ? he.text : [he.text];   // a single verse comes back as a string
  if (text.length && Array.isArray(text[0])) text.forEach((ch, ci) => ch.forEach((t, vi) => verses.push({ chapter: startCh + ci, verse: (ci === 0 ? startV : 1) + vi, he: t })));
  else text.forEach((t, vi) => verses.push({ chapter: startCh, verse: startV + vi, he: t }));
  const rows = parseTahot(await readFile((await ensureFiles([STEP_FILES[info.group].file], { dir: cache, fetchImpl, log }))[0], "utf8"), info.step);
  let words = 0, aligned = 0; const missing = [];
  for (const v of verses) {
    const page = L.verseWords(String(v.he).replace(/<span class="mam-spi-[^"]*">\{[ספ]\}<\/span>/g, " ")).map(w => w.text);
    const a = alignVerse(page, rows.get(`${v.chapter}:${v.verse}`) || []);
    words += page.length; aligned += a.pairs.length;
    for (const i of a.missing) missing.push(`${v.chapter}:${v.verse}/${i} ${page[i]}`);
  }
  log(`${ref}: ${words} words, ${aligned} with analysis (${(100 * aligned / Math.max(1, words)).toFixed(1)}%)${missing.length ? `; missing: ${missing.join(", ")}` : ""}`);
  return { words, aligned, missing };
}

/** The CLI's line for an error: "words: " once, never twice. */
export const cliMessage = err => { const m = String((err && err.message) || err); return m.startsWith("words: ") ? m : `words: ${m}`; };

/** The CLI's arguments: { dir, source, download, frequency, check } (check: the refs after --check, or null). */
export function parseWordsArgs(argv) {
  const args = argv.slice();
  let source = null, sourceAt = -1;
  for (let i = 0; i < args.length; i++) {
    const m = /^--source(?:=(.*))?$/.exec(args[i]);
    if (!m) continue;
    if (m[1] != null) source = m[1];
    else { sourceAt = i + 1; source = args[i + 1] != null && !args[i + 1].startsWith("--") ? args[i + 1] : ""; }
    if (!source) throw new Error("--source needs tahot or oshb");
    if (!["tahot", "oshb"].includes(source)) throw new Error(`--source: tahot or oshb, not ${source}`);
  }
  const checkAt = args.indexOf("--check");
  const check = checkAt < 0 ? null : args.slice(checkAt + 1).filter(a => !a.startsWith("--"));
  const dir = checkAt >= 0 ? null : args.find((a, i) => !a.startsWith("--") && i !== sourceAt) || null;
  return { dir, source: source || "tahot", download: args.includes("--download"), frequency: args.includes("--frequency"), check };
}

async function main(argv) {
  const a = parseWordsArgs(argv.slice(2));
  const cache = cacheDir();
  if (a.download) { await ensureFiles(Object.values(STEP_FILES).map(f => f.file), { dir: cache }); console.log(`STEP files are in ${cache}`); return; }
  if (a.frequency) {
    const paths = await ensureFiles(["Gen-Deu", "Jos-Est", "Job-Sng", "Isa-Mal"].map(g => STEP_FILES[g].file), { dir: cache });
    const table = frequencyTable(await Promise.all(paths.map(p => readFile(p, "utf8"))));
    await mkdir(dirname(FREQUENCY_FILE), { recursive: true });
    await writeFile(FREQUENCY_FILE, JSON.stringify(Object.fromEntries(Object.entries(table).sort(([a], [b]) => a.localeCompare(b)))) + "\n");
    console.log(`${Object.keys(table).length} dictionary words → ${FREQUENCY_FILE}`);
    return;
  }
  if (a.check) { for (const ref of a.check) await checkRef(ref, { cache }); return; }
  if (!a.dir) throw new Error("usage: node scripts/words.mjs weeks/<slug> [--source tahot|oshb] | --download | --frequency | --check \"<ref>\" ...");
  await buildWords(a.dir, { source: a.source, cache });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main(process.argv).catch(err => { console.error(cliMessage(err)); process.exit(1); });
}
