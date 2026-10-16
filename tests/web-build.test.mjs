import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, stat, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildSite, checkOut, precacheList, buildHash, fillWorker } from "../scripts/web-build.mjs";

test("buildSite copies the site, lib, trope.css, voices, fonts and the mural", async () => {
  const out = await mkdtemp(join(tmpdir(), "site-"));
  const r = await buildSite({ out });
  for (const f of ["index.html", "sheet.html", "404.html", "web.css", "app/sheet.js", "app/landing.js", "app/settings.js", "app/present.js","app/analytics.js", "app/analytics-config.js", "app/storage.js","app/a11y.js","app/boot-sheet.js", "app/boot-landing.js","app/contract.js", "library.html", "app/library.js", "app/library-view.js","app/library-page.js", "app/boot-library.js", "app/parashot.js", "app/figures.js", "geo/basemap.json", "geo/chronology.json", "lib.js", "trope.css", "voices.json", "mural.png", "fonts/EzraSIL.ttf", "fonts/Literata[opsz,wght].ttf", "fonts/Literata-Italic[opsz,wght].ttf", "fonts/NotoSerifHebrew[wdth,wght].ttf", "fonts/OFL-literata.txt", "sw.js", "manifest.webmanifest", "icons/icon-192.png"]) {
    assert.ok((await stat(join(out, f))).isFile(), f);
    assert.ok(r.files.includes(f), `${f} reported`);
  }
  assert.equal((await readFile(join(out, "lib.js"), "utf8")), await readFile(new URL("../template/lib.js", import.meta.url), "utf8"));
  await rm(out, { recursive: true, force: true });
});

test("buildSite --out: only site/dist or a folder outside the repo; ., site, template and ancestors are refused", async () => {
  const root = fileURLToPath(new URL("..", import.meta.url));
  const before = await readdir(root);
  for (const out of [root, join(root, "site"), join(root, "site", "app"), join(root, "template"), join(root, "scripts"), join(root, "..")]) {
    await assert.rejects(buildSite({ out }), /refusing to build into/, out);
  }
  assert.deepEqual(await readdir(root), before, "nothing deleted");
  assert.ok((await stat(join(root, "site", "app", "sheet.js"))).isFile());
  assert.ok((await stat(join(root, "template", "lib.js"))).isFile());
  assert.doesNotThrow(() => checkOut(join(root, "site", "dist")));
  assert.doesNotThrow(() => checkOut(join(root, "site", "dist", "sub")));
  assert.doesNotThrow(() => checkOut(join(tmpdir(), "site-out")));
});

test("precacheList: every shipped file but the worker and the licence texts, index.html as /", () => {
  assert.deepEqual(precacheList(["sw.js", "index.html", "app/a.js", "fonts/OFL-literata.txt", "web.css"]), ["/", "/app/a.js", "/web.css"]);
});

test("buildHash: 12 hex characters, independent of order, changed by one byte", () => {
  const a = [["a", Buffer.from("1")], ["b", Buffer.from("2")]];
  const h = buildHash(a);
  assert.match(h, /^[0-9a-f]{12}$/);
  assert.equal(buildHash([...a].reverse()), h);
  assert.notEqual(buildHash([["a", Buffer.from("1")], ["b", Buffer.from("3")]]), h);
});

test("fillWorker writes the build and the precache list, and refuses a worker without the lines", () => {
  const src = 'const BUILD = "dev";\nconst PRECACHE = /*precache*/[];\n';
  const filled = fillWorker(src, "abc123def456", ["/", "/web.css"]);
  assert.ok(filled.includes('const BUILD = "abc123def456";'), filled);
  assert.ok(filled.includes('const PRECACHE = ["/","/web.css"];'), filled);
  assert.throws(() => fillWorker('const PRECACHE = /*precache*/[];\n', "x", []), /BUILD or PRECACHE/);
  assert.throws(() => fillWorker('const BUILD = "dev";\n', "x", []), /BUILD or PRECACHE/);
});

test("buildSite writes the worker with its build hash and precache list; the hash is stable; the shell stays small", async () => {
  const one = await mkdtemp(join(tmpdir(), "site-"));
  const two = await mkdtemp(join(tmpdir(), "site-"));
  try {
    const r = await buildSite({ out: one });
    assert.match(r.build, /^[0-9a-f]{12}$/);
    const sw = await readFile(join(one, "sw.js"), "utf8");
    assert.ok(sw.includes(`const BUILD = "${r.build}"`), "the build hash is written");
    assert.ok(sw.includes(`const PRECACHE = ${JSON.stringify(r.precache)}`), "the precache list is written");
    for (const p of ["/", "/sheet.html", "/library.html", "/404.html", "/web.css", "/lib.js", "/app/sheet.js", "/fonts/EzraSIL.ttf", "/geo/basemap.json", "/mural.png", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/maskable-512.png"]) assert.ok(r.precache.includes(p), p);
    assert.ok(!r.precache.includes("/sw.js"));
    assert.ok(!r.precache.some(p => p.endsWith(".txt")), "no licence text");
    assert.equal((await buildSite({ out: two })).build, r.build, "the same sources give the same build");
    let bytes = 0;
    for (const p of r.precache) bytes += (await stat(join(one, p === "/" ? "index.html" : p.slice(1)))).size;
    assert.ok(bytes < 8 * 1024 * 1024, `the precached shell is ${bytes} bytes`);
  } finally {
    await rm(one, { recursive: true, force: true });
    await rm(two, { recursive: true, force: true });
  }
});
