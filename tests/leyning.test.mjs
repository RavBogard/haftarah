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
  // The triennial reading carries its own maftir (inside its own range), not the annual one.
  assert.deepEqual(selectTorah(l, parsePick("triennial")), { ref: "Genesis 8:15-10:32", book: "Genesis", selection: "triennial year 2", maftir: { ref: "Genesis 10:26-32" } });
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

// Live Hebcal items (https://www.hebcal.com/leyning?cfg=json&start=D&end=D, fetched 2026-10-15), copied whole
// except the haftarah fields this module never reads. Calendar data only.
const LECH_LECHA = { date: "2026-10-24", hdate: "13 Cheshvan 5787", name: { en: "Lech-Lecha", he: "לֶךְ־לְךָ" }, type: "shabbat", parshaNum: 3, summary: "Genesis 12:1-17:27",
  fullkriyah: { 1: { k: "Genesis", b: "12:1", e: "12:13", v: 13 }, 2: { k: "Genesis", b: "12:14", e: "13:4", v: 11 }, 3: { k: "Genesis", b: "13:5", e: "13:18", v: 14 },
    4: { k: "Genesis", b: "14:1", e: "14:20", v: 20 }, 5: { k: "Genesis", b: "14:21", e: "15:6", v: 10 }, 6: { k: "Genesis", b: "15:7", e: "17:6", v: 37 },
    7: { k: "Genesis", b: "17:7", e: "17:27", v: 21 }, M: { k: "Genesis", b: "17:24", e: "17:27", v: 4 } },
  haftara: "Isaiah 40:27-41:16", haft: { k: "Isaiah", b: "40:27", e: "41:16", v: 21 },
  triennial: { 1: { k: "Genesis", b: "14:1", e: "14:9", v: 9 }, 2: { k: "Genesis", b: "14:10", e: "14:16", v: 7 }, 3: { k: "Genesis", b: "14:17", e: "14:20", v: 4 },
    4: { k: "Genesis", b: "14:21", e: "14:24", v: 4 }, 5: { k: "Genesis", b: "15:1", e: "15:6", v: 6 }, 6: { k: "Genesis", b: "15:7", e: "15:16", v: 10 },
    7: { k: "Genesis", b: "15:17", e: "15:21", v: 5 }, M: { k: "Genesis", b: "15:17", e: "15:21", v: 5 } },
  triYear: 2, triHaftara: "Joshua 10:1-14" };
const MIKETZ = { date: "2026-12-12", hdate: "2 Tevet 5787", name: { en: "Miketz", he: "מִקֵּץ" }, type: "shabbat", parshaNum: 10, summary: "Genesis 41:1-44:17; Numbers 7:54-8:4",
  fullkriyah: { 1: { k: "Genesis", b: "41:1", e: "41:14", v: 14 }, 2: { k: "Genesis", b: "41:15", e: "41:38", v: 24 }, 3: { k: "Genesis", b: "41:39", e: "41:52", v: 14 },
    4: { k: "Genesis", b: "41:53", e: "42:18", v: 23 }, 5: { k: "Genesis", b: "42:19", e: "43:15", v: 35 }, 6: { k: "Genesis", b: "43:16", e: "43:29", v: 14 },
    7: { k: "Genesis", b: "43:30", e: "44:17", v: 22 }, M: { p: 35, k: "Numbers", b: "7:54", e: "8:4", v: 40, reason: "Chanukah Day 8 (on Shabbat)" } },
  haftara: "I Kings 7:40-50", haft: { k: "I Kings", b: "7:40", e: "7:50", v: 11, reason: "Chanukah Day 8 (on Shabbat)" },
  summaryParts: [{ k: "Genesis", b: "41:1", e: "44:17" }, { k: "Numbers", b: "7:54", e: "8:4" }],
  reason: { haftara: "Chanukah Day 8 (on Shabbat)", M: "Chanukah Day 8 (on Shabbat)" },
  triennial: { 1: { k: "Genesis", b: "41:53", e: "41:57", v: 5 }, 2: { k: "Genesis", b: "42:1", e: "42:5", v: 5 }, 3: { k: "Genesis", b: "42:6", e: "42:18", v: 13 },
    4: { k: "Genesis", b: "42:19", e: "42:28", v: 10 }, 5: { k: "Genesis", b: "42:29", e: "42:38", v: 10 }, 6: { k: "Genesis", b: "43:1", e: "43:7", v: 7 },
    7: { k: "Genesis", b: "43:8", e: "43:15", v: 8 }, M: { p: 35, k: "Numbers", b: "7:54", e: "8:4", v: 40, reason: "Chanukah Day 8 (on Shabbat)" } },
  triYear: 2 };
