import { test } from "node:test";
import assert from "node:assert/strict";
import { simplify, clipLine, clipPolygon, buildBasemap, buildGazetteer, normalizeName, lookupPlaces, resolvePlace, bestSite, NE_SHA, OB_SHA } from "../scripts/geo.mjs";
import { makeGeodata } from "../tools/make-geodata.mjs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("simplify keeps the ends and drops points within the tolerance; a ring stays closed", () => {
  assert.deepEqual(simplify([[0, 0], [1, 0.001], [2, 0]], 0.01), [[0, 0], [2, 0]]);
  assert.deepEqual(simplify([[0, 0], [1, 1], [2, 0]], 0.01), [[0, 0], [1, 1], [2, 0]]);
  const ring = [[0, 0], [1, 0.0001], [2, 0], [2, 2], [0, 2], [0, 0]];
  const out = simplify(ring, 0.01);
  assert.deepEqual(out[0], out[out.length - 1]);
  assert.equal(out.length, 5);
});

test("clipLine cuts a line at the box edge and splits it into runs", () => {
  const runs = clipLine([[-1, 5], [1, 5], [3, 5], [11, 5], [12, 5], [5, 6]], [0, 0, 10, 10]);
  assert.equal(runs.length, 2);
  assert.deepEqual(runs[0][0], [0, 5]);           // interpolated onto the west edge
  assert.deepEqual(runs[0][runs[0].length - 1], [10, 5]);
  assert.deepEqual(runs[1][0], [10, 5 + (6 - 5) * (12 - 10) / (12 - 5)]);
});

test("clipPolygon keeps the part of a ring inside the box, closed, and returns null when nothing is inside", () => {
  const sq = clipPolygon([[-5, -5], [5, -5], [5, 5], [-5, 5], [-5, -5]], [0, 0, 10, 10]);
  assert.deepEqual(sq, [[0, 0], [5, 0], [5, 5], [0, 5], [0, 0]]);
  assert.equal(clipPolygon([[20, 20], [21, 20], [21, 21], [20, 20]], [0, 0, 10, 10]), null);
});

const feature = (geometry, properties = {}) => ({ type: "Feature", properties, geometry });
const fc = features => ({ type: "FeatureCollection", features });

test("buildBasemap keeps land rings, named lakes that are not reservoirs, and rivers at scalerank 6 or less that are not canals or branches", () => {
  const land = fc([feature({ type: "Polygon", coordinates: [[[30, 30], [40, 30], [40, 35], [30, 35], [30, 30]]] }, { featurecla: "Land" }),
    feature({ type: "Polygon", coordinates: [[[100, 0], [101, 0], [101, 1], [100, 0]]] }, { featurecla: "Land" })]);
  const lakes = fc([feature({ type: "Polygon", coordinates: [[[35.4, 31.2], [35.6, 31.2], [35.6, 31.7], [35.4, 31.7], [35.4, 31.2]]] }, { featurecla: "Alkaline Lake", name: "Dead Sea", scalerank: 3 }),
    feature({ type: "Polygon", coordinates: [[[32, 23], [33, 23], [33, 24], [32, 24], [32, 23]]] }, { featurecla: "Reservoir", name: "Lake Nasser", scalerank: 5 })]);
  const rivers = fc([feature({ type: "LineString", coordinates: [[35.6, 33.2], [35.55, 32.5], [35.5, 31.8]] }, { featurecla: "River", name: "Jordan", scalerank: 6 }),
    feature({ type: "LineString", coordinates: [[32.3, 30], [32.5, 31]] }, { featurecla: "River", name: "Suez Canal", scalerank: 6 }),
    feature({ type: "LineString", coordinates: [[31, 30], [31.5, 31]] }, { featurecla: "River", name: "Rosetta Branch", scalerank: 1 }),
    feature({ type: "LineString", coordinates: [[36, 37], [36.5, 38]] }, { featurecla: "River", name: "Ceyhan", scalerank: 9 })]);
  const b = buildBasemap({ land, rivers, lakes });
  assert.equal(b.land.length, 1);
  assert.deepEqual(b.lakes.map(l => l.name), ["Dead Sea"]);
  assert.deepEqual(b.rivers.map(r => r.name), ["Jordan"]);
  assert.equal(b.source.naturalEarth.commit.length, 40);
  assert.ok(b.land[0].every(([x, y]) => Number.isInteger(x * 1000) && Number.isInteger(y * 1000)), "three decimals");
});

