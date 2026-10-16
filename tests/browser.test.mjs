// check.mjs and web-check.mjs inside npm test. Both need Chrome or Edge; without one they are skipped
// with a message, never failed. Each works in its own temp folder, so it cannot collide with the
// print golden building the fixtures in place.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, copyFile, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { isolatedEnv } from "./helpers/isolatedEnv.mjs";
import { findBrowser } from "../scripts/build.mjs";
import { dumpDom } from "../scripts/chrome.mjs";
import { parseArgs } from "../scripts/web-check.mjs";
import { migrate3 } from "../scripts/migrate.mjs";
import { makeWeekTorah } from "./helpers/makeWeekTorah.mjs";

const run = promisify(execFile);
const ROOT = fileURLToPath(new URL("..", import.meta.url));
const skip = findBrowser() ? false : "no Chrome or Edge on this machine (set HAFTARAH_BROWSER to run the browser checks)";

test("web-check parseArgs: the week is the one argument that is neither a flag nor a flag's value", () => {
  assert.deepEqual(parseArgs([]), { week: null, port: null, out: null, serve: false });
  assert.deepEqual(parseArgs(["--out", "/tmp/d", "weeks/x"]), { week: "weeks/x", port: null, out: "/tmp/d", serve: false });
  assert.deepEqual(parseArgs(["weeks/x", "--serve", "--port", "9000"]), { week: "weeks/x", port: 9000, out: null, serve: true });
});

for (const name of ["week-min", "week-notes", "week-figures"]) {
  test(`check.mjs passes on ${name}`, { skip, timeout: 240_000 }, async () => {
    const iso = await isolatedEnv();
    try {
      const dir = join(iso.home, name);
      await mkdir(dir);
      await copyFile(join(ROOT, "tests", "fixtures", name, "sheet.json"), join(dir, "sheet.json"));
      await run(process.execPath, [join(ROOT, "scripts", "build.mjs"), dir, "--no-pdf"], { env: iso.env, cwd: ROOT, maxBuffer: 1 << 24 });
      const { stdout } = await run(process.execPath, [join(ROOT, "scripts", "check.mjs"), dir], { env: iso.env, cwd: ROOT, maxBuffer: 1 << 24 });
      assert.match(stdout, /Check passed\./);
      assert.match(stdout, name === "week-figures" ? /figures: front/ : /figures: none/);
    } finally { await iso.cleanup(); }
  });
}

test("a long setting sends the figures to page 2 and check passes", { skip, timeout: 240_000 }, async () => {
  const iso = await isolatedEnv();
  try {
    const dir = join(iso.home, "week-figures-long");
    await mkdir(dir);
    const fig = JSON.parse(await readFile(join(ROOT, "tests", "fixtures", "week-figures", "sheet.json"), "utf8"));
    const notes = JSON.parse(await readFile(join(ROOT, "tests", "fixtures", "week-notes", "sheet.json"), "utf8"));
    fig.openingNote.setting = [...notes.openingNote.setting, notes.openingNote.setting[0]];   // three paragraphs: page 1 cannot hold them and the figures
    await writeFile(join(dir, "sheet.json"), JSON.stringify(fig));
    await run(process.execPath, [join(ROOT, "scripts", "build.mjs"), dir, "--no-pdf"], { env: iso.env, cwd: ROOT, maxBuffer: 1 << 24 });
    const { stdout } = await run(process.execPath, [join(ROOT, "scripts", "check.mjs"), dir], { env: iso.env, cwd: ROOT, maxBuffer: 1 << 24 });
    assert.match(stdout, /figures: page2/);
    assert.match(stdout, /Check passed\./);
  } finally { await iso.cleanup(); }
});

