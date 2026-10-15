// Presenter view (?present): one verse at a time, large, for a laptop sharing its screen on Zoom.
// A presenter remote sends PageDown and PageUp; the keyboard has the rest. The current verse is in
// the address, so a reload resumes and the link can be pasted into the chat.
import { parseVerseAnchor } from "./contract.js";

export const PRESENT_KEYS = {
  PageDown: "next", ArrowRight: "next", ArrowDown: "next", " ": "next", Enter: "next",
  PageUp: "prev", ArrowLeft: "prev", ArrowUp: "prev", Backspace: "prev",
  Home: "first", End: "last",
  b: "blank", B: "blank", ".": "blank",
  c: "notes", C: "notes", n: "preview", N: "preview", t: "trope", T: "trope",
  "+": "bigger", "=": "bigger", "-": "smaller", _: "smaller",
  "?": "help", Escape: "exit",
};

/** What a key does here, or null to leave it to the browser (zoom, history, a focused button). */
export function presentAction({ key, ctrlKey = false, metaKey = false, altKey = false, onControl = false }) {
  if (ctrlKey || metaKey || altKey) return null;
  if (onControl && (key === " " || key === "Enter")) return null;
  return PRESENT_KEYS[key] || null;
}

export function stepIndex(i, n, action) {
  if (!n) return 0;
  if (action === "next") return Math.min(n - 1, i + 1);
  if (action === "prev") return Math.max(0, i - 1);
  if (action === "first") return 0;
  if (action === "last") return n - 1;
  return i;
}

export const isPresent = search => new URLSearchParams(search || "").has("present");

/** The verse to start on: the one in the address (an old #v-anchor included), else the first. */
export function startIndex(rows, hash) {
  const a = parseVerseAnchor(hash);
  if (!a) return 0;
  // The first release's #vC-V names no reading: it meant the haftarah (the primary reading), never a Torah verse.
  const reading = a.reading == null ? "haftarah" : a.reading;
  const i = rows.findIndex(r => r.chapter === a.chapter && r.verse === a.verse && r.reading === reading);
  return i < 0 ? 0 : i;
}

/** The verse without its footnote and gloss letters: they mean nothing on a shared screen. */
export const stripKeys = html => String(html == null ? "" : html).replace(/<sup class="fn(?: he)?">[a-z]+<\/sup>/g, "");

