import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { registerOffline, loadFailure, warmWeek, holdUntil, held, waitForControl, UPDATE_TEXT, OFFLINE_LOAD_TEXT } from "../site/app/offline-client.js";
import { SW_URL, dataUrl } from "../site/app/contract.js";

// A navigator whose register resolves to `reg`; the listeners the page adds are kept so a test can fire them.
function fakeNav({ reg, controller = null, reject = false } = {}) {
  const calls = [];
  const nav = { serviceWorker: { controller, register: async (...args) => { calls.push(args); if (reject) throw new Error("SecurityError"); return reg; } } };
  return { nav, calls };
}
function fakeReg({ waiting = null, installing = null } = {}) {
  const listeners = {};
  return { waiting, installing, listeners, addEventListener: (type, fn) => { (listeners[type] ||= []).push(fn); } };
}
function fakeWorker(state = "installing") {
  const listeners = {};
  return { state, listeners, addEventListener: (type, fn) => { (listeners[type] ||= []).push(fn); } };
}

test("registerOffline: returns the registration and says nothing when no worker waits", async () => {
  const reg = fakeReg();
  const { nav, calls } = fakeNav({ reg, controller: {} });
  let told = 0;
  assert.equal(await registerOffline({ nav, onUpdate: () => told++ }), reg);
  assert.equal(told, 0);
  assert.deepEqual(calls, [[SW_URL, { type: "module", updateViaCache: "none" }]]);
});

test("registerOffline: a waiting worker on a first install (no controller) is not an update", async () => {
  const reg = fakeReg({ waiting: fakeWorker("installed") });
  const { nav } = fakeNav({ reg, controller: null });
  let told = 0;
  await registerOffline({ nav, onUpdate: () => told++ });
  assert.equal(told, 0);
});

test("registerOffline: a waiting worker while one controls the page is told once, with the registration", async () => {
  const reg = fakeReg({ waiting: fakeWorker("installed") });
  const { nav } = fakeNav({ reg, controller: {} });
  const got = [];
  await registerOffline({ nav, onUpdate: r => got.push(r) });
  assert.deepEqual(got, [reg]);
  // A later install reaching "installed" does not tell again.
  const w = fakeWorker(); reg.installing = w;
  reg.listeners.updatefound.forEach(f => f());
  w.state = "installed"; w.listeners.statechange.forEach(f => f());
  assert.equal(got.length, 1);
});

test("registerOffline: an update found later is told once its worker is installed, while a controller exists", async () => {
  const reg = fakeReg();
  const { nav } = fakeNav({ reg, controller: {} });
  let told = 0;
  await registerOffline({ nav, onUpdate: () => told++ });
  assert.equal(told, 0);
  const w = fakeWorker(); reg.installing = w;
  reg.listeners.updatefound.forEach(f => f());
  w.listeners.statechange.forEach(f => f());   // still installing
  assert.equal(told, 0);
  w.state = "installed"; reg.waiting = w; reg.installing = null;
  w.listeners.statechange.forEach(f => f());
  assert.equal(told, 1);
});

test("registerOffline: the first install's own worker reaching installed (no controller) is not an update", async () => {
  const reg = fakeReg();
  const { nav } = fakeNav({ reg, controller: null });
  let told = 0;
  await registerOffline({ nav, onUpdate: () => told++ });
  const w = fakeWorker(); reg.installing = w;
  reg.listeners.updatefound.forEach(f => f());
  w.state = "installed"; reg.waiting = w;
  w.listeners.statechange.forEach(f => f());
  assert.equal(told, 0);
});

test("registerOffline: no service worker support, or a register that rejects, is null and throws nothing", async () => {
  assert.equal(await registerOffline({ nav: {} }), null);
  assert.equal(await registerOffline({ nav: null }), null);
  const { nav } = fakeNav({ reg: fakeReg(), reject: true });
  assert.equal(await registerOffline({ nav, onUpdate: () => { throw new Error("must not be told"); } }), null);
});

test("the strings are the brief's", () => {
  assert.equal(UPDATE_TEXT, "This site has been updated. The new version opens the next time you launch it.");
  assert.equal(OFFLINE_LOAD_TEXT, "You’re offline, and this sheet isn’t saved on this device yet.");
});

test("loadFailure: offline is its own sentence with All sheets; online is the Drive sentence", () => {
  assert.equal(loadFailure({ online: false, drive: "https://drive.example/x" }), `${OFFLINE_LOAD_TEXT} <a href="/">All sheets</a>`);
  assert.equal(loadFailure({ online: true, drive: "https://drive.example/x" }), `This sheet could not be loaded. The printed sheets are on <a href="https://drive.example/x">Google Drive</a>.`);
});