const rec = (friendly, slug, names, idents, verses = 3) => JSON.stringify({ friendly_id: friendly, url_slug: slug, id: "a" + slug, types: ["settlement"],
  translation_name_counts: Object.fromEntries(names.map(n => [n, 1])), verses: Array.from({ length: verses }, (_, i) => ({ osis: `Gen.1.${i + 1}` })),
  identifications: idents.map(([votes, lonlat, desc]) => ({ class: lonlat ? "human" : "special", description: desc, score: { vote_total: votes },
    resolutions: lonlat ? [{ lonlat, lonlat_type: "point" }] : [] })) });

test("buildGazetteer: sites by votes, status ok only with a clear best at 500 or more, candidates otherwise, none without a coordinate", () => {
  const text = [
    rec("Gibeah 1", "gibeah-1", ["Geba", "Gibeah"], [[822, "35.230718,31.823113", "Tel el Ful"], [60, "35.261111,31.857500", "another name for <ancient id=\"x\">Geba 1</ancient>"]], 45),
    rec("Nob", "nob", ["Nob"], [[162, "35.244167,31.792500", "Ras el Mesharif"], [152, "35.242628,31.794892", "Ras Umm et Tala"]], 7),
    rec("Ezel", "ezel", ["Ezel"], [[121, null, "not a proper name (stone heap)"], [30, "35.230718,31.823113", "within 1 km of Gibeah 1"]], 2),
    rec("Bethlehem 1", "bethlehem-1", ["Beth-lehem", "Bethlehem"], [[500, "35.207639,31.704306", "Bethlehem"]], 52),
  ].join("\n") + "\n";
  const g = buildGazetteer(text);
  assert.equal(g.places.length, 4);
  const gib = g.places.find(p => p.slug === "gibeah-1");
  assert.deepEqual(gib, { slug: "gibeah-1", name: "Gibeah 1", aliases: ["Geba", "Gibeah"], types: ["settlement"], verses: 45,
    sites: [{ lon: 35.231, lat: 31.823, votes: 822, where: "Tel el Ful" }, { lon: 35.261, lat: 31.858, votes: 60, where: "another name for Geba 1" }], status: "ok" });
  assert.equal(g.places.find(p => p.slug === "nob").status, "candidates");
  assert.equal(g.places.find(p => p.slug === "ezel").status, "none");
  assert.equal(g.places.find(p => p.slug === "ezel").sites.length, 1, "a low-vote site is kept for the listing, never resolved");
  assert.equal(g.places.find(p => p.slug === "bethlehem-1").status, "ok", "one site at exactly 500 is ok");
  assert.equal(g.source.openbible.commit.length, 40);
});

test("bestSite is the top-voted site of a gazetteer record, or null without one", () => {
  assert.deepEqual(bestSite({ sites: [{ lon: 1, lat: 2, votes: 9, where: "a" }, { lon: 3, lat: 4, votes: 1, where: "b" }] }), { lon: 1, lat: 2, votes: 9, where: "a" });
  assert.equal(bestSite({ sites: [] }), null);
});

test("normalizeName and lookupPlaces: exact name first, then aliases, each by verse count", () => {
  assert.equal(normalizeName("Beth-lehem’s"), "beth lehem s");
  assert.equal(normalizeName("Gibeah 1"), "gibeah 1");
  const g = { places: [
    { slug: "geba-1", name: "Geba 1", aliases: ["Geba", "Gibeah"], verses: 14, sites: [], status: "ok" },
    { slug: "gibeah-1", name: "Gibeah 1", aliases: ["Geba", "Gibeah"], verses: 45, sites: [], status: "ok" },
    { slug: "gibeah-2", name: "Gibeah 2", aliases: ["Gibeah"], verses: 2, sites: [], status: "candidates" },
  ] };
  assert.deepEqual(lookupPlaces(g, "Gibeah").map(p => p.slug), ["gibeah-1", "geba-1", "gibeah-2"]);
  assert.deepEqual(lookupPlaces(g, "gibeah-1").map(p => p.slug), ["gibeah-1"]);
  assert.deepEqual(lookupPlaces(g, "Gibeah 2").map(p => p.slug), ["gibeah-2"]);
  assert.deepEqual(lookupPlaces(g, "Nowhere"), []);
});

