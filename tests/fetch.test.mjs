import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { withRetry, getJSON, fetchPassage, candidatesFrom, capToBudget, readingFrom, freshSheet, mergeWeek, leyningUrl, TORAH_CORE } from "../scripts/fetch.mjs";
import { makeWeekTorah } from "./helpers/makeWeekTorah.mjs";

const min = JSON.parse(await readFile(new URL("./fixtures/week-min/sheet.json", import.meta.url), "utf8"));
const CUSTOMS = { id: "test", calendar: { diaspora: true }, haftarahRite: "ashkenazi", torah: { mode: "selection" }, versions: { he: "Hebrew Version", en: "English Version" }, entryCap: 24, series: { name: "Test Series" }, credits: { issuedBy: "A Congregation" } };

test("withRetry tries three times with growing waits, and gives up at once on what retrying cannot fix", async () => {
  const waits = [];
  let n = 0;
  assert.equal(await withRetry(async () => { if (++n < 3) throw new Error("503"); return "ok"; }, { sleepImpl: async ms => waits.push(ms) }), "ok");
  assert.deepEqual(waits, [1500, 4000]);
  n = 0;
  await assert.rejects(withRetry(async () => { n++; throw new Error("always"); }, { sleepImpl: async () => {} }), /always/);
  assert.equal(n, 3);
  n = 0;
  await assert.rejects(withRetry(async () => { n++; throw new Error("404"); }, { sleepImpl: async () => {}, retryable: e => e.message !== "404" }), /404/);
  assert.equal(n, 1);
});

test("getJSON retries a 5xx and a network error, never a 4xx", async () => {
  let calls = 0;
  const flaky = async () => (++calls < 3 ? new Response("busy", { status: 503, statusText: "Busy" }) : new Response('{"ok":1}', { status: 200 }));
  assert.deepEqual(await getJSON("https://example.test/x", { fetchImpl: flaky, sleepImpl: async () => {} }), { ok: 1 });
  assert.equal(calls, 3);
  calls = 0;
  const missing = async () => { calls++; return new Response("no", { status: 404, statusText: "Not Found" }); };
  await assert.rejects(getJSON("https://example.test/y", { fetchImpl: missing, sleepImpl: async () => {} }), /404 Not Found for https:\/\/example\.test\/y/);
  assert.equal(calls, 1);
});

test("leyningUrl asks Hebcal for the customs' calendar", () => {
  assert.equal(leyningUrl("2026-10-17", CUSTOMS), "https://www.hebcal.com/leyning?cfg=json&start=2026-10-17&end=2026-10-17&i=off");
  assert.match(leyningUrl("2026-10-17", { ...CUSTOMS, calendar: { diaspora: false } }), /&i=on$/);
});

test("fetchPassage asks for the customs' versions and gives every verse its book", async () => {
  const urls = [];
  const get = async url => { urls.push(url); return {
    book: "Genesis", heRef: "synthetic", sections: [6, 9], toSections: [6, 11],
    versions: [{ languageFamilyName: "hebrew", text: ["אבג דהו", "זחט", "יכל"] }, { languageFamilyName: "english", text: ["One here.", "Two here.", "Three here."] }],
  }; };
  const p = await fetchPassage("Genesis 6:9-11", { versions: CUSTOMS.versions, get });
  assert.ok(urls[0].includes(`version=hebrew|${encodeURIComponent("Hebrew Version")}`) && urls[0].includes(`version=english|${encodeURIComponent("English Version")}`));
  assert.equal(p.book, "Genesis");
  assert.deepEqual(p.verses.map(v => [v.ref, v.book, v.chapter, v.verse]), [["Genesis 6:9", "Genesis", 6, 9], ["Genesis 6:10", "Genesis", 6, 10], ["Genesis 6:11", "Genesis", 6, 11]]);
  await assert.rejects(fetchPassage("Genesis 6:9-11", { versions: CUSTOMS.versions, get: async () => ({ versions: [] }) }), /did not return both versions for Genesis 6:9-11/);
});

test("candidatesFrom sets super-commentaries and quoting commentary aside for the Torah only", () => {
  const links = [
    { index_title: "Rashi on Genesis", category: "Commentary", ref: "Rashi on Genesis 6:9:1", anchorRef: "Genesis 6:9", sourceHasEn: true },
    { index_title: "Siftei Chakhamim", category: "Commentary", ref: "Siftei Chakhamim, Genesis 6:9:1", anchorRef: "Genesis 6:9" },
    { index_title: "Mechokekei Yehudah; Yahel Ohr", category: "Commentary", ref: "Mechokekei Yehudah, Genesis 6:9", anchorRef: "Genesis 6:9" },
    { index_title: "Some Later Work", category: "Quoting Commentary", ref: "Some Later Work 3", anchorRef: "Genesis 6:9" },
  ];
  const t = candidatesFrom(links, { kind: "torah" });
  assert.deepEqual(t.candidates.map(c => c.source), ["Rashi on Genesis"]);
  assert.deepEqual(t.skipped.map(s => s.source).sort(), ["Mechokekei Yehudah; Yahel Ohr", "Siftei Chakhamim", "Some Later Work"]);
  const h = candidatesFrom(links, { kind: "haftarah" });
  assert.equal(h.candidates.length, 4);
  assert.deepEqual(h.skipped, []);
  assert.ok(TORAH_CORE.includes("Ramban") && TORAH_CORE.includes("Rashbam"));
});

