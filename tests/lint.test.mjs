import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { lint, lintSheet, entryCounts, applyFixes, godLanguage, wordCount, loadBasemap } from "../scripts/lint.mjs";
import { makeWeekTorah } from "./helpers/makeWeekTorah.mjs";
import { migrate3 } from "../scripts/migrate.mjs";
import { gapReport, analyse } from "../scripts/check.mjs";
const require = createRequire(import.meta.url);
const lib = require("../template/lib.js");
const voices = JSON.parse(await readFile(new URL("../template/voices.json", import.meta.url), "utf8"));

// ---- normalization matching -------------------------------------------------

// bet + dagesh + qamats as stored; bet + qamats + dagesh as typed. Same word, different code points.
const STORED = "וְכׇל־בָּנַ֖יִךְ לִמּוּדֵ֣י";
const TYPED = "בָּ" + "נַ֖יִךְ";

test("hebrewKey ignores mark order, cantillation, meteg and qamats qatan", () => {
  assert.notEqual("בָּ", "בָּ");
  assert.equal(lib.hebrewKey("בָּ"), lib.hebrewKey("בָּ"));
  assert.equal(lib.hebrewKey("הָאָֽזֶל׃".replace("׃", "")), lib.hebrewKey("הָאָזֶל"));       // meteg
  assert.equal(lib.hebrewKey("עֲקָרָ֖ה"), lib.hebrewKey("עֲקָרָה"));                     // tipcha
  assert.equal(lib.hebrewKey("כׇּל"), lib.hebrewKey("כָּל"));                            // qamats qatan
  assert.equal(lib.hebrewKey("ב͏ָ"), lib.hebrewKey("בָ"));                // grapheme joiner
  assert.notEqual(lib.hebrewKey("בָּנַיִךְ"), lib.hebrewKey("בֹּנַיִךְ"));                    // a different vowel is not the same word
});

test("findHebrew reports the level and the exact verse text", () => {
  assert.equal(lib.findHebrew(STORED, "לִמּוּדֵ֣י").level, "exact");
  const n = lib.findHebrew(STORED, TYPED);
  assert.equal(n.level, "normalized");
  assert.equal(n.text, "בָּנַ֖יִךְ");
  assert.equal(STORED.slice(n.start, n.end), n.text);
  const c = lib.findHebrew(STORED, "בֹּנַיִךְ");
  assert.equal(c.level, "consonantal");
  assert.equal(lib.findHebrew(STORED, "שָׁלוֹם"), null);
});

test("findHebrew matches a multi-word lemma across a maqaf and ignores tags and keys", () => {
  const html = 'כִּֽי־<b>רַבִּ֧ים</b><sup class="fn he">a</sup> בְּֽנֵי־שׁוֹמֵמָ֛ה';
  const r = lib.findHebrew(html, "כִּי־רַבִּים");
  assert.equal(r.level, "normalized");
  assert.equal(r.text, "כִּֽי־<b>רַבִּ֧ים");
});

test("findEnglish strips tags, folds quotes and space, and closes a small-caps tag", () => {
  const html = 'disciples of </span> G<small>OD</small>,<br>And great';
  const r = lib.findEnglish(html, "of GOD");
  assert.ok(r);
  assert.equal(html.slice(r.end, r.end + 1), ",");   // past </small>
  const q = lib.findEnglish('called “God of all the Earth”—', '"God of all the Earth"');
  assert.ok(q);
  assert.equal(lib.findEnglish("Shout, O infertile one,", "infertile one").level, "exact");
  assert.equal(lib.findEnglish("Shout, O infertile one,", "barren"), null);
});

test("assignKeys keys a gloss whose English crosses markup", () => {
  const verses = [{ chapter: 54, verse: 13, he: STORED, notes: [], en: '<span class="poetry">And all your children shall be disciples of </span> G<small>OD</small>,' }];
  const r = lib.assignKeys(verses, [{ chapter: 54, verse: 13, lemma: TYPED, en: "disciples of GOD", text: "x" }], () => true);
  assert.match(r.verses[0].en, /G<small>OD<\/small><sup class="fn">a<\/sup>,$/);
});

// ---- voices -----------------------------------------------------------------

