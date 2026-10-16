import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile, mkdtemp, rm, mkdir, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TOOLS, toolCtx, validateInput } from "../api/_lib/tools.mjs";
import { MemoryStore, writeJson, writeStatus, readStatus } from "../api/_lib/store.mjs";
import { configFrom } from "../api/_lib/env.mjs";
import { BuildRefused, browserRecord, findBrowser } from "../scripts/build.mjs";

const tool = name => TOOLS.find(t => t.name === name);
const call = (name, input, ctx) => { const p = validateInput(tool(name).inputSchema, input); if (p.length) throw new Error(p.join("; ")); return tool(name).handler(input, ctx); };
const torahWeek = JSON.parse(await readFile(new URL("./fixtures/week-torah/sheet.json", import.meta.url), "utf8"));
const config = configFrom({ PUBLIC_BASE_URL: "https://haftarah.test", HAFTARAH_AUTH_SECRET: "s".repeat(40), HAFTARAH_DROPBOX_URL: "https://script.google.com/macros/s/x/exec", HAFTARAH_DROPBOX_TOKEN: "dsecret", BLOB_READ_WRITE_TOKEN: "vercel_blob_rw_wOGdAqvPmTFjKrmY_p" });
const PDF = Buffer.from("%PDF-1.4\n1 0 obj<</Type/Page>>endobj\n");
// A build that writes what the real one would, without a browser.
const fakeBuild = async (dir, opts) => { const out = []; for (const r of torahWeek.readings) { const html = join(dir, r.kind === "torah" ? "sheet-torah.html" : "sheet.html"), pdf = join(dir, r.kind === "torah" ? "sheet-torah.pdf" : "sheet.pdf"); await writeFile(html, "<html data-pages=\"2\"></html>"); if (opts.browser) await writeFile(pdf, PDF); out.push({ id: r.id, kind: r.kind, html, pdf: opts.browser ? pdf : null, pages: opts.browser ? 2 : null, bytes: opts.browser ? PDF.length : null }); } return { builds: out, warnings: [{ where: "haftarah 54:1 Rashi", msg: "a warning" }] }; };
const fakeCheck = async () => ({ ok: true, readings: torahWeek.readings.map(r => ({ id: r.id, kind: r.kind, summary: { pages: 2 }, problems: [], diagnostics: [], page: [{ kind: "front" }, { kind: "body" }] })) });
// Like vercelLauncher's: it prints and dumps the DOM itself, and counts its closes.
const makeLauncher = () => { const l = { browser: browserRecord("/fake/chromium", ["--x"]), print: async () => { throw new Error("the fake build never prints"); }, dumpDom: async () => "", closed: 0, close: async () => { l.closed++; }, pages: async (url, outDir, count, prefix) => { await mkdir(outDir, { recursive: true }); const names = []; for (let p = 1; p <= count; p++) { const n = `${prefix}-${String(p).padStart(2, "0")}.jpg`; await writeFile(join(outDir, n), Buffer.from([0xff, 0xd8, 0xff])); names.push(n); } return names; } }; return l; };
const fakeLauncher = async () => makeLauncher();
async function ctxWith(over = {}) {
  const store = new MemoryStore(), workDir = await mkdtemp(join(tmpdir(), "haftarah-work-"));
  await writeJson(store, "weeks/2026-10-17-noach/sheet.json", torahWeek);
  await writeStatus(store, "2026-10-17-noach", { status: "drafting" });
  const ctx = toolCtx({ store, config, fetchImpl: async () => new Response("", { status: 404 }), now: () => new Date("2026-10-15T12:00:00Z"), log: () => {}, workDir, launcher: fakeLauncher, scripts: { buildWeek: fakeBuild, checkWeek: fakeCheck, deliver: async () => [], publish: async () => ({ urls: {}, page: "" }) }, ...over });
  return { ctx, store, workDir };
}

