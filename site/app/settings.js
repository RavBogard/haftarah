// The Aa button: text size (five steps), theme, which languages show, trope colors, the PDF link.
// Choices persist per device under haftarah:v1: keys (storage.js); ?trope=1 wins for that load.
// Shared by the landing and the week page.
import { load, store, migrateKeys } from "./storage.js";
import { trapFocus, focusables } from "./a11y.js";

export const LANGS = ["he", "both", "en"];

export function applyStored() {
  const html = document.documentElement;
  migrateKeys();
  const size = load("size"), theme = load("theme"), lang = load("lang");
  html.dataset.size = /^[1-5]$/.test(size || "") ? size : "2";
  html.dataset.theme = ["auto", "light", "dark"].includes(theme) ? theme : "auto";
  html.dataset.lang = LANGS.includes(lang) ? lang : "both";
  if (load("trope") === "1" || new URLSearchParams(location.search).get("trope") === "1") html.dataset.trope = "1";
}

export function initSettings({ host, button, pdfHref = null, trope = true, langs = true, onPresent = null }) {
  const html = document.documentElement;
  host.innerHTML = `
    <div class="row"><span class="label">Text size</span>
      <span class="seg" role="group" aria-label="Text size"><button type="button" id="sizeDown" aria-label="Smaller text">−</button><button type="button" id="sizeUp" aria-label="Larger text">+</button></span></div>
    <div class="row"><span class="label">Theme</span>
      <span class="seg" role="group" aria-label="Theme" id="themeSeg"><button type="button" data-theme="auto">Auto</button><button type="button" data-theme="light">Light</button><button type="button" data-theme="dark">Dark</button></span></div>
    ${langs ? `<div class="row"><span class="label">Show</span>
      <span class="seg" role="group" aria-label="Show" id="langSeg"><button type="button" data-lang="he">Hebrew</button><button type="button" data-lang="both">Both</button><button type="button" data-lang="en">English</button></span></div>` : ""}
    ${trope ? `<div class="row"><span class="label">Trope colors<br><span class="hint">for chanters: phrases by family</span></span>
      <button type="button" class="switch" id="tropeSw" role="switch" aria-checked="false" aria-label="Trope colors"></button></div>` : ""}
    ${pdfHref ? `<div class="row"><a class="dl" href="${pdfHref}" download><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M12 4v11m0 0l-4-4m4 4l4-4M5 20h14"/></svg>Download the printed sheet (PDF)</a></div>` : ""}
    ${onPresent ? `<div class="row"><button type="button" class="present-btn" id="presentBtn">Present on a shared screen</button></div>` : ""}`;
  const sync = () => {
    host.querySelectorAll("#themeSeg button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.theme === html.dataset.theme)));
    host.querySelectorAll("#langSeg button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.lang === html.dataset.lang)));
    const sw = host.querySelector("#tropeSw"); if (sw) sw.setAttribute("aria-checked", String(!!html.dataset.trope));
    host.querySelector("#sizeDown").disabled = html.dataset.size === "1";
    host.querySelector("#sizeUp").disabled = html.dataset.size === "5";
  };
  // While open, the card is a dialog: focus moves into it and Tab stays inside.
  const open = v => {
    host.toggleAttribute("data-open", v); button.setAttribute("aria-expanded", String(v));
    if (v) { host.setAttribute("aria-modal", "true"); const first = focusables(host)[0]; if (first) first.focus({ preventScroll: true }); }
    else host.removeAttribute("aria-modal");
  };
  const close = () => open(false);
  button.addEventListener("click", () => open(!host.hasAttribute("data-open")));
  document.addEventListener("click", e => { if (!host.contains(e.target) && e.target !== button) close(); });
  // Escape closes the panel on every page (the landing has no side panel to do it) and hands focus back.
  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && host.hasAttribute("data-open")) { close(); button.focus({ preventScroll: true }); }
  });
  trapFocus(host, () => host.hasAttribute("data-open"));
  host.querySelector("#sizeDown").addEventListener("click", () => { html.dataset.size = String(Math.max(1, +html.dataset.size - 1)); store("size", html.dataset.size); sync(); });
  host.querySelector("#sizeUp").addEventListener("click", () => { html.dataset.size = String(Math.min(5, +html.dataset.size + 1)); store("size", html.dataset.size); sync(); });
  host.querySelectorAll("#themeSeg button").forEach(b => b.addEventListener("click", () => { html.dataset.theme = b.dataset.theme; store("theme", b.dataset.theme); sync(); }));
  host.querySelectorAll("#langSeg button").forEach(b => b.addEventListener("click", () => { html.dataset.lang = b.dataset.lang; store("lang", b.dataset.lang); sync(); }));
  const sw = host.querySelector("#tropeSw");
  if (sw) sw.addEventListener("click", () => { if (html.dataset.trope) { delete html.dataset.trope; store("trope", null); } else { html.dataset.trope = "1"; store("trope", "1"); } sync(); });
  const pb = host.querySelector("#presentBtn");
  if (pb) pb.addEventListener("click", () => { close(); onPresent(); });
  sync();
  return { close };
}
