import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { SLUG, isSlug, weekPath, dataUrl, indexUrl, INDEX_PATH, slugFromPath, VERCEL_WEEK_SOURCE, verseAnchor, parseVerseAnchor } from "../site/app/contract.js";
import { aliasRewrites } from "../site/app/parashot.js";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

test("a week slug is a date and a parashah, lowercase", () => {
  for (const s of ["2026-10-17-noach", "2026-10-10-bereshit-machar-chodesh", "2027-03-06-vayakhel-pekudei"]) assert.ok(isSlug(s), s);
  for (const s of ["noach", "2026-10-17", "2026-10-17-Noach", "2026-10-17-noach/", "../2026-10-17-noach", "", null]) assert.equal(isSlug(s), false, String(s));
  assert.ok(SLUG.test("2026-10-17-noach"));
});

test("paths: the Blob pathname, the same-origin data URL, the index", () => {
  assert.equal(weekPath("2026-10-17-noach", "sheet.json"), "weeks/2026-10-17-noach/sheet.json");
  assert.equal(dataUrl("2026-10-17-noach", "sheet.pdf"), "/data/weeks/2026-10-17-noach/sheet.pdf");
  assert.equal(INDEX_PATH, "index.json");
  assert.equal(indexUrl(), "/data/index.json");
});

test("slugFromPath normalizes case and one trailing slash", () => {
  assert.equal(slugFromPath("/2026-10-17-noach"), "2026-10-17-noach");
  assert.equal(slugFromPath("/2026-10-17-Noach/"), "2026-10-17-noach");
  assert.equal(slugFromPath("/"), null);
  assert.equal(slugFromPath("/sheet.html"), null);
  assert.equal(slugFromPath("/2026-10-17-noach/extra"), null);
});

test("vercel.json routes exactly the contract's slug to the week page", () => {
  const v = JSON.parse(readFileSync(join(ROOT, "vercel.json"), "utf8"));
  const week = v.rewrites.find(r => r.destination === "/sheet.html");
  assert.equal(week.source, VERCEL_WEEK_SOURCE);
});

test("no other script or page module keeps its own copy of the slug pattern", () => {
  const files = [["scripts"], ["site", "app"]].flatMap(d => readdirSync(join(ROOT, ...d)).map(f => join(ROOT, ...d, f)))
    .filter(f => /\.(mjs|js)$/.test(f) && !f.endsWith("contract.js"));
  assert.deepEqual(files.filter(f => readFileSync(f, "utf8").includes("d{4}-")), []);
});

test("verse anchors: <reading>-<chapter>-<verse>, and the first release's v<chapter>-<verse>", () => {
  assert.equal(verseAnchor("haftarah", 54, 3), "haftarah-54-3");
  assert.deepEqual(parseVerseAnchor("#haftarah-54-3"), { reading: "haftarah", chapter: 54, verse: 3 });
  assert.deepEqual(parseVerseAnchor("torah-6-9"), { reading: "torah", chapter: 6, verse: 9 });
  assert.deepEqual(parseVerseAnchor("#v20-18"), { reading: null, chapter: 20, verse: 18 });
  for (const h of ["", "#", "#top", "#haftarah-54", "#haftarah-x-3", "#m=54-3", "#Haftarah-54-3", "#v-1-2", null]) assert.equal(parseVerseAnchor(h), null, String(h));
});

test("vercel.json routes exactly parashot.js's allow-list to library.html, after the week route", () => {
  const v = JSON.parse(readFileSync(join(ROOT, "vercel.json"), "utf8"));
  assert.deepEqual(v.rewrites.filter(r => r.destination === "/library.html"), aliasRewrites());
  const week = v.rewrites.findIndex(r => r.destination === "/sheet.html");
  const first = v.rewrites.findIndex(r => r.destination === "/library.html");
  assert.ok(week >= 0 && first > week);
});

import { SIDE_FILES } from "../site/app/contract.js";
test("SIDE_FILES names the three side files", () => {
  assert.deepEqual(SIDE_FILES, { words: "words.json", translations: "translations.json", links: "links.json" });
});

import { GEO_URLS } from "../site/app/contract.js";
test("GEO_URLS: the basemap and the chronology, served under /geo/ (web-build copies them)", () => {
  assert.deepEqual(Object.keys(GEO_URLS).sort(), ["basemap", "chronology"]);
  for (const u of Object.values(GEO_URLS)) assert.match(u, /^\/geo\/[a-z]+\.json$/);
});