// A probe loaded after render.js waits for the layout, then stamps on <html> every page's inline end
// matter box and margin-note boxes, and the pairs that meet.
const PROBE = `(function poll() {
  if (!document.documentElement.dataset.pages) return setTimeout(poll, 50);
  const box = n => { const r = n.getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom]; };
  const meet = (a, b) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
  const out = { inline: 0, notesOnEndPage: 0, overlaps: [] };
  document.querySelectorAll("section.page").forEach((pg, i) => {
    const em = pg.querySelector(".endmatter.inline");
    if (!em) return;
    out.inline++;
    const e = box(em);
    pg.querySelectorAll(".margin-col .note").forEach(n => {
      out.notesOnEndPage++;
      const b = box(n);
      if (meet(e, b)) out.overlaps.push({ page: i + 1, note: n.querySelector(".k")?.textContent || "", note_box: b.map(Math.round), endmatter: e.map(Math.round) });
    });
  });
  document.documentElement.dataset.probe = JSON.stringify(out);
})();`;

test("week-figures: no margin note meets the inline end matter", { skip, timeout: 240_000 }, async () => {
  const iso = await isolatedEnv();
  try {
    const dir = join(iso.home, "week-figures-probe");
    await mkdir(dir);
    await copyFile(join(ROOT, "tests", "fixtures", "week-figures", "sheet.json"), join(dir, "sheet.json"));
    await run(process.execPath, [join(ROOT, "scripts", "build.mjs"), dir, "--no-pdf"], { env: iso.env, cwd: ROOT, maxBuffer: 1 << 24 });
    const html = await readFile(join(dir, "sheet.html"), "utf8");
    await writeFile(join(dir, "probe.js"), PROBE);
    await writeFile(join(dir, "probe.html"), html.replace("</head>", '<script src="probe.js" defer></script>\n</head>'));
    const dom = await dumpDom(findBrowser(), pathToFileURL(join(dir, "probe.html")).href, { env: iso.env });
    const m = /data-probe="([^"]*)"/.exec(dom);
    assert.ok(m, "the probe ran");
    const got = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, "&"));
    assert.ok(got.inline >= 1 && got.notesOnEndPage > 0, "the end matter is inline on a page that carries margin notes (the case under test)");
    assert.deepEqual(got.overlaps, [], JSON.stringify(got.overlaps));
  } finally { await iso.cleanup(); }
});

test("web-check passes at desktop and phone widths",{ skip, timeout: 300_000 }, async () => {
  const iso = await isolatedEnv();
  try {
    const { stdout } = await run(process.execPath, [join(ROOT, "scripts", "web-check.mjs"), "--out", join(iso.home, "dist")], { env: iso.env, cwd: ROOT, maxBuffer: 1 << 24 });
    assert.match(stdout, /ok {2,}a week without figures shows none/);
    assert.match(stdout, /All web checks passed\./);
  } finally { await iso.cleanup(); }
});

test("web-check passes on week-figures (the figures path)", { skip, timeout: 300_000 }, async () => {
  const iso = await isolatedEnv();
  try {
    const { stdout } = await run(process.execPath, [join(ROOT, "scripts", "web-check.mjs"), join(ROOT, "tests", "fixtures", "week-figures"), "--out", join(iso.home, "dist")], { env: iso.env, cwd: ROOT, maxBuffer: 1 << 24 });
    for (const line of ["the figures are drawn", "every place is on the map", "the map is described", "the figures are labelled images", "the footer credits the map and the dates"])
      assert.match(stdout, new RegExp(`ok {2,}${line}`));
    assert.match(stdout, /All web checks passed\./);
  } finally { await iso.cleanup(); }
});

