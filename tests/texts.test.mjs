import { test } from "node:test";
import assert from "node:assert/strict";
import { planChapter, chapterSegments, selectLinked, linkTier, weeksTaken } from "../scripts/fetch.mjs";

const range = (a, b) => new Set(Array.from({ length: b - a + 1 }, (_, i) => a + i));

test("planChapter: a commentator who comments on every verse is kept verse by verse, nothing section-filed", () => {
  const { keep, coverage } = planChapter([300, 200, 250, 400, 180, 220], range(1, 6));
  assert.deepEqual([...keep.keys()], [1, 2, 3, 4, 5, 6]);
  assert.ok([...keep.values()].every(x => !x.sectionFiled));
  assert.equal(coverage.size, 0);
});

test("planChapter: short comments with a skipped verse are not mistaken for a section", () => {
  const { keep, coverage } = planChapter([300, 0, 250, 400, 180, 220], range(1, 6));
  assert.equal(keep.get(1).sectionFiled, false);
  assert.equal(coverage.size, 0);
});

test("planChapter: Abarbanel-style long comments on few verses are section-filed and cover the silent verses", () => {
  // Isaiah 54 as Abarbanel files it: 54:1, 6, 9, 11, 14 of 17 verses
  const lens = [5900, 0, 0, 0, 0, 1423, 0, 0, 1923, 0, 960, 0, 0, 6357, 0, 0, 0];
  const { keep, coverage } = planChapter(lens, range(1, 17));
  assert.deepEqual([...keep.keys()], [1, 6, 9, 11, 14]);
  assert.deepEqual(keep.get(1), { sectionFiled: true, coversFrom: 1, coversTo: 5 });
  assert.deepEqual(keep.get(11), { sectionFiled: true, coversFrom: 11, coversTo: 13 });
  assert.deepEqual(keep.get(14), { sectionFiled: true, coversFrom: 14, coversTo: 17 });
  assert.equal(coverage.get(7), 6);
  assert.equal(coverage.get(17), 14);
  assert.equal(coverage.has(6), false);
});

test("planChapter: a section comment just before a mid-chapter reading is kept when it covers the first verse", () => {
  // reading starts at v. 11 (Re'eh: Isaiah 54:11-55:5); the comment for 9-13 sits under v. 9
  const lens = [5900, 0, 0, 0, 0, 1423, 0, 0, 1923, 0, 0, 0, 0, 6357, 0, 0, 0];
  const { keep, coverage } = planChapter(lens, range(11, 17));
  assert.deepEqual([...keep.keys()], [9, 14]);
  assert.deepEqual(keep.get(9), { sectionFiled: true, coversFrom: 9, coversTo: 13 });
  assert.equal(coverage.get(11), 9);
  assert.equal(keep.has(6), false); // ends before the reading
});

test("planChapter: a single very long comment followed by silence is a section even in a full commentary", () => {
  const lens = [300, 280, 4000, 0, 0, 260, 310, 290, 330, 270];
  const { keep, coverage } = planChapter(lens, range(1, 10));
  assert.deepEqual(keep.get(3), { sectionFiled: true, coversFrom: 3, coversTo: 5 });
  assert.equal(coverage.get(4), 3);
  assert.equal(keep.get(1).sectionFiled, false);
});

test("planChapter: verses after the reading are dropped, silent chapter gives nothing", () => {
  assert.deepEqual([...planChapter([100, 100, 100, 100], range(1, 2)).keep.keys()], [1, 2]);
  assert.equal(planChapter([0, 0, 0], range(1, 3)).keep.size, 0);
});

test("chapterSegments: keys by exact segment ref, keeps every English version, trims only trailing whitespace", () => {
  const tx = {
    indexTitle: "Abarbanel on Isaiah",
    versions: [
      { languageFamilyName: "hebrew", versionTitle: "Tel Aviv 1960", text: [["<b>א</b> " + "ב".repeat(3000) + "  \n", "סוף "], [], [], ["ד"]] },
      { languageFamilyName: "english", versionTitle: "Translation A", text: [["One  "], [], [], []] },
      { languageFamilyName: "english", versionTitle: "Translation B", text: [["Uno"], [], [], []] },
    ],
  };
  const { segments, coverage } = chapterSegments(tx, "Isaiah", 54, range(1, 4));
  assert.deepEqual(Object.keys(segments), ["Abarbanel on Isaiah 54:1:1", "Abarbanel on Isaiah 54:1:2", "Abarbanel on Isaiah 54:4:1"]);
  const s = segments["Abarbanel on Isaiah 54:1:1"];
  assert.ok(s.he.startsWith("<b>א</b> "));
  assert.ok(s.he.endsWith("ב"));
  assert.deepEqual(s.en, [{ versionTitle: "Translation A", text: "One" }, { versionTitle: "Translation B", text: "Uno" }]);
  assert.equal(s.sectionFiled, true);
  assert.equal(s.coversFrom, "Isaiah 54:1");
  assert.equal(s.coversTo, "Isaiah 54:3");
  assert.match(s.note, /under 54:1 covers 54:1–3/);
  assert.equal(segments["Abarbanel on Isaiah 54:4:1"].sectionFiled, undefined);
  assert.deepEqual(coverage, { "Isaiah 54:2": "Abarbanel on Isaiah 54:1", "Isaiah 54:3": "Abarbanel on Isaiah 54:1" });
});

