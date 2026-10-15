// The side panel (a source in full, or a Hebrew word's root and senses, from Sefaria) and the
// popovers on the keyed letters. sheet.js builds the hooks; this file only answers them.
import { fetchText, lookupWord } from "./sefaria.js";
import { noteHtml } from "./sheet.js";
import { dataUrl, SIDE_FILES } from "./contract.js";
import { describe, occurrences, hereLine, allLine, stepUrl, bibleHubUrl } from "./words.js";

// Sefaria's text and dictionary markup is trusted but not ours: keep inline text tags only, strip
// scripts, frames, handlers and non-http links before it reaches the live document.
// Case-insensitive: inside <svg>/<math> the parser keeps lowercase tag names.
const KEEP = /^(P|B|I|EM|STRONG|BR|SPAN|SUP|SUB|SMALL|BIG|A|OL|UL|LI|DIV|ABBR)$/i;
const DROP = /^(SCRIPT|STYLE|IFRAME|OBJECT|EMBED|TEMPLATE|META|LINK|BASE|SVG|MATH)$/i;
export function clean(html) {
  const t = document.createElement("template");
  t.innerHTML = String(html == null ? "" : html);
  for (const n of [...t.content.querySelectorAll("*")]) {
    if (!KEEP.test(n.tagName)) { n.replaceWith(...(DROP.test(n.tagName) ? [] : n.childNodes)); continue; }
    for (const a of [...n.attributes]) if (!["class", "lang", "dir", "title", "href"].includes(a.name)) n.removeAttribute(a.name);
    if (n.hasAttribute("href") && !/^(https?:|\/)/i.test(n.getAttribute("href").trim())) n.removeAttribute("href");
  }
  return t.innerHTML;
}

