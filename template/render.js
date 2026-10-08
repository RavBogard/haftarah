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
  const visible = item => DRAFT ? item.status !== "rejected" : item.status === "approved";

  const SIGLA = {
    traditional: '<svg viewBox="0 0 10 10" aria-hidden="true"><rect x="1" y="1" width="8" height="8" fill="currentColor"/></svg>',
    modern: '<svg viewBox="0 0 10 10" aria-hidden="true"><circle cx="5" cy="5" r="3.5" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>',
    critical: '<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M5 1.3 L9.2 8.7 H0.8 Z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>',
    reference: '<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M5 1 L9 5 L5 9 L1 5 Z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>',
  };
  const REGISTER_NAMES = { traditional: "traditional", modern: "modern", critical: "historical-critical", reference: "reference" };

  const stripMarks = s => s.normalize("NFD").replace(/[֑-ֽֿ-ׇ]/g, "").normalize("NFC");

  // Insert a keying circle after the Hebrew lemma inside the verse HTML.
  function keyHebrew(html, lemma) {
    if (!lemma) return html;
    const mark = '<span class="circ">°</span>';
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
    const page = el("section", `page ${kind || ""}${pageCount % 2 === 0 ? " verso" : " recto"}`);
    const head = el("header", "frame-head");
    const left = el("span", "head-left");
    const right = el("span", "head-right");
    head.append(left, right);
    const body = el("div", "page-body");
    const foot = el("footer", "frame-foot");
    const fl = el("span", "foot-left", esc(data.credits?.issuedBy || ""));
    const fr = el("span", "folio", String(pageCount));
    if (pageCount % 2 === 0) foot.append(fr, fl); else foot.append(fl, fr);
    page.append(head, body, foot);
    root.append(page);
    return { page, head, left, right, body, foot };
  }
  function setHead(p, leftText, rightText) {
    p.left.innerHTML = esc(leftText) + (DRAFT ? '<span class="draft-flag">draft for review</span>' : "");
    p.right.textContent = rightText || "";
  }

  // ---- cover ----------------------------------------------------------------

  function buildCover() {
    const p = newPage("cover");
    // With a logo the head names the congregation (contract); without one the wordmark
    // in the logo slot names it, so the head carries the Hebrew date instead of repeating it.
    setHead(p, opts.logo ? (data.credits?.issuedBy || "") : (data.shabbat.hebrewEn || ""), "Haftarah");
    p.foot.innerHTML = "";

    const issuer = el("div", "issuer");
    if (opts.logo) {
      const img = el("img");
      img.src = opts.logo;
      img.alt = data.credits?.issuedBy || "";
      issuer.append(img);
    } else {
      issuer.append(el("div", "wordmark", `${esc(data.credits?.issuedBy || "")}<small>Haftarah study sheet</small>`));
    }

    const inc = el("div", "incipit-block");
    const heInc = data.haftarah.incipit?.he || "";
    inc.append(el("h1", "incipit", heInc));
    if (data.haftarah.incipit?.en) inc.append(el("p", "incipit-en", esc(data.haftarah.incipit.en)));
    const rl = el("div", "reading-line");
    rl.innerHTML =
      `<div class="ref">${esc(dash(data.haftarah.ref))}</div>` +
      `<div>${esc(shabbatName())}</div>` +
      `<div class="dates">${esc(data.shabbat.civilDisplay)}&nbsp;&nbsp;<span class="he-date">${esc(data.shabbat.hebrew || "")}</span></div>`;
    inc.append(rl);

    const why = el("div", "why");
    if (data.haftarah.defaultHaftarah) {
      why.append(el("p", null, `Read in place of the usual haftarah for ${esc(data.shabbat.parashah.en)}, ${esc(dash(data.haftarah.defaultHaftarah))}.`));
    }
    for (const t of paras(data.haftarah.whyThisHaftarah)) why.append(el("p", null, t));
    if (data.parashahConnection) for (const t of paras(data.parashahConnection)) why.append(el("p", null, t));

    p.body.append(issuer, inc);
    if (why.childElementCount) p.body.append(why);

    let context = null;
    if (data.context && visible(data.context) && (data.context.paragraphs || []).length) {
      context = el("div", "context" + (data.context.status !== "approved" ? " proposed" : ""));
      context.append(el("h2", null, esc(data.context.heading || `${data.haftarah.book}: the book and its world`)));
      for (const t of data.context.paragraphs) context.append(el("p", null, t));
    }
    const prov = el("div", "provenance");
    prov.innerHTML = `Hebrew: ${esc(data.haftarah.versions.he)}. English: ${esc(data.haftarah.versions.en)}. ` +
      (data.credits?.editor ? `Commentary selected and approved by ${esc(data.credits.editor)}. ` : "") +
      esc(data.credits?.note || "");

    if (context) p.body.append(context);
    p.body.append(prov);

    // If the context box pushes the cover past one page, move it to its own page.
    if (p.body.scrollHeight > p.body.clientHeight + 1 && context) {
      context.remove();
      if (p.body.scrollHeight > p.body.clientHeight + 1) prov.remove();
      const q = newPage("context-page");
      setHead(q, shabbatName(), dash(data.haftarah.ref));
      context.classList.add("standalone");
      q.body.append(context);
    }
  }

  // ---- text pages -----------------------------------------------------------

  function buildVerseRow(v, isFirst) {
    const row = el("div", "verse-row" + (isFirst ? " first" : "") + (v.prevBreak ? ` break-${v.prevBreak}` : ""));
    const en = el("div", "en", v.en);
    const gut = el("div", "gut");
    gut.innerHTML = (v.showChapter ? `<span class="ch">${v.chapter}</span>` : "") + v.verse;
    let heHtml = v.he.replace(/&thinsp;|\u2009/g, " ");
    const glosses = (data.glosses || []).filter(g => g.verse === v.verse && (g.chapter == null || g.chapter === v.chapter) && (g.status ? visible(g) : true));
    for (const g of glosses) heHtml = keyHebrew(heHtml, g.lemma);
    const he = el("div", "he", heHtml);
    row.append(en, gut, he);
    const notes = [];
    for (const n of (v.notes || [])) {
      notes.push(el("p", "note", `<span class="k">${esc(n.marker)}</span>${n.lemma ? `<span class="lemma">${esc(n.lemma)}</span> ` : ""}${n.text}`));
    }
    for (const g of glosses) {
      notes.push(el("p", "note" + (g.status && g.status !== "approved" ? " proposed" : ""), `<span class="k circ">°</span>${g.lemma ? `<span class="he-lemma">${esc(g.lemma)}</span> ` : ""}${g.text}`));
    }
    return { row, notes };
  }

  function buildEntry(e, continued) {
    const reg = SIGLA[e.register] ? e.register : "traditional";
    const entry = el("p", "entry" + (e.status !== "approved" ? " proposed" : "") + (continued ? " continued" : ""));
    const vr = e.verseEnd ? `${e.verse}–${e.verseEnd}` : String(e.verse);
    const lemma = e.lemma ? `<span class="lem${e.lemmaLang === "he" ? " he-lemma" : ""}">${esc(e.lemma)}</span><span class="brk">]</span>` : "";
    const tailBits = [];
    if (e.sourceRef) tailBits.push(esc(dash(e.sourceRef)));
    if (e.translation === "claude") tailBits.push("translated for this sheet");
    else if (e.translation) tailBits.push(esc(e.translation));
    if (e.register === "critical" && e.kind !== "quotation") tailBits.push("summary drafted for this sheet");
    if (e.cites) tailBits.push(e.cites);
    entry.innerHTML =
      `<span class="sig" title="${REGISTER_NAMES[reg]}">${SIGLA[reg]}</span>` +
      `<span class="v">${vr}</span>${lemma} ` +
      `<span class="src">${esc(e.source)}</span>` +
      `<span class="body">${e.text}</span>` +
      (tailBits.length ? ` <span class="tail">${tailBits.join("; ")}.</span>` : "");
    return entry;
  }

  function measureRows(rows) {
    const grid = el("div", "text-grid");
    rows.forEach(r => grid.append(r));
    stage.append(grid);
    const heights = rows.map(r => r.getBoundingClientRect().height + parseFloat(getComputedStyle(r).marginTop));
    grid.remove();
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
    const entriesFor = v => entries.filter(x => x.e.verse === v.verse && (x.e.chapter == null || x.e.chapter === v.chapter));

    const probe = newPage("text");
    const bodyH = probe.body.getBoundingClientRect().height;
    probe.page.remove(); pageCount--;

    const RULE_GAP = 16; // px between the last row (or last sidenote) and the apparatus rule
    const appHeight = list => (list.length ? measureApparatus(list) + RULE_GAP : 0);

    let i = 0;
    let carry = [];
    let lastPage = null;
    while (i < rows.length || carry.length) {
      const p = newPage("text");
      lastPage = p;
      const pageRows = [];
      const rowTops = [];
      let pageEntries = carry.slice();
      carry = [];
      let textH = 0;
      let spilling = false;

      while (pageEntries.length > 1 && appHeight(pageEntries) > bodyH) carry.unshift(pageEntries.pop());
      if (carry.length) spilling = true;

      while (i < rows.length && !spilling) {
        const r = rows[i];
        const top = pageRows.length ? textH : 0;
        const rowH = pageRows.length ? r.h : r.h - r.mt;
        const tryText = textH + rowH;
        const appH = appHeight(pageEntries);
        const notes = stackNotes(rowTops.concat(top), pageRows.concat(r));
        const fits = tryText + appH <= bodyH && notes.bottom + appH <= bodyH;
        if (!fits && pageRows.length) break;
        pageRows.push(r); rowTops.push(top); textH = tryText; i++;
        for (const x of entriesFor(r.v)) {
          if (spilling) { carry.push(x); continue; }
          const tryEntries = pageEntries.concat(x);
          const tryApp = appHeight(tryEntries);
          const ok = textH + tryApp <= bodyH && notes.bottom + tryApp <= bodyH;
          if (ok || (pageEntries.length === 0 && pageRows.length === 1)) pageEntries = tryEntries;
          else { spilling = true; carry.push(x); }
        }
      }

      // Render, then verify against the real geometry; measurements predict, the page decides.
      let placed = renderTextPage(p, pageRows, pageEntries, bodyH);
      while (placed.overflow > 0 && (pageRows.length > 1 || pageEntries.length > 1)) {
        if (pageRows.length > 1) {
          const r = pageRows.pop(); i--;
          const own = entriesFor(r.v);
          const moving = pageEntries.filter(x => own.includes(x));
          pageEntries = pageEntries.filter(x => !own.includes(x));
          carry = moving.concat(carry);
        } else {
          carry.unshift(pageEntries.pop());
        }
        placed = renderTextPage(p, pageRows, pageEntries, bodyH);
      }
      p.leftover = placed.leftover;
      p.grid = placed.grid;
    }
    return lastPage;
  }

  function renderTextPage(p, pageRows, pageEntries, bodyH) {
    p.body.innerHTML = "";
    const grid = el("div", "text-grid");
    pageRows.forEach((r, k) => { r.node.classList.toggle("first", k === 0); grid.append(r.node); });
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

    const versesHere = new Set(pageRows.map(r => r.v.verse));
    let appTop = bodyH;
    if (pageEntries.length) {
      const app = el("div", "apparatus");
      pageEntries.forEach(x => app.append(versesHere.has(x.e.verse) ? x.node : buildEntry(x.e, true)));
      p.body.append(app);
      appTop = app.getBoundingClientRect().top - bodyRect.top;
    }
    const gridBottom = pageRows.length ? grid.getBoundingClientRect().bottom - bodyRect.top : 0;
    const contentBottom = Math.max(gridBottom, stacked.bottom);
    const RULE_GAP = 16;
    const overflow = contentBottom + (pageEntries.length ? RULE_GAP : 0) - appTop;

    const first = pageRows[0]?.v, last = pageRows[pageRows.length - 1]?.v;
    const range = first ? (first === last ? `${first.chapter}:${first.verse}` : first.chapter === last.chapter ? `${first.chapter}:${first.verse}–${last.verse}` : `${first.chapter}:${first.verse}–${last.chapter}:${last.verse}`) : "";
    setHead(p, shabbatName(), range ? `${data.haftarah.book} ${range}` : "Apparatus, continued");
    const leftover = -overflow;
    p.page.dataset.leftover = String(Math.round(leftover));
    return { overflow, leftover, grid };
  }

  // ---- end matter -----------------------------------------------------------

  function endBlocks() {
    const blocks = [];
    if ((data.glossary || []).length) {
      const b = el("div", "block");
      b.append(el("h2", null, "Names and places"));
      const g = el("div", "glossary");
      for (const t of data.glossary) {
        if (t.status && !visible(t)) continue;
        g.append(el("p", null, `<span class="term">${esc(t.term)}</span>${t.he ? `<span class="term-he">${esc(t.he)}</span>` : ""} ${t.text}`));
      }
      b.append(g); blocks.push(b);
    }
    if ((data.questions || []).length) {
      const b = el("div", "block");
      b.append(el("h2", null, "For discussion"));
      const q = el("div", "questions");
      const ol = el("ol");
      for (const t of data.questions) ol.append(el("li", null, typeof t === "string" ? t : t.text));
      q.append(ol); b.append(q); blocks.push(b);
    }
    const col = el("div", "block colophon");
    const lines = [
      `Hebrew text: ${esc(data.haftarah.versions.he)}, via Sefaria.`,
      `English translation: ${esc(data.haftarah.versions.en)}, via Sefaria.`,
      (() => {
        const used = new Set((data.commentary || []).filter(visible).map(e => (SIGLA[e.register] ? e.register : "traditional")));
        const names = { traditional: "filled square, traditional", modern: "open circle, modern", critical: "triangle, historical-critical", reference: "diamond, reference work" };
        const list = ["traditional", "modern", "critical", "reference"].filter(k => used.has(k)).map(k => names[k]).join("; ");
        return `Commentary sources as credited in each entry.${list ? ` Register marks: ${list}.` : ""}`;
      })(),
      esc(data.credits?.note || ""),
      `${esc(data.credits?.issuedBy || "")}${data.credits?.editor ? `. Edited by ${esc(data.credits.editor)}` : ""}.`,
    ].filter(Boolean);
    col.append(el("h2", null, "About this sheet"));
    lines.forEach(t => col.append(el("p", null, t)));
    blocks.push(col);
    return blocks;
  }

  function buildEndMatter(lastTextPage) {
    const blocks = endBlocks();
    const measure = node => { stage.append(node); const h = node.getBoundingClientRect().height + 16; node.remove(); return h; };
    let p = null;
    let remaining = 0;
    // Try to use the room left above the apparatus on the last text page.
    if (lastTextPage && lastTextPage.leftover > 0) {
      const wrap = el("div", "endmatter inline");
      wrap.style.marginTop = "18pt";
      let used = 18;
      const fit = [];
      for (const b of blocks) {
        const h = measure(b.cloneNode(true));
        if (used + h <= lastTextPage.leftover - 8) { fit.push(b); used += h; } else break;
      }
      if (fit.length) {
        fit.forEach(b => wrap.append(b));
        lastTextPage.grid.after(wrap);
        blocks.splice(0, fit.length);
      }
    }
    for (const b of blocks) {
      const h = measure(b.cloneNode(true));
      if (!p || h > remaining) {
        p = newPage("end");
        setHead(p, shabbatName(), dash(data.haftarah.ref));
        p.wrap = el("div", "endmatter");
        p.body.append(p.wrap);
        remaining = p.body.getBoundingClientRect().height;
      }
      p.wrap.append(b);
      remaining -= h;
    }
  }

  // ---- go -------------------------------------------------------------------

  function run() {
    root.innerHTML = "";
    pageCount = 0;
    buildCover();
    const last = buildTextPages();
    buildEndMatter(last);
    document.title = `${shabbatName()} — ${dash(data.haftarah.ref)}${DRAFT ? " (draft)" : ""}`;
    document.documentElement.dataset.pages = String(pageCount);
    window.SHEET_PAGES = pageCount;
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
