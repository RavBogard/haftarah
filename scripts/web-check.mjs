#!/usr/bin/env node
/**
 * web-check.mjs — build the site, serve it with one week's data, open it in headless Chrome at a
 * desktop and a phone size, and assert what the pages report in their data-check-* attributes
 * (sheet.js and landing.js write them when the URL has ?check=1).
 *
 *   node scripts/web-check.mjs [weeks/<slug>]              # default: tests/fixtures/week-notes
 *   node scripts/web-check.mjs weeks/<slug> --serve        # just serve, for a look in a browser
 *   node scripts/web-check.mjs [weeks/<slug>] --out DIR    # build into DIR instead of site/dist (npm test does)
 */
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { join, resolve, basename, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildSite } from "./web-build.mjs";
import { indexEntry, cleanSheet } from "./publish.mjs";
import { findBrowser } from "./build.mjs";
import { dumpDom } from "./chrome.mjs";
import { isSlug, slugFromPath, dataUrl, indexUrl } from "../site/app/contract.js";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const MIME = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".json": "application/json", ".png": "image/png", ".ttf": "font/ttf", ".pdf": "application/pdf", ".txt": "text/plain" };

export async function serveSite({ dist, week, port = 0 }) {
  // The page only routes dated slugs; an undated folder (the fixture) is served under a made-up dated one.
  const name = basename(resolve(week));
  const slug = isSlug(name) ? name : `2026-01-01-${name}`;
  const sheet = cleanSheet(JSON.parse(await readFile(join(week, "sheet.json"), "utf8")));
  const index = { schema: 1, updated: new Date().toISOString(), weeks: [indexEntry(sheet, slug, new Date().toISOString())] };
  const server = createServer(async (req, res) => {
    const p = new URL(req.url, "http://x").pathname;
    const send = (code, type, body) => { res.writeHead(code, { "content-type": type }); res.end(body); };
    if (p === indexUrl()) return send(200, MIME[".json"], JSON.stringify(index));
    if (p === dataUrl(slug, "sheet.json")) return send(200, MIME[".json"], JSON.stringify(sheet));
    if (p.startsWith("/data/")) {
      // Read first, write headers after: a missing file (the fixture has no sheet.pdf) must be a 404, not a crash.
      try { return send(200, MIME[extname(p)] || "application/octet-stream", await readFile(join(week, basename(p)))); } catch { return send(404, "text/plain", "Not found"); }
    }
    let file = slugFromPath(p) ? join(dist, "sheet.html") : join(dist, p === "/" ? "index.html" : p);
    try { send(200, MIME[extname(file)] || "application/octet-stream", await readFile(file)); }
    catch { send(404, MIME[".html"], await readFile(join(dist, "404.html")).catch(() => "Not found")); }
  });
  await new Promise(r => server.listen(port, "127.0.0.1", r));
  return { server, slug, base: `http://127.0.0.1:${server.address().port}` };
}

// The values of --port and --out, and the week folder: the one argument that is neither a flag nor a flag's value.
export function parseArgs(args) {
  const valueAt = new Set();
  const opt = name => { const i = args.indexOf(name); if (i < 0) return null; valueAt.add(i + 1); return args[i + 1]; };
  const port = opt("--port"), out = opt("--out");
  const week = args.find((a, i) => !a.startsWith("--") && !valueAt.has(i)) || null;
  return { week, port: port == null ? null : Number(port), out, serve: args.includes("--serve") };
}

const attrs = dom => Object.fromEntries([...((dom.match(/<html[^>]*>/) || [""])[0]).matchAll(/\sdata-check-([a-z-]+)="([^"]*)"/g)].map(m => [m[1], m[2].replace(/&quot;/g, '"').replace(/&amp;/g, "&")]));

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const week = resolve(args.week || join(ROOT, "tests", "fixtures", "week-notes"));
  const port = args.port ?? (args.serve ? 8767 : 0);
  const { out: dist } = await buildSite(args.out ? { out: args.out } : {});
  const { server, slug, base } = await serveSite({ dist, week, port });
  if (args.serve) { console.log(`Serving ${slug}:\n  ${base}/\n  ${base}/${slug}\n  ${base}/${slug}?trope=1\nCtrl-C to stop.`); return; }
  const browser = findBrowser();
  if (!browser) { server.close(); console.error("No Chrome or Edge found (set HAFTARAH_BROWSER)."); process.exit(1); }
  const sheet = JSON.parse(await readFile(join(week, "sheet.json"), "utf8"));
  const failures = [];
  const expect = (name, ok, got) => { console.log(`${ok ? "ok  " : "FAIL"}  ${name}${ok ? "" : `  (got ${JSON.stringify(got)})`}`); if (!ok) failures.push(name); };
  try {
    for (const [label, size, wide] of [["desktop 1440x900", "1440,900", true], ["phone 390x844", "390,844", false]]) {
      const a = attrs(await dumpDom(browser, `${base}/${slug}?check=1`, { size }));
      // Headless Chrome enforces a minimum window width, so say what was actually measured.
      console.log(`\n${label} (measured viewport ${a.width || "?"}px): /${slug}`);
      expect("page finished", a.done === "1", a.done);
      expect("no script errors", a.errors === "0", a.errors);
      expect("verse count", Number(a.verses) === sheet.verses.length, a.verses);
      expect("key series present", (a.keys || "").length > 0 && /^a,b/.test(a.keys), a.keys);
      expect("Hebrew words are buttons", Number(a.words) > sheet.verses.length * 3, a.words);
      expect("wide layout detected", a.wide === String(wide), a.wide);
      if (wide) { expect("rail holds every verse", Number(a.rail) === sheet.verses.length, a.rail); expect("no inline details", Number(a.details) === 0, a.details); }
      else { expect("rail empty", Number(a.rail) === 0, a.rail); expect("inline details for verses with commentary", Number(a.details) > 0, a.details); }
      expect("rail holds the current verse", a["rail-current"] === (wide ? "true" : "n/a"), a["rail-current"]);
      if (wide) expect("rail scrolled to the current verse", Math.abs(Number(a["rail-offset"])) < 3, a["rail-offset"]);
      expect("empty verses show no summary", a["empty-summaries"] === "0", a["empty-summaries"]);
      const v = sheet.verses[Math.floor(sheet.verses.length * 2 / 3)];   // the row sheet.js runCheck scrolls to
      expect("masthead range after scrolling", (a.range || "").startsWith(`${sheet.haftarah.book} ${v.chapter}:${v.verse}`), a.range);
      expect("current verse marked", a.current === v.ref, a.current);
      expect("dark paper", a.paper === "rgb(18, 17, 16)", a.paper);
      expect("title", /·/.test(a.title || ""), a.title);
    }
    const l = attrs(await dumpDom(browser, `${base}/?check=1`, { size: "1440,900" }));
    console.log("\nlanding: /");
    expect("landing finished", l.done === "1", l.done);
    expect("landing errors", l.errors === "0", l.errors);
    expect("one week listed", l.weeks === "1", l.weeks);
    expect("hero is the week", l.hero === slug, l.hero);
  } finally { server.close(); }
  if (failures.length) { console.error(`\n${failures.length} check${failures.length === 1 ? "" : "s"} failed.`); process.exit(1); }
  console.log("\nAll web checks passed.");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch(err => { console.error(`web-check: ${err.message}`); process.exit(1); });
}
