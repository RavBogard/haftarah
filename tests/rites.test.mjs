import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { defaultHaftarahFor, HAFTARAH_RITES } from "../scripts/rites.mjs";

// Hebcal's English names for the 54 parashot and the 7 combined weeks.
const HEBCAL = ["Bereshit", "Noach", "Lech-Lecha", "Vayera", "Chayei Sara", "Toldot", "Vayetzei", "Vayishlach", "Vayeshev", "Miketz", "Vayigash", "Vayechi",
  "Shemot", "Vaera", "Bo", "Beshalach", "Yitro", "Mishpatim", "Terumah", "Tetzaveh", "Ki Tisa", "Vayakhel", "Pekudei",
  "Vayikra", "Tzav", "Shmini", "Tazria", "Metzora", "Achrei Mot", "Kedoshim", "Emor", "Behar", "Bechukotai",
  "Bamidbar", "Nasso", "Beha'alotcha", "Sh'lach", "Korach", "Chukat", "Balak", "Pinchas", "Matot", "Masei",
  "Devarim", "Vaetchanan", "Eikev", "Re'eh", "Shoftim", "Ki Teitzei", "Ki Tavo", "Nitzavim", "Vayeilech", "Ha'azinu", "Vezot Haberakhah",
  "Vayakhel-Pekudei", "Tazria-Metzora", "Achrei Mot-Kedoshim", "Behar-Bechukotai", "Chukat-Balak", "Matot-Masei", "Nitzavim-Vayeilech"];

test("every Hebcal parashah name finds its Ashkenazi haftarah, apostrophes and hyphens included", () => {
  for (const name of HEBCAL) assert.ok(defaultHaftarahFor(name), name);
  assert.equal(defaultHaftarahFor("Ha'azinu"), "II Samuel 22:1-51");      // missed before Wave 2: "ha azinu" was looked up
  assert.equal(defaultHaftarahFor("Sh'lach"), "Joshua 2:1-24");
  assert.equal(defaultHaftarahFor("Vayakhel-Pekudei"), "I Kings 7:51-8:21");
  assert.equal(defaultHaftarahFor("Pesach Shabbat Chol ha-Moed"), null);
  assert.equal(Object.keys(HAFTARAH_RITES.ashkenazi).length, 61);
  assert.throws(() => defaultHaftarahFor("Noach", "yemenite"), /no haftarah table for rite "yemenite"/);
});

test("fetch.mjs keeps no parashahKey of its own (lib.js's is the one)", () => {
  const src = readFileSync(new URL("../scripts/fetch.mjs", import.meta.url), "utf8");
  assert.ok(!/(const|let|function)\s+parashahKey\b/.test(src));
  assert.ok(!/DEFAULT_HAFTAROT|normalizeParashah/.test(src));
});
