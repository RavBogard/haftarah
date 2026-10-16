#!/usr/bin/env node
/**
 * make-icons.mjs — render the site's icons from the mural (assets/logo.png) with headless Chrome:
 * icon-192.png, icon-512.png and apple-touch-icon.png (180) show the mural's ring filling the square
 * on white; maskable-512.png keeps it inside the maskable safe zone (78% of the width) for Android's
 * shapes. Run once, commit site/icons/. Chrome cannot load a file from a data: page, so the page is
 * written to a temp folder beside a copy of the mural.
 *   node tools/make-icons.mjs
 */
import { mkdtemp, rm, copyFile, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { findBrowser } from "../scripts/build.mjs";
import { screenshot } from "../scripts/chrome.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ICONS = [["icon-192.png", 192, 0.94], ["icon-512.png", 512, 0.94], ["apple-touch-icon.png", 180, 0.94], ["maskable-512.png", 512, 0.78]];

/** Sized in pixels, not percent: headless Chrome lays a window under ~500px wide out wider and crops it. */
export function iconPage(px, scale) {
  const size = Math.round(px * scale), margin = Math.round((px - size) / 2);
  return `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:#ffffff}img{display:block;width:${size}px;height:${size}px;margin:${margin}px}</style></head><body><img src="mural.png"></body></html>`;
}

async function main() {
  const browser = findBrowser();
  if (!browser) throw new Error("No Chrome or Edge found (set HAFTARAH_BROWSER).");
  const dir = await mkdtemp(join(tmpdir(), "haftarah-icons-"));
  try {
    await copyFile(join(ROOT, "assets", "logo.png"), join(dir, "mural.png"));
    await mkdir(join(ROOT, "site", "icons"), { recursive: true });
    for (const [name, px, scale] of ICONS) {
      const page = join(dir, `${name}.html`);
      await writeFile(page, iconPage(px, scale));
      await screenshot(browser, pathToFileURL(page).href, { size: `${px},${px}`, out: join(ROOT, "site", "icons", name) });
      console.log(`wrote site/icons/${name} (${px}px)`);
    }
  } finally { await rm(dir, { recursive: true, force: true }); }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) main().catch(err => { console.error(`make-icons: ${err.message}`); process.exit(1); });