test("voiceKey takes the longest key at a word boundary", () => {
  assert.equal(lib.voiceKey("Midrash Tehillim 87:2", voices), "Midrash Tehillim");
  assert.equal(lib.voiceKey("Pesikta Rabbati 31", voices), "Pesikta Rabbati");
  assert.equal(lib.voiceKey("Pesikta de-Rav Kahana", voices), "Pesikta");
  assert.equal(lib.voiceKey("Jerusalem Talmud, Berakhot 2:1", voices), "Jerusalem Talmud");
  assert.equal(lib.voiceKey("Tze’enah Ure’enah", voices), "Tze'enah Ure'enah");
  assert.equal(lib.voiceKey("Talmudic lore", voices), null);
});

test("voices.json identifies every source the runbook names", () => {
  for (const k of ["Zohar", "Lekha Dodi", "Tosefta", "Ein Yaakov", "Tze'enah Ure'enah", "Shadal", "Chomat Anakh", "Minchat Shai", "Abudarham",
    "Pesikta Rabbati", "Bereshit Rabbah", "Midrash Rabbah", "Tanchuma", "Yalkut Shimoni", "Midrash Tehillim", "Kohelet Rabbah", "Jerusalem Talmud", "Mekhilta"])
    assert.ok(voices[k] && voices[k].length > 10, k);
});

test("voicesFor collapses Talmud and Jerusalem Talmud refs into one line each", () => {
  const c = ["Talmud, Berakhot 10a", "Rashi", "Talmud, Sanhedrin 99a", "Jerusalem Talmud, Berakhot 2:1", "Talmud, Berakhot 10a", "Jerusalem Talmud, Taanit 4:5"]
    .map(source => ({ register: "traditional", source }));
  const r = lib.voicesFor(c, voices, () => true);
  assert.deepEqual(r.map(v => [v.name, v.refs]), [["Talmud", ["Berakhot 10a", "Sanhedrin 99a"]], ["Rashi", []], ["Jerusalem Talmud", ["Berakhot 2:1", "Taanit 4:5"]]]);
  assert.equal(r[0].line, "the Babylonian Talmud, c. 200–500 CE");
});

// ---- lint rules -------------------------------------------------------------

const words = n => Array.from({ length: n }, (_, i) => `w${i}`).join(" ");
function week() {
  return {
    haftarah: { book: "Isaiah", incipit: { he: "א", en: "a" } },
    verses: [
      { chapter: 54, verse: 11, he: "אָנֹכִ֗י מַרְבִּ֤יץ בַּפּוּךְ֙ אֲבָנַ֔יִךְ", en: 'I will lay carbuncles<sup class="fn">d</sup> as your building stones', notes: [{ marker: "d", lemma: "carbuncles", text: "Taking pukh." }] },
      { chapter: 54, verse: 13, he: STORED, en: "And all your children shall be disciples", notes: [] },
    ],
    glosses: [
      { chapter: 54, verse: 11, lemma: "בַּפּוּךְ֙", en: "as your building stones", text: words(20) },
      { chapter: 54, verse: 13, lemma: TYPED, en: "your children", text: words(20) },
    ],
    commentary: [
      { chapter: 54, verse: 11, register: "traditional", source: "Rashi", sourceRef: "x", text: words(50) },
      { chapter: 54, verse: 13, register: "critical", source: "A title", works: ["x"], text: words(80) },
    ],
    glossary: [{ term: "David", text: "King of Israel, to whom God promised a dynasty." }],
    openingNote: { calendar: "God’s oath after the flood.", setting: ["The audience is exiles."] },
  };
}

