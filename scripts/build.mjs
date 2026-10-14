#!/usr/bin/env node
/**
 * build.mjs — render a week's sheet.json to HTML and a letter-size PDF.
 *
 *   node scripts/build.mjs weeks/<slug>            # sheet.pdf: everything not rejected
 *   node scripts/build.mjs weeks/<slug> --png      # also write page images (from the PDF when pdftoppm is present)
 *   node scripts/build.mjs weeks/<slug> --no-pdf   # HTML only (open sheet.html in a browser and print)
 *   node scripts/build.mjs weeks/<slug> --trope    # also the chanter's copy: sheet-trope.html and sheet-trope.pdf
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

import { lint, formatLint } from "./lint.mjs";

const HaftarahLib = createRequire(import.meta.url)("../template/lib.js");

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, "..");

function flag(name) { return process.argv.includes(`--${name}`); }
// Set by main(); kept at module level so the helpers below can see them. Importing this module
// (check.mjs and the tests do) must not parse arguments or exit.
let weekDir, WANT_PDF, WANT_PNG, WANT_TROPE;
function parseArgs() {
  const dirArg = process.argv.slice(2).find(a => !a.startsWith("--"));
  if (!dirArg) { console.error("usage: node scripts/build.mjs weeks/<slug> [--png] [--no-pdf] [--trope]"); process.exit(1); }
  weekDir = resolve(dirArg);
  WANT_PDF = !flag("no-pdf");
  WANT_PNG = flag("png");
  WANT_TROPE = flag("trope");
}

function toPosix(p) { return p.split("\\").join("/"); }

async function findLogo() {
  for (const name of ["logo.svg", "logo.png", "logo.jpg", "logo.jpeg"]) {
    const p = join(ROOT, "assets", name);
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
// approves a sheet by printing it, so nothing here asks whether an item was approved.
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

async function main() {
  parseArgs();
  const sheetPath = join(weekDir, "sheet.json");
  const data = JSON.parse(await readFile(sheetPath, "utf8"));

  let biblio = null;
  try { biblio = HaftarahLib.parseBibliography(await readFile(join(ROOT, "bibliography", `${data.haftarah.book}.md`), "utf8")); } catch {}
  const problems = gate(data, biblio);
  if (problems.length) { console.error("Not built; fix these first:\n" + problems.map(x => "  - " + x).join("\n")); process.exit(1); }
  const shown = (data.commentary || []).filter(e => e.status !== "rejected").length;

  // Entry lint (scripts/lint.mjs): errors stop the build, warnings print and the build goes on.
  const voices = JSON.parse(await readFile(join(ROOT, "template", "voices.json"), "utf8"));
  const linted = lint(data, { voices });
  if (linted.warnings.length) console.warn(`Lint warnings:\n${formatLint(linted.warnings)}`);
  if (linted.errors.length) {
    const fixable = linted.fixes.length ? "\n(node scripts/lint.mjs <week> --fix rewrites gloss lemmas to the verse's exact text)" : "";
    console.error(`Not built; fix these first:\n${formatLint(linted.errors)}${fixable}`);
    process.exit(1);
  }

  const logo = await findLogo();
  const tpl = await readFile(join(ROOT, "template", "sheet.html"), "utf8");
  const title = `${data.shabbat?.parashah?.en || ""} haftarah`;
  const note = `${shown} commentary entr${shown === 1 ? "y" : "ies"}.`;
  // The chanter's copy is the same page with trope: true in its options and its own title.
  const pageHtml = (options, titleText) => fillTemplate(tpl, {
    TITLE: titleText.replace(/[<>&]/g, ""),
    CSS: toPosix(relative(weekDir, join(ROOT, "template", "sheet.css"))),
    RENDER: toPosix(relative(weekDir, join(ROOT, "template", "render.js"))),
    LIB: toPosix(relative(weekDir, join(ROOT, "template", "lib.js"))),
    DATA: JSON.stringify(data).replace(/<\/script/gi, "<\\/script"),
    OPTIONS: JSON.stringify(options),
    NOTE: note,
  });

  const htmlPath = join(weekDir, "sheet.html");
  await writeFile(htmlPath, pageHtml({ logo, voices }, title), "utf8");
  console.log(`Wrote ${relative(ROOT, htmlPath)}${logo ? ` (logo: ${logo})` : " (no logo in assets/; typographic wordmark)"}`);
  const tropePath = join(weekDir, "sheet-trope.html");
  if (WANT_TROPE) {
    await writeFile(tropePath, pageHtml({ logo, voices, trope: true }, `${title} (chanter’s copy)`), "utf8");
    console.log(`Wrote ${relative(ROOT, tropePath)}`);
  }

  if (!WANT_PDF && !WANT_PNG) return;

  const browser = findBrowser();
  if (!browser) {
    console.warn("No Chrome or Edge found. Open the HTML in a browser and print to PDF (letter, no margins, background graphics on), or set HAFTARAH_BROWSER.");
    return;
  }
  console.log(`Browser: ${browser}`);
  const profile = join(tmpdir(), `haftarah-chrome-${process.pid}`);
  await mkdir(profile, { recursive: true });
  const url = pathToFileURL(htmlPath).href;
  const common = chromeFlags(profile);
  const kb = buf => `${Math.round(buf.length / 1024)} KB`;

  try {
    // The page images are rendered from the PDF when pdftoppm is present: a headless screenshot
    // on Linux Chromium loses the bottom of the page, and the PDF is what prints.
    const pdfPath = WANT_PDF ? join(weekDir, "sheet.pdf") : join(profile, "probe.pdf");
    const { pages, buf } = await printPdf(browser, common, url, pdfPath);
    if (WANT_PDF) console.log(`Wrote ${relative(ROOT, pdfPath)}: ${pages} pages, ${kb(buf)}`);
    if (WANT_PNG) {
      const outDir = join(weekDir, "preview");
      await rm(outDir, { recursive: true, force: true }).catch(() => {});
      await mkdir(outDir, { recursive: true });
      const pdftoppm = findPdftoppm();
      if (pdftoppm) {
        // 192 dpi = 2x CSS pixels, 1632 x 2112 px, the same size as the screenshots.
        await run(pdftoppm, ["-png", "-r", "192", pdfPath, join(outDir, "page")]);
        console.log(`Wrote ${pages} page image${pages === 1 ? "" : "s"} to ${relative(ROOT, outDir)}/ (pdftoppm)`);
      } else {
        for (let p = 1; p <= pages; p++) {
          const png = join(outDir, `page-${String(p).padStart(2, "0")}.png`);
          await run(browser, [...common, "--window-size=816,1056", "--force-device-scale-factor=2", `--screenshot=${png}`, `${url}?page=${p}`]);
        }
        console.log(`Wrote ${pages} page image${pages === 1 ? "" : "s"} to ${relative(ROOT, outDir)}/ (screenshots; check the PDF if a page looks cut off)`);
      }
    }
    // The chanter's copy prints after the study sheet, the same way; previews stay the sheet's.
    if (WANT_TROPE && WANT_PDF) {
      const tropePdf = join(weekDir, "sheet-trope.pdf");
      const t = await printPdf(browser, common, pathToFileURL(tropePath).href, tropePdf);
      console.log(`Wrote ${relative(ROOT, tropePdf)}: ${t.pages} pages, ${kb(t.buf)}`);
    }
  } finally {
    await rm(profile, { recursive: true, force: true }).catch(() => {});
  }
}

// Print one page to one PDF, packed with qpdf when present. Returns the page count and the file's bytes.
async function printPdf(browser, common, url, pdfPath) {
  await run(browser, [...common, "--no-pdf-header-footer", `--print-to-pdf=${pdfPath}`, url]);
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
