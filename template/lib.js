/* lib.js — pure functions shared by the renderer (browser) and the tests (Node).
   UMD: window.HaftarahLib in the browser, module.exports in Node. No DOM here. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.HaftarahLib = factory();
})(typeof self !== "undefined" ? self : globalThis, function () {
  "use strict";

  // Any Tetragrammaton, with any pointing (including the Elohim pointing).
  const TETRA = /י[֑-ׇ]*ה[֑-ׇ]*ו[֑-ׇ]*ה[֑-ׇ]*/g;

  // יי, with the verse's cantillation marks (U+0591–U+05AE) kept on the second yud.
  function divineName(html) {
    let count = 0;
    const out = String(html == null ? "" : html).replace(TETRA, m => {
      count++;
      const accents = (m.match(/[֑-֮]/g) || []).join("");
      return "יי" + accents;
    });
    return { html: out, count };
  }

  function stripMarks(s) {
    return String(s).normalize("NFD").replace(/[֑-ֽֿ-ׇ]/g, "").normalize("NFC");
  }

  // ---- tolerant matching of lemmas against verse text --------------------------
  // A lemma typed or pasted into sheet.json can differ from the stored verse in invisible ways:
  // the order of stacked marks (dagesh before or after the vowel), a combining grapheme joiner,
  // a meteg or cantillation mark, qamats qatan for qamats. Matching compares normalized keys and
  // always reports the exact stretch of the verse, so the keying mark lands in the real text.

  // A Hebrew word: letters and the marks on them. Maqaf, paseq, sof pasuq and nun hafukha separate words.
  const HE_WORD = /[א-תװ-ײיִ-ﭏ֑-ׇֽֿׁׂׅׄ͏‌‍]+/g;

  // Vowels kept; cantillation, meteg, upper/lower dots and joiners dropped; marks in canonical order.
  function hebrewKey(s) {
    return String(s == null ? "" : s).normalize("NFD")
      .replace(/[֑-ֽׅ֯ׄ͏‌‍]/g, "")
      .replace(/ׇ/g, "ָ")      // qamats qatan → qamats
      .replace(/ֺ/g, "ֹ")      // holam haser for vav → holam
      .normalize("NFD");
  }
  // Consonants only (the renderer's old last resort, kept as the third level).
  const consonantKey = s => stripMarks(s).replace(/[־׀׃׆]/g, "");

  function hebrewWords(s) {
    const out = [];
    const re = new RegExp(HE_WORD.source, "g");
    let m;
    while ((m = re.exec(String(s == null ? "" : s)))) if (/[א-תיִ-ﭏ]/.test(m[0])) out.push({ text: m[0], start: m.index, end: m.index + m[0].length });
    return out;
  }

  // Where a Hebrew lemma sits in a verse's HTML. Returns { start, end, text, level } or null;
  // level is "exact" (the string itself), "normalized" (same pointing, different mark order,
  // accents or meteg) or "consonantal" (same letters, different pointing). `text` is the exact
  // stretch of the verse to use as the lemma.
  function findHebrew(html, lemma) {
    html = String(html == null ? "" : html); lemma = String(lemma == null ? "" : lemma).trim();
    if (!lemma) return null;
    const i = html.indexOf(lemma);
    if (i >= 0) return { start: i, end: i + lemma.length, text: lemma, level: "exact" };
    const want = hebrewWords(lemma), have = hebrewWords(html);
    if (!want.length) return null;
    for (const [level, key] of [["normalized", hebrewKey], ["consonantal", consonantKey]]) {
      const w = want.map(x => key(x.text)), h = have.map(x => key(x.text));
      for (let k = 0; k + w.length <= h.length; k++) {
        if (w.every((x, j) => x === h[k + j])) {
          const start = have[k].start, end = have[k + w.length - 1].end;
          return { start, end, text: html.slice(start, end), level };
        }
      }
    }
    return null;
  }

  // The visible text of an English cell, with each character mapped back to its HTML offset.
  // Footnote keys (<sup>…</sup>) are skipped whole and reported separately; a few entities decode;
  // curly quotes fold to straight ones and runs of space collapse, so a pasted phrase still matches.
  const ENTITIES = { "&nbsp;": " ", "&thinsp;": " ", "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'" };
  function plainText(html) {
    html = String(html == null ? "" : html);
    let text = "";
    const at = [], endAt = [], sups = [];
    let i = 0;
    while (i < html.length) {
      if (html[i] === "<") {
        const sup = /^<sup\b[^>]*>([\s\S]*?)<\/sup>/i.exec(html.slice(i));
        if (sup) { sups.push({ pos: text.length, key: sup[1].replace(/<[^>]+>/g, ""), start: i, end: i + sup[0].length }); i += sup[0].length; continue; }
        const close = html.indexOf(">", i);
        if (/^<br\b/i.test(html.slice(i, i + 4)) && !/ $/.test(text)) { text += " "; at.push(i); endAt.push(close + 1); }
        i = close < 0 ? html.length : close + 1;
        continue;
      }
      let ch = html[i], len = 1;
      if (ch === "&") {
        const ent = /^&[#\w]+;/.exec(html.slice(i, i + 10));
        if (ent) { ch = ENTITIES[ent[0]] != null ? ENTITIES[ent[0]] : " "; len = ent[0].length; }
      }
      ch = ch.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[\s  ]/, " ");
      if (ch === " " && (!text.length || text.endsWith(" "))) { i += len; continue; }
      text += ch; at.push(i); endAt.push(i + len);
      i += len;
    }
    return { text, at, endAt, sups };
  }
  const foldPhrase = s => plainText(s).text.trim();

  // Where an English phrase sits in a verse's HTML: { start, end, pStart, pEnd, level } or null.
  // `end` is past any closing tag the phrase opened (G<small>OD</small>), so a key placed there
  // is not set small. pStart/pEnd are offsets in plainText(html).text.
  function findEnglish(html, phrase) {
    html = String(html == null ? "" : html);
    const want = foldPhrase(phrase);
    if (!want) return null;
    const p = plainText(html);
    let k = p.text.indexOf(want), level = "normalized";
    if (k < 0) { k = p.text.toLowerCase().indexOf(want.toLowerCase()); level = "case"; }
    if (k < 0) return null;
    const start = p.at[k];
    let end = p.endAt[k + want.length - 1];
    // Elements opened inside the phrase and not yet closed (closings of outer elements don't count).
    let open = 0;
    for (const t of html.slice(start, end).match(/<\/?[a-z][^>]*>/gi) || []) {
      if (t[1] === "/") { if (open) open--; } else if (!/^<(br|img|wbr)\b/i.test(t) && !t.endsWith("/>")) open++;
    }
    let m;
    while (open > 0 && (m = /^<\/[a-z]+>/i.exec(html.slice(end)))) { end += m[0].length; open--; }
    if (html.slice(start, end) === String(phrase)) level = "exact";
    return { start, end, pStart: k, pEnd: k + want.length, level };
  }

  // JPS poetry arrives with <br> between lines. Prose has none.
  function splitPoetry(en) {
    return String(en == null ? "" : en)
      .split(/<br\s*\/?>/i)
      .map(s => s.trim())
      .filter(s => s.length);
  }

  // A footnote key, and any dash or punctuation after it, never separates from its word.
  function nowrapKeys(html) {
    return String(html == null ? "" : html).replace(
      /([^\s<>]+)(<sup class="fn">[a-z]+<\/sup>)([—–\-,;:.!?”’)]*)/g,
      '<span class="nb">$1$2$3</span>'
    );
  }

  function letterFor(i) {
    let n = i + 1, s = "";
    while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(97 + r) + s; n = Math.floor((n - 1) / 26); }
    return s;
  }

  // A JPS note that only points elsewhere in the book is dead on a handout, unless the verse it
  // points to is part of this week's reading (range: { chapter, verse, endChapter, endVerse }).
  function isDeadRef(text, range) {
    const t = String(text == null ? "" : text).replace(/<[^>]+>/g, "").trim();
    const pointer = /^(See|Cf\.?|Compare)\b/i.test(t) && /\b\d+\.\d+/.test(t) && !/[“"]/.test(t) && !/\bv{1,2}\./i.test(t);
    if (!pointer) return false;
    if (!range) return true;
    const refs = [...t.matchAll(/\b(\d{1,3})\.(\d{1,3})(?!\d)/g)].map(m => [Number(m[1]), Number(m[2])]);
    const after = ([c, v]) => c > range.chapter || (c === range.chapter && v >= range.verse);
    const before = ([c, v]) => c < range.endChapter || (c === range.endChapter && v <= range.endVerse);
    return !refs.some(r => after(r) && before(r));
  }

  // JPS writes 19.2; the sheet writes 19:2. Years (four digits) are not refs.
  function normalizeRefs(text) {
    return String(text == null ? "" : text).replace(/\b(\d{1,3})\.(\d{1,3})(?!\d)/g, "$1:$2");
  }

  // One letter series per sheet, in reading order: a verse's JPS notes first (in the order
  // they appear in the English), then its glosses. Dead JPS notes are dropped with their key.
  function assignKeys(verses, glosses, isVisible) {
    let i = 0;
    const sequence = [];
    const first = verses[0], last = verses[verses.length - 1];
    const range = first ? { chapter: first.chapter, verse: first.verse, endChapter: last.chapter, endVerse: last.verse } : null;
    const out = verses.map(v => {
      let en = String(v.en == null ? "" : v.en);
      const keys = [];
      for (const n of (v.notes || [])) {
        const sup = `<sup class="fn">${n.marker}</sup>`;
        if (isDeadRef(n.text, range)) { en = en.replace(sup, ""); continue; }
        const key = letterFor(i++);
        sequence.push(key);
        en = en.replace(sup, `<sup class="fn">@@${key}@@</sup>`);
        keys.push({ key, kind: "jps", lemma: n.lemma || "", text: normalizeRefs(n.text), verse: v.verse, chapter: v.chapter });
      }
      const mine = (glosses || []).filter(g => g.verse === v.verse && (g.chapter == null || g.chapter === v.chapter) && isVisible(g));
      for (const g of mine) {
        const key = letterFor(i++);
        sequence.push(key);
        const sup = `<sup class="fn">@@${key}@@</sup>`;
        const hit = g.en ? findEnglish(en, g.en) : null;
        if (hit) en = en.slice(0, hit.end) + sup + en.slice(hit.end);
        else en = en + sup;
        keys.push({ key, kind: "gloss", lemma: g.en || "", he: g.lemma, text: g.text, verse: v.verse, chapter: v.chapter, status: g.status });
      }
      en = en.replace(/@@([a-z]+)@@/g, "$1");
      return Object.assign({}, v, { en, keys });
    });
    return { verses: out, sequence };
  }

  // Register sigla: one filled family at one weight, so no register shouts.
  const SIGLA = {
    traditional: '<svg viewBox="0 0 10 10" aria-hidden="true"><rect x="1.5" y="1.5" width="7" height="7" fill="currentColor"/></svg>',
    modern: '<svg viewBox="0 0 10 10" aria-hidden="true"><circle cx="5" cy="5" r="3.6" fill="currentColor"/></svg>',
    critical: '<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M5 1.2 L9.3 8.8 H0.7 Z" fill="currentColor"/></svg>',
    reference: '<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M5 0.8 L9.2 5 L5 9.2 L0.8 5 Z" fill="currentColor"/></svg>',
  };
  const REGISTER_ORDER = ["traditional", "modern", "critical", "reference"];
  const REGISTER_NAMES = { traditional: "classical commentators", modern: "modern commentators", critical: "what historians say", reference: "reference" };

  // The voices.json key that identifies a source: the longest key the name starts with, ending at a
  // word boundary ("Midrash Tehillim 87" is Midrash Tehillim, not Midrash; "Talmudic" is nothing).
  function voiceKey(name, voices) {
    const fold = s => String(s || "").trim().toLowerCase().replace(/[‘’ʼ`]/g, "'");
    const n = fold(name);
    let best = null;
    for (const k of Object.keys(voices || {})) {
      const kl = fold(k);
      if (n.startsWith(kl) && !/[a-z]/i.test(n.charAt(kl.length)) && (!best || k.length > best.length)) best = k;
    }
    return best;
  }

  // One line per named source used this week, in order of first use. Drafted titles (critical
  // and reference entries) are not voices. A source written "Key, ref" ("Talmud, Berakhot 10a")
  // joins the line for its key, which lists the refs: { name: "Talmud", refs: ["Berakhot 10a"] }.
  // Unknown sources return line: null so the build can warn.
  function voicesFor(commentary, voices, isVisible) {
    const seen = new Map();
    for (const e of commentary || []) {
      if (!isVisible(e)) continue;
      if (e.register === "critical" || e.register === "reference") continue;
      const name = String(e.source || "").trim();
      if (!name) continue;
      const key = voiceKey(name, voices);
      const rest = key ? name.slice(key.length) : "";
      const grouped = key && /^\s*,/.test(rest);
      const id = grouped ? key : name;
      if (!seen.has(id)) seen.set(id, { name: id, refs: [], line: key ? voices[key] : null });
      const ref = grouped ? rest.replace(/^\s*,\s*/, "").trim() : "";
      const v = seen.get(id);
      if (ref && !v.refs.includes(ref)) v.refs.push(ref);
    }
    return [...seen.values()];
  }

  // The incipit fits a 3.5in box beside the 1.6in mural: 54pt at most, 40pt at least on one line; otherwise two lines at 44pt.
  function fitIncipitSize(widthAt60pt, boxWidth) {
    const size = Math.floor(60 * boxWidth / widthAt60pt);
    if (size >= 54) return { size: 54, lines: 1 };
    if (size >= 40) return { size, lines: 1 };
    return { size: 44, lines: 2 };
  }

  // "- key: McCarter 1980 | citation | use" → Map(key → { citation, use })
  function parseBibliography(md) {
    const map = new Map();
    for (const line of String(md == null ? "" : md).split(/\r?\n/)) {
      const m = line.match(/^-\s*key:\s*([^|]+?)\s*\|\s*([^|]+?)\s*(?:\|\s*(.*?))?\s*$/);
      if (m) map.set(m[1], { citation: m[2], use: m[3] || "" });
    }
    return map;
  }

  return { TETRA, divineName, stripMarks, splitPoetry, nowrapKeys, letterFor, isDeadRef, normalizeRefs, assignKeys, SIGLA, REGISTER_ORDER, REGISTER_NAMES, voicesFor, voiceKey, hebrewKey, hebrewWords, findHebrew, plainText, findEnglish, fitIncipitSize, parseBibliography };
});