test("resolvePlace: a source slug with status ok fills lat and lon; candidates and none refuse with the list; a bare name resolves only when one record matches", () => {
  const g = { places: [
    { slug: "gibeah-1", name: "Gibeah 1", aliases: ["Gibeah"], verses: 45, sites: [{ lon: 35.231, lat: 31.823, votes: 822, where: "Tel el Ful" }], status: "ok" },
    { slug: "gibeah-2", name: "Gibeah 2", aliases: ["Gibeah"], verses: 2, sites: [{ lon: 35.054, lat: 31.45, votes: 134, where: "south of Hebron" }], status: "candidates" },
    { slug: "nob", name: "Nob", aliases: ["Nob"], verses: 7, sites: [{ lon: 35.244, lat: 31.793, votes: 162, where: "Ras el Mesharif" }, { lon: 35.243, lat: 31.795, votes: 152, where: "Ras Umm et Tala" }], status: "candidates" },
    { slug: "ezel", name: "Ezel", aliases: ["Ezel"], verses: 2, sites: [], status: "none" },
    { slug: "haran", name: "Haran", aliases: ["Haran", "Harran"], verses: 12, sites: [{ lon: 39.033, lat: 36.864, votes: 837, where: "Harran" }], status: "ok" },
  ] };
  assert.deepEqual(resolvePlace({ id: "gibeah", name: "Gibeah", role: "scene", source: "openbible:gibeah-1" }, g),
    { ok: true, place: { id: "gibeah", name: "Gibeah", role: "scene", source: "openbible:gibeah-1", lat: 31.823, lon: 35.231 } });
  const nob = resolvePlace({ id: "nob", name: "Nob", role: "context", source: "openbible:nob" }, g);
  assert.equal(nob.ok, false); assert.match(nob.reason, /^Nob: 2 candidate sites/); assert.equal(nob.candidates.length, 2);
  assert.match(resolvePlace({ id: "ezel", name: "Ezel", role: "scene", source: "openbible:ezel" }, g).reason, /^Ezel: no coordinate/);
  assert.match(resolvePlace({ id: "x", name: "X", role: "scene", source: "openbible:nowhere" }, g).reason, /^X: openbible:nowhere is not in the gazetteer/);
  assert.deepEqual(resolvePlace({ id: "haran", name: "Haran", role: "context" }, g).place.source, "openbible:haran", "one matching record: picked and recorded");
  assert.match(resolvePlace({ id: "gibeah", name: "Gibeah", role: "scene" }, g).reason, /^Gibeah: 2 records match; set source to one of openbible:gibeah-1, openbible:gibeah-2/);
  const kept = resolvePlace({ id: "p", name: "Philistines", role: "empire", lat: 31.75, lon: 34.65, approved: true }, g);
  assert.deepEqual(kept, { ok: true, place: { id: "p", name: "Philistines", role: "empire", lat: 31.75, lon: 34.65, approved: true } }, "an approved coordinate is kept as is");
  assert.match(resolvePlace({ id: "p", name: "Somewhere", role: "context", lat: 31.75, lon: 34.65 }, g).reason, /^Somewhere: a hand-entered coordinate needs approved: true/);
});

test("makeGeodata downloads once into the cache, writes both files, and refuses a basemap over budget", async () => {
  const dir = await mkdtemp(join(tmpdir(), "geo-"));
  try {
    const calls = [];
    const fetchImpl = async url => {
      calls.push(url);
      const body = /ancient\.jsonl$/.test(url) ? rec("Haran", "haran", ["Haran"], [[837, "39.032778,36.864444", "Harran"]], 12) + "\n"
        : JSON.stringify(fc(/land/.test(url) ? [feature({ type: "Polygon", coordinates: [[[30, 30], [40, 30], [40, 35], [30, 35], [30, 30]]] }, { featurecla: "Land" })] : []));
      return new Response(body, { status: 200 });
    };
    const r = await makeGeodata({ fetchImpl, cache: join(dir, "cache"), out: join(dir, "out"), log: () => {} });
    assert.equal(calls.length, 4);
    assert.ok(calls.every(u => u.includes(NE_SHA) || u.includes(OB_SHA)), "pinned commits");
    const basemap = JSON.parse(await readFile(join(dir, "out", "basemap.json"), "utf8"));
    assert.equal(basemap.land.length, 1);
    const gaz = JSON.parse(await readFile(join(dir, "out", "gazetteer.json"), "utf8"));
    assert.equal(gaz.places[0].slug, "haran");
    await makeGeodata({ fetchImpl, cache: join(dir, "cache"), out: join(dir, "out"), log: () => {} });
    assert.equal(calls.length, 4, "the second run reads the cache");
    await assert.rejects(makeGeodata({ fetchImpl, cache: join(dir, "cache"), out: join(dir, "out2"), budget: 10, log: () => {} }), /basemap is \d+ KB; the budget is 0 KB/);
    assert.equal(r.counts.places.ok, 1);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
