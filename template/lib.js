/* lib.js — pure functions shared by the renderer (browser) and the tests (Node).
   UMD: window.HaftarahLib in the browser, module.exports in Node. No DOM here. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.HaftarahLib = factory();
})(typeof self !== "undefined" ? self : globalThis, function () {
  "use strict";

  // Any Tetragrammaton, with any pointing (including the Elohim pointing). The class holds combining
  // marks only: maqaf U+05BE, paseq U+05C0, sof pasuq U+05C3, nun hafukha U+05C6 stay outside the match.
  const TETRA = /י[\u0591-\u05BD\u05BF\u05C1\u05C2\u05C4\u05C5\u05C7]*ה[\u0591-\u05BD\u05BF\u05C1\u05C2\u05C4\u05C5\u05C7]*ו[\u0591-\u05BD\u05BF\u05C1\u05C2\u05C4\u05C5\u05C7]*ה[\u0591-\u05BD\u05BF\u05C1\u05C2\u05C4\u05C5\u05C7]*/g;

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

  // The words of a verse as the web page counts them (spec 4.3): every Hebrew word of the reading,
  // not the keyed letters (<sup>), not the ketiv (Sefaria's mam-kq-k span; the page's .ketiv), not a
  // MAM footnote. Tags are stripped, thin and no-break spaces become spaces. DOM-free, so publish
  // can number the words exactly as the page does.
  function verseWords(heHtml) {
    const s = String(heHtml == null ? "" : heHtml)
      .replace(/<sup\b[^>]*>[\s\S]*?<\/sup>/g, "")
      .replace(/<span class="(?:[^"]*\s)?(?:mam-kq-k|ketiv)(?:\s[^"]*)?">[\s\S]*?<\/span>/g, "")
      .replace(/<i class="footnote">(?:<i>.*?<\/i>|(?!<\/i>)[\s\S])*?<\/i>/g, "")
      .replace(/<[^>]+>/g, "")
      .replace(/&thinsp;|&nbsp;| | /g, " ");
    return hebrewWords(s);
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

  // ---- the sheet model: what any renderer (the paginator later, the web page now) draws ----

  function escapeHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  }
  // "54:1-55:5" prints "54:1–55:5"; only a dash between digits is a range.
  function enDash(s) { return String(s == null ? "" : s).replace(/(\d)-(\d)/g, "$1–$2"); }
  const paragraphs = v => Array.isArray(v) ? v.slice() : (v ? String(v).split(/\n{2,}/) : []);

  function shabbatName(data) {
    const p = (data.shabbat && data.shabbat.parashah) || {};
    const special = data.shabbat && data.shabbat.special ? `, ${String(data.shabbat.special).replace(/^Shabbat\s+/i, "")}` : "";
    return `Shabbat ${p.en || ""}${special}`;
  }

  // Everything a page draws, prepared once and DOM-free: keys assigned, the divine name set as יי,
  // gloss keys inside the Hebrew, trope phrases wrapped, entries sorted and attached to their
  // verses, the entry tails as render.js's buildEntry writes them. Status is optional; only a
  // rejected item stays off the page. The input is not changed.
  function sheetModel(data, { voices = {} } = {}) {
    const visible = item => !item || item.status !== "rejected";
    let yyCount = 0;
    const dn = html => { const r = divineName(html); yyCount += r.count; return r.html; };
    const verses = data.verses || [];
    const last = verses.length - 1;
    const keyed = assignKeys(verses, data.glosses || [], visible);

    const keyHebrew = (html, lemma, key) => {
      if (!lemma) return html;
      const mark = `<sup class="fn he">${key}</sup>`;
      const hit = findHebrew(html, divineName(lemma).html);
      return hit ? html.slice(0, hit.end) + mark + html.slice(hit.end) : html + mark;
    };

    const entryModel = e => {
      const register = SIGLA[e.register] ? e.register : "traditional";
      const tail = [];
      if (e.sourceRef) tail.push(escapeHtml(enDash(e.sourceRef)));
      if (e.translation === "claude") tail.push("translated for this sheet");
      else if (e.translation) tail.push(escapeHtml(e.translation));
      if (e.register === "critical" && e.kind !== "quotation") tail.push("summary drafted for this sheet");
      if (e.cites) tail.push(e.cites);
      return {
        register, chapter: e.chapter != null ? e.chapter : null, verse: e.verse, verseEnd: e.verseEnd || null,
        verseLabel: e.verseEnd ? `${e.verse}–${e.verseEnd}` : String(e.verse),
        lemma: e.lemma || "", lemmaLang: e.lemmaLang || "en", source: e.source || "", sourceRef: e.sourceRef || "",
        bodyHtml: dn(e.text || ""), tail, drafted: e.register === "critical" || e.register === "reference",
        order: e.order != null ? e.order : 0,
      };
    };
    // Sorted as the paginator sorts; a chapter-less entry belongs to the first verse with its number.
    const entries = (data.commentary || []).filter(visible).map(entryModel)
      .sort((a, b) => (a.chapter || 0) - (b.chapter || 0) || a.verse - b.verse || a.order - b.order);
    entries.forEach(x => { if (x.chapter == null) { const v = verses.find(v => v.verse === x.verse); x.chapter = v ? v.chapter : null; } });
    const entriesFor = v => entries.filter(x => x.verse === v.verse && x.chapter === v.chapter);

    const vm = verses.map((v, i) => {
      const kv = keyed.verses[i];
      const prev = verses[i - 1];
      let heHtml = dn(String(v.he == null ? "" : v.he).replace(/&thinsp;| /g, " "));
      for (const k of kv.keys) if (k.kind === "gloss") heHtml = keyHebrew(heHtml, k.he, k.key);
      heHtml = tropeHtml(heHtml, { final: i === last });
      const lines = splitPoetry(kv.en);
      return {
        chapter: v.chapter, verse: v.verse, ref: v.ref, break: v.break || null, prevBreak: (prev && prev.break) || null,
        showChapter: i === 0 || v.chapter !== prev.chapter, final: i === last, poetry: lines.length > 1,
        enLines: (lines.length ? lines : [""]).map(nowrapKeys), heHtml,
        keys: kv.keys.map(k => ({
          key: k.key, kind: k.kind, lemma: k.lemma || "", heHtml: k.kind === "gloss" && k.he ? dn(escapeHtml(k.he)) : "",
          textHtml: dn(k.text), tail: k.kind === "jps" ? "JPS" : "", verse: k.verse, chapter: k.chapter,
        })),
        entries: entriesFor(v),
      };
    });

    const h = data.haftarah || {};
    const series = Object.assign({ name: "Torah from Scratch", year: ((data.shabbat || {}).hebrewEn || "").split(/\s+/).pop() || "" }, data.series || {});
    const name = shabbatName(data);
    const used = REGISTER_ORDER.filter(k => entries.some(e => e.register === k));
    const fams = tropeFamiliesUsed(verses);
    const credits = data.credits || {};
    const signoffHtml = credits.signoff ||
      (credits.editor ? `Commentary selected and approved by ${escapeHtml(credits.editor)}. ${escapeHtml(credits.note || "")}` : escapeHtml(credits.note || ""));
    const on = data.openingNote || {};
    const nw = data.nextWeek;
    return {
      shabbatName: name, seriesName: series.name, seriesLabel: (data.shabbat || {}).hebrewEn || series.year,
      // sheet.json may already say "Haftarat Noach"; only a bare name gets the prefix.
      title: `${h.title && h.title.en ? (/^haftarat\b/i.test(h.title.en) ? h.title.en : `Haftarat ${h.title.en}`) : name} · ${enDash(h.ref || "")}`,
      book: h.book || "", ref: enDash(h.ref || ""), heRef: h.heRef || "",
      shabbat: { civil: (data.shabbat || {}).civil || "", civilDisplay: (data.shabbat || {}).civilDisplay || "", hebrew: (data.shabbat || {}).hebrew || "", hebrewEn: (data.shabbat || {}).hebrewEn || "" },
      front: {
        incipit: { heHtml: dn((h.incipit && h.incipit.he) || ""), en: (h.incipit && h.incipit.en) || "" },
        openingNote: { calendar: paragraphs(on.calendar), setting: paragraphs(on.setting) },
        legend: {
          used, hasKeys: keyed.sequence.length > 0,
          hasKetiv: verses.some(v => /\[[^\]]*\]\s*\([^)]*\)|\([^)]*\)\s*\[[^\]]*\]/.test(String(v.he || ""))),
        },
        families: TROPE_FAMILIES.filter(([k]) => fams.has(k)).map(([key, label]) => ({ key, name: label })),
        voices: voicesFor(data.commentary || [], voices || {}, visible),
        provenance: { he: (h.versions || {}).he || "", en: (h.versions || {}).en || "", signoffHtml, editor: credits.editor || "", signed: !!(credits.editor && credits.signoff) },
      },
      verses: vm, entries,
      glossary: (data.glossary || []).filter(visible).map(t => ({ term: t.term || "", heHtml: t.he ? dn(escapeHtml(t.he)) : "", textHtml: dn(t.text || "") })),
      nextWeek: nw && visible(nw)
        ? { line: `Next week: ${escapeHtml(nw.shabbat)}${nw.special ? `, ${escapeHtml(String(nw.special).replace(/^Shabbat\s+/i, ""))}` : ""} · ${escapeHtml(enDash(nw.ref))}${nw.civilDisplay ? ` · ${escapeHtml(nw.civilDisplay)}` : ""}` }
        : null,
      sequence: keyed.sequence, yyCount,
    };
  }

  // ---- readings (schema 3) ----------------------------------------------------------
  // A week may carry more than one reading: the haftarah, and from Wave 2 a Torah selection. A
  // schema-2 file is one haftarah reading. These accessors let every caller treat both shapes alike;
  // readingView gives the print and the scripts the schema-2 shape they have always read, and gives
  // a schema-2 file back untouched, which is what keeps its print byte-identical.

  // Keys that belong to a reading but not to the schema-2 "haftarah" object.
  const READING_OWN = ["id", "kind", "verses", "glosses", "commentary", "aliyot", "selection", "maftir"];

  function readings(data) {
    if (!data) return [];
    if (Number(data.schema) >= 3) return Array.isArray(data.readings) ? data.readings : [];
    return [Object.assign({ id: "haftarah", kind: "haftarah" }, data.haftarah || {},
      { verses: data.verses || [], glosses: data.glosses || [], commentary: data.commentary || [] })];
  }

  // The reading the week is known by: its haftarah, else its first reading.
  function primaryReading(data) {
    const all = readings(data);
    return all.find(r => r.kind === "haftarah") || all[0] || null;
  }

  // One reading in the schema-2 shape. A schema-2 file comes back as the same object. For schema 3
  // the verses lose `book` and the entries lose `id` (the print never read them); the glosses array
  // is the reading's own, so a fix written into the view (lint --fix) lands in the file.
  function readingView(data, readingId) {
    if (!data || !(Number(data.schema) >= 3)) return data;
    const all = readings(data);
    const r = readingId ? all.find(x => x.id === readingId) : primaryReading(data);
    if (!r) throw new Error(readingId ? `no reading "${readingId}" in this sheet` : "this sheet has no readings");
    const haftarah = {};
    for (const [k, v] of Object.entries(r)) if (!READING_OWN.includes(k)) haftarah[k] = v;
    const view = {
      schema: 2, slug: data.slug, shabbat: data.shabbat, series: data.series, haftarah,
      verses: (r.verses || []).map(({ book, ...v }) => v),
      glosses: r.glosses || [],
      commentary: (r.commentary || []).map(({ id, ...e }) => e),
      openingNote: data.openingNote, glossary: data.glossary, nextWeek: data.nextWeek, credits: data.credits,
    };
    for (const [k, v] of Object.entries(data)) if (!(k in view) && k !== "readings") view[k] = v;
    for (const k of Object.keys(view)) if (view[k] === undefined) delete view[k];
    return view;
  }

  // "Ha'azinu" → "haazinu", "Lech-Lecha" → "lech-lecha": the parashah part of a week slug.
  function parashahKey(name) {
    return String(name == null ? "" : name).toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  }

  // The hash runs over UTF-16 code units of the joined string (charCodeAt), not bytes: any other
  // producer of ids (the MCP, a script in another language) must hash the same way.
  // A commentary entry's id: given once and kept when the entry is edited, never recomputed. Made
  // from where the entry sits and what it cites when it is first given, so the same file always gets
  // the same ids: "e-" and eight hex digits of FNV-1a.
  function entryId(e, readingId) {
    const s = [readingId || "", e.chapter == null ? "" : e.chapter, e.verse, e.source || "", e.sourceRef || "", e.lemma || ""].join("|");
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return "e-" + h.toString(16).padStart(8, "0");
  }

  // Ids for the entries that have none, unique among `taken` ("-2", "-3" on a collision). Mutates and returns the list.
  function assignEntryIds(list, readingId, taken = new Set()) {
    for (const e of list) if (e.id) taken.add(e.id);
    for (const e of list) {
      if (e.id) continue;
      const base = entryId(e, readingId);
      let id = base, n = 1;
      while (taken.has(id)) id = `${base}-${++n}`;
      e.id = id; taken.add(id);
    }
    return list;
  }

  // One reading's model for the web page: sheetModel on readingView(data, readingId). sheetModel gives
  // every reading's last verse the haftarah's closing cadence; a Torah reading ends on a plain sof
  // pasuk, so its last verse and its trope legend are set right here. A haftarah's model is sheetModel's.
  function readingModel(data, readingId, opts) {
    const r = readings(data).find(x => x.id === readingId) || primaryReading(data);
    const m = sheetModel(readingView(data, r ? r.id : undefined), opts);
    if (r && r.kind === "torah") {
      const last = m.verses[m.verses.length - 1];
      if (last) { last.heHtml = last.heHtml.replace(/\btr-sof-haftarah\b/g, "tr-sof-pasuk"); last.final = false; }
      const keys = new Set(m.front.families.map(x => x.key).filter(k => k !== "sof-haftarah"));
      if (m.verses.length) keys.add("sof-pasuk");
      m.front.families = TROPE_FAMILIES.filter(([k]) => keys.has(k)).map(([key, name]) => ({ key, name }));
    }
    m.reading = r ? { id: r.id, kind: r.kind, selection: r.selection || null } : null;
    return m;
  }

  // ---- the figures: the map of the places and the timeline (DOM-free SVG strings, classes only) ----
  // Boxes are [lonMin, latMin, lonMax, latMax]. A named box is returned as given; the drawing fits
  // every box to the 5:4 frame around its centre (fitBox), so the two scales of the projection agree.
  const MAP_REGIONS = { land: [34.0, 29.6, 36.4, 33.6], "near-east": [29.0, 27.0, 49.0, 38.5] };
  const MAP_VIEW = [1000, 800];
  const FIG_KINDS = ["king", "empire", "prophet", "composition", "event"];

  function fig1(n) { const v = Math.round(n * 10) / 10; return String(v === 0 ? 0 : v); }
  function hasCoord(p) { return p && Number.isFinite(p.lat) && Number.isFinite(p.lon); }
  function inBoxLL(p, b) { return p.lon >= b[0] && p.lon <= b[2] && p.lat >= b[1] && p.lat <= b[3]; }

  // The box widened or heightened around its centre to 5:4 in projected units (width × cos(lat0) : height).
  function fitBox(box) {
    let [x0, y0, x1, y1] = box;
    const lat0 = (y0 + y1) / 2, c = Math.cos(lat0 * Math.PI / 180), want = MAP_VIEW[0] / MAP_VIEW[1];
    const w = (x1 - x0) * c, h = y1 - y0;
    if (w / h < want) { const half = want * h / c / 2, m = (x0 + x1) / 2; x0 = m - half; x1 = m + half; }
    else if (w / h > want) { const half = w / want / 2; y0 = lat0 - half; y1 = lat0 + half; }
    return [x0, y0, x1, y1];
  }

  function mapRegion(places, region) {
    if (typeof region === "string" && MAP_REGIONS[region]) return { name: region, box: MAP_REGIONS[region].slice() };
    if (Array.isArray(region) && region.length === 4) return { name: "custom", box: region.slice() };
    const pts = (places || []).filter(hasCoord);
    if (!pts.length || pts.every(p => inBoxLL(p, MAP_REGIONS.land))) return { name: "land", box: MAP_REGIONS.land.slice() };
    if (pts.every(p => inBoxLL(p, MAP_REGIONS["near-east"]))) return { name: "near-east", box: MAP_REGIONS["near-east"].slice() };
    const lons = pts.map(p => p.lon), lats = pts.map(p => p.lat);
    let x0 = Math.min(...lons), x1 = Math.max(...lons), y0 = Math.min(...lats), y1 = Math.max(...lats);
    const px = (x1 - x0) * 0.2, py = (y1 - y0) * 0.2;
    x0 -= px; x1 += px; y0 -= py; y1 += py;
    if (x1 - x0 < 0.6) { const m = (x0 + x1) / 2; x0 = m - 0.3; x1 = m + 0.3; }
    if (y1 - y0 < 0.5) { const m = (y0 + y1) / 2; y0 = m - 0.25; y1 = m + 0.25; }
    return { name: "custom", box: fitBox([x0, y0, x1, y1]) };
  }

  // Sutherland–Hodgman against the box's four edges (scripts/geo.mjs clipPolygon, copied: lib.js cannot import).
  const CLIP_EDGES = [
    { axis: 0, side: 0, inside: (p, b) => p[0] >= b[0] },
    { axis: 1, side: 1, inside: (p, b) => p[1] >= b[1] },
    { axis: 0, side: 2, inside: (p, b) => p[0] <= b[2] },
    { axis: 1, side: 3, inside: (p, b) => p[1] <= b[3] },
  ];
  function clipCut(a, b, edge, box) {
    const v = box[edge.side], o = 1 - edge.axis, p = [];
    p[edge.axis] = v;
    p[o] = a[o] + (b[o] - a[o]) * (v - a[edge.axis]) / (b[edge.axis] - a[edge.axis]);
    return p;
  }
  function samePt(a, b) { return a[0] === b[0] && a[1] === b[1]; }
  function clipRing(ring, box) {
    let pts = ring.length > 2 && samePt(ring[0], ring[ring.length - 1]) ? ring.slice(0, -1) : ring.slice();
    for (const edge of CLIP_EDGES) {
      const out = [];
      for (let i = 0; i < pts.length; i++) {
        const cur = pts[i], prev = pts[(i + pts.length - 1) % pts.length];
        const ic = edge.inside(cur, box), ip = edge.inside(prev, box);
        if (ic) { if (!ip) out.push(clipCut(prev, cur, edge, box)); out.push(cur); }
        else if (ip) out.push(clipCut(prev, cur, edge, box));
      }
      pts = out;
      if (!pts.length) return null;
    }
    pts = pts.filter((p, k) => k === 0 || !samePt(p, pts[k - 1]));
    if (pts.length > 1 && samePt(pts[0], pts[pts.length - 1])) pts.pop();
    return pts.length < 3 ? null : pts;
  }
  // The runs of `line` inside `box` (scripts/geo.mjs clipLine, copied).
  function clipLine(line, box) {
    const runs = [];
    let run = null;
    for (let i = 1; i < line.length; i++) {
      let a = line[i - 1], b = line[i], gone = false;
      for (const edge of CLIP_EDGES) {
        const ia = edge.inside(a, box), ib = edge.inside(b, box);
        if (!ia && !ib) { gone = true; break; }
        if (!ia) a = clipCut(a, b, edge, box);
        else if (!ib) b = clipCut(a, b, edge, box);
      }
      if (gone) { run = null; continue; }
      if (run && samePt(run[run.length - 1], a)) run.push(b);
      else { run = [a, b]; runs.push(run); }
    }
    return runs.map(r => r.filter((p, k) => k === 0 || !samePt(p, r[k - 1]))).filter(r => r.length >= 2);
  }

  // The equirectangular projection of a fitted box onto the 1000 × 800 frame.
  function projector(box) {
    const [x0, y0, x1, y1] = box, c = Math.cos((y0 + y1) / 2 * Math.PI / 180);
    const kx = MAP_VIEW[0] / ((x1 - x0) * c), ky = MAP_VIEW[1] / (y1 - y0);
    return ([lon, lat]) => [(lon - x0) * c * kx, (y1 - lat) * ky];
  }
  function pathOf(lines, proj, close) {
    return lines.map(l => l.map((p, k) => { const [x, y] = proj(p); return (k ? "L" : "M") + fig1(x) + " " + fig1(y); }).join("") + (close ? "Z" : "")).join("");
  }
  function boxesMeet(a, b) { return a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3]; }

  // One label beside its point: the side, the text position, the anchor and its approximate box.
  function labelAt(side, x, y, size, chars) {
    const w = 0.56 * size * chars;
    if (side === "l") return { side, x: x - 14, y: y + size * 0.35, anchor: "end", box: [x - 14 - w, y - size / 2, x - 14, y + size / 2] };
    if (side === "t") return { side, x, y: y - 14, anchor: "middle", box: [x - w / 2, y - 14 - size, x + w / 2, y - 14] };
    if (side === "b") return { side, x, y: y + 14 + size, anchor: "middle", box: [x - w / 2, y + 14, x + w / 2, y + 14 + size] };
    return { side: "r", x: x + 14, y: y + size * 0.35, anchor: "start", box: [x + 14, y - size / 2, x + 14 + w, y + size / 2] };
  }

  function mapSvg(places, region, basemap, { id = "map", title, desc } = {}) {
    const esc = escapeHtml;
    const frame = fitBox(mapRegion(places, region).box), proj = projector(frame);
    const shown = ["scene", "context", "empire"].map(role => (places || []).filter(p => p.role === role && hasCoord(p) && inBoxLL(p, frame))).reduce((a, b) => a.concat(b), [])
      .map(p => { const [x, y] = proj([p.lon, p.lat]); return { p, x, y }; });
    if (!shown.length) return "";
    if (title == null || desc == null) {
      const t = figureText(places, [], null, region).map || { title: "", desc: "" };
      if (title == null) title = t.title;
      if (desc == null) desc = t.desc;
    }
    const out = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${MAP_VIEW[0]} ${MAP_VIEW[1]}" role="img" aria-labelledby="${esc(id)}-title ${esc(id)}-desc" class="fig-svg map-svg">`,
      `<title id="${esc(id)}-title">${esc(title)}</title><desc id="${esc(id)}-desc">${esc(desc)}</desc>`,
      `<rect class="map-sea" width="${MAP_VIEW[0]}" height="${MAP_VIEW[1]}"/>`];
    const bm = basemap || {};
    const land = pathOf((bm.land || []).map(r => clipRing(r, frame)).filter(Boolean), proj, true);
    if (land) out.push(`<path class="map-land" fill-rule="evenodd" d="${land}"/>`);
    const lakes = pathOf((bm.lakes || []).map(l => clipRing(l.ring, frame)).filter(Boolean), proj, true);
    if (lakes) out.push(`<path class="map-lake" d="${lakes}"/>`);
    const rivers = pathOf([].concat(...(bm.rivers || []).map(r => clipLine(r.line, frame))), proj, false);
    if (rivers) out.push(`<path class="map-river" d="${rivers}"/>`);
    const taken = shown.filter(s => s.p.role !== "empire").map(s => [s.x - 10, s.y - 10, s.x + 10, s.y + 10]);
    for (const { p, x, y } of shown) {
      const name = String(p.name == null ? "" : p.name), chars = [...name].length;
      if (p.role === "empire") {
        const w = 0.56 * 50 * chars + 4 * chars;
        taken.push([x - w / 2, y - 25, x + w / 2, y + 25]);
        out.push(`<text class="place-label empire" x="${fig1(x)}" y="${fig1(y + 50 * 0.35)}" text-anchor="middle" font-size="50" letter-spacing="4">${esc(name)}</text>`);
        continue;
      }
      const r = p.role === "scene" ? 9 : 7;
      out.push(`<circle class="place ${p.role}" cx="${fig1(x)}" cy="${fig1(y)}" r="${r}"/>`);
      const sides = ["r", "l", "t", "b"].includes(p.label) ? [p.label] : ["r", "l", "t", "b"];
      let at = null;
      for (const s of sides) {
        const c = labelAt(s, x, y, 50, chars), b = c.box;
        if (sides.length === 1) { at = c; break; }
        if (b[0] >= 0 && b[1] >= 0 && b[2] <= MAP_VIEW[0] && b[3] <= MAP_VIEW[1] && !taken.some(t => boxesMeet(t, b))) { at = c; break; }
      }
      if (!at) {
        // No side is clear (a crowded map): the side whose label covers least of the others, and stays in the frame.
        const cover = b => taken.reduce((a, t) => a + Math.max(0, Math.min(b[2], t[2]) - Math.max(b[0], t[0])) * Math.max(0, Math.min(b[3], t[3]) - Math.max(b[1], t[1])), 0)
          + (b[0] < 0 || b[1] < 0 || b[2] > MAP_VIEW[0] || b[3] > MAP_VIEW[1] ? 1e9 : 0);
        at = ["r", "l", "t", "b"].map(s => labelAt(s, x, y, 50, chars)).reduce((best, c) => (cover(c.box) < cover(best.box) ? c : best));
      }
      taken.push(at.box);
      out.push(`<text class="place-label ${p.role} side-${at.side}" x="${fig1(at.x)}" y="${fig1(at.y)}" text-anchor="${at.anchor}" font-size="50">${esc(name)}</text>`);
    }
    const unit = MAP_VIEW[0] / ((frame[2] - frame[0]) * 111.32 * Math.cos((frame[1] + frame[3]) / 2 * Math.PI / 180));
    const steps = [5, 10, 20, 50, 100, 200, 500];
    const km = steps.find(n => n * unit >= 120 && n * unit <= 320) || steps[steps.length - 1];
    out.push(`<g class="map-scale"><line x1="40" y1="760" x2="${fig1(40 + km * unit)}" y2="760"/><text font-size="50" x="40" y="738">${km} km</text></g>`,
      `<rect class="map-frame" width="${MAP_VIEW[0]}" height="${MAP_VIEW[1]}"/></svg>`);
    return out.join("");
  }

  // Dates filled from the table; an item that cites the table takes its kind and (unless given) its label.
  // The same function as scripts/geo.mjs resolveTimeline (lib.js cannot import); keep the two identical.
  function timelineItems(items, chronology) {
    return (items || []).map(it => {
      const t = it.chronology && chronology && chronology.entries ? chronology.entries[it.chronology] : null;
      const r = t ? { id: it.id, label: it.label || t.label, kind: t.kind, start: t.start, end: t.end, approx: !!t.approx }
        : { id: it.id, label: it.label || "", kind: it.kind, start: it.start, end: it.end == null ? it.start : it.end, approx: !!it.approx };
      if (it.works) r.works = it.works;
      return r;
    });
  }

  // -1013 approx → "c. 1015"; -853 → "853"; 70 → "70 CE".
  function yearLabel(y, approx) {
    const n = Math.abs(approx ? Math.round(y / 5) * 5 : y);
    return (approx ? "c. " : "") + n + (y > 0 ? " CE" : "");
  }
  // An item's dates; `eras` (the set crosses year 0) gives every BCE year its era, and a span across 0 always dates its start.
  function datesOf(it, eras) {
    const bce = y => y < 0 ? " BCE" : "";
    const first = yearLabel(it.start, it.approx) + (eras || (it.start < 0) !== (it.end < 0) ? bce(it.start) : "");
    return first + (it.end !== it.start ? "–" + yearLabel(it.end, it.approx).replace(/^c\. /, "") + (eras ? bce(it.end) : "") : "");
  }
  function labelDates(it, eras) { return (it.label ? it.label + ", " : "") + datesOf(it, eras); }
  function crossesZero(list) { return list.some(i => i.start < 0) && list.some(i => i.end > 0); }
  // The items with dates; a kind that is not a string draws as "other".
  function drawnItems(items, chronology) {
    return timelineItems(items, chronology).filter(it => Number.isFinite(it.start) && Number.isFinite(it.end))
      .map(it => typeof it.kind === "string" && it.kind ? it : Object.assign({}, it, { kind: "other" }));
  }

  // A label cut to `room` units with an ellipsis, or null when fewer than two characters would survive.
  function fitLabel(text, room, size) {
    const chars = [...text], per = 0.56 * size;
    if (chars.length * per <= room) return text;
    const kept = [...chars.slice(0, Math.max(0, Math.floor(room / per) - 1)).join("").replace(/[\s,]+$/, "")];
    return kept.length >= 2 ? kept.join("") + "…" : null;
  }

  function timelineSvg(items, chronology, { id = "timeline", title, desc } = {}) {
    const esc = escapeHtml;
    const list = drawnItems(items, chronology);
    if (!list.length) return "";
    if (title == null || desc == null) {
      const t = figureText([], items, chronology, null).timeline;
      if (title == null) title = t.title;
      if (desc == null) desc = t.desc;
    }
    const W = 1000, PAD = 20, ROW = 32, BAR = 22, FONT = 18, TOP = 10, AXIS = 40, PER = 0.56 * FONT;
    const lo0 = Math.min(...list.map(i => i.start)), hi0 = Math.max(...list.map(i => i.end)), pad = (hi0 - lo0) * 0.04;
    const step = hi0 - lo0 + 2 * pad >= 400 ? 100 : 50;
    const lo = Math.floor((lo0 - pad) / step) * step;
    let hi = Math.ceil((hi0 + pad) / step) * step;
    if (hi <= lo) hi = lo + step;
    const X = y => PAD + (y - lo) / (hi - lo) * (W - 2 * PAD);
    const wide = (text, room) => PER * [...text].length + 12 <= room;
    const eras = crossesZero(list);
    // Each item's shape and, for an event, its label (which occupies its row).
    const shaped = list.map(it => {
      const x0 = X(it.start), x1 = X(it.end), dated = labelDates(it, eras);
      if (it.kind === "event") {
        const left = x0 > W - 150, room = left ? x0 - 13 : W - (x0 + 13);
        const text = fitLabel(dated, room, FONT) || "";
        const lw = PER * [...text].length;
        return { it, x0, x1, event: true, label: { text, x: left ? x0 - 13 : x0 + 13, anchor: left ? "end" : "start", inside: false },
          span: left ? [x0 - 13 - lw, x0 + 7] : [x0 - 7, x0 + 13 + lw] };
      }
      return { it, x0, x1, event: false, dated, span: [x0, x1] };
    });
    // Lanes by kind, rows packed greedily: the first row where the item overlaps nothing already there.
    const LANES = ["event", "king", "prophet", "empire", "composition"];
    const rows = [];
    for (const kind of LANES.concat([...new Set(shaped.map(s => s.it.kind))].filter(k => !LANES.includes(k)))) {
      const mine = [];
      for (const s of shaped.filter(s => s.it.kind === kind)) {
        let row = mine.find(r => r.every(o => !(s.span[0] < o.span[1] && o.span[0] < s.span[1])));
        if (!row) { row = []; mine.push(row); }
        row.push(s);
      }
      rows.push(...mine);
    }
    // Bars that touch in a row (one reign ending the year the next begins) part by 3 units, half from each.
    for (const row of rows) {
      const bars = row.filter(s => !s.event).sort((a, b) => a.x0 - b.x0);
      for (let k = 1; k < bars.length; k++) {
        const a = bars[k - 1], b = bars[k], g = 3 - (b.x0 - a.x1);
        if (g > 0 && b.x0 >= a.x1) { a.x1 -= g / 2; b.x0 += g / 2; a.span = [a.x0, a.x1]; b.span = [b.x0, b.x1]; }
      }
    }
    // A bar's label: inside with its dates, beside it with its dates, inside alone, beside alone, then cut to fit.
    for (const row of rows) {
      const placed = [];
      const free = b => b[0] >= 0 && b[1] <= W && placed.every(o => !(b[0] < o[1] && o[0] < b[1]));
      for (const s of row) placed.push(s.span);
      for (const s of row) {
        if (s.event) continue;
        const width = s.x1 - s.x0, left = s.x1 > W - 150;
        const beside = text => { const w = PER * [...text].length; return left ? { text, x: s.x0 - 6, anchor: "end", inside: false, b: [s.x0 - 6 - w, s.x0 - 6] } : { text, x: s.x1 + 6, anchor: "start", inside: false, b: [s.x1 + 6, s.x1 + 6 + w] }; };
        const inside = text => ({ text, x: s.x0 + 6, anchor: "start", inside: true, b: null });
        let lab = null;
        for (const text of [s.dated, s.it.label].filter(Boolean)) {
          if (wide(text, width)) { lab = inside(text); break; }
          const c = beside(text);
          if (free(c.b)) { lab = c; break; }
        }
        if (!lab) {
          // The room beside the bar up to the next thing in the row (or the frame), against the room inside.
          const others = placed.filter(o => o !== s.span);
          const out = left ? s.x0 - 6 - Math.max(0, ...others.filter(o => o[1] <= s.x0).map(o => o[1]))
            : Math.min(W, ...others.filter(o => o[0] >= s.x1).map(o => o[0])) - s.x1 - 6;
          const inRoom = width - 12;
          const text = inRoom >= out ? fitLabel(s.it.label, inRoom, FONT) : fitLabel(s.it.label, out, FONT);
          lab = text == null ? null : inRoom >= out ? inside(text) : beside(text);
        }
        if (lab && lab.b) placed.push(lab.b);
        s.label = lab;
      }
    }
    const H = TOP + rows.length * ROW + AXIS;
    const out = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="${esc(id)}-title ${esc(id)}-desc" class="fig-svg timeline-svg">`,
      `<title id="${esc(id)}-title">${esc(title)}</title><desc id="${esc(id)}-desc">${esc(desc)}</desc>`];
    rows.forEach((row, i) => {
      const top = TOP + i * ROW, mid = top + ROW / 2;
      for (const s of row) {
        const ap = s.it.approx ? " approx" : "";
        if (s.event) out.push(`<polygon class="tl-event${ap}" points="${fig1(s.x0)},${fig1(mid - 7)} ${fig1(s.x0 + 7)},${fig1(mid)} ${fig1(s.x0)},${fig1(mid + 7)} ${fig1(s.x0 - 7)},${fig1(mid)}"/>`);
        else out.push(`<rect class="tl-bar ${esc(s.it.kind)}${ap}" x="${fig1(s.x0)}" y="${fig1(top + (ROW - BAR) / 2)}" width="${fig1(Math.max(s.x1 - s.x0, 1))}" height="${BAR}" rx="2"/>`);
        if (s.label && s.label.text) out.push(`<text class="tl-label${s.label.inside ? " inside" : ""}" x="${fig1(s.label.x)}" y="${fig1(mid + FONT * 0.35)}" font-size="${FONT}" text-anchor="${s.label.anchor}">${esc(s.label.text)}</text>`);
      }
    });
    const ay = TOP + rows.length * ROW + 4;
    out.push(`<line class="tl-axis" x1="${PAD}" y1="${ay}" x2="${W - PAD}" y2="${ay}"/>`);
    for (let y = lo; y <= hi; y += step) {
      if (y === 0) continue;
      out.push(`<text class="tl-tick" x="${fig1(X(y))}" y="${ay + 24}" font-size="18" text-anchor="middle">${Math.abs(y)}${y > 0 ? " CE" : ""}</text>`);
    }
    out.push("</svg>");
    return out.join("");
  }

  function joinAnd(names) {
    return names.length < 2 ? names.join("") : names.slice(0, -1).join(", ") + " and " + names[names.length - 1];
  }

  // The figures' titles, descriptions (the SVG's <desc>, read aloud) and captions; null for a figure with nothing in it.
  function figureText(places, items, chronology, region) {
    let map = null, timeline = null;
    const located = (places || []).filter(hasCoord);
    if (located.length) {
      const reg = mapRegion(places, region), frame = fitBox(reg.box);
      const inside = located.filter(p => inBoxLL(p, frame)), outside = located.filter(p => !inBoxLL(p, frame));
      const first = located.find(p => p.role === "scene") || located[0];
      const where = reg.name === "land" ? "the land of Israel" : reg.name === "near-east" ? "the Near East" : "the area of " + first.name;
      const groups = [["scene", "scene of the reading", "scenes of the reading"], ["context", "nearby", "nearby"], ["empire", "a people or kingdom", "peoples or kingdoms"]]
        .map(([role, one, many]) => { const n = inside.filter(p => p.role === role).map(p => p.name); return n.length ? `${joinAnd(n)} (${n.length === 1 ? one : many})` : ""; })
        .filter(Boolean);
      map = {
        title: "Places in this reading",
        desc: `Map of ${where}${groups.length ? ": " + groups.join("; ") : ""}.${outside.length ? ` Outside this map: ${joinAnd(outside.map(p => p.name))}.` : ""} Coastlines are modern; borders are not drawn.`,
        caption: "Places in this reading · coastlines modern, borders not drawn",
      };
    }
    const list = drawnItems(items, chronology);
    if (list.length) {
      const lo = Math.min(...list.map(i => i.start)), hi = Math.max(...list.map(i => i.end)), ap = list.some(i => i.approx), eras = crossesZero(list);
      const span = hi < 0 ? `${yearLabel(lo, ap)} to ${yearLabel(hi, ap)} BCE` : lo < 0 ? `${yearLabel(lo, ap)} BCE to ${yearLabel(hi, ap)}` : `${yearLabel(lo, ap)} to ${yearLabel(hi, ap)}`;
      const order = k => { const i = FIG_KINDS.indexOf(k); return i < 0 ? FIG_KINDS.length : i; };
      const sorted = list.map((it, i) => ({ it, i })).sort((a, b) => a.it.start - b.it.start || order(a.it.kind) - order(b.it.kind) || a.i - b.i).map(x => x.it);
      const words = { king: "king", prophet: "prophet", empire: "empire" };
      timeline = {
        title: "When this happened",
        desc: `Timeline, ${span}: ${sorted.map(it => [it.label, words[it.kind], datesOf(it, eras)].filter(Boolean).join(", ")).join("; ")}.`,
        caption: (hi < 0 ? "Dates BCE" : lo < 0 ? "Dates BCE and CE" : "Dates CE") + (ap ? " · c. marks a rounded date" : ""),
      };
    }
    return { map, timeline };
  }

  // The incipit fits a 3.5in box beside the 1.6in mural: 54pt at most, 40pt at least on one line; otherwise two lines at 44pt.
  function fitIncipitSize(widthAt60pt, boxWidth) {
    const size = Math.floor(60 * boxWidth / widthAt60pt);
    if (size >= 54) return { size: 54, lines: 1 };
    if (size >= 40) return { size, lines: 1 };
    return { size: 44, lines: 2 };
  }

  // ---- trope phrases (the chanter's copy) ----------------------------------------
  // TropeTrainer's grouping: a block ends at every word carrying one of these accents; tipcha,
  // pashta, yetiv and zarka (U+05AE and U+0598) fold into the block after them, and conjunctives
  // never end one. Munach before a standalone paseq is legarmeh, a revia block.
  const BLOCK_ENDING = {
    "֑": "etnachta", "֔": "zakef", "֕": "zakef-gadol", "֗": "revia",
    "֛": "tevir", "֒": "segol", "֓": "segol",
    "֜": "azla", "֝": "azla", "֞": "azla", "֩": "telisha-ketana",
    "֡": "pazer", "֠": "pazer", "֟": "pazer",
  };
  const TROPE_FAMILIES = [
    ["zakef", "zakef"], ["etnachta", "etnachta"], ["sof-pasuk", "sof pasuk"], ["revia", "revia"],
    ["tevir", "tevir"], ["segol", "segol"], ["azla", "kadma v’azla"], ["telisha-ketana", "telisha ketana"],
    ["pazer", "pazer"], ["zakef-gadol", "zakef gadol"], ["sof-haftarah", "end of the haftarah"],
  ];

  // Words split on whitespace at nesting depth zero only: a tag is atomic, and an open element
  // (Sefaria's ketiv/qere span) keeps its inner space, so it stays one word.
  function tropeTokens(html) {
    const tokens = [];
    let cur = "", depth = 0, i = 0;
    const flush = () => { if (cur) tokens.push(cur); cur = ""; };
    while (i < html.length) {
      if (html[i] === "<") {
        const close = html.indexOf(">", i);
        const tag = html.slice(i, close < 0 ? html.length : close + 1);
        if (tag[1] === "/") depth = Math.max(0, depth - 1);
        else if (!tag.endsWith("/>") && !/^<(br|img|wbr|hr)\b/i.test(tag)) depth++;
        cur += tag; i += tag.length;
        continue;
      }
      if (depth === 0) {
        const ent = /^&(thinsp|nbsp);/.exec(html.slice(i, i + 8));
        if (ent) { flush(); i += ent[0].length; continue; }
        if (/\s/.test(html[i])) { flush(); i++; continue; }
      }
      cur += html[i++];
    }
    flush();
    return tokens;
  }

  // Trope phrases for the chanter's copy: the verse HTML cut into blocks, each ending at a
  // block-ending accent (TropeTrainer's grouping: tipcha, pashta, yetiv and zarka fold into the
  // block after them). Returns [{ family, html }] in verse order, plus separators for letterless
  // tokens as { family: null, html }. Joining every html with " " gives the input back up to
  // whitespace: &thinsp;, &nbsp; and runs of whitespace come back as one space.
  function tropePhrases(html, { final = false } = {}) {
    const words = tropeTokens(String(html == null ? "" : html)).map(t => {
      const text = t.replace(/<[^>]*>/g, "");
      return { html: t, text, letters: /[א-תיִ-ﭏ]/.test(text), paseq: text.trim() === "׀" };
    });
    let last = -1;
    words.forEach((w, k) => { if (w.letters) last = k; });
    const out = [];
    let open = [];   // pieces of the block in progress; a separator mid-block splits it in two
    let piece = [];
    const cut = () => { if (piece.length) { const p = { family: null, html: piece.join(" ") }; out.push(p); open.push(p); } piece = []; };
    const close = family => { cut(); for (const p of open) p.family = family; open = []; };
    for (let k = 0; k < words.length; k++) {
      const w = words[k];
      if (!w.letters && !w.paseq) { cut(); out.push({ family: null, html: w.html }); continue; }
      piece.push(w.html);
      if (!w.letters) continue;   // a paseq joins the block in progress
      let family = null;
      for (const ch of w.text) if (BLOCK_ENDING[ch]) { family = BLOCK_ENDING[ch]; break; }
      if (!family && w.text.includes("֣") && words[k + 1] && words[k + 1].paseq) family = "revia";
      if (k === last) family = final ? "sof-haftarah" : "sof-pasuk";
      if (!family) continue;
      while (words[k + 1] && words[k + 1].paseq) piece.push(words[++k].html);
      close(family);
    }
    // Only a verse with no letters at all (a lone paseq) gets here; its text still comes back.
    if (piece.length || open.length) close(final ? "sof-haftarah" : "sof-pasuk");
    return out;
  }

  // The verse HTML with each trope phrase in <span class="tr tr-<family>">; separators (a pisqa)
  // stay bare. The spans are always there; trope.css colors them only under html[data-trope].
  function tropeHtml(html, { final = false } = {}) {
    return tropePhrases(html, { final }).map(b => b.family ? `<span class="tr tr-${b.family}">${b.html}</span>` : b.html).join(" ");
  }

  // The families a haftarah's verses ([{ he }], in order) use, for the trope legend; the last verse
  // is final. Raw he gives the families the rows show: divineName keeps every accent on יי, and a
  // gloss key only appends a <sup> to a word, so neither moves a phrase boundary.
  function tropeFamiliesUsed(verses) {
    const fams = new Set();
    (verses || []).forEach((v, i) => tropePhrases(String(v.he == null ? "" : v.he).replace(/&thinsp;|\u2009/g, " "), { final: i === verses.length - 1 }).forEach(b => { if (b.family) fams.add(b.family); }));
    return fams;
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

  return { TETRA, divineName, stripMarks, splitPoetry, nowrapKeys, letterFor, isDeadRef, normalizeRefs, assignKeys, SIGLA, REGISTER_ORDER, REGISTER_NAMES, voicesFor, voiceKey, hebrewKey, hebrewWords, verseWords, findHebrew, plainText, findEnglish, fitIncipitSize, parseBibliography, tropePhrases, tropeHtml, tropeFamiliesUsed, TROPE_FAMILIES, escapeHtml, enDash, shabbatName, sheetModel, readings, primaryReading, readingView, parashahKey, entryId, assignEntryIds, readingModel, MAP_REGIONS, MAP_VIEW, mapRegion, mapSvg, timelineItems, timelineSvg, figureText, yearLabel };
});
