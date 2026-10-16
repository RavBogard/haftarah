import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, cp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkWeek } from "../scripts/check.mjs";

// A render carrying exactly what analyse() reads, so the check runs with no browser: a front page, then
// text pages 90% full, and no margin keys (a key needs its printed note, which this fake does not draw).
const dom = (pages, yy) => `<html data-pages="${pages}" data-yy="${yy}" data-keys="" data-figures=""><body>${Array.from({ length: pages }, (_, i) => `<section class="page" data-kind="${i ? "text" : "front"}" data-rows="3" data-gap="12" data-fill="90" data-split="" data-offpage="0"></section>`).join("")}</body></html>`;
const TETRA = /י[֑-ׇ]*ה[֑-ׇ]*ו[֑-ׇ]*ה[֑-ׇ]*/g;

test("checkWeek renders every built reading twice through the injected dumpDom and reports per reading", async () => {
  const dir = await mkdtemp(join(tmpdir(), "haftarah-check-"));
  try {
    await cp(new URL("./fixtures/week-torah/", import.meta.url), dir, { recursive: true });
    const sheet = JSON.parse(await readFile(join(dir, "sheet.json"), "utf8"));
    const yyOf = id => { const d = sheet.readings.find(r => r.id === id); return [...d.verses.map(v => v.he), d.incipit?.he || ""].join(" ").match(TETRA)?.length || 0; };
    const urls = [];
    const r = await checkWeek(dir, { browser: "/fake/chrome", log: () => {}, dumpDomImpl: async (browser, url) => { urls.push(url); return dom(2, url.includes("torah") ? yyOf("torah") : yyOf("haftarah")); } });
    assert.equal(r.ok, true);
    assert.deepEqual(r.readings.map(x => [x.kind, x.summary.pages, x.problems]), [["torah", 2, []], ["haftarah", 2, []]]);
    assert.equal(urls.length, 4, "two renders per reading");
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("checkWeek: a divine-name count that disagrees with the data is a problem, and a missing HTML file is named", async () => {
  const dir = await mkdtemp(join(tmpdir(), "haftarah-check-"));
  try {
    await cp(new URL("./fixtures/week-min/", import.meta.url), dir, { recursive: true });
    const r = await checkWeek(dir, { browser: "/fake/chrome", log: () => {}, dumpDomImpl: async () => dom(1, 99) });
    assert.equal(r.ok, false);
    assert.ok(r.readings[0].problems.some(p => p.startsWith("divine name: 99 replaced")));
    await rm(join(dir, "sheet.html"));
    const m = await checkWeek(dir, { browser: "/fake/chrome", log: () => {}, dumpDomImpl: async () => dom(1, 0) });
    assert.equal(m.ok, false);
    assert.match(m.readings[0].problems[0], /sheet\.html is missing/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
