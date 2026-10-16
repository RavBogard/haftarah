// api/_lib/browser.mjs — where the browser comes from. On Vercel it is @sparticuz/chromium's pack: spawned
// with build.mjs's flags for the PDFs (the same path as a local build, so the pagination is the pagination
// the print golden guards) and driven by playwright-core for the page images (a headless --screenshot on
// Linux loses the bottom of the page). Both packages are imported here and only here, lazily, so the rest
// of the server and every test run without them.
import { join } from "node:path";
import { mkdir } from "node:fs/promises";
import { browserRecord, findBrowser } from "../../scripts/build.mjs";
import { screenshot } from "../../scripts/chrome.mjs";

export const PAGE = { width: 816, height: 1056, quality: 70 };
const pad = n => String(n).padStart(2, "0");

export async function vercelLauncher() {
  const pack = (await import("@sparticuz/chromium")).default;
  const path = await pack.executablePath();
  // chromeFlags already sets headless, the profile and (through the page) the size; the pack's own would fight them.
  // A Vercel function has no /dev/shm, and the pack's args do not say so: without --disable-dev-shm-usage the PDF
  // spawn exits at once ("Creating shared memory in /dev/shm/... failed"). Playwright adds it itself for the images.
  const extraArgs = [...pack.args.filter(a => !a.startsWith("--headless") && !a.startsWith("--user-data-dir") && !a.startsWith("--window-size")), "--no-sandbox", "--disable-dev-shm-usage"];
  return {
    browser: browserRecord(path, extraArgs),
    async pages(url, outDir, count, prefix) {
      const { chromium } = await import("playwright-core");
      await mkdir(outDir, { recursive: true });
      const b = await chromium.launch({ executablePath: path, args: pack.args, headless: true });
      try {
        const page = await b.newPage({ viewport: { width: PAGE.width, height: PAGE.height }, deviceScaleFactor: 1 });
        const names = [];
        for (let p = 1; p <= count; p++) {
          await page.goto(`${url}?page=${p}`, { waitUntil: "load" });
          await page.waitForFunction(() => !!document.documentElement.dataset.pages, null, { timeout: 30_000 });
          await page.evaluate(() => document.fonts.ready);
          const name = `${prefix}-${pad(p)}.jpg`;
          await page.screenshot({ path: join(outDir, name), type: "jpeg", quality: PAGE.quality, clip: { x: 0, y: 0, width: PAGE.width, height: PAGE.height } });
          names.push(name);
        }
        return names;
      } finally { await b.close().catch(() => {}); }
    },
  };
}

/** This machine's Chrome or Edge, for a build driven from Claude Code: the PDFs as build.mjs makes them, the page
 * images as Chrome's --screenshot writes them. Those are PNGs, so they keep the .png name and get_page_image says so. */
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
