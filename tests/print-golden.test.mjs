// The print golden: the two fixtures must build and render exactly what was recorded at the start of
// 2.0, and the files the sheet links by path (template CSS, render.js, the fonts, lib.js's existing
// functions) must be what they were. A failure here means the printed sheet changed. If that was
// deliberate (Wave 4 only), look at the PDFs, then re-record with: node scripts/golden.mjs --update
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { migrate3 } from "../scripts/migrate.mjs";
import { isolatedEnv } from "./helpers/isolatedEnv.mjs";
import { findBrowser } from "../scripts/build.mjs";
import { browserVersion, sha256, dumpDom, printSignature } from "../scripts/chrome.mjs";
import { FIXTURES, readGolden, buildFixture, domHash, foldEol, compare, compareSources, sourceHashes } from "../scripts/golden.mjs";

const FIX = fileURLToPath(new URL("./fixtures/", import.meta.url));
const golden = await readGolden();
const browser = findBrowser();
let version = null;
if (browser) {
  const iso = await isolatedEnv();
  try { version = await browserVersion(browser, { env: iso.env }); } finally { await iso.cleanup(); }
}
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

test("compareSources: every recorded file and lib export must hold; a new lib export is allowed, a new file is not", () => {
  const want = { files: { "template/sheet.css": "a", "template/fonts/X.ttf": "b" }, lib: { divineName: "1", stripMarks: "2" } };
  assert.deepEqual(compareSources(want, structuredClone(want)), []);
  assert.deepEqual(compareSources(want, { files: want.files, lib: { ...want.lib, newHelper: "3" } }), []);
  assert.deepEqual(compareSources(want, { files: want.files, lib: { divineName: "changed" } }), ["lib.js divineName changed", "lib.js stripMarks missing"]);
  assert.deepEqual(compareSources(want, { files: { "template/sheet.css": "z", "template/fonts/Y.ttf": "c" }, lib: want.lib }),
    ["template/sheet.css changed", "template/fonts/X.ttf missing", "template/fonts/Y.ttf added"]);
  assert.deepEqual(compare({ browser: null, platform: "win32", fixtures: {}, sources: want }, { browser: null, platform: "win32", fixtures: {}, sources: { files: want.files, lib: {} } }),
    ["lib.js divineName missing", "lib.js stripMarks missing"]);
});

test("print golden: the template files, fonts and lib.js exports the sheet links are as recorded (no browser needed)", async () => {
  assert.ok(golden.sources, "tests/golden/print.json has no sources layer");
  assert.ok(Object.keys(golden.sources.lib).length > 0 && Object.keys(golden.sources.files).some(p => p.startsWith("template/fonts/")));
  assert.deepEqual(compareSources(golden.sources, await sourceHashes()), []);
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
      assert.equal(await domHash(browser, join(FIX, name, "sheet.html"), { env: iso.env }), golden.fixtures[name].dom, `${name}: the rendered sheet changed`);
      assert.equal(await domHash(browser, join(FIX, name, "sheet-trope.html"), { env: iso.env }), golden.fixtures[name].tropeDom, `${name}: the rendered chanter's copy changed`);
    } finally { await iso.cleanup(); }
  });
}

// ---- a schema-3 week prints the same page ----

// The embedded week data in a built sheet.html, and the page with it cut out.
function splitData(html) {
  const m = /window\.SHEET = (.*);\r?\nwindow\.SHEET_OPTIONS/.exec(html);
  assert.ok(m, "sheet.html carries window.SHEET");
  return { data: JSON.parse(m[1]), rest: html.slice(0, m.index) + html.slice(m.index + m[0].length) };
}
// A fixture migrated to schema 3, at the same folder depth, so every relative path in sheet.html is the same.
async function writeSchema3(name) {
  const dir = join(FIX, `_s3-${name}`);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "sheet.json"), JSON.stringify(migrate3(JSON.parse(await readFile(join(FIX, name, "sheet.json"), "utf8"))), null, 2));
  return dir;
}
after(async () => { for (const name of FIXTURES) await rm(join(FIX, `_s3-${name}`), { recursive: true, force: true }); });

for (const name of FIXTURES) {
  test(`print golden: ${name} migrated to schema 3 builds the same page around the same data`, async () => {
    const iso = await isolatedEnv();
    try {
      const s3 = await writeSchema3(name);
      const a = await buildFixture(join(FIX, name), { env: iso.env });
      const b = await buildFixture(s3, { env: iso.env });
      for (const k of ["sheet", "trope"]) {
        const x = splitData(foldEol(a[k])), y = splitData(foldEol(b[k]));
        assert.equal(y.rest, x.rest, `${name} ${k}: only the embedded data may differ`);
        assert.deepEqual(y.data, x.data, `${name} ${k}: the schema-3 build embeds the schema-2 view`);
      }
    } finally { await iso.cleanup(); }
  });

  test(`print golden: ${name} migrated to schema 3 renders the same pages`, { skip: browser ? false : "no Chrome or Edge on this machine", timeout: 300_000 }, async () => {
    const iso = await isolatedEnv();
    try {
      const s3 = await writeSchema3(name);
      await buildFixture(join(FIX, name), { env: iso.env });
      await buildFixture(s3, { env: iso.env });
      for (const f of ["sheet.html", "sheet-trope.html"]) {
        const x = printSignature(await dumpDom(browser, pathToFileURL(join(FIX, name, f)).href, { env: iso.env }));
        const y = printSignature(await dumpDom(browser, pathToFileURL(join(s3, f)).href, { env: iso.env }));
        assert.equal(y, x, `${name}/${f}: schema 3 renders differently`);
      }
    } finally { await iso.cleanup(); }
  });
}