test("build_sheet builds every reading, checks, stores PDFs, HTML and page images, signs 24-hour draft links, sets status built, and reports per reading", async () => {
  const { ctx, store, workDir } = await ctxWith();
  try {
    const r = await call("build_sheet", { slug: "2026-10-17-noach" }, ctx);
    assert.deepEqual(r.gate, []); assert.equal(r.browser.ok, true); assert.equal(r.status, "built"); assert.equal(r.version, 2);
    assert.deepEqual(r.readings.map(x => [x.kind, x.pages, x.check.ok, x.images]), [["torah", 2, true, ["torah-01.jpg", "torah-02.jpg"]], ["haftarah", 2, true, ["haftarah-01.jpg", "haftarah-02.jpg"]]]);
    assert.ok(r.readings[1].pdfUrl.startsWith("https://haftarah.test/api/draft/2026-10-17-noach/sheet.pdf?exp="));
    assert.ok(r.readings[0].pdfUrl.includes("/sheet-torah.pdf?"));
    assert.deepEqual(r.lint.warnings, ["haftarah 54:1 Rashi: a warning"]);
    assert.ok(r.readings[1].entries.total >= 0);
    const stored = (await store.list("weeks/2026-10-17-noach/")).map(b => b.pathname.split("weeks/2026-10-17-noach/")[1]).sort();
    for (const f of ["sheet.pdf", "sheet-torah.pdf", "sheet.html", "sheet-torah.html", "pages/haftarah-01.jpg", "pages/torah-02.jpg"]) assert.ok(stored.includes(f), f);
    assert.equal((await readStatus(store, "2026-10-17-noach")).built, "2026-10-15T12:00:00Z");
  } finally { await rm(workDir, { recursive: true, force: true }); }
});

test("build_sheet: a refused gate reports the problems and builds nothing; a failed check leaves status drafting", async () => {
  const refused = await ctxWith({ scripts: { buildWeek: async () => { throw new BuildRefused(["no Sefaria ref: 54:1 Rashi"]); }, checkWeek: fakeCheck } });
  try {
    const r = await call("build_sheet", { slug: "2026-10-17-noach" }, refused.ctx);
    assert.deepEqual(r.gate, ["no Sefaria ref: 54:1 Rashi"]); assert.equal(r.status, "drafting"); assert.deepEqual(r.readings, []);
  } finally { await rm(refused.workDir, { recursive: true, force: true }); }
  const failing = await ctxWith({ scripts: { buildWeek: fakeBuild, checkWeek: async () => ({ ok: false, readings: [{ id: "haftarah", kind: "haftarah", summary: { pages: 3 }, problems: ["page 2 gap 140px over the 104px ceiling: trim 54:3 Radak by 12 words"], diagnostics: [], page: [] }] }) } });
  try {
    const r = await call("build_sheet", { slug: "2026-10-17-noach", reading: "haftarah" }, failing.ctx);
    assert.equal(r.status, "drafting"); assert.equal(r.readings[0].check.ok, false); assert.match(r.readings[0].check.problems[0], /trim 54:3 Radak/);
  } finally { await rm(failing.workDir, { recursive: true, force: true }); }
});

test("build_sheet whose launcher throws reports the failure in the result, still builds the HTML, and leaves status drafting", async () => {
  const { ctx, workDir } = await ctxWith({ launcher: async () => { throw new Error("the pack did not extract: ENOSPC"); } });
  try {
    const r = await call("build_sheet", { slug: "2026-10-17-noach" }, ctx);
    assert.equal(r.browser.ok, false); assert.match(r.browser.error, /ENOSPC/); assert.equal(r.status, "drafting");
    assert.deepEqual(r.readings.map(x => x.pdfUrl), [null, null]);
  } finally { await rm(workDir, { recursive: true, force: true }); }
});

test("get_page_image returns one JPEG as image content; a page not built is an error", async () => {
  const { ctx, store, workDir } = await ctxWith();
  try {
    await call("build_sheet", { slug: "2026-10-17-noach" }, ctx);
    const r = await call("get_page_image", { slug: "2026-10-17-noach", reading: "haftarah", page: 2 }, ctx);
    assert.equal(r.content[0].type, "text"); assert.match(r.content[0].text, /haftarah page 2 of 2/);
    assert.equal(r.content[1].type, "image"); assert.equal(r.content[1].mimeType, "image/jpeg"); assert.equal(r.content[1].data, Buffer.from([0xff, 0xd8, 0xff]).toString("base64"));
    await assert.rejects(call("get_page_image", { slug: "2026-10-17-noach", reading: "haftarah", page: 7 }, ctx), /no page 7 .* run build_sheet/);
    // The transport's size guard counts text only, so the tool refuses an image too large for the client, naming its size.
    await store.put("weeks/2026-10-17-noach/pages/haftarah-02.jpg", Buffer.alloc(1_200_000, 0xff), "image/jpeg");
    await assert.rejects(call("get_page_image", { slug: "2026-10-17-noach", reading: "haftarah", page: 2 }, ctx), /haftarah page 2 is 1172 KB.*too large/);
  } finally { await rm(workDir, { recursive: true, force: true }); }
});

