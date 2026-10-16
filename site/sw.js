// The offline app's service worker (spec 5.10): three listeners over site/app/offline.js. web-build
// writes the build hash and the precache list below, so the shell cache's name changes exactly when a
// shipped file does. A new build installs, precaches and waits: it is used on the next launch, never
// mid-session or mid-presentation (no skipWaiting).
import { precacheAll, dropOldCaches, handle } from "./app/offline.js";

const BUILD = "dev";
const PRECACHE = /*precache*/[];

const env = { caches: self.caches, fetchImpl: r => fetch(r.request), build: BUILD, precache: new Set(PRECACHE), origin: self.location.origin };

self.addEventListener("install", e => e.waitUntil(precacheAll(env)));
self.addEventListener("activate", e => e.waitUntil(dropOldCaches(env).then(() => self.clients.claim())));
self.addEventListener("fetch", e => {
  const req = { url: e.request.url, method: e.request.method, mode: e.request.mode, request: e.request };
  const p = handle(req, env, x => e.waitUntil(x));
  if (p) e.respondWith(p);
});
