// The Aa button: text size (five steps), theme, trope colors, the PDF link. Choices persist per
// device in localStorage; ?trope=1 wins for that load. Shared by the landing and the week page.
const store = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} };
const load = k => { try { return localStorage.getItem(k); } catch { return null; } };

export function applyStored() {
  const html = document.documentElement;
  html.dataset.size = /^[1-5]$/.test(load("size") || "") ? load("size") : "2";
  html.dataset.theme = ["auto", "light", "dark"].includes(load("theme")) ? load("theme") : "auto";
  if (load("trope") === "1" || new URLSearchParams(location.search).get("trope") === "1") html.dataset.trope = "1";
}

export function initSettings({ host, button, pdfHref = null, trope = true }) {
  const html = document.documentElement;
  host.innerHTML = `
    <div class="row"><span class="label">Text size</span>
      <span class="seg" role="group" aria-label="Text size"><button type="button" id="sizeDown" aria-label="Smaller text">−</button><button type="button" id="sizeUp" aria-label="Larger text">+</button></span></div>
    <div class="row"><span class="label">Theme</span>
      <span class="seg" role="group" aria-label="Theme" id="themeSeg"><button type="button" data-theme="auto">Auto</button><button type="button" data-theme="light">Light</button><button type="button" data-theme="dark">Dark</button></span></div>
    ${trope ? `<div class="row"><span class="label">Trope colors<br><span class="hint">for chanters: phrases by family</span></span>
      <button type="button" class="switch" id="tropeSw" role="switch" aria-checked="false" aria-label="Trope colors"></button></div>` : ""}
    ${pdfHref ? `<div class="row"><a class="dl" href="${pdfHref}" download><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M12 4v11m0 0l-4-4m4 4l4-4M5 20h14"/></svg>Download the printed sheet (PDF)</a></div>` : ""}`;
  const sync = () => {
    host.querySelectorAll("#themeSeg button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.theme === html.dataset.theme)));
    const sw = host.querySelector("#tropeSw"); if (sw) sw.setAttribute("aria-checked", String(!!html.dataset.trope));
    host.querySelector("#sizeDown").disabled = html.dataset.size === "1";
    host.querySelector("#sizeUp").disabled = html.dataset.size === "5";
  };
  const open = v => { host.toggleAttribute("data-open", v); button.setAttribute("aria-expanded", String(v)); };
  const close = () => open(false);
  button.addEventListener("click", () => open(!host.hasAttribute("data-open")));
  document.addEventListener("click", e => { if (!host.contains(e.target) && e.target !== button) close(); });
  // Escape closes the panel on every page (the landing has no side panel to do it) and hands focus back.
  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && host.hasAttribute("data-open")) { close(); button.focus({ preventScroll: true }); }
  });
  host.querySelector("#sizeDown").addEventListener("click", () => { html.dataset.size = String(Math.max(1, +html.dataset.size - 1)); store("size", html.dataset.size); sync(); });
  host.querySelector("#sizeUp").addEventListener("click", () => { html.dataset.size = String(Math.min(5, +html.dataset.size + 1)); store("size", html.dataset.size); sync(); });
  host.querySelectorAll("#themeSeg button").forEach(b => b.addEventListener("click", () => { html.dataset.theme = b.dataset.theme; store("theme", b.dataset.theme); sync(); }));
  const sw = host.querySelector("#tropeSw");
  if (sw) sw.addEventListener("click", () => { if (html.dataset.trope) { delete html.dataset.trope; store("trope", null); } else { html.dataset.trope = "1"; store("trope", "1"); } sync(); });
  sync();
  return { close };
}
