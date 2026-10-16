import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile, mkdtemp, rm, mkdir } from "node:fs/promises";
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
const fakeLauncher = async () => ({ browser: browserRecord("/fake/chromium", ["--x"]), pages: async (url, outDir, count, prefix) => { await mkdir(outDir, { recursive: true }); const names = []; for (let p = 1; p <= count; p++) { const n = `${prefix}-${String(p).padStart(2, "0")}.jpg`; await writeFile(join(outDir, n), Buffer.from([0xff, 0xd8, 0xff])); names.push(n); } return names; } });
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

test("build_sheet with the real scripts and this machine's Chrome builds the fixture week and checks it", { skip: findBrowser() ? false : "no Chrome or Edge on this machine", timeout: 240_000 }, async () => {
  const { localLauncher } = await import("../api/_lib/browser.mjs");
  const store = new MemoryStore(), workDir = await mkdtemp(join(tmpdir(), "haftarah-work-"));
  try {
    await writeJson(store, "weeks/2026-10-17-noach/sheet.json", torahWeek);
    await writeStatus(store, "2026-10-17-noach", { status: "drafting" });
    const ctx = toolCtx({ store, config, now: () => new Date(), log: () => {}, workDir, launcher: localLauncher });
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