test("deliver_week refuses a week whose status is not built; dryRun lists the plan; a real run delivers through the scripts with the server's credentials and marks the week delivered", async () => {
  const seen = {};
  // Like the real deliver, the fake hands the web half to publishImpl last.
  const { ctx, store, workDir } = await ctxWith({ scripts: { buildWeek: fakeBuild, checkWeek: fakeCheck, deliver: async (dir, opts) => { Object.assign(seen, opts); opts.log("public   2026-10-17 Noach Haftarah — Isaiah 54.1-55.5.pdf  420 KB  sha256 ok  https://drive.example/f"); if (opts.webConfig && !opts.dryRun) await opts.publishImpl(dir, { config: opts.webConfig, log: opts.log, side: opts.side, cache: opts.cache, customs: opts.customs }); return [{ target: "public" }]; }, publish: async (dir, opts) => { opts.log("web      weeks/2026-10-17-noach/sheet.json"); return { urls: {}, page: "https://haftarah.test/2026-10-17-noach" }; } } });
  try {
    await assert.rejects(call("deliver_week", { slug: "2026-10-17-noach" }, ctx), /is drafting; build_sheet first/);
    await call("build_sheet", { slug: "2026-10-17-noach" }, ctx);
    const dry = await call("deliver_week", { slug: "2026-10-17-noach", dryRun: true }, ctx);
    assert.equal(dry.dryRun, true); assert.ok(Array.isArray(dry.lines)); assert.equal((await readStatus(store, "2026-10-17-noach")).status, "built");
    const r = await call("deliver_week", { slug: "2026-10-17-noach" }, ctx);
    assert.equal(r.status, "delivered"); assert.equal(r.page, "https://haftarah.test/2026-10-17-noach");
    assert.ok(r.lines.some(l => l.startsWith("public")) && r.lines.some(l => l.startsWith("web")));
    assert.deepEqual(seen.config, { url: "https://script.google.com/macros/s/x/exec", token: "dsecret" });
    assert.equal(seen.webConfig.token, "vercel_blob_rw_wOGdAqvPmTFjKrmY_p"); assert.equal(seen.cache, config.cacheDir); assert.equal(seen.side, true);
    assert.ok(!JSON.stringify(r).includes("dsecret") && !JSON.stringify(r).includes("script.google.com"));
    const noWeb = await ctxWith({ config: configFrom({ PUBLIC_BASE_URL: "https://haftarah.test", HAFTARAH_AUTH_SECRET: "s".repeat(40) }) });
    await assert.rejects(call("deliver_week", { slug: "2026-10-17-noach", dryRun: true }, noWeb.ctx), /drop box is not configured/);
    await rm(noWeb.workDir, { recursive: true, force: true });
  } finally { await rm(workDir, { recursive: true, force: true }); }
});

test("deliver_week whose deliver fails part-way keeps the lines already done, names the error, and leaves the week built", async () => {
  const { ctx, store, workDir } = await ctxWith();
  try {
    await call("build_sheet", { slug: "2026-10-17-noach" }, ctx);
    ctx.scripts.deliver = async (dir, opts) => { opts.log("public   2026-10-17 Noach Haftarah — Isaiah 54.1-55.5.pdf  420 KB  sha256 ok  https://drive.example/f"); throw new Error("web: the side files did not build"); };
    const r = await call("deliver_week", { slug: "2026-10-17-noach" }, ctx);
    assert.equal(r.isError, true);
    const body = JSON.parse(r.content[0].text);
    assert.equal(body.delivered, false); assert.equal(body.status, "built"); assert.match(body.error, /side files did not build/);
    assert.deepEqual(body.lines.map(l => l.split(" ")[0]), ["public"]);
    assert.equal((await readStatus(store, "2026-10-17-noach")).status, "built");
    assert.ok(!r.content[0].text.includes("dsecret"));
  } finally { await rm(workDir, { recursive: true, force: true }); }
});

