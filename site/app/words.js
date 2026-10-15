// The word panel's words (spec 5.5): a plain-English sentence first, the Hebrew grammatical term after,
// composed from the fields words.json carries. Pure; tests/web.test.mjs holds the tables equal to
// scripts/words.mjs's (site/ cannot import from scripts/).
export const STEMS = { q: "Qal", N: "Niphal", p: "Piel", P: "Pual", h: "Hiphil", H: "Hophal", t: "Hithpael", o: "Polel", O: "Polal", r: "Hithpolel", m: "Poel", M: "Poal", k: "Palel", K: "Pulal", Q: "Qal passive", l: "Pilpel", L: "Polpal", f: "Hithpalpel", D: "Nithpael", j: "Pealal", i: "Pilel", u: "Hothpaal", c: "Tiphil", v: "Hishtaphel", w: "Nithpalel", y: "Nithpoel", z: "Hithpoel" };
export const STEM_HINTS = { q: "simple action", N: "passive or reflexive", p: "intensive", P: "intensive, passive", h: "causing", H: "causing, passive", t: "reflexive", Q: "simple action, passive", o: "intensive", O: "intensive, passive", r: "reflexive", v: "reflexive" };
export const FORMS = {
  p: ["perfect", "completed action, usually past"], q: ["sequential perfect (weqatal)", "carries the story on; usually future or a command"],
  i: ["imperfect", "ongoing or future"], u: ["conjunctive imperfect (weyiqtol)", "so that …, may …"], w: ["narrative past (wayyiqtol)", "the usual past tense of a story"],
  h: ["cohortative", "let me, let us"], j: ["jussive", "let it; a wish or a command"], v: ["imperative", "a command"],
  r: ["active participle", "-ing; one who"], s: ["passive participle", "-ed; being"],
  a: ["infinitive absolute", "the bare verb, for emphasis"], c: ["infinitive construct", "to …"],
};
export const FORM_LAY = { p: "past tense (completed action)", q: "sequential (carrying the story on)", i: "future or ongoing", w: "narrative past", h: "a wish (let me, let us)", u: "a wish or purpose (so that …, may …)", j: "a wish or command (let it)", v: "a command", r: "a participle (-ing; one who)", s: "a passive participle (-ed)", a: "an infinitive, for emphasis", c: "an infinitive (to …)" };
export const PARTICLES = { a: "affirmation", c: "conditional (if, for)", d: "the definite article (the)", e: "exhortation", i: "a question word", j: "an interjection", m: "demonstrative (this, that)", n: "negative (not)", o: "the object marker (אֶת)", r: "relative (which, that)" };
export const PERSON = { 1: "1st person", 2: "2nd person", 3: "3rd person" };
export const GENDER = { m: "masculine", f: "feminine", c: "common", b: "either gender" };
export const NUMBER = { s: "singular", p: "plural", d: "dual" };
export const STATE = { a: "absolute", c: "construct", d: "definite" };
export const PREFIX_GLOSS = { H9001: "and", H9002: "and", H9003: "in", H9004: "like", H9005: "to", H9006: "from", H9007: "that", H9008: "that", H9009: "the", H9010: "the" };
const SUFFIX_GLOSS = { "1s": "me / my", "2ms": "you / your", "2fs": "you / your", "3ms": "him / his", "3fs": "her", "1p": "us / our", "2mp": "you / your", "2fp": "you / your", "3mp": "them / their", "3fp": "them / their" };

export const isDivine = lem => /^H3068|^H3050/.test(String(lem || ""));
export const cleanGloss = gl => String(gl == null ? "" : gl).replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
const q = s => `‘${s}’`;
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const gn = seg => [seg.g && GENDER[seg.g], seg.n && NUMBER[seg.n]].filter(Boolean).join(" ");
const pgn = seg => [seg.p && PERSON[seg.p], seg.g && seg.g !== "b" && GENDER[seg.g], seg.n && NUMBER[seg.n]].filter(Boolean).join(" ");

function chip(seg, lemmas) {
  const gl = cleanGloss(seg.gl);
  if (gl) return { t: seg.t, text: gl };
  if (seg.k === "S" && seg.kind === "p") return { t: seg.t, text: SUFFIX_GLOSS[`${seg.p || ""}${seg.g === "b" || seg.g === "c" ? "" : seg.g || ""}${seg.n || ""}`] || (lemmas[seg.lem] && lemmas[seg.lem].gloss) || "suffix" };
  if (seg.k === "S") return { t: seg.t, text: seg.kind === "d" ? "to, toward (directional)" : "ending" };
  return { t: seg.t, text: PREFIX_GLOSS[seg.lem] || (lemmas[seg.lem] && lemmas[seg.lem].gloss) || (seg.k === "T" && seg.kind === "d" ? "the" : seg.k === "R" ? "preposition" : "and") };
}

