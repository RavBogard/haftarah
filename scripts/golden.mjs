#!/usr/bin/env node
/**
 * golden.mjs — the print golden: what each test fixture prints, recorded, so that a change to the
 * build, the template, render.js, lib.js or the fonts does not reach a printed sheet unnoticed.
 *
 *   node scripts/golden.mjs            # compare with tests/golden/print.json (npm test does this too)
 *   node scripts/golden.mjs --update   # re-record, after a deliberate print change and a look at the PDFs
 *   node scripts/golden.mjs --update-dom       # after a Chrome update: re-record only the DOM layer (refuses if the HTML or sources moved)
 *   node scripts/golden.mjs --update-sources   # after a deliberate template or lib.js change: re-record only the sources (refuses if a fixture moved)
 *   node scripts/golden.mjs --add <fixture>    # record a new fixture (refuses if anything recorded moved)
 *
 * Three layers. Line endings are folded to \n wherever text is hashed, because a Windows checkout
 * carries CRLF.
 * - "sources" (Node only, always checked): sheet.html links sheet.css, trope.css, render.js, lib.js
 *   and the fonts by path, so the built HTML never contains their bytes. "sources.files" is the
 *   sha256 of each of template/sheet.html, sheet.css, trope.css, render.js and every file under
 *   template/fonts; a changed, missing or added file fails. "sources.lib" is, for each export of
 *   template/lib.js, the sha256 of its source text (Function#toString, or JSON for a value). A
 *   changed or missing export fails; a new export is allowed, because later tasks add functions to
 *   lib.js. "sources.libInternal" hashes each module-level helper or constant inside lib.js that is
 *   not exported (HE_WORD, BLOCK_ENDING, tropeTokens ...), so a change a function sees only through
 *   its closure fails too; a new one is allowed.
 * - "html"/"trope" per fixture (Node only, always checked): sha256 of sheet.html and
 *   sheet-trope.html as build.mjs writes them (--no-pdf --trope).
 * - "dom"/"tropeDom" per fixture: sha256 of what Chrome renders from them (the <html> tag render.js
 *   stamps and the whole <main id="sheet">). Checked only on the browser version and platform they
 *   were recorded on, since a Chrome update may move a pixel.
 * - "torah"/"torahDom" per fixture with a Torah reading (week-torah): the same for sheet-torah.html.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, writeFile, mkdir, readdir, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { join, resolve, dirname, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { findBrowser } from "./build.mjs";
import { createHash } from "node:crypto";
import { dumpDom, browserVersion, printSignature, sha256 } from "./chrome.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const run = promisify(execFile);
export const GOLDEN_FILE = join(ROOT, "tests", "golden", "print.json");
export const FIXTURES = ["week-min", "week-notes", "week-torah"];
/** The fixtures written in schema 2; the schema-3 checks migrate these. week-torah is schema 3 already. */
export const SCHEMA2_FIXTURES = ["week-min", "week-notes"];
export const DOM_KEYS = ["dom", "tropeDom", "torahDom"];
const rel = p => relative(ROOT, p).split("\\").join("/");

export const foldEol = s => String(s).replace(/\r\n/g, "\n");

/**
 * The module-level helpers and constants of lib.js that are not exported, each hashed: the factory's
 * top-level `const`/`let`/`function`/`async function` statements (two-space indent), each running to
 * the next one or to the closing `return {`. Block comments (`/* … *\/`) are removed first, so a
 * commented-out declaration is never collected; comment lines and blank lines are dropped too, so a
 * comment above a new function moves nothing. Exported names are left to the "lib" layer.
 */
