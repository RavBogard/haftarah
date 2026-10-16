// The offline app's logic (spec 5.10), pure: what the worker precaches, which cache answers which
// request, how a navigation is answered from this build's cached shell, and how the week
// files and Sefaria's answers are kept and bounded. sw.js is three listeners over these; the tests
// drive them with a fake cache storage. Requests arrive as plain records ({ url, method, mode }): a
// Request cannot be built with mode "navigate" outside a browser.
import { slugFromPath, shellCache, CACHE_PREFIX, DATA_CACHE, SEFARIA_CACHE, SEFARIA_ORIGIN } from "./contract.js";
import { isAliasPath } from "./parashot.js";

export const DATA_LIMIT = 60;          // week files and the index: about fifteen weeks at up to four files a week, plus the index
export const SEFARIA_LIMIT = 100;      // answers kept from Sefaria
export const NETWORK_TIMEOUT_MS = 3000;

/** Which cache, if any, a request belongs to. `precache` is the set of shell paths web-build wrote. */
export function classify(url, { origin, precache }) {
  const u = url instanceof URL ? url : new URL(url);
  if (u.origin === SEFARIA_ORIGIN) return "sefaria";
  if (u.origin !== origin) return "other";
  const p = u.pathname;
  if (p === "/data/index.json") return "index";
  if (/^\/data\/weeks\/[^/]+\/[^/]+\.json$/.test(p)) return "week";
  if (p.startsWith("/data/")) return "pdf";
  if (precache.has(p) || (p === "/index.html" && precache.has("/"))) return "shell";
  return "other";
}

/** The precached page that serves a navigation to `pathname` when the network cannot. */
export function shellFor(pathname) {
  const p = String(pathname || "/");
  if (p === "/" || p.toLowerCase() === "/index.html") return "/";
  if (slugFromPath(p)) return "/sheet.html";
  if (isAliasPath(p.toLowerCase())) return "/library.html";
  return "/404.html";
}

/** install: fill this build's shell cache. The worker then waits for the next launch: no skipWaiting. */
export async function precacheAll({ caches, build, precache }) {
  const cache = await caches.open(shellCache(build));
  await cache.addAll([...precache]);
}

/** activate: drop every other build's shell; the data and Sefaria caches are shared across builds and kept. */
export async function dropOldCaches({ caches, build }) {
  const keep = shellCache(build);
  for (const name of await caches.keys()) {
    if (name.startsWith(`${CACHE_PREFIX}shell-`) && name !== keep) await caches.delete(name);
  }
}

/**
 * Put a response and drop the oldest entries past `limit` (the Cache API lists keys in insertion order,
 * and a put replaces a matching entry by removing it and appending the new one, so a refresh moves to
 * the end). No delete first: that would leave a moment with no cached copy for a reader to miss.
 */
export async function putTrimmed(cache, url, response, limit) {
  await cache.put(url, response);
  const keys = await cache.keys();
  for (const k of keys.slice(0, Math.max(0, keys.length - limit))) await cache.delete(k);
}

export function withTimeout(promise, ms) {
  let timer;
  const clock = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms); });
  return Promise.race([promise, clock]).finally(() => clearTimeout(timer));
}

const good = r => r && r.ok;

/**
 * The fetch handler: null when the browser should handle the request itself, else a promise of the
 * response. `waitUntil` receives the background work (a refresh, a put) so the worker stays alive for it.
 */
export function handle(req, env, waitUntil) {
  if (req.method !== "GET") return null;
  const url = new URL(req.url);
  const timeoutMs = env.timeoutMs ?? NETWORK_TIMEOUT_MS;
  if (req.mode === "navigate") return url.pathname.startsWith("/data/") ? null : navigate(url, req, env, timeoutMs);
  const kind = classify(url, env);
  if (kind === "shell") return cacheFirst(shellCache(env.build), req, env, waitUntil);
  if (kind === "week") return staleWhileRevalidate(req, env, waitUntil);
  if (kind === "index") return networkFirst(DATA_CACHE, req, env, timeoutMs, waitUntil, DATA_LIMIT);
  if (kind === "sefaria") return networkFirst(SEFARIA_CACHE, req, env, timeoutMs, waitUntil, SEFARIA_LIMIT);
  return null;
}

/**
 * A navigation (one under /data/, a PDF download, is left to the browser before this). A page this
 * build knows (the landing, a week, a library alias) is answered from this build's shell cache, so an
 * open tab that reloads after a deploy keeps the old build whole, its HTML with its own scripts and
 * styles, until the next launch; the network is asked only when that cache misses, and its answer is
 * not cached. An unknown path goes to the network first (bounded by the timeout), then the cached
 * 404 page.
 */
async function navigate(url, req, env, ms) {
  const shellPath = shellFor(url.pathname);
  const cache = await env.caches.open(shellCache(env.build));
  const cached = () => cache.match(new URL(shellPath, env.origin).href);
  if (shellPath !== "/404.html") {
    const hit = await cached();
    if (hit) return hit;
    try { return await env.fetchImpl(req); } catch { return Response.error(); }
  }
  try { const live = await withTimeout(env.fetchImpl(req), ms); if (live) return live; } catch {}
  return (await cached()) || Response.error();
}

async function cacheFirst(name, req, env, waitUntil) {
  const cache = await env.caches.open(name);
  const hit = await cache.match(req.url);
  if (hit) return hit;
  const live = await env.fetchImpl(req);
  if (good(live)) waitUntil(cache.put(req.url, live.clone()));
  return live;
}

async function staleWhileRevalidate(req, env, waitUntil) {
  const cache = await env.caches.open(DATA_CACHE);
  const hit = await cache.match(req.url);
  const refresh = () => env.fetchImpl(req).then(live => good(live) ? putTrimmed(cache, req.url, live.clone(), DATA_LIMIT).then(() => live, () => live) : live);
  if (hit) { waitUntil(refresh().catch(() => {})); return hit; }
  try { return await refresh(); } catch { return Response.error(); }
}

/**
 * The index and Sefaria: the network first. With a copy cached, the timeout only hastens it: a slow
 * network gets the cached copy while the live request finishes behind it (through waitUntil) and fills
 * the cache when it is good. With nothing cached, the network is waited for however long it takes, and
 * only a failed fetch is an error response. A cache write that fails (quota, a closed store) never
 * costs the reader the answer in hand: the put's rejection is swallowed and the live response returned.
 */
async function networkFirst(name, req, env, ms, waitUntil, limit) {
  const cache = await env.caches.open(name);
  const hit = await cache.match(req.url);
  const live = Promise.resolve(env.fetchImpl(req)).then(r => good(r) ? putTrimmed(cache, req.url, r.clone(), limit).then(() => r, () => r) : r);
  if (!hit) { try { return await live; } catch { return Response.error(); } }
  waitUntil(live.catch(() => {}));
  try { const r = await withTimeout(live, ms); if (good(r)) return r; } catch {}
  return hit;
}
