import { test } from "node:test";
import assert from "node:assert/strict";
import { classify, shellFor, precacheAll, dropOldCaches, putTrimmed, withTimeout, handle, DATA_LIMIT, SEFARIA_LIMIT } from "../site/app/offline.js";
import { shellCache, DATA_CACHE, SEFARIA_CACHE, SEFARIA_ORIGIN } from "../site/app/contract.js";

const ORIGIN = "https://haftarah.centralreform.org";
class FakeCache {
  constructor() { this.map = new Map(); }
  async match(url) { const r = this.map.get(typeof url === "string" ? url : url.url); return r ? r.clone() : undefined; }
  async put(url, res) { const k = typeof url === "string" ? url : url.url; this.map.delete(k); this.map.set(k, res); }
  async keys() { return [...this.map.keys()].map(u => ({ url: u })); }
  async delete(url) { return this.map.delete(typeof url === "string" ? url : url.url); }
  async addAll(urls) { for (const u of urls) this.map.set(new URL(u, ORIGIN).href, new Response(`body of ${u}`)); }
}
class FakeCaches {
  constructor() { this.stores = new Map(); }
  async open(name) { if (!this.stores.has(name)) this.stores.set(name, new FakeCache()); return this.stores.get(name); }
  async keys() { return [...this.stores.keys()]; }
  async delete(name) { return this.stores.delete(name); }
  async has(name) { return this.stores.has(name); }
}
const PRE = ["/", "/sheet.html", "/library.html", "/404.html", "/web.css", "/lib.js", "/app/sheet.js", "/fonts/EzraSIL.ttf"];
const env = (caches, fetchImpl, extra = {}) => ({ caches, fetchImpl, build: "abc123def456", precache: new Set(PRE), origin: ORIGIN, timeoutMs: 50, ...extra });
const get = (path, mode = "cors") => ({ url: new URL(path, ORIGIN).href, method: "GET", mode });
const ok = (body, status = 200) => new Response(body, { status, headers: { "content-type": "application/json" } });
const offline = () => Promise.reject(new TypeError("Failed to fetch"));

test("classify: the shell by the precache list, week files, the index, PDFs, Sefaria, anything else", () => {
  const o = { origin: ORIGIN, precache: new Set(PRE) };
  assert.equal(classify(new URL("/lib.js", ORIGIN), o), "shell");
  assert.equal(classify(new URL("/", ORIGIN), o), "shell");
  assert.equal(classify(new URL("/data/weeks/2026-10-17-noach/sheet.json", ORIGIN), o), "week");
  assert.equal(classify(new URL("/data/weeks/2026-10-17-noach/words.json", ORIGIN), o), "week");
  assert.equal(classify(new URL("/data/index.json", ORIGIN), o), "index");
  assert.equal(classify(new URL("/data/weeks/2026-10-17-noach/sheet.pdf", ORIGIN), o), "pdf");
  assert.equal(classify(new URL(`${SEFARIA_ORIGIN}/api/texts/Isaiah.54.3`), o), "sefaria");
  assert.equal(classify(new URL("/2026-10-17-noach", ORIGIN), o), "other");
  assert.equal(classify(new URL("https://example.com/lib.js"), o), "other");
});

test("shellFor: a week slug gets the sheet, a library alias the library, the root the landing, the rest the 404 page", () => {
  assert.equal(shellFor("/2026-10-17-noach"), "/sheet.html");
  assert.equal(shellFor("/2026-10-17-Noach/"), "/sheet.html");
  assert.equal(shellFor("/noach"), "/library.html");
  assert.equal(shellFor("/5787/noach"), "/library.html");
  assert.equal(shellFor("/torah/genesis"), "/library.html");
  assert.equal(shellFor("/"), "/");
  assert.equal(shellFor("/index.html"), "/");
  assert.equal(shellFor("/nothing-here"), "/404.html");
});

