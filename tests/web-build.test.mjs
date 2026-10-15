import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, stat, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildSite, checkOut } from "../scripts/web-build.mjs";

test("buildSite copies the site, lib, trope.css, voices, fonts and the mural", async () => {
  const out = await mkdtemp(join(tmpdir(), "site-"));
  const r = await buildSite({ out });
  for (const f of ["index.html", "sheet.html", "404.html", "web.css", "app/sheet.js", "app/landing.js", "app/settings.js", "app/present.js","app/analytics.js", "app/analytics-config.js", "app/storage.js","app/a11y.js","app/boot-sheet.js", "app/boot-landing.js","app/contract.js", "library.html", "app/library.js", "app/library-view.js","app/library-page.js", "app/boot-library.js", "app/parashot.js", "lib.js", "trope.css", "voices.json", "mural.png", "fonts/EzraSIL.ttf", "fonts/Literata[opsz,wght].ttf", "fonts/Literata-Italic[opsz,wght].ttf", "fonts/NotoSerifHebrew[wdth,wght].ttf", "fonts/OFL-literata.txt"]) {
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
