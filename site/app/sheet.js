// The week page. Data comes from /data/weeks/<slug>/sheet.json (the Blob store behind the rewrite);
// the model comes from lib.js's sheetModel, so the page prepares verses exactly as the print does.
import { applyStored, initSettings } from "./settings.js";
import { initPanel, clean, retryMemo } from "./panel.js";
import { slugFromPath, dataUrl, verseAnchor, parseVerseAnchor, parseMarks, PDF_FILES, isSlug, SIDE_FILES, CACHE_PREFIX, DATA_CACHE } from "./contract.js";
import { load, key } from "./storage.js";
import { MARKS_KEY, readMarks, writeMarks, toggleMark, orderMarks, marksLink, marksText, sharedText, MARK, UNMARK, MY_MARKS, MARKS_EMPTY, MARKS_UNSAVED, COPY_LINK, COPY_TEXT, REMOVE, ADD_SHARED, DISMISS } from "./marks.js";

export { slugFromPath, dataUrl };
import { initRoving, focusables, hideKeepingFocus } from "./a11y.js";
import { createAnalytics } from "./analytics.js";
import { initPresent, isPresent } from "./present.js";
import { hasFigures, renderFigures } from "./figures.js";
import { installCard } from "./install.js";
import { registerOffline, showUpdate, loadFailure, settleOffline, held, warmOnControl } from "./offline-client.js";

const DRIVE = "https://drive.google.com/drive/folders/1TbSmoeBaCSLciL_-_HSCuKWkJMSZvGwd";
const errorsSeen = [];   // filled in check mode (?check=1) by the error listeners in run()
let figuresSeen = { status: "" };   // what run() drew of the figures, read by runCheck

export function rangeLabel(book, a, z) {
  const head = `${book} ${a.chapter}:${a.verse}`;
  if (a === z || (a.chapter === z.chapter && a.verse === z.verse)) return head;
  return z.chapter === a.chapter ? `${head}–${z.verse}` : `${head}–${z.chapter}:${z.verse}`;
}
export function countLabel(n, m) {
  return [n ? `${n} ${n === 1 ? "comment" : "comments"}` : "", m ? `${m} ${m === 1 ? "note" : "notes"}` : ""].filter(Boolean).join(" · ");
}
export const sefariaUrl = ref => "https://www.sefaria.org/" + String(ref).trim().replace(/ /g, "_").replace(/:/g, ".") + "?lang=bi";
// One keyed note: the rail's note and the popover on its letter (panel.js) share this markup.
export function noteHtml(k, L) {
  const esc = L.escapeHtml;
  const lemma = k.lemma ? `<span class="lemma">${esc(k.lemma)}</span><span class="brk">]</span>` : "";
  const heLemma = k.heHtml ? `<span class="he-lemma" lang="he" dir="rtl">${k.heHtml}</span> ` : "";
  return `<span class="k">${k.key}</span>${lemma}${heLemma}${k.textHtml}${k.tail ? ` <span class="tail">${k.tail}</span>` : ""}`;
}

// The translation's short name for a citation line.
export function translationLabel(title) {
  const t = String(title || "");
  if (/gender-sensitive/i.test(t)) return "JPS 2023";
  if (/Tanakh: The Holy Scriptures|JPS.*1985|1985.*JPS/i.test(t)) return "JPS 1985";
  return t;
}

// What "Copy verse" puts on the clipboard: the verse in the reader's Show setting ("he", "en" or
// "both"), then "— <ref> (<translation>)" (the translation only when English is copied), then the link.
export function citationText({ he, en, ref, translation, url, mode = "both" }) {
  const lines = [];
  if (mode !== "en" && he) lines.push(he);
  if (mode !== "he" && en) lines.push(en);
  lines.push(`— ${ref}${mode !== "he" && translation ? ` (${translation})` : ""}`);
  lines.push(url);
  return lines.join("\n");
}

// Another edition's verse as plain lines: split on <br> first, since plainText folds a newline into a space.
export function altLines(html, L) {
  return String(html == null ? "" : html).split(/<br\s*\/?>/i).map(p => L.plainText(p).text.trim()).filter(Boolean).join("\n");
}

// The teacher highlights on one verse. A highlight without "reading" belongs to the haftarah.
export function highlightsFor(list, readingId, chapter, verse) {
  return (Array.isArray(list) ? list : []).filter(h => h && (h.reading || "haftarah") === readingId && Number(h.chapter) === chapter && Number(h.verse) === verse);
}

// The Translation row's choices: the sheet's own English first, then every version the readings offer.
export function translationOptions(side) {
  const out = [{ key: "jps2023", label: "JPS 2023" }];
  for (const list of Object.values((side && side.translations) || {})) for (const v of list || []) if (!out.some(o => o.key === v.key)) out.push({ key: v.key, label: v.label });
  return out;
}

// A highlight's [first, last] word (0-based, inclusive) cut to a verse of `count` words; null when nothing of it is in the verse.
export function wordRange(words, count) {
  if (!Array.isArray(words) || words.length !== 2 || !count) return null;
  const [a, b] = words;
  if (!Number.isInteger(a) || !Number.isInteger(b) || a > b || b < 0 || a >= count) return null;
  return [Math.max(0, a), Math.min(count - 1, b)];
}

// A verse's shareable address: the canonical week path (lowercase, no trailing slash) and the anchor.
export const verseUrl = (origin, slug, anchor) => `${origin}/${slug}#${anchor}`;

// Copy, then say "Copied" or "Not copied" on the button and in the page's live region; the button's
// label comes back after `delay` and the region empties. One pending revert per button: a second copy
// restarts it instead of reverting early. The region is cleared only by the button that last spoke.
const reverts = new WeakMap();
let lastSpoke = null;
export async function copyWithStatus(b, text, { write, status, delay = 1500 }) {
  const label = b.dataset.label || (b.dataset.label = b.textContent);
  clearTimeout(reverts.get(b));
  let said;
  try { await write(text); said = "Copied"; } catch { said = "Not copied"; }
  b.textContent = said;
  if (status) { status.textContent = said; lastSpoke = b; }
  reverts.set(b, setTimeout(() => {
    b.textContent = label; reverts.delete(b);
    if (status && lastSpoke === b) { status.textContent = ""; lastSpoke = null; }
  }, delay));
  return said;
}