test("precacheAll fills the build's shell cache and never skips waiting; dropOldCaches keeps the current shell and the data caches", async () => {
  const caches = new FakeCaches();
  await caches.open(shellCache("old111old111")); await caches.open(DATA_CACHE); await caches.open(SEFARIA_CACHE);
  const self = { skipWaiting() { throw new Error("skipWaiting must never be called"); } };
  await precacheAll({ caches, build: "abc123def456", precache: PRE, self });
  assert.deepEqual((await (await caches.open(shellCache("abc123def456"))).keys()).map(k => k.url), PRE.map(p => new URL(p, ORIGIN).href));
  await dropOldCaches({ caches, build: "abc123def456" });
  assert.deepEqual((await caches.keys()).sort(), [DATA_CACHE, SEFARIA_CACHE, shellCache("abc123def456")].sort());
});

test("putTrimmed keeps the newest N", async () => {
  const c = new FakeCache();
  for (let i = 1; i <= SEFARIA_LIMIT + 1; i++) await putTrimmed(c, `${SEFARIA_ORIGIN}/api/${i}`, ok(String(i)), SEFARIA_LIMIT);
  const keys = (await c.keys()).map(k => k.url);
  assert.equal(keys.length, SEFARIA_LIMIT);
  assert.equal(keys[0], `${SEFARIA_ORIGIN}/api/2`);
  assert.equal(keys.at(-1), `${SEFARIA_ORIGIN}/api/${SEFARIA_LIMIT + 1}`);
});

test("withTimeout rejects a slow promise and passes a fast one", async () => {
  assert.equal(await withTimeout(Promise.resolve(1), 50), 1);
  await assert.rejects(withTimeout(new Promise(() => {}), 10), /timed out after 10ms/);
});

test("handle: non-GET and PDFs and other origins are left to the browser", () => {
  const e = env(new FakeCaches(), () => ok("x"));
  assert.equal(handle({ ...get("/data/index.json"), method: "POST" }, e, () => {}), null);
  assert.equal(handle(get("/data/weeks/2026-10-17-noach/sheet.pdf"), e, () => {}), null);
  assert.equal(handle({ url: "https://example.com/x.js", method: "GET", mode: "cors" }, e, () => {}), null);
  assert.equal(handle(get("/not-precached.js"), e, () => {}), null);
});

test("handle: the shell is answered from the cache, and fetched into it on a miss", async () => {
  const caches = new FakeCaches();
  await precacheAll({ caches, build: "abc123def456", precache: PRE });
  let fetched = 0;
  const e = env(caches, () => { fetched++; return Promise.resolve(ok("fresh")); });
  assert.equal(await (await handle(get("/lib.js"), e, () => {})).text(), "body of /lib.js");
  assert.equal(fetched, 0);
  const shell = await caches.open(shellCache("abc123def456"));
  await shell.delete(new URL("/web.css", ORIGIN).href);
  assert.equal(await (await handle(get("/web.css"), e, () => {})).text(), "fresh");
  assert.equal(fetched, 1);
  assert.ok(await shell.match(new URL("/web.css", ORIGIN).href), "the miss was put back");
});

test("handle: a navigation to a known page is answered from the cached shell for the path", async () => {
  const caches = new FakeCaches();
  await precacheAll({ caches, build: "abc123def456", precache: PRE });
  const down = env(caches, offline);
  assert.equal(await (await handle(get("/2026-10-17-noach", "navigate"), down, () => {})).text(), "body of /sheet.html");
  assert.equal(await (await handle(get("/noach", "navigate"), down, () => {})).text(), "body of /library.html");
  assert.equal(await (await handle(get("/", "navigate"), down, () => {})).text(), "body of /");
  assert.equal(await (await handle(get("/nope", "navigate"), down, () => {})).text(), "body of /404.html");
  const slow = env(caches, () => new Promise(() => {}), { timeoutMs: 10 });
  assert.equal(await (await handle(get("/2026-10-17-noach", "navigate"), slow, () => {})).text(), "body of /sheet.html", "a hung network never delays a cached page");
  assert.equal(await (await handle(get("/nope", "navigate"), slow, () => {})).text(), "body of /404.html", "an unknown path falls back after the timeout");
  const empty = env(new FakeCaches(), offline);
  const r = await handle(get("/2026-10-17-noach", "navigate"), empty, () => {});
  assert.equal(r.type, "error", "no shell cached and no network: an error response, never a hang");
});

