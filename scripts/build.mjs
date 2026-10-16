#!/usr/bin/env node
/**
 * build.mjs — render a week's sheet.json to HTML and a letter-size PDF.
 *
 *   node scripts/build.mjs weeks/<slug>            # every reading: sheet.pdf (haftarah) and sheet-torah.pdf (Torah, when the week has one)
 *   node scripts/build.mjs weeks/<slug> --reading torah   # one reading only (torah or haftarah)
 *   node scripts/build.mjs weeks/<slug> --png      # also page images: preview/ (haftarah), preview-torah/ (Torah)
 *   node scripts/build.mjs weeks/<slug> --no-pdf   # HTML only (open sheet.html or sheet-torah.html in a browser and print)
 *   node scripts/build.mjs weeks/<slug> --trope    # also the haftarah's chanter's copy: sheet-trope.html and sheet-trope.pdf
 *
 * Needs Node 18+ and Chrome or Edge installed (or set HAFTARAH_BROWSER to a browser executable).
 */

import { readFile, writeFile, access, mkdir, rm, rename } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve, relative, dirname, basename } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";

import { lintSheet, formatLint } from "./lint.mjs";
import { loadCustoms } from "./customs.mjs";
import { loadGeo, placeProblems, timelineProblems } from "./geo.mjs";
import { HTML_FILES, PDF_FILES, TROPE_HTML, readingsWithVerses } from "./week-files.mjs";

const HaftarahLib = createRequire(import.meta.url)("../template/lib.js");

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, "..");

function flag(name) { return process.argv.includes(`--${name}`); }
// The CLI's options. Importing this module (check.mjs, the tests and the server do) must not parse
// arguments or exit: only main() calls this.
function parseArgs() {
  const args = process.argv.slice(2);
  const valueOf = name => { const i = args.indexOf(`--${name}`); return i < 0 ? null : args[i + 1]; };
  const dirArg = args.find((a, i) => !a.startsWith("--") && !["--reading", "--customs"].includes(args[i - 1]));
  if (!dirArg) { console.error("usage: node scripts/build.mjs weeks/<slug> [--reading torah|haftarah] [--png] [--no-pdf] [--trope] [--customs <id>]"); process.exit(1); }
  const reading = valueOf("reading");
  if (reading && !["torah", "haftarah"].includes(reading)) { console.error(`--reading takes torah or haftarah (got ${reading})`); process.exit(1); }
  return { dir: dirArg, pdf: !flag("no-pdf"), png: flag("png"), trope: flag("trope"), reading, customs: valueOf("customs") || "crc" };
}

export class BuildRefused extends Error {
  // `message` is given only where the CLI has always printed other words (no reading to build, the lint's own lines).
  constructor(problems, message = "Not built; fix these first:\n" + problems.map(x => "  - " + x).join("\n")) { super(message); this.problems = problems; }
}
/** The browser a build renders with: an executable and the flags to add after chromeFlags (none locally; the pack's on Vercel). */
export const browserRecord = (path, extraArgs = []) => ({ path, extraArgs });

/** The Torah sheet's data: its colophon's "Next week" line names next week's Torah reading, and is dropped when none is known. */
export function torahColophonData(data) {
  const nw = data.nextWeek;
  return { ...data, nextWeek: nw && nw.torahRef ? { ...nw, ref: nw.torahRef } : null };
}

/** The haftarah sheet's data: unchanged, except that next week's Torah ref (only the Torah sheet reads it) is not embedded, so the haftarah's page is byte-identical whether or not fetch recorded it. */
export function haftarahColophonData(data) {
  const nw = data.nextWeek;
  if (!nw || !("torahRef" in nw)) return data;
  const { torahRef, ...rest } = nw;
  return { ...data, nextWeek: rest };
}

/** The readings this build makes: every reading with verses, in the sheet's order, or only the one --reading names. */
export function readingsToBuild(file, only = null) {
  const all = readingsWithVerses(file);
  const pick = only ? all.filter(r => r.kind === only) : all;
  if (!pick.length) throw new Error(only ? `this sheet has no ${only} reading with verses` : "this sheet has no reading with verses");
  return pick.map(r => ({ id: r.id, kind: r.kind }));
}

