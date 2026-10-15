import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TRANSLATIONS, DEFAULT_KEY, plainVersion, versionsOf, translationsFor, buildTranslations } from "../scripts/translations.mjs";
import { flattenVerses } from "../scripts/fetch.mjs";

const fixture = name => JSON.parse(readFileSync(new URL(`./fixtures/${name}/sheet.json`, import.meta.url), "utf8"));
const customs = { translations: ["jps2023", "jps1985", "koren", "metsudah"] };
// A v3 answer for I Samuel 20:18-20 in three versions (synthetic English; the shape is Sefaria's).
const answer = (titles = ["Tanakh: The Holy Scriptures, published by JPS", "The Koren Jerusalem Bible", "The Early Prophets, by Everett Fox. New York, Schocken Books, 2014"]) => ({
  ref: "I Samuel 20:18-20", sections: ["20", "18"], toSections: ["20", "20"],
  versions: titles.map((t, k) => ({ versionTitle: t, license: k === 2 ? "Copyright: Schocken" : "CC-BY-NC", language: "en", text: [`${k} eighteen<sup class="footnote-marker">a</sup><i class="footnote">a note</i>`, `${k} nineteen<br>second line`, `${k} twenty`] })),
});

test("TRANSLATIONS names the editions by exact Sefaria title with a credit line each; jps2023 is the sheet's own", () => {
  assert.equal(DEFAULT_KEY, "jps2023");
  assert.deepEqual(TRANSLATIONS.jps1985.titles, ["Tanakh: The Holy Scriptures, published by JPS"]);
  assert.equal(TRANSLATIONS.jps1985.label, "JPS 1985");
  assert.equal(TRANSLATIONS.koren.credit, "English: The Koren Jerusalem Bible (Koren Publishers Jerusalem), CC BY-NC, via Sefaria.");
  assert.deepEqual(TRANSLATIONS.metsudah.titles, ["The Metsudah Tanach series, Lakewood, N.J", "Metsudah Chumash, Metsudah Publications, 2009"]);
  assert.equal(TRANSLATIONS.metsudah.credits["Metsudah Chumash, Metsudah Publications, 2009"], "English: Metsudah Chumash (Metsudah Publications, 2009), CC BY, via Sefaria.");
  assert.equal(TRANSLATIONS.jps2023, undefined);
});

test("plainVersion drops footnote markers and footnotes and keeps line breaks", () => {
  assert.equal(plainVersion('Jonathan<sup class="footnote-marker">a</sup><i class="footnote">a note <i>with</i> italics</i> said<br>more'), "Jonathan said<br>more");
  assert.equal(plainVersion("<small>LORD</small> spoke"), "<small>LORD</small> spoke");
  assert.equal(plainVersion(null), "");
  assert.equal(plainVersion('A<i class="footnote">a note <i>over\ntwo lines</i> ends</i> b'), "A b", "an inner <i> may span a line break");
});

test("translationsFor: a one-verse reading, whose text Sefaria returns as a string", async () => {
  const one = fixture("week-min");
  one.haftarah = { ...one.haftarah, ref: "I Samuel 20:18" };
  one.verses = one.verses.slice(0, 1);
  const get = async () => ({ ref: "I Samuel 20:18", sections: ["20", "18"], toSections: ["20", "18"], versions: [{ versionTitle: "The Koren Jerusalem Bible", license: "CC-BY-NC", language: "en", text: "Then Jonathan said to him." }] });
  const { translations } = await translationsFor(one, { translations: ["koren"] }, { get });
  const h = Object.values(translations.readings)[0];
  assert.deepEqual(h.versions[0].verses, { "20:18": "Then Jonathan said to him." });
});

test("versionsOf lists the English versions; flattenVerses is exported from fetch.mjs", () => {
  assert.deepEqual(versionsOf(answer()).map(v => v.versionTitle).length, 3);
  assert.deepEqual(versionsOf({ versions: [{ language: "he", versionTitle: "x", text: [] }] }), []);
  assert.deepEqual(flattenVerses(["a", "b"], ["20", "18"], ["20", "19"]).map(v => `${v.chapter}:${v.verse}`), ["20:18", "20:19"]);
});

test("translationsFor keeps only the versions Sefaria has, by exact title, in the customs' order, verse-aligned, footnotes dropped; Fox is never offered", async () => {
  const calls = [];
  const get = async url => { calls.push(url); return answer(); };
  const { translations, report } = await translationsFor(fixture("week-min"), customs, { get });
  assert.equal(calls.length, 1);
  assert.match(calls[0], /^https:\/\/www\.sefaria\.org\/api\/v3\/texts\/I%20Samuel%2020%3A18-20\?version=english%7Call&return_format=default$/);
  assert.equal(translations.schema, 1);
  const h = translations.readings.haftarah;
  assert.equal(h.ref, "I Samuel 20:18-20");
  assert.deepEqual(h.versions.map(v => v.key), ["jps1985", "koren"]);
  assert.deepEqual(h.versions[0], { key: "jps1985", label: "JPS 1985", title: "Tanakh: The Holy Scriptures, published by JPS", license: "CC-BY-NC", credit: TRANSLATIONS.jps1985.credit, verses: { "20:18": "0 eighteen", "20:19": "0 nineteen<br>second line", "20:20": "0 twenty" } });
  assert.deepEqual(report.haftarah, { offered: ["jps1985", "koren"], absent: ["metsudah"] });
});

