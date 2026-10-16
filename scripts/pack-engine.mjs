#!/usr/bin/env node
/**
 * pack-engine.mjs — the engine (spec 3.1) as a dependency-free package the B'nei Mitzvah portal can install:
 * lib.js, render.js, the stylesheets, the page template, voices.json and the fonts, copied byte for byte from
 * template/ into dist/engine/ with a package.json, a README and a manifest of hashes. The repo's template
 * stays the source; this folder is its build output (git-ignored). The test proves a sheet built from the
 * package prints exactly what the repo prints.
 *
 *   node scripts/pack-engine.mjs [--out dist/engine] [--version x.y.z]  (default: package.json version)
 */
import { cp, mkdir, rm, readFile, writeFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join, resolve, relative, dirname, sep, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const ENGINE_FILES = ["lib.js", "render.js", "sheet.html", "sheet.css", "trope.css", "voices.json"];

// MANIFEST hashes: text with line endings folded to LF (as scripts/golden.mjs folds sources), so a CRLF and an LF checkout agree; fonts raw.
const TEXT = /\.(html|css|js|json|md|txt)$/i;
const hashBytes = (p, bytes) => createHash("sha256").update(TEXT.test(p) ? Buffer.from(bytes.toString("utf8").replace(/\r\n/g, "\n"), "utf8") : bytes).digest("hex");

export async function packEngine(out, { root = ROOT, version } = {}) {
  // The output folder is removed before it is written: only a folder inside <root>/dist/ may be.
  const rel = relative(resolve(root, "dist"), resolve(out));
  if (!rel || rel.startsWith("..") || isAbsolute(rel)) throw new Error("pack-engine writes only under dist/");
  if (!version) version = JSON.parse(await readFile(join(root, "package.json"), "utf8").catch(() => "{}")).version || "0.0.0";   // the repo's own version
  await rm(out, { recursive: true, force: true });
  await mkdir(out, { recursive: true });
  for (const f of ENGINE_FILES) await cp(join(root, "template", f), join(out, f));
  await cp(join(root, "template", "fonts"), join(out, "fonts"), { recursive: true });
  const walk = async dir => (await Promise.all((await readdir(dir, { withFileTypes: true })).map(e => e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]))).flat();
  const files = [];
  for (const p of (await walk(out)).sort()) files.push({ path: relative(out, p).split("\\").join("/"), sha256: hashBytes(p, await readFile(p)) });
  const pkg = {
    name: "@haftarah/engine", version, private: false,
    description: "The haftarah sheet engine: the data model and its accessors, keys, divine name, trope phrases, the sheet model, the print paginator, the page template, stylesheets and fonts. Dependency-free; a UMD lib.js for Node and the browser.",
    main: "lib.js",
    exports: { ".": "./lib.js", "./render.js": "./render.js", "./sheet.html": "./sheet.html", "./sheet.css": "./sheet.css", "./trope.css": "./trope.css", "./voices.json": "./voices.json", "./fonts/*": "./fonts/*", "./package.json": "./package.json" },
    files: ["lib.js", "render.js", "sheet.html", "sheet.css", "trope.css", "voices.json", "fonts", "MANIFEST.json", "README.md"],
    engines: { node: ">=18" },
    repository: { type: "git", url: "https://github.com/RavBogard/haftarah", directory: "template" },
  };
  await writeFile(join(out, "package.json"), JSON.stringify(pkg, null, 2) + "\n");
  const manifest = { version, source: "template/", versionFrom: "package.json", hashes: "sha256; text files with CRLF folded to LF, fonts raw", files: Object.fromEntries(files.map(f => [f.path, f.sha256])) };
  await writeFile(join(out, "MANIFEST.json"), JSON.stringify(manifest, null, 2) + "\n");
  await writeFile(join(out, "README.md"), `# @haftarah/engine ${version}\n\nThe engine of the weekly haftarah and Torah study sheet, copied byte for byte from \`template/\` in RavBogard/haftarah by \`scripts/pack-engine.mjs\`. \`lib.js\` is a UMD module (Node and browser) exporting the data model's accessors (\`readings\`, \`primaryReading\`, \`readingView\`), ids (\`entryId\`, \`assignEntryIds\`), the divine name, trope phrases, keys, the sheet model, the map and timeline drawings and the rest; \`render.js\` paginates \`sheet.html\` in a browser; \`sheet.css\` and \`trope.css\` style it; \`voices.json\` names the sources; \`fonts/\` are self-hosted (Literata and Noto Serif Hebrew under the SIL Open Font License, Ezra SIL likewise). A sheet built from this package prints exactly what the repo prints: the repo's print golden guards the bytes, and \`tests/engine-package.test.mjs\` proves the equality. Hashes of every file are in MANIFEST.json (text files hashed with CRLF folded to LF, fonts raw).\n`);
  return { dir: out, files, manifest };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i < 0 ? d : process.argv[i + 1]; };
  const out = resolve(arg("out", join(ROOT, "dist", "engine")));
  packEngine(out, { version: arg("version", undefined) }).then(r => console.log(`Wrote ${relative(ROOT, r.dir)}: ${r.files.length} files`)).catch(err => { console.error(err.message || err); process.exit(1); });
}
