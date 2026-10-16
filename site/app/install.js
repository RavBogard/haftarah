// The Add to Home Screen card (spec 5.10): iOS has no install prompt, so iPad and iPhone Safari
// readers get the two steps, once, outside the installed app. Dismissed for good with Not now.
import { load, store } from "./storage.js";

export const INSTALL_KEY = "install-card";
export const INSTALL_TITLE = device => `Keep these sheets on this ${device}`;
export const INSTALL_STEPS = ["Tap Share (the square with an arrow).", "Tap Add to Home Screen."];
export const INSTALL_NOTE = "Sheets you have opened stay readable without a connection, and your marks are kept.";
export const NOT_NOW = "Not now";

const ua = nav => String((nav && nav.userAgent) || "");
const touchMac = nav => !!nav && nav.platform === "MacIntel" && (nav.maxTouchPoints || 0) > 1;
export const isIos = nav => /iPad|iPhone|iPod/.test(ua(nav)) || touchMac(nav);
export const isIosSafari = nav => isIos(nav) && /Safari\//.test(ua(nav)) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua(nav));
export const isStandalone = (nav, matchMedia) => !!(nav && nav.standalone === true) || !!(matchMedia && matchMedia("(display-mode: standalone)").matches);
export const deviceName = nav => (/iPad/.test(ua(nav)) || touchMac(nav) ? "iPad" : "iPhone");

/** Fill and show the card, or leave it hidden; returns which, for the check. */
export function installCard({ host, nav = navigator, matchMedia = globalThis.matchMedia && globalThis.matchMedia.bind(globalThis), storage, doc = document }) {
  if (!isIosSafari(nav) || isStandalone(nav, matchMedia) || load(INSTALL_KEY, storage) === "no") { host.hidden = true; return "hidden"; }
  host.textContent = "";
  const h = doc.createElement("h2"); h.id = "installTitle"; h.textContent = INSTALL_TITLE(deviceName(nav));
  const ol = doc.createElement("ol");
  for (const s of INSTALL_STEPS) { const li = doc.createElement("li"); li.textContent = s; ol.append(li); }
  const p = doc.createElement("p"); p.textContent = INSTALL_NOTE;
  const b = doc.createElement("button"); b.type = "button"; b.className = "act"; b.textContent = NOT_NOW;
  b.addEventListener("click", () => { store(INSTALL_KEY, "no", storage); host.hidden = true; });
  host.append(h, ol, p, b);
  host.hidden = false;
  return "shown";
}
