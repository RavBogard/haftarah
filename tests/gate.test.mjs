import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { gate, figuresGate, weekBibliography } from "../scripts/build.mjs";
const require = createRequire(import.meta.url);
const lib = require("../template/lib.js");

const fixture = JSON.parse(await readFile(new URL("./fixtures/week-min/sheet.json", import.meta.url), "utf8"));
const biblio = lib.parseBibliography(await readFile(new URL("../bibliography/I Samuel.md", import.meta.url), "utf8"));

test("parseBibliography reads keys and citations", () => {
  assert.ok(biblio.has("McCarter 1980"));
  assert.match(biblio.get("McCarter 1980").citation, /Anchor Bible 8/);
});

test("gate passes the approved fixture", () => {
  assert.deepEqual(gate(fixture, biblio), []);
});

test("gate no longer asks about approval: proposed and status-less items pass", () => {
  const d = structuredClone(fixture);
  d.commentary[0].status = "proposed";
  d.glosses[0].status = "proposed";
  d.glossary[0].status = "proposed";
  d.openingNote.status = "proposed";
  d.nextWeek.status = "proposed";
  delete d.commentary[1].status;
  delete d.glossary[0].status;
  assert.deepEqual(gate(d, biblio), []);
});

test("gate ignores rejected items, even with a broken citation", () => {
  const d = structuredClone(fixture);
  d.commentary[0].status = "rejected";
  delete d.commentary[0].sourceRef;
  assert.deepEqual(gate(d, biblio), []);
});

test("gate enforces Sefaria refs outside the critical register", () => {
  const d = structuredClone(fixture);
  delete d.commentary[0].sourceRef;
  assert.ok(gate(d, biblio).some(x => /no Sefaria ref.*18 Rashi/.test(x)));
});

test("gate names missing work and missing bibliography file", () => {
  const d = structuredClone(fixture);
  d.commentary[1].works = ["Nobody 2099"];
  assert.ok(gate(d, biblio).some(x => /not in bibliography\/I Samuel\.md: Nobody 2099/.test(x)));
  d.commentary[1].works = [];
  assert.ok(gate(d, biblio).some(x => /names no work/.test(x)));
  d.commentary[1].works = ["McCarter 1980"];
  assert.ok(gate(d, null).some(x => /bibliography\/I Samuel\.md is missing/.test(x)));
});

test("gate checks citations on entries with no status", () => {
  const d = structuredClone(fixture);
  delete d.commentary[0].status;
  delete d.commentary[0].sourceRef;
  assert.ok(gate(d, biblio).some(x => /no Sefaria ref.*18 Rashi/.test(x)));
});

const geoFix = () => ({ gazetteer: { places: [{ slug: "gibeah-1", name: "Gibeah 1", aliases: ["Gibeah"], verses: 45, sites: [{ lon: 35.231, lat: 31.823, votes: 822, where: "Tel el Ful" }], status: "ok" }] },
  basemap: { box: [8, 12, 60, 42], land: [], lakes: [], rivers: [] },
  chronology: { entries: { david: { label: "David", kind: "king", realm: "united", start: -1010, end: -970, approx: true } } } });

test("figuresGate: figures need the geo data; a resolved place and a table-cited king pass; an unresolved place or a work outside the bibliography is named", () => {
  const d = structuredClone(fixture);
  d.places = [{ id: "gibeah", name: "Gibeah", role: "scene", source: "openbible:gibeah-1", lat: 31.823, lon: 35.231 }];
  d.timeline = [{ id: "david", chronology: "david" }];
  assert.deepEqual(figuresGate(d, biblio, null), ["data/geo and data/chronology.json are needed for the figures (loadGeo failed)"]);
  assert.deepEqual(figuresGate(d, biblio, null, new Error("ENOENT: data/geo/basemap.json")), ["data/geo and data/chronology.json are needed for the figures (loadGeo failed: ENOENT: data/geo/basemap.json)"], "the failure says why");
  const geo = geoFix();
  assert.deepEqual(figuresGate(d, biblio, geo), []);
  assert.deepEqual(gate(d, biblio), [], "the per-reading gate no longer checks the figures");
  d.places.push({ id: "nob", name: "Nob", role: "context", source: "openbible:nob" });
  d.timeline.push({ id: "e", label: "A thing", kind: "event", start: -1000, works: ["Nobody 2000"] });
  const got = figuresGate(d, biblio, geo);
  assert.ok(got.some(p => /^Nob: openbible:nob is not in the gazetteer/.test(p)), got.join("\n"));
  assert.ok(got.includes("A thing: work not in the bibliography: Nobody 2000"));
  assert.deepEqual(figuresGate({ ...fixture, places: [], timeline: [] }, biblio, null), [], "empty lists are no figures");
});

