#!/usr/bin/env node
/**
 * check.mjs — render a week twice with the pinned browser and assert the layout invariants the
 * design review asked for. Reads the data-* attributes render.js writes on <html> and each .page.
 *
 *   node scripts/check.mjs weeks/<slug> [--draft]
 */
import { readFile, mkdir, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { findBrowser, chromeFlags } from "./build.mjs";

// A split needs two lines on each side, so a two-line verse that does not fit leaves a band of up
// to about an inch; the paginator splits anything taller. Checked ceiling: 100px (1.04in).
const GAP_CEILING = 100;
const TETRA = /י[֑-ׇ]*ה[֑-ׇ]*ו[֑-ׇ]*ה[֑-ׇ]*/g;

function dumpDom(browser, url) {
  return new Promise(async (res, rej) => {
    const profile = join(tmpdir(), `haftarah-check-${process.pid}-${Math.random().toString(36).slice(2)}`);
    await mkdir(profile, { recursive: true });
    const child = spawn(browser, [...chromeFlags(profile), "--dump-dom", url], { stdio: ["ignore", "pipe", "pipe"] });
    let out = "", err = "";
    child.stdout.on("data", d => (out += d));
    child.stderr.on("data", d => (err += d));
    child.on("error", rej);
    child.on("close", async code => {
      await rm(profile, { recursive: true, force: true }).catch(() => {});
      code === 0 ? res(out) : rej(new Error(`dump-dom exited ${code}\n${err.slice(-500)}`));
    });
  });
}

const attr = (tag, name) => { const m = tag.match(new RegExp(`\\sdata-${name}="([^"]*)"`)); return m ? m[1] : null; };

export function letterFor(i) { let n = i + 1, s = ""; while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(97 + r) + s; n = Math.floor((n - 1) / 26); } return s; }

