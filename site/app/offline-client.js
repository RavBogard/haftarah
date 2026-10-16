// The page's side of the offline app (spec 5.10): register the worker, say when a new build is
// waiting (it is used on the next launch; the page is never reloaded), and warm this week's sheet
// into the cache from the landing. Nothing here runs in the presenter: the note is hidden by CSS
// while html[data-present] is set.
import { SW_URL, dataUrl } from "./contract.js";

export const UPDATE_TEXT = "This site has been updated. The new version opens the next time you launch it.";
export const OFFLINE_LOAD_TEXT = "You’re offline, and this sheet isn’t saved on this device yet.";

export async function registerOffline({ nav = navigator, onUpdate = () => {} } = {}) {
  if (!nav || !nav.serviceWorker) return null;
  let reg;
  try { reg = await nav.serviceWorker.register(SW_URL, { type: "module", updateViaCache: "none" }); } catch { return null; }
  if (!reg) return null;
  let told = false;
  const tell = () => { if (!told && reg.waiting && nav.serviceWorker.controller) { told = true; onUpdate(reg); } };
  tell();
  if (reg.addEventListener) reg.addEventListener("updatefound", () => {
    const w = reg.installing;
    if (w && w.addEventListener) w.addEventListener("statechange", () => { if (w.state === "installed") tell(); });
  });
  return reg;
}

/** The note under the masthead: a sentence and Dismiss. Built node by node: nothing here is markup from data. */
export function showUpdate(host, { text = UPDATE_TEXT } = {}) {
  host.textContent = "";
  const span = document.createElement("span"); span.textContent = text;
  const b = document.createElement("button"); b.type = "button"; b.className = "act"; b.textContent = "Dismiss";
  b.addEventListener("click", () => { host.hidden = true; });
  host.append(span, b);
  host.hidden = false;
}

/** What the week page says when the sheet cannot be loaded: offline is a different sentence from a server fault. */
export function loadFailure({ online, drive }) {
  return online === false ? `${OFFLINE_LOAD_TEXT} <a href="/">All sheets</a>` : `This sheet could not be loaded. The printed sheets are on <a href="${drive}">Google Drive</a>.`;
}

// ---- check mode only (?check=1) ----
// web-check runs Chrome under --virtual-time-budget, whose clock jumps ahead while a page only waits:
// the worker installs, and the Cache API works, on threads the clock does not wait for, so an idle
// page is dumped before they finish. A request in flight holds the clock, so these waits are runs of
// small real requests to the page's own server (the worker script, which the worker never serves).

/** Resolves true once `done()` holds, false after `tries` rounds. */
export async function holdUntil(done, { fetchImpl = fetch, tries = 3000 } = {}) {
  for (let i = 0; i < tries && !done(); i++) await Promise.resolve(fetchImpl(`${SW_URL}?wait=${i}`, { cache: "no-store" })).catch(() => {});
  return !!done();
}

/** `p`'s value, awaited with the clock held. */
export async function held(p, opts = {}) {
  let settled = false;
  const q = Promise.resolve(p);
  q.then(() => { settled = true; }, () => { settled = true; });
  await Promise.resolve();   // a promise already settled says so before the first round
  await holdUntil(() => settled, opts);
  return q;
}

/**
 * "active" once a worker is ready and controls the page (it claims clients after activating);
 * "failed" when `reg` is left with no worker at all (the install failed: a precache file was missing);
 * "uncontrolled" after `tries` rounds of neither. 500 rounds stay inside web-check's 12 s virtual budget.
 */
export async function waitForControl({ nav = navigator, reg = null, tries = 500, ...opts } = {}) {
  const sw = nav && nav.serviceWorker;
  if (!sw) return "none";
  let ready = false;
  Promise.resolve(sw.ready).then(() => { ready = true; });
  await Promise.resolve();
  const active = () => ready && !!sw.controller;
  const failed = () => !!reg && !reg.installing && !reg.waiting && !reg.active;
  await holdUntil(() => active() || failed(), { ...opts, tries });
  return active() ? "active" : failed() ? "failed" : "uncontrolled";
}

/** The landing asks for this week's sheet once a worker controls the page, so it is cached before it is wanted. */
export async function warmWeek(slug, { nav = navigator, fetchImpl = fetch } = {}) {
  if (!slug || !nav || !nav.serviceWorker || !nav.serviceWorker.controller) return "skipped";
  try { await fetchImpl(dataUrl(slug, "sheet.json")); return slug; } catch { return "skipped"; }
}
