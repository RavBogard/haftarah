// The print golden: the two fixtures must build and render exactly what was recorded at the start of
// 2.0. A failure here means the printed sheet changed. If that was deliberate (Wave 4 only), look at
// the PDFs, then re-record with: node scripts/golden.mjs --update
import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { isolatedEnv } from "./helpers/isolatedEnv.mjs";
import { findBrowser } from "../scripts/build.mjs";
import { browserVersion, sha256 } from "../scripts/chrome.mjs";
import { FIXTURES, readGolden, buildFixture, domHash, foldEol, compare } from "../scripts/golden.mjs";

const FIX = fileURLToPath(new URL("./fixtures/", import.meta.url));
const golden = await readGolden();
const browser = findBrowser();
const version = browser ? await browserVersion(browser) : null;
const domSkip = !browser ? "no Chrome or Edge on this machine"
  : !golden.browser ? "the golden was recorded without a browser"
  : version !== golden.browser || process.platform !== golden.platform
    ? `golden rendered on ${golden.browser} (${golden.platform}); this is ${version} (${process.platform}). After checking the PDFs by eye: node scripts/golden.mjs --update`
    : false;

test("compare: HTML always, DOM only on the recording's browser and platform", () => {
  const f = { html: "h", trope: "t", dom: "d", tropeDom: "td" };
  const want = { browser: "HeadlessChrome/155.0.0.0", platform: "win32", fixtures: { "week-min": f, "week-notes": f } };
  assert.deepEqual(compare(want, structuredClone(want)), []);
  assert.deepEqual(compare(want, { ...want, fixtures: { ...want.fixtures, "week-min": { ...f, dom: "other" } } }), ["week-min dom"]);
  assert.deepEqual(compare(want, { ...want, browser: "HeadlessChrome/156.0.0.0", fixtures: { ...want.fixtures, "week-min": { ...f, dom: "other" } } }), []);
  assert.deepEqual(compare(want, { ...want, platform: "linux", fixtures: { ...want.fixtures, "week-notes": { ...f, html: "x" } } }), ["week-notes html"]);
});

for (const name of FIXTURES) {
  test(`print golden: ${name} builds the recorded sheet.html and sheet-trope.html`, async () => {
    const iso = await isolatedEnv();
    try {
      const built = await buildFixture(join(FIX, name), { env: iso.env });
      assert.equal(sha256(foldEol(built.sheet)), golden.fixtures[name].html, `${name}/sheet.html is not what it was`);
      assert.equal(sha256(foldEol(built.trope)), golden.fixtures[name].trope, `${name}/sheet-trope.html is not what it was`);
    } finally { await iso.cleanup(); }
  });

  test(`print golden: ${name} renders the recorded pages`, { skip: domSkip, timeout: 300_000 }, async () => {
    const iso = await isolatedEnv();
    try {
      await buildFixture(join(FIX, name), { env: iso.env });
      assert.equal(await domHash(browser, join(FIX, name, "sheet.html")), golden.fixtures[name].dom, `${name}: the rendered sheet changed`);
      assert.equal(await domHash(browser, join(FIX, name, "sheet-trope.html")), golden.fixtures[name].tropeDom, `${name}: the rendered chanter's copy changed`);
    } finally { await iso.cleanup(); }
  });
}