function toPosix(p) { return p.split("\\").join("/"); }

async function findLogo(weekDir, root = ROOT) {
  for (const name of ["logo.svg", "logo.png", "logo.jpg", "logo.jpeg"]) {
    const p = join(root, "assets", name);
    try { await access(p); return toPosix(relative(weekDir, p)); } catch {}
  }
  return null;
}

export function findBrowser() {
  if (process.env.HAFTARAH_BROWSER && existsSync(process.env.HAFTARAH_BROWSER)) return process.env.HAFTARAH_BROWSER;
  const candidates = [
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    `${process.env.LOCALAPPDATA || ""}/Google/Chrome/Application/chrome.exe`,
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    "/usr/bin/google-chrome", "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/microsoft-edge",
  ];
  return candidates.find(p => p && existsSync(p)) || null;
}

// The flags every headless run uses, so build and check render identically.
export function chromeFlags(profile) {
  const common = [
    "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
    "--allow-file-access-from-files", "--hide-scrollbars", `--user-data-dir=${profile}`,
    "--virtual-time-budget=12000", "--run-all-compositor-stages-before-draw",
  ];
  // Cloud sandboxes run as root, where Chrome refuses to start without this flag.
  if (process.platform === "linux" && process.getuid?.() === 0) common.push("--no-sandbox");
  return common;
}

// Template placeholders are filled with a replacer function so "$'" or "$&" inside the data stay literal.
export function fillTemplate(tpl, vars) {
  return Object.entries(vars).reduce((s, [k, v]) => s.replace(`{{${k}}}`, () => v), tpl);
}

// The citation checks. Status is optional and only "rejected" keeps an item off the page; Daniel
// approves a sheet by printing it, so nothing here asks whether an item was approved. The figures
// are the week's, not a reading's: figuresGate checks them once.
export function gate(data, biblio) {
  const problems = [];
  const where = e => `${e.chapter ? e.chapter + ":" : ""}${e.verse} ${e.source}`;
  if (!data.haftarah?.incipit?.en) problems.push("incipit.en is empty");
  for (const e of (data.commentary || []).filter(e => e.status !== "rejected")) {
    if (e.register !== "critical") { if (!e.sourceRef) problems.push(`no Sefaria ref: ${where(e)}`); continue; }
    if (!(e.works || []).length) problems.push(`critical entry names no work: ${where(e)}`);
    else if (!biblio) problems.push(`bibliography/${data.haftarah.book}.md is missing (needed by ${where(e)})`);
    else for (const k of e.works) if (!biblio.has(k)) problems.push(`work not in bibliography/${data.haftarah.book}.md: ${k} (${where(e)})`);
  }
  return problems;
}

// The figures (places, timeline) are the week's: checked once, with no reading's prefix, against every
// bibliography the week's readings load (`biblio`, their union), and they need the geo data and the
// chronology table; an empty list is no figure. `geoError` is why loadGeo failed, when it did.
export function figuresGate(file, biblio, geo = null, geoError = null) {
  if (!(file.places?.length || file.timeline?.length)) return [];
  if (!geo) return [`data/geo and data/chronology.json are needed for the figures (loadGeo failed${geoError ? `: ${geoError.message || geoError}` : ""})`];
  return [...placeProblems(file.places, geo.gazetteer, { region: file.mapRegion ?? null, basemap: geo.basemap }), ...timelineProblems(file.timeline, geo.chronology, biblio)];
}

/**
 * One book's bibliography: bibliography/<book>.md under `root`, with `overlay[book]` (markdown, more
 * lines in the same form) added over it, the overlay's keys winning. null when neither exists.
 */
async function bookBibliography(book, root = ROOT, overlay = null) {
  let map = null;
  try { map = HaftarahLib.parseBibliography(await readFile(join(root, "bibliography", `${book}.md`), "utf8")); } catch {}
  const extra = overlay && typeof overlay[book] === "string" ? HaftarahLib.parseBibliography(overlay[book]) : null;
  if (extra) map = new Map([...(map || []), ...extra]);
  return map;
}

