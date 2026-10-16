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