test("warmWeek: fetches the week's sheet.json once a worker controls the page", async () => {
  const urls = [];
  const fetchImpl = async u => { urls.push(u); return { ok: true }; };
  assert.equal(await warmWeek("2026-10-17-noach", { nav: { serviceWorker: { controller: {} } }, fetchImpl }), "2026-10-17-noach");
  assert.deepEqual(urls, [dataUrl("2026-10-17-noach", "sheet.json")]);
});

test("warmWeek: no controller, no slug or a failed fetch is skipped", async () => {
  const urls = [];
  const fetchImpl = async u => { urls.push(u); return { ok: true }; };
  assert.equal(await warmWeek("2026-10-17-noach", { nav: { serviceWorker: { controller: null } }, fetchImpl }), "skipped");
  assert.equal(await warmWeek("2026-10-17-noach", { nav: {}, fetchImpl }), "skipped");
  assert.equal(await warmWeek(null, { nav: { serviceWorker: { controller: {} } }, fetchImpl }), "skipped");
  assert.deepEqual(urls, []);
  const offline = () => Promise.reject(new TypeError("Failed to fetch"));
  assert.equal(await warmWeek("2026-10-17-noach", { nav: { serviceWorker: { controller: {} } }, fetchImpl: offline }), "skipped");
});

test("check mode: holdUntil makes one small request to the worker script per round until done, or gives up", async () => {
  const urls = [];
  let n = 0;
  assert.equal(await holdUntil(() => n >= 3, { fetchImpl: async u => { urls.push(u); n++; } }), true);
  assert.deepEqual(urls, [`${SW_URL}?wait=0`, `${SW_URL}?wait=1`, `${SW_URL}?wait=2`]);
  assert.equal(await holdUntil(() => false, { fetchImpl: async () => { throw new TypeError("offline"); }, tries: 4 }), false);
});

test("check mode: held resolves to the promise's value with requests in flight meanwhile", async () => {
  let release, rounds = 0;
  const p = new Promise(r => { release = r; });
  const fetchImpl = async () => { if (++rounds === 5) release(42); };
  assert.equal(await held(p, { fetchImpl }), 42);
  assert.ok(rounds >= 5);
  let extra = 0;
  assert.equal(await held(Promise.resolve("now"), { fetchImpl: async () => { extra++; } }), "now");
  assert.equal(extra, 0, "a settled promise needs no request");
});

test("check mode: waitForControl waits for ready and then a controller", async () => {
  const sw = { ready: Promise.resolve({}), controller: null };
  const reg = { installing: {}, waiting: null, active: null };
  let rounds = 0;
  const fetchImpl = async () => { if (++rounds === 3) { reg.installing = null; reg.active = {}; sw.controller = {}; } };
  assert.equal(await waitForControl({ nav: { serviceWorker: sw }, reg, fetchImpl }), "active");
  assert.equal(rounds, 3);
  assert.equal(await waitForControl({ nav: {}, fetchImpl }), "none");
  const never = { ready: new Promise(() => {}), controller: {} };
  let spent = 0;
  assert.equal(await waitForControl({ nav: { serviceWorker: never }, reg: { installing: {} }, fetchImpl: async () => { spent++; }, tries: 5 }), "uncontrolled");
  assert.equal(spent, 5);
});

test("check mode: waitForControl stops at a failed install (the registration left with no worker)", async () => {
  const reg = { installing: {}, waiting: null, active: null };
  let rounds = 0;
  const fetchImpl = async () => { if (++rounds === 2) reg.installing = null; };   // the installing worker went redundant
  assert.equal(await waitForControl({ nav: { serviceWorker: { ready: new Promise(() => {}), controller: null } }, reg, fetchImpl }), "failed");
  assert.equal(rounds, 2);
});

test("no code calls skipWaiting: a new build waits for the next launch", async () => {
  for (const f of ["../site/sw.js", "../site/app/offline.js", "../site/app/offline-client.js"]) {
    const src = await readFile(new URL(f, import.meta.url), "utf8");
    // The comments say "no skipWaiting"; a call or a property access is what must never appear.
    assert.doesNotMatch(src, /skipWaiting\s*\(|\.skipWaiting\b|\[\s*["'`]skipWaiting/, f);
  }
});
