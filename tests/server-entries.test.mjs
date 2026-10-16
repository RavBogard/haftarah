// tests/server-entries.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { upsertEntries, validateEntries, verifyRefs, applyPatch, setStatuses } from "../api/_lib/entries.mjs";
import { createRequire } from "node:module";
const L = createRequire(import.meta.url)("../template/lib.js");

const week = JSON.parse(await readFile(new URL("./fixtures/week-torah/sheet.json", import.meta.url), "utf8"));
const h = s => s.readings.find(r => r.id === "haftarah");
const v = h(week).verses[0];
const entry = (over = {}) => ({ verse: v.verse, chapter: v.chapter, register: "traditional", source: "Rashi", lemma: "x", text: "<p>A comment of some length that says something about the verse.</p>", sourceRef: `Rashi on ${v.book} ${v.chapter}:${v.verse}:1`, ...over });

test("upsertEntries adds entries with fresh ids, replaces by id, removes by id, keeps other readings untouched, and adds glosses and glossary items", () => {
  const a = upsertEntries(week, "haftarah", { entries: [entry(), entry({ type: "gloss", lemma: v.he.split(/\s+/)[0], en: v.en.split(/\s+/)[0], text: "a gloss of fifteen words or so to key on the first word of the verse here" })], glossary: [{ term: "Noah", he: "נֹחַ", text: "The builder." }] });
  const added = h(a.sheet).commentary.filter(e => !h(week).commentary.some(o => o.id === e.id));
  assert.equal(added.length, 1); assert.match(added[0].id, /^e-[0-9a-f]{8}(-\d)?$/);
  assert.equal(h(a.sheet).glosses.length, (h(week).glosses || []).length + 1);
  assert.equal(a.sheet.glossary.at(-1).term, "Noah");
  assert.deepEqual(a.touched, [added[0].id, h(a.sheet).glosses.at(-1).id]);
  assert.deepEqual(a.sheet.readings.find(r => r.id === "torah"), week.readings.find(r => r.id === "torah"));
  const b = upsertEntries(a.sheet, "haftarah", { entries: [{ id: added[0].id, text: "<p>Replaced text, still a comment of some length about the verse.</p>" }] });
  assert.equal(h(b.sheet).commentary.find(e => e.id === added[0].id).text.startsWith("<p>Replaced"), true);
  assert.equal(h(b.sheet).commentary.find(e => e.id === added[0].id).source, "Rashi", "an update merges into the entry");
  const gid = h(a.sheet).glosses.at(-1).id;
  assert.match(gid, /^g-[0-9a-f]{8}(-\d)?$/);
  assert.equal(h(upsertEntries(a.sheet, "haftarah", { entries: [{ id: gid, en: "word" }] }).sheet).glosses.find(g => g.id === gid).en, "word", "a gloss is updated by its id alone");
  const c = upsertEntries(b.sheet, "haftarah", { remove: [added[0].id] });
  assert.ok(!h(c.sheet).commentary.some(e => e.id === added[0].id));
  assert.throws(() => upsertEntries(week, "nope", { entries: [entry()] }), /no reading nope/);
  assert.throws(() => upsertEntries(week, "haftarah", { entries: [{ id: "e-00000000", text: "x" }] }), /no entry e-00000000 to update/);
});

test("validateEntries: the gate's problems per touched entry (no sourceRef, a work not in the bibliography)", () => {
  const a = upsertEntries(week, "haftarah", { entries: [entry({ sourceRef: undefined }), entry({ register: "critical", source: "What historians say", works: ["Nobody 1999"], sourceRef: undefined })] });
  const biblio = new Map([["JSB 2014", "x"]]);
  const problems = validateEntries(a.sheet, "haftarah", a.touched, { biblio });
  assert.match(problems.get(a.touched[0])[0], /no Sefaria ref/);
  assert.match(problems.get(a.touched[1])[0], /work not in bibliography/);
  const ok = upsertEntries(week, "haftarah", { entries: [entry({ register: "critical", source: "Historians", works: ["JSB 2014"], sourceRef: undefined })] });
  assert.deepEqual(validateEntries(ok.sheet, "haftarah", ok.touched, { biblio }).get(ok.touched[0]), []);
});

test("verifyRefs: 200 with versions is ok, 404 or an error body is missing, a network failure or 5xx is unknown; each ref asked once", async () => {
  const calls = [];
  const fetchImpl = async url => { const u = decodeURIComponent(String(url)); calls.push(u); if (u.includes("Rashi on Isaiah 54:1")) return new Response(JSON.stringify({ versions: [{}] }), { status: 200 }); if (u.includes("54:99")) return new Response(JSON.stringify({ error: "no such ref" }), { status: 200 }); if (u.includes("Gone")) return new Response("", { status: 404 }); throw new Error("ECONNRESET"); };
  const r = await verifyRefs(["Rashi on Isaiah 54:1:1", "Rashi on Isaiah 54:99:1", "Gone on Isaiah 54:1", "Radak on Isaiah 54:1", "Rashi on Isaiah 54:1:1"], { fetchImpl });
  assert.deepEqual([...r.entries()], [["Rashi on Isaiah 54:1:1", "ok"], ["Rashi on Isaiah 54:99:1", "missing"], ["Gone on Isaiah 54:1", "missing"], ["Radak on Isaiah 54:1", "unknown"]]);
  assert.equal(calls.length, 4);
});

