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
