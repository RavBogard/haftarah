#!/usr/bin/env node
/**
 * golden.mjs — the print golden: what each test fixture prints, recorded, so that a change to the
 * build, the template, render.js, lib.js or the fonts does not reach a printed sheet unnoticed.
 *
 *   node scripts/golden.mjs            # compare with tests/golden/print.json (npm test does this too)
 *   node scripts/golden.mjs --update   # re-record, after a deliberate print change and a look at the PDFs
 *
 * Three layers. Line endings are folded to \n wherever text is hashed, because a Windows checkout
 * carries CRLF.
 * - "sources" (Node only, always checked): sheet.html links sheet.css, trope.css, render.js, lib.js
 *   and the fonts by path, so the built HTML never contains their bytes. "sources.files" is the
 *   sha256 of each of template/sheet.html, sheet.css, trope.css, render.js and every file under
 *   template/fonts; a changed, missing or added file fails. "sources.lib" is, for each export of
 *   template/lib.js, the sha256 of its source text (Function#toString, or JSON for a value). A
 *   changed or missing export fails; a new export is allowed, because later tasks add functions to
 *   lib.js. This does not see a module-level constant that a function reads through its closure
 *   (lib.js's TETRA regex, for one): such a change shows only in "dom", or in "html" when the build
 *   uses it.
 * - "html"/"trope" per fixture (Node only, always checked): sha256 of sheet.html and
 *   sheet-trope.html as build.mjs writes them (--no-pdf --trope).
 * - "dom"/"tropeDom" per fixture: sha256 of what Chrome renders from them (the <html> tag render.js
 *   stamps and the whole <main id="sheet">). Checked only on the browser version and platform they
 *   were recorded on, since a Chrome update may move a pixel.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { join, resolve, dirname, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { findBrowser } from "./build.mjs";
import { createHash } from "node:crypto";
import { dumpDom, browserVersion, printSignature, sha256 } from "./chrome.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const run = promisify(execFile);
export const GOLDEN_FILE = join(ROOT, "tests", "golden", "print.json");
export const FIXTURES = ["week-min", "week-notes"];
export const DOM_KEYS = ["dom", "tropeDom"];
const rel = p => relative(ROOT, p).split("\\").join("/");

export const foldEol = s => String(s).replace(/\r\n/g, "\n");

/** Build one week folder's sheet.html and sheet-trope.html (no PDF); returns their text. */
export async function buildFixture(dir, { env } = {}) {
  await run(process.execPath, [join(ROOT, "scripts", "build.mjs"), dir, "--no-pdf", "--trope"], { env, cwd: ROOT, maxBuffer: 1 << 24 });
  return { sheet: await readFile(join(dir, "sheet.html"), "utf8"), trope: await readFile(join(dir, "sheet-trope.html"), "utf8") };
}

/** sha256 of what prints from one built HTML file. `env` is Chrome's environment. */
export async function domHash(browser, file, { env } = {}) {
  return sha256(printSignature(await dumpDom(browser, pathToFileURL(file).href, env ? { env } : {})));
}

const TEMPLATE_FILES = ["sheet.html", "sheet.css", "trope.css", "render.js"];
const TEXT_FILE = /\.(html|css|js|json|txt)$/i;

/** The sources layer, as of now: { files: { path: hash }, lib: { export: hash } }. */
export async function sourceHashes() {
  const tpl = join(ROOT, "template");
  const walk = async dir => (await Promise.all((await readdir(dir, { withFileTypes: true }))
    .map(e => e.isDirectory() ? walk(join(dir, e.name)) : e.isFile() ? [join(dir, e.name)] : []))).flat();
  const fonts = await walk(join(tpl, "fonts"));
  const files = {};
  for (const p of [...TEMPLATE_FILES.map(f => join(tpl, f)), ...fonts].sort((a, b) => rel(a) < rel(b) ? -1 : 1)) {
    const bytes = await readFile(p);
    files[rel(p)] = TEXT_FILE.test(p) ? sha256(foldEol(bytes.toString("utf8"))) : createHash("sha256").update(bytes).digest("hex");
  }
  const lib = createRequire(import.meta.url)("../template/lib.js");
  const text = v => typeof v === "function" ? v.toString()
    : JSON.stringify(v, (k, x) => typeof x === "function" || x instanceof RegExp ? String(x) : x);
  const out = { files, lib: {} };
  for (const name of Object.keys(lib).sort()) out.lib[name] = sha256(foldEol(text(lib[name])));
  return out;
}

