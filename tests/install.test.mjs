import { test } from "node:test";
import assert from "node:assert/strict";
import { isIosSafari, isStandalone, deviceName, installCard, INSTALL_KEY, INSTALL_TITLE, INSTALL_STEPS, INSTALL_NOTE, NOT_NOW } from "../site/app/install.js";

const IPHONE = { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1" };
const MAC_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";
const IPAD = { userAgent: MAC_UA, platform: "MacIntel", maxTouchPoints: 5 };
const MAC = { userAgent: MAC_UA, platform: "MacIntel", maxTouchPoints: 0 };
const IOS_CHROME = { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0 Mobile/15E148 Safari/604.1" };
const IOS_FIREFOX = { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/120.0 Mobile/15E148 Safari/605.1.15" };
const ANDROID = { userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36" };
const DESKTOP_CHROME = { userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36", platform: "Win32", maxTouchPoints: 0 };

test("isIosSafari: iPhone and iPad Safari yes; Mac, iOS Chrome and Firefox, Android, desktop Chrome no", () => {
  assert.equal(isIosSafari(IPHONE), true);
  assert.equal(isIosSafari(IPAD), true);
  assert.equal(isIosSafari(MAC), false);
  assert.equal(isIosSafari(IOS_CHROME), false);
  assert.equal(isIosSafari(IOS_FIREFOX), false);
  assert.equal(isIosSafari(ANDROID), false);
  assert.equal(isIosSafari(DESKTOP_CHROME), false);
});

test("isStandalone: nav.standalone or the display-mode media query", () => {
  assert.equal(isStandalone({ standalone: true }, null), true);
  assert.equal(isStandalone({}, q => ({ matches: q === "(display-mode: standalone)" })), true);
  assert.equal(isStandalone({ standalone: false }, () => ({ matches: false })), false);
  assert.equal(isStandalone({}, undefined), false);
});

test("deviceName: iPad for the iPad cases, iPhone otherwise", () => {
  assert.equal(deviceName(IPAD), "iPad");
  assert.equal(deviceName({ userAgent: "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) Version/17.0 Safari/604.1" }), "iPad");
  assert.equal(deviceName(IPHONE), "iPhone");
});

// A tiny element fake: enough for installCard's node-by-node build.
function fakeDoc() {
  const make = tag => {
    const e = { tag, hidden: false, textContent: "", id: "", type: "", className: "", children: [], listeners: {} };
    e.append = (...kids) => { e.children.push(...kids); };
    e.addEventListener = (t, fn) => { e.listeners[t] = fn; };
    e.click = () => e.listeners.click();
    return e;
  };
  return { createElement: make, make };
}
const memory = (init = {}) => { const m = new Map(Object.entries(init)); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v), removeItem: k => m.delete(k), m }; };
const noMedia = () => ({ matches: false });

test("installCard stays hidden off iOS Safari, in standalone, and after Not now was chosen", () => {
  const doc = fakeDoc();
  for (const [nav, mm, storage] of [
    [DESKTOP_CHROME, noMedia, memory()],
    [IOS_CHROME, noMedia, memory()],
    [{ ...IPHONE, standalone: true }, noMedia, memory()],
    [IPHONE, () => ({ matches: true }), memory()],
    [IPHONE, noMedia, memory({ [`haftarah:v1:${INSTALL_KEY}`]: "no" })],
  ]) {
    const host = doc.make("section");
    assert.equal(installCard({ host, nav, matchMedia: mm, storage, doc }), "hidden");
    assert.equal(host.hidden, true);
    assert.equal(host.children.length, 0);
  }
});

test("installCard shows the title, the two steps and the note, and Not now stores no and hides it", () => {
  const doc = fakeDoc(), host = doc.make("section"), storage = memory();
  host.hidden = true;
  assert.equal(installCard({ host, nav: IPAD, matchMedia: noMedia, storage, doc }), "shown");
  assert.equal(host.hidden, false);
  const [h, ol, p, b] = host.children;
  assert.equal(h.tag, "h2"); assert.equal(h.id, "installTitle"); assert.equal(h.textContent, INSTALL_TITLE("iPad"));
  assert.deepEqual(ol.children.map(li => li.textContent), INSTALL_STEPS);
  assert.equal(p.textContent, INSTALL_NOTE);
  assert.equal(b.type, "button"); assert.equal(b.textContent, NOT_NOW);
  b.click();
  assert.equal(host.hidden, true);
  assert.equal(storage.m.get(`haftarah:v1:${INSTALL_KEY}`), "no");
  const again = doc.make("section");
  assert.equal(installCard({ host: again, nav: IPAD, matchMedia: noMedia, storage, doc }), "hidden");
});

test("the strings are the approved ones", () => {
  assert.equal(INSTALL_TITLE("iPhone"), "Keep these sheets on this iPhone");
  assert.deepEqual(INSTALL_STEPS, ["Tap Share (the square with an arrow).", "Tap Add to Home Screen."]);
  assert.equal(INSTALL_NOTE, "Sheets you have opened stay readable without a connection, and your marks are kept.");
  assert.equal(NOT_NOW, "Not now");
});
