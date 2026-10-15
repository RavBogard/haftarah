import { test } from "node:test";
import assert from "node:assert/strict";
import { hebcalRef, parseRange, aliyotOf, leyningOf, parsePick, defaultPick, selectTorah, aliyotLines, aliyotMarkdown } from "../scripts/leyning.mjs";

const NOACH = { name: { en: "Noach", he: "נֹחַ" }, type: "shabbat", summary: "Genesis 6:9-11:32",
  fullkriyah: { 1: { k: "Genesis", b: "6:9", e: "6:22", v: 14 }, 2: { k: "Genesis", b: "7:1", e: "7:16", v: 16 }, 3: { k: "Genesis", b: "7:17", e: "8:14", v: 22 },
    4: { k: "Genesis", b: "8:15", e: "9:7", v: 15 }, 5: { k: "Genesis", b: "9:8", e: "9:17", v: 10 }, 6: { k: "Genesis", b: "9:18", e: "10:32", v: 44 },
    7: { k: "Genesis", b: "11:1", e: "11:32", v: 32 }, M: { k: "Genesis", b: "11:29", e: "11:32", v: 4 } },
  triennial: { 1: { k: "Genesis", b: "8:15", e: "8:22", v: 8 }, 7: { k: "Genesis", b: "10:21", e: "10:32", v: 12 }, M: { k: "Genesis", b: "10:26", e: "10:32", v: 7 } },
  triYear: 2 };
// 2026-12-05: Vayeshev on the first day of Chanukah; the maftir is from Numbers.
const CHANUKAH = { name: { en: "Vayeshev" }, type: "shabbat", summary: "Genesis 37:1-40:23; Numbers 7:1-17",
  fullkriyah: { 1: { k: "Genesis", b: "37:1", e: "37:11", v: 11 }, 7: { k: "Genesis", b: "40:1", e: "40:23", v: 23 },
    M: { p: 35, k: "Numbers", b: "7:1", e: "7:17", v: 17, reason: "Chanukah Day 1 (on Shabbat)" } },
  reason: { haftara: "Chanukah Day 1 (on Shabbat)", M: "Chanukah Day 1 (on Shabbat)" } };
// 2027-04-24: a festival Shabbat; Hebcal's holiday item has the same shape and no triennial.
const PESACH = { name: { en: "Pesach Shabbat Chol ha-Moed" }, type: "holiday", summary: "Exodus 33:12-34:26; Numbers 28:19-25; Song of Songs 1:1-8:14",
  fullkriyah: { 1: { p: 21, k: "Exodus", b: "33:12", e: "33:16", v: 5 }, 7: { p: 21, k: "Exodus", b: "34:18", e: "34:26", v: 9 }, M: { p: 41, k: "Numbers", b: "28:19", e: "28:25", v: 7 } } };

test("hebcalRef and parseRange: one range in one book, either way round", () => {
  assert.equal(hebcalRef({ k: "Genesis", b: "6:9", e: "6:22" }), "Genesis 6:9-22");
  assert.equal(hebcalRef({ k: "Genesis", b: "7:17", e: "8:14" }), "Genesis 7:17-8:14");
  assert.equal(hebcalRef({ k: "Exodus", b: "30:11", e: "30:11" }), "Exodus 30:11");
  assert.equal(hebcalRef(null), "");
  assert.deepEqual(parseRange("Genesis 6:9-7:16"), { book: "Genesis", from: [6, 9], to: [7, 16] });
  assert.deepEqual(parseRange("I Samuel 20:18-42"), { book: "I Samuel", from: [20, 18], to: [20, 42] });
  assert.deepEqual(parseRange("Exodus 30:11"), { book: "Exodus", from: [30, 11], to: [30, 11] });
  assert.equal(parseRange("Isaiah 27:6-28:13; 29:22-23"), null);
  assert.equal(parseRange("Genesis"), null);
});

test("leyningOf keeps the full aliyot list with the maftir, and the triennial reading with its year", () => {
  const l = leyningOf(NOACH);
  assert.equal(l.parashah, "Noach");
  assert.equal(l.aliyot.length, 8);
  assert.deepEqual(l.aliyot[0], { n: 1, ref: "Genesis 6:9-22", verses: 14 });
  assert.deepEqual(l.aliyot[7], { n: "M", ref: "Genesis 11:29-32", verses: 4 });
  assert.equal(l.triennial.year, 2);
  assert.equal(leyningOf(PESACH).triennial, null);
  assert.deepEqual(aliyotOf(CHANUKAH.fullkriyah).at(-1), { n: "M", ref: "Numbers 7:1-17", verses: 17, reason: "Chanukah Day 1 (on Shabbat)" });
});