test("translationsFor: the Metsudah Chumash on a Torah reading, the Tanach series on a haftarah; a version that lacks a verse gets an empty string; a reading with no verses is skipped", async () => {
  const { makeWeekTorah } = await import("./helpers/makeWeekTorah.mjs");
  const two = makeWeekTorah(fixture("week-min"));
  const get = async url => /Genesis/.test(url)
    ? { ref: "Genesis 6:9-11", sections: ["6", "9"], toSections: ["6", "11"], versions: [{ versionTitle: "Metsudah Chumash, Metsudah Publications, 2009", license: "CC-BY", language: "en", text: ["nine", "ten", "eleven"] }, { versionTitle: "Metsudah Chumash, Metsudah Publications, 2009 [with Onkelos translation]", license: "CC-BY-NC", language: "en", text: ["x", "y", "z"] }] }
    : { ref: "I Samuel 20:18-20", sections: ["20", "18"], toSections: ["20", "20"], versions: [{ versionTitle: "The Metsudah Tanach series, Lakewood, N.J", license: "CC-BY", language: "en", text: ["a", "b"] }] };
  const { translations, report } = await translationsFor(two, { translations: ["jps2023", "metsudah", "koren"] }, { get });
  assert.deepEqual(Object.keys(translations.readings), ["torah", "haftarah"]);
  const t = translations.readings.torah.versions[0];
  assert.equal(t.title, "Metsudah Chumash, Metsudah Publications, 2009");
  assert.equal(t.credit, "English: Metsudah Chumash (Metsudah Publications, 2009), CC BY, via Sefaria.");
  assert.deepEqual(t.verses, { "6:9": "nine", "6:10": "ten", "6:11": "eleven" });
  const h = translations.readings.haftarah.versions[0];
  assert.equal(h.credit, "English: The Metsudah Tanach series (Lakewood, N.J.), CC BY, via Sefaria.");
  assert.deepEqual(h.verses, { "20:18": "a", "20:19": "b", "20:20": "" });
  assert.deepEqual(report.torah, { offered: ["metsudah"], absent: ["koren"] });
  two.readings[0].verses = [];
  const again = await translationsFor(two, { translations: ["jps2023", "metsudah"] }, { get });
  assert.deepEqual(Object.keys(again.translations.readings), ["haftarah"]);
});

test("translationsFor: an unknown customs key is ignored with a note; a Sefaria failure throws naming the reading", async () => {
  const { report } = await translationsFor(fixture("week-min"), { translations: ["jps2023", "alter"] }, { get: async () => answer() });
  assert.deepEqual(report.haftarah, { offered: [], absent: [], unknown: ["alter"] });
  await assert.rejects(translationsFor(fixture("week-min"), customs, { get: async () => { throw new Error("503 Service Unavailable"); } }), /translations: haftarah \(I Samuel 20:18-20\): 503/);
});

test("buildTranslations writes translations.json and logs what each reading offers", async () => {
  const dir = await mkdtemp(join(tmpdir(), "tr-"));
  try {
    await writeFile(join(dir, "sheet.json"), JSON.stringify(fixture("week-min")));
    const lines = [];
    await buildTranslations(dir, { customs, get: async () => answer(), log: l => lines.push(l) });
    const t = JSON.parse(await readFile(join(dir, "translations.json"), "utf8"));
    assert.deepEqual(t.readings.haftarah.versions.map(v => v.key), ["jps1985", "koren"]);
    assert.match(lines.join("\n"), /translations  haftarah  jps1985, koren \(not on Sefaria for this book: metsudah\)/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("the committed fixture translations.json carries two synthetic versions for week-notes and no licensed text", () => {
  const t = JSON.parse(readFileSync(new URL("./fixtures/week-notes/translations.json", import.meta.url), "utf8"));
  assert.equal(t.schema, 1);
  assert.deepEqual(t.readings.haftarah.versions.map(v => v.key), ["jps1985", "koren"]);
  const notes = fixture("week-notes");
  for (const v of t.readings.haftarah.versions) {
    assert.equal(Object.keys(v.verses).length, notes.verses.length);
    for (const html of Object.values(v.verses)) assert.match(html, /^A fixture rendering \(.*\) of verse \d+\.$/);
  }
});