/** The sentence, the detail line, the prefix and suffix chips, and the dictionary word for one words.json entry. */
export function describe(word, lemmas = {}) {
  if (!word || !Array.isArray(word.seg) || !word.seg.length) return { sentence: "No word analysis for this word.", detail: "", before: [], after: [], root: null, code: "" };
  const segs = word.seg;
  let ri = segs.findIndex(s => s.root);
  if (ri < 0) ri = Math.max(0, segs.findIndex(s => s.lem && !/^H90\d\d$/.test(s.lem)));
  const r = segs[ri];
  const before = segs.slice(0, ri).map(s => chip(s, lemmas)), after = segs.slice(ri + 1).map(s => chip(s, lemmas));
  const lem = word.lem || r.lem || "";
  const lx = lemmas[lem] || {};
  const root = { lem, he: lx.he || "", gloss: lx.gloss || "", all: lx.all };
  const gl = cleanGloss(r.gl);
  const said = gl ? `: ${q(gl)}` : "";
  let sentence, detail;
  if (isDivine(lem)) { sentence = "The divine name, יי."; detail = "proper noun"; root.he = "יי"; root.gloss = "the Name"; }
  else switch (r.k) {
    case "V": {
      const lay = FORM_LAY[r.form] || "a verb form", stem = STEMS[r.stem], hint = STEM_HINTS[r.stem];
      sentence = `A verb, ${lay}${said}.${stem ? ` ${cap(hint || stem)}${hint ? ` (${stem})` : ""}.` : ""}`;
      detail = [stem, FORMS[r.form] && FORMS[r.form][0], r.form === "r" || r.form === "s" ? [gn(r), r.st && STATE[r.st]].filter(Boolean).join(" ") : pgn(r)].filter(Boolean).join(" · ");
      break;
    }
    case "N":
      if (r.kind === "p") { sentence = `${r.pk === "l" ? "A place name" : r.pk === "t" ? "A title or name" : "A name"}${said}.`; detail = "proper noun"; }
      else if (r.kind === "g") { sentence = `A people's name${said}.`; detail = "gentilic noun"; }
      else { sentence = `A noun, ${gn(r)}${r.st === "c" ? ", in construct (‘… of’)" : r.st === "d" ? ", definite" : ""}${said}.`; detail = ["noun", [gn(r), r.st && STATE[r.st]].filter(Boolean).join(" ")].filter(Boolean).join(" · "); }
      break;
    case "A":
      sentence = r.kind === "c" ? `A number${said}.` : r.kind === "o" ? `An ordinal number${said}.` : r.kind === "g" ? `A people's name, as an adjective${said}.` : `An adjective, ${gn(r)}${said}.`;
      detail = ["adjective", [gn(r), r.st && STATE[r.st]].filter(Boolean).join(" ")].filter(Boolean).join(" · ");
      break;
    case "P":
      sentence = r.kind === "p" ? `A pronoun, ${pgn(r)}${said}.` : r.kind === "d" ? `A demonstrative (this, that)${said}.` : r.kind === "i" ? `A question word${said}.` : r.kind === "r" ? `A relative pronoun (which, that)${said}.` : `A pronoun${said}.`;
      detail = ["pronoun", pgn(r)].filter(Boolean).join(" · ");
      break;
    case "T": sentence = `A particle, ${PARTICLES[r.kind] || "particle"}${said}.`; detail = "particle"; break;
    case "R": sentence = `A preposition${said}.`; detail = "preposition"; break;
    case "C": case "c": sentence = `A conjunction${said}.`; detail = "conjunction"; break;
    case "D": sentence = `An adverb${said}.`; detail = "adverb"; break;
    case "S": sentence = `A pronoun suffix${r.kind === "p" ? `, ${pgn(r)}` : ""}${said}.`; detail = "suffix"; break;
    default: sentence = gl ? `${q(gl)}.` : "A word."; detail = "";
  }
  return { sentence, detail, before, after, root, code: word.morph || "" };
}

/** Every word of the reading with this dictionary word, in verse order: { key: "20:18", i, gloss }. */
export function occurrences(words, readingId, lem) {
  const verses = (words && words.readings && words.readings[readingId] && words.readings[readingId].verses) || {};
  const out = [];
  for (const [key, list] of Object.entries(verses)) for (const w of list) if (w.lem === lem) { const r = (w.seg || []).find(s => s.root) || (w.seg || [])[0] || {}; out.push({ key, i: w.i, gloss: cleanGloss(r.gl) }); }
  return out.sort((a, b) => { const [ac, av] = a.key.split(":").map(Number), [bc, bv] = b.key.split(":").map(Number); return ac - bc || av - bv || a.i - b.i; });
}
export const hereLine = n => (n === 1 ? "Once in this reading" : `${n} times in this reading`);
export const allLine = all => (all == null ? "" : all === 1 ? "Once in the Hebrew Bible, by dictionary word" : `${all} times in the Hebrew Bible, by dictionary word`);
export const stepUrl = lem => `https://www.stepbible.org/?q=version=OHB|strong=${lem}&options=HNVUG`;
export function bibleHubUrl(lem) {
  const m = /^H(\d{4})([A-Za-z]?)$/.exec(String(lem || ""));
  if (!m || /^90/.test(m[1])) return null;
  return `https://biblehub.com/hebrew/${String(Number(m[1]))}${m[2].toLowerCase()}.htm`;
}
