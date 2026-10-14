#!/usr/bin/env node
/**
 * web-build.mjs — assemble the static site Vercel serves: site/ plus the pieces it shares with the
 * printed sheet (lib.js, trope.css, voices.json, the fonts, the mural). Week data is not here; the
 * site reads it from the Blob store through the /data/ rewrite in vercel.json.
 *
 *   node scripts/web-build.mjs [--out DIR]     # default site/dist
 */
import { cp, mkdir, rm, readdir, copyFile } from "node:fs/promises";
import { join, resolve, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export async function buildSite({ out = join(ROOT, "site", "dist") } = {}) {
  out = resolve(out);
  await rm(out, { recursive: true, force: true });
  await mkdir(join(out, "app"), { recursive: true });
  await mkdir(join(out, "fonts"), { recursive: true });
  const files = [];
  const site = join(ROOT, "site");
  for (const name of await readdir(site)) {
    if (name === "dist") continue;
    const src = join(site, name);
    await cp(src, join(out, name), { recursive: true });
    files.push(...await listFiles(join(out, name), out));
  }
  for (const [from, to] of [["template/lib.js", "lib.js"], ["template/trope.css", "trope.css"], ["template/voices.json", "voices.json"], ["assets/logo.png", "mural.png"]]) {
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
