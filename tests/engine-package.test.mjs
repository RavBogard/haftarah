// tests/engine-package.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, cp, readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { packEngine } from "../scripts/pack-engine.mjs";
import { buildWeek, findBrowser } from "../scripts/build.mjs";
import { dumpDom, printSignature } from "../scripts/chrome.mjs";
import { foldEol } from "../scripts/golden.mjs";
import { isolatedEnv } from "./helpers/isolatedEnv.mjs";

const golden = JSON.parse(await readFile(new URL("./golden/print.json", import.meta.url), "utf8"));
const DIST = fileURLToPath(new URL("../dist/", import.meta.url));
const distTmp = async () => { await mkdir(DIST, { recursive: true }); return mkdtemp(join(DIST, "engine-test-")); };   // packEngine writes only under dist/
const TEXT = /\.(html|css|js|json|txt)$/i;
const hashOf = (p, bytes) => TEXT.test(p) ? createHash("sha256").update(foldEol(bytes.toString("utf8")), "utf8").digest("hex") : createHash("sha256").update(bytes).digest("hex");

test("packEngine writes the engine's files byte-for-byte, with a package.json that exports them and a manifest of their hashes; every file the golden records is in it and unchanged", async () => {
  const out = await distTmp();
  try {
    const r = await packEngine(out);
    const pkg = JSON.parse(await readFile(join(out, "package.json"), "utf8"));
    assert.equal(pkg.name, "@haftarah/engine"); assert.equal(pkg.version, JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8")).version || "0.0.0"); assert.equal(pkg.dependencies, undefined);
    assert.equal(pkg.exports["."], "./lib.js"); assert.equal(pkg.exports["./render.js"], "./render.js"); assert.equal(pkg.exports["./fonts/*"], "./fonts/*");
    for (const [path, hash] of Object.entries(golden.sources.files)) {
      const packed = join(out, path.replace(/^template\//, ""));
      assert.equal(hashOf(path, await readFile(packed)), hash, `${path} as recorded by the golden`);
    }
    for (const f of ["lib.js", "render.js", "sheet.html", "sheet.css", "trope.css", "voices.json"]) assert.equal(hashOf(f, await readFile(join(out, f))), hashOf(f, await readFile(new URL("../template/" + f, import.meta.url))), f);
    const manifest = JSON.parse(await readFile(join(out, "MANIFEST.json"), "utf8"));
    assert.deepEqual(Object.keys(manifest.files).sort(), r.files.map(f => f.path).sort());
    assert.equal(manifest.files["voices.json"], hashOf("voices.json", await readFile(new URL("../template/voices.json", import.meta.url))));
    assert.ok((await readFile(join(out, "README.md"), "utf8")).includes("@haftarah/engine"));
  } finally { await rm(out, { recursive: true, force: true }); }
});

test("a sheet built from the package is the sheet built from the repo (HTML equal but for the template paths; the printed DOM identical in Chrome)", { timeout: 240_000 }, async () => {
  const out = await distTmp();
  const a = await mkdtemp(join(tmpdir(), "haftarah-wk-")), b = await mkdtemp(join(tmpdir(), "haftarah-wk-"));
  try {
    await packEngine(out);
    await cp(new URL("./fixtures/week-notes/", import.meta.url), a, { recursive: true });
    await cp(new URL("./fixtures/week-notes/", import.meta.url), b, { recursive: true });
    await buildWeek(a, { pdf: false, log: () => {}, warn: () => {} });
    await buildWeek(b, { pdf: false, templateDir: out, log: () => {}, warn: () => {} });
    const norm = (html, dir, tpl) => html.split(relative(dir, tpl).split(sep).join("/")).join("TEMPLATE");
    const repoTpl = new URL("../template", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
    assert.equal(norm(await readFile(join(b, "sheet.html"), "utf8"), b, out), norm(await readFile(join(a, "sheet.html"), "utf8"), a, repoTpl));
    const browser = findBrowser();
    if (!browser) return;   // the DOM comparison needs Chrome; the byte comparison above ran
    const { env, cleanup } = await isolatedEnv();
    try {
      const da = printSignature(await dumpDom(browser, pathToFileURL(join(a, "sheet.html")).href, { env }));
      const db = printSignature(await dumpDom(browser, pathToFileURL(join(b, "sheet.html")).href, { env }));
      assert.equal(db, da, "what prints from the package is what prints from the repo");
    } finally { await cleanup(); }
  } finally { for (const d of [out, a, b]) await rm(d, { recursive: true, force: true }); }
});

test("packEngine refuses an output folder outside dist/ and removes nothing", async () => {
  const root = new URL("../", import.meta.url), rootDir = fileURLToPath(root);
  for (const bad of [rootDir, join(rootDir, "scripts"), join(rootDir, "dist"), tmpdir()]) {
    await assert.rejects(packEngine(bad), /writes only under dist\//, bad);
  }
  assert.ok((await readdir(join(rootDir, "scripts"))).includes("pack-engine.mjs"));
  assert.ok((await readdir(join(rootDir, "template"))).includes("lib.js"));
});