test("lint is clean on a clean week except the fixable mark-order lemma", () => {
  const r = lint(week(), { voices });
  assert.deepEqual(r.errors, []);
  assert.equal(r.warnings.length, 1, JSON.stringify(r.warnings));
  assert.match(r.warnings[0].msg, /not the verse's exact text.*--fix/);
  assert.deepEqual(r.fixes, [{ index: 1, field: "lemma", from: TYPED, to: "בָּנַ֖יִךְ" }]);
  const d = applyFixes(week(), r.fixes);
  assert.equal(d.glosses[1].lemma, "בָּנַ֖יִךְ");
  assert.equal(lint(d, { voices }).warnings.length, 0);
});

test("lint warns on a crowded map, a long timeline label and a tall timeline band", () => {
  const figures = w => w.filter(x => /^(places|timeline)/.test(x.where));
  const place = i => ({ id: `p${i}`, name: `P${i}`, role: "context", lat: 31, lon: 35, approved: true });
  const d = week();
  d.places = Array.from({ length: 12 }, (_, i) => place(i));
  d.timeline = Array.from({ length: 14 }, (_, i) => ({ id: `t${i}`, chronology: "david" }));
  assert.deepEqual(figures(lint(d, { voices }).warnings), []);
  d.places.push(place(12));
  d.timeline.push({ id: "long", label: "A label that runs past twenty-eight", kind: "event", start: -900, works: ["x"] });
  assert.deepEqual(figures(lint(d, { voices }).warnings), [
    { where: "places", msg: "13 places; more than 12 labels crowd the map" },
    { where: "timeline long", msg: "label is 35 characters; keep it under 28 so it fits its bar" },
    { where: "timeline", msg: "15 items; more than 14 rows make the band taller than its space" },
  ]);
});

test("lint warns, given the basemap, on a place beyond it and on a map with no place inside its frame", async () => {
  const basemap = JSON.parse(await readFile(new URL("../data/geo/basemap.json", import.meta.url), "utf8"));
  const places = w => w.filter(x => x.where === "places");
  const joppa = { id: "joppa", name: "Joppa", role: "scene", lat: 32.05, lon: 34.75, approved: true };
  const tarshish = { id: "tarshish", name: "Tarshish", role: "scene", lat: 37.0, lon: -6.0, approved: true };
  const d = week();
  d.places = [joppa];
  assert.deepEqual(places(lint(d, { voices, basemap }).warnings), []);
  d.places = [joppa, tarshish];
  assert.deepEqual(places(lint(d, { voices, basemap }).warnings), [{ where: "places", msg: "Tarshish lies outside the basemap and is left off the map" }]);
  assert.deepEqual(places(lint(d, { voices }).warnings), [], "without the basemap nothing is said");
  d.places = [tarshish];
  assert.deepEqual(places(lint(d, { voices, basemap }).warnings), [
    { where: "places", msg: "Tarshish lies outside the basemap and is left off the map" },
    { where: "places", msg: "places given but none inside the map" },
  ]);
  d.places = [joppa]; d.mapRegion = [40, 30, 44, 33];   // an explicit region with nothing in it
  assert.deepEqual(places(lint(d, { voices, basemap }).warnings), [{ where: "places", msg: "places given but none inside the map" }]);
});

test("loadBasemap reads data/geo/basemap.json only for a week with places", async () => {
  assert.equal(await loadBasemap({ places: [] }), null);
  assert.equal(await loadBasemap({}), null);
  assert.deepEqual((await loadBasemap({ places: [{ id: "x" }] })).box, [8, 12, 60, 42]);
});

test("lint errors name the entry when a lemma or anchor is missing", () => {
  const d = week();
  d.glosses[0].lemma = "שָׁלוֹם";
  d.glosses[1].en = "your grandchildren";
  const r = lint(d, { voices });
  assert.ok(r.errors.some(e => /^gloss 54:11 שָׁלוֹם$/.test(e.where) && /not found/.test(e.msg)), JSON.stringify(r.errors));
  assert.ok(r.errors.some(e => /^gloss 54:13/.test(e.where) && /English anchor “your grandchildren” not found/.test(e.msg)));
});

test("lint warns when a gloss anchor ends at or contains a JPS marker", () => {
  const d = week();
  d.glosses[0].en = "carbuncles";
  assert.ok(lint(d, { voices }).warnings.some(w => /ends at JPS note d/.test(w.msg)));
  d.glosses[0].en = "lay carbuncles as";
  assert.ok(lint(d, { voices }).warnings.some(w => /contains JPS note d/.test(w.msg)));
  d.glosses[0].en = "as your building stones";   // starts after the marker: the keys do not touch
  assert.ok(!lint(d, { voices }).warnings.some(w => /JPS note/.test(w.msg)));
});

test("lint warns on a source with no voices.json line, but not on drafted titles or grouped refs", () => {
  const d = week();
  d.commentary.push({ chapter: 54, verse: 11, register: "traditional", source: "Sefer Unknown", sourceRef: "x", text: words(50) });
  d.commentary.push({ chapter: 54, verse: 11, register: "traditional", source: "Talmud, Berakhot 10a", sourceRef: "x", text: words(50) });
  const w = lint(d, { voices }).warnings.filter(x => /voices\.json/.test(x.msg));
  assert.equal(w.length, 1);
  assert.match(w[0].where, /Sefer Unknown/);
});

test("lint word counts: commentary 25–120, historians 60–130, glosses 12–35", () => {
  const d = week();
  d.commentary[0].text = words(121);
  d.commentary[1].text = words(59);
  d.glosses[0].text = words(11);
  const w = lint(d, { voices }).warnings.map(x => x.msg);
  assert.ok(w.includes("121 words (commentary 25–120)"));
  assert.ok(w.includes("59 words (historians 60–130)"));
  assert.ok(w.includes("11 words (gloss 12–35)"));
  assert.equal(wordCount("<i>Akarah</i>, “barren”: the — word"), 4);
});

test("godLanguage flags mid-sentence pronouns and titles, skips sentence starts and human titles", () => {
  assert.deepEqual(godLanguage("God keeps His promise to Him.").map(h => h.word), ["His", "Him"]);
  assert.deepEqual(godLanguage("He told Rabbi Yohanan. “He will judge.”").map(h => h.word), []);
  assert.deepEqual(godLanguage("Praise the Lord, our King and Father.").map(h => h.word), ["Lord", "King", "Father"]);
  assert.deepEqual(godLanguage("King David and Father Abraham.").map(h => h.word), []);
  assert.match(godLanguage("the Holy One, blessed be He, said")[0].snippet, /blessed be He/);
});

test("lint reports God-language in commentary, glosses, glossary and opening note", () => {
  const d = week();
  d.commentary[0].text = words(30) + " and the Holy One kept His word";
  d.glosses[0].text = words(15) + " as the Lord said";
  d.glossary[0].text = "Shepherd whom our Father chose.";
  d.openingNote.setting = ["The exiles thought He had left them."];
  const where = lint(d, { voices }).warnings.filter(w => /God-language/.test(w.msg)).map(w => w.where);
  assert.deepEqual(where, ["commentary 54:11 Rashi", "gloss 54:11 בַּפּוּךְ֙", "glossary David", "openingNote.setting"]);
});

// ---- gap diagnostics ----------------------------------------------------------

test("analyse reads entry heights and gapReport names the largest entry to trim", () => {
  const dom = `<html data-pages="3" data-yy="0" data-keys="" data-empty-sections="0">
<section class="page front recto" data-kind="front"></section>
<section class="page text verso" data-kind="text" data-rows="2" data-gap="132" data-fill="85" data-split="" data-cont="0" data-offpage="0" data-need="20"><div class="verse-row first" data-verse="54:1" data-h="300"></div><div class="verse-row" data-verse="54:2" data-h="180"></div><div class="apparatus"><p class="entry reg-traditional" data-verse="54:1" data-src="Rashi" data-words="48" data-h="140"></p><p class="entry reg-traditional" data-verse="54:1" data-src="Malbim" data-words="101" data-h="200"></p></div></section>
<section class="page text recto" data-kind="text" data-rows="3" data-gap="20" data-fill="90" data-split="" data-cont="0" data-offpage="1"><div class="verse-row first" data-verse="54:3" data-h="119"></div><div class="apparatus"><p class="entry reg-traditional" data-verse="54:1" data-src="Pesikta" data-words="94" data-h="223"></p></div></section>
</html>`;
  const { problems, diagnostics, summary } = analyse(dom);
  assert.ok(problems.some(p => /page 2: 132px gap/.test(p)));
  assert.deepEqual(summary.page[1].entries.map(e => e.src), ["Rashi", "Malbim"]);
  const d = diagnostics.join("\n");
  assert.match(d, /28px over/);
  assert.match(d, /verses on page 2: 54:1, 54:2/);
  assert.match(d, /54:1 Pesikta: 223px, 94 words/);
  assert.match(d, /next verse 54:3 \(119px tall\) misses page 2 by 20px/);
  assert.match(d, /suggested trim: Malbim on 54:1 .*cut about 21 words/);   // 2 × 20 × 101 / 200
  assert.equal(typeof gapReport, "function");
});

test("lintSheet lints the primary reading of either schema, and --fix writes into the file itself", async () => {
  const d = JSON.parse(await readFile(new URL("./fixtures/week-notes/sheet.json", import.meta.url), "utf8"));
  const m = migrate3(d);
  const r = lintSheet(m, { fix: true });
  assert.deepEqual(r.fixes, lint(d).fixes);
  assert.ok(r.fixes.length > 0, "the fixture has near-miss gloss lemmas");
  for (const f of r.fixes) assert.equal(m.readings[0].glosses[f.index][f.field], f.to);
  assert.equal(lintSheet(m).fixes.length, 0);
  assert.deepEqual(lintSheet(d).warnings, lint(d).warnings);
});

test("lintSheet lints every reading and names the reading when the week has two", async () => {
  const min = JSON.parse(await readFile(new URL("./fixtures/week-min/sheet.json", import.meta.url), "utf8"));
  const two = makeWeekTorah(min);
  two.readings[0].glosses.push({ chapter: 6, verse: 99, lemma: "x", en: "", text: "A gloss on a verse the reading does not have, for the test." });
  const r = lintSheet(two);
  assert.ok(r.errors.some(e => e.where === "torah: gloss 6:99 x" && /no verse 6:99 in this reading/.test(e.msg)));
  const haft = r.warnings.filter(w => w.where.startsWith("haftarah: ")).map(w => ({ ...w, where: w.where.slice("haftarah: ".length) }));
  assert.deepEqual(haft, lint(min).warnings, "the haftarah lints as it did alone");
  assert.deepEqual(lintSheet(two, { only: ["haftarah"] }).errors, [], "--reading haftarah does not stop on the Torah's problems");
  assert.deepEqual(lintSheet(min).warnings, lint(min).warnings, "a one-reading week keeps its old messages");
});

test("the entry cap is a warning per reading with the count by register, never an error", async () => {
  const d = JSON.parse(await readFile(new URL("./fixtures/week-notes/sheet.json", import.meta.url), "utf8"));
  const r = lintSheet(d, { customs: { entryCap: 10 } });
  const cap = r.warnings.filter(w => /over the cap/.test(w.msg));
  assert.deepEqual(cap, [{ where: "haftarah", msg: "17 entries, over the cap of 10 (traditional 9, modern 4, critical 4, reference 0)" }]);
  assert.equal(r.errors.length, lint(d).errors.length);
  assert.deepEqual(r.counts, [{ reading: "haftarah", total: 17, cap: 10, traditional: 9, modern: 4, critical: 4, reference: 0 }]);
  assert.ok(!lintSheet(d, { customs: { entryCap: 24 } }).warnings.some(w => /over the cap/.test(w.msg)));
  const m = structuredClone(d); m.commentary[0].status = "rejected";
  assert.equal(entryCounts({ commentary: m.commentary }).total, 16, "a rejected entry is not counted");
  assert.equal(entryCounts({ commentary: [{ register: "something else" }] }).traditional, 1);
});

test("lint names each carried entry so Daniel can keep or cut it", async () => {
  const d = JSON.parse(await readFile(new URL("./fixtures/week-min/sheet.json", import.meta.url), "utf8"));
  d.commentary[0].status = "carried"; d.commentary[0].carried = "2025-10-25-noach";
  assert.ok(lint(d).warnings.some(w => w.where === "commentary 18 Rashi" && w.msg === 'carried from 2025-10-25-noach; it prints unless its status is set to "rejected"'));
});

test("lintSheet warns on a schema-3 entry with no id, and not on a schema-2 one", async () => {
  const d = JSON.parse(await readFile(new URL("./fixtures/week-min/sheet.json", import.meta.url), "utf8"));
  const three = migrate3(d);
  assert.ok(three.readings[0].commentary.every(e => e.id));
  assert.ok(!lintSheet(three, { voices }).warnings.some(w => /has no id/.test(w.msg)));
  delete three.readings[0].commentary[0].id;
  const w = lintSheet(three, { voices }).warnings.filter(x => /has no id/.test(x.msg));
  assert.deepEqual(w, [{ where: "commentary 18 Rashi", msg: "has no id (run node scripts/migrate.mjs --to 3 or fetch again)" }]);
  assert.ok(!lintSheet(d, { voices }).warnings.some(x => /has no id/.test(x.msg)));
});
