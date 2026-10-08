import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const lib = require("../template/lib.js");

test("divineName replaces the pointed name and keeps its accent", () => {
  // יְהוָ֖ה : sheva, qamats, tipcha (U+0596)
  const r = lib.divineName("אֲנִ֣י יְהוָ֖ה");
  assert.equal(r.count, 1);
  assert.equal(r.html, "אֲנִ֣י יי֖");
});

test("divineName handles the Elohim pointing and unpointed forms", () => {
  assert.equal(lib.divineName("אֲדֹנָ֥י יֱהֹוִ֖ה").html, "אֲדֹנָ֥י יי֖");
  assert.equal(lib.divineName("יהוה").html, "יי");
  assert.equal(lib.divineName("יהוה אחד יהוה").count, 2);
});

test("divineName leaves Judah and Jonathan alone", () => {
  const s = "יְהוּדָ֖ה וִיהוֹנָתָ֑ן";
  assert.equal(lib.divineName(s).html, s);
  assert.equal(lib.divineName(s).count, 0);
});

test("stripMarks removes vowels and accents", () => {
  assert.equal(lib.stripMarks("וְנִפְקַ֕דְתָּ"), "ונפקדת");
});

test("splitPoetry splits on JPS line breaks and trims", () => {
  const en = 'Sing to G<small>OD</small> a new song,<br>Praise from the ends of the earth—<br>You coastlands<sup class="fn">e</sup> and their inhabitants!';
  assert.deepEqual(lib.splitPoetry(en), [
    "Sing to G<small>OD</small> a new song,",
    "Praise from the ends of the earth—",
    'You coastlands<sup class="fn">e</sup> and their inhabitants!',
  ]);
});

test("splitPoetry returns prose as one line and ignores a trailing break", () => {
  assert.deepEqual(lib.splitPoetry("Jonathan said to him.<br>"), ["Jonathan said to him."]);
  assert.deepEqual(lib.splitPoetry("Jonathan said to him."), ["Jonathan said to him."]);
});

test("nowrapKeys keeps key and dash with their word", () => {
  const out = lib.nowrapKeys('a light of nations<sup class="fn">c</sup>—');
  assert.equal(out, 'a light of <span class="nb">nations<sup class="fn">c</sup>—</span>');
});

test("letterFor past z", () => {
  assert.equal(lib.letterFor(0), "a");
  assert.equal(lib.letterFor(25), "z");
  assert.equal(lib.letterFor(26), "aa");
  assert.equal(lib.letterFor(27), "ab");
});

test("isDeadRef recognises cross-references to pages the reader does not have", () => {
  assert.equal(lib.isDeadRef("See note at 10.11."), true);
  assert.equal(lib.isDeadRef("See 18.11 and note."), true);
  assert.equal(lib.isDeadRef("Cf. 43.9–12."), true);
  assert.equal(lib.isDeadRef("Lit. “very much.”"), false);
  assert.equal(lib.isDeadRef("See above, vv. 12–17."), false);
  assert.equal(lib.isDeadRef("Emendation yields “Let the sea roar”; cf. Ps. 98.7."), false);
});

test("normalizeRefs turns JPS 19.2 into 19:2 and leaves years alone", () => {
  assert.equal(lib.normalizeRefs("see 19.2ff."), "see 19:2ff.");
  assert.equal(lib.normalizeRefs("Ps. 98.7"), "Ps. 98:7");
  assert.equal(lib.normalizeRefs("Duhm (1892)"), "Duhm (1892)");
});

test("assignKeys reletters per sheet, drops dead refs, keys glosses in both languages", () => {
  const verses = [
    { chapter: 20, verse: 18, en: 'you will be missed when your seat remains vacant.<sup class="fn">h</sup>', he: "וְנִפְקַ֕דְתָּ כִּ֥י יִפָּקֵ֖ד", notes: [{ marker: "h", lemma: "vacant", text: "At the festal meal." }] },
    { chapter: 20, verse: 19, en: 'go down all the way<sup class="fn">i</sup> to the place<sup class="fn">j</sup>', he: "אֵ֥צֶל הָאֶ֖בֶן הָאָֽזֶל׃", notes: [{ marker: "i", lemma: "all the way", text: "Lit. “very much.”" }, { marker: "j", lemma: "the place", text: "See 19.2 and note." }] },
  ];
  const glosses = [{ verse: 18, lemma: "וְנִפְקַ֕דְתָּ", en: "you will be missed", text: "<i>nifkadta</i>", status: "approved" }];
  const r = lib.assignKeys(verses, glosses, () => true);
  assert.deepEqual(r.sequence, ["a", "b", "c"]);
  assert.equal(r.verses[0].en, 'you will be missed<sup class="fn">b</sup> when your seat remains vacant.<sup class="fn">a</sup>');
  assert.deepEqual(r.verses[0].keys.map(k => [k.key, k.kind, k.lemma]), [["a", "jps", "vacant"], ["b", "gloss", "you will be missed"]]);
  assert.equal(r.verses[1].en, 'go down all the way<sup class="fn">c</sup> to the place');
  assert.deepEqual(r.verses[1].keys.map(k => k.key), ["c"]);
  assert.equal(r.verses[0].keys[1].he, "וְנִפְקַ֕דְתָּ");
});