export async function run() {
  const L = window.HaftarahLib;
  const esc = L.escapeHtml, SIG = L.SIGLA, NAMES = L.REGISTER_NAMES;
  const el = (tag, cls, html) => { const n = document.createElement(tag); if (cls) n.className = cls; if (html != null) n.innerHTML = html; return n; };
  const $ = id => document.getElementById(id);
  const html = document.documentElement;
  const check = new URLSearchParams(location.search).get("check") === "1";
  if (check) {
    addEventListener("error", e => errorsSeen.push(e.message));
    addEventListener("unhandledrejection", e => errorsSeen.push(String(e.reason)));
    document.addEventListener("securitypolicyviolation", e => errorsSeen.push(`CSP blocked ${e.blockedURI || "inline"} (${e.violatedDirective})`));
  }
  const fail = (msg) => { for (const id of ["presentBtn", "marksBtn"]) { const b = $(id); if (b) b.closest(".row").remove(); }   // nothing to present or mark on an error page
  const s = $("status"); s.innerHTML = msg; s.hidden = false; if (check) { html.dataset.checkErrors = String(errorsSeen.length + 1) + ": " + s.textContent; html.dataset.checkDone = "1"; } };

  applyStored();
  const slug = slugFromPath(location.pathname);
  let startPresent = null, openMarks = null;   // set once the verses exist
  const settings = initSettings({ host: $("settings"), button: $("aaBtn"), pdfHref: slug ? dataUrl(slug, "sheet.pdf") : null, onPresent: () => startPresent && startPresent(true), onMarks: from => openMarks && openMarks(from) });
  if (!slug) return fail(`No sheet at this address. <a href="/">All sheets</a>`);
  const analytics = createAnalytics();
  const track = (name, props = {}) => analytics.track(name, { week: slug, ...props });
  addEventListener("appinstalled", () => analytics.track("install", {}));

  let data, voicesDict = {};
  try {
    const res = await fetch(dataUrl(slug, "sheet.json"));
    if (res.status === 404) return fail(`No sheet at this address. <a href="/">All sheets</a>`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    data = await res.json();
    voicesDict = await fetch("/voices.json").then(r => r.ok ? r.json() : {}).catch(() => ({}));
  } catch (err) {
    return fail(loadFailure({ online: navigator.onLine, drive: DRIVE }));   // offline says so, rather than blaming the server
  }
  // Every reading with verses, in the sheet's order (a Torah selection first, then the haftarah). The
  // week is known by its primary reading, the haftarah: the title, the hero, the end matter. Each
  // reading's model comes from readingModel (sheetModel on that reading; a Torah reading ends on sof
  // pasuk). A schema-2 week is one reading and renders exactly as before, with no reading headings.
  const reading = L.primaryReading(data);
  if (!reading) return fail(`This sheet could not be loaded. The printed sheets are on <a href="${DRIVE}">Google Drive</a>.`);
  const parts = L.readings(data).filter(r => (r.verses || []).length).map(r => ({ reading: r, model: L.readingModel(data, r.id, { voices: voicesDict }) }));
  const model = (parts.find(p => p.reading.id === reading.id) || { model: L.readingModel(data, reading.id, { voices: voicesDict }) }).model;
  const multi = parts.length > 1;
  const torahPart = parts.find(p => p.reading.kind === "torah") || null;
  const highlights = Array.isArray(data.highlights) ? data.highlights : [];
  document.title = model.title;
  if (torahPart) settings.addDownload(dataUrl(slug, PDF_FILES.torah), "Download the Torah sheet (PDF)");

  // ---- front page: the sheet introduces itself (with two readings, the legend and the voices cover both) ----
  const f = model.front, prov = f.provenance;
  const hasKeys = parts.some(p => p.model.front.legend.hasKeys);
  const hasKetiv = parts.some(p => p.model.front.legend.hasKetiv);
  const famKeys = new Set(parts.flatMap(p => p.model.front.families.map(x => x.key)));
  const families = L.TROPE_FAMILIES.filter(([k]) => famKeys.has(k)).map(([key, name]) => ({ key, name }));
  const voices = multi ? L.voicesFor(parts.flatMap(p => p.reading.commentary || []), voicesDict, x => !x || x.status !== "rejected") : f.voices;
  const refs = multi
    ? parts.map(p => `<span class="ref">${p.reading.kind === "torah" ? "Torah" : "Haftarah"} · ${esc(p.model.ref)}</span>`).join("<br>")
    : `<span class="ref">${esc(model.ref)}</span>`;
  const pdfs = torahPart
    ? `The printed sheets (PDF): <a class="pdf" href="${dataUrl(slug, PDF_FILES.torah)}">Torah</a> · <a class="pdf" href="${dataUrl(slug, PDF_FILES.haftarah)}">Haftarah</a>`
    : `<a class="pdf" href="${dataUrl(slug, "sheet.pdf")}">The printed sheet (PDF)</a>`;
  const prior = data.prior && isSlug(data.prior.slug) ? `<br><a class="prior" href="/${esc(data.prior.slug)}">Last time: the ${esc(data.prior.cycle || "")} sheet</a>` : "";
  const front = $("front");
  front.innerHTML = `
    <div class="hero">
      <img class="mural" src="/mural.png" alt="The Siona Benjamin floor mural at Central Reform Congregation">
      <div class="incipit-block">
        <h1 class="incipit" lang="he" dir="rtl">${f.incipit.heHtml}</h1>
        <p class="incipit-en">${esc(f.incipit.en)}</p>
        <p class="reading">${refs}<br>${esc(model.shabbatName)}<br>
          <span class="dates"><span class="he-date" lang="he" dir="rtl">${esc(model.shabbat.hebrew)}</span> · ${esc(model.shabbat.civilDisplay)}</span><br>
          ${pdfs}${prior}</p>
      </div>
    </div>
    <div class="opening">
      ${f.openingNote.calendar.map(p => `<p>${p}</p>`).join("")}
      ${f.openingNote.setting.length ? `<div class="setting">${f.openingNote.setting.map(p => `<p>${p}</p>`).join("")}</div>` : ""}
    </div>
    <div class="legend">
      <span${hasKeys ? "" : ' class="unused"'}><span class="k">a–z</span>translators’ notes (JPS) and word notes: tap a letter</span>
      ${hasKetiv ? `<span><span class="k">[ ] ( )</span>read / written: where tradition reads a word differently from its spelling</span>` : ""}
      <span class="trope-legend"><span class="label">Chanter’s copy · trope phrases by family</span>${families.map(x => `<span class="tr tr-${x.key}">${esc(x.name)}</span>`).join(" ")}</span>
    </div>`;
  if (voices.length) front.append(el("div", "voices", `<h2>Voices on this sheet</h2><p>${voices.map(v => `<span class="voice"><span class="name">${esc(v.name)}</span>${v.refs && v.refs.length ? ` (${esc(v.refs.join(", "))})` : ""}${v.line ? ` ${esc(v.line)}` : ""}</span>`).join('<span class="sep"> · </span>')}</p>`));
  // The register sigla and the editions left the front (2026-10-16): each siglum names its register on hover, and the footer credits the editions.
  front.append(el("div", "provenance", `${prov.signoffHtml}${prov.signed ? ` <span class="sign">— ${esc(prov.editor)}</span>` : ""}`));
  { const state = installCard({ host: $("install") }); if (check) html.dataset.checkInstall = state; }
  $("footAttr").textContent = `Hebrew: ${prov.he}. English: ${prov.en}. Sources from Sefaria. Calendar and readings: Hebcal (CC BY 4.0).`;
  // While a week carries word analysis, the footer credits its source (spec 8); the file itself names the credit.
  if (data.side && data.side.words) $("footAttr").textContent += ` ${data.side.words === "oshb" ? "Word analysis: Open Scriptures Hebrew Bible morphology (CC BY 4.0); Westminster Leningrad Codex (public domain)." : "Word analysis: STEPBible TAHOT and TBESH, data created by www.STEPBible.org based on work at Tyndale House Cambridge (CC BY 4.0), trimmed and aligned for this site."}`;
  // The figures (spec 5.8) are fetched now and inserted once the verses exist: the text never waits on the geo files.
  figuresSeen = { status: "" };
  const figuresPending = hasFigures(data) ? renderFigures({ data, L }).catch(err => { console.warn(err.message); return { failed: err.message }; }) : null;
  for (const id of ["reading", "end", "foot"]) $(id).hidden = false;
  // Shown only while a provider is switched on, and only after Daniel approves the wording (spec 5.3).
  if (analytics.provider !== "none") $("foot").insertAdjacentHTML("beforeend", `<span class="privacy">We count visits and which sources are opened; nothing identifies you. Opening a source or a word asks Sefaria for it.</span>`);

  // ---- verse rows and their apparatus ----
  const text = $("text"), rail = $("rail");
  const rows = [];
  const wide = matchMedia("(min-width: 1100px)");
  const gutButton = r => r.row.querySelector(".gut button");
  let current = null;   // the row sync() last marked current
  let marks = readMarks(slug);   // the reader's own marks on this week, from this device (marks.js)
  const mine = new Set(marks);
  // A keyed letter becomes a button the popover (panel.js) answers; the sup keeps its classes.
  function keyButtons(node) {
    node.querySelectorAll("sup.fn").forEach(s => {
      const k = esc(s.textContent.trim());
      s.innerHTML = `<button type="button" data-key="${k}" aria-expanded="false">${k}</button>`;
    });
  }
  // Every Hebrew word becomes a focusable target for the word panel; footnote letters, the ketiv
  // (Sefaria's mam-kq-k span) and a MAM footnote are not words of the reading, so they are left
  // alone: lib.js's verseWords counts exactly these, and publish numbers the words the same way.
  // A word can run across text nodes (MAM's <big>בְּ</big>רֵאשִׁ֖ית, אֹ֖רֶ<small>ן</small>): the eligible
  // text is read as one string, as verseWords reads it with the tags stripped, and each word's span
  // takes the original nodes, so a large or small letter stays inside its word.
  function wrapWords(node) {
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    const texts = []; let t, all = "";
    while ((t = walker.nextNode())) {
      if (t.parentElement.closest("sup, .ketiv, .mam-kq-k, .footnote")) continue;
      texts.push({ node: t, at: all.length, end: all.length + t.data.length }); all += t.data;
    }
    const startOf = pos => texts.find(x => x.at <= pos && pos < x.end);
    const endOf = pos => texts.find(x => x.at < pos && pos <= x.end);
    const words = L.hebrewWords(all);
    // Last word first: wrapping a word only cuts its nodes after its start, so earlier offsets hold.
    for (let k = words.length - 1; k >= 0; k--) {
      const w = words[k], a = startOf(w.start), z = endOf(w.end);
      const s = el("span", "w"); s.tabIndex = -1; s.setAttribute("role", "button");
      const range = document.createRange();
      range.setStart(a.node, w.start - a.at); range.setEnd(z.node, w.end - z.at);
      if (a.node === z.node) range.surroundContents(s);
      else { s.append(range.extractContents()); range.insertNode(s); }
    }
  }
  function entryHtml(e) {
    const reg = e.register;
    const lemma = e.lemma
      ? `<span class="lem${e.lemmaLang === "he" ? ' he-lemma" lang="he" dir="rtl' : ""}">${esc(e.lemma)}</span><span class="brk">]</span>` : "";
    const cls = `src${e.drafted ? " drafted" : ""}`;
    const src = e.sourceRef
      ? `<button type="button" class="${cls}" data-ref="${esc(e.sourceRef)}" data-reg="${reg}" data-src="${esc(e.source)}" aria-controls="panel" aria-expanded="false">${esc(e.source)}</button>`
      : `<span class="${cls}">${esc(e.source)}</span>`;
    return `<span class="sig" title="${NAMES[reg]}">${SIG[reg]}</span><span class="v">${e.verseLabel}</span>${lemma} ${src}<span class="body">${e.bodyHtml}</span>${e.tail.length ? ` <span class="tail">${e.tail.join("; ")}.</span>` : ""}`;
  }
  for (const part of parts) {
    const reading = part.reading;   // this block's reading; the week's primary one is the `reading` outside the loop
    if (multi) {
      const head = el("h2", "reading-head", `${reading.kind === "torah" ? "Torah" : "Haftarah"}<span class="ref">${esc(part.model.ref)}</span>${reading.selection ? `<span class="sel">${esc(reading.selection)}</span>` : ""}`);
      head.id = `reading-${reading.id}`;
      text.append(head);
    }
    for (const v of part.model.verses) {
    const row = el("div", "row" + (v.prevBreak ? ` break-${v.prevBreak}` : ""));
    row.id = verseAnchor(reading.id, v.chapter, v.verse); row.dataset.reading = reading.id; row.dataset.ref = v.ref; row.dataset.verse = `${v.chapter}:${v.verse}`;
    const en = el("div", "en" + (v.poetry ? " poetry" : ""), v.poetry ? v.enLines.map(t => `<span class="ln">${t}</span>`).join("") : v.enLines[0]);
    keyButtons(en);
    const cv = `${v.chapter}:${v.verse}`;
    const gut = el("div", "gut", `${v.showChapter ? `<span class="ch">${cv}</span>` : ""}<button type="button" title="Commentary on ${cv}">${v.verse}</button>`);
    const he = el("div", "he", v.heHtml); he.lang = "he"; he.dir = "rtl";
    keyButtons(he);
    wrapWords(he);
    initRoving(he, ".w");   // one tab stop per verse; arrows move between its words
    row.append(en, gut, he);
    // Teacher highlights (week data, web only): a bar on the verse, a tint on its words, the note in the apparatus.
    const hls = highlightsFor(highlights, reading.id, v.chapter, v.verse);
    const hlNotes = hls.filter(h => h.note);
    if (hls.length) {
      row.classList.add("hl");
      gut.querySelector("button").insertAdjacentHTML("beforeend", '<span class="sr"> Highlighted.</span>');   // in the button's name
      const ws = [...he.querySelectorAll(".w")];
      for (const h of hls) { const span = wordRange(h.words, ws.length); if (span) ws.slice(span[0], span[1] + 1).forEach(w => w.classList.add("hl-w")); }
    }
    // The reader's own mark: a bar on the other side, an underlined number, and " Marked." in the number's name.
    const marked = mine.has(row.id);
    if (marked) { row.classList.add("mine"); gut.querySelector("button").insertAdjacentHTML("beforeend", '<span class="sr mark-sr"> Marked.</span>'); }
    const count = countLabel(v.entries.length, v.keys.length + hlNotes.length);
    // A verse with nothing gets a div: a <details> without a summary shows the browser's own "Details".
    const app = el(count ? "details" : "div", "vapp"); app.dataset.verse = cv;
    app.innerHTML = (count ? `<summary><span class="count">${count}</span><svg class="chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg></summary>` : "") +
      `<p class="vh"><span>${cv}</span><span class="acts"><button type="button" class="act" data-act="link">Copy link</button><button type="button" class="act" data-act="copy">Copy verse</button><button type="button" class="act" data-act="mark">${marked ? UNMARK : MARK}</button>${data.side && data.side.links ? `<button type="button" class="act" data-act="related">Everything on this verse</button>` : ""}<a href="${esc(sefariaUrl(v.ref))}" target="_blank" rel="noopener">on Sefaria</a></span></p>` +
      hlNotes.map(h => `<p class="hl-note">${L.divineName(h.note).html}</p>`).join("") +
      v.keys.map(k => `<p class="note ${k.kind}">${noteHtml(k, L)}</p>`).join("") +
      v.entries.map(e => `<p class="entry reg-${e.register}">${entryHtml(e)}</p>`).join("");
    if (!count) app.classList.add("empty");
    rail.append(app); text.append(row);
    const r = { v, row, app, keys: v.keys, reading: reading.id, model: part.model };
    r.enHtml = en.innerHTML;   // the sheet's own English, for the Translation row to come back to
    // Narrow, the verse number opens the fold below it; keep its state announced however the fold moves.
    if (count) app.addEventListener("toggle", () => { if (!wide.matches) gutButton(r).setAttribute("aria-expanded", String(app.open)); });
    rows.push(r);
    }
  }

  // ---- end matter ----
  const end = $("end");
  if (model.glossary.length) end.innerHTML = `<h2>Names and places</h2><div class="glossary">${model.glossary.map(g => `<p><span class="term">${esc(g.term)}</span>${g.heHtml ? `<span class="term-he" lang="he" dir="rtl">${g.heHtml}</span>` : ""} ${g.textHtml}</p>`).join("")}</div>`;
  if (model.nextWeek) end.append(el("p", "next", model.nextWeek.line));
  if (!end.childElementCount) end.hidden = true;

  // ---- desktop rail vs inline apparatus ----
  function place() {
    for (const r of rows) {
      const fold = r.app.tagName === "DETAILS", b = gutButton(r);
      if (wide.matches) { rail.append(r.app); if (fold) r.app.open = true; b.removeAttribute("aria-expanded"); }
      else { r.row.append(r.app); b.setAttribute("aria-expanded", "false"); if (fold) r.app.open = false; else r.app.classList.remove("show"); }
    }
    if (!wide.matches) rows.forEach(r => r.app.classList.remove("current"));
  }
  place();
  // Crossing the breakpoint: forget the current verse so sync() marks it and moves the rail again.
  wide.addEventListener("change", () => { place(); current = null; sync(); });

  // ---- running head and rail that keep pace ----
  const mastLeft = $("mastLeft"), mastRange = $("mastRange");
  const mastH = () => $("mast").offsetHeight;
  let railPause = 0;   // a reader scrolling the rail by hand keeps it where they put it for a moment
  rail.addEventListener("wheel", () => { railPause = Date.now() + 1500; }, { passive: true });
  rail.addEventListener("touchmove", () => { railPause = Date.now() + 1500; }, { passive: true });
  // Scroll the rail so a verse's apparatus sits at its top. Measured from the boxes, not offsetTop:
  // the sticky rail is the offsetParent of its children in the wide layout but not in the narrow one.
  function railTo(app, behavior) {
    const pad = parseFloat(getComputedStyle(rail).paddingTop) || 0;
    const top = rail.scrollTop + app.getBoundingClientRect().top - rail.getBoundingClientRect().top - pad;
    rail.scrollTo({ top, behavior: behavior || (matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth") });
  }
  // sync({ behavior: "auto" }) moves the rail at once (the check measures it right after);
  // as a scroll/resize listener it receives an Event, which has no behavior, so it animates.
  function sync(opts) {
    // A row counts once more than 1rem of it shows below the masthead: a verse jumped to lands
    // .75rem below it (.row's scroll-margin-top), so the row above it must not count as current.
    const top = mastH() + parseFloat(getComputedStyle(html).fontSize), bottom = innerHeight;
    let first = null, lastSeen = null;
    for (const r of rows) {
      const b = r.row.getBoundingClientRect();
      if (b.bottom > top && b.top < bottom) { if (!first) first = r; if (r.reading === first.reading) lastSeen = r; }
    }
    if (!first) {
      const inFront = text.getBoundingClientRect().top > top;
      mastLeft.textContent = inFront ? `${multi ? "Torah and haftarah" : "Haftarah"} · ${model.seriesLabel}` : model.shabbatName;
      mastRange.textContent = inFront ? model.seriesName : model.ref;
      return;
    }
    mastLeft.textContent = model.shabbatName;
    mastRange.textContent = rangeLabel(first.model.book, first.v, lastSeen.v);
    if (first !== current) {
      current = first;
      track("verse_view", { verse: first.row.id });
      rows.forEach(r => { r.row.classList.toggle("current", r === first); r.app.classList.toggle("current", wide.matches && r === first); });
      if (wide.matches && Date.now() > railPause) {
        railTo(first.app, opts && opts.behavior);
      }
    }
  }
  let ticking = false;
  addEventListener("scroll", () => { if (!ticking) { ticking = true; requestAnimationFrame(() => { sync(); ticking = false; }); } }, { passive: true });
  addEventListener("resize", sync);
  sync();

  // A verse link (#haftarah-54-3, or the first release's #v54-3): scroll to the verse and mark it.
  // An old link is rewritten to the new form; a link to a verse not on this page changes nothing.
  function goToHash(hash = location.hash) {
    const a = parseVerseAnchor(hash);
    // A first-release link (#v54-3) names no reading: it means the week's primary reading, the haftarah.
    const r = a && rows.find(x => x.v.chapter === a.chapter && x.v.verse === a.verse && x.reading === (a.reading == null ? reading.id : a.reading));
    rows.forEach(x => x.row.classList.toggle("target", x === r));   // an unknown fragment clears the old mark
    if (!r) return null;
    r.row.scrollIntoView({ block: "start" });
    if (a.reading == null) history.replaceState(null, "", `${location.pathname}${location.search}#${r.row.id}`);
    return r;
  }
  goToHash();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (location.hash) goToHash(); });   // the font swap moves the layout; land on the verse again
  addEventListener("hashchange", () => goToHash());

  // The figures, once fetched: the map beside the setting, the timeline under the opening note, the credit in
  // the footer; a failed fetch shows no figure. They land above the verses, so a reader already scrolled keeps
  // the same verse in view and a verse link lands on its verse again.
  const figuresReady = !figuresPending ? Promise.resolve() : figuresPending.then(figs => {
    if (figs.failed) { figuresSeen = { status: `failed: ${figs.failed}` }; return; }
    const opening = front.querySelector(".opening"), before = front.getBoundingClientRect().height;
    if (figs.map || figs.timeline) opening.classList.add("with-figures");
    if (figs.map) { opening.classList.add("with-map"); opening.append(figs.map); }   // after .setting, or after the calendar paragraphs
    if (figs.timeline) opening.after(figs.timeline);
    if (figs.credit) $("footAttr").textContent += " " + figs.credit;
    figuresSeen = { status: [figs.map && "map", figs.timeline && "timeline"].filter(Boolean).join(","), dots: figs.dots || 0 };
    if (!(location.hash && goToHash()) && scrollY > 0) scrollBy(0, front.getBoundingClientRect().height - before);
    sync();
  });

  // verse number: jump to its commentary (the rail when wide, the fold below the verse otherwise)
  for (const r of rows) gutButton(r).addEventListener("click", () => {
    if (r.swallowClick) { r.swallowClick = false; return; }   // the click that ends a long-press only marked the verse
    if (wide.matches) { railPause = Date.now() + 1500; railTo(r.app); r.app.classList.add("current"); }
    else if (r.app.tagName === "DETAILS") { r.app.open = !r.app.open; }   // the toggle listener updates aria-expanded
    else gutButton(r).setAttribute("aria-expanded", String(r.app.classList.toggle("show")));   // no commentary: just the header (links, copy)
  });

  // Press and hold a verse number to mark the verse (a tap still opens its commentary). The header's
  // Mark this verse is the keyboard path. A finger that moves is scrolling, not holding.
  for (const r of rows) {
    const b = gutButton(r);
    let timer = 0, unswallow = 0, x0 = 0, y0 = 0, touch = false;
    const stop = () => { clearTimeout(timer); timer = 0; };
    // A hold that ends without a click (iOS) must not eat a later tap or Enter on this number.
    const release = () => { clearTimeout(unswallow); r.swallowClick = false; };
    b.addEventListener("pointerdown", e => {
      release(); stop();
      if (e.button !== 0) return;
      touch = e.pointerType === "touch"; x0 = e.clientX; y0 = e.clientY;
      timer = setTimeout(() => {
        timer = 0; r.swallowClick = true; api.marks.toggle(r.row.id);
      }, 500);
    });
    b.addEventListener("blur", release);
    b.addEventListener("keydown", release);
    // Once the finger lifts, the click (if one comes) follows at once: 400 ms later the flag is gone either way.
    // Timed from the lift, not from the mark, so a hold longer than the mark still swallows its click.
    const lifted = () => { stop(); if (r.swallowClick) { clearTimeout(unswallow); unswallow = setTimeout(release, 400); } };
    for (const t of ["pointerup", "pointerleave", "pointercancel"]) b.addEventListener(t, lifted);
    b.addEventListener("pointermove", e => { if (timer && Math.hypot(e.clientX - x0, e.clientY - y0) > 10) stop(); });
    b.addEventListener("contextmenu", e => { if (touch) e.preventDefault(); });   // a mouse keeps its menu
  }

  // "Copy link", "Copy verse" and "Mark this verse" in each verse's header (in the rail when wide, in the fold otherwise).
  async function onAct(e) {
    const b = e.target.closest("button.act"); if (!b) return;
    const r = rows.find(x => x.app === b.closest(".vapp")); if (!r) return;
    if (b.dataset.act === "related") { panel.openRelated(r, b); return; }
    if (b.dataset.act === "mark") { api.marks.toggle(r.row.id); return; }
    const url = verseUrl(location.origin, slug, r.row.id);
    // Another edition shown in this verse: copy that English, under its name (a verse the edition lacks keeps the sheet's own).
    const alt = html.dataset.translation && html.dataset.translation !== "jps2023" && r.row.querySelector(".en.alt");
    const text = b.dataset.act === "link" ? url : citationText({
      he: L.plainText(r.v.heHtml).text.trim(),
      en: alt ? altLines(r.row.querySelector(".en").innerHTML, L) :r.v.enLines.map(t => L.plainText(t).text.trim()).join("\n"),
      ref: L.enDash(r.v.ref), translation: alt ? api.translation.label : translationLabel(r.model.front.provenance.en), url,
      mode: html.dataset.lang || "both",
    });
    await copyWithStatus(b, text, { write: t => navigator.clipboard.writeText(t), status: copyStatus });
  }
  // One polite live region for the page, so a screen reader hears "Copied" or "Not copied".
  const copyStatus = el("p", "sr"); copyStatus.id = "copyStatus";
  copyStatus.setAttribute("role", "status"); copyStatus.setAttribute("aria-live", "polite");
  document.body.append(copyStatus);
  rail.addEventListener("click", onAct); text.addEventListener("click", onAct);

  const api = { rows, model, sync, goToHash, slug, figuresReady, side: data.side || null, closeAll: () => { panel.close(); settings.close(); } };
  api.sources = new Set(parts.flatMap(p => (p.reading.commentary || []).filter(e => e && e.status !== "rejected").map(e => e.source).filter(Boolean)));
  window.HaftarahPage = api;
  const panel = initPanel({ page: api, L, sefariaUrl, track });
  api.openWord = w => panel.openWord(w);
  api.openRelated = (r, from) => panel.openRelated(r, from);

  // ---- a reader's own marks (spec 5.2): on this device only; shared as a #m= link or as text ----
  const rowIds = () => rows.map(r => r.row.id);
  const rowById = id => rows.find(r => r.row.id === id);
  function setMarked(r, on) {
    r.row.classList.toggle("mine", on);
    const gb = gutButton(r), sr = gb.querySelector(".mark-sr");
    if (on && !sr) { const s = el("span", "sr mark-sr"); s.textContent = " Marked."; gb.append(s); }
    if (!on && sr) sr.remove();
    const mb = r.app.querySelector('.act[data-act="mark"]');
    mb.textContent = on ? UNMARK : MARK;   // the label carries the state (no aria-pressed: it would read "Unmark, pressed")
  }
  const marksPanelOpen = () => $("panel").hasAttribute("data-open") && $("panelKind").textContent === MY_MARKS;
  function renderMarks() {
    const set = new Set(marks);
    for (const r of rows) if (r.row.classList.contains("mine") !== set.has(r.row.id)) setMarked(r, set.has(r.row.id));
    settings.setMarksCount(api.marks.list().length);
    if (marksPanelOpen()) $("panelBody").innerHTML = marksHtml();
  }
  let askedPersist = false;
  function saveMarks(next) {
    marks = next;
    const ok = writeMarks(slug, marks);
    // Ask once, on the first mark written in the session, that the browser keep this site's storage.
    if (!askedPersist && ok && marks.length) { askedPersist = true; try { navigator.storage?.persist?.().catch(() => {}); } catch {} }
    renderMarks();   // a refused write keeps the mark on the page for this visit, and says so
    if (!ok) copyStatus.textContent = MARKS_UNSAVED;
    return ok;
  }
  const firstWords = (s, n = 8) => { const w = s.split(/\s+/).filter(Boolean); return w.length > n ? `${w.slice(0, n).join(" ")}…` : w.join(" "); };
  const verseEn = r => r.v.enLines.map(t => L.plainText(t).text.trim()).join(" ");
  function marksHtml() {
    const list = api.marks.list();
    if (!list.length) return `<p class="marks-empty">${esc(MARKS_EMPTY)}</p>`;
    return `<ol class="marks">${list.map(id => {
      const r = rowById(id), ref = esc(L.enDash(r.v.ref));
      return `<li><a class="go" href="#${esc(id)}">${ref}</a> <span class="en">${esc(firstWords(verseEn(r)))}</span> <button type="button" class="act" data-mark-remove="${esc(id)}">${esc(REMOVE)}<span class="sr"> ${ref}</span></button></li>`;
    }).join("")}</ol>` +
      `<p class="marks-acts"><button type="button" class="act" data-marks-copy="link">${esc(COPY_LINK)}</button><button type="button" class="act" data-marks-copy="text">${esc(COPY_TEXT)}</button></p>`;
  }
  openMarks = from => {
    panel.open(MY_MARKS, marksHtml(), from);
    const first = $("panelBody").querySelector("a, button") || $("panelClose");   // the opener was in the Aa card, now closed
    first.focus({ preventScroll: true });
  };
  $("panelBody").addEventListener("click", async e => {
    if (!marksPanelOpen()) return;
    const go = e.target.closest(".marks a.go"), rm = e.target.closest("[data-mark-remove]"), cp = e.target.closest("[data-marks-copy]");
    if (go) {
      e.preventDefault();
      const r = goToHash(go.getAttribute("href"));
      // As an occurrence in the word panel: wide, the panel stays beside the verse; narrower, it covers it and closes.
      if (r && !wide.matches) { panel.close(); gutButton(r).focus({ preventScroll: true }); }
    } else if (rm) {
      const at = [...$("panelBody").querySelectorAll("[data-mark-remove]")].indexOf(rm);
      api.marks.remove(rm.dataset.markRemove);   // re-renders the open list
      const left = $("panelBody").querySelectorAll("[data-mark-remove]");
      (left[Math.min(at, left.length - 1)] || $("panelBody").querySelector("button") || $("panelClose")).focus({ preventScroll: true });
    } else if (cp) {
      await copyWithStatus(cp, cp.dataset.marksCopy === "link" ? api.marks.link() : api.marks.text(), { write: t => navigator.clipboard.writeText(t), status: copyStatus });
    }
  });

  // Marks shared in the address (#m=…): those on this page are outlined, and a strip offers to keep them.
  const sharedHost = $("shared");
  let shared = orderMarks(parseMarks(location.hash, reading.id) || [], rowIds());
  // The strip closing with focus on its button: focus goes to `focusTo()`, else the Aa button.
  function clearShared({ focusTo = null } = {}) {
    shared = [];
    rows.forEach(r => r.row.classList.remove("shared"));
    hideKeepingFocus(sharedHost, { target: focusTo }); sharedHost.textContent = "";
    // Only a #m= fragment is removed: a verse link the reader has followed since stays.
    if (location.hash.startsWith("#m=")) history.replaceState(null, "", location.pathname + location.search);
  }
  function acceptShared() {
    const ids = rowIds(), union = [...new Set([...marks, ...shared])];
    const first = rowById(shared.find(m => !marks.includes(m)) || shared[0]);   // the first verse this adds
    saveMarks([...orderMarks(union, ids), ...union.filter(m => !ids.includes(m))]);
    clearShared({ focusTo: () => first && gutButton(first) });
  }
  if (shared.length) {
    rows.forEach(r => r.row.classList.toggle("shared", shared.includes(r.row.id)));
    const span = el("span"); span.textContent = sharedText(shared.length);
    const acts = el("span", "strip-acts");
    const add = el("button", "act"); add.type = "button"; add.textContent = ADD_SHARED; add.addEventListener("click", acceptShared);
    const no = el("button", "act"); no.type = "button"; no.textContent = DISMISS; no.addEventListener("click", () => clearShared());
    acts.append(add, no);
    sharedHost.append(span, acts);
    sharedHost.hidden = false;
  }

  api.marks = {
    list: () => orderMarks(marks, rowIds()),
    add: anchor => saveMarks(marks.includes(anchor) ? marks : [...marks, anchor]),
    remove: anchor => saveMarks(marks.filter(x => x !== anchor)),
    toggle: anchor => saveMarks(toggleMark(marks, anchor)),
    link: () => marksLink(location.origin, slug, api.marks.list()),
    text: () => marksText(api.marks.list().map(id => { const r = rowById(id); return { ref: L.enDash(r.v.ref), en: verseEn(r) }; }),
      { translation: translationLabel(model.front.provenance.en), link: api.marks.link() }),
    reload: () => { marks = readMarks(slug); renderMarks(); },
    acceptShared, dismissShared: () => clearShared(),
  };
  settings.setMarksCount(api.marks.list().length);
  // Marks changed in another tab of this site: follow them.
  addEventListener("storage", e => { if (e.key === key(MARKS_KEY(slug))) api.marks.reload(); });
  // The offline app: register the worker; a new build waiting says so under the masthead (never reloads).
  // On a first visit the week was fetched before the worker controlled the page: once it takes
  // control, the week is asked for again through it, so it opens offline next time (never in the presenter).
  api.warmed = warmOnControl(slug, { skip: () => !!html.dataset.present });
  const offlineReady = registerOffline({ onUpdate: () => showUpdate($("update")) });
  api.offlineReady = offlineReady;

  // ---- the translation picker (spec 5.6): the English column shows another edition; the notes stay JPS's ----
  const trOptions = translationOptions(api.side);
  const loadTranslations = retryMemo(() => fetch(dataUrl(slug, SIDE_FILES.translations)).then(r => (r.ok ? r.json() : null)));
  api.translation = { key: "jps2023", label: "JPS 2023", credits: [] };
  let trSeq = 0, trButtons = null;   // trSeq: a slow load for an earlier choice is dropped
  api.setTranslation = async key => {
    const opt = trOptions.find(o => o.key === key) || trOptions[0];
    const my = ++trSeq;
    const file = opt.key === "jps2023" ? null : await loadTranslations();
    if (my !== trSeq) return;
    const credits = [], gaps = new Set();
    for (const r of rows) {
      const en = r.row.querySelector(".en");
      const version = file && file.readings && file.readings[r.reading] && (file.readings[r.reading].versions || []).find(v => v.key === opt.key);
      if (file && !version) gaps.add(r.reading);
      const verseHtml = version && version.verses && version.verses[r.row.dataset.verse];
      if (verseHtml) { en.innerHTML = clean(verseHtml); en.classList.add("alt"); if (version.credit && !credits.includes(version.credit)) credits.push(version.credit); }
      else { en.innerHTML = r.enHtml; en.classList.remove("alt"); }   // enHtml was captured after keyButtons ran: the letters are in it
    }
    const shown = opt.key !== "jps2023" && credits.length > 0;
    html.dataset.translation = shown ? opt.key : "jps2023";
    let note = text.querySelector(".tr-note");
    if (shown && !note) { note = el("p", "tr-note", "Notes and glosses refer to the JPS translation."); text.prepend(note); }
    if (!shown && note) note.remove();
    // Two readings, the edition on Sefaria for one only: the other says it keeps JPS 2023.
    text.querySelectorAll(".tr-gap").forEach(n => n.remove());
    if (shown && multi) for (const part of parts) {
      if (!gaps.has(part.reading.id)) continue;
      const head = $(`reading-${part.reading.id}`); if (!head) continue;
      head.after(el("p", "tr-gap", esc(`${opt.label} is not on Sefaria for ${part.model.book}; this reading shows JPS 2023.`)));
    }
    let credit = $("footTr");
    if (shown) {
      if (!credit) { credit = el("span", "tr-credits"); credit.id = "footTr"; $("foot").append(credit); }
      credit.replaceChildren(...credits.map(c => el("span", "tr-credit", esc(c))));   // one line per edition credited
    } else if (credit) credit.remove();
    api.translation = { key: html.dataset.translation, label: shown ? opt.label : "JPS 2023", credits };
    if (trButtons) trButtons.setPressed(api.translation.key);   // a failed load or a switch from code leaves the row right
  };
  const stored = load("translation");
  trButtons = settings.setTranslations(trOptions, trOptions.some(o => o.key === stored) ? stored : "jps2023", k => { api.setTranslation(k); });
  if (stored && trOptions.some(o => o.key === stored)) api.setTranslation(stored);

  // ---- presenter view: ?present on load, or the Aa card's button (which starts at the verse on screen) ----
  let presenter = null;
  startPresent = (fromCard = false) => {
    if (presenter) return presenter;
    if (!isPresent(location.search)) {
      const at = current ? `#${current.row.id}` : location.hash;
      history.replaceState(null, "", `${location.pathname}${location.search ? `${location.search}&present` : "?present"}${at}`);
    }
    settings.close(); panel.close();
    // On exit focus goes back where the presenter was opened: the Aa button, or (from ?present) the verse's number.
    presenter = initPresent({ model, rows, L, track, translate: r => (html.dataset.translation && html.dataset.translation !== "jps2023" && r.row.querySelector(".en.alt") ? r.row.querySelector(".en").innerHTML.split(/<br\s*\/?>/) : null), onExit: r => {
      presenter = null; current = null; sync();
      (fromCard ? $("aaBtn") : gutButton(r)).focus({ preventScroll: true });
    } });
    return presenter;
  };
  if (isPresent(location.search)) startPresent();
  if (check) { if (presenter) runPresentCheck().catch(e => { const h = document.documentElement; h.dataset.checkErrors = "1: " + String(e && e.message || e); h.dataset.checkDone = "1"; }); else runCheck(api, L).catch(e => { html.dataset.checkErrors = "1: " + String(e && e.message || e); html.dataset.checkDone = "1"; }); }
}

// ?present&check=1: what the presenter shows once the web fonts are in, then PageDown, B twice, Escape,
// each as a key a remote would send.
async function runPresentCheck() {
  const h = document.documentElement, $ = id => document.getElementById(id);
  // The update note, shown as a waiting build would show it, must stay off the shared screen.
  showUpdate($("update"));
  h.dataset.checkUpdateDisplay = `${$("update").hidden ? "hidden" : "shown"} ${getComputedStyle($("update")).display}`;   // shown, yet not displayed
  if (document.fonts && document.fonts.ready) await document.fonts.ready;   // the presenter's own re-fit ran first
  h.dataset.checkPresentFonts = document.fonts ? document.fonts.status : "n/a";
  const key = k => document.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));
  h.dataset.checkPresent = h.dataset.present || "";
  h.dataset.checkPresentLabel = $("pLabel").textContent;
  h.dataset.checkPresentCount = $("pCount").textContent;
  const body = $("pBody");
  h.dataset.checkPresentFits = String(body.scrollHeight <= body.clientHeight + 1);
  key("PageDown");
  h.dataset.checkPresentNext = $("pLabel").textContent;
  h.dataset.checkPresentHash = location.hash;
  key("b");
  h.dataset.checkPresentBlank = String(!$("pBlank").hidden);
  key("b");
  key("Escape");
  h.dataset.checkPresentExit = String(!$("present") && !h.dataset.present);
  h.dataset.checkPresentFocus = (document.activeElement.closest(".row .gut") && document.activeElement.closest(".row").id) || "";
  h.dataset.checkErrors = String(errorsSeen.length) + (errorsSeen.length ? ": " + errorsSeen[0] : "");
  h.dataset.checkDone = "1";
}