test("capToBudget drops whole commentaries from the end, never the first", () => {
  const big = n => ({ segments: { s: "x".repeat(n) } });
  const { kept, dropped } = capToBudget({ "Rashi on Genesis": big(300), "Ramban on Genesis": big(300), "Sforno on Genesis": big(300) }, 800);
  assert.deepEqual(Object.keys(kept), ["Rashi on Genesis", "Ramban on Genesis"]);
  assert.deepEqual(dropped, ["Sforno on Genesis"]);
  assert.deepEqual(Object.keys(capToBudget({ "Rashi on Genesis": big(5000) }, 10).kept), ["Rashi on Genesis"]);
});

test("freshSheet writes schema 3: Torah first, then the haftarah; series, versions and credits from the customs", () => {
  const passage = { ref: "Genesis 6:9-11", heRef: null, book: "Genesis", verses: [{ ref: "Genesis 6:9", book: "Genesis", chapter: 6, verse: 9, he: "אבג דהו", en: "One here, and more.", notes: [], break: null }] };
  const torah = readingFrom("torah", passage, { titleEn: "Noach", versions: CUSTOMS.versions, fetched: "t", extra: { selection: "aliyah 1", aliyot: [], maftir: null } });
  const haftarah = readingFrom("haftarah", { ...passage, ref: "Isaiah 54:1", book: "Isaiah" }, { titleEn: "Haftarat Noach", versions: CUSTOMS.versions, fetched: "t", extra: { defaultHaftarah: null } });
  const s = freshSheet({ slug: "2026-10-17-noach", date: "2026-10-17", item: { name: { en: "Noach", he: "נֹחַ" }, summary: "Genesis 6:9-11:32" }, conv: { hebrew: "ו׳ חשון", hd: 6, hm: "Cheshvan", hy: 5787 }, customs: CUSTOMS, special: null, readings: [torah, haftarah], leyning: { parashah: "Noach", aliyot: [] }, nextWeek: null });
  assert.equal(s.schema, 3);
  assert.deepEqual(s.readings.map(r => [r.id, r.kind]), [["torah", "torah"], ["haftarah", "haftarah"]]);
  assert.deepEqual(s.series, { name: "Test Series", year: "5787" });
  assert.deepEqual(s.credits, { issuedBy: "A Congregation" });
  assert.deepEqual(s.readings[0].versions, CUSTOMS.versions);
  assert.equal(s.readings[0].selection, "aliyah 1");
  assert.equal(s.shabbat.hebrewEn, "6 Cheshvan 5787");
  assert.deepEqual(s.leyning, { parashah: "Noach", aliyot: [] });
  assert.ok(!("haftarah" in s) && !("verses" in s));
});

const TORAH = { id: "torah", kind: "torah", ref: "Genesis 6:9-22", book: "Genesis", selection: "aliyah 1", verses: [{ book: "Genesis", chapter: 6, verse: 9 }], glosses: [], commentary: [] };
const LEY = { parashah: "Noach", aliyot: [{ n: 1, ref: "Genesis 6:9-22" }] };

test("mergeWeek: a kept schema-2 week without a Torah pick is left exactly as it was", () => {
  const r = mergeWeek(min, { torah: null, leyning: LEY });
  assert.equal(r.sheet, min);
  assert.equal(r.changed, false);
});

test("mergeWeek: a Torah pick on a kept schema-2 week migrates it and puts the Torah first; the haftarah keeps every entry", () => {
  const r = mergeWeek(min, { torah: TORAH, leyning: LEY });
  assert.equal(r.changed, true);
  assert.equal(r.sheet.schema, 3);
  assert.deepEqual(r.sheet.readings.map(x => x.id), ["torah", "haftarah"]);
  assert.equal(r.sheet.readings[1].commentary.length, min.commentary.length);
  assert.ok(r.sheet.readings[1].commentary.every(e => /^e-[0-9a-f]{8}/.test(e.id)));
  assert.deepEqual(r.sheet.leyning, LEY);
  assert.deepEqual(r.notes, ["added the Torah reading Genesis 6:9-22"]);
  assert.equal(min.schema, 2, "the input is not changed");
});

test("mergeWeek: the same pick again changes nothing; an untouched Torah reading is replaced; one with entries is kept", () => {
  const once = mergeWeek(min, { torah: TORAH, leyning: LEY }).sheet;
  const again = mergeWeek(once, { torah: TORAH, leyning: LEY });
  assert.equal(again.changed, false);
  const other = { ...TORAH, ref: "Genesis 7:1-16", selection: "aliyah 2" };
  const swapped = mergeWeek(once, { torah: other, leyning: LEY });
  assert.equal(swapped.sheet.readings[0].ref, "Genesis 7:1-16");
  assert.deepEqual(swapped.notes, ["replaced the Torah reading Genesis 6:9-22 with Genesis 7:1-16"]);
  const worked = makeWeekTorah(min);   // its Torah reading has an entry and a gloss
  assert.throws(() => mergeWeek(worked, { torah: other, leyning: LEY }), /Torah reading \(Genesis 6:9-11\) already has 1 entry and 1 gloss; --force replaces the whole sheet/);
});
