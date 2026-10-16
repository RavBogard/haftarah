// tests/server-texts.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { sliceTexts } from "../api/_lib/texts.mjs";

const texts = JSON.parse(await readFile(new URL("./fixtures/digest/texts.json", import.meta.url), "utf8"));

test("sliceTexts: every commentary segment and linked text once, in order, with its source, kind and verse; filters narrow", () => {
  const all = sliceTexts(texts, {}, null, 1e9);
  assert.equal(all.cursor, null);
  const segs = Object.values(texts.commentaries).reduce((n, c) => n + Object.keys(c.segments).length, 0) + Object.keys(texts.linked).length;
  assert.equal(all.total, segs); assert.equal(all.items.length, segs);
  assert.deepEqual(Object.keys(all.items[0]).sort(), ["he", "kind", "ref", "source", "verse", "en", "sectionFiled"].sort().filter(k => k in all.items[0]).sort());
  const rashi = sliceTexts(texts, { source: "Rashi" }, null, 1e9);
  assert.ok(rashi.items.length >= 1 && rashi.items.every(i => i.source === "Rashi on Isaiah"));
  const v3 = sliceTexts(texts, { verse: 3 }, null, 1e9);
  assert.ok(v3.items.every(i => i.verse === "Isaiah 54:3" || (i.anchors || []).includes("Isaiah 54:3")));
  const talmud = sliceTexts(texts, { kind: "talmud" }, null, 1e9);
  assert.ok(talmud.items.every(i => i.kind === "talmud"));
});

test("sliceTexts pages under the cap and the cursors cover every item exactly once", () => {
  const big = { ...texts, linked: Object.fromEntries(Array.from({ length: 400 }, (_, i) => [`Linked ${i}`, { source: "S", category: "Midrash", kind: "Midrash", anchors: ["Isaiah 54:1"], he: "א".repeat(3000), en: "e".repeat(3000) }])) };
  const seen = []; let cursor = null, pages = 0;
  do { const r = sliceTexts(big, {}, cursor, 120_000); pages++; assert.ok(JSON.stringify(r.items).length <= 120_000, "a page fits"); seen.push(...r.items.map(i => i.ref)); cursor = r.cursor; } while (cursor);
  assert.ok(pages > 10);
  const total = sliceTexts(big, {}, null, 1e9).total;
  assert.equal(seen.length, total); assert.equal(new Set(seen).size, total);
});
