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
      /(\S+)(<sup class="fn">[a-z]+<\/sup>)([—–\-,;:.!?”’)]*)/g,
      '<span class="nb">$1$2$3</span>'
    );
  }

  function letterFor(i) {
    let n = i + 1, s = "";
    while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(97 + r) + s; n = Math.floor((n - 1) / 26); }
    return s;
  }

  // A JPS note that only points elsewhere in the book is dead on a six-page handout.
  function isDeadRef(text) {
    const t = String(text == null ? "" : text).replace(/<[^>]+>/g, "").trim();
    return /^(See|Cf\.?|Compare)\b/i.test(t) && /\b\d+\.\d+/.test(t) && !/[“"]/.test(t) && !/\bv{1,2}\./i.test(t);
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
    const out = verses.map(v => {
      let en = String(v.en == null ? "" : v.en);
      const keys = [];
      for (const n of (v.notes || [])) {
        const sup = `<sup class="fn">${n.marker}</sup>`;
        if (isDeadRef(n.text)) { en = en.replace(sup, ""); continue; }
        const key = letterFor(i++);
        sequence.push(key);
        en = en.replace(sup, `<sup class="fn">@@${key}@@</sup>`);
        keys.push({ key, kind: "jps", lemma: n.lemma || "", text: normalizeRefs(n.text), verse: v.verse, chapter: v.chapter });
      }
      const mine = (glosses || []).filter(g => g.verse === v.verse && (g.chapter == null || g.chapter === v.chapter) && (g.status ? isVisible(g) : true));
      for (const g of mine) {
        const key = letterFor(i++);
        sequence.push(key);
        const sup = `<sup class="fn">@@${key}@@</sup>`;
        if (g.en && en.includes(g.en)) en = en.replace(g.en, g.en + sup);
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

  return { TETRA, divineName, stripMarks, splitPoetry, nowrapKeys, letterFor, isDeadRef, normalizeRefs, assignKeys, SIGLA, REGISTER_ORDER, REGISTER_NAMES };
});
