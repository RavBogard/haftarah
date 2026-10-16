// The page's side of the offline app (spec 5.10): register the worker, say when a new build is
// waiting (it is used on the next launch; the page is never reloaded), and warm a week's sheet
// into the cache (this week's from the landing; the open week's on a first visit, once the worker takes
// control). Nothing here runs in the presenter: the note is hidden by CSS
// while html[data-present] is set.
import { SW_URL, dataUrl } from "./contract.js";
import { hideKeepingFocus } from "./a11y.js";

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
  b.addEventListener("click", () => { hideKeepingFocus(host); });   // focus, if it was on Dismiss, goes to the Aa button
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

// No wait in check mode may be a timer: an idle page's timer fires at once in virtual time, before
// any real work lands (a 10 s setTimeout race once beat register() itself). Every cap is in rounds.
// 500 rounds is about 5 s of virtual time; the worker takes control in under 100.
export const HOLD_TRIES = 500;

/** Resolves true once `done()` holds, false after `tries` rounds. */
export async function holdUntil(done, { fetchImpl = fetch, tries = HOLD_TRIES } = {}) {
  for (let i = 0; i < tries && !done(); i++) await Promise.resolve(fetchImpl(`${SW_URL}?wait=${i}`, { cache: "no-store" })).catch(() => {});
  return !!done();
}

/** `p`'s value, awaited with the clock held; `fallback` if it has not settled after `tries` rounds. */
export async function held(p, { fallback, ...opts } = {}) {
  let settled = false;
  const q = Promise.resolve(p);
  q.then(() => { settled = true; }, () => { settled = true; });
  await Promise.resolve();   // a promise already settled says so before the first round
  return (await holdUntil(() => settled, opts)) ? q : fallback;
}

/**
 * "active" once a worker is ready and controls the page (it claims clients after activating);
 * "failed" as soon as the installing worker turns redundant with none active (the install failed: a
 * precache file was missing), or the registration is left with no worker at all;
 * "uncontrolled" after `tries` rounds of neither.
 */
export async function waitForControl({ nav = navigator, reg = null, ...opts } = {}) {
  const sw = nav && nav.serviceWorker;
  if (!sw) return "none";
  let ready = false, redundant = false;
  Promise.resolve(sw.ready).then(() => { ready = true; });
  const watch = w => {
    if (!w) return;
    if (w.state === "redundant") redundant = true;
    if (w.addEventListener) w.addEventListener("statechange", () => { if (w.state === "redundant") redundant = true; });
  };
  if (reg) {
    watch(reg.installing); watch(reg.waiting);
    if (reg.addEventListener) reg.addEventListener("updatefound", () => watch(reg.installing));
  }
  await Promise.resolve();
  const active = () => ready && !!sw.controller;
  const failed = () => !!reg && !reg.active && (redundant || (!reg.installing && !reg.waiting));
  await holdUntil(() => active() || failed(), opts);
  return active() ? "active" : failed() ? "failed" : "uncontrolled";
}

/**
 * The check's whole wait: the registration (held, never raced against a timer), then control.
 * "timeout" | "none" | "active" | "failed" | "uncontrolled", with the registration.
 */
export async function settleOffline(offlineReady, { nav = navigator, ...opts } = {}) {
  const reg = await held(offlineReady, { ...opts, fallback: "timeout" });
  if (reg === "timeout") return { state: "timeout", reg: null };
  if (!reg) return { state: "none", reg: null };
  return { state: await waitForControl({ nav, reg, ...opts }), reg };
}

/** The landing asks for this week's sheet once a worker controls the page, so it is cached before it is wanted. */
export async function warmWeek(slug, { nav = navigator, fetchImpl = fetch } = {}) {
  if (!slug || !nav || !nav.serviceWorker || !nav.serviceWorker.controller) return "skipped";
  try { await fetchImpl(dataUrl(slug, "sheet.json")); return slug; } catch { return "skipped"; }
}

/**
 * A first visit: the page fetched its week before any worker controlled it, so the week was not
 * cached. When the worker takes control (it claims clients on activating), ask for the week once more,
 * through it. A page controlled from the start skips this: its own fetch went through the worker.
 * `skip()` is asked at that moment (the presenter never warms). Resolves to warmWeek's answer.
 */
export function warmOnControl(slug, { nav = navigator, fetchImpl = fetch, skip = () => false } = {}) {
  const sw = nav && nav.serviceWorker;
  if (!slug || !sw || sw.controller || typeof sw.addEventListener !== "function") return Promise.resolve("skipped");
  return new Promise(resolve => {
    sw.addEventListener("controllerchange", () => resolve(skip() ? "skipped" : warmWeek(slug, { nav, fetchImpl })), { once: true });
  });
}
