import { test } from "node:test";
import assert from "node:assert/strict";
import { parseAlias, resolveWeekAlias, weeksFor } from "../site/app/library.js";
import { aliasRewrites, isAliasPath } from "../site/app/parashot.js";

const W = (slug, civil, cycle, keys, extra = {}) => ({ slug, civil, cycle, parashahKeys: keys, tags: [], ...extra });
export const WEEKS = [
  W("2026-12-05-vayeshev-chanukah", "2026-12-05", "5787", ["vayeshev"], { book: "Zechariah", tags: ["chanukah"], readings: [{ kind: "torah", ref: "Genesis 37:1–11", book: "Genesis" }, { kind: "haftarah", ref: "Zechariah 2:14–4:7", book: "Zechariah" }] }),
  W("2026-10-17-noach", "2026-10-17", "5787", ["noach"], { book: "Isaiah", readings: [{ kind: "haftarah", ref: "Isaiah 54:1–55:5", book: "Isaiah" }] }),
  W("2025-10-25-noach", "2025-10-25", "5786", ["noach"], { book: "Isaiah", readings: [{ kind: "haftarah", ref: "Isaiah 54:1–55:5", book: "Isaiah" }] }),
  W("2025-03-22-vayakhel-pekudei", "2025-03-22", "5785", ["vayakhel", "pekudei"], { book: "I Kings", tags: ["shekalim"], readings: [{ kind: "haftarah", ref: "I Kings 7:51–8:21", book: "I Kings" }] }),
];

test("parseAlias reads the five kinds of short address and nothing else", () => {
  assert.deepEqual(parseAlias("/noach"), { kind: "week", year: null, key: "noach" });
  assert.deepEqual(parseAlias("/5787/noach/"), { kind: "week", year: "5787", key: "noach" });
  assert.deepEqual(parseAlias("/vayakhel-pekudei"), { kind: "week", year: null, key: "vayakhel-pekudei" });
  assert.deepEqual(parseAlias("/torah/genesis"), { kind: "torah", book: "Genesis" });
  assert.deepEqual(parseAlias("/prophets/i-samuel"), { kind: "prophets", book: "I Samuel" });
  assert.deepEqual(parseAlias("/special/chanukah"), { kind: "special", tag: "chanukah", en: "Shabbat Chanukah" });
  for (const p of ["/", "/nothing", "/5787", "/5787/nothing", "/torah/isaiah", "/prophets/genesis", "/special/purim", "/2026-10-17-noach", null]) assert.equal(parseAlias(p), null, String(p));
});

test("resolveWeekAlias: the latest sheet for the parashah, or that year's", () => {
  assert.deepEqual(resolveWeekAlias(parseAlias("/noach"), WEEKS), { slug: "2026-10-17-noach" });
  assert.deepEqual(resolveWeekAlias(parseAlias("/5786/noach"), WEEKS), { slug: "2025-10-25-noach" });
  const two = [W("2026-10-17-noach-special", "2026-10-17", "5787", ["noach"]), W("2026-10-17-noach", "2026-10-17", "5787", ["noach"])];
  assert.deepEqual(resolveWeekAlias(parseAlias("/noach"), two), { slug: "2026-10-17-noach" }, "two sheets one Shabbat: the plainer slug");
  assert.deepEqual(resolveWeekAlias(parseAlias("/noach"), [{ slug: "2024-11-02-noach", civil: "2024-11-02", parashahKey: "noach", cycle: "5785" }]), { slug: "2024-11-02-noach" }, "a row from before parashahKeys");
});

test("resolveWeekAlias: either half of a combined parashah finds the combined week, and the pair finds either half", () => {
  assert.deepEqual(resolveWeekAlias(parseAlias("/vayakhel"), WEEKS), { slug: "2025-03-22-vayakhel-pekudei" });
  assert.deepEqual(resolveWeekAlias(parseAlias("/pekudei"), WEEKS), { slug: "2025-03-22-vayakhel-pekudei" });
  assert.deepEqual(resolveWeekAlias(parseAlias("/vayakhel-pekudei"), [W("2027-03-06-vayakhel-shekalim", "2027-03-06", "5787", ["vayakhel"])]), { slug: "2027-03-06-vayakhel-shekalim" });
});

test("resolveWeekAlias: a parashah or a year with no sheet says which, by name", () => {
  assert.deepEqual(resolveWeekAlias(parseAlias("/haazinu"), WEEKS), { missing: { key: "haazinu", year: null, en: "Ha'azinu" } });
  assert.deepEqual(resolveWeekAlias(parseAlias("/5790/noach"), WEEKS), { missing: { key: "noach", year: "5790", en: "Noach" } });
  assert.deepEqual(resolveWeekAlias(parseAlias("/matot-masei"), []), { missing: { key: "matot-masei", year: null, en: "Matot-Masei" } });
});

test("weeksFor: a Torah book, a haftarah book, a special Shabbat, newest first", () => {
  assert.deepEqual(weeksFor(parseAlias("/torah/genesis"), WEEKS).weeks.map(w => w.slug), ["2026-12-05-vayeshev-chanukah", "2026-10-17-noach", "2025-10-25-noach"]);
  assert.equal(weeksFor(parseAlias("/torah/genesis"), WEEKS).title, "Torah: Genesis");
  assert.deepEqual(weeksFor(parseAlias("/prophets/isaiah"), WEEKS).weeks.map(w => w.slug), ["2026-10-17-noach", "2025-10-25-noach"]);
  assert.equal(weeksFor(parseAlias("/prophets/isaiah"), WEEKS).title, "Haftarot from Isaiah");
  assert.deepEqual(weeksFor(parseAlias("/special/chanukah"), WEEKS), { title: "Shabbat Chanukah", weeks: [WEEKS[0]] });
  assert.deepEqual(weeksFor(parseAlias("/torah/numbers"), WEEKS).weeks, []);
});

test("isAliasPath is exactly aliasRewrites' allow-list", () => {
  for (const p of ["/noach", "/5787/noach", "/vayakhel-pekudei", "/torah/genesis", "/prophets/ii-kings", "/special/shuva", "/bo"]) assert.equal(isAliasPath(p), true, p);
  for (const p of ["/noah", "/Noach", "/torah/isaiah", "/2026-10-17-noach", "/index.html", "/noach/extra", "/57870/noach", "/special/purim", ""]) assert.equal(isAliasPath(p), false, p);
  const r = aliasRewrites();
  assert.equal(r.length, 5);
  assert.ok(r.every(x => x.destination === "/library.html"));
  assert.equal(r[0].source.slice(0, 26), "/:year(\\d{4})/:parashah(be");
});