export function initPanel({ page, L, sefariaUrl, track = () => {} }) {
  const esc = L.escapeHtml, dash = L.enDash, SIG = L.SIGLA, NAMES = L.REGISTER_NAMES;
  const $ = id => document.getElementById(id);
  const panel = $("panel"), pKind = $("panelKind"), pBody = $("panelBody"), pClose = $("panelClose");
  const text = $("text"), rail = $("rail");

  // ---- note popovers on the keyed letters: one at a time, kept inside the viewport ----
  let pop = null;
  function closePop() { if (pop) { pop.anchor.setAttribute("aria-expanded", "false"); pop.anchor.removeAttribute("aria-controls"); pop.node.remove(); pop = null; } }
  document.addEventListener("click", e => {
    const b = e.target.closest("sup.fn button");
    if (!b) { if (pop && !pop.node.contains(e.target)) closePop(); return; }
    if (pop && pop.anchor === b) { closePop(); return; }
    closePop();
    const r = page.rows.find(x => x.row === b.closest(".row"));
    const k = r && r.keys.find(k => k.key === b.dataset.key); if (!k) return;
    const node = document.createElement("div");
    node.className = "notepop"; node.id = "notepop"; node.setAttribute("role", "note"); node.innerHTML = noteHtml(k, L);
    document.body.append(node);
    const rb = b.getBoundingClientRect(), w = node.offsetWidth, h = node.offsetHeight;
    let left = rb.left - 8; if (left + w > innerWidth - 8) left = innerWidth - w - 8; if (left < 8) left = 8;
    // below the letter, unless that runs off the bottom and there is room above it
    let top = rb.bottom + 6; if (top + h > innerHeight - 8 && rb.top - 6 - h > 8) top = rb.top - 6 - h;
    node.style.left = (left + scrollX) + "px"; node.style.top = (top + scrollY) + "px";
    b.setAttribute("aria-expanded", "true"); b.setAttribute("aria-controls", "notepop"); pop = { node, anchor: b };
  });

  // ---- the side panel ----
  let opener = null, activeWord = null, seq = 0;   // seq: a slow answer for an earlier click is dropped
  function openPanel(kind, html, from) {
    if (opener && opener !== from) opener.setAttribute("aria-expanded", "false");
    if (activeWord) { activeWord.classList.remove("active"); activeWord = null; }
    opener = from || null; if (opener) { opener.setAttribute("aria-expanded", "true"); opener.setAttribute("aria-controls", "panel"); }
    panel.inert = false;
    delete panel.dataset.alt;   // a related view sets it again right after
    pKind.textContent = kind; panel.setAttribute("aria-label", kind);
    pBody.innerHTML = html; pBody.scrollTop = 0;
    panel.setAttribute("data-open", ""); panel.setAttribute("aria-hidden", "false");
    return ++seq;
  }
  function closePanel() {
    if (!panel.hasAttribute("data-open")) return;
    seq++;
    panel.removeAttribute("data-open"); panel.setAttribute("aria-hidden", "true"); panel.inert = true;
    delete panel.dataset.alt; delete pBody.dataset.related; pBody.classList.remove("show-he");
    if (activeWord) { activeWord.classList.remove("active"); activeWord = null; }
    if (opener) { const o = opener; opener = null; o.setAttribute("aria-expanded", "false"); o.focus({ preventScroll: true }); }
  }
  // Sefaria's own markup links to its pages by path; point those at Sefaria, not at this site.
  function fill(token, html) {
    if (token !== seq) return;
    pBody.innerHTML = html;
    pBody.querySelectorAll('a[href^="/"]').forEach(a => { a.href = "https://www.sefaria.org" + a.getAttribute("href"); a.target = "_blank"; a.rel = "noopener"; });
  }
  pClose.addEventListener("click", closePanel);
  addEventListener("keydown", e => {
    if (e.key !== "Escape") return;
    closePop(); closePanel();   // the Aa settings panel handles its own Escape (settings.js)
  });
  const openLink = (href, label) => `<a class="open" href="${href}" target="_blank" rel="noopener">${label}<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M18 13v6H5V6h6"/></svg></a>`;

  // ---- a source name: the passage in full, Hebrew and English ----
  async function onSrc(e) {
    const b = e.target.closest("button.src"); if (!b) return;
    const ref = b.dataset.ref, reg = b.dataset.reg;
    const head = r => `<h2>${esc(b.dataset.src)}</h2><p class="sub"><span class="reg reg-${reg}">${SIG[reg] || ""}${NAMES[reg] || ""}</span> · ${esc(dash(r))}`;
    const token = openPanel("Source", `${head(ref)}</p><p class="loading">Fetching from Sefaria…</p>`, b);
    track("source_open", { source: b.dataset.src });
    try {
      const t = await fetchText(ref);
      fill(token, `${head(t.ref || ref)}${t.heRef ? ` · <span lang="he" dir="rtl" class="hebrew">${esc(t.heRef)}</span>` : ""}</p>` +
        (t.he ? `<div class="src-he" lang="he" dir="rtl">${clean(t.he.html)}</div><p class="vt">${esc(t.he.versionTitle)}</p>` : "") +
        (t.en ? `<div class="src-en">${clean(t.en.html)}</div><p class="vt">${esc(t.en.versionTitle)}</p>` : `<p class="inverse">No English on Sefaria for this passage.</p>`) +
        openLink(esc(sefariaUrl(ref)), "Open on Sefaria"));
    } catch (err) {
      fill(token, `${head(ref)}</p><p class="err">Sefaria did not answer (${esc(err.message)}).</p>` + openLink(esc(sefariaUrl(ref)), "Open on Sefaria"));
    }
  }
  rail.addEventListener("click", onSrc); text.addEventListener("click", onSrc);

  // ---- a Hebrew word: the root, the short gloss first, the full BDB article folded ----
  const senses = arr => !arr || !arr.length ? "" : `<ol>${arr.map(s => `<li>${clean(s && s.definition)}${senses(s && s.senses)}</li>`).join("")}</ol>`;
  const lexBlock = x => `<span class="hw" lang="he" dir="rtl">${esc(x.headword)}</span><span class="lexname">${esc(x.lexicon)}${x.morphology ? " · " + esc(x.morphology) : ""}</span>${senses(x.senses)}`;
  // words.json, fetched once per page on the first word tap, only when the week has it.
  let wordsFile = null;
  const loadWords = () => {
    if (!page.side || !page.side.words) return Promise.resolve(null);
    if (!wordsFile) wordsFile = fetch(dataUrl(page.slug, SIDE_FILES.words)).then(r => (r.ok ? r.json() : null)).catch(() => null);
    return wordsFile;
  };
  const chips = (list) => list.map(c => `<span class="chip"><span class="he hebrew" lang="he" dir="rtl">${esc(c.t)}</span>${esc(c.text)}</span>`).join("");
  function analysisHtml(d, entry, row, readingId, words) {
    const parts = [`<p class="sense">${esc(d.sentence)}</p>`];
    if (d.before.length || d.after.length) parts.push(`<p class="chips"><span class="chips-label">Prefixes and suffixes</span>${chips(d.before)}${chips(d.after)}</p>`);
    if (d.detail) parts.push(`<div class="detail">${esc(d.detail)}<details class="code"><summary>Show the code</summary><code>${esc(d.code)}</code></details></div>`);   // a div: a <p> cannot hold a <details>
    if (entry && entry.ketiv) parts.push(`<p class="ketiv-note">written as <span class="hebrew" lang="he" dir="rtl">${esc(entry.ketiv.replace(/\//g, ""))}</span></p>`);
    if (d.root && d.root.lem) {
      const occ = occurrences(words, readingId, d.root.lem);
      parts.push(`<h3>This word here</h3><p class="here">${esc(hereLine(occ.length))}</p><ul class="occ">${occ.map(o => `<li><button type="button" class="occ-go" data-reading="${esc(readingId)}" data-verse="${esc(o.key)}">${esc(o.key)}</button>${o.gloss ? ` <span class="occ-gl">${esc(o.gloss)}</span>` : ""}</li>`).join("")}</ul>`);
      const all = allLine(d.root.all);
      parts.push(`<p class="freq">${d.root.he ? `<span class="hebrew" lang="he" dir="rtl">${esc(d.root.he)}</span> ` : ""}${d.root.gloss ? `${esc(d.root.gloss)}${all ? " · " : ""}` : ""}${esc(all)}</p>`);
      const bh = bibleHubUrl(d.root.lem);
      parts.push(`<p class="wlinks">${openLink(esc(stepUrl(d.root.lem)), "Search this word on STEPBible")}${bh ? openLink(esc(bh), "Bible Hub") : ""}</p>`);
    }
    return parts.join("");
  }
  function openWord(w) {
    const row = w.closest(".row"), ref = row.dataset.ref, word = w.textContent;
    const readingId = row.dataset.reading, key = row.dataset.verse, i = [...row.querySelectorAll(".he .w")].indexOf(w);
    const head = `<h2 class="he hebrew" lang="he" dir="rtl">${esc(word)}</h2><p class="sub">${esc(dash(ref))}</p>`;
    const token = openPanel("Word", `${head}<p class="loading">Looking it up…</p>`, w);
    activeWord = w; w.classList.add("active");
    track("word_lookup", {});   // a count: the word itself is never sent
    const bdb = lookupWord(word, ref, L).then(x => {
      let body = "";
      if (!x.short.length && !x.full.length) body = `<p class="inverse">No dictionary entry for this form. Try the word without its prefix, or open the verse on Sefaria.</p>`;
      else {
        body += `<p class="root">Root <b lang="he" dir="rtl" class="hebrew">${x.roots.map(esc).join(" · ")}</b></p>`;
        body += x.short.map(e => `<div class="lex">${lexBlock(e)}</div>`).join("");
        if (x.short.length) { if (x.full.length) body += `<details class="lex"><summary>Full entry</summary>${x.full.map(e => `<div class="full">${lexBlock(e)}</div>`).join("")}</details>`; }
        else body += x.full.map(e => `<div class="lex">${lexBlock(e)}</div>`).join("");
      }
      return body;
    }, err => `<p class="err">Sefaria did not answer (${esc(err.message)}).</p>`);
    // The analysis (local, instant) shows first; the dictionary entry folds in below when it arrives.
    const shown = loadWords().then(words => {
      const list = words && words.readings && words.readings[readingId] && words.readings[readingId].verses && words.readings[readingId].verses[key];
      const entry = list ? list.find(x => x.i === i) : null;
      const d = describe(entry || null, (words && words.lemmas) || {});
      const analysed = !!(entry && entry.seg && entry.seg.length);
      fill(token, `${head}${analysisHtml(d, entry, row, readingId, words)}<div class="bdb" id="bdb">${analysed ? `<details class="lex"><summary>Dictionary (BDB)</summary><p class="loading">Looking it up…</p></details>` : `<p class="loading">Looking it up…</p>`}</div>` + openLink(esc(sefariaUrl(ref)), "Open the verse on Sefaria"));
      return { analysed, entry };
    });
    shown.catch(() => {});
    shown.then(({ analysed }) => bdb.then(body => {
      if (token !== seq) return;
      const host = pBody.querySelector("#bdb"); if (!host) return;
      host.innerHTML = analysed ? `<details class="lex"><summary>Dictionary (BDB)</summary>${body}</details>` : body;
      host.querySelectorAll('a[href^="/"]').forEach(a => { a.href = "https://www.sefaria.org" + a.getAttribute("href"); a.target = "_blank"; a.rel = "noopener"; });
    }));
    return shown;
  }
  // "This word here": a tap goes to that verse. Wide, the panel stays open beside it; narrower, the panel
  // covers the text, so it closes and focus goes to the verse's number.
  pBody.addEventListener("click", e => {
    const b = e.target.closest("button.occ-go"); if (!b) return;
    const r = page.rows.find(x => x.row.dataset.reading === b.dataset.reading && x.row.dataset.verse === b.dataset.verse);
    if (!r) return;
    page.goToHash(`#${r.row.id}`);
    if (!matchMedia("(min-width: 1100px)").matches) { closePanel(); r.row.querySelector(".gut button").focus({ preventScroll: true }); }
  });
  text.addEventListener("click", e => { const w = e.target.closest(".he .w"); if (w) openWord(w); });
  text.addEventListener("keydown", e => { const w = e.target.closest(".he .w"); if (w && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); openWord(w); } });

  // ---- everything on this verse (spec 5.7): Sefaria's related texts, visibly not the sheet ----
  let linksFile = null;
  const loadLinks = () => {
    if (!page.side || !page.side.links) return Promise.resolve(null);
    if (!linksFile) linksFile = fetch(dataUrl(page.slug, SIDE_FILES.links)).then(r => (r.ok ? r.json() : null)).catch(() => null);
    return linksFile;
  };
  const shortRef = (ref, title) => { const s = String(ref).startsWith(title) ? String(ref).slice(title.length).replace(/^\s*on\s+/, "").trim() : String(ref); return s || String(ref); };
  const BANNER = `<p class="from-sefaria">From Sefaria, not edited by CRC</p>`;
  function relatedHtml(r, data) {
    const ref = esc(dash(r.v.ref));
    if (!data) return `<h2>${ref}</h2>${BANNER}<p class="inverse">Nothing is listed for this verse.</p>`;
    if (data.failed) return `<h2>${ref}</h2>${BANNER}<p class="inverse">Sefaria did not answer for this verse when the sheet was published.</p>`;
    const work = w => {
      const used = page.sources && page.sources.has(w.title);
      const item = (x, cls) => `<button type="button" class="rel${cls}" data-ref="${esc(x)}" data-title="${esc(w.title)}">${esc(shortRef(x, w.title))}</button>`;
      return `<p class="rel-work"><span class="rel-title">${esc(w.title)}</span>${used ? `<span class="used-mark">on this sheet</span>` : ""} ${(w.refs || []).map(x => item(x, "")).join("")}${(w.he || []).map(x => item(x, " he-only")).join("")}</p>`;
    };
    const groups = (data.groups || []).map(g => `<details class="rel-group"><summary>${esc(g.category)} (${g.works.reduce((n, w) => n + (w.refs || []).length + (w.he || []).length, 0)})</summary>${g.works.map(work).join("")}</details>`).join("");
    return `<h2>${ref}</h2>${BANNER}<label class="heonly"><input type="checkbox" id="relHe"${pBody.classList.contains("show-he") ? " checked" : ""}> Show texts with no English</label>${groups || `<p class="inverse">Nothing is listed for this verse.</p>`}` + openLink(esc(sefariaUrl(r.v.ref)), "Open on Sefaria");
  }
  const gutButtonOf = r => r.row.querySelector(".gut button");
  async function openRelated(r) {
    const token = openPanel("On this verse", `<h2>${esc(dash(r.v.ref))}</h2>${BANNER}<p class="loading">Loading…</p>`, gutButtonOf(r));
    panel.dataset.alt = "1";
    const file = await loadLinks();
    const data = file && file.readings && file.readings[r.reading] && file.readings[r.reading].verses && file.readings[r.reading].verses[r.row.dataset.verse];
    fill(token, relatedHtml(r, data || null));
    pBody.dataset.related = r.row.id;
    return { groups: (data && data.groups || []).length, n: (data && data.n) || 0 };
  }
  pBody.addEventListener("change", e => { if (e.target.id === "relHe") pBody.classList.toggle("show-he", e.target.checked); });
  pBody.addEventListener("click", async e => {
    const back = e.target.closest("button.back");
    if (back) {
      // Back to the list, with the group of the text just read open and focus on that text's button.
      const r = page.rows.find(x => x.row.id === back.dataset.row), was = back.dataset.ref;
      if (r) openRelated(r).then(() => { const x = [...pBody.querySelectorAll("button.rel")].find(n => n.dataset.ref === was); if (x) { x.closest("details").open = true; x.focus({ preventScroll: true }); } });
      return;
    }
    const b = e.target.closest("button.rel"); if (!b) return;
    const ref = b.dataset.ref, title = b.dataset.title, rowId = pBody.dataset.related;
    const head = `<button type="button" class="back" data-row="${esc(rowId)}" data-ref="${esc(ref)}">← Everything on ${esc(dash((page.rows.find(x => x.row.id === rowId) || { v: { ref: "" } }).v.ref))}</button><h2>${esc(title)}</h2><p class="sub">${esc(dash(ref))}</p>${BANNER}`;
    const token = openPanel("On this verse", `${head}<p class="loading">Fetching from Sefaria…</p>`, opener);
    panel.dataset.alt = "1";
    pBody.querySelector("button.back").focus({ preventScroll: true });   // the tapped button is gone; keep focus in the panel
    track("source_open", { source: title });
    try {
      const t = await fetchText(ref);
      fill(token, head +
        (t.he ? `<div class="src-he" lang="he" dir="rtl">${clean(t.he.html)}</div><p class="vt">${esc(t.he.versionTitle)}</p>` : "") +
        (t.en ? `<div class="src-en">${clean(t.en.html)}</div><p class="vt">${esc(t.en.versionTitle)}</p>` : `<p class="inverse">No English on Sefaria for this passage.</p>`) +
        openLink(esc(sefariaUrl(ref)), "Open on Sefaria"));
    } catch (err) {
      fill(token, `${head}<p class="err">Sefaria did not answer (${esc(err.message)}).</p>` + openLink(esc(sefariaUrl(ref)), "Open on Sefaria"));
    }
    if (token !== seq) return;
    if (document.activeElement === document.body) { const bk = pBody.querySelector("button.back"); if (bk) bk.focus({ preventScroll: true }); }
    pBody.dataset.related = rowId;
  });

  return { open: openPanel, close: () => { closePop(); closePanel(); }, openWord, openRelated };
}
