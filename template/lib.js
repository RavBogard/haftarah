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

  return { TETRA, divineName, stripMarks, splitPoetry, nowrapKeys };
});
