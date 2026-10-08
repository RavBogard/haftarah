/* render.js — lays one week's sheet.json out as fixed letter pages.
   Runs in the browser (headless Chrome for the PDF, or a normal browser for review).
   Expects window.SHEET (the data) and window.SHEET_OPTIONS ({ draft, logo }). */

(function () {
  "use strict";

  const data = window.SHEET;
  const opts = window.SHEET_OPTIONS || {};
  const DRAFT = !!opts.draft;

  const root = document.getElementById("sheet");
  const stage = document.getElementById("stage");

  // ---- helpers --------------------------------------------------------------

  const el = (tag, cls, html) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  };
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const dash = s => String(s ?? "").replace(/(\d)-(\d)/g, "$1–$2");
  const paras = v => Array.isArray(v) ? v : (v ? String(v).split(/\n{2,}/) : []);
  // No status means never approved: shown (shaded) in a draft, never in a final.
  const visible = item => DRAFT ? item.status !== "rejected" : item.status === "approved";

  const L = window.HaftarahLib;
  const SIGLA = L.SIGLA, REGISTER_NAMES = L.REGISTER_NAMES;
  const stripMarks = L.stripMarks;
  // Every Tetragrammaton becomes יי with its accents (see lib.js); the count is reported.
  let yyCount = 0;
  const divineName = html => { const r = L.divineName(html); yyCount += r.count; return r.html; };

  // ---- series and opening note (schema 2, with schema-1 fallbacks) -------------
  const series = Object.assign(
    { name: "Torah from Scratch", year: (data.shabbat?.hebrewEn || "").split(/\s+/).pop() || "", number: null },
    data.series || {}
  );
  const seriesLabel = `${series.year}${series.number != null ? ` · No. ${series.number}` : ""}`;
  const openingNote = (() => {
    if (data.openingNote) return data.openingNote;
    const cal = [];
    if (data.haftarah.defaultHaftarah) cal.push(`Read in place of the usual haftarah for ${esc(data.shabbat.parashah.en)}, ${esc(dash(data.haftarah.defaultHaftarah))}.`);
    cal.push(...paras(data.haftarah.whyThisHaftarah));
    if (data.parashahConnection) cal.push(...paras(data.parashahConnection));
    return {
      calendar: cal.join(" "),
      setting: (data.context && (data.context.paragraphs || []).length) ? data.context.paragraphs.slice() : [],
      status: data.context?.status || "approved",
    };
  })();
  const signoff = data.credits?.signoff ||
    (data.credits?.editor ? `Commentary selected and approved by ${esc(data.credits.editor)}. ${esc(data.credits?.note || "")}` : esc(data.credits?.note || ""));
  const WORDMARK = "central reform congregation";
  const TAGLINE = "A Jewish Presence in the City of St. Louis";

  // Insert a keying circle after the Hebrew lemma inside the verse HTML.
  function keyHebrew(html, lemma, key) {
    if (!lemma) return html;
    const mark = `<sup class="fn he">${key}</sup>`;
    if (html.includes(lemma)) return html.replace(lemma, lemma + mark);
    // fall back to matching with vowels and accents removed
    const plainLemma = stripMarks(lemma);
    const re = /[א-ת־֑-ׇ]+/g;
    let m;
    while ((m = re.exec(html))) {
      if (stripMarks(m[0]).replace(/־$/, "") === plainLemma.replace(/־$/, "")) {
        return html.slice(0, m.index + m[0].length) + mark + html.slice(m.index + m[0].length);
      }
    }
    return html + mark;
  }

  const shabbatName = () => {
    const p = data.shabbat.parashah;
    return `Shabbat ${p.en}${data.shabbat.special ? `, ${data.shabbat.special.replace(/^Shabbat\s+/i, "")}` : ""}`;
  };

  // ---- page scaffolding -----------------------------------------------------

  let pageCount = 0;
  function newPage(kind) {
    pageCount++;
    const recto = pageCount % 2 === 1;
    const page = el("section", `page ${kind || ""} ${recto ? "recto" : "verso"}`);
    page.dataset.kind = kind || "";
    const head = el("header", "frame-head");
    const left = el("span", "head-left");
    const right = el("span", "head-right");
    head.append(left, right);
    const body = el("div", "page-body");
    const foot = el("footer", "frame-foot");
    page.append(head, body, foot);
    root.append(page);
    const p = { page, head, left, right, body, foot, recto };
    setFoot(p, {});
    return p;
  }

  // The staple corner is top right on a recto, top left on a verso. The verse range goes in the
  // free corner; the Shabbat name sits under the staple, where losing it costs nothing.
  function setHead(p, shabbat, range) {
    const flag = DRAFT ? '<span class="draft-flag">draft for review</span>' : "";
    const name = `<span class="shabbat">${esc(shabbat)}</span>`;
    const rng = `<span class="range">${esc(range || "")}</span>`;
    p.left.innerHTML = (p.recto ? rng : name) + (p.recto ? "" : flag);
    p.right.innerHTML = (p.recto ? name : rng) + (p.recto ? flag : "");
  }

  // Folio away from the staple (recto bottom left, verso bottom right); the other side carries
  // either the micro-legend (text pages) or the wordmark and tagline (front page).
  function setFoot(p, { legend, wordmark }) {
    const folio = `<span class="folio">${pageCount}</span>`;
    let other = "";
    if (wordmark) other = `<span class="wm-block"><span class="wm">${WORDMARK}</span><span class="tagline">${TAGLINE}</span></span>`;
    else if (legend) other = `<span class="micro-legend">${legend}</span>`;
    p.foot.innerHTML = p.recto ? folio + other : other + folio;
  }

  function usedRegisters() {
    const used = new Set((data.commentary || []).filter(visible).map(e => (SIGLA[e.register] ? e.register : "traditional")));
    return ["traditional", "modern", "critical", "reference"].filter(k => used.has(k));
  }
  function microLegend() {
    return usedRegisters().map(k => `<span>${SIGLA[k]}${REGISTER_NAMES[k]}</span>`).join("");
  }

  // ---- cover ----------------------------------------------------------------

  function buildFrontPage() {
    const p = newPage("front");
    setHead(p, series.name, `Haftarah · ${seriesLabel}`);
    setFoot(p, { wordmark: true });

    // Hero: the mural sits at a fixed height; the incipit block centres on it.
    const hero = el("div", "hero" + (opts.logo ? "" : " no-mark"));
    if (opts.logo) { const img = el("img", "mark"); img.src = opts.logo; img.alt = ""; hero.append(img); }
    const inc = el("div", "incipit-block");
    const h1 = el("h1", "incipit", divineName(data.haftarah.incipit?.he || ""));
    inc.append(h1);
    if (data.haftarah.incipit?.en) inc.append(el("p", "incipit-en", esc(data.haftarah.incipit.en)));
    const rl = el("div", "reading-line");
    rl.innerHTML =
      `<div class="ref">${esc(dash(data.haftarah.ref))}</div>` +
      `<div class="shabbat">${esc(shabbatName())}</div>` +
      `<div class="dates">${esc(data.shabbat.civilDisplay)}&nbsp;&nbsp;<span class="he-date">${esc(data.shabbat.hebrew || "")}</span></div>`;
    inc.append(rl);
    hero.append(inc);
    p.body.append(hero);

    // Fit the incipit: measure at 60pt on one line, then size to a 3.5in box.
    h1.style.whiteSpace = "nowrap";
    h1.style.fontSize = "60pt";
    h1.style.width = "max-content";
    const fit = L.fitIncipitSize(h1.getBoundingClientRect().width, 3.5 * 96);
    h1.style.width = "";
    h1.style.fontSize = fit.size + "pt";
    h1.style.whiteSpace = fit.lines === 2 ? "normal" : "nowrap";
    if (fit.lines === 2) h1.style.lineHeight = "1.3";
    p.page.dataset.incipit = `${fit.size}pt/${fit.lines}`;

    // Opening note: calendar paragraph(s), hairline, setting paragraph(s).
    const note = el("div", "opening-note" + (openingNote.status && openingNote.status !== "approved" ? " proposed" : ""));
    const cal = paras(openingNote.calendar), set = paras(openingNote.setting);
    cal.forEach(t => note.append(el("p", "cal", t)));
    set.forEach((t, i) => note.append(el("p", i === 0 && cal.length ? "setting rule" : "setting", t)));
    p.body.append(note);

    // Legend: always the same four, in the same order; unused ones greyed; then the keys.
    const used = new Set(usedRegisters());
    const legend = el("div", "legend");
    L.REGISTER_ORDER.forEach(k => legend.append(el("span", used.has(k) ? "" : "unused", `${SIGLA[k]}${REGISTER_NAMES[k]}`)));
    const hasKeys = (document.documentElement.dataset.keys || "").length > 0;
    legend.append(el("span", hasKeys ? "" : "unused", `<span class="k">a–z</span>translators’ notes (JPS) and word notes, in the margin`));
    if (data.verses.some(v => /\[[^\]]*\]\s*\([^)]*\)|\([^)]*\)\s*\[[^\]]*\]/.test(v.he))) {
      legend.append(el("span", "", `<span class="k">[ ] ( )</span>read / written: where tradition reads a word differently from its spelling`));
    }
    p.body.append(legend);

    // Voices on this sheet.
    const voices = L.voicesFor(data.commentary || [], opts.voices || {}, visible);
    let vb = null;
    if (voices.length) {
      vb = el("div", "voices");
      vb.append(el("h2", null, "Voices on this sheet"));
      // One running paragraph: "Rashi R. Shlomo Yitzchaki, Troyes, 1040–1105 · Radak …"
      const list = el("p", "voices-list", voices.map(v => `<span class="voice"><span class="name">${esc(v.name)}</span>${v.line ? ` ${esc(v.line)}` : ""}</span>`).join('<span class="sep"> · </span>'));
      vb.append(list);
      p.body.append(vb);
      document.documentElement.dataset.voicesMissing = voices.filter(v => !v.line).map(v => v.name).join("|");
    }

    const prov = el("div", "provenance");
    prov.innerHTML =
      `<span class="editions">Hebrew: ${esc(data.haftarah.versions.he)}. English: ${esc(data.haftarah.versions.en)}.</span> ` +
      `<span class="signoff">${signoff}</span>` +
      (data.credits?.editor && data.credits?.signoff ? ` <span class="signature">— ${esc(data.credits.editor)}</span>` : "");
    p.body.append(prov);

    // A long opening note wins over the voices: they move to the end matter rather than overflow.
    // Measure with the provenance pulled up (its auto margin otherwise fills the page).
    const fill = () => {
      prov.style.marginTop = "0";
      const f = (prov.getBoundingClientRect().bottom - p.body.getBoundingClientRect().top + parseFloat(getComputedStyle(prov).marginBottom)) / p.body.clientHeight;
      prov.style.marginTop = "";
      return f;
    };
    if (fill() > 1.005 && vb) { vb.remove(); vb.classList.add("block"); voicesForEnd = vb; p.page.dataset.voices = "end"; }
    p.page.dataset.fill = String(Math.round(100 * fill()));
    p.page.dataset.overflow = String(fill() > 1.005);
  }
  let voicesForEnd = null;

  // ---- text pages -----------------------------------------------------------

  function buildVerseRow(v, isFirst) {
    const row = el("div", "verse-row" + (isFirst ? " first" : "") + (v.prevBreak ? ` break-${v.prevBreak}` : ""));
    const lines = L.splitPoetry(v.en);
    const en = el("div", "en" + (lines.length > 1 ? " poetry" : ""));
    const enInner = el("div", "inner");
    if (lines.length > 1) lines.forEach(t => enInner.append(el("span", "ln", L.nowrapKeys(t))));
    else enInner.innerHTML = L.nowrapKeys(lines[0] || "");
    en.append(enInner);
    const gut = el("div", "gut");
    // The locator ("20:18") shows at a chapter change and on the first row of every page.
    row.setLocator = (show) => {
      gut.innerHTML = (show || v.showChapter ? `<span class="ch">${v.chapter}:${v.verse}</span>` : "") + v.verse;
    };
    row.setLocator(false);
    let heHtml = divineName(v.he.replace(/&thinsp;|\u2009/g, " "));
    for (const k of (v.keys || [])) if (k.kind === "gloss") heHtml = keyHebrew(heHtml, k.he, k.key);
    const he = el("div", "he");
    const heInner = el("div", "inner", heHtml);
    he.append(heInner);
    row.append(en, gut, he);
    const notes = [];
    for (const k of (v.keys || [])) {
      const cls = "note " + k.kind + (k.kind === "gloss" && k.status !== "approved" ? " proposed" : "");
      const vn = k.kind === "gloss" ? `<span class="vn">${k.verse}</span>` : "";
      const lemma = k.lemma ? `<span class="lemma">${esc(k.lemma)}</span><span class="brk">]</span> ` : "";
      const heLemma = k.kind === "gloss" && k.he ? `<span class="he-lemma">${divineName(esc(k.he))}</span> ` : "";
      const tail = k.kind === "jps" ? ` <span class="tail">JPS</span>` : "";
      const note = el("p", cls, `<span class="k">${k.key}</span>${vn}${lemma}${heLemma}${divineName(k.text)}${tail}`);
      note.dataset.verse = k.verse;
      notes.push(note);
    }
    return { row, notes };
  }

  function buildEntry(e, { offpage = null } = {}) {
    const reg = SIGLA[e.register] ? e.register : "traditional";
    const entry = el("p", "entry" + (e.status !== "approved" ? " proposed" : ""));
    const vr = e.verseEnd ? `${e.verse}–${e.verseEnd}` : String(e.verse);
    const where = offpage ? `<span class="where"> · p. ${offpage}</span>` : "";
    const lemma = e.lemma ? `<span class="lem${e.lemmaLang === "he" ? " he-lemma" : ""}">${esc(e.lemma)}</span><span class="brk">]</span>` : "";
    const tailBits = [];
    if (e.sourceRef) tailBits.push(esc(dash(e.sourceRef)));
    if (e.translation === "claude") tailBits.push("translated for this sheet");
    else if (e.translation) tailBits.push(esc(e.translation));
    if (e.register === "critical" && e.kind !== "quotation") tailBits.push("summary drafted for this sheet");
    if (e.cites) tailBits.push(e.cites);
    const drafted = e.register === "critical" || e.register === "reference";
    entry.innerHTML =
      `<span class="sig" title="${REGISTER_NAMES[reg]}">${SIGLA[reg]}</span>` +
      `<span class="v">${vr}${where}</span>${lemma} ` +
      `<span class="src${drafted ? " drafted" : ""}">${esc(e.source)}</span>` +
      `<span class="body">${divineName(e.text)}</span>` +
      (tailBits.length ? ` <span class="tail">${tailBits.join("; ")}.</span>` : "");
    return entry;
  }

  // Line boxes of a cell's inner block, as [top, bottom] pairs relative to the cell.
  function lineBoxes(cell) {
    const inner = cell.querySelector(".inner") || cell;
    const range = document.createRange();
    range.selectNodeContents(inner);
    const top0 = cell.getBoundingClientRect().top;
    const rects = [...range.getClientRects()].filter(r => r.height > 0).map(r => [r.top - top0, r.bottom - top0]).sort((a, b) => a[0] - b[0]);
    const lines = [];
    for (const [t, b] of rects) {
      const mid = (t + b) / 2;
      const hit = lines.find(l => mid >= l[0] - 1 && mid <= l[1] + 1);
      if (hit) { hit[0] = Math.min(hit[0], t); hit[1] = Math.max(hit[1], b); }
      else lines.push([t, b]);
    }
    return lines.sort((a, b) => a[0] - b[0]);
  }

  // Split a row so that its head fits in `budget` px. Each cell is clipped at a line boundary of its
  // own. Returns null when fewer than two lines of either language would stay on the head, or when
  // nothing would move to the tail.
  function splitRow(r, budget) {
    const g = el("div", "text-grid");
    g.append(r.node);
    stage.append(g);
    const en = r.node.querySelector(".en"), he = r.node.querySelector(".he");
    const enL = lineBoxes(en), heL = lineBoxes(he);
    const cut = lines => { let k = 0; while (k < lines.length && lines[k][1] <= budget) k++; return k; };
    // The tail always carries at least one line of each language, so a reader never meets Hebrew
    // without its English (or the reverse); a language that fits the budget whole holds back its last line.
    const kEn = Math.min(cut(enL), enL.length - 1), kHe = Math.min(cut(heL), heL.length - 1);
    g.remove();
    if (kEn < 2 || kHe < 2) return null;
    const hEn = enL[kEn][0];
    const hHe = heL[kHe][0];

    const head = r.node;                     // keep the original (its notes point at it)
    head.classList.add("split-head");
    en.style.setProperty("--clip", hEn + "px");
    he.style.setProperty("--clip", hHe + "px");

    const tailNode = r.node.cloneNode(true);
    tailNode.classList.remove("split-head", "first");
    tailNode.classList.add("split-tail");
    tailNode.querySelector(".gut").innerHTML = `<span class="ch">${r.v.chapter}:${r.v.verse}</span><span class="cont">${r.v.verse}</span>`;
    tailNode.setLocator = () => {};
    const g2 = el("div", "text-grid");
    g2.append(tailNode);
    stage.append(g2);
    const tailH = tailNode.getBoundingClientRect().height;
    g2.remove();

    const headRow = Object.assign({}, r, { node: head, h: Math.max(hEn, hHe), splitHead: true });
    const tailRow = { v: r.v, node: tailNode, notes: [], noteH: [], h: tailH, mt: 0, splitTail: true };
    return { head: headRow, tail: tailRow };
  }

  function measureRows(rows) {
    const grid = el("div", "text-grid");
    rows.forEach(r => { if (r.setLocator) r.setLocator(true); grid.append(r); });
    stage.append(grid);
    const heights = rows.map(r => r.getBoundingClientRect().height + parseFloat(getComputedStyle(r).marginTop));
    grid.remove();
    rows.forEach(r => { if (r.setLocator) r.setLocator(false); });
    return heights;
  }
  function measureNotes(nodes) {
    if (!nodes.length) return [];
    const col = el("div", "margin-col measuring");
    nodes.forEach(n => col.append(n));
    stage.append(col);
    const hs = nodes.map(n => n.getBoundingClientRect().height);
    col.remove();
    return hs;
  }
  const NOTE_GAP = 4; // px between stacked sidenotes
  const RULE_GAP = 16; // px between the last row (or last sidenote) and the apparatus rule
  function stackNotes(rowTops, rowsOnPage) {
    const placed = [];
    let prevBottom = -Infinity;
    rowsOnPage.forEach((r, k) => {
      let y = rowTops[k] + 2;
      r.notes.forEach((n, j) => {
        y = Math.max(y, prevBottom + NOTE_GAP);
        placed.push({ node: n, top: y });
        prevBottom = y + r.noteH[j];
        y = prevBottom + NOTE_GAP;
      });
    });
    return { placed, bottom: prevBottom === -Infinity ? 0 : prevBottom };
  }
  function measureApparatus(entries) {
    if (!entries.length) return 0;
    const app = el("div", "apparatus measuring");
    entries.forEach(e => app.append(e.node.cloneNode(true)));
    stage.append(app);
    const h = app.getBoundingClientRect().height;
    app.remove();
    return h;
  }

  function buildTextPages() {
    const verses = data.verses.slice();
    let lastCh = null;
    verses.forEach((v, i) => {
      v.showChapter = v.chapter !== lastCh;
      lastCh = v.chapter;
      v.prevBreak = i > 0 ? verses[i - 1].break : null;
    });
    const rows = verses.map((v, i) => { const b = buildVerseRow(v, i === 0); return { v, node: b.row, notes: b.notes }; });
    const heights = measureRows(rows.map(r => r.node));
    rows.forEach((r, i) => {
      r.h = heights[i];
      r.mt = parseFloat(getComputedStyle(r.node).marginTop || 0);
      r.noteH = measureNotes(r.notes);
    });

    const entries = (data.commentary || [])
      .filter(visible)
      .map(e => ({ e, node: buildEntry(e) }))
      .sort((a, b) => (a.e.chapter || 0) - (b.e.chapter || 0) || a.e.verse - b.e.verse || (a.e.order || 0) - (b.e.order || 0));
    entries.forEach(x => { x.ch = x.e.chapter != null ? x.e.chapter : (verses.find(v => v.verse === x.e.verse) || {}).chapter; });
    const entriesFor = v => entries.filter(x => x.e.verse === v.verse && x.ch === v.chapter);

    const probe = newPage("text");
    const bodyH = probe.body.getBoundingClientRect().height;
    probe.page.remove(); pageCount--;

    const appHeight = list => (list.length ? measureApparatus(list) + RULE_GAP : 0);

    const versePage = {};
    const keyOf = v => `${v.chapter}:${v.verse}`;
    const PX_IN = 96, GAP_MAX = 0.5 * PX_IN, MOVE_MAX = 1.2 * PX_IN;
    let i = 0, carry = [], lastPage = null, pendingTail = null;
    // Margin notes that do not fit beside their verse travel to the next page's margin: as many per
    // page as fit, in key order, and a displaced note shows its verse number.
    let carryNotes = [], carryNoteH = [];
    const withNotes = (r, notes, noteH) => Object.assign({}, r, { notes, noteH });
    const markCarried = n => {
      if (!n.querySelector(".vn")) n.querySelector(".k").insertAdjacentHTML("afterend", `<span class="vn">${n.dataset.verse}</span>`);
      n.classList.add("carried");
    };
    const unmarkCarried = n => { if (n.classList.contains("jps")) n.querySelector(".vn")?.remove(); n.classList.remove("carried"); };
    const defer = dropped => { for (const d of dropped) { markCarried(d.node); carryNotes.push(d.node); carryNoteH.push(d.h); } };
    // Trim a row's notes from the end until the stack clears the apparatus; the trimmed notes come back.
    const fitNotes = (rowTops, pageRows, r, top, appH) => {
      const notes = r.notes.slice(), noteH = r.noteH.slice(), dropped = [];
      while (notes.length) {
        const st = stackNotes(rowTops.concat(top), pageRows.concat(withNotes(r, notes, noteH)));
        if (st.bottom + appH <= bodyH) break;
        dropped.unshift({ node: notes.pop(), h: noteH.pop() });
      }
      return { r: withNotes(r, notes, noteH), dropped };
    };

    while (i < rows.length || carry.length || pendingTail || carryNotes.length) {
      const p = newPage("text");
      lastPage = p;
      const pageRows = [], rowTops = [];
      let pageEntries = carry.slice(); carry = [];
      let textH = 0, spilling = false, deferring = false;
      let notesIn = carryNotes, noteHIn = carryNoteH; carryNotes = []; carryNoteH = [];

      while (pageEntries.length > 1 && appHeight(pageEntries) > bodyH) carry.unshift(pageEntries.pop());
      if (carry.length) spilling = true;

      if (pendingTail) {
        let t = notesIn.length ? withNotes(pendingTail, notesIn, noteHIn) : pendingTail;
        notesIn = []; noteHIn = [];
        if (t.notes.length) {
          const f = fitNotes([], [], t, 0, appHeight(pageEntries));
          if (f.dropped.length) { defer(f.dropped); deferring = true; }
          t = f.r;
        }
        pageRows.push(t); rowTops.push(0); textH = t.h; pendingTail = null;
      }

      while (i < rows.length && !spilling) {
        let r = rows[i];
        let dropped = [];   // notes this row defers; committed only once the row is placed
        // The first row on a page inherits the notes carried over from the page before.
        if (!pageRows.length && notesIn.length) r = withNotes(r, notesIn.concat(r.notes), noteHIn.concat(r.noteH));
        else if (deferring && r.notes.length) { dropped = r.notes.map((n, j) => ({ node: n, h: r.noteH[j] })); r = withNotes(r, [], []); }
        const top = pageRows.length ? textH : 0;
        const rowH = pageRows.length ? r.h : r.h - r.mt;
        const tryText = textH + rowH;
        let appH = appHeight(pageEntries);
        let notes = stackNotes(rowTops.concat(top), pageRows.concat(r));
        let fits = tryText + appH <= bodyH && notes.bottom + appH <= bodyH;
        // Rule 2: never leave one verse alone because its apparatus is fat. Only when the apparatus
        // is what blocks; and once entries are sent on, no later verse's entries print ahead of them.
        if (!fits && pageRows.length === 1 && pageEntries.length && tryText <= bodyH && notes.bottom <= bodyH) {
          while (!fits && pageEntries.length) {
            carry.unshift(pageEntries.pop());
            appH = appHeight(pageEntries);
            fits = tryText + appH <= bodyH && notes.bottom + appH <= bodyH;
          }
          spilling = true;
        }
        // Rule 5: the text fits but its margin notes do not: place the verse with as many notes as
        // fit beside it and carry the rest forward.
        if (!fits && tryText + appH <= bodyH && r.notes.length) {
          const f = fitNotes(rowTops, pageRows, r, top, appH);
          dropped = dropped.concat(f.dropped); r = f.r;
          notes = stackNotes(rowTops.concat(top), pageRows.concat(r));
          fits = tryText + appH <= bodyH && notes.bottom + appH <= bodyH;
          deferring = true;
        }
        if (!fits && pageRows.length) break;
        if (!pageRows.length) { notesIn = []; noteHIn = []; }
        r.deferred = dropped.length;
        defer(dropped);
        pageRows.push(r); rowTops.push(top); textH = tryText; i++;
        versePage[keyOf(r.v)] = pageCount;
        for (const x of entriesFor(r.v)) {
          // An entry already carried onto this page with its verse (Rule 3) is not added twice.
          if (pageEntries.includes(x) || carry.includes(x)) continue;
          if (spilling) { carry.push(x); continue; }
          const tryEntries = pageEntries.concat(x);
          const tryApp = appHeight(tryEntries);
          const ok = textH + tryApp <= bodyH && notes.bottom + tryApp <= bodyH;
          if (ok || (pageEntries.length === 0 && pageRows.length === 1)) pageEntries = tryEntries;
          else { spilling = true; carry.push(x); }
        }
      }

      // Notes still waiting after the last verse get a page whose margin is theirs.
      if (!pageRows.length && notesIn.length) {
        const anchor = { v: null, synthetic: true, node: el("div", "verse-row synthetic"), notes: notesIn, noteH: noteHIn, h: 0, mt: 0 };
        const f = fitNotes([], [], anchor, 0, appHeight(pageEntries));
        defer(f.dropped);
        pageRows.push(f.r); rowTops.push(0);
        notesIn = []; noteHIn = [];
      }

      // Taking a row back off the page also takes back the notes it deferred (they are the last ones).
      const unplace = () => {
        const r = pageRows.pop(); rowTops.pop(); i--; delete versePage[keyOf(r.v)];
        if (r.deferred) {
          carryNotes.splice(-r.deferred, r.deferred).forEach(unmarkCarried);
          carryNoteH.splice(-r.deferred, r.deferred);
        }
        return r;
      };

      // Rule 3: a short last row that lost all its entries goes with them, but only when the move
      // leaves no more than the half-inch band the spec allows; otherwise the verse stays and its
      // entries follow on the next page under a page pointer.
      if (pageRows.length > 1) {
        const last = pageRows[pageRows.length - 1];
        const own = last.v ? entriesFor(last.v) : [];
        if (own.length && own.every(x => carry.includes(x)) && last.h < MOVE_MAX && !last.splitTail) {
          const slack = bodyH - (textH - last.h) - appHeight(pageEntries);
          if (slack <= GAP_MAX) {
            unplace();
            carry = own.concat(carry.filter(x => !own.includes(x)));
            textH -= last.h;
          }
        }
      }

      let placed = renderTextPage(p, pageRows, pageEntries, bodyH, versePage);
      while (placed.overflow > 0 && (pageRows.length > 1 || pageEntries.length > 1)) {
        if (pageRows.length > 1) {
          const r = unplace();
          const own = entriesFor(r.v);
          pageEntries = pageEntries.filter(x => !own.includes(x));
          carry = own.filter(x => !carry.includes(x)).concat(carry);
        } else {
          carry.unshift(pageEntries.pop());
        }
        placed = renderTextPage(p, pageRows, pageEntries, bodyH, versePage);
      }

      // Rule 4: a gap over half an inch and a row waiting: split the row at a line boundary.
      if (i < rows.length && placed.gap > GAP_MAX) {
        const own = entriesFor(rows[i].v);
        let budget = placed.gap - RULE_GAP - rows[i].mt - 4;
        // The bottom-pinned apparatus can re-balance a few pixels when the page re-renders, so a
        // head that misses by a little is cut one line shorter and tried again.
        for (let attempt = 0; attempt < 3 && budget > 0; attempt++) {
          const split = splitRow(rows[i], budget);
          if (!split) break;
          let head = split.head;
          if (deferring || carryNotes.length) { split.tail.notes = head.notes; split.tail.noteH = head.noteH; head = withNotes(head, [], []); }
          pageRows.push(head); rowTops.push(textH);
          versePage[keyOf(rows[i].v)] = pageCount;
          const added = own.filter(x => !carry.includes(x));
          carry = carry.concat(added);
          placed = renderTextPage(p, pageRows, pageEntries, bodyH, versePage);
          if (placed.overflow > 0 && head.notes.length) {   // the head's notes are what overflow: send them with the tail
            split.tail.notes = head.notes; split.tail.noteH = head.noteH;
            pageRows[pageRows.length - 1] = head = withNotes(head, [], []);
            placed = renderTextPage(p, pageRows, pageEntries, bodyH, versePage);
          }
          if (placed.overflow <= 0) { pendingTail = split.tail; i++; break; }
          // undo and try a shorter head
          pageRows.pop(); rowTops.pop(); delete versePage[keyOf(rows[i].v)];
          carry = carry.filter(x => !added.includes(x));
          unsplitRow(rows[i]);
          budget -= placed.overflow + 2;
          placed = renderTextPage(p, pageRows, pageEntries, bodyH, versePage);
        }
      }
      p.leftover = placed.leftover;
      p.grid = placed.grid;
    }
    return lastPage;
  }

  function unsplitRow(r) {
    r.node.classList.remove("split-head");
    r.node.querySelector(".en").style.removeProperty("--clip");
    r.node.querySelector(".he").style.removeProperty("--clip");
  }

  function renderTextPage(p, pageRows, pageEntries, bodyH, versePage) {
    p.body.innerHTML = "";
    const grid = el("div", "text-grid");
    pageRows.forEach((r, k) => { r.node.classList.toggle("first", k === 0); if (r.node.setLocator) r.node.setLocator(k === 0); grid.append(r.node); });
    p.body.append(grid);

    // place sidenotes from the rows' real positions, not the predicted ones
    const bodyRect = p.body.getBoundingClientRect();
    const realTops = pageRows.map(r => r.node.getBoundingClientRect().top - bodyRect.top);
    const stacked = stackNotes(realTops, pageRows);
    if (stacked.placed.length) {
      const col = el("div", "margin-col");
      stacked.placed.forEach(({ node, top }) => { node.style.top = top + "px"; col.append(node); });
      p.body.append(col);
    }

    const real = pageRows.filter(r => r.v);
    const here = new Set(real.map(r => `${r.v.chapter}:${r.v.verse}`));
    let appTop = bodyH, offpage = 0;
    if (pageEntries.length) {
      const app = el("div", "apparatus");
      pageEntries.forEach(x => {
        const k = `${x.ch}:${x.e.verse}`;
        if (here.has(k)) app.append(x.node);
        else { offpage++; app.append(buildEntry(x.e, { offpage: versePage[k] || null })); }
      });
      p.body.append(app);
      appTop = app.getBoundingClientRect().top - bodyRect.top;
    }
    const gridBottom = pageRows.length ? grid.getBoundingClientRect().bottom - bodyRect.top : 0;
    const contentBottom = Math.max(gridBottom, stacked.bottom);
    const overflow = contentBottom + (pageEntries.length ? RULE_GAP : 0) - appTop;
    const gap = pageEntries.length ? appTop - contentBottom : bodyH - contentBottom;

    const first = real[0]?.v, last = real[real.length - 1]?.v;
    const range = first ? (first === last ? `${first.chapter}:${first.verse}` : first.chapter === last.chapter ? `${first.chapter}:${first.verse}–${last.verse}` : `${first.chapter}:${first.verse}–${last.chapter}:${last.verse}`) : "";
    setHead(p, shabbatName(), range ? `${data.haftarah.book} ${range}` : "Commentary, continued");
    setFoot(p, { legend: microLegend() });

    p.page.dataset.rows = String(real.length);
    p.page.dataset.overflow = String(overflow > 1);
    p.page.dataset.gap = String(Math.round(pageEntries.length ? gap : -1));
    p.page.dataset.fill = String(Math.round(100 * (contentBottom + (pageEntries.length ? bodyH - appTop : 0)) / bodyH));
    const hasHead = pageRows.some(r => r.splitHead), hasTail = pageRows.some(r => r.splitTail);
    p.page.dataset.split = hasHead && hasTail ? "both" : hasHead ? "head" : hasTail ? "tail" : "";
    p.page.dataset.cont = "0";
    p.page.dataset.offpage = String(offpage);
    p.page.dataset.leftover = String(Math.round(-overflow));
    return { overflow, leftover: -overflow, grid, gap };
  }

  // ---- end matter -----------------------------------------------------------

  function endBlocks() {
    const blocks = [];
    const terms = (data.glossary || []).filter(visible);
    if (terms.length) {
      const b = el("div", "block");
      b.append(el("h2", null, "Names and places"));
      const g = el("div", "glossary");
      for (const t of terms) g.append(el("p", t.status !== "approved" ? "proposed" : null, `<span class="term">${esc(t.term)}</span>${t.he ? `<span class="term-he">${divineName(esc(t.he))}</span>` : ""} ${divineName(t.text)}`));
      b.append(g); blocks.push(b);
    }
    // Discussion questions are never printed (decision of 2026-10-07).
    if (voicesForEnd) blocks.push(voicesForEnd);
    const col = el("div", "block colophon");
    col.append(el("h2", null, "About this sheet"));
    col.append(el("p", null, `Hebrew text: ${esc(data.haftarah.versions.he)}; English: ${esc(data.haftarah.versions.en)}; both via Sefaria. Commentary as credited in each entry.`));
    col.append(el("p", null, `${esc(data.credits?.issuedBy || "")} · ${esc(series.name)} · ${esc(seriesLabel)}`));
    blocks.push(col);
    if (data.nextWeek && visible(data.nextWeek)) {
      const nw = data.nextWeek;
      const line = `Next week: ${esc(nw.shabbat)}${nw.special ? `, ${esc(String(nw.special).replace(/^Shabbat\s+/i, ""))}` : ""} · ${esc(dash(nw.ref))}${nw.civilDisplay ? ` · ${esc(nw.civilDisplay)}` : ""}`;
      blocks.push(el("p", "nextweek" + (nw.status !== "approved" ? " proposed" : ""), line));
    }
    document.documentElement.dataset.emptySections = "0";
    return blocks;
  }

  // End matter goes above the last apparatus when it all fits there; otherwise it all goes to one
  // new page together. The colophon is never alone on a page.
  function buildEndMatter(lastTextPage) {
    const blocks = endBlocks();
    const measure = node => { stage.append(node); const h = node.getBoundingClientRect().height + 16; node.remove(); return h; };
    const total = blocks.map(b => measure(b.cloneNode(true))).reduce((a, b) => a + b, 0) + 18;
    if (lastTextPage && lastTextPage.leftover > total + 8) {
      const wrap = el("div", "endmatter inline");
      wrap.style.marginTop = "18pt";
      blocks.forEach(b => wrap.append(b));
      lastTextPage.grid.after(wrap);
      const bh = lastTextPage.body.getBoundingClientRect().height;
      const prev = Number(lastTextPage.page.dataset.fill || 0);
      lastTextPage.page.dataset.fill = String(Math.min(100, Math.round(prev + 100 * wrap.getBoundingClientRect().height / bh)));
      return;
    }
    const p = newPage("end");
    setHead(p, shabbatName(), dash(data.haftarah.ref));
    setFoot(p, { legend: microLegend() });
    const wrap = el("div", "endmatter");
    p.body.append(wrap);
    blocks.forEach(b => wrap.append(b));
    const used = wrap.getBoundingClientRect().height;
    p.page.dataset.fill = String(Math.round(100 * used / p.body.getBoundingClientRect().height));
    // A glossary too long for one page is a data problem; report it rather than hide it.
    p.page.dataset.overflow = String(p.body.scrollHeight > p.body.clientHeight + 1);
  }

  // ---- go -------------------------------------------------------------------

  function run() {
    root.innerHTML = "";
    pageCount = 0;
    // Keys are assigned once, before anything renders, so the front-page legend knows if any exist.
    const keyed = L.assignKeys(data.verses, data.glosses || [], visible);
    keyed.verses.forEach((kv, idx) => { data.verses[idx].en = kv.en; data.verses[idx].keys = kv.keys; });
    document.documentElement.dataset.keys = keyed.sequence.join(",");
    buildFrontPage();
    const last = buildTextPages();
    buildEndMatter(last);
    document.title = `${shabbatName()} — ${dash(data.haftarah.ref)}${DRAFT ? " (draft)" : ""}`;
    document.documentElement.dataset.pages = String(pageCount);
    document.documentElement.dataset.yy = String(yyCount);
    window.SHEET_PAGES = pageCount;
    window.SHEET_YY = yyCount;
    const rn = document.querySelector(".review-note");
    if (rn) rn.append(` Divine name set as יי ${yyCount} time${yyCount === 1 ? "" : "s"}.`);
    // ?page=N shows one page alone (used for review captures).
    const only = Number(new URLSearchParams(location.search).get("page"));
    if (only) {
      document.documentElement.dataset.single = "true";
      [...root.children].forEach((pg, i) => { if (i + 1 !== only) pg.classList.add("hidden"); });
    }
  }

  // Lay out only after every face is loaded; otherwise rows are measured in a fallback
  // font and reflow after pagination, which is how text ends up under the apparatus rule.
  async function start() {
    if (document.fonts && document.fonts.load) {
      const faces = [
        '400 10pt "Literata"', 'italic 400 10pt "Literata"', '500 10pt "Literata"', '600 10pt "Literata"', '700 10pt "Literata"',
        '400 10pt "Ezra SIL"', '400 10pt "Noto Serif Hebrew"',
      ];
      try { await Promise.all(faces.map(f => document.fonts.load(f, "אבג abc"))); } catch (e) { /* fall through */ }
      try { await document.fonts.ready; } catch (e) { /* fall through */ }
    }
    run();
  }
  start();
})();
