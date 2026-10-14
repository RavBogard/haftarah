import { test } from "node:test";
import assert from "node:assert/strict";
import { slugFromPath, dataUrl, rangeLabel, countLabel } from "../site/app/sheet.js";

test("slugFromPath normalizes case and a trailing slash", () => {
  assert.equal(slugFromPath("/2026-10-17-noach"), "2026-10-17-noach");
  assert.equal(slugFromPath("/2026-10-17-Noach/"), "2026-10-17-noach");
  assert.equal(slugFromPath("/2026-10-10-bereshit-machar-chodesh"), "2026-10-10-bereshit-machar-chodesh");
  assert.equal(slugFromPath("/"), null);
  assert.equal(slugFromPath("/sheet.html"), null);
  assert.equal(slugFromPath("/2026-10-17-noach/extra"), null);
});

test("dataUrl, rangeLabel, countLabel", () => {
  assert.equal(dataUrl("2026-10-17-noach", "sheet.pdf"), "/data/weeks/2026-10-17-noach/sheet.pdf");
  assert.equal(rangeLabel("Isaiah", { chapter: 54, verse: 1 }, { chapter: 54, verse: 1 }), "Isaiah 54:1");
  assert.equal(rangeLabel("Isaiah", { chapter: 54, verse: 1 }, { chapter: 54, verse: 5 }), "Isaiah 54:1–5");
  assert.equal(rangeLabel("Isaiah", { chapter: 54, verse: 12 }, { chapter: 55, verse: 3 }), "Isaiah 54:12–55:3");
  assert.equal(countLabel(6, 1), "6 comments · 1 note");
  assert.equal(countLabel(1, 0), "1 comment");
  assert.equal(countLabel(0, 2), "2 notes");
  assert.equal(countLabel(0, 0), "");
});
