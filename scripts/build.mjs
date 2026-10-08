#!/usr/bin/env node
/**
 * build.mjs — render a week's sheet.json to HTML and a letter-size PDF.
 *
 *   node scripts/build.mjs weeks/<slug>            # final: approved items only -> sheet.pdf
 *   node scripts/build.mjs weeks/<slug> --draft    # review proof: proposed items flagged -> sheet-draft.pdf
 *   node scripts/build.mjs weeks/<slug> --png      # also write page images for review
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
let weekDir, DRAFT, WANT_PDF, WANT_PNG;
function parseArgs() {
  const dirArg = process.argv.slice(2).find(a => !a.startsWith("--"));
  if (!dirArg) { console.error("usage: node scripts/build.mjs weeks/<slug> [--draft] [--png] [--no-pdf]"); process.exit(1); }
  weekDir = resolve(dirArg);
  DRAFT = flag("draft");
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

export function gate(data, biblio) {
  const problems = [];
  const open = st => st && st !== "approved" && st !== "rejected";
  const where = e => `${e.chapter ? e.chapter + ":" : ""}${e.verse} ${e.source}`;
  for (const e of data.commentary || []) if (open(e.status)) problems.push(`commentary entry proposed: ${where(e)}`);
  for (const g of data.glosses || []) if (open(g.status)) problems.push(`gloss proposed: ${g.verse} ${g.lemma}`);
  for (const t of data.glossary || []) if (open(t.status)) problems.push(`glossary term proposed: ${t.term}`);
  if (data.openingNote && open(data.openingNote.status)) problems.push("opening note proposed");
  if (data.nextWeek && open(data.nextWeek.status)) problems.push("next-week line proposed: approve it or set nextWeek to null");
  if (!data.haftarah?.incipit?.en) problems.push("incipit.en is empty");
  for (const e of (data.commentary || []).filter(e => e.status === "approved")) {
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

  const counts = { approved: 0, proposed: 0, rejected: 0 };
  for (const e of data.commentary || []) counts[e.status === "approved" ? "approved" : e.status === "rejected" ? "rejected" : "proposed"]++;
  // The hard gate: nothing proposed prints, every quoted entry has a Sefaria ref, every critical
  // entry names only works on the closed bibliography. A draft prints the same list as a warning.
  let biblio = null;
  try { biblio = HaftarahLib.parseBibliography(await readFile(join(ROOT, "bibliography", `${data.haftarah.book}.md`), "utf8")); } catch {}
  const problems = gate(data, biblio);
  if (problems.length) {
    const list = problems.map(x => "  - " + x).join("\n");
    if (DRAFT) console.warn("Draft; these would block the final:\n" + list);
    else { console.error("Blocking the final sheet:\n" + list); process.exit(1); }
  }

  const logo = await findLogo();
  const voices = JSON.parse(await readFile(join(ROOT, "template", "voices.json"), "utf8"));
  const tpl = await readFile(join(ROOT, "template", "sheet.html"), "utf8");
  const title = `${data.shabbat?.parashah?.en || ""} haftarah${DRAFT ? " (draft)" : ""}`;
  const note = DRAFT
    ? `Draft for review. Shaded entries are proposed and awaiting approval; they will not appear in the final sheet. ${counts.approved} approved, ${counts.proposed} proposed, ${counts.rejected} rejected.`
    : `Final. ${counts.approved} approved entries.`;
  const html = tpl
    .replace("{{TITLE}}", title.replace(/[<>&]/g, ""))
    .replace("{{CSS}}", toPosix(relative(weekDir, join(ROOT, "template", "sheet.css"))))
    .replace("{{RENDER}}", toPosix(relative(weekDir, join(ROOT, "template", "render.js"))))
    .replace("{{LIB}}", toPosix(relative(weekDir, join(ROOT, "template", "lib.js"))))
    .replace("{{DATA}}", JSON.stringify(data).replace(/<\/script/gi, "<\\/script"))
    .replace("{{OPTIONS}}", JSON.stringify({ draft: DRAFT, logo, voices }))
    .replace("{{NOTE}}", note);

  const htmlName = DRAFT ? "sheet-draft.html" : "sheet.html";
  const htmlPath = join(weekDir, htmlName);
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
    if (WANT_PDF) {
      const pdfPath = join(weekDir, DRAFT ? "sheet-draft.pdf" : "sheet.pdf");
      await run(browser, [...common, "--no-pdf-header-footer", `--print-to-pdf=${pdfPath}`, url]);
      const buf = await readFile(pdfPath);
      const pages = countPdfPages(buf);
      const sizeKb = Math.round(buf.length / 1024);
      let verdict = "";
      if (pages != null) verdict = pages < 4 ? " (under the 4-page target: room for more commentary)" : pages > 6 ? " (over the 6-page target: trim commentary or glosses)" : " (within the 4 to 6 page target)";
      console.log(`Wrote ${relative(ROOT, pdfPath)}: ${pages ?? "?"} pages, ${sizeKb} KB${verdict}`);
    }
    if (WANT_PNG) {
      const outDir = join(weekDir, DRAFT ? "preview-draft" : "preview");
      await rm(outDir, { recursive: true, force: true }).catch(() => {});
      await mkdir(outDir, { recursive: true });
      // Probe the page count, then capture each page alone at 2x (1632 x 2112 px).
      const probe = join(outDir, "probe.pdf");
      await run(browser, [...common, "--no-pdf-header-footer", `--print-to-pdf=${probe}`, url]);
      const pages = countPdfPages(await readFile(probe)) || 1;
      await rm(probe, { force: true });
      for (let p = 1; p <= pages; p++) {
        const png = join(outDir, `page-${String(p).padStart(2, "0")}.png`);
        await run(browser, [...common, "--window-size=816,1056", "--force-device-scale-factor=2", `--screenshot=${png}`, `${url}?page=${p}`]);
      }
      console.log(`Wrote ${pages} page image${pages === 1 ? "" : "s"} to ${relative(ROOT, outDir)}/`);
    }
  } finally {
    await rm(profile, { recursive: true, force: true }).catch(() => {});
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch(err => { console.error(err.message || err); process.exit(1); });
}