test("build_sheet: a sheet saved during the build keeps the status the save left, and the result says build again", async () => {
  const { ctx, store, workDir } = await ctxWith();
  try {
    ctx.scripts.buildWeek = async (dir, opts) => { await writeStatus(store, "2026-10-17-noach", { status: "drafting" }); return fakeBuild(dir, opts); };
    const r = await call("build_sheet", { slug: "2026-10-17-noach" }, ctx);
    assert.equal(r.status, "drafting"); assert.equal(r.version, 2); assert.match(r.note, /changed during the build.*build again/);
    const st = await readStatus(store, "2026-10-17-noach");
    assert.equal(st.status, "drafting"); assert.equal(st.version, 2); assert.equal(st.built, null);
  } finally { await rm(workDir, { recursive: true, force: true }); }
});

test("build_sheet of one reading of a two-reading week leaves it drafting even when that reading passes", async () => {
  const { ctx, workDir } = await ctxWith();
  try {
    const r = await call("build_sheet", { slug: "2026-10-17-noach", reading: "haftarah" }, ctx);
    assert.deepEqual(r.readings.map(x => [x.kind, x.check.ok]), [["haftarah", true]]);
    assert.equal(r.status, "drafting");
  } finally { await rm(workDir, { recursive: true, force: true }); }
});

test("build_sheet with trope: the chanter's copy is checked on its own and gates built", async () => {
  const withTrope = async (dir, opts) => { const b = await fakeBuild(dir, opts); const html = join(dir, "sheet-trope.html"), pdf = join(dir, "sheet-trope.pdf"); await writeFile(html, "<html></html>"); await writeFile(pdf, PDF); return { ...b, trope: { html, pdf, pages: 3, bytes: PDF.length } }; };
  const tropeCheck = ok => async (dir, opts) => opts.trope ? { ok, readings: [{ id: "haftarah", kind: "haftarah", summary: { pages: 3 }, problems: ok ? [] : ["page 3 gap over the ceiling"], diagnostics: [], page: [] }] } : fakeCheck();
  const failing = await ctxWith({ scripts: { buildWeek: withTrope, checkWeek: tropeCheck(false) } });
  try {
    const r = await call("build_sheet", { slug: "2026-10-17-noach", trope: true }, failing.ctx);
    assert.ok(r.readings.every(x => x.check.ok), "the study sheets are checked without trope");
    assert.equal(r.trope.check.ok, false); assert.equal(r.trope.pages, 3); assert.ok(r.trope.pdfUrl.includes("/sheet-trope.pdf?"));
    assert.equal(r.status, "drafting");
    assert.ok(await failing.store.get("weeks/2026-10-17-noach/sheet-trope.pdf"));
  } finally { await rm(failing.workDir, { recursive: true, force: true }); }
  const passing = await ctxWith({ scripts: { buildWeek: withTrope, checkWeek: tropeCheck(true) } });
  try {
    const r = await call("build_sheet", { slug: "2026-10-17-noach", trope: true }, passing.ctx);
    assert.equal(r.trope.check.ok, true); assert.equal(r.status, "built");
  } finally { await rm(passing.workDir, { recursive: true, force: true }); }
});

test("get_page_image follows the page list of the latest build, not a longer listing left by an earlier one", async () => {
  const { ctx, store, workDir } = await ctxWith();
  try {
    await store.put("weeks/2026-10-17-noach/pages/haftarah-03.jpg", Buffer.from([0xff, 0xd8, 0xff, 0x03]), "image/jpeg");
    await call("build_sheet", { slug: "2026-10-17-noach" }, ctx);
    await assert.rejects(call("get_page_image", { slug: "2026-10-17-noach", reading: "haftarah", page: 3 }, ctx), /no page 3 of the haftarah .*\(2 built\)/);
    assert.match((await call("get_page_image", { slug: "2026-10-17-noach", reading: "haftarah", page: 2 }, ctx)).content[0].text, /page 2 of 2/);
  } finally { await rm(workDir, { recursive: true, force: true }); }
});