test("assignKeys with nothing to key", () => {
  const r = lib.assignKeys([{ chapter: 1, verse: 1, en: "In the beginning.", he: "בְּרֵאשִׁ֖ית", notes: [] }], [], () => true);
  assert.deepEqual(r.sequence, []);
  assert.deepEqual(r.verses[0].keys, []);
  assert.equal(r.verses[0].en, "In the beginning.");
});

test("assignKeys puts a gloss key at the end of the verse when no English anchor is given", () => {
  const r = lib.assignKeys([{ chapter: 1, verse: 1, en: "In the beginning.", he: "בְּרֵאשִׁ֖ית", notes: [] }], [{ verse: 1, lemma: "בְּרֵאשִׁ֖ית", text: "x", status: "approved" }], () => true);
  assert.equal(r.verses[0].en, 'In the beginning.<sup class="fn">a</sup>');
});

test("sigla are one filled family and registers have plain names", () => {
  for (const k of lib.REGISTER_ORDER) {
    assert.match(lib.SIGLA[k], /fill="currentColor"/);
    assert.doesNotMatch(lib.SIGLA[k], /fill="none"/);
  }
  assert.equal(lib.REGISTER_NAMES.critical, "what historians say");
  assert.equal(lib.REGISTER_NAMES.traditional, "classical commentators");
});

test("voicesFor introduces each named source once, in order of first use, skipping drafted titles", () => {
  const voices = { "Rashi": "Rashi (R. Shlomo Yitzchaki), Troyes, 1040–1105", "Talmud": "The Babylonian Talmud, c. 200–500 CE" };
  const commentary = [
    { register: "traditional", source: "Talmud, Megillah 31a", status: "approved" },
    { register: "traditional", source: "Rashi", status: "approved" },
    { register: "traditional", source: "Rashi", status: "approved" },
    { register: "critical", source: "A damaged verse", status: "approved" },
    { register: "traditional", source: "Radak", status: "approved" },
    { register: "traditional", source: "Malbim", status: "proposed" },
  ];
  const r = lib.voicesFor(commentary, voices, e => e.status === "approved");
  assert.deepEqual(r.map(v => v.name), ["Talmud, Megillah 31a", "Rashi", "Radak"]);
  assert.equal(r[1].line, voices.Rashi);
  assert.equal(r[2].line, null);
});

test("fitIncipitSize shrinks to the box and falls back to two lines at 54pt", () => {
  assert.deepEqual(lib.fitIncipitSize(330, 336), { size: 61, lines: 1 });
  assert.deepEqual(lib.fitIncipitSize(400, 336), { size: 50, lines: 1 });
  assert.deepEqual(lib.fitIncipitSize(600, 336), { size: 54, lines: 2 });
  assert.deepEqual(lib.fitIncipitSize(250, 336), { size: 64, lines: 1 });
});

test("nowrapKeys leaves a key that follows a tag alone", () => {
  const html = '<span class="indentAll"><sup class="fn">i</sup>G<small>OD</small> desires his vindication,';
  assert.equal(lib.nowrapKeys(html), html);
});

import { analyse } from "../scripts/check.mjs";

test("analyse flags a lone verse, a wide gap, an empty section and a broken key series", () => {
  const dom = `<html data-pages="3" data-yy="0" data-keys="a,c" data-empty-sections="1">
<section class="page front recto" data-kind="front"></section>
<section class="page text verso" data-kind="text" data-rows="1" data-gap="120" data-fill="40" data-split="" data-cont="0" data-offpage="0"></section>
<section class="page text recto" data-kind="text" data-rows="3" data-gap="10" data-fill="90" data-split="" data-cont="1" data-offpage="0"></section>
</html>`;
  const { problems } = analyse(dom);
  assert.ok(problems.some(p => /single verse/.test(p)));
  assert.ok(problems.some(p => /120px gap/.test(p)));
  assert.ok(problems.some(p => /no items/.test(p)));
  assert.ok(problems.some(p => /key series is ac not ab/.test(p)));
  assert.ok(problems.some(p => /labelled \(cont\.\)/.test(p)));
});

import { migrate } from "../scripts/migrate.mjs";

