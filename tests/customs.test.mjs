import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadCustoms, validateCustoms } from "../scripts/customs.mjs";

test("customs/crc.json is valid and says what spec 3.2 says, with Daniel's open items flagged", async () => {
  const c = await loadCustoms("crc");
  assert.deepEqual(validateCustoms(c), []);
  assert.equal(c.id, "crc");
  assert.equal(c.calendar.diaspora, true);
  assert.equal(c.haftarahRite, "ashkenazi");
  assert.deepEqual(c.torah, { mode: "selection", rule: "weekly", triennial: null });
  assert.equal(c.entryCap, 24);
  assert.equal(c.versions.he, "Miqra according to the Masorah");
  assert.equal(c.versions.en, "THE JPS TANAKH: Gender-Sensitive Edition");
  assert.equal(c.series.name, "Torah from Scratch");
  for (const k of ["torah", "entryCap", "nusach"]) assert.ok(c.toConfirm.includes(k), k);
});

test("validateCustoms names every unusable field", () => {
  assert.deepEqual(validateCustoms({ id: "Bad Id", calendar: {}, haftarahRite: "x", torah: { mode: "weekly" }, versions: {}, entryCap: 0, series: {} }), [
    "id: lowercase letters, digits and hyphens",
    "calendar.diaspora: true or false",
    "haftarahRite: one of ashkenazi",
    "torah.mode: one of selection, triennial, full",
    "versions.he and versions.en: Sefaria version titles",
    "entryCap: a whole number of entries per reading",
    "series.name: the series the sheets belong to",
  ]);
  assert.deepEqual(validateCustoms(null), ["not a JSON object"]);
});

test("loadCustoms names the file it could not use", async () => {
  await assert.rejects(loadCustoms("nobody"), /customs: cannot read .*nobody\.json/);
});

test("no CRC constant lives in the code that will serve other congregations: it comes from customs", () => {
  for (const f of ["scripts/fetch.mjs", "scripts/leyning.mjs", "scripts/lint.mjs", "template/lib.js"]) {
    const src = readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
    for (const s of ["Central Reform", "Daniel Bogard", "Miqra according to the Masorah", "Gender-Sensitive", "Tell me what I got wrong"]) assert.ok(!src.includes(s), `${f} has "${s}"`);
  }
});