async function runCheck(api, L) {
  const h = document.documentElement, rows = api.rows;
  await api.figuresReady;   // the figures land above the verses: measure the settled page
  // The offline app: the worker registers from this page, precaches the shell and, once it controls the
  // page, caches the week file it serves. The page waits for it only here, never for a reader.
  // Every wait here holds headless Chrome's virtual clock and is capped in rounds, never by a timer
  // (offline-client.js says why).
  let rounds = 0;
  const fetchImpl = (...a) => { rounds++; return fetch(...a); };
  const { state, reg } = await settleOffline(api.offlineReady, { fetchImpl });   // registered, ready, then clients.claim() after activate
  h.dataset.checkSw = state;
  if (reg) {
    const keysOf = async name => { const c = await held(caches.open(name), { fetchImpl, fallback: null }); return c ? held(c.keys(), { fetchImpl, fallback: [] }) : []; };
    const names = (await held(caches.keys(), { fetchImpl, fallback: [] })).filter(n => n.startsWith(CACHE_PREFIX + "shell-"));
    h.dataset.checkSwShell = names.length === 1 ? String((await keysOf(names[0])).length) : `caches:${names.length}`;
    // A reader's path first: on this first visit the page itself asks for its week again once the worker takes control.
    const week = location.origin + dataUrl(api.slug, "sheet.json");
    h.dataset.checkSwWarm = String(await held(api.warmed, { fetchImpl, fallback: "timeout" }));
    h.dataset.checkSwWarmCached = String((await keysOf(DATA_CACHE)).some(r => r.url === week));
    await fetch(dataUrl(api.slug, "sheet.json")).catch(() => {});   // through the worker now
    h.dataset.checkSwWeek = String((await keysOf(DATA_CACHE)).some(r => r.url === week));
  }
  h.dataset.checkSwRounds = String(rounds);   // how long the worker took, in requests (web-check prints it)
  h.dataset.checkUpdate = document.getElementById("update").hidden ? "hidden" : "shown";
  // Then the note as a waiting build shows it: Dismiss is a 44px target and puts it away.
  const note = document.getElementById("update");
  showUpdate(note);
  const dismiss = note.querySelector("button");
  h.dataset.checkUpdateMin = String(Math.floor(dismiss.getBoundingClientRect().height));
  dismiss.focus();   // as a keyboard or a tap leaves it: focus goes to the Aa button when the note goes
  dismiss.click();
  h.dataset.checkUpdateDismiss = String(note.hidden);
  h.dataset.checkUpdateFocus = document.activeElement ? document.activeElement.id || document.activeElement.tagName : "";
  const wide = matchMedia("(min-width: 1100px)").matches;
  h.dataset.checkVerses = String(rows.length);
  h.dataset.checkKeys = api.model.sequence.join(",");
  h.dataset.checkWords = String(document.querySelectorAll("#text .he .w").length);
  // A MAM large or small letter stays inside its word: the words that hold one, as their spans read.
  h.dataset.checkBigSmall = JSON.stringify([...document.querySelectorAll("#text .he .w")].filter(w => w.querySelector("big, small")).map(w => w.textContent));
  h.dataset.checkRail = String(document.querySelectorAll("#rail .vapp").length);
  h.dataset.checkDetails = String(document.querySelectorAll("#text details.vapp:not(.empty)").length);
  h.dataset.checkEmptySummaries = String(document.querySelectorAll(".vapp.empty summary").length);
  h.dataset.checkWide = String(wide);
  h.dataset.checkWidth = String(innerWidth);
  // Accessibility: one tab stop per verse, the closed panel inert, every opener names what it opens,
  // the settings card keeps Tab inside.
  h.dataset.checkWordStops = String(document.querySelectorAll("#text .he .w[tabindex='0']").length);
  h.dataset.checkPanelInert = String(document.getElementById("panel").inert);
  h.dataset.checkSrcUncontrolled = String(document.querySelectorAll("button.src:not([aria-controls='panel'])").length);
  const keyBtn = document.querySelector("#text sup.fn button");
  if (keyBtn) {
    keyBtn.click();
    const named = keyBtn.getAttribute("aria-controls") === "notepop" && !!document.getElementById("notepop");
    keyBtn.click();
    h.dataset.checkPop = named && !document.getElementById("notepop") && !keyBtn.hasAttribute("aria-controls") ? "ok" : "fail";
  } else h.dataset.checkPop = "none";
  document.getElementById("aaBtn").click();
  const controls = focusables(document.getElementById("settings"));
  controls.at(-1).focus();
  controls.at(-1).dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true }));
  h.dataset.checkTrap = document.activeElement === controls[0] ? "ok" : "fail";
  // The smallest control in the open card: a button or the link by its box, the switch by its ::before hit area.
  const sizes = [...document.querySelectorAll("#settings button:not(.switch), #settings a.dl")].map(x => Math.min(x.getBoundingClientRect().height, x.getBoundingClientRect().width < 44 ? x.getBoundingClientRect().width : 1e9));
  const sw = document.getElementById("tropeSw");
  if (sw) sizes.push(parseFloat(getComputedStyle(sw, "::before").height));
  h.dataset.checkSettingsMin = sizes.length ? String(Math.floor(Math.min(...sizes))) : "none";
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  // Show: Hebrew alone hides the English, English alone the Hebrew.
  const r0 = rows[0].row;
  h.dataset.lang = "he"; h.dataset.checkLangHe = getComputedStyle(r0.querySelector(".en")).display;
  h.dataset.lang = "en"; h.dataset.checkLangEn = getComputedStyle(r0.querySelector(".he")).display;
  h.dataset.lang = "both";
  // Verse identity: rows carry the reading; highlights; a link marks its verse; a link to no verse is ignored.
  h.dataset.checkAnchor = rows[0].row.id;
  h.dataset.checkHighlights = String(document.querySelectorAll("#text .row.hl").length);
  h.dataset.checkHlWords = String(document.querySelectorAll("#text .he .w.hl-w").length);
  h.dataset.checkHlNotes = String(document.querySelectorAll(".vapp .hl-note").length);
  h.dataset.checkTarget = (document.querySelector("#text .row.target") || {}).id || "";
  h.dataset.checkHash = location.hash;
  h.dataset.checkBogusHash = String(api.goToHash("#haftarah-99-99") === null && !document.querySelector("#text .row.target"));
  const hlButton = document.querySelector("#text .row.hl .gut button");
  h.dataset.checkHlName = hlButton ? String(/Highlighted\.$/.test(hlButton.textContent)) : "none";
  // One polite live region for copy status; every verse-header control a 44px target (one fold opened to measure on a phone).
  h.dataset.checkLive = String(document.querySelectorAll(".sr[role='status'][aria-live='polite']").length);
  const fold = document.querySelector("#text details.vapp:not([open])"); if (fold) fold.open = true;
  const acts = [...document.querySelectorAll(".vapp .vh .act, .vapp .vh .acts a")].filter(x => x.getClientRects().length);
  h.dataset.checkActHeight = acts.length ? String(Math.floor(Math.min(...acts.map(x => x.getBoundingClientRect().height)))) : "none";
  const vb = document.querySelector("#text .row .gut button");
  if (vb) { const a = getComputedStyle(vb, "::after"); h.dataset.checkVerseHit = String(Math.floor(Math.min(parseFloat(a.width), parseFloat(a.height)))); }
  if (fold) fold.open = false;
  // Two readings: a heading each; the hero's PDF links and its Last time link.
  h.dataset.checkHeads = String(document.querySelectorAll("#text .reading-head").length);
  h.dataset.checkPdfs = String(document.querySelectorAll("#front a.pdf").length);
  // The figures: what was drawn, the places on the map, the map's description, the footer's credit, the labelling.
  h.dataset.checkFigures = figuresSeen.status;
  h.dataset.checkFigPlaces = String(document.querySelectorAll("#front .place").length);
  h.dataset.checkFigDots = String(figuresSeen.dots || 0);   // the places inside the map's frame, as lib.js fitted it
  h.dataset.checkFigDesc = (document.querySelector("#front .map-svg desc") || {}).textContent || "";
  const footText = document.getElementById("footAttr").textContent;
  h.dataset.checkFigCredit = [/OpenBible/.test(footText) && "map", /Galil/.test(footText) && "dates"].filter(Boolean).join(",");
  const scroller = document.querySelector("#front .fig-timeline > .fig-scroll");
  h.dataset.checkFigScroll = scroller ? [scroller.getAttribute("role"), scroller.getAttribute("tabindex"), scroller.getAttribute("aria-label")].join("|") : "none";
  h.dataset.checkFigScrolls = scroller ? String(scroller.scrollWidth > scroller.clientWidth + 1) : "none";
  h.dataset.checkFigLabelled = String([...document.querySelectorAll("#front .fig-svg")].every(s => s.getAttribute("role") === "img"
    && (s.getAttribute("aria-labelledby") || "").split(" ").every(id => id && document.getElementById(id) && s.contains(document.getElementById(id)))));
  const priorLink = document.querySelector("#front a.prior");
  h.dataset.checkPrior = priorLink ? priorLink.getAttribute("href") : "";
  h.dataset.checkSide = JSON.stringify(api.side ? Object.keys(api.side).sort() : []);
  // Marks shared in the address (#m=…): the rows outlined, then kept; the address loses the fragment.
  if (location.hash.startsWith("#m=")) {
    h.dataset.checkShared = String(document.querySelectorAll("#text .row.shared").length);
    h.dataset.checkSharedStrip = document.getElementById("shared").hidden ? "hidden" : "shown";
    const firstShared = document.querySelector("#text .row.shared");
    const addBtn = document.querySelector("#shared button");
    if (addBtn) addBtn.focus();   // Add to my marks, as a reader presses it: focus lands on the first added verse's number
    api.marks.acceptShared();
    const fsb = firstShared && firstShared.querySelector(".gut button");
    h.dataset.checkSharedFocus = String(!!fsb && document.activeElement === fsb);
    h.dataset.checkSharedAdded = String(api.marks.list().length);
    h.dataset.checkSharedHash = location.hash;
  }
  // A reader's marks: none to start; adding one marks the row, names the number, flips the header
  // button, counts in the Aa card, lists in the panel, and the link carries it; removing clears it.
  h.dataset.checkMarks = String(document.querySelectorAll("#text .row.mine").length);
  const mr = rows[1];
  api.marks.add(mr.row.id);
  h.dataset.checkMarksStored = String(api.marks.list().length);
  h.dataset.checkMarksName = String(/Marked\.$/.test(mr.row.querySelector(".gut button").textContent));
  h.dataset.checkMarksButton = mr.app.querySelector('.act[data-act="mark"]').textContent;
  h.dataset.checkMarksCount = document.getElementById("marksCount").textContent;
  h.dataset.checkMarksLink = api.marks.link();
  document.getElementById("marksBtn").click();
  h.dataset.checkMarksListed = String(document.querySelectorAll("#panelBody .marks li").length);
  api.closeAll();
  api.marks.remove(mr.row.id);
  h.dataset.checkMarksRemoved = String(document.querySelectorAll("#text .row.mine").length + api.marks.list().length);
  // Two thirds down: far enough that a rail which scrolls short of its target misses it.
  const target = rows[Math.floor(rows.length * 2 / 3)];
  target.row.scrollIntoView({ block: "start" });
  api.sync({ behavior: "auto" });   // instant, so the rail has moved before it is measured
  h.dataset.checkRange = document.getElementById("mastRange").textContent;
  // Does the current verse's apparatus show inside the rail's visible box?
  const cur = document.querySelector("#rail .vapp.current"), railBox = document.getElementById("rail").getBoundingClientRect();
  const curBox = cur && cur.getBoundingClientRect();
  h.dataset.checkRailCurrent = !wide ? "n/a" : String(!!curBox && curBox.bottom > railBox.top && curBox.top < railBox.bottom);
  // How far the current apparatus sits from the rail's top edge (inside its padding); 0 when railTo landed.
  h.dataset.checkRailOffset = !wide || !curBox ? "n/a" : String(Math.round(curBox.top - (railBox.top + (parseFloat(getComputedStyle(document.getElementById("rail")).paddingTop) || 0))));
  h.dataset.checkCurrent = target.row.classList.contains("current") ? target.v.ref : "";
  h.dataset.theme = "dark";
  h.dataset.checkPaper = getComputedStyle(document.body).backgroundColor;
  h.dataset.checkTitle = document.title;
  // The Translation row: offered when the week has versions; switching swaps the English and shows the note and the credit; back restores.
  const trSeg = document.getElementById("trSeg");
  h.dataset.checkTrOffered = trSeg ? [...trSeg.querySelectorAll("button")].map(b => b.dataset.translation).join(",") : "";
  if (trSeg && api.setTranslation) {
    const was = rows.map(r => r.row.querySelector(".en").innerHTML);
    const pressed = () => (trSeg.querySelector('button[aria-pressed="true"]') || { dataset: {} }).dataset.translation || "";
    const alt = trSeg.querySelector("button:nth-child(2)").dataset.translation;
    await api.setTranslation(alt);   // from code, as a stored choice is applied: the row must follow
    h.dataset.checkTrPressed = pressed();
    const shownRow = rows.find(r => r.row.querySelector(".en.alt"));   // a reading the edition skips keeps JPS 2023
    h.dataset.checkTrEn = shownRow ? shownRow.row.querySelector(".en").textContent.trim() : "";
    h.dataset.checkTrNote = String(!!document.querySelector("#text > .tr-note:first-child"));
    h.dataset.checkTrCredit = (document.getElementById("footTr") || {}).textContent || "";
    h.dataset.checkTrLabel = api.translation.label;
    h.dataset.checkTrGap = [...document.querySelectorAll("#text .tr-gap")].map(n => n.textContent).join(" | ");
    await api.setTranslation("jps2023");
    h.dataset.checkTrPressedBack = pressed();
    h.dataset.checkTrRestored = String(rows.every((r, i) => r.row.querySelector(".en").innerHTML === was[i]) && !document.querySelector(".tr-note, .tr-gap") && !document.getElementById("footTr"));
  }
  // Everything on this verse: a control per verse when the week has links.json; the panel is visibly not the sheet.
  h.dataset.checkRelButtons = String(document.querySelectorAll('.vapp .act[data-act="related"]').length);
  if (api.openRelated && document.querySelector('.vapp .act[data-act="related"]')) {
    const { groups } = await api.openRelated(rows[0], document.querySelector('.vapp .act[data-act="related"]'));
    const pb = document.getElementById("panelBody"), panelEl = document.getElementById("panel");
    h.dataset.checkRelGroups = String(groups);
    h.dataset.checkRelBanner = (pb.querySelector(".from-sefaria") || {}).textContent || "";
    h.dataset.checkRelAlt = String(panelEl.dataset.alt === "1");
    h.dataset.checkRelClosed = String([...pb.querySelectorAll(".rel-group")].every(d => !d.open));
    h.dataset.checkRelUsed = String(pb.querySelectorAll(".used-mark").length);
    h.dataset.checkRelHeHidden = String([...pb.querySelectorAll(".rel.he-only")].every(b => getComputedStyle(b).display === "none"));
    const cb = pb.querySelector("#relHe"); if (cb) { cb.click(); h.dataset.checkRelHeShown = String([...pb.querySelectorAll(".rel.he-only")].every(b => getComputedStyle(b).display !== "none")); }
    h.dataset.checkRelHasQc = String([...pb.querySelectorAll(".rel-group summary")].some(s => /^Quoting Commentary/.test(s.textContent)));
    h.dataset.checkRelLast = (pb.querySelector(".rel-group:last-of-type summary") || {}).textContent || "";
    h.dataset.checkRelKind = document.getElementById("panelKind").textContent;
    api.closeAll();
    h.dataset.checkRelAltGone = String(!panelEl.dataset.alt);
  }
  // The word panel: the first word of the first row, analysed from words.json when the week has it.
  const firstWord = document.querySelector("#text .row .he .w");
  if (firstWord && api.openWord) {
    const { analysed } = await api.openWord(firstWord);
    const pb = document.getElementById("panelBody");
    h.dataset.checkWordAnalysed = String(analysed);
    h.dataset.checkWordSentence = (pb.querySelector(".sense") || {}).textContent || "";
    h.dataset.checkWordChips = String(pb.querySelectorAll(".chip").length);
    h.dataset.checkWordHere = String(pb.querySelectorAll(".occ-go").length);
    h.dataset.checkWordFreq = (pb.querySelector(".freq") || {}).textContent || "";
    h.dataset.checkWordLinks = String(pb.querySelectorAll(".wlinks a").length);
    h.dataset.checkWordCode = String(!!pb.querySelector(".code") && !pb.querySelector(".code").open);
    // "Show the code" opens: the code is hidden while folded and shows once the fold is open.
    const codeFold = pb.querySelector("details.code");
    // checkVisibility, not a box: a closed fold's content still measures, it is just not rendered.
    if (codeFold) { const c = codeFold.querySelector("code"), before = c.checkVisibility(); codeFold.open = true; const after = c.checkVisibility(); h.dataset.checkWordCodeOpens = String(!before && after && getComputedStyle(c).display !== "none"); h.dataset.checkWordCodeSeen = `${before} ${after}`; codeFold.open = false; }
    h.dataset.checkWordBdbOpen = String(!pb.querySelector(".bdb > details"));
    const wordControls = [...pb.querySelectorAll(".code summary, .bdb summary, .wlinks a, .occ-go")];
    h.dataset.checkWordMin = wordControls.length ? String(Math.floor(Math.min(...wordControls.map(x => x.getBoundingClientRect().height)))) : "none";
    const goes = pb.querySelectorAll(".occ-go"), go = goes[goes.length - 1];
    if (go) { go.click(); h.dataset.checkWordGo = (document.querySelector("#text .row.target") || {}).id === `${rows[0].reading}-${go.dataset.verse.replace(":", "-")}` ? "ok" : "none"; h.dataset.checkWordGoPanel = String(document.getElementById("panel").hasAttribute("data-open")); }
    api.closeAll();
  }
  h.dataset.checkErrors = String(errorsSeen.length) + (errorsSeen.length ? ": " + errorsSeen[0] : "");
  h.dataset.checkDone = "1";
}
