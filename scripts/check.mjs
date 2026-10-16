#!/usr/bin/env node
/**
 * check.mjs — render a week twice with the pinned browser and assert the layout invariants the
 * design review asked for. Reads the data-* attributes render.js writes on <html> and each .page.
 *
 *   node scripts/check.mjs weeks/<slug>                  # every built reading: sheet.html, and sheet-torah.html when the week has a Torah reading
 *   node scripts/check.mjs weeks/<slug> --reading torah  # one reading only
 *   node scripts/check.mjs weeks/<slug> --trope          # the haftarah's chanter's copy, sheet-trope.html
 */
import { readFile, access } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { findBrowser } from "./build.mjs";
import { dumpDom } from "./chrome.mjs";
import { HTML_FILES, TROPE_HTML, readingsWithVerses } from "./week-files.mjs";
import { createRequire } from "node:module";
const L = createRequire(import.meta.url)("../template/lib.js");

// A split needs two lines on each side, so a two-line verse that does not fit leaves a band of up
// to about an inch; the paginator splits anything taller. Checked ceiling: 100px (1.04in), plus
// 4px for the sub-pixel rounding of a bottom-pinned apparatus (Noach 5787 failed at 101px).
const GAP_CEILING = 104;
const TETRA = /י[֑-ׇ]*ה[֑-ׇ]*ו[֑-ׇ]*ה[֑-ׇ]*/g;

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
    figures: attr(rootTag, "figures") || "",
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

/**
 * What to check: every reading with verses, or the one --reading names (torah or haftarah; anything
 * else is refused), or the haftarah's chanter's copy with trope. Throws when there is nothing to check.
 */
export function checkTargets(file, { only = null, trope = false } = {}) {
  if (only != null && !Object.prototype.hasOwnProperty.call(HTML_FILES, only)) throw new Error(`--reading takes torah or haftarah${only ? `, not "${only}"` : ""}`);
  // The chanter's copy exists for the haftarah only.
  if (trope) return [{ id: L.primaryReading(file).id, kind: "haftarah", html: TROPE_HTML }];
  const targets = readingsWithVerses(file).filter(r => !only || r.kind === only).map(r => ({ id: r.id, kind: r.kind, html: HTML_FILES[r.kind] }));
  if (!targets.length) throw new Error(only ? `no ${only} reading with verses to check` : "no reading with verses to check");
  return targets;
}

/**
 * Render every built reading twice and assert the layout invariants. Returns { ok, readings: [{ id, kind, html,
 * summary, problems, diagnostics, page }] }; the CLI prints the table. `dumpDomImpl` replaces chrome.mjs's dumpDom
 * (tests); `extraArgs` reach the browser (the pack's flags on Vercel). `browser` is an executable path,
 * undefined to look one up with findBrowser().
 */
export async function checkWeek(dir, { only = null, trope = false, browser = undefined, extraArgs = [], dumpDomImpl = dumpDom, log = console.log } = {}) {
  const weekDir = resolve(dir);
  const file = JSON.parse(await readFile(join(weekDir, "sheet.json"), "utf8"));
  const targets = checkTargets(file, { only, trope });
  const b = browser === undefined ? findBrowser() : browser;
  if (!b) throw new Error("No Chrome or Edge found.");
  log(`Browser: ${b}`);
  const out = [];
  for (const t of targets) {
    const html = join(weekDir, t.html);
    // A missing file would render as Chrome's error page and surface as a page-count mismatch.
    if (!(await access(html).then(() => true, () => false))) {
      out.push({ id: t.id, kind: t.kind, html: t.html, summary: null, problems: [`${String(dir).replace(/[\\/]+$/, "")}/${t.html} is missing; run node scripts/build.mjs ${dir}${trope ? " --trope" : ""} first`], diagnostics: [], page: [] });
      continue;
    }
    const url = pathToFileURL(html).href;
    const a = analyse(await dumpDomImpl(b, url, { extraArgs }));
    const c = analyse(await dumpDomImpl(b, url, { extraArgs }));
    const problems = a.problems.slice();
    if (JSON.stringify(a.summary) !== JSON.stringify(c.summary)) problems.push("two renders differ (pagination is not deterministic on this browser)");
    // The divine-name count in the render must equal the count in the data (verses plus incipit).
    const data = L.readingView(file, t.id);
    const yyExpected = [...data.verses.map(v => v.he), data.haftarah.incipit?.he || ""].reduce((n, h) => n + (String(h).match(TETRA) || []).length, 0);
    if (yyExpected !== a.summary.yy) problems.push(`divine name: ${a.summary.yy} replaced in the render, ${yyExpected} in the data`);
    out.push({ id: t.id, kind: t.kind, html: t.html, summary: a.summary, problems, diagnostics: a.diagnostics, page: a.summary.page });
  }
  return { ok: out.every(r => !r.problems.length), readings: out };
}

async function main() {
  const args = process.argv.slice(2);
  const dirArg = args.find((a, i) => !a.startsWith("--") && args[i - 1] !== "--reading");
  if (!dirArg) { console.error("usage: node scripts/check.mjs weeks/<slug> [--reading torah|haftarah] [--trope]"); process.exit(1); }
  const trope = args.includes("--trope");
  const ri = args.indexOf("--reading");
  const only = ri >= 0 ? (args[ri + 1] && !args[ri + 1].startsWith("--") ? args[ri + 1] : "") : null;
  const file = JSON.parse(await readFile(join(resolve(dirArg), "sheet.json"), "utf8"));
  try { checkTargets(file, { only, trope }); } catch (err) { console.error(`${dirArg}: ${err.message}`); process.exit(1); }
  const r = await checkWeek(dirArg, { only, trope });
  for (const x of r.readings) {
    if (!x.summary) { console.error(x.problems[0]); continue; }
    if (r.readings.length > 1) console.log(`\n${x.kind === "torah" ? "Torah" : "Haftarah"}: ${x.html}`);
    const s = x.summary;
    console.log(`Pages: ${s.pages}; divine name ${s.yy}x; keys ${s.keys.length}; voices without a line: ${s.voicesMissing.join(", ") || "none"}; figures: ${s.figures || "none"}`);
    console.table(s.page.map((p, i) => ({ page: i + 1, kind: p.kind, rows: p.rows, gap: p.gap, fill: p.fill, split: p.split, offpage: p.offpage, voices: p.voices || "" })));
    if (x.problems.length) {
      console.error("Check failed:\n  - " + x.problems.join("\n  - "));
      if (x.diagnostics.length) console.error("\nGap diagnostics:\n" + x.diagnostics.join("\n"));
    }
  }
  if (!r.ok) process.exit(1);
  console.log("Check passed.");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) main().catch(err => { console.error(err.message || err); process.exit(1); });
