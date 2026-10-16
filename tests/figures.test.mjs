import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { resolveTimeline } from "../scripts/geo.mjs";
const L = createRequire(import.meta.url)("../template/lib.js");

const basemap = { land: [[[33, 29], [37, 29], [37, 34.5], [33, 34.5], [33, 29]]], lakes: [{ name: "Dead Sea", ring: [[35.4, 31.2], [35.6, 31.2], [35.6, 31.7], [35.4, 31.7], [35.4, 31.2]] }], rivers: [{ name: "Jordan", line: [[35.6, 33.2], [35.55, 32.5], [35.5, 31.8]] }] };
const places = [
  { id: "gibeah", name: "Gibeah", role: "scene", lat: 31.823, lon: 35.231 },
  { id: "bethlehem", name: "Bethlehem", role: "scene", lat: 31.704, lon: 35.208 },
  { id: "jerusalem", name: "Jerusalem", role: "context", lat: 31.777, lon: 35.234 },
  { id: "ramah", name: "Ramah", role: "context", lat: 31.854, lon: 35.232 },
  { id: "philistines", name: "Philistines", role: "empire", lat: 31.75, lon: 34.65, approved: true },
];
const chron = { entries: { saul: { label: "Saul", kind: "king", realm: "united", start: -1030, end: -1010, approx: true }, david: { label: "David", kind: "king", realm: "united", start: -1010, end: -970, approx: true }, samuel: { label: "Samuel", kind: "prophet", start: -1050, end: -1010, approx: true }, qarqar: { label: "Battle of Qarqar", kind: "event", start: -853, end: -853, approx: false } } };
const items = [{ id: "saul", chronology: "saul" }, { id: "david", chronology: "david" }, { id: "samuel", chronology: "samuel" },
  { id: "flight", label: "David flees Saul", kind: "event", start: -1010, approx: true, works: ["McCarter 1980"] },
  { id: "hdr", label: "History of David’s Rise written", kind: "composition", start: -1000, end: -850, approx: true, works: ["McCarter 1980"] }];

test("mapRegion: Judean places fit the land box; Nineveh forces near-east; a far place gives a custom 5:4 box; a named region is taken as given", () => {
  assert.equal(L.mapRegion(places, null).name, "land");
  assert.equal(L.mapRegion([...places, { id: "n", name: "Nineveh", role: "context", lat: 36.359, lon: 43.153 }], null).name, "near-east");
  const far = L.mapRegion([{ id: "a", name: "A", role: "scene", lat: 10, lon: 10 }, { id: "b", name: "B", role: "scene", lat: 11, lon: 12 }], null);
  assert.equal(far.name, "custom");
  const [x0, y0, x1, y1] = far.box;
  const lat0 = (y0 + y1) / 2;
  assert.ok(Math.abs(((x1 - x0) * Math.cos(lat0 * Math.PI / 180)) / (y1 - y0) - 1.25) < 0.01, "5:4 in projected units");
  assert.deepEqual(L.mapRegion(places, "near-east").box, L.MAP_REGIONS["near-east"]);
  assert.deepEqual(L.mapRegion(places, [34, 31, 36, 32.6]).name, "custom");
});

test("mapSvg: a titled, described svg with classes only, every place drawn by role, water and land, a scale bar in whole kilometres", () => {
  const svg = L.mapSvg(places, null, basemap, { id: "m", title: "Places in this reading", desc: "Map of…" });
  assert.match(svg, /^<svg [^>]*viewBox="0 0 1000 800"[^>]*role="img"[^>]*aria-labelledby="m-title m-desc"/);
  assert.match(svg, /<title id="m-title">Places in this reading<\/title><desc id="m-desc">Map of…<\/desc>/);
  assert.ok(!/style=/.test(svg), "no style attributes");
  assert.equal((svg.match(/class="place scene"/g) || []).length, 2);
  assert.equal((svg.match(/class="place context"/g) || []).length, 2);
  assert.equal((svg.match(/class="place-label empire"/g) || []).length, 1);
  assert.ok(!/class="place empire"/.test(svg), "an empire has no dot");
  assert.match(svg, /class="map-sea"/); assert.match(svg, /class="map-land"/); assert.match(svg, /class="map-lake"/); assert.match(svg, /class="map-river"/);
  assert.match(svg, /class="map-scale"[^]*?<text[^>]*>(5|10|20|50|100|200|500) km<\/text>/);
  assert.match(svg, /<text[^>]*class="place-label scene side-[rltb]"[^>]*>Gibeah<\/text>/);
});