export function analyse(dom) {
  const rootTag = (dom.match(/<html[^>]*>/) || [""])[0];
  const pages = [...dom.matchAll(/<section class="page[^"]*"[^>]*>/g)].map(m => m[0]);
  const summary = {
    pages: Number(attr(rootTag, "pages")),
    yy: Number(attr(rootTag, "yy")),
    keys: (attr(rootTag, "keys") || "").split(",").filter(Boolean),
    emptySections: Number(attr(rootTag, "empty-sections") || 0),
    voicesMissing: (attr(rootTag, "voices-missing") || "").split("|").filter(Boolean),
    page: pages.map(t => ({
      kind: attr(t, "kind"), rows: Number(attr(t, "rows") || 0), gap: Number(attr(t, "gap") || -1),
      fill: Number(attr(t, "fill") || 0), split: attr(t, "split") || "", cont: Number(attr(t, "cont") || 0),
      offpage: Number(attr(t, "offpage") || 0), overflow: attr(t, "overflow") === "true", incipit: attr(t, "incipit"), voices: attr(t, "voices"),
    })),
    brInEnglish: (dom.match(/<div class="en[^"]*">[\s\S]*?<div class="gut"/g) || []).filter(s => /<br/i.test(s)).length,
    // The keys of the margin notes actually printed on the pages (the measuring stage is not a page).
    noteKeys: dom.split(/<section class="page/).slice(1).flatMap(pg => [...pg.matchAll(/<p class="note[^"]*"[^>]*>\s*<span class="k">([a-z]+)<\/span>/g)].map(m => m[1])),
  };
  const problems = [];
  const textPages = summary.page.filter(p => p.kind === "text");
  // The last page that holds a verse; pages after it carry only margin notes and the end matter.
  const lastText = [...textPages].reverse().find(p => p.rows > 0) || textPages[textPages.length - 1];
  summary.page.forEach((p, i) => {
    const n = i + 1;
    if (p.overflow) problems.push(`page ${n}: content overflows the page`);
    if (p.kind === "text" && p !== lastText && p.gap > GAP_CEILING) problems.push(`page ${n}: ${p.gap}px gap above the apparatus (max ${GAP_CEILING})`);
    if (p.kind === "text" && p !== lastText && p.rows === 1 && !p.split) problems.push(`page ${n}: a single verse on a page`);
    if (p.kind !== "front" && p.fill < 15) problems.push(`page ${n}: only ${p.fill}% full`);
    if (p.cont > 0) problems.push(`page ${n}: ${p.cont} entries labelled (cont.)`);
    if (p.split === "tail" && i > 0 && !/head|both/.test(summary.page[i - 1].split)) problems.push(`page ${n}: a split tail with no head on page ${n - 1}`);
  });
  if (summary.emptySections) problems.push(`${summary.emptySections} end-matter heading(s) with no items`);
  if (summary.brInEnglish) problems.push(`${summary.brInEnglish} English cell(s) still contain <br>`);
  const seq = summary.keys;
  const expect = seq.map((_, i) => letterFor(i));
  if (seq.join() !== expect.join()) problems.push(`key series is ${seq.join("")} not ${expect.join("")}`);
  if (new Set(seq).size !== seq.length) problems.push("duplicate margin keys");
  // Every key assigned in the English must answer to one printed margin note, and only one.
  const printed = summary.noteKeys;
  const missing = seq.filter(k => !printed.includes(k));
  if (missing.length) problems.push(`margin notes assigned but not printed: ${missing.join(", ")}`);
  const twice = [...new Set(printed.filter((k, i) => printed.indexOf(k) !== i))];
  if (twice.length) problems.push(`margin note printed twice: ${twice.join(", ")}`);
  if (summary.page[0]?.kind !== "front") problems.push("page 1 is not the front page");
  if (summary.page[1] && summary.page[1].kind !== "text") problems.push("the text does not start on page 2");
  return { summary, problems };
}

async function main() {
  const dirArg = process.argv.slice(2).find(a => !a.startsWith("--"));
  if (!dirArg) { console.error("usage: node scripts/check.mjs weeks/<slug> [--draft]"); process.exit(1); }
  const DRAFT = process.argv.includes("--draft");
  const weekDir = resolve(dirArg);
  const html = join(weekDir, DRAFT ? "sheet-draft.html" : "sheet.html");
  const browser = findBrowser();
  if (!browser) { console.error("No Chrome or Edge found."); process.exit(1); }
  const url = pathToFileURL(html).href;
  const a = analyse(await dumpDom(browser, url));
  const b = analyse(await dumpDom(browser, url));
  const problems = a.problems.slice();
  if (JSON.stringify(a.summary) !== JSON.stringify(b.summary)) problems.push("two renders differ (pagination is not deterministic on this browser)");
  // The divine-name count in the render must equal the count in the data (verses plus incipit).
  const data = JSON.parse(await readFile(join(weekDir, "sheet.json"), "utf8"));
  const yyExpected = [...data.verses.map(v => v.he), data.haftarah.incipit?.he || ""].reduce((n, h) => n + (String(h).match(TETRA) || []).length, 0);
  if (yyExpected !== a.summary.yy) problems.push(`divine name: ${a.summary.yy} replaced in the render, ${yyExpected} in the data`);
  console.log(`Browser: ${browser}`);
  console.log(`Pages: ${a.summary.pages}; divine name ${a.summary.yy}x; keys ${a.summary.keys.length}; voices without a line: ${a.summary.voicesMissing.join(", ") || "none"}`);
  console.table(a.summary.page.map((p, i) => ({ page: i + 1, kind: p.kind, rows: p.rows, gap: p.gap, fill: p.fill, split: p.split, offpage: p.offpage, voices: p.voices || "" })));
  if (problems.length) { console.error("Check failed:\n  - " + problems.join("\n  - ")); process.exit(1); }
  console.log("Check passed.");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) main().catch(err => { console.error(err.message || err); process.exit(1); });
