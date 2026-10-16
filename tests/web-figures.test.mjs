// The web figures (site/app/figures.js): which files are fetched, which figures are built, the credit.
// No network: fetchImpl serves the repo's data/geo/basemap.json and data/chronology.json.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { hasFigures, figureCredit, renderFigures } from "../site/app/figures.js";
import { GEO_URLS } from "../site/app/contract.js";

const L = createRequire(import.meta.url)("../template/lib.js");
const read = p => JSON.parse(readFileSync(new URL(p, import.meta.url), "utf8"));
const week = read("./fixtures/week-figures/sheet.json");
const files = { [GEO_URLS.basemap]: read("../data/geo/basemap.json"), [GEO_URLS.chronology]: read("../data/chronology.json") };
const doc = { createElement: tag => ({ tagName: tag.toUpperCase(), className: "", innerHTML: "" }) };
function fetcher(status = 200) {
  const asked = [];
  const fetchImpl = async url => { asked.push(url); return { ok: status === 200, status, json: async () => files[url] }; };
  return { asked, fetchImpl };
}

test("hasFigures and figureCredit follow places and timeline", () => {
  assert.equal(hasFigures({}), false);
  assert.equal(hasFigures({ places: [], timeline: [] }), false);
  assert.equal(hasFigures({ places: week.places }), true);
  assert.equal(hasFigures({ timeline: week.timeline }), true);
  assert.equal(figureCredit({}), "");
  assert.match(figureCredit({ places: week.places }), /^Map: Natural Earth .*OpenBible/);
  assert.match(figureCredit({ timeline: week.timeline }), /^Dates rounded, after Galil \(1996\)/);
  assert.match(figureCredit(week), /OpenBible.*Galil/);
});

test("renderFigures: a week with both draws a labelled map and timeline, fetching each file once", async () => {
  const { asked, fetchImpl } = fetcher();
  const r = await renderFigures({ data: week, L, fetchImpl, doc });
  assert.deepEqual(asked.sort(), [GEO_URLS.basemap, GEO_URLS.chronology].sort());
  assert.equal(r.map.tagName, "FIGURE");
  assert.equal(r.map.className, "fig fig-map");
  assert.match(r.map.innerHTML, /^<svg [^>]*role="img" aria-labelledby="map-title map-desc" class="fig-svg map-svg"/);
  assert.match(r.map.innerHTML, /<desc id="map-desc">Map of /);
  assert.match(r.map.innerHTML, /<figcaption>Places in this reading/);
  assert.equal((r.map.innerHTML.match(/<circle class="place /g) || []).length, week.places.filter(p => p.role !== "empire").length);
  assert.equal(r.timeline.className, "fig fig-timeline");
  assert.match(r.timeline.innerHTML, /^<div class="fig-scroll" tabindex="0" role="region" aria-label="Timeline, scrolls sideways"><svg [^>]*aria-labelledby="timeline-title timeline-desc"[\s\S]*<\/svg><\/div><figcaption>/);
  assert.doesNotMatch(r.map.innerHTML, /fig-scroll/);
  assert.match(r.timeline.innerHTML, /<figcaption>Dates BCE/);
  assert.equal(r.credit, figureCredit(week));
});

test("renderFigures: a timeline-only week never fetches the basemap; a map-only week never fetches the chronology", async () => {
  const t = fetcher();
  const a = await renderFigures({ data: { timeline: week.timeline }, L, fetchImpl: t.fetchImpl, doc });
  assert.deepEqual(t.asked, [GEO_URLS.chronology]);
  assert.equal(a.map, null); assert.ok(a.timeline);
  assert.equal(a.credit, figureCredit({ timeline: week.timeline }));
  const m = fetcher();
  const b = await renderFigures({ data: { places: week.places, mapRegion: week.mapRegion }, L, fetchImpl: m.fetchImpl, doc });
  assert.deepEqual(m.asked, [GEO_URLS.basemap]);
  assert.ok(b.map); assert.equal(b.timeline, null);
});

test("renderFigures: nothing to draw builds no figure and credits nothing", async () => {
  // A place with no coordinate, an item with no date: figureText gives null, no empty <figure> is made.
  const r = await renderFigures({ data: { places: [{ id: "x", name: "Nowhere", role: "scene" }], timeline: [{ id: "y", label: "Undated", kind: "event" }] }, L, fetchImpl: fetcher().fetchImpl, doc });
  assert.equal(r.map, null);
  assert.equal(r.timeline, null);
  assert.equal(r.credit, "");
  assert.equal(r.dots, 0);
});

test("renderFigures reports the dots the map draws: a place beyond the basemap is not one of them", async () => {
  const tarshish = { id: "tarshish", name: "Tarshish", role: "scene", lat: 37.0, lon: -6.0, approved: true };
  const both = await renderFigures({ data: week, L, fetchImpl: fetcher().fetchImpl, doc });
  assert.equal(both.dots, (both.map.innerHTML.match(/<circle class="place /g) || []).length);
  const far = await renderFigures({ data: { places: [...week.places.filter(p => p.role !== "empire"), tarshish] }, L, fetchImpl: fetcher().fetchImpl, doc });
  const drawn = (far.map.innerHTML.match(/<circle class="place /g) || []).length;
  assert.equal(far.dots, drawn);
  assert.equal(drawn, 4, "the four Judean places, not Tarshish");
  assert.match(far.map.innerHTML, /Outside this map: Tarshish\./);
});

test("renderFigures: a failed fetch rejects with the address and status", async () => {
  await assert.rejects(renderFigures({ data: week, L, fetchImpl: fetcher(404).fetchImpl, doc }), /\/geo\/[a-z]+\.json: HTTP 404/);
});
