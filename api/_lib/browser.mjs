// api/_lib/browser.mjs — where the browser comes from. On Vercel it is @sparticuz/chromium's pack, whose binary
// is chrome-headless-shell: it works only over a debugging connection, so a command-line --print-to-pdf or
// --dump-dom hangs (the preview spike of f93d893). There the PDFs, the DOM dumps for the check and the page
// images all go through one Playwright browser (the pack's documented recipe). Locally the scripts keep their
// spawn path, which the print golden guards. Both packages are imported here and only here, lazily, so the rest
// of the server and every test run without them.
import { join, basename } from "node:path";
import { mkdir, readFile } from "node:fs/promises";
import { browserRecord, findBrowser, countPdfPages } from "../../scripts/build.mjs";
import { screenshot } from "../../scripts/chrome.mjs";

export const PAGE = { width: 816, height: 1056, quality: 70 };
export const CLOSE_TIMEOUT_MS = 10_000;
const pad = n => String(n).padStart(2, "0");
const plain = err => String((err && err.message) || err).split("\n")[0].slice(0, 300);
/** p, or a rejection naming `what` once ms have passed; the timer never holds the process. */
function withTimeout(p, ms, what) {
  let timer;
  const t = new Promise((_, rej) => { timer = setTimeout(() => rej(new Error(`${what} timed out after ${Math.round(ms / 1000)} s`)), ms); timer.unref?.(); });
  return Promise.race([p, t]).finally(() => clearTimeout(timer));
}
const viewportOf = size => { const m = /^(\d+),(\d+)$/.exec(String(size || "")); return m ? { width: +m[1], height: +m[2] } : { width: PAGE.width, height: PAGE.height }; };

/**
 * print, dumpDom and pages over one lazily launched browser from `chromium` (playwright-core's, or a fake in
 * tests), and close(), which may be called twice and never waits more than CLOSE_TIMEOUT_MS (a close can hang).
 * Every call has a timeout; a failure closes its page and rethrows with a one-line message.
 */
export function playwrightLauncher({ chromium, executablePath, args, record, closeTimeoutMs = CLOSE_TIMEOUT_MS }) {
  let launching = null, closed = false;
  const browser = () => {
    if (closed) throw new Error("the browser is closed");
    return (launching ||= chromium.launch({ executablePath, args, headless: true, timeout: 60_000 }));
  };
  async function onPage(size, what, fn) {
    let page = null;
    try {
      const b = await browser();
      page = await b.newPage({ viewport: viewportOf(size), deviceScaleFactor: 1 });
      return await fn(page);
    } catch (err) { throw new Error(`${what}: ${plain(err)}`); }
    finally { if (page) await withTimeout(page.close(), closeTimeoutMs, "closing the page").catch(() => {}); }
  }
  // render.js sets data-pages after the fonts and the logo's redraw and its synchronous layout; the logo's <img>
  // (a data URL) must also have decoded before it prints. This is what the CLI's --virtual-time-budget covered.
  async function ready(page, url) {
    await page.goto(url, { waitUntil: "load", timeout: 60_000 });
    await page.waitForFunction(() => !!document.documentElement.dataset.pages && [...document.images].every(i => i.complete), null, { timeout: 30_000 });
    await withTimeout(page.evaluate(() => document.fonts.ready.then(() => true)), 30_000, "fonts");
  }
  return {
    browser: record,
    async print(rec, url, pdfPath) {
      return onPage(null, `print ${basename(pdfPath)}`, async page => {
        await ready(page, url);
        const counted = Number(await page.evaluate(() => document.documentElement.dataset.pages)) || null;
        await withTimeout(page.pdf({ path: pdfPath, preferCSSPageSize: true, printBackground: true, displayHeaderFooter: false }), 120_000, "page.pdf");
        const buf = await readFile(pdfPath);
        return { pages: countPdfPages(buf) || counted || 1, buf };   // no qpdf on Vercel
      });
    },
    async dumpDom(rec, url, { size = null, timeoutMs = 90_000 } = {}) {
      return onPage(size, "dump-dom", page => withTimeout((async () => { await ready(page, url); return page.content(); })(), timeoutMs, `dump-dom of ${url}`));
    },
    async pages(url, outDir, count, prefix) {
      await mkdir(outDir, { recursive: true });
      return onPage(null, "page images", async page => {
        const names = [];
        for (let p = 1; p <= count; p++) {
          await ready(page, `${url}?page=${p}`);
          const name = `${prefix}-${pad(p)}.jpg`;
          await page.screenshot({ path: join(outDir, name), type: "jpeg", quality: PAGE.quality, clip: { x: 0, y: 0, width: PAGE.width, height: PAGE.height }, timeout: 30_000 });
          names.push(name);
        }
        return names;
      });
    },
    async close() {
      if (closed) return;
      closed = true;
      if (!launching) return;
      try { const b = await launching; await withTimeout(b.close(), closeTimeoutMs, "closing the browser"); } catch {}
    },
  };
}

export async function vercelLauncher() {
  const pack = (await import("@sparticuz/chromium")).default;
  const path = await pack.executablePath();
  const { chromium } = await import("playwright-core");
  // The record is what build.mjs logs and spawns with; on Vercel nothing spawns it (printImpl and dumpDomImpl
  // replace the spawns), but its flags stay right for it: chromeFlags sets headless and the profile, and a
  // function has no /dev/shm.
  const extraArgs = [...pack.args.filter(a => !a.startsWith("--headless") && !a.startsWith("--user-data-dir") && !a.startsWith("--window-size")), "--no-sandbox", "--disable-dev-shm-usage"];
  return playwrightLauncher({ chromium, executablePath: path, args: pack.args, record: browserRecord(path, extraArgs) });
}

/** This machine's Chrome or Edge, for a build driven from Claude Code: the PDFs and the check as the scripts spawn
 * them (no print or dumpDom here), the page images as Chrome's --screenshot writes them. Those are PNGs, so they
 * keep the .png name and get_page_image says so. */
export async function localLauncher() {
  const path = findBrowser();
  if (!path) throw new Error("No Chrome or Edge found on this machine");
  return {
    browser: browserRecord(path),
    async pages(url, outDir, count, prefix) {
      await mkdir(outDir, { recursive: true });
      const names = [];
      for (let p = 1; p <= count; p++) { const name = `${prefix}-${pad(p)}.png`; await screenshot(path, `${url}?page=${p}`, { size: `${PAGE.width},${PAGE.height}`, out: join(outDir, name) }); names.push(name); }
      return names;
    },
  };
}
