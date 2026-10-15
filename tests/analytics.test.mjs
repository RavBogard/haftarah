import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { EVENTS, eventData, optedOut, createAnalytics } from "../site/app/analytics.js";
import CONFIG from "../site/app/analytics-config.js";

const UMAMI = { provider: "umami", websiteId: "00000000-0000-4000-8000-000000000000", endpoint: "https://cloud.umami.is/api/send" };
const loc = { hostname: "haftarah.centralreform.org", pathname: "/2026-10-17-noach", search: "?present", hash: "#haftarah-54-3" };
const nav = {};
function recorder() {
  const calls = [];
  return { calls, fetchImpl: async (url, init) => { calls.push({ url, init, body: JSON.parse(init.body) }); return new Response("{}"); } };
}

test("the shipped config sends nothing", () => {
  assert.equal(CONFIG.provider, "none");
  const r = recorder();
  const a = createAnalytics(CONFIG, { fetchImpl: r.fetchImpl, nav, loc });
  assert.equal(a.provider, "none");
  assert.equal(a.track("verse_view", { week: "w", verse: "haftarah-54-3" }), false);
  assert.equal(r.calls.length, 0);
});

test("only allow-listed events and properties leave the page; a looked-up word never does", () => {
  assert.deepEqual(Object.keys(EVENTS).sort(), ["install", "present_start", "source_open", "verse_view", "word_lookup"]);
  assert.deepEqual(eventData("word_lookup", { week: "2026-10-17-noach", word: "שָׁלוֹם", lemma: "x" }), { week: "2026-10-17-noach" });
  assert.deepEqual(eventData("source_open", { week: "w", source: "Rashi", ref: "Rashi on Isaiah 54:1", user: "u" }), { week: "w", source: "Rashi" });
  assert.deepEqual(eventData("install"), {});
  assert.equal(eventData("search", { q: "x" }), null);
  assert.equal(eventData("verse_view", { week: "w", verse: "x".repeat(300) }).verse.length, 120);
});

test("Umami: one POST per event, carrying the path only, no query and no fragment", async () => {
  const r = recorder();
  const a = createAnalytics(UMAMI, { fetchImpl: r.fetchImpl, nav, loc });
  assert.equal(a.provider, "umami");
  assert.equal(a.track("word_lookup", { week: "2026-10-17-noach", word: "x" }), true);
  assert.equal(r.calls.length, 1);
  assert.equal(r.calls[0].url, UMAMI.endpoint);
  assert.equal(r.calls[0].init.method, "POST");
  assert.deepEqual(r.calls[0].body, { type: "event", payload: { website: UMAMI.websiteId, hostname: "haftarah.centralreform.org", url: "/2026-10-17-noach", name: "word_lookup", data: { week: "2026-10-17-noach" } } });
  assert.ok(!r.calls[0].init.body.includes("?present") && !r.calls[0].init.body.includes("#haftarah"));
});

test("a verse view counts once per page view", () => {
  const r = recorder();
  const a = createAnalytics(UMAMI, { fetchImpl: r.fetchImpl, nav, loc });
  a.track("verse_view", { week: "w", verse: "haftarah-54-3" });
  a.track("verse_view", { week: "w", verse: "haftarah-54-3" });
  a.track("verse_view", { week: "w", verse: "haftarah-54-4" });
  assert.equal(r.calls.length, 2);
});

test("Do Not Track or Global Privacy Control turns counting off", () => {
  for (const n of [{ doNotTrack: "1" }, { globalPrivacyControl: true }]) {
    const r = recorder();
    const a = createAnalytics(UMAMI, { fetchImpl: r.fetchImpl, nav: n, loc });
    assert.equal(a.provider, "none");
    a.track("install", {});
    assert.equal(r.calls.length, 0);
    assert.equal(optedOut(n), true);
  }
  assert.equal(optedOut({}), false);
  assert.equal(optedOut(undefined), false);
});

test("a failing provider never breaks the page", () => {
  const a = createAnalytics(UMAMI, { fetchImpl: () => { throw new Error("offline"); }, nav, loc });
  assert.doesNotThrow(() => a.track("install", {}));
  const b = createAnalytics(UMAMI, { fetchImpl: () => Promise.reject(new Error("offline")), nav, loc });
  assert.doesNotThrow(() => b.track("install", {}));
});

test("the CSP lets the page reach exactly the configured provider", () => {
  const v = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));
  const csp = v.headers.flatMap(h => h.headers).find(x => x.key === "Content-Security-Policy").value;
  const connect = csp.split(";").map(s => s.trim()).find(s => s.startsWith("connect-src")).split(/\s+/).slice(1);
  assert.deepEqual(connect, ["'self'", "https://www.sefaria.org", ...(CONFIG.provider === "umami" ? [new URL(CONFIG.endpoint).origin] : [])]);
});