test("mapSvg: labels of neighbouring places take different sides, and a label override is honoured", () => {
  const svg = L.mapSvg(places, null, basemap);
  const side = name => (svg.match(new RegExp(`<text[^>]*class="place-label [a-z]+ side-([rltb])"[^>]*>${name}</text>`)) || [])[1];
  assert.ok(side("Gibeah") && side("Ramah") && side("Jerusalem"), "every label carries its side");
  assert.notEqual(side("Gibeah"), side("Ramah"), "Gibeah and Ramah are 3 km apart");
  const forced = L.mapSvg([{ ...places[0], label: "b" }], null, basemap);
  assert.equal((forced.match(/side-([rltb])"[^>]*>Gibeah/) || [])[1], "b");
});

test("mapSvg: a place outside the given region is left out and reported in the description, never drawn off the frame", () => {
  const svg = L.mapSvg([...places, { id: "n", name: "Nineveh", role: "context", lat: 36.359, lon: 43.153 }], "land", basemap);
  assert.ok(!/Nineveh<\/text>/.test(svg));
  assert.equal((svg.match(/class="place context"/g) || []).length, 2);
});

test("yearLabel rounds approximate years to five with c.; exact years print as they are", () => {
  assert.equal(L.yearLabel(-1010, true), "c. 1010");
  assert.equal(L.yearLabel(-1013, true), "c. 1015");
  assert.equal(L.yearLabel(-853, false), "853");
  assert.equal(L.yearLabel(70, false), "70 CE");
});

test("timelineSvg: a band whose span snaps outward to centuries, one lane row per kind packed without overlap, bars by kind, diamonds for events, dashed when approx", () => {
  const svg = L.timelineSvg(items, chron, { id: "t", title: "When this happened", desc: "Timeline…" });
  assert.match(svg, /^<svg [^>]*viewBox="0 0 1000 \d+"[^>]*role="img"[^>]*aria-labelledby="t-title t-desc"/);
  assert.ok(!/style=/.test(svg));
  assert.match(svg, /class="tl-axis"/);
  assert.match(svg, /<text[^>]*class="tl-tick"[^>]*>1100<\/text>/, "the span snaps outward to the century");
  assert.match(svg, /<text[^>]*class="tl-tick"[^>]*>800<\/text>/);
  assert.match(svg, /class="tl-bar king approx"[^>]*>/);
  assert.match(svg, /class="tl-bar prophet approx"/);
  assert.match(svg, /class="tl-bar composition approx"/);
  assert.match(svg, /class="tl-event approx"/);
  assert.match(svg, /<text[^>]*class="tl-label[^"]*"[^>]*>David, c\. 1010–970<\/text>/, "a wide bar carries its dates");
  const ys = [...svg.matchAll(/class="tl-bar king[^"]*" x="[\d.]+" y="([\d.]+)"/g)].map(m => Number(m[1]));
  assert.equal(new Set(ys).size, 1, "Saul and David do not overlap, so they share one row");
  const same = L.timelineSvg([{ id: "a", label: "A", kind: "composition", start: -900, end: -800, works: ["x"] }, { id: "b", label: "B", kind: "composition", start: -850, end: -750, works: ["x"] }], chron);
  const rows = [...same.matchAll(/class="tl-bar composition[^"]*" x="[\d.]+" y="([\d.]+)"/g)].map(m => Number(m[1]));
  assert.equal(new Set(rows).size, 2, "overlapping items take two rows");
});

test("timelineSvg: a short span ticks every fifty years; one item still draws", () => {
  const svg = L.timelineSvg([{ id: "q", chronology: "qarqar" }], chron);
  assert.match(svg, /class="tl-tick"[^>]*>900<\/text>/);
  assert.match(svg, /class="tl-tick"[^>]*>850<\/text>/);
});

test("figureText: titles, a description listing places by role and items with their dates, captions; one figure alone", () => {
  const t = L.figureText(places, items, chron, null);
  assert.equal(t.map.title, "Places in this reading");
  assert.equal(t.map.desc, "Map of the land of Israel: Gibeah and Bethlehem (scenes of the reading); Jerusalem and Ramah (nearby); Philistines (a people or kingdom). Coastlines are modern; borders are not drawn.");
  assert.equal(t.map.caption, "Places in this reading · coastlines modern, borders not drawn");
  assert.equal(t.timeline.title, "When this happened");
  assert.equal(t.timeline.desc, "Timeline, c. 1050 to c. 850 BCE: Samuel, prophet, c. 1050–1010; Saul, king, c. 1030–1010; David, king, c. 1010–970; David flees Saul, c. 1010; History of David’s Rise written, c. 1000–850.");
  assert.equal(t.timeline.caption, "Dates BCE · c. marks a rounded date");
  const one = L.figureText([], items, chron, null);
  assert.equal(one.map, null); assert.ok(one.timeline);
  assert.equal(L.figureText(places, [], chron, "near-east").map.desc.slice(0, 20), "Map of the Near East");
});

test("readingView passes places, mapRegion and timeline through only when the week has them", () => {
  const week = { schema: 3, slug: "x", shabbat: {}, readings: [{ id: "haftarah", kind: "haftarah", ref: "Isaiah 1:1", book: "Isaiah", verses: [{ book: "Isaiah", chapter: 1, verse: 1, he: "א", en: "a" }] }] };
  assert.ok(!("places" in L.readingView(week, "haftarah")));
  const v = L.readingView({ ...week, places, mapRegion: "land", timeline: items }, "haftarah");
  assert.deepEqual(v.places, places); assert.equal(v.mapRegion, "land"); assert.deepEqual(v.timeline, items);
});

const realBasemap = JSON.parse(readFileSync(new URL("../data/geo/basemap.json", import.meta.url), "utf8"));
const realChron = JSON.parse(readFileSync(new URL("../data/chronology.json", import.meta.url), "utf8"));

test("timelineItems is geo.mjs's resolveTimeline: the same result for table items and inline items", () => {
  const keys = Object.keys(realChron.entries);
  const mixed = [...items, ...keys.slice(0, 6).map(k => ({ id: k, chronology: k })), { id: "own", label: "Own label", chronology: keys[0] }, { id: "pt", label: "Point", kind: "event", start: -700 }];
  assert.deepEqual(L.timelineItems(mixed, realChron), resolveTimeline(mixed, realChron));
  assert.deepEqual(L.timelineItems(undefined, realChron), []);
});

test("mapSvg on the real basemap: land, lakes and rivers in the land box, every number to one decimal, the frame last", () => {
  const svg = L.mapSvg(places, "land", realBasemap);
  assert.match(svg, /class="map-land" fill-rule="evenodd" d="M/);
  assert.match(svg, /class="map-lake"/);
  assert.match(svg, /class="map-river"/);
  assert.ok(!/style=/.test(svg));
  assert.ok(!/\d\.\d\d/.test(svg), "numbers rounded to one decimal");
  assert.match(svg, /<rect class="map-frame" width="1000" height="800"\/><\/svg>$/);
  const ne = L.mapSvg([...places, { id: "n", name: "Nineveh", role: "context", lat: 36.359, lon: 43.153 }], null, realBasemap);
  assert.match(ne, />Nineveh<\/text>/);
});

test("mapSvg: a named region is drawn at 5:4, the box widened around its centre; without a basemap it still draws", () => {
  const svg = L.mapSvg(places, "land", null);
  assert.match(svg, /class="map-sea"/);
  assert.ok(!/map-land/.test(svg));
  // the land box is taller than 5:4, so the frame widens around lon 35.2: Jerusalem stays near the middle
  const cx = Number((svg.match(/class="place context" cx="([\d.]+)"/) || [])[1]);
  assert.ok(cx > 450 && cx < 550, String(cx));
});

test("figureText: a place outside an explicit region is named as outside the map", () => {
  const t = L.figureText([...places, { id: "n", name: "Nineveh", role: "context", lat: 36.359, lon: 43.153 }], [], chron, "land");
  assert.match(t.map.desc, /Jerusalem and Ramah \(nearby\)/);
  assert.match(t.map.desc, /Outside this map: Nineveh\./);
  assert.equal(t.timeline, null);
});

test("timelineSvg: a very long label is cut with an ellipsis and stays inside the frame; no items draw nothing", () => {
  const long = "A very long composition label that goes on and on well past any reasonable width for a timeline row";
  const svg = L.timelineSvg([{ id: "x", label: long, kind: "composition", start: -1000, end: -990, approx: true, works: ["x"] },
    { id: "y", label: long, kind: "event", start: -700, works: ["x"] }], chron);
  const labels = [...svg.matchAll(/<text class="tl-label[^"]*" x="([\d.]+)" y="[\d.]+" font-size="18" text-anchor="(start|end)">([^<]*)<\/text>/g)];
  assert.equal(labels.length, 2);
  for (const [, x, anchor, text] of labels) {
    assert.ok(text.endsWith("…"), text);
    const w = 0.56 * 18 * [...text].length, x0 = anchor === "start" ? Number(x) : Number(x) - w;
    assert.ok(x0 >= 0 && x0 + w <= 1000, `${text} at ${x}`);
  }
  assert.equal(L.timelineSvg([], chron), "");
});

test("timelineSvg on the real table: every king draws, ticks every hundred years over a long span", () => {
  const judah = Object.entries(realChron.entries).filter(([, e]) => e.kind === "king").map(([k]) => ({ id: k, chronology: k }));
  const svg = L.timelineSvg(judah, realChron);
  assert.equal((svg.match(/class="tl-bar king/g) || []).length, judah.length);
  const ticks = [...svg.matchAll(/class="tl-tick"[^>]*>(\d+)<\/text>/g)].map(m => Number(m[1]));
  assert.ok(ticks.length >= 3 && ticks.every((t, i) => !i || ticks[i - 1] - t === 100), ticks.join(","));
  assert.ok(!/style=/.test(svg));
});

test("figureText: a timeline that crosses year 0 gives every year its era, and a span across 0 dates its start", () => {
  const t = L.figureText([], [{ id: "f", label: "Fall", kind: "event", start: -586, works: ["x"] }, { id: "s", label: "Span", kind: "composition", start: -50, end: 70, works: ["x"] },
    { id: "t", label: "Temple", kind: "event", start: 70, works: ["x"] }], chron, null);
  assert.equal(t.timeline.desc, "Timeline, 586 BCE to 70 CE: Fall, 586 BCE; Span, 50 BCE–70 CE; Temple, 70 CE.");
});

test("timelineSvg on the real table: no label is cut to a single letter", () => {
  const kings = Object.entries(realChron.entries).filter(([, e]) => e.kind === "king").map(([k]) => ({ id: k, chronology: k }));
  const texts = [...L.timelineSvg(kings, realChron).matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map(m => m[1]);
  assert.ok(texts.length > 0);
  for (const s of texts) assert.ok(!/^.…$/u.test(s), s);
});

test("mapSvg draws nothing when no place is located inside the box, as figureText has no map", () => {
  assert.equal(L.mapSvg([], null, basemap), "");
  assert.equal(L.mapSvg([{ id: "x", name: "X", role: "scene" }], null, basemap), "");
  assert.equal(L.mapSvg([{ id: "n", name: "Nineveh", role: "context", lat: 36.359, lon: 43.153 }], "land", basemap), "");
  assert.equal(L.figureText([], [], chron, null).map, null);
});

test("timelineSvg: an item with no string kind is drawn as other; an empty label prints only its dates", () => {
  const svg = L.timelineSvg([{ id: "a", label: "A", start: -900, end: -800 }, { id: "b", label: "B", kind: 7, start: -950, end: -940 }, { id: "c", label: "", kind: "event", start: -1010, approx: true }], chron);
  assert.equal((svg.match(/class="tl-bar other"/g) || []).length, 2);
  assert.ok(!/undefined|tl-bar 7/.test(svg));
  assert.ok(!/>, c\. 1010</.test(svg));
  assert.match(svg, />c\. 1010<\/text>/);
  assert.ok(!/^, /.test(L.figureText([], [{ id: "c", label: "", kind: "event", start: -1010, approx: true }], chron, null).timeline.desc.split(": ")[1]));
});

test("mapSvg and timelineSvg are deterministic", () => {
  assert.equal(L.mapSvg(places, null, realBasemap), L.mapSvg(places, null, realBasemap));
  assert.equal(L.timelineSvg(items, chron), L.timelineSvg(items, chron));
});

test("names and titles are escaped: no markup, no handlers, no styles get through", () => {
  const bad = [{ id: "x", name: '<img onerror=x>&"Q"', role: "scene", lat: 31.8, lon: 35.2 }];
  const svgs = [L.mapSvg(bad, null, basemap, { title: 'T"<' }), L.timelineSvg([{ id: "x", label: '<img onerror=x>&"Q"', kind: "event", start: -900 }], chron, { title: 'T"<' })];
  for (const svg of svgs) {
    // the escaped name still reads "onerror=" as text; no tag may carry it
    assert.ok(!/<img/.test(svg) && !/<[^>]*onerror=/.test(svg) && !/style=/.test(svg), svg);
    assert.match(svg, /T&quot;&lt;<\/title>/);
    assert.match(svg, /&lt;img onerror=x&gt;&amp;&quot;Q&quot;/);
  }
});

test("timelineSvg: bars that touch in a row (Saul then David) part by 3 units; every text prints at 18 units (9pt at 7.15in)", () => {
  const svg = L.timelineSvg(items, chron);
  const kings = [...svg.matchAll(/<rect class="tl-bar king[^"]*" x="([\d.]+)" y="([\d.]+)" width="([\d.]+)"/g)].map(m => ({ x0: +m[1], y: +m[2], x1: +m[1] + +m[3] }));
  assert.equal(kings.length, 2);
  assert.equal(kings[0].y, kings[1].y, "Saul and David share a row");
  const [a, b] = kings.sort((p, q) => p.x0 - q.x0);
  assert.ok(Math.abs(b.x0 - a.x1 - 3) < 0.15, `gap ${b.x0 - a.x1}`);
  const sizes = [...svg.matchAll(/font-size="(\d+)"/g)].map(m => +m[1]);
  assert.ok(sizes.length > 0 && sizes.every(s => s === 18), sizes.join(","));
  assert.ok(18 * 7.15 * 72 / 1000 >= 9);
});

test("mapSvg: place labels and the scale print at 50 units (9pt at the 2.6in page-1 width)", () => {
  const svg = L.mapSvg(places, [34.5, 31.5, 35.6, 32.1], basemap);
  const sizes = [...svg.matchAll(/font-size="(\d+)"/g)].map(m => +m[1]);
  assert.ok(sizes.length >= 5 && sizes.every(s => s === 50), sizes.join(","));
  assert.ok(50 * 2.6 * 72 / 1000 >= 9);
});
