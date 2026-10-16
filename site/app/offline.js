// The offline app's logic (spec 5.10), pure: what the worker precaches, which cache answers which
// request, how a navigation falls back to a cached shell when the network is away, and how the week
// files and Sefaria's answers are kept and bounded. sw.js is three listeners over these; the tests
// drive them with a fake cache storage. Requests arrive as plain records ({ url, method, mode }): a
// Request cannot be built with mode "navigate" outside a browser.
import { slugFromPath, shellCache, CACHE_PREFIX, DATA_CACHE, SEFARIA_CACHE, SEFARIA_ORIGIN } from "./contract.js";
import { isAliasPath } from "./parashot.js";

export const DATA_LIMIT = 60;          // week files and the index: about a year of weeks with their side files
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

/** Put a response and drop the oldest entries past `limit` (the Cache API lists keys in insertion order). */
export async function putTrimmed(cache, url, response, limit) {
  await cache.delete(url);   // re-putting moves it to the end
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
  if (req.mode === "navigate") return navigate(url, req, env, timeoutMs);
  const kind = classify(url, env);
  if (kind === "shell") return cacheFirst(shellCache(env.build), req, env, waitUntil);
  if (kind === "week") return staleWhileRevalidate(req, env, waitUntil);
  if (kind === "index") return networkFirst(DATA_CACHE, req, env, timeoutMs, waitUntil, DATA_LIMIT);
  if (kind === "sefaria") return networkFirst(SEFARIA_CACHE, req, env, timeoutMs, waitUntil, SEFARIA_LIMIT);
  return null;
}

/** A navigation: the network first (bounded by the timeout), else the cached shell for the path, else an error response. */
async function navigate(url, req, env, ms) {
  try { const live = await withTimeout(env.fetchImpl(req), ms); if (good(live)) return live; } catch {}
  const shell = await (await env.caches.open(shellCache(env.build))).match(new URL(shellFor(url.pathname), env.origin).href);
  return shell || Response.error();
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
  const refresh = () => env.fetchImpl(req).then(live => good(live) ? putTrimmed(cache, req.url, live.clone(), DATA_LIMIT).then(() => live) : live);
  if (hit) { waitUntil(refresh().catch(() => {})); return hit; }
  try { return await refresh(); } catch { return Response.error(); }
}

async function networkFirst(name, req, env, ms, waitUntil, limit) {
  const cache = await env.caches.open(name);
  try {
    const live = await withTimeout(env.fetchImpl(req), ms);
    if (good(live)) { waitUntil(putTrimmed(cache, req.url, live.clone(), limit)); return live; }
  } catch {}
  return (await cache.match(req.url)) || Response.error();
}
