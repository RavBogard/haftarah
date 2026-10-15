#!/usr/bin/env node
/**
 * golden.mjs — the print golden: what each test fixture prints, recorded, so that a change to the
 * build, the template, render.js, lib.js or the fonts cannot reach a printed sheet unnoticed.
 *
 *   node scripts/golden.mjs            # compare with tests/golden/print.json (npm test does this too)
 *   node scripts/golden.mjs --update   # re-record, after a deliberate print change and a look at the PDFs
 *
 * Two layers per fixture. "html"/"trope": sha256 of sheet.html and sheet-trope.html as build.mjs
 * writes them (--no-pdf --trope), line endings folded to \n because a Windows checkout carries CRLF;
 * Node only, always checked. "dom"/"tropeDom": sha256 of what Chrome renders from them (the <html>
 * tag render.js stamps and the whole <main id="sheet">), checked only on the browser version and
 * platform it was recorded on, since a Chrome update may move a pixel.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, resolve, dirname, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { findBrowser } from "./build.mjs";
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

/** sha256 of what prints from one built HTML file. */
export async function domHash(browser, file) {
  return sha256(printSignature(await dumpDom(browser, pathToFileURL(file).href)));
}

export async function readGolden() {
  try { return JSON.parse(await readFile(GOLDEN_FILE, "utf8")); }
  catch { throw new Error(`${rel(GOLDEN_FILE)} is missing or unreadable; record it with node scripts/golden.mjs --update`); }
}

/** Build and render every fixture now. */
export async function record({ env, browser = findBrowser() } = {}) {
  const out = { browser: browser ? await browserVersion(browser) : null, platform: process.platform, fixtures: {} };
  for (const name of FIXTURES) {
    const dir = join(ROOT, "tests", "fixtures", name);
    const built = await buildFixture(dir, { env });
    const f = { html: sha256(foldEol(built.sheet)), trope: sha256(foldEol(built.trope)) };
    if (browser) { f.dom = await domHash(browser, join(dir, "sheet.html")); f.tropeDom = await domHash(browser, join(dir, "sheet-trope.html")); }
    out.fixtures[name] = f;
  }
  return out;
}

/** The recorded values `got` does not reproduce, as "fixture key"; the DOM keys only on the same browser and platform. */
export function compare(want, got) {
  const sameBrowser = !!want.browser && want.browser === got.browser && want.platform === got.platform;
  const diffs = [];
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
