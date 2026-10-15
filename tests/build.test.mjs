import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { readingsToBuild, torahColophonData, haftarahColophonData } from "../scripts/build.mjs";
import { makeWeekTorah } from "./helpers/makeWeekTorah.mjs";

const load = async f => JSON.parse(await readFile(new URL(`./fixtures/${f}/sheet.json`, import.meta.url), "utf8"));

test("the week-torah fixture is makeWeekTorah(week-min): it carries no text of its own", async () => {
  assert.deepEqual(await load("week-torah"), makeWeekTorah(await load("week-min")));
});

test("readingsToBuild: every reading with verses, Torah first; --reading narrows; a missing one is an error", async () => {
  const min = await load("week-min"), two = await load("week-torah");
  assert.deepEqual(readingsToBuild(min), [{ id: "haftarah", kind: "haftarah" }]);
  assert.deepEqual(readingsToBuild(two), [{ id: "torah", kind: "torah" }, { id: "haftarah", kind: "haftarah" }]);
  assert.deepEqual(readingsToBuild(two, "torah"), [{ id: "torah", kind: "torah" }]);
  assert.deepEqual(readingsToBuild(two, "haftarah"), [{ id: "haftarah", kind: "haftarah" }]);
  assert.throws(() => readingsToBuild(min, "torah"), /this sheet has no torah reading with verses/);
});

test("check.mjs targets: every reading, or the one --reading names; an unknown reading is refused; the messages read cleanly", async () => {
  const { checkTargets } = await import("../scripts/check.mjs");
  const min = await load("week-min"), two = await load("week-torah");
  assert.deepEqual(checkTargets(two).map(t => t.html), ["sheet-torah.html", "sheet.html"]);
  assert.deepEqual(checkTargets(two, { only: "torah" }).map(t => t.html), ["sheet-torah.html"]);
  assert.deepEqual(checkTargets(two, { trope: true }).map(t => t.html), ["sheet-trope.html"]);
  assert.throws(() => checkTargets(two, { only: "foo" }), /^Error: --reading takes torah or haftarah, not "foo"$/);
  assert.throws(() => checkTargets(two, { only: "" }), /^Error: --reading takes torah or haftarah$/);
  assert.throws(() => checkTargets(min, { only: "torah" }), /^Error: no torah reading with verses to check$/);
  assert.throws(() => checkTargets({ schema: 3, readings: [] }), /^Error: no reading with verses to check$/, "no double space");
});

test("render.js changes only behind the Torah option the haftarah build never passes", async () => {
  const src = await readFile(new URL("../template/render.js", import.meta.url), "utf8");
  const uses = src.match(/opts\.reading/g) || [];
  assert.equal(uses.length, 3);
  assert.equal((src.match(/opts\.reading === "torah"|opts\.reading !== "torah"/g) || []).length, 3);
});

test("torahColophonData: the Torah sheet's Next week names the Torah reading, and is dropped without one", async () => {
  const two = await load("week-torah");
  const view = { nextWeek: two.nextWeek, haftarah: {} };
  const t = torahColophonData(view);
  assert.equal(t.nextWeek.ref, "Genesis 6:9–11:32");
  assert.equal(t.nextWeek.shabbat, "Noach");
  assert.equal(view.nextWeek.ref, "Isaiah 54:1-55:5", "the haftarah's own data is not touched");
  assert.equal(torahColophonData({ nextWeek: { shabbat: "Noach", ref: "Isaiah 54:1-55:5" } }).nextWeek, null);
  assert.equal(torahColophonData({ nextWeek: null }).nextWeek, null);
  assert.equal(torahColophonData({}).nextWeek, null);
  assert.deepEqual(haftarahColophonData(view).nextWeek, { shabbat: "Noach", special: null, ref: "Isaiah 54:1-55:5", civilDisplay: "October 17, 2026", status: "approved" }, "no torahRef in the haftarah's page");
  const plain = { nextWeek: { shabbat: "Noach", ref: "x" } };
  assert.equal(haftarahColophonData(plain), plain);
});
