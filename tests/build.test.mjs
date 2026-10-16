import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, mkdir, copyFile, writeFile, mkdtemp, rm, cp } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join, relative, basename, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { isolatedEnv } from "./helpers/isolatedEnv.mjs";
import { readingsToBuild, torahColophonData, haftarahColophonData, buildWeek, BuildRefused, browserRecord } from "../scripts/build.mjs";
import { makeWeekTorah } from "./helpers/makeWeekTorah.mjs";

const run = promisify(execFile);
const load = async f => JSON.parse(await readFile(new URL(`./fixtures/${f}/sheet.json`, import.meta.url), "utf8"));

test("the week-torah fixture is makeWeekTorah(week-min): it carries no text of its own", async () => {
  assert.deepEqual(await load("week-torah"), makeWeekTorah(await load("week-min")));
});

test("readingsToBuild: every reading with verses, Torah first; --reading narrows; a missing one is an error", async () => {
  const min = await load("week-min"), two = await load("week-torah");
  assert.deepEqual(readingsToBuild(min), [{ id: "haftarah", kind: "haftarah" }]);
  assert.deepEqual(readingsToBuild(two), [{ id: "torah", kind: "torah" }, { id: "haftarah", kind: "haftarah" }]);
  assert.deepEqual(readingsToBuild(two, "torah"), [{ id: "torah", kind: "torah" }]);
  assert.deepEqual(readingsToBuild(two, "haftarah"), [{ id: "haftarah", kind: "haftarah" }]);
  assert.throws(() => readingsToBuild(min, "torah"), /this sheet has no torah reading with verses/);
});

test("check.mjs targets: every reading, or the one --reading names; an unknown reading is refused; the messages read cleanly", async () => {
  const { checkTargets } = await import("../scripts/check.mjs");
  const min = await load("week-min"), two = await load("week-torah");
  assert.deepEqual(checkTargets(two).map(t => t.html), ["sheet-torah.html", "sheet.html"]);
  assert.deepEqual(checkTargets(two, { only: "torah" }).map(t => t.html), ["sheet-torah.html"]);
  assert.deepEqual(checkTargets(two, { trope: true }).map(t => t.html), ["sheet-trope.html"]);
  assert.throws(() => checkTargets(two, { only: "foo" }), /^Error: --reading takes torah or haftarah, not "foo"$/);
  assert.throws(() => checkTargets(two, { only: "" }), /^Error: --reading takes torah or haftarah$/);
  assert.throws(() => checkTargets(min, { only: "torah" }), /^Error: no torah reading with verses to check$/);
  assert.throws(() => checkTargets({ schema: 3, readings: [] }), /^Error: no reading with verses to check$/, "no double space");
});

test("render.js changes only behind the Torah option the haftarah build never passes", async () => {
  const src = await readFile(new URL("../template/render.js", import.meta.url), "utf8");
  const uses = src.match(/opts\.reading/g) || [];
  assert.equal(uses.length, 3);
  assert.equal((src.match(/opts\.reading === "torah"|opts\.reading !== "torah"/g) || []).length, 3);
});

test("torahColophonData: the Torah sheet's Next week names the Torah reading, and is dropped without one", async () => {
  const two = await load("week-torah");
  const view = { nextWeek: two.nextWeek, haftarah: {} };
  const t = torahColophonData(view);
  assert.equal(t.nextWeek.ref, "Genesis 6:9–11:32");
  assert.equal(t.nextWeek.shabbat, "Noach");
  assert.equal(view.nextWeek.ref, "Isaiah 54:1-55:5", "the haftarah's own data is not touched");
  assert.equal(torahColophonData({ nextWeek: { shabbat: "Noach", ref: "Isaiah 54:1-55:5" } }).nextWeek, null);
  assert.equal(torahColophonData({ nextWeek: null }).nextWeek, null);
  assert.equal(torahColophonData({}).nextWeek, null);
  assert.deepEqual(haftarahColophonData(view).nextWeek, { shabbat: "Noach", special: null, ref: "Isaiah 54:1-55:5", civilDisplay: "October 17, 2026", status: "approved" }, "no torahRef in the haftarah's page");
  const plain = { nextWeek: { shabbat: "Noach", ref: "x" } };
  assert.equal(haftarahColophonData(plain), plain);
});