test("build_sheet: page images that fail are reported per reading and the PDFs are still stored; a check that throws is \"not checked\"", async () => {
  const noImages = await ctxWith({ launcher: async () => ({ ...(await fakeLauncher()), pages: async () => { throw new Error("page.goto: Timeout 30000ms"); } }) });
  try {
    const r = await call("build_sheet", { slug: "2026-10-17-noach" }, noImages.ctx);
    assert.ok(r.readings.every(x => /Timeout 30000ms/.test(x.imageError) && x.images.length === 0));
    for (const f of ["sheet.pdf", "sheet-torah.pdf"]) assert.ok(await noImages.store.get(`weeks/2026-10-17-noach/${f}`), f);
  } finally { await rm(noImages.workDir, { recursive: true, force: true }); }
  const noCheck = await ctxWith({ scripts: { buildWeek: fakeBuild, checkWeek: async () => { throw new Error("dump-dom exited 1"); } } });
  try {
    const r = await call("build_sheet", { slug: "2026-10-17-noach" }, noCheck.ctx);
    assert.ok(r.readings.every(x => x.check.ok === false && x.check.problems[0] === "not checked: dump-dom exited 1"));
    assert.equal(r.status, "drafting");
  } finally { await rm(noCheck.workDir, { recursive: true, force: true }); }
});

test("the tools leave no week folder behind in the work folder", async () => {
  const { ctx, workDir } = await ctxWith();
  try {
    await call("build_sheet", { slug: "2026-10-17-noach" }, ctx);
    await call("deliver_week", { slug: "2026-10-17-noach", dryRun: true }, ctx);
    assert.deepEqual(await readdir(workDir), []);
  } finally { await rm(workDir, { recursive: true, force: true }); }
});

test("build_sheet hands the launcher's print to buildWeek and its dumpDom to checkWeek, and closes the launcher once, a failed build included", async () => {
  const l = makeLauncher(), seen = {};
  const { ctx, workDir } = await ctxWith({ launcher: async () => l, scripts: { buildWeek: async (dir, opts) => { seen.build = opts; return fakeBuild(dir, opts); }, checkWeek: async (dir, opts) => { seen.check = opts; return fakeCheck(); } } });
  try {
    const r = await call("build_sheet", { slug: "2026-10-17-noach" }, ctx);
    assert.equal(r.status, "built");
    assert.equal(seen.build.printImpl, l.print); assert.equal(seen.check.dumpDomImpl, l.dumpDom); assert.equal(l.closed, 1);
    const l2 = makeLauncher();
    ctx.launcher = async () => l2;
    ctx.scripts.buildWeek = async () => { throw new Error("page.pdf timed out after 120 s"); };
    await assert.rejects(call("build_sheet", { slug: "2026-10-17-noach" }, ctx), /page\.pdf timed out/);
    assert.equal(l2.closed, 1);
    // A launcher without print or dumpDom (localLauncher) leaves the scripts' own spawns in place.
    const local = makeLauncher(); delete local.print; delete local.dumpDom; delete local.close;
    ctx.launcher = async () => local;
    ctx.scripts.buildWeek = async (dir, opts) => { seen.build = opts; return fakeBuild(dir, opts); };
    await call("build_sheet", { slug: "2026-10-17-noach" }, ctx);
    assert.ok(!("printImpl" in seen.build) && !("dumpDomImpl" in seen.check));
  } finally { await rm(workDir, { recursive: true, force: true }); }
});