test("handle: a page load with the network up still gets the cached shell for this build", async () => {
  const caches = new FakeCaches();
  await precacheAll({ caches, build: "abc123def456", precache: PRE });
  let fetched = 0;
  const online = env(caches, () => { fetched++; return Promise.resolve(new Response("<html>new build</html>", { status: 200 })); });
  assert.equal(await (await handle(get("/2026-10-17-noach", "navigate"), online, () => {})).text(), "body of /sheet.html");
  assert.equal(await (await handle(get("/", "navigate"), online, () => {})).text(), "body of /");
  assert.equal(await (await handle(get("/5787/noach", "navigate"), online, () => {})).text(), "body of /library.html");
  assert.equal(fetched, 0, "the network is not asked while this build's shell is cached");
  const shell = await caches.open(shellCache("abc123def456"));
  await shell.delete(new URL("/sheet.html", ORIGIN).href);
  assert.equal(await (await handle(get("/2026-10-17-noach", "navigate"), online, () => {})).text(), "<html>new build</html>", "a cache miss goes to the network");
  assert.equal(fetched, 1);
  assert.equal(await shell.match(new URL("/sheet.html", ORIGIN).href), undefined, "the live page is not cached");
  assert.equal(await shell.match(new URL("/2026-10-17-noach", ORIGIN).href), undefined);
});

test("handle: a page load for an unknown path goes to the network and falls back to the cached 404 page", async () => {
  const caches = new FakeCaches();
  await precacheAll({ caches, build: "abc123def456", precache: PRE });
  let fetched = 0;
  const online = env(caches, () => { fetched++; return Promise.resolve(new Response("<html>server 404</html>", { status: 404 })); });
  const live = await handle(get("/nothing-here", "navigate"), online, () => {});
  assert.equal(await live.text(), "<html>server 404</html>");
  assert.equal(fetched, 1);
  const down = env(caches, offline);
  assert.equal(await (await handle(get("/nothing-here", "navigate"), down, () => {})).text(), "body of /404.html");
});

test("handle: a navigation under /data/ is left to the browser", async () => {
  const caches = new FakeCaches();
  await precacheAll({ caches, build: "abc123def456", precache: PRE });
  const down = env(caches, offline);
  assert.equal(handle(get("/data/weeks/2026-10-17-noach/sheet.pdf", "navigate"), down, () => {}), null);
  assert.equal(handle(get("/data/weeks/2026-10-17-noach/sheet-torah.pdf", "navigate"), down, () => {}), null);
});

test("handle: an uncached Sefaria answer waits for a slow network", async () => {
  const caches = new FakeCaches();
  const pending = [];
  const u = `${SEFARIA_ORIGIN}/api/texts/Isaiah.54.3`;
  const slow = env(caches, () => new Promise(res => setTimeout(() => res(ok("late answer")), 40)), { timeoutMs: 5 });
  const r = await handle({ url: u, method: "GET", mode: "cors" }, slow, p => pending.push(p));
  assert.equal(await r.text(), "late answer", "no timeout when nothing is cached");
  assert.ok(await (await caches.open(SEFARIA_CACHE)).match(u), "and it is cached");
  const e = await handle({ url: `${SEFARIA_ORIGIN}/api/texts/Never.1.1`, method: "GET", mode: "cors" }, env(caches, offline), () => {});
  assert.equal(e.type, "error", "only a failed fetch is an error");
});

test("handle: a slow refresh of a cached index still lands in the cache afterwards", async () => {
  const caches = new FakeCaches();
  const pending = [];
  const wait = p => pending.push(p);
  await handle(get("/data/index.json"), env(caches, () => Promise.resolve(ok('{"weeks":[1]}'))), wait);
  await Promise.all(pending);
  pending.length = 0;
  const slow = env(caches, () => new Promise(res => setTimeout(() => res(ok('{"weeks":[1,2]}')), 40)), { timeoutMs: 5 });
  assert.equal(await (await handle(get("/data/index.json"), slow, wait)).text(), '{"weeks":[1]}', "the cached copy, hastened by the timeout");
  assert.equal(pending.length, 1, "the live request is kept alive through waitUntil");
  await Promise.all(pending);
  const cached = await (await caches.open(DATA_CACHE)).match(new URL("/data/index.json", ORIGIN).href);
  assert.equal(await cached.text(), '{"weeks":[1,2]}', "the slow answer filled the cache");
});