export function initPresent({ model, rows, L, track = () => {}, onExit = () => {} }) {
  const html = document.documentElement, esc = L.escapeHtml, SIG = L.SIGLA;
  const tropeBefore = html.dataset.trope;
  if (new URLSearchParams(location.search).get("trope") !== "1") delete html.dataset.trope;   // pastels blur in a video stream
  html.dataset.present = "1";
  const host = document.createElement("section");
  host.className = "present"; host.id = "present"; host.setAttribute("aria-label", "Presenter view");
  host.innerHTML = `
    <div class="p-top"><span class="p-label" id="pLabel" aria-live="polite"></span><span class="p-count" id="pCount"></span></div>
    <div class="p-body" id="pBody">
      <div class="p-he he" id="pHe" lang="he" dir="rtl"></div>
      <div class="p-en" id="pEn"></div>
      <div class="p-notes" id="pNotes" hidden></div>
    </div>
    <p class="p-next" id="pNext" hidden></p>
    <div class="p-nav">
      <span class="p-help" id="pHelp" hidden>→ or PageDown next · ← or PageUp back · B blank · C commentary · N next verse · T trope colors · + − size · Esc exit</span>
      <button type="button" id="pPrev">Previous</button><button type="button" id="pFwd">Next</button><button type="button" id="pExit">Exit</button>
    </div>
    <div class="p-blank" id="pBlank" hidden></div>`;
  // The page underneath leaves the tab order while the presenter covers it; what was already inert stays so.
  const benched = [...document.body.children].filter(n => !n.inert);
  benched.forEach(n => { n.inert = true; });
  document.body.append(host);
  const $ = id => host.querySelector(`#${id}`);
  let i = startIndex(rows.map(r => ({ reading: r.row.dataset.reading, chapter: r.v.chapter, verse: r.v.verse })), location.hash);
  let user = 1, lock = null, closed = false;

  // A long verse shrinks (to half size at most) rather than scroll.
  function fit() {
    const body = $("pBody");
    let s = 1;
    body.style.setProperty("--p-fit", "1");
    while (s > 0.5 && body.scrollHeight > body.clientHeight + 1) { s = Math.round((s - 0.05) * 100) / 100; body.style.setProperty("--p-fit", String(s)); }
  }
  function show() {
    const r = rows[i], v = r.v, next = rows[i + 1];
    $("pLabel").textContent = L.enDash(v.ref);
    $("pCount").textContent = `${i + 1} / ${rows.length}`;
    $("pHe").innerHTML = stripKeys(v.heHtml);
    $("pEn").innerHTML = v.enLines.map(t => `<span class="ln">${stripKeys(t)}</span>`).join("");
    $("pNotes").innerHTML = v.entries.length
      ? v.entries.map(e => `<p class="p-entry reg-${e.register}"><span class="sig">${SIG[e.register]}</span><b>${esc(e.source)}</b> ${e.bodyHtml}</p>`).join("")
      : `<p class="p-entry">No commentary on this verse.</p>`;
    $("pNext").textContent = next ? `Next: ${L.plainText(next.v.enLines[0] || "").text.trim()}` : "";
    history.replaceState(null, "", `${location.pathname}${location.search}#${r.row.id}`);
    fit();
  }
  function act(a) {
    const blank = $("pBlank");
    if (!blank.hidden && a !== "exit") { blank.hidden = true; return; }   // any key brings the verse back
    switch (a) {
      case "next": case "prev": case "first": case "last": { const j = stepIndex(i, rows.length, a); if (j !== i) { i = j; show(); } return; }
      case "blank": blank.hidden = false; return;
      case "notes": $("pNotes").hidden = !$("pNotes").hidden; fit(); return;
      case "preview": $("pNext").hidden = !$("pNext").hidden; fit(); return;
      case "trope": if (html.dataset.trope) delete html.dataset.trope; else html.dataset.trope = "1"; return;
      case "bigger": case "smaller":
        user = Math.min(2, Math.max(0.6, Math.round(user * (a === "bigger" ? 1.1 : 1 / 1.1) * 100) / 100));
        host.style.setProperty("--p-user", String(user)); fit(); return;
      case "help": $("pHelp").hidden = !$("pHelp").hidden; return;
      case "exit": exit(); return;
    }
  }
  function onKey(e) {
    const a = presentAction({ key: e.key, ctrlKey: e.ctrlKey, metaKey: e.metaKey, altKey: e.altKey, onControl: !!(e.target && e.target.closest && e.target.closest("button, a")) });
    if (!a) return;
    e.preventDefault(); e.stopPropagation();
    act(a);
  }
  // The screen stays awake while presenting, where the browser allows it.
  // A lock granted after exit is let go at once.
  const wake = async () => {
    try {
      if (closed || !navigator.wakeLock || document.visibilityState !== "visible") return;
      const l = await navigator.wakeLock.request("screen");
      if (closed) l.release().catch(() => {}); else lock = l;
    } catch {}
  };
  function exit() {
    closed = true;
    document.removeEventListener("keydown", onKey, true);
    document.removeEventListener("visibilitychange", wake);
    removeEventListener("resize", fit);
    if (lock) lock.release().catch(() => {});
    const r = rows[i];
    host.remove();
    benched.forEach(n => { n.inert = false; });
    delete html.dataset.present;
    if (tropeBefore) html.dataset.trope = tropeBefore; else delete html.dataset.trope;
    const q = new URLSearchParams(location.search); q.delete("present");
    history.replaceState(null, "", `${location.pathname}${q.toString() ? `?${q}` : ""}#${r.row.id}`);
    r.row.scrollIntoView({ block: "start" });
    onExit(r);
  }
  document.addEventListener("keydown", onKey, true);
  document.addEventListener("visibilitychange", wake);
  addEventListener("resize", fit);
  $("pPrev").addEventListener("click", () => act("prev"));
  $("pFwd").addEventListener("click", () => act("next"));
  $("pExit").addEventListener("click", () => act("exit"));
  $("pBlank").addEventListener("click", () => { $("pBlank").hidden = true; });
  wake();
  track("present_start", {});
  show();
  // The web fonts swap in after the first fit (font-display: swap); fit again once they have.
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (host.isConnected) fit(); });
  $("pFwd").focus({ preventScroll: true });
  return { act, exit, index: () => i, host };
}
