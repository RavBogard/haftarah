// The print golden: the two fixtures must build and render exactly what was recorded at the start of
// 2.0, and the files the sheet links by path (template CSS, render.js, the fonts, lib.js's existing
// functions) must be what they were. A failure here means the printed sheet changed. Re-record only the
// layer that moved, after looking at the PDFs: node scripts/golden.mjs --update-dom (a Chrome update),
// --update-sources (a deliberate template or lib.js change) or --add <fixture> (a new fixture). Plain
// --update re-records everything and is never run in a wave.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { migrate3 } from "../scripts/migrate.mjs";
import { isolatedEnv } from "./helpers/isolatedEnv.mjs";
import { findBrowser } from "../scripts/build.mjs";
import { browserVersion, sha256, dumpDom, printSignature } from "../scripts/chrome.mjs";
import { FIXTURES, SCHEMA2_FIXTURES, readGolden, buildFixture, domHash, foldEol, compare, compareSources, sourceHashes, libInternals, planUpdate } from "../scripts/golden.mjs";

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
    ? `golden rendered on ${golden.browser} (${golden.platform}); this is ${version} (${process.platform}). After checking the PDFs by eye: node scripts/golden.mjs --update-dom`
    : false;

test("compare: HTML always, DOM only on the recording's browser and platform", () => {
  const f = { html: "h", trope: "t", dom: "d", tropeDom: "td" };
  const want = { browser: "HeadlessChrome/155.0.0.0", platform: "win32", fixtures: { "week-min": f, "week-notes": f } };
  assert.deepEqual(compare(want, structuredClone(want)), []);
  assert.deepEqual(compare(want, { ...want, fixtures: { ...want.fixtures, "week-min": { ...f, dom: "other" } } }), ["week-min dom"]);
  assert.deepEqual(compare(want, { ...want, browser: "HeadlessChrome/156.0.0.0", fixtures: { ...want.fixtures, "week-min": { ...f, dom: "other" } } }), []);
  assert.deepEqual(compare(want, { ...want, platform: "linux", fixtures: { ...want.fixtures, "week-notes": { ...f, html: "x" } } }), ["week-notes html"]);
});

test("compare: a fixture the check requires that has no recorded block is reported, not skipped", () => {
  const copy = structuredClone(golden);
  delete copy.fixtures["week-notes"];
  assert.deepEqual(compare(copy, golden, { required: FIXTURES }), ["week-notes not recorded"]);
  assert.deepEqual(compare(golden, golden, { required: FIXTURES }), []);
  assert.deepEqual(compare(copy, golden), [], "without required, only recorded blocks are compared");
});