test("applyPatch merges the allowed top-level keys and a reading's incipit, replaces arrays, refuses other keys", () => {
  const p = applyPatch(week, { openingNote: { calendar: "New calendar paragraph." }, nextWeek: null, glossary: [{ term: "X", he: "x", text: "y" }], readings: { haftarah: { incipit: { he: "רָנִּי", en: "Shout" } } } });
  assert.equal(p.sheet.openingNote.calendar, "New calendar paragraph.");
  assert.deepEqual(p.sheet.openingNote.setting, week.openingNote.setting, "an object patch merges");
  assert.equal(p.sheet.nextWeek, null);
  assert.deepEqual(p.sheet.glossary, [{ term: "X", he: "x", text: "y" }], "a list replaces");
  assert.deepEqual(h(p.sheet).incipit, { he: "רָנִּי", en: "Shout" });
  assert.deepEqual(p.changed.sort(), ["glossary", "nextWeek", "openingNote", "readings.haftarah.incipit"]);
  assert.throws(() => applyPatch(week, { verses: [] }), /verses cannot be patched/);
  assert.throws(() => applyPatch(week, { readings: { torah: { verses: [] } } }), /only incipit/);
});

test("setStatuses marks and unmarks entries and glosses across readings, counting what changed; an unknown id is named", () => {
  const ids = [h(week).commentary[0].id];
  const r = setStatuses(week, ids, "rejected");
  assert.equal(r.changed, 1); assert.equal(h(r.sheet).commentary[0].status, "rejected");
  const back = setStatuses(r.sheet, ids, null);
  assert.equal(h(back.sheet).commentary[0].status, undefined);
  assert.throws(() => setStatuses(week, ["e-ffffffff"], "rejected"), /no entry e-ffffffff/);
});

test("validateEntries gates each entry alone: 1:1 Rashi is not blamed for 11:1 Rashi, verse 1 not for verse 21, and of two twins only the bad one is refused", () => {
  const a = upsertEntries(week, "haftarah", { entries: [entry({ chapter: 1, verse: 1, sourceRef: "Rashi on Isaiah 1:1:1" }), entry({ chapter: 11, verse: 1, sourceRef: undefined })] });
  const pa = validateEntries(a.sheet, "haftarah", a.touched, {});
  assert.deepEqual(pa.get(a.touched[0]), [], "1:1 Rashi is clean");
  assert.match(pa.get(a.touched[1])[0], /no Sefaria ref: 11:1 Rashi/);
  const b = upsertEntries(week, "haftarah", { entries: [entry({ chapter: undefined, verse: 1, sourceRef: "Rashi on Isaiah 54:1:1" }), entry({ chapter: undefined, verse: 21, sourceRef: undefined })] });
  const pb = validateEntries(b.sheet, "haftarah", b.touched, {});
  assert.deepEqual(pb.get(b.touched[0]), [], "verse 1 is clean");
  assert.equal(pb.get(b.touched[1]).length, 1);
  const twins = upsertEntries(week, "haftarah", { entries: [entry(), entry({ sourceRef: undefined, text: "<p>Another comment of some length on the very same verse by the same source.</p>" })] });
  const pt = validateEntries(twins.sheet, "haftarah", twins.touched, {});
  assert.deepEqual(pt.get(twins.touched[0]), [], "the valid twin");
  assert.match(pt.get(twins.touched[1])[0], /no Sefaria ref/);
  const noIncipit = upsertEntries({ ...week, readings: week.readings.map(r => r.id === "haftarah" ? { ...r, incipit: {} } : r) }, "haftarah", { entries: [entry()] });
  assert.deepEqual(validateEntries(noIncipit.sheet, "haftarah", noIncipit.touched, {}).get(noIncipit.touched[0]), [], "the reading's empty incipit is not the entry's problem");
});

test("verifyRefs: a body that fails to read is unknown, not missing", async () => {
  const fetchImpl = async () => ({ status: 200, ok: true, json: async () => { throw new Error("body timeout"); } });
  assert.deepEqual([...(await verifyRefs(["Rashi on Isaiah 54:1:1"], { fetchImpl })).entries()], [["Rashi on Isaiah 54:1:1", "unknown"]]);
});

test("verifyRefs asks four at a time, and a ref with no answer by the deadline is unknown", async () => {
  const refs = Array.from({ length: 12 }, (_, i) => `Rashi on Isaiah 54:${i + 1}:1`);
  const slow = () => new Promise(res => setTimeout(() => res(new Response(JSON.stringify({ versions: [{}] }), { status: 200 })), 50));
  let t = Date.now();
  const r = await verifyRefs(refs, { fetchImpl: slow });
  assert.ok(Date.now() - t < 400, `took ${Date.now() - t} ms; serial would be 600`);
  assert.ok([...r.values()].every(x => x === "ok"));
  t = Date.now();
  const hung = await verifyRefs(refs, { fetchImpl: () => new Promise(() => {}), deadlineMs: 100 });
  assert.ok(Date.now() - t < 250, `took ${Date.now() - t} ms`);
  assert.equal(hung.size, 12); assert.ok([...hung.values()].every(x => x === "unknown"));
});

test("applyPatch checks the shape of each key: a list where a list belongs, an object for the incipit, a region of four numbers", () => {
  assert.throws(() => applyPatch(week, { glossary: { term: "X" } }), /glossary must be a list/);
  assert.throws(() => applyPatch(week, { readings: { haftarah: { incipit: "Shout" } } }), /incipit must be an object/);
  assert.throws(() => applyPatch(week, { mapRegion: [30, 31] }), /mapRegion must be a string, a list of four numbers, or null/);
  assert.throws(() => applyPatch(week, { openingNote: ["x"] }), /openingNote must be an object/);
  assert.equal(applyPatch(week, { mapRegion: [34, 29, 37, 34] }).sheet.mapRegion.length, 4);
});