// The figures' basemap and chronology ride in SHEET_OPTIONS only for a week that has figures, so a
// week without them builds the same page it always did.
test("build.mjs passes geo in the page options only when the week has figures", { timeout: 120_000 }, async () => {
  const iso = await isolatedEnv();
  try {
    const html = {};
    for (const name of ["week-min", "week-figures"]) {
      const dir = join(iso.home, name);
      await mkdir(dir);
      await copyFile(fileURLToPath(new URL(`./fixtures/${name}/sheet.json`, import.meta.url)), join(dir, "sheet.json"));
      await run(process.execPath, [fileURLToPath(new URL("../scripts/build.mjs", import.meta.url)), dir, "--no-pdf", "--trope"], { env: iso.env, cwd: fileURLToPath(new URL("..", import.meta.url)), maxBuffer: 1 << 24 });
      html[name] = { sheet: await readFile(join(dir, "sheet.html"), "utf8"), trope: await readFile(join(dir, "sheet-trope.html"), "utf8") };
    }
    assert.ok(!/"geo":/.test(html["week-min"].sheet) && !/"geo":/.test(html["week-min"].trope));
    assert.match(html["week-figures"].sheet, /"geo":\{"basemap"/);
    assert.match(html["week-figures"].trope, /"geo":\{"basemap"/);
  } finally { await iso.cleanup(); }
});

// The figures are the week's. A Torah-plus-haftarah week whose timeline cites McCarter (in I Samuel.md,
// not the Torah's Genesis.md) is checked once against both bibliographies, so both sheets build with the figures.
test("a two-reading week whose timeline cites the haftarah's bibliography builds both sheets with the figures", { timeout: 120_000 }, async () => {
  const iso = await isolatedEnv();
  try {
    const dir = join(iso.home, "week-torah-figures");
    await mkdir(dir);
    const two = await load("week-torah"), fig = await load("week-figures");
    assert.ok(fig.timeline.some(it => (it.works || []).includes("McCarter 1980")));
    await writeFile(join(dir, "sheet.json"), JSON.stringify({ ...two, places: fig.places, mapRegion: fig.mapRegion, timeline: fig.timeline }));
    const { stdout } = await run(process.execPath, [fileURLToPath(new URL("../scripts/build.mjs", import.meta.url)), dir, "--no-pdf"], { env: iso.env, cwd: fileURLToPath(new URL("..", import.meta.url)), maxBuffer: 1 << 24 });
    assert.match(stdout, /sheet-torah\.html/);
    for (const page of ["sheet.html", "sheet-torah.html"]) assert.match(await readFile(join(dir, page), "utf8"), /"geo":\{"basemap"/, page);
  } finally { await iso.cleanup(); }
});

const toPosix = p => p.split(sep).join("/");

test("buildWeek writes the HTML for every reading from the repo template and returns what it built; pdf false needs no browser", async () => {
  const dir = await mkdtemp(join(tmpdir(), "haftarah-build-"));
  try {
    await cp(new URL("./fixtures/week-torah/", import.meta.url), dir, { recursive: true });
    const lines = [];
    const r = await buildWeek(dir, { pdf: false, log: m => lines.push(m), warn: m => lines.push(m) });
    assert.deepEqual(r.builds.map(b => [b.kind, basename(b.html)]), [["torah", "sheet-torah.html"], ["haftarah", "sheet.html"]]);
    assert.equal(r.builds[0].pdf, null);
    const html = await readFile(r.builds[1].html, "utf8");
    assert.ok(/href="[^"]*template\/sheet\.css"/.test(html), "the HTML links the repo template by relative path");
    assert.ok(lines.some(l => l.startsWith("Wrote ") && l.includes("sheet.html")));
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("buildWeek refuses on a gate problem with BuildRefused naming it, and writes nothing", async () => {
  const dir = await mkdtemp(join(tmpdir(), "haftarah-build-"));
  try {
    await cp(new URL("./fixtures/week-min/", import.meta.url), dir, { recursive: true });
    const sheet = JSON.parse(await readFile(join(dir, "sheet.json"), "utf8"));
    sheet.commentary = [{ verse: 1, register: "traditional", source: "Rashi", text: "x" }];   // no sourceRef
    await writeFile(join(dir, "sheet.json"), JSON.stringify(sheet));
    await rm(join(dir, "sheet.html"), { force: true });
    await assert.rejects(buildWeek(dir, { pdf: false, log: () => {}, warn: () => {} }), err => err instanceof BuildRefused && /no Sefaria ref: 1 Rashi/.test(err.problems.join("\n")));
    assert.ok(!existsSync(join(dir, "sheet.html")));
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("buildWeek with templateDir links that folder instead of the repo's template", async () => {
  const dir = await mkdtemp(join(tmpdir(), "haftarah-build-"));
  const tpl = await mkdtemp(join(tmpdir(), "haftarah-tpl-"));
  try {
    await cp(new URL("./fixtures/week-min/", import.meta.url), dir, { recursive: true });
    await cp(new URL("../template/", import.meta.url), tpl, { recursive: true });
    const r = await buildWeek(dir, { pdf: false, templateDir: tpl, log: () => {}, warn: () => {} });
    const html = await readFile(r.builds[0].html, "utf8");
    assert.ok(html.includes(toPosix(relative(dir, join(tpl, "sheet.css")))), "the stylesheet path points into templateDir");
  } finally { await rm(dir, { recursive: true, force: true }); await rm(tpl, { recursive: true, force: true }); }
});

test("browserRecord, and pdf true with browser null: the no-browser line, HTML only", async () => {
  assert.deepEqual(browserRecord("/x/chrome", ["--a"]), { path: "/x/chrome", extraArgs: ["--a"] });
  assert.deepEqual(browserRecord("/x/chrome"), { path: "/x/chrome", extraArgs: [] });
  const dir = await mkdtemp(join(tmpdir(), "haftarah-build-"));
  try {
    await cp(new URL("./fixtures/week-min/", import.meta.url), dir, { recursive: true });
    const lines = [];
    const r = await buildWeek(dir, { pdf: true, browser: null, log: m => lines.push(m), warn: m => lines.push(m) });
    assert.equal(r.builds[0].pdf, null);
    assert.ok(lines.some(l => l.startsWith("No Chrome or Edge found.")));
  } finally { await rm(dir, { recursive: true, force: true }); }
});