test("figuresGate checks a two-reading week once against the union of its bibliographies, with no reading prefix", async () => {
  const two = JSON.parse(await readFile(new URL("./fixtures/week-torah/sheet.json", import.meta.url), "utf8"));
  const week = { ...two, timeline: [{ id: "flight", label: "David flees Saul", kind: "event", start: -1010, approx: true, works: ["McCarter 1980"] }] };
  const union = await weekBibliography(week);
  assert.ok(union.has("McCarter 1980"), "I Samuel.md is in the union");
  const genesis = lib.parseBibliography(await readFile(new URL("../bibliography/Genesis.md", import.meta.url), "utf8").catch(() => ""));
  assert.ok(!genesis.has("McCarter 1980"), "Genesis.md alone would not have it (the bug)");
  assert.deepEqual(figuresGate(week, union, geoFix()), []);
  assert.deepEqual(figuresGate({ ...week, timeline: [{ ...week.timeline[0], works: ["Nobody 2000"] }] }, union, geoFix()), ["David flees Saul: work not in the bibliography: Nobody 2000"]);
});

test("figuresGate: a malformed geo file is a problem, not a TypeError", () => {
  const d = { ...fixture, places: [{ id: "gibeah", name: "Gibeah", role: "scene", source: "openbible:gibeah-1", lat: 31.823, lon: 35.231 }] };
  assert.deepEqual(figuresGate(d, biblio, { ...geoFix(), gazetteer: {} }), ["data/geo/gazetteer.json is not a gazetteer"]);
  assert.deepEqual(figuresGate(d, biblio, { ...geoFix(), basemap: {} }), ["data/geo/basemap.json is not a basemap"]);
});

import { fillTemplate } from "../scripts/build.mjs";

test("fillTemplate leaves dollar patterns in the data alone", () => {
  const data = `{"t":"costs $5 and $' more $& $\`"}`;
  const out = fillTemplate("<s>{{DATA}}</s>{{NOTE}}", { DATA: data, NOTE: "n" });
  assert.equal(out, `<s>${data}</s>n`);
});

import { cleanEnglish, incipitHe, incipitEn } from "../scripts/fetch.mjs";

test("cleanEnglish keeps a footnote whole when it has italics inside", () => {
  const html = 'I will lay carbuncles<sup class="footnote-marker">f</sup><i class="footnote"><b>carbuncles </b>Taking <i>pukh</i> as a byform of <i>nophekh</i>; so already Rashi.</i> as your building stones';
  const r = cleanEnglish(html);
  assert.equal(r.en, 'I will lay carbuncles<sup class="fn">f</sup> as your building stones');
  assert.deepEqual(r.notes, [{ marker: "f", lemma: "carbuncles", text: "Taking <i>pukh</i> as a byform of <i>nophekh</i>; so already Rashi." }]);
});

test("cleanEnglish still reads a plain footnote", () => {
  const r = cleanEnglish('the new moon<sup class="footnote-marker">a</sup><i class="footnote">Lit. “month.”</i>, and');
  assert.equal(r.en, 'the new moon<sup class="fn">a</sup>, and');
  assert.equal(r.notes[0].text, "Lit. “month.”");
});

test("incipitHe stops at the first strong pause and before a function word", () => {
  // Isaiah 54:1: tipcha on the second word, then לֹא
  assert.equal(incipitHe("רׇנִּ֥י עֲקָרָ֖ה לֹ֣א יָלָ֑דָה"), "רׇנִּ֥י עֲקָרָ֖ה");
  assert.equal(incipitHe("רׇנִּ֥י עֲקָרָ֥ה לֹ֣א יָלָ֑דָה"), "רׇנִּ֥י עֲקָרָ֥ה");
  // Isaiah 40:1: zaqef on the second word
  assert.equal(incipitHe("נַחֲמ֥וּ נַחֲמ֖וּ עַמִּ֑י יֹאמַ֖ר אֱלֹהֵיכֶֽם׃"), "נַחֲמ֥וּ נַחֲמ֖וּ");
  // never more than four words
  assert.equal(incipitHe("א֥ ב֥ ג֥ ד֥ ה֥ ו֥").split(" ").length, 4);
});

test("incipitEn takes the first poetry line, or a prose clause, without keys", () => {
  assert.equal(incipitEn('<span class="poetry indentAll">Shout, O infertile one,</span><br><span class="poetry indentAll">You who bore no child!</span>'), "Shout, O infertile one");
  assert.equal(incipitEn('Jonathan said to him, “Tomorrow will be the new moon<sup class="fn">a</sup>; and you will be missed.”'), "Jonathan said to him");
  assert.equal(incipitEn("Comfort, oh comfort My people,<br>Says your God."), "Comfort, oh comfort My people");
});
