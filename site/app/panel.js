// The side panel (a source in full, or a Hebrew word's root and senses, from Sefaria) and the
// popovers on the keyed letters. sheet.js builds the hooks; this file only answers them.
import { fetchText, lookupWord } from "./sefaria.js";
import { noteHtml } from "./sheet.js";

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
    b.setAttribute("aria-expanded", "true"); b.setAttribute("aria-controls", "notepop"); pop ={ node, anchor: b };
  });

  // ---- the side panel ----
  let opener = null, activeWord = null, seq = 0;   // seq: a slow answer for an earlier click is dropped
  function openPanel(kind, html, from) {
    if (opener && opener !== from) opener.setAttribute("aria-expanded", "false");
    if (activeWord) { activeWord.classList.remove("active"); activeWord = null; }
    opener = from || null; if (opener) { opener.setAttribute("aria-expanded", "true"); opener.setAttribute("aria-controls", "panel"); }
    panel.inert = false;
    pKind.textContent = kind; panel.setAttribute("aria-label", kind);
    pBody.innerHTML = html; pBody.scrollTop = 0;
    panel.setAttribute("data-open", ""); panel.setAttribute("aria-hidden", "false");
    return ++seq;
  }
  function closePanel() {
    if (!panel.hasAttribute("data-open")) return;
    seq++;
    panel.removeAttribute("data-open"); panel.setAttribute("aria-hidden", "true"); panel.inert = true;
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
  async function openWord(w) {
    const ref = w.closest(".row").dataset.ref, word = w.textContent;
    const head = `<h2 class="he hebrew" lang="he" dir="rtl">${esc(word)}</h2><p class="sub">${esc(dash(ref))}</p>`;
    const token = openPanel("Word", `${head}<p class="loading">Looking it up…</p>`, w);
    activeWord = w; w.classList.add("active");
    track("word_lookup", {});   // a count: the word itself is never sent
    try {
      const x = await lookupWord(word, ref, L);
      let body = head;
      if (!x.short.length && !x.full.length) body += `<p class="inverse">No dictionary entry for this form. Try the word without its prefix, or open the verse on Sefaria.</p>`;
      else {
        body += `<p class="root">Root <b lang="he" dir="rtl" class="hebrew">${x.roots.map(esc).join(" · ")}</b></p>`;
        body += x.short.map(e => `<div class="lex">${lexBlock(e)}</div>`).join("");
        if (x.short.length) { if (x.full.length) body += `<details class="lex"><summary>Full entry</summary>${x.full.map(e => `<div class="full">${lexBlock(e)}</div>`).join("")}</details>`; }
        else body += x.full.map(e => `<div class="lex">${lexBlock(e)}</div>`).join("");
      }
      fill(token, body + openLink(esc(sefariaUrl(ref)), "Open the verse on Sefaria"));
    } catch (err) {
      fill(token, `${head}<p class="err">Sefaria did not answer (${esc(err.message)}).</p>` + openLink(esc(sefariaUrl(ref)), "Open the verse on Sefaria"));
    }
  }
  text.addEventListener("click", e => { const w = e.target.closest(".he .w"); if (w) openWord(w); });
  text.addEventListener("keydown", e => { const w = e.target.closest(".he .w"); if (w && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); openWord(w); } });

  return { open: openPanel, close: () => { closePop(); closePanel(); } };
}