test("migrate builds the opening note from the v1 fields and drops what v2 removed", () => {
  const v1 = {
    schema: 1, shabbat: { hebrewEn: "29 Tishrei 5787", parashah: { en: "Bereshit" } },
    haftarah: { ref: "I Samuel 20:18-42", defaultHaftarah: "Isaiah 42:5-43:10", whyThisHaftarah: "Why." },
    context: { status: "approved", heading: "x", paragraphs: ["Setting one.", "Setting two."] },
    questions: ["q"], parashahConnection: "Link.", glosses: [{ verse: 18, lemma: "א" }],
    commentary: [{ verse: 1, register: "critical", source: "S" }, { verse: 2, register: "traditional", source: "Rashi" }],
    credits: { editor: "R" },
  };
  const v2 = migrate(v1, 3);
  assert.equal(v2.schema, 2);
  assert.deepEqual(v2.series, { name: "Torah from Scratch", year: "5787", number: 3 });
  assert.equal(v2.openingNote.calendar, "Read in place of the usual haftarah for Bereshit, Isaiah 42:5–43:10. Why. Link.");
  assert.deepEqual(v2.openingNote.setting, ["Setting one.", "Setting two."]);
  assert.equal(v2.openingNote.status, "approved");
  assert.equal(v2.questions, undefined);
  assert.equal(v2.context, undefined);
  assert.equal(v2.haftarah.whyThisHaftarah, undefined);
  assert.deepEqual(v2.commentary[0].works, []);
  assert.equal(v2.commentary[1].works, undefined);
  assert.equal(v2.glosses[0].en, "");
  assert.match(v2.credits.signoff, /Tell me what I got wrong/);
});

test("analyse flags a text page that overflows and margin notes assigned but never printed", () => {
  const dom = `<html data-pages="2" data-yy="0" data-keys="a,b,c" data-empty-sections="0">
<section class="page front recto" data-kind="front"></section>
<section class="page text verso" data-kind="text" data-rows="3" data-gap="10" data-fill="120" data-split="" data-cont="0" data-offpage="0" data-leftover="-300" data-overflow="true"><div class="margin-col"><p class="note jps" style="top: 2px;"><span class="k">a</span>x</p><p class="note jps" style="top: 40px;"><span class="k">a</span>x</p></div></section>
</html>`;
  const { problems } = analyse(dom);
  assert.ok(problems.some(p => /page 2: content overflows/.test(p)), problems.join("\n"));
  assert.ok(problems.some(p => /margin notes assigned but not printed: b, c/.test(p)), problems.join("\n"));
  assert.ok(problems.some(p => /margin note printed twice: a/.test(p)), problems.join("\n"));
});

test("isDeadRef keeps a cross-reference to a verse the reader has", () => {
  const samuel = { chapter: 20, verse: 18, endChapter: 20, endVerse: 42 };
  assert.equal(lib.isDeadRef("See 20.25 and note.", samuel), false);
  assert.equal(lib.isDeadRef("See note at 10.11.", samuel), true);
  assert.equal(lib.isDeadRef("See 20.25 and note.", { chapter: 20, verse: 18, endChapter: 20, endVerse: 20 }), true);
  assert.equal(lib.isDeadRef("Cf. 43.9–12.", { chapter: 42, verse: 5, endChapter: 43, endVerse: 10 }), false);
});

test("assignKeys keeps an in-range cross-reference, normalised, and drops one outside the reading", () => {
  const verses = [
    { chapter: 20, verse: 18, he: "", en: 'x<sup class="fn">a</sup> y<sup class="fn">b</sup>', notes: [{ marker: "a", text: "See 20.25 and note." }, { marker: "b", text: "See 18.11." }] },
    { chapter: 20, verse: 25, he: "", en: "z", notes: [] },
  ];
  const r = lib.assignKeys(verses, [], () => true);
  assert.deepEqual(r.sequence, ["a"]);
  assert.equal(r.verses[0].keys[0].text, "See 20:25 and note.");
  assert.equal(r.verses[0].en, 'x<sup class="fn">a</sup> y');
});

test("migrate stamps a status on legacy glossary terms and glosses so the gate sees them", () => {
  const v1 = { schema: 1, shabbat: { hebrewEn: "29 Tishrei 5787", parashah: { en: "Bereshit" } }, haftarah: { ref: "I Samuel 20:18-42" },
    glossary: [{ term: "Abner" }, { term: "Jesse", status: "approved" }], glosses: [{ verse: 1, lemma: "א" }, { verse: 2, lemma: "ב", status: "approved" }] };
  const v2 = migrate(v1, 3);
  assert.equal(v2.glossary[0].status, "proposed");
  assert.equal(v2.glossary[1].status, "approved");
  assert.equal(v2.glosses[0].status, "proposed");
  assert.equal(v2.glosses[1].status, "approved");
});

test("analyse lets the last verse stand alone when only note pages follow it", () => {
  const dom = `<html data-pages="4" data-yy="0" data-keys="" data-empty-sections="0">
<section class="page front recto" data-kind="front"></section>
<section class="page text verso" data-kind="text" data-rows="4" data-gap="10" data-fill="90" data-split="" data-cont="0" data-offpage="0"></section>
<section class="page text recto" data-kind="text" data-rows="1" data-gap="30" data-fill="90" data-split="" data-cont="0" data-offpage="0"></section>
<section class="page text verso" data-kind="text" data-rows="0" data-gap="-1" data-fill="80" data-split="" data-cont="0" data-offpage="0"></section>
</html>`;
  assert.deepEqual(analyse(dom).problems, []);
});