test("chapterSegments: depth-2 texts (Targum, Steinsaltz) key by verse", () => {
  const tx = { indexTitle: "Targum Jonathan on Isaiah", versions: [{ languageFamilyName: "hebrew", versionTitle: "MG", text: ["שַׁבַּחִי", "אַפְתִּי"] }] };
  const { segments } = chapterSegments(tx, "Isaiah", 54, new Set([2]));
  assert.deepEqual(Object.keys(segments), ["Targum Jonathan on Isaiah 54:2"]);
  assert.equal(segments["Targum Jonathan on Isaiah 54:2"].verse, "Isaiah 54:2");
});

test("selectLinked: keeps Talmud, midrash, liturgy, Zohar; drops noise; merges anchors; Talmud first", () => {
  const links = [
    { index_title: "Zohar", category: "Kabbalah", ref: "Zohar, Vayechi 12:82", anchorRef: "Isaiah 54:1" },
    { index_title: "Tikkunei Zohar", category: "Kabbalah", ref: "Tikkunei Zohar 60a:9", anchorRef: "Isaiah 54:1" },
    { index_title: "BDB", category: "Reference", ref: "BDB, רנן 1", anchorRef: "Isaiah 54:1" },
    { index_title: "Yismach Moshe", category: "Chasidut", ref: "Yismach Moshe, Toldot 4:1", anchorRef: "Isaiah 54:1" },
    { index_title: "Bereshit Rabbah", category: "Midrash", ref: "Bereshit Rabbah 5:7", anchorRef: "Isaiah 54:2" },
    { index_title: "Bereshit Rabbah", category: "Midrash", ref: "Bereshit Rabbah 5:7", anchorRef: "Isaiah 54:3" },
    { index_title: "Lekha Dodi", category: "Liturgy", ref: "Lekha Dodi 7:1", anchorRef: "Isaiah 54:4" },
    { index_title: "Ketubot", category: "Talmud", ref: "Ketubot 8a:4", anchorRef: "Isaiah 54:1" },
    { index_title: "Targum Jonathan on Isaiah", category: "Targum", ref: "Targum Jonathan on Isaiah 54:1", anchorRef: "Isaiah 54:1" },
    { index_title: "Peninei Halakhah, Berakhot", category: "Halakhah", ref: "Peninei Halakhah, Berakhot 15:22:3", anchorRef: "Isaiah 54:13" },
    { index_title: "Shulchan Arukh, Orach Chayim", category: "Halakhah", ref: "Shulchan Arukh, Orach Chayim 428:8", anchorRef: "Isaiah 54:1" },
  ];
  const { selected } = selectLinked(links, new Set(["Targum Jonathan on Isaiah"]));
  assert.deepEqual(selected.map(e => e.ref), ["Ketubot 8a:4", "Bereshit Rabbah 5:7", "Lekha Dodi 7:1", "Shulchan Arukh, Orach Chayim 428:8", "Zohar, Vayechi 12:82"]);
  assert.deepEqual(selected[1].anchors, ["Isaiah 54:2", "Isaiah 54:3"]);
});

test("selectLinked: caps each kind and reports what it skipped", () => {
  const links = Array.from({ length: 30 }, (_, i) => ({ index_title: "Zohar", category: "Kabbalah", ref: `Zohar, Noach ${i + 1}`, anchorRef: "Isaiah 54:9" }));
  const { selected, skipped } = selectLinked(links);
  assert.equal(selected.length, linkTier("Zohar", "Kabbalah").cap);
  assert.equal(skipped.length, 30 - selected.length);
});

test("weeksTaken counts Drive-only weeks passed with --known", () => {
  assert.deepEqual(weeksTaken("2026-10-17", [], []), []);
  assert.deepEqual(weeksTaken("2026-10-17", [], ["2026-10-10-bereshit", "2026-10-17-noach"]), ["2026-10-17-noach"]);
  assert.deepEqual(weeksTaken("2026-10-17", ["2026-10-17-noach"], ["2026-10-17-noach"]), ["2026-10-17-noach"]);
});