const VAYAKHEL_PEKUDEI = { date: "2026-03-14", hdate: "25 Adar 5786", name: { en: "Vayakhel-Pekudei", he: "וַיַּקְהֵל־פְקוּדֵי" }, type: "shabbat", parshaNum: [22, 23], summary: "Exodus 35:1-40:38, 12:1-20",
  fullkriyah: { 1: { k: "Exodus", b: "35:1", e: "35:29", v: 29 }, 2: { k: "Exodus", b: "35:30", e: "37:16", v: 60 }, 3: { k: "Exodus", b: "37:17", e: "37:29", v: 13 },
    4: { k: "Exodus", b: "38:1", e: "39:1", v: 32 }, 5: { k: "Exodus", b: "39:2", e: "39:21", v: 20 }, 6: { k: "Exodus", b: "39:22", e: "39:43", v: 22 },
    7: { k: "Exodus", b: "40:1", e: "40:38", v: 38 }, M: { p: 15, k: "Exodus", b: "12:1", e: "12:20", v: 20, reason: "Shabbat HaChodesh" } },
  haftara: "Ezekiel 45:16-46:18", summaryParts: [{ k: "Exodus", b: "35:1", e: "40:38" }, { k: "Exodus", b: "12:1", e: "12:20" }],
  reason: { haftara: "Shabbat HaChodesh", sephardic: "Shabbat HaChodesh", chabad: "Shabbat HaChodesh", M: "Shabbat HaChodesh" },
  triennial: { 1: { k: "Exodus", b: "35:1", e: "35:10", v: 10 }, 2: { k: "Exodus", b: "35:11", e: "35:20", v: 10 }, 3: { k: "Exodus", b: "35:21", e: "35:29", v: 9 },
    4: { k: "Exodus", b: "35:30", e: "36:7", v: 13 }, 5: { k: "Exodus", b: "36:8", e: "36:19", v: 12 }, 6: { k: "Exodus", b: "36:20", e: "36:38", v: 19 },
    7: { k: "Exodus", b: "37:1", e: "37:16", v: 16 }, M: { p: 15, k: "Exodus", b: "12:1", e: "12:20", v: 20, reason: "Shabbat HaChodesh" } },
  triYear: 1 };

test("real Lech-Lecha: seven aliyot and the maftir; the triennial reading with its year and its own maftir", () => {
  const l = leyningOf(LECH_LECHA);
  assert.equal(l.aliyot.length, 8);
  assert.deepEqual(l.aliyot.at(-1), { n: "M", ref: "Genesis 17:24-27", verses: 4 });
  assert.equal(selectTorah(l, parsePick("full")).ref, "Genesis 12:1-17:27");
  assert.deepEqual(selectTorah(l, parsePick("triennial")), { ref: "Genesis 14:1-15:21", book: "Genesis", selection: "triennial year 2", maftir: { ref: "Genesis 15:17-21" } });
  assert.deepEqual(selectTorah(l, parsePick("aliyah:4-5")), { ref: "Genesis 14:1-15:6", book: "Genesis", selection: "aliyot 4-5", maftir: { ref: "Genesis 17:24-27" } });
});

test("real Miketz on Shabbat Chanukah: the Numbers maftir with its reason, never inside a Genesis selection", () => {
  const l = leyningOf(MIKETZ);
  const chanukah = { ref: "Numbers 7:54-8:4", reason: "Chanukah Day 8 (on Shabbat)" };
  assert.deepEqual(l.aliyot.at(-1), { n: "M", ref: "Numbers 7:54-8:4", verses: 40, reason: "Chanukah Day 8 (on Shabbat)" });
  assert.throws(() => parsePick("aliyah:7-M"), /--torah-pick/);
  assert.deepEqual(selectTorah(l, parsePick("aliyah:M")), { ref: "Numbers 7:54-8:4", book: "Numbers", selection: "maftir", maftir: chanukah });
  assert.deepEqual(selectTorah(l, parsePick("full")), { ref: "Genesis 41:1-44:17", book: "Genesis", selection: "full reading", maftir: chanukah });
  assert.deepEqual(selectTorah(l, parsePick("triennial")), { ref: "Genesis 41:53-43:15", book: "Genesis", selection: "triennial year 2", maftir: chanukah });
  assert.deepEqual(selectTorah(l, parsePick("aliyah:7")).maftir, chanukah);
});

test("real Vayakhel-Pekudei: a combined parashah keeps its joined name, both halves' aliyot and the Shabbat HaChodesh maftir", () => {
  const l = leyningOf(VAYAKHEL_PEKUDEI);
  assert.equal(l.parashah, "Vayakhel-Pekudei");
  assert.deepEqual(selectTorah(l, parsePick("full")), { ref: "Exodus 35:1-40:38", book: "Exodus", selection: "full reading", maftir: { ref: "Exodus 12:1-20", reason: "Shabbat HaChodesh" } });
  assert.equal(selectTorah(l, parsePick("triennial")).selection, "triennial year 1");
  assert.equal(selectTorah(l, parsePick("aliyah:6-7")).ref, "Exodus 39:22-40:38");
});