export function libInternals(text, exported) {
  const src = foldEol(text).replace(/\/\*[\s\S]*?\*\//g, "");
  const end = src.lastIndexOf("\n  return {");
  const starts = [...src.matchAll(/^ {2}(?:async\s+function|const|let|var|function)\s+([A-Za-z_$][\w$]*)/gm)].filter(m => end < 0 || m.index < end);
  const out = {};
  starts.forEach((m, i) => {
    if (exported.has(m[1])) return;
    const stop = i + 1 < starts.length ? starts[i + 1].index : (end < 0 ? src.length : end);
    const body = src.slice(m.index, stop).split("\n").filter(l => !/^\s*(\/\/.*)?$/.test(l)).join("\n");
    out[m[1]] = sha256(body);
  });
  return out;
}

/** Build one week folder's sheet.html and sheet-trope.html, and sheet-torah.html when it has a Torah reading (no PDF); returns their text (torah: null without one). */
export async function buildFixture(dir, { env } = {}) {
  await rm(join(dir, "sheet-torah.html"), { force: true });
  await run(process.execPath, [join(ROOT, "scripts", "build.mjs"), dir, "--no-pdf", "--trope"], { env, cwd: ROOT, maxBuffer: 1 << 24 });
  return {
    sheet: await readFile(join(dir, "sheet.html"), "utf8"),
    trope: await readFile(join(dir, "sheet-trope.html"), "utf8"),
    torah: await readFile(join(dir, "sheet-torah.html"), "utf8").catch(() => null),
  };
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
  const out = { files, lib: {}, libInternal: {} };
  for (const name of Object.keys(lib).sort()) out.lib[name] = sha256(foldEol(text(lib[name])));
  const internal = libInternals(await readFile(join(tpl, "lib.js"), "utf8"), new Set(Object.keys(lib)));
  for (const name of Object.keys(internal).sort()) out.libInternal[name] = internal[name];
  return out;
}

/** What `got` breaks of the recorded sources: every file must hold and no file may appear; lib exports and lib internals may be added, not changed or removed. */
export function compareSources(want, got) {
  const diffs = [];
  for (const [p, h] of Object.entries(want.files)) if (got.files[p] !== h) diffs.push(`${p} ${p in got.files ? "changed" : "missing"}`);
  for (const p of Object.keys(got.files)) if (!(p in want.files)) diffs.push(`${p} added`);
  for (const [n, h] of Object.entries(want.lib)) if (got.lib[n] !== h) diffs.push(`lib.js ${n} ${n in got.lib ? "changed" : "missing"}`);
  for (const [n, h] of Object.entries(want.libInternal || {})) if ((got.libInternal || {})[n] !== h) diffs.push(`lib.js internal ${n} ${n in (got.libInternal || {}) ? "changed" : "missing"}`);
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
    if (built.torah != null) f.torah = sha256(foldEol(built.torah));
    if (browser) {
      f.dom = await domHash(browser, join(dir, "sheet.html"), chrome);
      f.tropeDom = await domHash(browser, join(dir, "sheet-trope.html"), chrome);
      if (built.torah != null) f.torahDom = await domHash(browser, join(dir, "sheet-torah.html"), chrome);
    }
    out.fixtures[name] = f;
  }
  return out;
}

/**
 * The recorded values `got` does not reproduce: the sources (when recorded), then "fixture key" for every
 * recorded fixture; the DOM keys only on the same browser and platform. Each fixture named in `required`
 * that has no recorded block is "<fixture> not recorded" (the check itself passes FIXTURES, so a deleted
 * block fails instead of being skipped).
 */
export function compare(want, got, { required = [] } = {}) {
  const sameBrowser = !!want.browser && want.browser === got.browser && want.platform === got.platform;
  const diffs = want.sources ? compareSources(want.sources, got.sources || { files: {}, lib: {} }) : [];
  for (const name of required) if (!(want.fixtures || {})[name]) diffs.push(`${name} not recorded`);
  for (const name of Object.keys(want.fixtures || {})) for (const k of ["html", "trope", "torah", ...(sameBrowser ? DOM_KEYS : [])]) {
    if ((want.fixtures[name] || {})[k] !== (got.fixtures[name] || {})[k]) diffs.push(`${name} ${k}`);
  }
  return diffs;
}

