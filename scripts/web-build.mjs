#!/usr/bin/env node
/**
 * web-build.mjs — assemble the static site Vercel serves: site/ plus the pieces it shares with the
 * printed sheet (lib.js, trope.css, voices.json, the fonts, the mural). Week data is not here; the
 * site reads it from the Blob store through the /data/ rewrite in vercel.json.
 *
 *   node scripts/web-build.mjs [--out DIR]     # default site/dist
 */
import { cp, mkdir, rm, readdir, copyFile } from "node:fs/promises";
import { join, resolve, dirname, relative, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// relative() is case-insensitive on Windows, so these hold there too.
const same = (a, b) => relative(a, b) === "";
const inside = (p, dir) => { const r = relative(dir, p); return r !== "" && !r.startsWith("..") && !isAbsolute(r); };

/** The output folder is wiped first: only site/dist (or below it) or a folder wholly outside the repo. */
export function checkOut(out) {
  const dist = join(ROOT, "site", "dist");
  const ok = same(out, dist) || inside(out, dist) ||
    (!same(out, ROOT) && !inside(out, ROOT) && !inside(ROOT, out));
  if (!ok) throw new Error(`refusing to build into ${out}: it is emptied first, so it must be site/dist or a folder outside the repo (and not one that contains it)`);
  return out;
}

export async function buildSite({ out = join(ROOT, "site", "dist") } = {}) {
  out = checkOut(resolve(out));
  await rm(out, { recursive: true, force: true });
  await mkdir(join(out, "app"), { recursive: true });
  await mkdir(join(out, "fonts"), { recursive: true });
  await mkdir(join(out, "geo"), { recursive: true });
  const files = [];
  const site = join(ROOT, "site");
  for (const name of await readdir(site)) {
    if (name === "dist") continue;
    const src = join(site, name);
    await cp(src, join(out, name), { recursive: true });
    files.push(...await listFiles(join(out, name), out));
  }
  for (const [from, to] of [["template/lib.js", "lib.js"], ["template/trope.css", "trope.css"], ["template/voices.json", "voices.json"], ["assets/logo.png", "mural.png"], ["data/geo/basemap.json", "geo/basemap.json"], ["data/chronology.json", "geo/chronology.json"]]) {
    await copyFile(join(ROOT, from), join(out, to));
    files.push(to);
  }
  for (const name of await readdir(join(ROOT, "template", "fonts"))) {
    await copyFile(join(ROOT, "template", "fonts", name), join(out, "fonts", name));
    files.push(`fonts/${name}`);
  }
  return { out, files: files.sort() };
}

async function listFiles(p, base) {
  const { stat } = await import("node:fs/promises");
  if ((await stat(p)).isFile()) return [relative(base, p).split("\\").join("/")];
  const out = [];
  for (const n of await readdir(p)) out.push(...await listFiles(join(p, n), base));
  return out;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const i = process.argv.indexOf("--out");
  buildSite({ out: i > 0 ? process.argv[i + 1] : undefined })
    .then(r => console.log(`Built ${r.files.length} files into ${relative(ROOT, r.out) || r.out}`))
    .catch(err => { console.error(`web-build: ${err.message}`); process.exit(1); });
}