test("playwrightLauncher: one browser and one page for print, dumpDom and pages (headless-shell cannot open a second); a failing step rethrows one line and the next step goes on; close closes the browser once and never hangs", async () => {
  const { playwrightLauncher } = await import("../api/_lib/browser.mjs");
  const dir = await mkdtemp(join(tmpdir(), "haftarah-pw-"));
  const log = { launches: 0, newPage: 0, pageClosed: 0, browserClosed: 0, viewports: [], gotos: [] };
  let failNext = false;
  const page = {
    setViewportSize: async v => { log.viewports.push(`${v.width}x${v.height}`); },
    goto: async url => { log.gotos.push(url); if (failNext) { failNext = false; throw new Error(`page.goto: net::ERR_FILE_NOT_FOUND at ${url}\nCall log:\n  - navigating`); } },
    waitForFunction: async () => {}, evaluate: async fn => (String(fn).includes("dataset.pages") ? "3" : true),
    pdf: async ({ path }) => { await writeFile(path, "%PDF-1.4\n<</Type /Page>>\n<</Type /Page>>\n"); },
    content: async () => "<html data-pages=\"3\"></html>",
    screenshot: async ({ path }) => { await writeFile(path, Buffer.from([0xff, 0xd8])); },
    close: async () => { log.pageClosed++; },
  };
  const chromium = { launch: async () => { log.launches++; return { newPage: async ({ viewport }) => { log.newPage++; log.viewports.push(`${viewport.width}x${viewport.height}`); return page; }, newContext: async () => { throw new Error("no second context on headless-shell"); }, close: () => { log.browserClosed++; return new Promise(() => {}); } }; } };
  try {
    const l = playwrightLauncher({ chromium, executablePath: "/tmp/chromium", args: [], record: browserRecord("/tmp/chromium"), closeTimeoutMs: 200 });
    const printed = await l.print(l.browser, "file:///w/sheet.html", join(dir, "sheet.pdf"), { common: [] });
    assert.equal(printed.pages, 2, "the PDF's own page count first");
    assert.equal(await l.dumpDom("/tmp/chromium", "file:///w/sheet.html", { size: "800,600" }), "<html data-pages=\"3\"></html>");
    failNext = true;
    await assert.rejects(l.dumpDom("/tmp/chromium", "file:///w/missing.html"), err => err.message === "dump-dom: page.goto: net::ERR_FILE_NOT_FOUND at file:///w/missing.html");
    assert.deepEqual(await l.pages("file:///w/sheet.html", join(dir, "pages"), 2, "haftarah"), ["haftarah-01.jpg", "haftarah-02.jpg"], "the step after a failure goes on in the same page");
    assert.equal(log.launches, 1); assert.equal(log.newPage, 1); assert.equal(log.pageClosed, 0);
    assert.deepEqual(log.viewports, ["816x1056", "800x600", "816x1056"], "resized only when a step needs another size");
    assert.deepEqual(log.gotos, ["file:///w/sheet.html", "file:///w/sheet.html", "file:///w/missing.html", "file:///w/sheet.html?page=1", "file:///w/sheet.html?page=2"]);
    const t0 = Date.now();
    await l.close(); await l.close();   // the browser's close never settles; close gives up after closeTimeoutMs
    assert.ok(Date.now() - t0 < 2000, `${Date.now() - t0} ms`);
    assert.equal(log.browserClosed, 1);
    await assert.rejects(l.print(l.browser, "file:///w/sheet.html", join(dir, "x.pdf"), { common: [] }), /the browser is closed/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("build_sheet with the real scripts and this machine's Chrome builds the fixture week and checks it", { skip: findBrowser() ? false : "no Chrome or Edge on this machine", timeout: 240_000 }, async () => {
  const { localLauncher } = await import("../api/_lib/browser.mjs");
  const store = new MemoryStore(), workDir = await mkdtemp(join(tmpdir(), "haftarah-work-"));
  try {
    await writeJson(store, "weeks/2026-10-17-noach/sheet.json", torahWeek);
    await writeStatus(store, "2026-10-17-noach", { status: "drafting" });
    const ctx = toolCtx({ store, config, fetchImpl: async () => { throw new Error("no network in tests"); }, now: () => new Date(), log: () => {}, workDir, launcher: localLauncher });
    const r = await call("build_sheet", { slug: "2026-10-17-noach" }, ctx);
    assert.equal(r.status, "built", JSON.stringify(r.readings.map(x => x.check)));
    assert.ok(r.readings.every(x => x.pages >= 1 && x.images.length === x.pages));
    // localLauncher writes PNGs (Chrome's --screenshot); the Vercel launcher's JPEGs are checked on the preview.
    const first = r.readings.find(x => x.kind === "haftarah").images[0];
    assert.equal(first, "haftarah-01.png");
    const img = await store.get(`weeks/2026-10-17-noach/pages/${first}`);
    assert.ok(img.length > 5000 && img.length < 150_000, `page image ${img.length} bytes`);
  } finally { await rm(workDir, { recursive: true, force: true }); }
});
