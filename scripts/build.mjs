#!/usr/bin/env node
/**
 * build.mjs — render a week's sheet.json to HTML and a letter-size PDF.
 *
 *   node scripts/build.mjs weeks/<slug>            # sheet.pdf: everything not rejected
 *   node scripts/build.mjs weeks/<slug> --png      # also write page images (from the PDF when pdftoppm is present)
 *   node scripts/build.mjs weeks/<slug> --no-pdf   # HTML only (open sheet.html in a browser and print)
 *
 * Needs Node 18+ and Chrome or Edge installed (or set HAFTARAH_BROWSER to a browser executable).
 */

import { readFile, writeFile, access, mkdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve, relative, dirname, basename } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";

const HaftarahLib = createRequire(import.meta.url)("../template/lib.js");

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, "..");

function flag(name) { return process.argv.includes(`--${name}`); }
// Set by main(); kept at module level so the helpers below can see them. Importing this module
// (check.mjs and the tests do) must not parse arguments or exit.
let weekDir, WANT_PDF, WANT_PNG;
function parseArgs() {
  const dirArg = process.argv.slice(2).find(a => !a.startsWith("--"));
  if (!dirArg) { console.error("usage: node scripts/build.mjs weeks/<slug> [--png] [--no-pdf]"); process.exit(1); }
  weekDir = resolve(dirArg);
  WANT_PDF = !flag("no-pdf");
  WANT_PNG = flag("png");
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

function run(cmd, args) {
  return new Promise((res, rej) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let err = "";
    child.stderr.on("data", d => (err += d));
    child.on("error", rej);
    child.on("close", code => (code === 0 ? res() : rej(new Error(`${basename(cmd)} exited ${code}\n${err.slice(-800)}`))));
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

  const logo = await findLogo();
  const voices = JSON.parse(await readFile(join(ROOT, "template", "voices.json"), "utf8"));
  const tpl = await readFile(join(ROOT, "template", "sheet.html"), "utf8");
  const title = `${data.shabbat?.parashah?.en || ""} haftarah`;
  const note = `${shown} commentary entr${shown === 1 ? "y" : "ies"}.`;
  const html = fillTemplate(tpl, {
    TITLE: title.replace(/[<>&]/g, ""),
    CSS: toPosix(relative(weekDir, join(ROOT, "template", "sheet.css"))),
    RENDER: toPosix(relative(weekDir, join(ROOT, "template", "render.js"))),
    LIB: toPosix(relative(weekDir, join(ROOT, "template", "lib.js"))),
    DATA: JSON.stringify(data).replace(/<\/script/gi, "<\\/script"),
    OPTIONS: JSON.stringify({ logo, voices }),
    NOTE: note,
  });

  const htmlPath = join(weekDir, "sheet.html");
  await writeFile(htmlPath, html, "utf8");
  console.log(`Wrote ${relative(ROOT, htmlPath)}${logo ? ` (logo: ${logo})` : " (no logo in assets/; typographic wordmark)"}`);

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

  try {
    // The page images are rendered from the PDF when pdftoppm is present: a headless screenshot
    // on Linux Chromium loses the bottom of the page, and the PDF is what prints.
    const pdfPath = WANT_PDF ? join(weekDir, "sheet.pdf") : join(profile, "probe.pdf");
    await run(browser, [...common, "--no-pdf-header-footer", `--print-to-pdf=${pdfPath}`, url]);
    const buf = await readFile(pdfPath);
    const pages = countPdfPages(buf) || 1;
    if (WANT_PDF) console.log(`Wrote ${relative(ROOT, pdfPath)}: ${pages} pages, ${Math.round(buf.length / 1024)} KB`);
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
  } finally {
    await rm(profile, { recursive: true, force: true }).catch(() => {});
  }
}

function findPdftoppm() {
  const dirs = (process.env.PATH || "").split(process.platform === "win32" ? ";" : ":");
  const names = process.platform === "win32" ? ["pdftoppm.exe"] : ["pdftoppm"];
  for (const d of dirs) for (const n of names) { const p = join(d, n); if (d && existsSync(p)) return p; }
  return null;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch(err => { console.error(err.message || err); process.exit(1); });
}
