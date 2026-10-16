#!/usr/bin/env node
/**
 * web-build.mjs — assemble the static site Vercel serves: site/ plus the pieces it shares with the
 * printed sheet (lib.js, trope.css, voices.json, the fonts, the mural). Week data is not here; the
 * site reads it from the Blob store through the /data/ rewrite in vercel.json.
 *
 *   node scripts/web-build.mjs [--out DIR]     # default site/dist
 */
import { cp, mkdir, rm, readdir, copyFile, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
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

/** The shell paths the worker holds: every output file but the worker itself and the licence texts; index.html is "/". */
export function precacheList(files) {
  return files.filter(f => f !== "sw.js" && !f.endsWith(".txt")).map(f => f === "index.html" ? "/" : `/${f}`).sort();
}

/** sha256 over [path, bytes] pairs in path order, the first 12 hex characters. */
export function buildHash(entries) {
  const h = createHash("sha256");
  for (const [path, bytes] of [...entries].sort((a, b) => a[0] < b[0] ? -1 : 1)) { h.update(path); h.update("\0"); h.update(bytes); h.update("\0"); }
  return h.digest("hex").slice(0, 12);
}

/** The worker with its build hash and precache list written in. */
export function fillWorker(source, build, precache) {
  const a = source.replace(/const BUILD = "[^"]*";/, () => `const BUILD = "${build}";`);
  const b = a.replace(/const PRECACHE = \/\*precache\*\/\[\];/, () => `const PRECACHE = ${JSON.stringify(precache)};`);
  if (a === source || b === a) throw new Error("sw.js: the BUILD or PRECACHE line to fill was not found");
  return b;
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
  files.sort();
  // The worker's build hash covers every other shipped file, so its shell cache turns over exactly when one changes.
  const entries = [];
  for (const f of files) if (f !== "sw.js") entries.push([f, await readFile(join(out, f))]);
  const build = buildHash(entries);
  const precache = precacheList(files);
  await writeFile(join(out, "sw.js"), fillWorker(await readFile(join(ROOT, "site", "sw.js"), "utf8"), build, precache));
  return { out, files, build, precache };
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
    .then(r => console.log(`Built ${r.files.length} files into ${relative(ROOT, r.out) || r.out} (build ${r.build})`))
    .catch(err => { console.error(`web-build: ${err.message}`); process.exit(1); });
}