test("web-check passes on a timeline-only copy of week-figures (no map, no basemap fetched)", { skip, timeout: 300_000 }, async () => {
  const iso = await isolatedEnv();
  try {
    const dir = join(iso.home, "week-figures-timeline");
    await mkdir(dir);
    const week = JSON.parse(await readFile(join(ROOT, "tests", "fixtures", "week-figures", "sheet.json"), "utf8"));
    delete week.places; delete week.mapRegion;
    await writeFile(join(dir, "sheet.json"), JSON.stringify(week, null, 2));
    const { stdout } = await run(process.execPath, [join(ROOT, "scripts", "web-check.mjs"), dir, "--out", join(iso.home, "dist")], { env: iso.env, cwd: ROOT, maxBuffer: 1 << 24 });
    assert.match(stdout, /ok {2,}the figures are drawn/);
    assert.match(stdout, /ok {2,}the footer credits the dates/);
    assert.match(stdout, /All web checks passed\./);
  } finally { await iso.cleanup(); }
});

test("web-check passes on a schema-3 copy of week-notes (the browser path, not just Node)", { skip, timeout: 300_000 }, async () => {
  const iso = await isolatedEnv();
  try {
    const dir = join(iso.home, "week-notes-s3");
    await mkdir(dir);
    const two = JSON.parse(await readFile(join(ROOT, "tests", "fixtures", "week-notes", "sheet.json"), "utf8"));
    await writeFile(join(dir, "sheet.json"), JSON.stringify(migrate3(two), null, 2));
    const { stdout } = await run(process.execPath, [join(ROOT, "scripts", "web-check.mjs"), dir, "--out", join(iso.home, "dist")], { env: iso.env, cwd: ROOT, maxBuffer: 1 << 24 });
    assert.match(stdout, /All web checks passed\./);
  } finally { await iso.cleanup(); }
});

test("check.mjs passes on week-torah: both sheets", { skip, timeout: 300_000 }, async () => {
  const iso = await isolatedEnv();
  try {
    const dir = join(iso.home, "week-torah");
    await mkdir(dir);
    await copyFile(join(ROOT, "tests", "fixtures", "week-torah", "sheet.json"), join(dir, "sheet.json"));
    await run(process.execPath, [join(ROOT, "scripts", "build.mjs"), dir, "--no-pdf"], { env: iso.env, cwd: ROOT, maxBuffer: 1 << 24 });
    const { stdout } = await run(process.execPath, [join(ROOT, "scripts", "check.mjs"), dir], { env: iso.env, cwd: ROOT, maxBuffer: 1 << 24 });
    assert.match(stdout, /Torah: sheet-torah\.html/);
    assert.match(stdout, /Haftarah: sheet\.html/);
    assert.match(stdout, /Check passed\./);
  } finally { await iso.cleanup(); }
});

test("web-check passes on a two-reading week (Torah first), with a Last time link", { skip, timeout: 300_000 }, async () => {
  const iso = await isolatedEnv();
  try {
    const dir = join(iso.home, "week-notes-torah");
    await mkdir(dir);
    const two = makeWeekTorah(JSON.parse(await readFile(join(ROOT, "tests", "fixtures", "week-notes", "sheet.json"), "utf8")));
    two.prior = { slug: "2025-10-04-bereshit-machar-chodesh", hebrewEn: "10 Tishrei 5786", cycle: "5786" };
    await writeFile(join(dir, "sheet.json"), JSON.stringify(two, null, 2));
    // JPS 1985 for the haftarah only: the Torah reading keeps JPS 2023 and says so under its heading.
    await copyFile(join(ROOT, "tests", "fixtures", "week-notes", "translations.json"), join(dir, "translations.json"));
    const { stdout } = await run(process.execPath, [join(ROOT, "scripts", "web-check.mjs"), dir, "--out", join(iso.home, "dist")], { env: iso.env, cwd: ROOT, maxBuffer: 1 << 24 });
    assert.match(stdout, /ok {2,}a reading without the edition says it shows JPS 2023/);
    assert.match(stdout, /ok {2,}a heading per reading/);
    assert.match(stdout, /ok {2,}the Last time link goes to last year's sheet/);
    assert.match(stdout, /ok {2,}rows carry the reading in their id/);
    assert.match(stdout, /All web checks passed\./);
  } finally { await iso.cleanup(); }
});