/** The union of the bibliographies the week's readings load (bibliography/<book>.md, plus the overlay's lines), or null when none exists. */
export async function weekBibliography(file, root = ROOT, overlay = null) {
  let union = null;
  const books = [...new Set(HaftarahLib.readings(file).map(r => HaftarahLib.readingView(file, r.id).haftarah?.book).filter(Boolean))];
  for (const book of books) {
    const m = await bookBibliography(book, root, overlay);
    if (m) union = new Map([...(union || []), ...m]);
  }
  return union;
}

function run(cmd, args, okCodes = [0]) {
  return new Promise((res, rej) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let err = "";
    child.stderr.on("data", d => (err += d));
    child.on("error", rej);
    child.on("close", code => (okCodes.includes(code) ? res() : rej(new Error(`${basename(cmd)} exited ${code}\n${err.slice(-800)}`))));
  });
}

function countPdfPages(buf) {
  const s = buf.toString("latin1");
  const m = s.match(/\/Type\s*\/Page(?![s\w])/g);
  return m ? m.length : null;
}

/**
 * Build one week folder: the citation gate, lint, the HTML for every reading (and the chanter's copy with
 * trope), then the PDFs and page images when a browser is at hand. Throws BuildRefused when the gate or lint
 * refuses; returns { builds: [{ id, kind, html, pdf, pages, bytes }], warnings } otherwise. `browser` is a
 * browserRecord, undefined to look one up with findBrowser(), null for none; `templateDir` and `root` let a
 * caller build from a packaged engine or from another checkout; `biblioOverlay` is { <book>: markdown } of
 * extra bibliography lines (the server's add_bibliography_work) merged over bibliography/<book>.md; `log`/`warn`
 * replace console.
 */
