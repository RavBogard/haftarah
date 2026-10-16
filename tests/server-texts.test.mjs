// tests/server-texts.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { sliceTexts } from "../api/_lib/texts.mjs";
import { MAX_RESULT_CHARS } from "../api/_lib/mcp.mjs";

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
  do { const r = sliceTexts(big, {}, cursor, 120_000); pages++; assert.ok(JSON.stringify(r.items).length <= 120_000, "a page fits"); assert.ok(JSON.stringify(r, null, 1).length <= MAX_RESULT_CHARS, "a page fits as the transport prints it"); seen.push(...r.items.map(i => i.ref)); cursor = r.cursor; } while (cursor);
  assert.ok(pages > 10);
  const total = sliceTexts(big, {}, null, 1e9).total;
  assert.equal(seen.length, total); assert.equal(new Set(seen).size, total);
});

test("sliceTexts budgets the pretty-printed size: many small items stay under the cap as printed", () => {
  const many = { commentaries: {}, linked: Object.fromEntries(Array.from({ length: 5000 }, (_, i) => [`L ${i}`, { source: "S", category: "Midrash", anchors: ["Isaiah 54:1", "Isaiah 54:2"], he: "א", en: "e" }])) };
  let cursor = null, n = 0;
  do { const r = sliceTexts(many, {}, cursor, 90_000); assert.ok(JSON.stringify(r, null, 1).length <= 90_000, `page ${n}`); cursor = r.cursor; n++; } while (cursor);
  assert.ok(n > 1);
});

test("sliceTexts: a bad cursor does not throw; a linked text with no source is kept with source empty", () => {
  for (const c of [-5, 1.5, "x", "-1", "1e9", null]) { const r = sliceTexts(texts, {}, c, 1e9); assert.ok(Array.isArray(r.items), String(c)); }
  assert.equal(sliceTexts(texts, {}, -5, 1e9).items.length, sliceTexts(texts, {}, null, 1e9).total, "a negative cursor starts at the beginning");
  assert.equal(sliceTexts(texts, {}, "x", 1e9).items[0].ref, sliceTexts(texts, {}, null, 1e9).items[0].ref);
  assert.equal(sliceTexts(texts, {}, 1.5, 1e9).items[0].ref, sliceTexts(texts, {}, null, 1e9).items[1].ref, "1.5 floors to 1");
  assert.deepEqual(sliceTexts(texts, {}, "1e9", 1e9), { items: [], cursor: null, total: sliceTexts(texts, {}, null, 1e9).total });
  const odd = { commentaries: {}, linked: { "Pirkei 1": { category: "Midrash", anchors: ["Isaiah 54:1"], he: "א" } } };
  const all = sliceTexts(odd, {}, null, 1e9);
  assert.equal(all.items[0].source, "");
  assert.deepEqual(sliceTexts(odd, { source: "Rashi" }, null, 1e9).items, []);
});
