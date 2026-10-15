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
const TAHOT_ROW = /^([A-Za-z0-9]+)\.(\d+)\.(\d+)(?:\((\d+)\.(\d+)\))?#(\d+)=(\S*)\t([^\t\n]*)\t[^\t\n]*\t([^\t\n]*)\t([^\t\n]*)\t([^\t\n]*)\t([^\t\n]*)/gm;
// groups: 1 book, 2 ch, 3 v, 4 heCh, 5 heV, 6 n, 7 type, 8 hebrew, (transliteration skipped), 9 gloss, 10 dStrongs, 11 morph, 12 meaning variants
const KETIV_IN_VARIANT = /K=\s*\S+\s*\(([^)]*)\)/;

export function parseTahot(text, stepCode) {
  const out = new Map();
  TAHOT_ROW.lastIndex = 0;
  let m;
  while ((m = TAHOT_ROW.exec(text))) {
    if (m[1] !== stepCode || m[7].startsWith("X")) continue;
    const ch = m[4] ? +m[4] : +m[2], v = m[5] ? +m[5] : +m[3];
    const key = `${ch}:${v}`;
    if (!out.has(key)) out.set(key, []);
    const kv = m[7].startsWith("Q") ? KETIV_IN_VARIANT.exec(m[12]) : null;
    out.get(key).push({ n: +m[6], type: m[7], he: m[8].split("\\")[0], gloss: m[9], strongs: m[10].split("\\")[0], morph: m[11], ketiv: kv ? kv[1] : null });
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

export function parseOshb(xml, osisCode) {
  const out = new Map();
  const verseRe = /<verse osisID="([A-Za-z0-9]+)\.(\d+)\.(\d+)">([\s\S]*?)<\/verse>/g;
  let v;
  while ((v = verseRe.exec(xml))) {
    if (v[1] !== osisCode) continue;
    const body = v[4].replace(/<w type="x-ketiv"[^>]*>([^<]*)<\/w><note type="variant">[\s\S]*?<rdg type="x-qere">(<w [^>]*>[^<]*<\/w>)<\/rdg><\/note>/g, (_, k, qw) => qw.replace(/^<w /, `<w data-ketiv="${k}" `));
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
  i: ["imperfect", "ongoing or future"], w: ["narrative past (wayyiqtol)", "the usual past tense of a story"],
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
      case "V": { const seg = { k: "V", stem: rest[0], form: rest[1] }; const tail = rest.slice(2); if (seg.form === "r" || seg.form === "s") gns(tail, seg); else if (seg.form !== "a" && seg.form !== "c") pgn(tail, seg); return seg; }   // an infinitive has no person, gender or number
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
