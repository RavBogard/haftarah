#!/usr/bin/env node
/**
 * check.mjs — render a week twice with the pinned browser and assert the layout invariants the
 * design review asked for. Reads the data-* attributes render.js writes on <html> and each .page.
 *
 *   node scripts/check.mjs weeks/<slug>
 */
import { readFile, mkdir, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { findBrowser, chromeFlags } from "./build.mjs";

// A split needs two lines on each side, so a two-line verse that does not fit leaves a band of up
// to about an inch; the paginator splits anything taller. Checked ceiling: 100px (1.04in), plus
// 4px for the sub-pixel rounding of a bottom-pinned apparatus (Noach 5787 failed at 101px).
const GAP_CEILING = 104;
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
  // Each page's markup, for the per-entry and per-row data render.js writes (data-h, data-verse ...).
  const bodies = dom.split(/<section class="page/).slice(1);
  const tagsOf = (html, re) => [...html.matchAll(re)].map(m => m[0]);
  const entriesOn = html => tagsOf(html, /<p class="entry[^"]*"[^>]*>/g).map(t => ({ verse: attr(t, "verse"), src: attr(t, "src"), words: Number(attr(t, "words") || 0), h: Number(attr(t, "h") || 0) }));
  const rowsOn = html => tagsOf(html, /<div class="verse-row(?! synthetic)[^"]*"[^>]*>/g).filter(t => attr(t, "verse")).map(t => ({ verse: attr(t, "verse"), h: Number(attr(t, "h") || 0) }));
  const summary = {
    pages: Number(attr(rootTag, "pages")),
    yy: Number(attr(rootTag, "yy")),
    keys: (attr(rootTag, "keys") || "").split(",").filter(Boolean),
    emptySections: Number(attr(rootTag, "empty-sections") || 0),
    voicesMissing: (attr(rootTag, "voices-missing") || "").split("|").filter(Boolean),
    page: pages.map((t, i) => ({
      entries: entriesOn(bodies[i] || ""), verses: rowsOn(bodies[i] || ""),
      kind: attr(t, "kind"), rows: Number(attr(t, "rows") || 0), gap: Number(attr(t, "gap") || -1),
      fill: Number(attr(t, "fill") || 0), split: attr(t, "split") || "", cont: Number(attr(t, "cont") || 0),
      offpage: Number(attr(t, "offpage") || 0), need: Number(attr(t, "need") || 0), overflow: attr(t, "overflow") === "true", incipit: attr(t, "incipit"), voices: attr(t, "voices"),
    })),
    brInEnglish: (dom.match(/<div class="en[^"]*">[\s\S]*?<div class="gut"/g) || []).filter(s => /<br/i.test(s)).length,
    // The keys of the margin notes actually printed on the pages (the measuring stage is not a page).
    noteKeys: dom.split(/<section class="page/).slice(1).flatMap(pg => [...pg.matchAll(/<p class="note[^"]*"[^>]*>\s*<span class="k">([a-z]+)<\/span>/g)].map(m => m[1])),
  };
  const problems = [], diagnostics = [];
  const textPages = summary.page.filter(p => p.kind === "text");
  // The last page that holds a verse; pages after it carry only margin notes and the end matter.
  const lastText = [...textPages].reverse().find(p => p.rows > 0) || textPages[textPages.length - 1];
  summary.page.forEach((p, i) => {
    const n = i + 1;
    if (p.overflow) problems.push(`page ${n}: content overflows the page`);
    if (p.kind === "text" && p !== lastText && p.gap > GAP_CEILING) {
      problems.push(`page ${n}: ${p.gap}px gap above the apparatus (max ${GAP_CEILING})`);
      diagnostics.push(gapReport(n, p, summary.page[i + 1]));
    }
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
  return { summary, problems, diagnostics };
}

// Why a page has a wide gap, and what to cut. The gap is there because the next verse (first row of
// the next page) did not fit above this page's apparatus. Freeing `need` px of apparatus lets it
// come up. The apparatus is set in two balanced columns, so shortening an entry by one line saves
// about half a line of apparatus height: words to cut ≈ 2 × need × (entry words / entry height).
const RULE_GAP = 16;
export function gapReport(n, p, next) {
  const fmt = e => `${e.verse} ${e.src}: ${e.h}px, ${e.words} words`;
  const lines = [`page ${n}: gap ${p.gap}px, ${p.gap - GAP_CEILING}px over the ${GAP_CEILING}px ceiling`];
  lines.push(`  verses on page ${n}: ${p.verses.map(v => v.verse).join(", ") || "none"}`);
  lines.push(`  apparatus on page ${n}:` + (p.entries.length ? "\n" + p.entries.map(e => "    " + fmt(e)).join("\n") : " none"));
  if (next) lines.push(`  apparatus on page ${n + 1}:` + (next.entries.length ? "\n" + next.entries.map(e => "    " + fmt(e)).join("\n") : " none"));
  const waiting = next?.verses?.[0];
  // render.js measures the real shortfall (verse plus its margin notes) as data-need; otherwise estimate.
  const need = p.need || (waiting ? Math.max(1, waiting.h + RULE_GAP - p.gap) : p.gap - GAP_CEILING);
  if (waiting) lines.push(`  next verse ${waiting.verse} (${waiting.h}px tall) misses page ${n} by ${need}px${p.need ? "" : " (estimated)"}; that much apparatus must go for it to fit`);
  const big = [...p.entries].sort((a, b) => b.h - a.h)[0];
  if (big && big.h) {
    const words = Math.min(big.words, Math.ceil(2 * need * big.words / big.h));
    lines.push(`  suggested trim: ${big.src} on ${big.verse} (the largest entry, ${big.words} words): cut about ${words} words`);
  }
  return lines.join("\n");
}

async function main() {
  const dirArg = process.argv.slice(2).find(a => !a.startsWith("--"));
  if (!dirArg) { console.error("usage: node scripts/check.mjs weeks/<slug>"); process.exit(1); }
  const weekDir = resolve(dirArg);
  const html = join(weekDir, "sheet.html");
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
  if (problems.length) {
    console.error("Check failed:\n  - " + problems.join("\n  - "));
    if (a.diagnostics.length) console.error("\nGap diagnostics:\n" + a.diagnostics.join("\n"));
    process.exit(1);
  }
  console.log("Check passed.");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) main().catch(err => { console.error(err.message || err); process.exit(1); });