test("libInternals collects async functions and never a declaration inside a block comment", () => {
  const src = [
    "(function () {",
    "  const A = 1;",
    "  async function load(x) {",
    "    return x;",
    "  }",
    "  /* const OLD = 2;",
    "  function retired() {} */",
    "  const B = 3;",
    "  return { A };",
    "});",
  ].join("\n");
  assert.deepEqual(Object.keys(libInternals(src, new Set(["A"]))).sort(), ["B", "load"]);
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
      assert.equal(built.torah == null ? undefined : sha256(foldEol(built.torah)), golden.fixtures[name].torah, `${name}/sheet-torah.html is not what it was`);
    } finally { await iso.cleanup(); }
  });

  test(`print golden: ${name} renders the recorded pages`, { skip: domSkip, timeout: 300_000 }, async () => {
    const iso = await isolatedEnv();
    try {
      await buildFixture(join(FIX, name), { env: iso.env });
      assert.equal(await domHash(browser, join(FIX, name, "sheet.html"), { env: iso.env }), golden.fixtures[name].dom, `${name}: the rendered sheet changed`);
      assert.equal(await domHash(browser, join(FIX, name, "sheet-trope.html"), { env: iso.env }), golden.fixtures[name].tropeDom, `${name}: the rendered chanter's copy changed`);
      if (golden.fixtures[name].torahDom) assert.equal(await domHash(browser, join(FIX, name, "sheet-torah.html"), { env: iso.env }), golden.fixtures[name].torahDom, `${name}: the rendered Torah sheet changed`);
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
after(async () => { for (const name of SCHEMA2_FIXTURES) await rm(join(FIX, `_s3-${name}`), { recursive: true, force: true }); });

for (const name of SCHEMA2_FIXTURES) {
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

test("libInternals hashes lib.js's module-level helpers that are not exported, ignoring comments and blank lines", () => {
  const src = [
    "(function () {",
    '  "use strict";',
    "  const TETRA = /x/g;",
    "  // a comment",
    "  const HE_WORD = /[a-z]+/g;",
    "",
    "  function exported(a) {",
    "    const inner = 1;",
    "    return a + inner;",
    "  }",
    "  const helper = s => s.trim();",
    "  return { TETRA, exported };",
    "});",
  ].join("\n");
  const ex = new Set(["TETRA", "exported"]);
  const a = libInternals(src, ex);
  assert.deepEqual(Object.keys(a).sort(), ["HE_WORD", "helper"]);
  assert.deepEqual(libInternals(src.replace("  // a comment", "  // another comment\n\n  // and one more"), ex), a);
  const changed = libInternals(src.replace("/[a-z]+/g", "/[a-z]*/g"), ex);
  assert.notEqual(changed.HE_WORD, a.HE_WORD);
  assert.equal(changed.helper, a.helper);
});

test("compareSources: a module-level helper of lib.js must hold too; a new one is allowed", () => {
  const want = { files: {}, lib: {}, libInternal: { HE_WORD: "1" } };
  assert.deepEqual(compareSources(want, { files: {}, lib: {}, libInternal: { HE_WORD: "1", fresh: "2" } }), []);
  assert.deepEqual(compareSources(want, { files: {}, lib: {}, libInternal: { HE_WORD: "2" } }), ["lib.js internal HE_WORD changed"]);
  assert.deepEqual(compareSources(want, { files: {}, lib: {}, libInternal: {} }), ["lib.js internal HE_WORD missing"]);
  assert.deepEqual(compareSources({ files: {}, lib: {} }, { files: {}, lib: {}, libInternal: { HE_WORD: "9" } }), [], "a golden recorded before the layer existed checks nothing there");
});

test("the recorded golden guards lib.js's internals (TETRA's neighbours: HE_WORD, BLOCK_ENDING, tropeTokens ...)", () => {
  assert.ok(golden.sources.libInternal, "tests/golden/print.json has no sources.libInternal; record it with node scripts/golden.mjs --update-sources");
  for (const n of ["HE_WORD", "consonantKey", "ENTITIES", "READING_OWN", "BLOCK_ENDING", "tropeTokens"]) assert.ok(n in golden.sources.libInternal, n);
});

const F = { html: "h", trope: "t", dom: "d", tropeDom: "td" };
const SRC = { files: { "template/sheet.css": "1" }, lib: { divineName: "1" }, libInternal: { HE_WORD: "1" } };
const WANT = { browser: "HeadlessChrome/155.0.0.0", platform: "win32", sources: SRC, fixtures: { "week-min": F } };

test("planUpdate dom: takes only what a browser update moved, and refuses while HTML or sources moved", () => {
  const got = { browser: "HeadlessChrome/156.0.0.0", platform: "win32", sources: SRC, fixtures: { "week-min": { ...F, dom: "d2", tropeDom: "td2" } } };
  assert.deepEqual(planUpdate("dom", WANT, got), { ...WANT, browser: "HeadlessChrome/156.0.0.0", fixtures: { "week-min": { ...F, dom: "d2", tropeDom: "td2" } } });
  assert.throws(() => planUpdate("dom", WANT, { ...got, fixtures: { "week-min": { ...F, html: "h2" } } }), /--update-dom refused: week-min html changed/);
  assert.throws(() => planUpdate("dom", WANT, { ...got, sources: { ...SRC, files: { "template/sheet.css": "2" } } }), /--update-dom refused: template\/sheet\.css changed/);
  assert.throws(() => planUpdate("dom", WANT, { ...got, browser: null }), /needs Chrome or Edge/);
});

test("planUpdate sources: takes the new sources only while every recorded fixture holds", () => {
  const got = { ...WANT, sources: { ...SRC, files: { "template/sheet.css": "2" } } };
  assert.deepEqual(planUpdate("sources", WANT, got), { ...WANT, sources: got.sources });
  assert.throws(() => planUpdate("sources", WANT, { ...got, fixtures: { "week-min": { ...F, dom: "moved" } } }), /--update-sources refused: week-min dom moved/);
  // on another browser the DOM is not compared, so only the HTML can refuse
  assert.deepEqual(planUpdate("sources", WANT, { ...got, browser: "HeadlessChrome/156.0.0.0", fixtures: { "week-min": { ...F, dom: "other" } } }).fixtures, WANT.fixtures);
});

test("planUpdate add: records one new fixture, never a recorded one, and only on the golden's browser", () => {
  const got = { ...WANT, fixtures: { "week-min": F, "week-notes": { html: "nh", trope: "nt", dom: "nd", tropeDom: "ntd" } } };
  assert.deepEqual(planUpdate("add", WANT, got, "week-notes").fixtures, got.fixtures);
  assert.throws(() => planUpdate("add", WANT, got, "week-min"), /already recorded/);
  assert.throws(() => planUpdate("add", WANT, got, "week-nothing"), /--add takes one of/);
  assert.throws(() => planUpdate("add", WANT, { ...got, fixtures: { ...got.fixtures, "week-min": { ...F, html: "x" } } }, "week-notes"), /--add refused: week-min html/);
  assert.throws(() => planUpdate("add", WANT, { ...got, browser: "HeadlessChrome/156.0.0.0" }, "week-notes"), /run --update-dom first/);
  assert.throws(() => planUpdate("add", WANT, { ...got, browser: null }, "week-notes"), /needs the browser the golden was rendered on/);
});

// spec 5.4: the haftarah PDF of a week is identical whether or not the week also has a Torah reading.
test("print golden: a week's haftarah builds the same sheet.html and chanter's copy with or without a Torah reading", async () => {
  const iso = await isolatedEnv();
  try {
    const alone = await buildFixture(await writeSchema3("week-min"), { env: iso.env });
    const withTorah = await buildFixture(join(FIX, "week-torah"), { env: iso.env });
    assert.equal(foldEol(withTorah.sheet), foldEol(alone.sheet));
    assert.equal(foldEol(withTorah.trope), foldEol(alone.trope));
    assert.ok(withTorah.torah && /"reading":"torah"/.test(withTorah.torah), "the Torah sheet carries the Torah option");
    assert.equal(alone.torah, null);
  } finally { await iso.cleanup(); }
});

test("print golden: the Torah sheet's front page says Torah and its last verse ends on sof pasuk", { skip: browser ? false : "no Chrome or Edge on this machine", timeout: 300_000 }, async () => {
  const iso = await isolatedEnv();
  try {
    await buildFixture(join(FIX, "week-torah"), { env: iso.env });
    const dom = await dumpDom(browser, pathToFileURL(join(FIX, "week-torah", "sheet-torah.html")).href, { env: iso.env });
    assert.match(dom, /<span class="range">Torah · 29 Tishrei 5787<\/span>/);
    assert.ok(!/tr-sof-haftarah/.test(dom.split('<div id="stage"')[0]), "no haftarah cadence on a Torah sheet");
    const haft = await dumpDom(browser, pathToFileURL(join(FIX, "week-torah", "sheet.html")).href, { env: iso.env });
    assert.match(haft, /<span class="range">Haftarah · 29 Tishrei 5787<\/span>/);
  } finally { await iso.cleanup(); }
});
