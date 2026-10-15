// The week page. Data comes from /data/weeks/<slug>/sheet.json (the Blob store behind the rewrite);
// the model comes from lib.js's sheetModel, so the page prepares verses exactly as the print does.
import { applyStored, initSettings } from "./settings.js";
import { initPanel } from "./panel.js";
import { slugFromPath, dataUrl } from "./contract.js";

export { slugFromPath, dataUrl };

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

export async function run() {
  const L = window.HaftarahLib;
  const esc = L.escapeHtml, SIG = L.SIGLA, NAMES = L.REGISTER_NAMES;
  const el = (tag, cls, html) => { const n = document.createElement(tag); if (cls) n.className = cls; if (html != null) n.innerHTML = html; return n; };
  const $ = id => document.getElementById(id);
  const html = document.documentElement;
  const check = new URLSearchParams(location.search).get("check") === "1";
  if (check) { addEventListener("error", e => errorsSeen.push(e.message)); addEventListener("unhandledrejection", e => errorsSeen.push(String(e.reason))); }
  const fail = (msg) => { const s = $("status"); s.innerHTML = msg; s.hidden = false; if (check) { html.dataset.checkErrors = String(errorsSeen.length + 1) + ": " + s.textContent; html.dataset.checkDone = "1"; } };

  applyStored();
  const slug = slugFromPath(location.pathname);
  const settings = initSettings({ host: $("settings"), button: $("aaBtn"), pdfHref: slug ? dataUrl(slug, "sheet.pdf") : null });
  if (!slug) return fail(`No sheet at this address. <a href="/">All sheets</a>`);

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
  const model = L.sheetModel(data, { voices: voicesDict });
  document.title = model.title;

  // ---- front page: the sheet introduces itself ----
  const f = model.front, prov = f.provenance;
  const front = $("front");
  front.innerHTML = `
    <div class="hero">
      <img class="mural" src="/mural.png" alt="The Siona Benjamin floor mural at Central Reform Congregation">
      <div class="incipit-block">
        <h1 class="incipit" lang="he" dir="rtl">${f.incipit.heHtml}</h1>
        <p class="incipit-en">${esc(f.incipit.en)}</p>
        <p class="reading"><span class="ref">${esc(model.ref)}</span><br>${esc(model.shabbatName)}<br>
          <span class="dates"><span class="he-date" lang="he" dir="rtl">${esc(model.shabbat.hebrew)}</span> · ${esc(model.shabbat.civilDisplay)}</span><br>
          <a class="pdf" href="${dataUrl(slug, "sheet.pdf")}">The printed sheet (PDF)</a></p>
      </div>
    </div>
    <div class="opening">
      ${f.openingNote.calendar.map(p => `<p>${p}</p>`).join("")}
      ${f.openingNote.setting.length ? `<div class="setting">${f.openingNote.setting.map(p => `<p>${p}</p>`).join("")}</div>` : ""}
    </div>
    <div class="legend">${L.REGISTER_ORDER.map(k => `<span class="reg reg-${k}${f.legend.used.includes(k) ? "" : " unused"}">${SIG[k]}${NAMES[k]}</span>`).join("")}
      <span${f.legend.hasKeys ? "" : ' class="unused"'}><span class="k">a–z</span>translators’ notes (JPS) and word notes: tap a letter</span>
      ${f.legend.hasKetiv ? `<span><span class="k">[ ] ( )</span>read / written: where tradition reads a word differently from its spelling</span>` : ""}
      <span class="trope-legend"><span class="label">Chanter’s copy · trope phrases by family</span>${f.families.map(x => `<span class="tr tr-${x.key}">${esc(x.name)}</span>`).join(" ")}</span>
    </div>`;
  if (f.voices.length) front.append(el("div", "voices", `<h2>Voices on this sheet</h2><p>${f.voices.map(v => `<span class="voice"><span class="name">${esc(v.name)}</span>${v.refs && v.refs.length ? ` (${esc(v.refs.join(", "))})` : ""}${v.line ? ` ${esc(v.line)}` : ""}</span>`).join('<span class="sep"> · </span>')}</p>`));
  front.append(el("div", "provenance", `Hebrew: ${esc(prov.he)}. English: ${esc(prov.en)}. ${prov.signoffHtml}${prov.signed ? ` <span class="sign">— ${esc(prov.editor)}</span>` : ""}`));
  $("footAttr").textContent = `Hebrew: ${prov.he}. English: ${prov.en}. Sources from Sefaria.`;
  for (const id of ["reading", "end", "foot"]) $(id).hidden = false;

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
        const s = el("span", "w", esc(w.text)); s.tabIndex = 0; s.setAttribute("role", "button"); frag.append(s); at = w.end;
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
      ? `<button type="button" class="${cls}" data-ref="${esc(e.sourceRef)}" data-reg="${reg}" data-src="${esc(e.source)}" aria-expanded="false">${esc(e.source)}</button>`
      : `<span class="${cls}">${esc(e.source)}</span>`;
    return `<span class="sig" title="${NAMES[reg]}">${SIG[reg]}</span><span class="v">${e.verseLabel}</span>${lemma} ${src}<span class="body">${e.bodyHtml}</span>${e.tail.length ? ` <span class="tail">${e.tail.join("; ")}.</span>` : ""}`;
  }
  for (const v of model.verses) {
    const row = el("div", "row" + (v.prevBreak ? ` break-${v.prevBreak}` : ""));
    row.id = `v${v.chapter}-${v.verse}`; row.dataset.ref = v.ref; row.dataset.verse = `${v.chapter}:${v.verse}`;
    const en = el("div", "en" + (v.poetry ? " poetry" : ""), v.poetry ? v.enLines.map(t => `<span class="ln">${t}</span>`).join("") : v.enLines[0]);
    keyButtons(en);
    const cv = `${v.chapter}:${v.verse}`;
    const gut = el("div", "gut", `${v.showChapter ? `<span class="ch">${cv}</span>` : ""}<button type="button" title="Commentary on ${cv}">${v.verse}</button>`);
    const he = el("div", "he", v.heHtml); he.lang = "he"; he.dir = "rtl";
    keyButtons(he);
    wrapWords(he);
    row.append(en, gut, he);
    const count = countLabel(v.entries.length, v.keys.length);
    // A verse with nothing gets a div: a <details> without a summary shows the browser's own "Details".
    const app = el(count ? "details" : "div", "vapp"); app.dataset.verse = cv;
    app.innerHTML = (count ? `<summary><span class="count">${count}</span><svg class="chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg></summary>` : "") +
      `<p class="vh"><span>${cv}</span><a href="${esc(sefariaUrl(v.ref))}" target="_blank" rel="noopener">on Sefaria</a></p>` +
      v.keys.map(k => `<p class="note ${k.kind}">${noteHtml(k, L)}</p>`).join("") +
      v.entries.map(e => `<p class="entry reg-${e.register}">${entryHtml(e)}</p>`).join("");
    if (!count) app.classList.add("empty");
    rail.append(app); text.append(row);
    const r = { v, row, app, keys: v.keys };
    // Narrow, the verse number opens the fold below it; keep its state announced however the fold moves.
    if (count) app.addEventListener("toggle", () => { if (!wide.matches) gutButton(r).setAttribute("aria-expanded", String(app.open)); });
    rows.push(r);
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
      else { r.row.append(r.app); if (fold) { r.app.open = false; b.setAttribute("aria-expanded", "false"); } }
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
      if (b.bottom > top && b.top < bottom) { if (!first) first = r; lastSeen = r; }
    }
    if (!first) {
      const inFront = text.getBoundingClientRect().top > top;
      mastLeft.textContent = inFront ? `Haftarah · ${model.seriesLabel}` : model.shabbatName;
      mastRange.textContent = inFront ? model.seriesName : model.ref;
      return;
    }
    mastLeft.textContent = model.shabbatName;
    mastRange.textContent = rangeLabel(model.book, first.v, lastSeen.v);
    if (first !== current) {
      current = first;
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

  // verse number: jump to its commentary (the rail when wide, the fold below the verse otherwise)
  for (const r of rows) gutButton(r).addEventListener("click", () => {
    if (wide.matches) { railPause = Date.now() + 1500; railTo(r.app); r.app.classList.add("current"); }
    else if (r.app.tagName === "DETAILS") { r.app.open = !r.app.open; }   // the toggle listener updates aria-expanded
  });

  const api = { rows, model, sync, closeAll: () => { panel.close(); settings.close(); } };
  window.HaftarahPage = api;
  const panel = initPanel({ page: api, L, sefariaUrl });
  if (check) runCheck(api, L);
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
