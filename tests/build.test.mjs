import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { readingsToBuild } from "../scripts/build.mjs";
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

test("render.js changes only behind the Torah option the haftarah build never passes", async () => {
  const src = await readFile(new URL("../template/render.js", import.meta.url), "utf8");
  const uses = src.match(/opts\.reading/g) || [];
  assert.equal(uses.length, 3);
  assert.equal((src.match(/opts\.reading === "torah"|opts\.reading !== "torah"/g) || []).length, 3);
});
