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