/** What `got` breaks of the recorded sources: every file must hold and no file may appear; lib exports may be added, not changed or removed. */
export function compareSources(want, got) {
  const diffs = [];
  for (const [p, h] of Object.entries(want.files)) if (got.files[p] !== h) diffs.push(`${p} ${p in got.files ? "changed" : "missing"}`);
  for (const p of Object.keys(got.files)) if (!(p in want.files)) diffs.push(`${p} added`);
  for (const [n, h] of Object.entries(want.lib)) if (got.lib[n] !== h) diffs.push(`lib.js ${n} ${n in got.lib ? "changed" : "missing"}`);
  return diffs;
}

export async function readGolden() {
  try { return JSON.parse(await readFile(GOLDEN_FILE, "utf8")); }
  catch { throw new Error(`${rel(GOLDEN_FILE)} is missing or unreadable; record it with node scripts/golden.mjs --update`); }
}

/** Build and render every fixture now. */
export async function record({ env, browser = findBrowser() } = {}) {
  const chrome = env ? { env } : {};
  const out = { browser: browser ? await browserVersion(browser, chrome) : null, platform: process.platform, sources: await sourceHashes(), fixtures: {} };
  for (const name of FIXTURES) {
    const dir = join(ROOT, "tests", "fixtures", name);
    const built = await buildFixture(dir, { env });
    const f = { html: sha256(foldEol(built.sheet)), trope: sha256(foldEol(built.trope)) };
    if (browser) { f.dom = await domHash(browser, join(dir, "sheet.html"), chrome); f.tropeDom = await domHash(browser, join(dir, "sheet-trope.html"), chrome); }
    out.fixtures[name] = f;
  }
  return out;
}

/** The recorded values `got` does not reproduce: the sources (when recorded), then "fixture key"; the DOM keys only on the same browser and platform. */
export function compare(want, got) {
  const sameBrowser = !!want.browser && want.browser === got.browser && want.platform === got.platform;
  const diffs = want.sources ? compareSources(want.sources, got.sources || { files: {}, lib: {} }) : [];
  for (const name of FIXTURES) for (const k of ["html", "trope", ...(sameBrowser ? DOM_KEYS : [])]) {
    if ((want.fixtures[name] || {})[k] !== (got.fixtures[name] || {})[k]) diffs.push(`${name} ${k}`);
  }
  return diffs;
}

async function main() {
  const got = await record();
  if (process.argv.includes("--update")) {
    await mkdir(dirname(GOLDEN_FILE), { recursive: true });
    await writeFile(GOLDEN_FILE, JSON.stringify(got, null, 2) + "\n", "utf8");
    console.log(`Recorded ${FIXTURES.length} fixtures to ${rel(GOLDEN_FILE)}${got.browser ? ` (rendered with ${got.browser} on ${got.platform})` : " (HTML only: no Chrome or Edge found)"}`);
    return;
  }
  const want = await readGolden();
  const diffs = compare(want, got);
  if (diffs.length) { console.error(`Print golden differs: ${diffs.join(", ")}`); process.exit(1); }
  const same = want.browser === got.browser && want.platform === got.platform;
  console.log(`Print golden holds${same ? "" : ` (HTML only: recorded on ${want.browser}/${want.platform}, this is ${got.browser}/${got.platform})`}.`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch(err => { console.error(`golden: ${err.message}`); process.exit(1); });
}
