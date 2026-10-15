import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildDigest, classify, opening, englishOpening, alsoLine, digestInput } from "../scripts/digest.mjs";
import { migrate3 } from "../scripts/migrate.mjs";

const load = async f => JSON.parse(await readFile(new URL(`./fixtures/digest/${f}`, import.meta.url), "utf8"));
const texts = await load("texts.json");
const candidates = await load("candidates.json");
const md = buildDigest({ texts, candidates, book: "Isaiah" });
const section = v => md.split(`## ${v}\n`)[1].split("\n## ")[0];

test("classify drops reference works, quoting commentaries, Sources and References, non-Zohar Kabbalah", () => {
  assert.equal(classify("BDB", "Reference"), "drop");
  assert.equal(classify("Sefer HaShorashim", "Reference"), "drop");
  assert.equal(classify("Mashmia Yeshuah", "Quoting Commentary"), "drop");
  assert.equal(classify("Sources and References on Likkutei Torah", "Quoting Commentary"), "drop");
  assert.equal(classify("Tikkunei Zohar", "Kabbalah"), "drop");
  assert.equal(classify("Zohar", "Kabbalah"), "also");
  assert.equal(classify("Yismach Moshe", "Chasidut"), "tail");
  assert.equal(classify("Ketubot", "Talmud"), "list");
  assert.equal(classify("Rashi on Isaiah", "Commentary", "Isaiah"), "commentator");
});

test("opening strips markup and footnotes and cuts at a word near 100 characters", () => {
  assert.equal(opening("<b>Sing,</b>&nbsp;O barren one<sup class=\"footnote-marker\">a</sup><i class=\"footnote\">note</i>!"), "Sing, O barren one!");
  const long = opening("word ".repeat(60));
  assert.ok(long.length <= 101 && long.endsWith("…"));
  assert.equal(opening([["a", "b"], "c"]), "a b c");
});

test("englishOpening prefers an English-language version and falls back to Hebrew", () => {
  assert.equal(englishOpening(texts.linked["Lekha Dodi 7:1"]), "Don't be ashamed!");
  assert.equal(englishOpening(texts.linked["Zohar, Vayechi 12:82"]), "(Hebrew) תָּא חֲזֵי");
});

test("digest lists Talmud with its English opening under the anchor verse", () => {
  assert.match(section("54:1"), /- Talmud · Ketubot 8a:4: The fourth blessing is: May the barren city/);
});

test("digest lists a multi-verse midrash once, under its first verse", () => {
  assert.match(section("54:2"), /- Midrash · Bereshit Rabbah 5:7 \(also 54:3\): The way of the world/);
  assert.doesNotMatch(section("54:3"), /Bereshit Rabbah 5:7/);
});

test("digest puts Zohar, later midrash and unfetched refs on the Also line", () => {
  assert.match(section("54:1"), /Also: .*Pesikta DeRav Kahana 20:1/);
  assert.match(section("54:1"), /Also: .*Zohar, Vayechi 12:82/);
  assert.match(section("54:3"), /Also: Midrash Sekhel Tov/);
});

test("digest flags section-filed commentators", () => {
  assert.match(md, /Abarbanel files by section \(54:1–3\)/);
  assert.match(section("54:1"), /Abarbanel \(block 54:1–3\)/);
  assert.match(section("54:2"), /Abarbanel \(via 54:1\)/);
  assert.match(section("54:3"), /Commentators: all core; Abarbanel \(via 54:1\)/);
  assert.match(section("54:2"), /Commentators: all core but Rashi; Abarbanel \(via 54:1\)/);
  assert.match(section("54:2"), /Also Minchat Shai/);
});

test("digest drops the noise and counts the long tail on one line", () => {
  for (const noise of ["BDB", "Sources and References", "Mashmia Yeshuah", "Tikkunei Zohar", "Yismach Moshe"]) assert.doesNotMatch(md, new RegExp(noise));
  assert.match(md, /Not listed: Chasidut 1 \(7 links\), Musar 1 \(2 links\)\./);
  assert.match(md, /Dropped as noise: Quoting Commentary 2 \(13 links\), Reference 1 \(12 links\), Kabbalah 1 \(3 links\)\./);
  assert.match(md, /\nHalakhah: Shulchan Arukh, Orach Chayim 428:8\./);
  assert.match(md, /Not on Sefaria: Ralbag/);
});

test("digest without texts.json falls back to candidates", () => {
  const md2 = buildDigest({ texts: null, candidates, book: "Isaiah", verses: texts.verses });
  assert.match(md2, /texts\.json missing/);
  assert.match(md2, /## 54:1\nCommentators: Rashi\.\nAlso: Ketubot 8a:4; Zohar, Vayechi 12:82\./);
  assert.match(md2, /## 54:2\nCommentators: no core commentator\./);
});

test("alsoLine counts kinds when it has to cut", () => {
  const items = Array.from({ length: 7 }, (_, i) => ({ ref: `Zohar ${i}`, kind: "Zohar" }));
  assert.equal(alsoLine(items.slice(0, 2)), "Also: Zohar 0; Zohar 1.");
  assert.equal(alsoLine(items), "Also: 7 Zohar. Zohar 0; Zohar 1; Zohar 2; Zohar 3; Zohar 4; +2 more.");
});

test("a schema-3 copy of a sheet gives the digest the same input and the same digest as the schema-2 file", async () => {
  const two = JSON.parse(await readFile(new URL("./fixtures/week-notes/sheet.json", import.meta.url), "utf8"));
  const three = migrate3(two);
  assert.equal(three.schema, 3);
  const a = digestInput(two), b = digestInput(three);
  assert.ok(a.book && a.verses.length > 1);
  assert.deepEqual(b, a);
  assert.equal(buildDigest({ texts, candidates, ...b }), buildDigest({ texts, candidates, ...a }));
  assert.deepEqual(digestInput(null), { book: undefined, verses: [] });
});