test("handle: a week file is answered from the cache and refreshed behind it; the next request gets the new body", async () => {
  const caches = new FakeCaches();
  let body = "v1";
  const e = env(caches, () => Promise.resolve(ok(body)));
  const pending = [];
  const wait = p => pending.push(p);
  const url = "/data/weeks/2026-10-17-noach/sheet.json";
  assert.equal(await (await handle(get(url), e, wait)).text(), "v1", "a miss goes to the network");
  await Promise.all(pending);
  body = "v2";
  assert.equal(await (await handle(get(url), e, wait)).text(), "v1", "a hit is the cached body, served at once");
  await Promise.all(pending);
  assert.equal(await (await handle(get(url), e, wait)).text(), "v2", "the refresh landed for the next launch");
  const down = env(caches, offline);
  assert.equal(await (await handle(get(url), down, wait)).text(), "v2", "offline, the cache answers");
  await Promise.allSettled(pending);
  const r = await handle(get("/data/weeks/2020-01-01-never/sheet.json"), down, wait);
  assert.equal(r.type, "error", "an uncached week offline is an error response");
});

test("handle: the data cache is bounded; a failed refresh keeps the cached body", async () => {
  const caches = new FakeCaches();
  const e = env(caches, () => Promise.resolve(ok("x")));
  const pending = [];
  for (let i = 0; i < DATA_LIMIT + 5; i++) await handle(get(`/data/weeks/2026-01-0${i}-w/sheet.json`), e, p => pending.push(p));
  await Promise.all(pending);
  assert.equal((await (await caches.open(DATA_CACHE)).keys()).length, DATA_LIMIT);
  const bad = env(caches, () => Promise.resolve(ok("boom", 500)));
  const url = `/data/weeks/2026-01-0${DATA_LIMIT + 4}-w/sheet.json`;
  await handle(get(url), bad, p => pending.push(p));
  await Promise.allSettled(pending);
  assert.equal(await (await (await caches.open(DATA_CACHE)).match(new URL(url, ORIGIN).href)).text(), "x", "a 500 never replaces a good body");
});

test("handle: the index is network-first with a short timeout and a cached fallback", async () => {
  const caches = new FakeCaches();
  const pending = [];
  const wait = p => pending.push(p);
  const e = env(caches, () => Promise.resolve(ok('{"weeks":[1]}')));
  assert.equal(await (await handle(get("/data/index.json"), e, wait)).text(), '{"weeks":[1]}');
  await Promise.all(pending);
  const slow = env(caches, () => new Promise(() => {}), { timeoutMs: 10 });
  assert.equal(await (await handle(get("/data/index.json"), slow, wait)).text(), '{"weeks":[1]}', "slow network: the cached index");
  const r = await handle(get("/data/index.json"), env(new FakeCaches(), offline), wait);
  assert.equal(r.type, "error");
});

test("handle: a Sefaria answer is cached on view, bounded, and served when the network fails", async () => {
  const caches = new FakeCaches();
  const pending = [];
  const wait = p => pending.push(p);
  const e = env(caches, r => Promise.resolve(ok(`answer for ${r.url}`)));
  const u = `${SEFARIA_ORIGIN}/api/texts/Isaiah.54.3`;
  assert.equal(await (await handle({ url: u, method: "GET", mode: "cors" }, e, wait)).text(), `answer for ${u}`);
  await Promise.all(pending);
  assert.ok(await (await caches.open(SEFARIA_CACHE)).match(u));
  const down = env(caches, offline);
  assert.equal(await (await handle({ url: u, method: "GET", mode: "cors" }, down, wait)).text(), `answer for ${u}`);
  const r = await handle({ url: `${SEFARIA_ORIGIN}/api/texts/Never.1.1`, method: "GET", mode: "cors" }, down, wait);
  assert.equal(r.type, "error");
  assert.equal(handle({ url: u, method: "POST", mode: "cors" }, e, wait), null);
});