test("an item with no fullkriyah gives an empty list and refuses a selection in words, never a TypeError", () => {
  const l = leyningOf({ name: { en: "Rosh Hashana II" }, type: "holiday", summary: "" });
  assert.deepEqual(l.aliyot, []);
  assert.equal(l.triennial, null);
  assert.deepEqual(leyningOf(undefined).aliyot, []);
  assert.throws(() => selectTorah(l, parsePick("full")), /cannot join/);
  assert.throws(() => selectTorah(l, parsePick("aliyah:1")), /Hebcal lists no aliyah 1 for Rosh Hashana II/);
  assert.match(aliyotMarkdown(l, null), /From Hebcal: no aliyot listed\./);
});

test("the item-level reason.M supplies the maftir's reason when the aliyah carries none", () => {
  const item = structuredClone(MIKETZ);
  delete item.fullkriyah.M.reason; delete item.triennial.M.reason;
  const l = leyningOf(item);
  assert.equal(l.aliyot.at(-1).reason, "Chanukah Day 8 (on Shabbat)");
  assert.equal(l.triennial.aliyot.at(-1).reason, "Chanukah Day 8 (on Shabbat)");
  assert.equal(leyningOf(LECH_LECHA).aliyot.at(-1).reason, undefined, "no reason invented on an ordinary Shabbat");
});

test("selectTorah refuses a missing pick, a backwards ref and a book written with an Arabic numeral, each in words", () => {
  const l = leyningOf(LECH_LECHA);
  assert.throws(() => selectTorah(l, null), /no Torah selection: pass --torah-pick/);
  assert.throws(() => selectTorah(l, undefined), /no Torah selection/);
  assert.throws(() => selectTorah(l, { kind: "ref", ref: "Genesis 15:6-14:1" }), /ends before it begins/);
  assert.throws(() => selectTorah(l, { kind: "ref", ref: "Genesis 14:9-14:1" }), /ends before it begins/);
  assert.throws(() => selectTorah(l, { kind: "ref", ref: "1 Samuel 3:1" }), /Roman numerals.*"I Samuel 3:1"/);
  assert.equal(selectTorah(l, { kind: "ref", ref: "I Samuel 3:1" }).book, "I Samuel");
});

test("no triennial year from Hebcal: the label says triennial, never 'year null'", () => {
  const item = structuredClone(LECH_LECHA); delete item.triYear;
  const l = leyningOf(item);
  assert.equal(selectTorah(l, parsePick("triennial")).selection, "triennial");
  assert.ok(!aliyotLines(l).join("\n").includes("null"));
  assert.ok(!aliyotMarkdown(l, null).includes("null"));
  assert.match(aliyotMarkdown(l, null), /\nTriennial: Genesis 14:1-15:21\./);
});

test("aliyotMarkdown marks the selected aliyot and names a special maftir beside the selection", () => {
  const l = leyningOf(MIKETZ);
  const md = aliyotMarkdown(l, selectTorah(l, parsePick("aliyah:2-3")));
  assert.match(md, /From Hebcal: 1 Genesis 41:1-14 \(14\) · ▸ 2 Genesis 41:15-38 \(24\) · ▸ 3 Genesis 41:39-52 \(14\) · 4 Genesis/);
  assert.ok(!/▸ M/.test(md), "the maftir is not marked when it is not the pick");
  assert.match(md, /Selection: aliyot 2-3, Genesis 41:15-52\.\nMaftir: Numbers 7:54-8:4 — Chanukah Day 8 \(on Shabbat\) \(read separately, not part of the selection\)\.\n$/);
  const mm = aliyotMarkdown(l, selectTorah(l, parsePick("aliyah:M")));
  assert.match(mm, /· ▸ M Numbers 7:54-8:4/);
  assert.equal((mm.match(/▸ \S+ (Genesis|Numbers)/g) || []).length, 1, "only M is marked");
  assert.match(mm, /Maftir: Numbers 7:54-8:4 — Chanukah Day 8 \(on Shabbat\)\.\n$/);
  // No selection yet: the special maftir is still named; an ordinary maftir gets no line.
  assert.match(aliyotMarkdown(l, null), /Maftir: Numbers 7:54-8:4 — Chanukah Day 8/);
  const ll = leyningOf(LECH_LECHA), full = aliyotMarkdown(ll, selectTorah(ll, parsePick("full")));
  assert.ok(!/Maftir:/.test(full));
  // Full on Lech-Lecha marks 1-7 and not M (whose verses sit inside aliyah 7).
  assert.equal((full.match(/▸ \d/g) || []).length, 7);
  assert.ok(!/▸ M/.test(full));
});