export async function buildWeek(dir, { pdf = true, png = false, trope = false, reading = null, customs = "crc", browser = undefined, templateDir = join(ROOT, "template"), root = ROOT, biblioOverlay = null, log = console.log, warn = console.warn } = {}) {
  const weekDir = resolve(dir);
  const file = JSON.parse(await readFile(join(weekDir, "sheet.json"), "utf8"));
  let targets;
  try { targets = readingsToBuild(file, reading); } catch (err) { throw new BuildRefused([err.message], `Not built: ${err.message}`); }
  const multi = HaftarahLib.readings(file).length > 1;
  let geoError = null;
  const geo = (file.places?.length || file.timeline?.length) ? await loadGeo().catch(err => { geoError = err; return null; }) : null;

  // The citation gate for every reading built first: nothing is written while any of them fails.
  const builds = [], problems = [];
  for (const t of targets) {
    // One reading in the schema-2 shape; a schema-2 file is itself, so its sheet.html does not change.
    let data = HaftarahLib.readingView(file, t.id);
    data = t.kind === "torah" ? torahColophonData(data) : haftarahColophonData(data);
    const biblio = await bookBibliography(data.haftarah.book, root, biblioOverlay);
    problems.push(...gate(data, biblio).map(p => (multi ? `${t.id}: ${p}` : p)));
    builds.push({ ...t, data });
  }
  problems.push(...figuresGate(file, await weekBibliography(file, root, biblioOverlay), geo, geoError));
  if (problems.length) throw new BuildRefused(problems);

  // Entry lint (scripts/lint.mjs): errors stop the build, warnings print and the build goes on.
  const voices = JSON.parse(await readFile(join(templateDir, "voices.json"), "utf8"));
  const linted = lintSheet(file, { voices, customs: await loadCustoms(customs), only: targets.map(t => t.id), basemap: geo ? geo.basemap : null });
  if (linted.warnings.length) warn(`Lint warnings:\n${formatLint(linted.warnings)}`);
  if (linted.errors.length) {
    const hint = "(node scripts/lint.mjs <week> --fix rewrites gloss lemmas to the verse's exact text)";
    const lines = formatLint(linted.errors);
    throw new BuildRefused([...lines.split("\n").map(l => l.replace(/^ {2}- /, "")), ...(linted.fixes.length ? [hint] : [])], `Not built; fix these first:\n${lines}${linted.fixes.length ? "\n" + hint : ""}`);
  }

  const logo = await findLogo(weekDir, root);
  const tpl = await readFile(join(templateDir, "sheet.html"), "utf8");
  // The chanter's copy is the same page with trope: true in its options and its own title; the
  // Torah sheet is the same page with reading: "torah".
  const pageHtml = (data, options, titleText) => {
    const shown = (data.commentary || []).filter(e => e.status !== "rejected").length;
    return fillTemplate(tpl, {
      TITLE: titleText.replace(/[<>&]/g, ""),
      CSS: toPosix(relative(weekDir, join(templateDir, "sheet.css"))),
      RENDER: toPosix(relative(weekDir, join(templateDir, "render.js"))),
      LIB: toPosix(relative(weekDir, join(templateDir, "lib.js"))),
      DATA: JSON.stringify(data).replace(/<\/script/gi, "<\\/script"),
      OPTIONS: JSON.stringify(options).replace(/<\/script/gi, "<\\/script"),
      NOTE: `${shown} commentary entr${shown === 1 ? "y" : "ies"}.`,
    });
  };

  const tropePath = join(weekDir, TROPE_HTML);
  // The figures' basemap and chronology ride in the options only for a week that has figures.
  const figOpts = geo ? { geo: { basemap: geo.basemap, chronology: geo.chronology } } : {};
  for (const b of builds) {
    const torah = b.kind === "torah";
    const title = `${b.data.shabbat?.parashah?.en || ""} ${torah ? "Torah" : "haftarah"}`;
    b.html = join(weekDir, HTML_FILES[b.kind]);
    await writeFile(b.html, pageHtml(b.data, torah ? { logo, voices, reading: "torah", ...figOpts } : { logo, voices, ...figOpts }, title), "utf8");
    log(`Wrote ${relative(root, b.html)}${logo ? ` (logo: ${logo})` : " (no logo in assets/; typographic wordmark)"}`);
    if (torah) continue;
    if (trope) {
      await writeFile(tropePath, pageHtml(b.data, { logo, voices, trope: true, ...figOpts }, `${title} (chanter’s copy)`), "utf8");
      log(`Wrote ${relative(root, tropePath)}`);
    } else if (existsSync(join(weekDir, "sheet-trope.pdf"))) {
      // A chanter's copy left from an earlier build no longer matches this sheet; say so rather than delete it.
      warn(`${relative(root, join(weekDir, "sheet-trope.pdf"))} is from an earlier build; --trope rebuilds it`);
    }
  }
  if (trope && !builds.some(b => b.kind === "haftarah")) warn("--trope makes the haftarah's chanter's copy; this build has no haftarah");

  const result = () => ({ builds: builds.map(b => ({ id: b.id, kind: b.kind, html: b.html, pdf: b.pdf || null, pages: b.pages || null, bytes: b.bytes || null })), warnings: linted.warnings });
  if (!pdf && !png) return result();

  let b0 = browser;
  if (b0 === undefined) { const found = findBrowser(); b0 = found ? browserRecord(found) : null; }
  if (!b0) {
    warn("No Chrome or Edge found. Open the HTML in a browser and print to PDF (letter, no margins, background graphics on), or set HAFTARAH_BROWSER.");
    return result();
  }
  log(`Browser: ${b0.path}`);
  const profile = join(tmpdir(), `haftarah-chrome-${process.pid}`);
  await mkdir(profile, { recursive: true });
  const common = [...chromeFlags(profile), ...(b0.extraArgs || [])];
  const kb = buf => `${Math.round(buf.length / 1024)} KB`;

  try {
    for (const b of builds) {
      // The page images are rendered from the PDF when pdftoppm is present: a headless screenshot
      // on Linux Chromium loses the bottom of the page, and the PDF is what prints.
      const url = pathToFileURL(b.html).href;
      const pdfPath = pdf ? join(weekDir, PDF_FILES[b.kind]) : join(profile, `probe-${b.kind}.pdf`);
      const { pages, buf } = await printPdf(b0, url, pdfPath, { common });
      if (pdf) {
        log(`Wrote ${relative(root, pdfPath)}: ${pages} pages, ${kb(buf)}`);
        Object.assign(b, { pdf: pdfPath, pages, bytes: buf.length });
      }
      if (png) await writePreviews({ browser: b0, common, url, pdfPath, pages, outDir: join(weekDir, b.kind === "torah" ? "preview-torah" : "preview"), root, log });
      // The chanter's copy prints after the study sheet, the same way; previews stay the sheet's.
      if (b.kind === "haftarah" && trope && pdf) {
        const tropePdf = join(weekDir, "sheet-trope.pdf");
        const t = await printPdf(b0, pathToFileURL(tropePath).href, tropePdf, { common });
        log(`Wrote ${relative(root, tropePdf)}: ${t.pages} pages, ${kb(t.buf)}`);
      }
    }
  } finally {
    await rm(profile, { recursive: true, force: true }).catch(() => {});
  }
  return result();
}

