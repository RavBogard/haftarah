import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { PARASHOT, COMBINED, TORAH_BOOKS, PROPHET_BOOKS, SPECIALS, keyOf, isParashahKey, parashahKeysOf, parashahName, weekKeys, weekTags } from "../site/app/parashot.js";
import { HAFTARAH_RITES } from "../scripts/rites.mjs";
const L = createRequire(import.meta.url)("../template/lib.js");

test("54 parashot in Torah order, five books, unique keys", () => {
  assert.equal(PARASHOT.length, 54);
  assert.deepEqual(PARASHOT.map(p => p.order), Array.from({ length: 54 }, (_, i) => i + 1));
  assert.equal(new Set(PARASHOT.map(p => p.key)).size, 54);
  assert.deepEqual(TORAH_BOOKS.map(b => PARASHOT.filter(p => p.book === b).length), [12, 11, 10, 10, 11]);
  assert.equal(PARASHOT[0].key, "bereshit"); assert.equal(PARASHOT[53].key, "vezot-haberakhah");
  assert.ok(PARASHOT.every(p => p.he && /[א-ת]/.test(p.he)));
  assert.equal(Object.keys(COMBINED).length, 7);
  for (const [k, pair] of Object.entries(COMBINED)) assert.ok(pair.every(isParashahKey) && k === pair.join("-"), k);
  assert.equal(PROPHET_BOOKS.length, 21);
});

test("keys are lib.js's parashahKey of Hebcal's names, so a key made in the browser matches one made by publish", () => {
  for (const name of ["Lech-Lecha", "Ha'azinu", "Sh'lach", "Beha'alotcha", "Re'eh", "Vayakhel-Pekudei", "Achrei Mot-Kedoshim", "Pesach Shabbat Chol ha-Moed", "I Samuel"]) assert.equal(keyOf(name), L.parashahKey(name), name);
  for (const p of PARASHOT) assert.equal(keyOf(p.en), p.key, p.en);
  assert.ok(Object.keys(HAFTARAH_RITES.ashkenazi).every(isParashahKey), "the rite table and the library agree on every key");
});

test("parashahKeysOf: both halves of a combined parashah; a single one; a festival's own key", () => {
  assert.deepEqual(parashahKeysOf("Vayakhel-Pekudei"), ["vayakhel", "pekudei"]);
  assert.deepEqual(parashahKeysOf("Lech-Lecha"), ["lech-lecha"]);
  assert.deepEqual(parashahKeysOf("Pesach Shabbat Chol ha-Moed"), ["pesach-shabbat-chol-ha-moed"]);
  assert.deepEqual(parashahKeysOf(""), []);
  assert.equal(parashahName("matot-masei"), "Matot-Masei");
  assert.equal(parashahName("haazinu"), "Ha'azinu");
  assert.deepEqual(weekKeys({ parashahKeys: ["matot", "masei"] }), ["matot", "masei"]);
  assert.deepEqual(weekKeys({ parashahKey: "matot-masei" }), ["matot", "masei"], "a row written before parashahKeys");
  assert.deepEqual(weekKeys({ parashah: "Noach" }), ["noach"]);
});

test("weekTags files special Shabbatot and festivals by Hebcal's reason or name", () => {
  assert.deepEqual(weekTags({ parashah: "Vayeshev", special: "Chanukah Day 1 (on Shabbat)" }), ["chanukah"]);
  assert.deepEqual(weekTags({ parashah: "Ha'azinu", special: "Shabbat Shuva (with Ha'azinu)" }), ["shuva"]);
  assert.deepEqual(weekTags({ parashah: "Bereshit", special: "Shabbat Machar Chodesh" }), ["machar-chodesh"]);
  assert.deepEqual(weekTags({ parashah: "Vaera", special: "Shabbat Rosh Chodesh" }), ["rosh-chodesh"]);
  assert.deepEqual(weekTags({ parashah: "Miketz", special: "Shabbat Rosh Chodesh Chanukah" }), ["chanukah", "rosh-chodesh"]);
  assert.deepEqual(weekTags({ parashah: "Vayakhel", special: "Shabbat Shekalim" }), ["shekalim"]);
  assert.deepEqual(weekTags({ parashah: "Pesach Shabbat Chol ha-Moed", special: null }), ["pesach"]);
  assert.deepEqual(weekTags({ parashah: "Noach", special: null }), []);
  assert.ok(SPECIALS.every(s => /^[a-z-]+$/.test(s.tag) && s.en));
});
