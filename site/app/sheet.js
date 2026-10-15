// The week page. Data comes from /data/weeks/<slug>/sheet.json (the Blob store behind the rewrite);
// the model comes from lib.js's sheetModel, so the page prepares verses exactly as the print does.
import { applyStored, initSettings } from "./settings.js";
import { initPanel } from "./panel.js";
import { slugFromPath, dataUrl, verseAnchor, parseVerseAnchor, PDF_FILES } from "./contract.js";

export { slugFromPath, dataUrl };
import { initRoving, focusables } from "./a11y.js";
import { createAnalytics } from "./analytics.js";
import { initPresent, isPresent } from "./present.js";

const DRIVE = "https://drive.google.com/drive/folders/1TbSmoeBaCSLciL_-_HSCuKWkJMSZvGwd";
const errorsSeen = [];   // filled in check mode (?check=1) by the error listeners in run()

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

// The teacher highlights on one verse. A highlight without "reading" belongs to the haftarah.
export function highlightsFor(list, readingId, chapter, verse) {
  return (Array.isArray(list) ? list : []).filter(h => h && (h.reading || "haftarah") === readingId && Number(h.chapter) === chapter && Number(h.verse) === verse);
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
  const fail = (msg) => { const pb = $("presentBtn"); if (pb) pb.closest(".row").remove();   // nothing to present on an error page
  const s = $("status"); s.innerHTML = msg; s.hidden = false; if (check) { html.dataset.checkErrors = String(errorsSeen.length + 1) + ": " + s.textContent; html.dataset.checkDone = "1"; } };

  applyStored();
  const slug = slugFromPath(location.pathname);
  let startPresent = null;   // set once the verses exist
  const settings = initSettings({ host: $("settings"), button: $("aaBtn"), pdfHref: slug ? dataUrl(slug, "sheet.pdf") : null, onPresent: () => startPresent && startPresent(true) });
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
    return fail(`This sheet could not be loaded. The printed sheets are on <a href="${DRIVE}">Google Drive</a>.`);
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
  const used = L.REGISTER_ORDER.filter(k => parts.some(p => p.model.front.legend.used.includes(k)));
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
  const prior = data.prior && data.prior.slug ? `<br><a class="prior" href="/${esc(data.prior.slug)}">Last time: the ${esc(data.prior.cycle || "")} sheet</a>` : "";
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
    <div class="legend">${L.REGISTER_ORDER.map(k => `<span class="reg reg-${k}${used.includes(k) ? "" : " unused"}">${SIG[k]}${NAMES[k]}</span>`).join("")}
      <span${hasKeys ? "" : ' class="unused"'}><span class="k">a–z</span>translators’ notes (JPS) and word notes: tap a letter</span>
      ${hasKetiv ? `<span><span class="k">[ ] ( )</span>read / written: where tradition reads a word differently from its spelling</span>` : ""}
      <span class="trope-legend"><span class="label">Chanter’s copy · trope phrases by family</span>${families.map(x => `<span class="tr tr-${x.key}">${esc(x.name)}</span>`).join(" ")}</span>
    </div>`;
  if (voices.length) front.append(el("div", "voices", `<h2>Voices on this sheet</h2><p>${voices.map(v => `<span class="voice"><span class="name">${esc(v.name)}</span>${v.refs && v.refs.length ? ` (${esc(v.refs.join(", "))})` : ""}${v.line ? ` ${esc(v.line)}` : ""}</span>`).join('<span class="sep"> · </span>')}</p>`));
  front.append(el("div", "provenance", `Hebrew: ${esc(prov.he)}. English: ${esc(prov.en)}. ${prov.signoffHtml}${prov.signed ? ` <span class="sign">— ${esc(prov.editor)}</span>` : ""}`));
  $("footAttr").textContent = `Hebrew: ${prov.he}. English: ${prov.en}. Sources from Sefaria.`;
  for (const id of ["reading", "end", "foot"]) $(id).hidden = false;
  // Shown only while a provider is switched on, and only after Daniel approves the wording (spec 5.3).
  if (analytics.provider !== "none") $("foot").insertAdjacentHTML("beforeend", `<span class="privacy">We count visits and which sources are opened; nothing identifies you. Opening a source or a word asks Sefaria for it.</span>`);

  // ---- verse rows and their apparatus ----
  const text = $("text"), rail = $("rail");
  const rows = [];
  const wide = matchMedia("(min-width: 1100px)");
  const gutButton = r => r.row.querySelector(".gut button");
  let current = null;   // the row sync() last marked current
  // A keyed letter becomes a button the popover (panel.js) answers; the sup keeps its classes.
  function keyButtons(node) {
    node.querySelectorAll("sup.fn").forEach(s => {
      const k = esc(s.textContent.trim());
      s.innerHTML = `<button type="button" data-key="${k}" aria-expanded="false">${k}</button>`;
    });
  }
  // Every Hebrew word becomes a focusable target for the word panel; footnote letters and the
  // ketiv are not words of the reading, so they are left alone.
  function wrapWords(node) {
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    const texts = []; let t; while ((t = walker.nextNode())) texts.push(t);
    for (const tn of texts) {
      if (tn.parentElement.closest("sup, .ketiv")) continue;
      const words = L.hebrewWords(tn.data); if (!words.length) continue;
      const frag = document.createDocumentFragment(); let at = 0;
      for (const w of words) {
        if (w.start > at) frag.append(tn.data.slice(at, w.start));
        const s = el("span", "w", esc(w.text)); s.tabIndex = -1; s.setAttribute("role", "button"); frag.append(s); at = w.end;
      }
      if (at < tn.data.length) frag.append(tn.data.slice(at));
      tn.replaceWith(frag);
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
    const count = countLabel(v.entries.length, v.keys.length + hlNotes.length);
    // A verse with nothing gets a div: a <details> without a summary shows the browser's own "Details".
    const app = el(count ? "details" : "div", "vapp"); app.dataset.verse = cv;
    app.innerHTML = (count ? `<summary><span class="count">${count}</span><svg class="chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg></summary>` : "") +
      `<p class="vh"><span>${cv}</span><span class="acts"><button type="button" class="act" data-act="link">Copy link</button><button type="button" class="act" data-act="copy">Copy verse</button><a href="${esc(sefariaUrl(v.ref))}" target="_blank" rel="noopener">on Sefaria</a></span></p>` +
      hlNotes.map(h => `<p class="hl-note">${L.divineName(h.note).html}</p>`).join("") +
      v.keys.map(k => `<p class="note ${k.kind}">${noteHtml(k, L)}</p>`).join("") +
      v.entries.map(e => `<p class="entry reg-${e.register}">${entryHtml(e)}</p>`).join("");
    if (!count) app.classList.add("empty");
    rail.append(app); text.append(row);
    const r = { v, row, app, keys: v.keys, reading: reading.id, model: part.model };
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

  // verse number: jump to its commentary (the rail when wide, the fold below the verse otherwise)
  for (const r of rows) gutButton(r).addEventListener("click", () => {
    if (wide.matches) { railPause = Date.now() + 1500; railTo(r.app); r.app.classList.add("current"); }
    else if (r.app.tagName === "DETAILS") { r.app.open = !r.app.open; }   // the toggle listener updates aria-expanded
    else gutButton(r).setAttribute("aria-expanded", String(r.app.classList.toggle("show")));   // no commentary: just the header (links, copy)
  });

  // "Copy link" and "Copy verse" in each verse's header (in the rail when wide, in the fold otherwise).
  async function onAct(e) {
    const b = e.target.closest("button.act"); if (!b) return;
    const r = rows.find(x => x.app === b.closest(".vapp")); if (!r) return;
    const url = verseUrl(location.origin, slug, r.row.id);
    const text = b.dataset.act === "link" ? url : citationText({
      he: L.plainText(r.v.heHtml).text.trim(),
      en: r.v.enLines.map(t => L.plainText(t).text.trim()).join("\n"),
      ref: L.enDash(r.v.ref), translation: translationLabel(r.model.front.provenance.en), url,
      mode: html.dataset.lang || "both",
    });
    await copyWithStatus(b, text, { write: t => navigator.clipboard.writeText(t), status: copyStatus });
  }
  // One polite live region for the page, so a screen reader hears "Copied" or "Not copied".
  const copyStatus = el("p", "sr"); copyStatus.id = "copyStatus";
  copyStatus.setAttribute("role", "status"); copyStatus.setAttribute("aria-live", "polite");
  document.body.append(copyStatus);
  rail.addEventListener("click", onAct); text.addEventListener("click", onAct);

  const api = { rows, model, sync, goToHash, closeAll: () => { panel.close(); settings.close(); } };
  window.HaftarahPage = api;
  const panel = initPanel({ page: api, L, sefariaUrl, track });

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
    presenter = initPresent({ model, rows, L, track, onExit: r => {
      presenter = null; current = null; sync();
      (fromCard ? $("aaBtn") : gutButton(r)).focus({ preventScroll: true });
    } });
    return presenter;
  };
  if (isPresent(location.search)) startPresent();
  if (check) { if (presenter) runPresentCheck().catch(e => { const h = document.documentElement; h.dataset.checkErrors = "1: " + String(e && e.message || e); h.dataset.checkDone = "1"; }); else runCheck(api, L); }
}

// ?present&check=1: what the presenter shows once the web fonts are in, then PageDown, B twice, Escape,
// each as a key a remote would send.
async function runPresentCheck() {
  const h = document.documentElement, $ = id => document.getElementById(id);
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

function runCheck(api, L) {
  const h = document.documentElement, rows = api.rows;
  const wide = matchMedia("(min-width: 1100px)").matches;
  h.dataset.checkVerses = String(rows.length);
  h.dataset.checkKeys = api.model.sequence.join(",");
  h.dataset.checkWords = String(document.querySelectorAll("#text .he .w").length);
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
  const priorLink = document.querySelector("#front a.prior");
  h.dataset.checkPrior = priorLink ? priorLink.getAttribute("href") : "";
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
  h.dataset.checkErrors = String(errorsSeen.length) + (errorsSeen.length ? ": " + errorsSeen[0] : "");
  h.dataset.checkDone = "1";
}
