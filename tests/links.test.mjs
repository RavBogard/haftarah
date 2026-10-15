import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CATEGORIES, groupLinks, relatedFor, buildLinks } from "../scripts/links.mjs";

const fixture = name => JSON.parse(readFileSync(new URL(`./fixtures/${name}/sheet.json`, import.meta.url), "utf8"));
const link = (category, index_title, ref, en = true, collective = null, num = null) => ({ category, index_title, ref, anchorRef: "I Samuel 20:18", sourceHasEn: en, sourceHeRef: "x", collectiveTitle: { en: collective || index_title.replace(/ on .*$/, ""), he: "" }, ...(num != null ? { commentaryNum: num } : {}) });
const sample = [
  link("Quoting Commentary", "Tzror HaMor on Torah", "Tzror HaMor on Torah, Genesis 1:1:3", false),
  link("Commentary", "Rashi on I Samuel", "Rashi on I Samuel 20:18:1", true, "Rashi", 1.0001),
  link("Commentary", "Radak on I Samuel", "Radak on I Samuel 20:18:1", false, "Radak", 1.0002),
  link("Commentary", "Rashi on I Samuel", "Rashi on I Samuel 20:18:2", true, "Rashi", 1.0001),
  link("Talmud", "Berakhot", "Berakhot 10a:7"),
  link("Midrash", "Midrash Tanchuma", "Midrash Tanchuma, Noach 3:1"),
  link("Essay", "Some Essay", "Some Essay 1"),
  { category: "Sheets", ref: "x" },
  link("Tanakh", "Psalms", "Psalms 55:14"),
  link("Reference", "Jastrow", "Jastrow, פקד 1"),
];

test("CATEGORIES is the spec's list in its order, Quoting Commentary last", () => {
  assert.deepEqual(CATEGORIES, ["Commentary", "Targum", "Midrash", "Talmud", "Halakhah", "Kabbalah", "Chasidut", "Jewish Thought", "Musar", "Second Temple", "Reference", "Liturgy", "Tanakh", "Quoting Commentary"]);
});

test("groupLinks keeps textual categories in the spec's order, groups commentaries by work with Hebrew-only refs apart, drops the rest", () => {
  const g = groupLinks(sample);
  assert.equal(g.n, 8);
  assert.deepEqual(g.groups.map(x => x.category), ["Commentary", "Midrash", "Talmud", "Reference", "Tanakh", "Quoting Commentary"]);
  assert.deepEqual(g.groups[0].works, [
    { title: "Rashi", refs: ["Rashi on I Samuel 20:18:1", "Rashi on I Samuel 20:18:2"], he: [] },
    { title: "Radak", refs: [], he: ["Radak on I Samuel 20:18:1"] },
  ]);
  assert.deepEqual(g.groups[2].works, [{ title: "Berakhot", refs: ["Berakhot 10a:7"], he: [] }]);
  assert.deepEqual(g.groups[5].works, [{ title: "Tzror HaMor", refs: [], he: ["Tzror HaMor on Torah, Genesis 1:1:3"] }]);
  assert.deepEqual(groupLinks([]), { n: 0, groups: [] });
  assert.deepEqual(groupLinks(null), { n: 0, groups: [] });
});

test("relatedFor asks once per verse of every reading, records a failed verse without throwing", async () => {
  const calls = [];
  const get = async url => { calls.push(url); if (/20%3A19/.test(url)) throw new Error("503"); return { links: sample, sheets: [{ junk: true }], topics: [] }; };
  const { links, report } = await relatedFor(fixture("week-min"), { get });
  assert.deepEqual(calls, ["https://www.sefaria.org/api/related/I%20Samuel%2020%3A18", "https://www.sefaria.org/api/related/I%20Samuel%2020%3A19", "https://www.sefaria.org/api/related/I%20Samuel%2020%3A20"]);
  assert.equal(links.schema, 1);
  const v = links.readings.haftarah.verses;
  assert.equal(v["20:18"].n, 8);
  assert.deepEqual(v["20:19"], { n: 0, groups: [], failed: true });
  assert.deepEqual(report.haftarah, { verses: 3, links: 16, failed: ["20:19"], errors: { "20:19": "503" } });
  assert.ok(!JSON.stringify(links).includes("503"), "the cause is in the report, not in links.json");
});

test("groupLinks sorts works: numbered commentaries by number before unnumbered ones, the unnumbered by title", () => {
  const g = groupLinks([
    link("Commentary", "Ralbag on I Samuel", "Ralbag on I Samuel 20:18:1", true, "Ralbag"),
    link("Commentary", "Malbim on I Samuel", "Malbim on I Samuel 20:18:1", true, "Malbim", 2),
    link("Commentary", "Abarbanel on I Samuel", "Abarbanel on I Samuel 20:18:1", true, "Abarbanel"),
    link("Commentary", "Rashi on I Samuel", "Rashi on I Samuel 20:18:1", true, "Rashi", 1),
    link("Midrash", "Midrash Tanchuma", "Midrash Tanchuma, Noach 3:1"),
    link("Midrash", "Bereshit Rabbah", "Bereshit Rabbah 1:1"),
  ]);
  assert.deepEqual(g.groups[0].works.map(w => w.title), ["Rashi", "Malbim", "Abarbanel", "Ralbag"]);
  assert.deepEqual(g.groups[1].works.map(w => w.title), ["Bereshit Rabbah", "Midrash Tanchuma"]);
});

test("buildLinks names the first failure's cause in its line", async () => {
  const dir = await mkdtemp(join(tmpdir(), "links-"));
  try {
    await writeFile(join(dir, "sheet.json"), JSON.stringify(fixture("week-min")));
    const lines = [];
    await buildLinks(dir, { get: async url => { if (/20%3A19/.test(url)) throw new Error("HTTP 429 Too Many Requests"); return { links: sample }; }, log: l => lines.push(l) });
    assert.match(lines.join("\n"), /Sefaria did not answer for 20:19 \(first: HTTP 429 Too Many Requests\)/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("buildLinks writes links.json and logs; a two-reading week covers both", async () => {
  const { makeWeekTorah } = await import("./helpers/makeWeekTorah.mjs");
  const dir = await mkdtemp(join(tmpdir(), "links-"));
  try {
    await writeFile(join(dir, "sheet.json"), JSON.stringify(makeWeekTorah(fixture("week-min"))));
    const lines = [];
    await buildLinks(dir, { get: async () => ({ links: sample }), log: l => lines.push(l) });
    const l = JSON.parse(await readFile(join(dir, "links.json"), "utf8"));
    assert.deepEqual(Object.keys(l.readings), ["torah", "haftarah"]);
    assert.equal(Object.keys(l.readings.torah.verses).length, 3);
    assert.match(lines.join("\n"), /links    torah  3 verses, 24 links/);
    assert.match(lines.join("\n"), /links    haftarah  3 verses, 24 links/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("the committed fixture links.json holds refs only, for every verse of week-notes", () => {
  const l = JSON.parse(readFileSync(new URL("./fixtures/week-notes/links.json", import.meta.url), "utf8"));
  const notes = fixture("week-notes");
  assert.equal(Object.keys(l.readings.haftarah.verses).length, notes.verses.length);
  assert.ok(!JSON.stringify(l).includes('"text"'));
  const v = l.readings.haftarah.verses["20:18"];
  assert.ok(v.groups.some(g => g.category === "Commentary" && g.works.some(w => w.title === "Rashi")));
});