/**
 * What --update-dom, --update-sources and --add <fixture> write, from the recorded golden `want` and a
 * fresh recording `got`. Each refuses (throws) when it would hide a change it is not for:
 *   dom      only the DOM layer, after a browser update; the sources and every fixture's HTML must hold
 *   sources  only the sources layer (a deliberate template or lib.js change); every recorded fixture must hold
 *   add      one fixture not yet recorded; everything recorded must hold, on the golden's own browser
 */
export function planUpdate(mode, want, got, name = null) {
  if (mode === "dom") {
    if (!got.browser) throw new Error("--update-dom needs Chrome or Edge on this machine");
    const held = compare({ ...want, browser: null }, got);
    if (held.length) throw new Error(`--update-dom refused: ${held.join(", ")} changed; this step only re-records what a browser update moved`);
    const fixtures = {};
    for (const [n, f] of Object.entries(want.fixtures)) {
      fixtures[n] = { ...f };
      for (const k of DOM_KEYS) if (got.fixtures[n] && got.fixtures[n][k] !== undefined) fixtures[n][k] = got.fixtures[n][k];
    }
    return { ...want, browser: got.browser, platform: got.platform, fixtures };
  }
  if (mode === "sources") {
    const held = compare({ ...want, sources: undefined }, got);
    if (held.length) throw new Error(`--update-sources refused: ${held.join(", ")} moved; a source change may not move a recorded fixture`);
    return { ...want, sources: got.sources };
  }
  if (mode === "add") {
    if (!FIXTURES.includes(name)) throw new Error(`--add takes one of ${FIXTURES.join(", ")}`);
    if (want.fixtures[name]) throw new Error(`--add: ${name} is already recorded; recorded fixtures are compared, never re-recorded`);
    if (want.browser && !got.browser) throw new Error(`--add needs the browser the golden was rendered on (${want.browser})`);
    if (want.browser && (want.browser !== got.browser || want.platform !== got.platform)) throw new Error(`--add: the golden was rendered on ${want.browser} (${want.platform}) and this is ${got.browser} (${got.platform}); run --update-dom first`);
    const held = compare(want, got);
    if (held.length) throw new Error(`--add refused: ${held.join(", ")} moved`);
    const f = { ...got.fixtures[name] };
    if (!want.browser) for (const k of DOM_KEYS) delete f[k];
    return { ...want, fixtures: { ...want.fixtures, [name]: f } };
  }
  throw new Error(`unknown golden update "${mode}"`);
}

async function main() {
  const args = process.argv.slice(2);
  const mode = args.includes("--update") ? "all" : args.includes("--update-dom") ? "dom" : args.includes("--update-sources") ? "sources" : args.includes("--add") ? "add" : null;
  const got = await record();
  if (mode === "all") {
    await mkdir(dirname(GOLDEN_FILE), { recursive: true });
    await writeFile(GOLDEN_FILE, JSON.stringify(got, null, 2) + "\n", "utf8");
    console.log(`Recorded ${FIXTURES.length} fixtures to ${rel(GOLDEN_FILE)}${got.browser ? ` (rendered with ${got.browser} on ${got.platform})` : " (HTML only: no Chrome or Edge found)"}`);
    return;
  }
  const want = await readGolden();
  if (mode) {
    const name = mode === "add" ? args[args.indexOf("--add") + 1] : null;
    const out = planUpdate(mode, want, got, name);
    await writeFile(GOLDEN_FILE, JSON.stringify(out, null, 2) + "\n", "utf8");
    console.log(`Recorded ${mode === "add" ? `the ${name} fixture` : mode === "dom" ? `the DOM layer (${got.browser} on ${got.platform})` : "the sources layer"} in ${rel(GOLDEN_FILE)}`);
    return;
  }
  const diffs = compare(want, got, { required: FIXTURES });
  if (diffs.length) { console.error(`Print golden differs: ${diffs.join(", ")}`); process.exit(1); }
  const same = want.browser === got.browser && want.platform === got.platform;
  console.log(`Print golden holds${same ? "" : ` (HTML only: recorded on ${want.browser}/${want.platform}, this is ${got.browser}/${got.platform})`}.`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch(err => { console.error(`golden: ${err.message}`); process.exit(1); });
}