async function main() {
  const { dir, ...opts } = parseArgs();
  try { await buildWeek(dir, opts); }
  catch (err) {
    if (err instanceof BuildRefused) { console.error(err.message); process.exit(1); }
    throw err;
  }
}

// Page images of one PDF: pdftoppm at 192 dpi when present, else one headless screenshot per page.
async function writePreviews({ browser, common, url, pdfPath, pages, outDir, root = ROOT, log = console.log }) {
  await rm(outDir, { recursive: true, force: true }).catch(() => {});
  await mkdir(outDir, { recursive: true });
  const pdftoppm = findPdftoppm();
  if (pdftoppm) {
    // 192 dpi = 2x CSS pixels, 1632 x 2112 px, the same size as the screenshots.
    await run(pdftoppm, ["-png", "-r", "192", pdfPath, join(outDir, "page")]);
    log(`Wrote ${pages} page image${pages === 1 ? "" : "s"} to ${relative(root, outDir)}/ (pdftoppm)`);
    return;
  }
  for (let p = 1; p <= pages; p++) {
    const png = join(outDir, `page-${String(p).padStart(2, "0")}.png`);
    await run(browser.path, [...common, "--window-size=816,1056", "--force-device-scale-factor=2", `--screenshot=${png}`, `${url}?page=${p}`]);
  }
  log(`Wrote ${pages} page image${pages === 1 ? "" : "s"} to ${relative(root, outDir)}/ (screenshots; check the PDF if a page looks cut off)`);
}

/**
 * Print one page to one PDF, packed with qpdf when present. `browser` is a browserRecord; `common` the
 * full flag list (chromeFlags plus the record's extraArgs). Returns the page count and the file's bytes.
 */
export async function printPdf(browser, url, pdfPath, { common }) {
  await run(browser.path, [...common, "--no-pdf-header-footer", `--print-to-pdf=${pdfPath}`, url]);
  // Pages are counted before packing: afterwards the page objects sit inside compressed streams.
  const pages = countPdfPages(await readFile(pdfPath)) || 1;
  // Chrome writes every object uncompressed; qpdf, when installed (the cloud image has it), packs
  // them into object streams without touching content: about a fifth smaller. Optional.
  const qpdf = findTool("qpdf");
  if (qpdf) {
    const packed = pdfPath + ".packed";
    try {
      await run(qpdf, ["--object-streams=generate", "--compress-streams=y", "--recompress-flate", "--compression-level=9", pdfPath, packed], [0, 3]);
      await rename(packed, pdfPath);
    } catch { await rm(packed, { force: true }).catch(() => {}); }
  }
  return { pages, buf: await readFile(pdfPath) };
}

function findTool(name) {
  const dirs = (process.env.PATH || "").split(process.platform === "win32" ? ";" : ":");
  const names = process.platform === "win32" ? [`${name}.exe`] : [name];
  for (const d of dirs) for (const n of names) { const p = join(d, n); if (d && existsSync(p)) return p; }
  return null;
}
const findPdftoppm = () => findTool("pdftoppm");

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch(err => { console.error(err.message || err); process.exit(1); });
}