test("parsePick takes aliyah:N, aliyah:N-M, aliyah:M, triennial and full, and refuses the rest", () => {
  assert.deepEqual(parsePick("aliyah:2"), { kind: "aliyah", from: 2, to: 2 });
  assert.deepEqual(parsePick("aliyah:1-3"), { kind: "aliyah", from: 1, to: 3 });
  assert.deepEqual(parsePick("Aliyah:M"), { kind: "aliyah", from: "M", to: "M" });
  assert.deepEqual(parsePick("triennial"), { kind: "triennial" });
  assert.deepEqual(parsePick("full"), { kind: "full" });
  for (const bad of ["aliyah:0", "aliyah:3-2", "aliyah:8", "aliyah:7-M", "aliyah:M-2", "aliyot:1", "", "first"]) assert.throws(() => parsePick(bad), /--torah-pick/, bad);
});

test("defaultPick: a weekly selection waits for Daniel; a triennial or full custom picks for itself", () => {
  assert.equal(defaultPick({ torah: { mode: "selection", rule: "weekly" } }), null);
  assert.deepEqual(defaultPick({ torah: { mode: "triennial" } }), { kind: "triennial" });
  assert.deepEqual(defaultPick({ torah: { mode: "full" } }), { kind: "full" });
  assert.equal(defaultPick(null), null);
});

test("selectTorah joins aliyot into one range and always carries the maftir beside it", () => {
  const l = leyningOf(NOACH);
  assert.deepEqual(selectTorah(l, parsePick("aliyah:1-2")), { ref: "Genesis 6:9-7:16", book: "Genesis", selection: "aliyot 1-2", maftir: { ref: "Genesis 11:29-32" } });
  assert.equal(selectTorah(l, parsePick("aliyah:3")).ref, "Genesis 7:17-8:14");
  assert.equal(selectTorah(l, parsePick("aliyah:3")).selection, "aliyah 3");
  assert.equal(selectTorah(l, parsePick("full")).ref, "Genesis 6:9-11:32");
  assert.deepEqual(selectTorah(l, parsePick("triennial")), { ref: "Genesis 8:15-10:32", book: "Genesis", selection: "triennial year 2", maftir: { ref: "Genesis 11:29-32" } });
  assert.deepEqual(selectTorah(l, { kind: "ref", ref: "Genesis 6:9-6:22" }), { ref: "Genesis 6:9-6:22", book: "Genesis", selection: "custom", maftir: { ref: "Genesis 11:29-32" } });
  assert.throws(() => selectTorah(l, { kind: "ref", ref: "Genesis 6" }), /is not one range/);
});

test("selectTorah on Shabbat Chanukah: the special maftir is reported, never folded into a Genesis selection", () => {
  const l = leyningOf(CHANUKAH);
  const s = selectTorah(l, parsePick("aliyah:1"));
  assert.equal(s.ref, "Genesis 37:1-11");
  assert.deepEqual(s.maftir, { ref: "Numbers 7:1-17", reason: "Chanukah Day 1 (on Shabbat)" });
  assert.deepEqual(selectTorah(l, parsePick("aliyah:M")), { ref: "Numbers 7:1-17", book: "Numbers", selection: "maftir", maftir: { ref: "Numbers 7:1-17", reason: "Chanukah Day 1 (on Shabbat)" } });
  assert.throws(() => selectTorah(l, parsePick("triennial")), /Hebcal gives no triennial reading for Vayeshev/);
  assert.throws(() => selectTorah(l, parsePick("aliyah:1-2")), /Hebcal lists no aliyah 2 for Vayeshev/, "a gap in the list (this item is trimmed) is refused, never bridged");
  const p = leyningOf(PESACH);
  assert.equal(selectTorah(p, parsePick("full")).ref, "Exodus 33:12-34:26");
  assert.equal(selectTorah(p, parsePick("full")).selection, "full reading");
});

test("aliyotLines and aliyotMarkdown show the whole list, the maftir's reason and the selection (or how to make one)", () => {
  const l = leyningOf(CHANUKAH);
  const lines = aliyotLines(l);
  assert.equal(lines[0], "Torah: Vayeshev (Hebcal)");
  assert.ok(lines.includes("  M  Numbers 7:1-17  (17 verses; Chanukah Day 1 (on Shabbat))"));
  const md = aliyotMarkdown(leyningOf(NOACH), null);
  assert.match(md, /^# Torah calendar: Noach\n/);
  assert.match(md, /1 Genesis 6:9-22 \(14\) · 2 Genesis 7:1-16 \(16\)/);
  assert.match(md, /Triennial year 2: Genesis 8:15-10:32\./);
  assert.match(md, /Selection: none yet\. Pick with fetch\.mjs --torah-pick aliyah:N\[-M\], triennial or full, or --torah "<ref>"\./);
  assert.match(aliyotMarkdown(leyningOf(NOACH), { ref: "Genesis 6:9-7:16", selection: "aliyot 1-2" }), /Selection: aliyot 1-2, Genesis 6:9-7:16\./);
});
