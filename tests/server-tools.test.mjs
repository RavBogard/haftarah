// tests/server-tools.test.mjs (Task 3 part; Task 4 appends)
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { TOOLS, toolCtx, validateInput } from "../api/_lib/tools.mjs";
import { MemoryStore, writeJson, writeStatus } from "../api/_lib/store.mjs";
import { configFrom } from "../api/_lib/env.mjs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const tool = name => TOOLS.find(t => t.name === name);
const call = (name, input, ctx) => { const p = validateInput(tool(name).inputSchema, input); if (p.length) throw new Error(p.join("; ")); return tool(name).handler(input, ctx); };
const min = JSON.parse(await readFile(new URL("./fixtures/week-min/sheet.json", import.meta.url), "utf8"));
const torahWeek = JSON.parse(await readFile(new URL("./fixtures/week-torah/sheet.json", import.meta.url), "utf8"));
const digestTexts = JSON.parse(await readFile(new URL("./fixtures/digest/texts.json", import.meta.url), "utf8"));
const hebcalItem = { name: { en: "Noach", he: "נח" }, haftara: "Isaiah 54:1-55:5", summary: "Genesis 6:9-11:32", fullkriyah: { 1: { k: "Genesis", b: "6:9", e: "6:22", v: 14 }, M: { k: "Genesis", b: "11:29", e: "11:32", v: 4 } } };
const indexRows = { schema: 2, weeks: [{ slug: "2025-10-25-noach", civil: "2025-10-25", hebrewEn: "3 Cheshvan 5786", parashah: "Noach", parashahKeys: ["noach"], ref: "Isaiah 54:1–55:5", book: "Isaiah", readings: [{ id: "haftarah", kind: "haftarah", ref: "Isaiah 54:1–55:5", book: "Isaiah" }], pdf: "weeks/2025-10-25-noach/sheet.pdf", pdfTorah: null }, { slug: "2025-10-18-bereshit", civil: "2025-10-18", parashah: "Bereshit", parashahKeys: ["bereshit"], ref: "Isaiah 42:5–43:10", book: "Isaiah", readings: [{ id: "haftarah", kind: "haftarah", ref: "Isaiah 42:5–43:10", book: "Isaiah" }], pdf: "x" }] };
function net(extra = {}) {
  const table = { "https://www.hebcal.com/leyning": () => ({ items: [hebcalItem] }), "https://www.hebcal.com/converter": () => ({ hd: 6, hm: "Cheshvan", hy: 5787, hebrew: "ו׳ בְּחֶשְׁוָן תשפ״ז" }), "https://haftarah.test/data/index.json": () => indexRows, ...extra };
  return async url => { const hit = Object.entries(table).find(([k]) => String(url).startsWith(k)); if (!hit) return new Response("", { status: 404, statusText: "Not Found" }); const v = hit[1](String(url)); return v instanceof Response ? v : new Response(JSON.stringify(v), { status: 200 }); };
}
const config = configFrom({ PUBLIC_BASE_URL: "https://haftarah.test" });
async function ctxWith(store = new MemoryStore(), extra = {}) {
  const workDir = await mkdtemp(join(tmpdir(), "haftarah-work-"));
  return { ctx: toolCtx({ store, config, fetchImpl: net(), now: () => new Date("2026-10-15T12:00:00Z"), log: () => {}, workDir, ...extra }), workDir, store };
}

test("every tool has a name under 64 characters, a description, an object schema and annotations; the destructive one is deliver_week alone", { todo: "Tasks 4 and 5 add the rest" }, () => {
  assert.deepEqual(TOOLS.map(t => t.name), ["get_calendar", "find_past_sheets", "start_week", "fetch_texts", "get_texts", "get_sheet", "save_briefing", "save_entries", "update_sheet", "set_status", "build_sheet", "get_page_image", "deliver_week", "add_bibliography_work"]);
  for (const t of TOOLS) { assert.ok(t.name.length < 64); assert.ok(t.description.length > 20, t.name); assert.equal(t.inputSchema.type, "object"); assert.ok(t.annotations); }
  assert.deepEqual(TOOLS.filter(t => t.annotations.destructiveHint).map(t => t.name), ["deliver_week"]);
  assert.match(tool("deliver_week").description, /Daniel|go-ahead|ship it/);
});

test("validateInput: required, types, enum, pattern, unknown keys", () => {
  const schema = { type: "object", properties: { slug: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}-[a-z0-9-]+$" }, n: { type: "integer" }, kind: { type: "string", enum: ["a", "b"] }, flag: { type: "boolean" }, ids: { type: "array", items: { type: "string" } } }, required: ["slug"], additionalProperties: false };
  assert.deepEqual(validateInput(schema, { slug: "2026-10-17-noach", n: 2, kind: "a", flag: true, ids: ["x"] }), []);
  assert.deepEqual(validateInput(schema, {}), ["slug is required"]);
  assert.deepEqual(validateInput(schema, { slug: "Noach" }), ["slug does not match ^\\d{4}-\\d{2}-\\d{2}-[a-z0-9-]+$"]);
  assert.deepEqual(validateInput(schema, { slug: "2026-10-17-noach", n: 1.5, kind: "c", ids: [1], extra: 1 }), ["n must be an integer", "kind must be one of a, b", "ids[0] must be a string", "extra is not an input of this tool"]);
});

test("get_calendar: the Shabbat, the haftarah with its reason and default, the aliyot, next week, and the weeks the store already holds", async () => {
  const { ctx, store, workDir } = await ctxWith();
  try {
    await writeJson(store, "weeks/2026-10-17-noach/sheet.json", { slug: "2026-10-17-noach" });
    await writeStatus(store, "2026-10-17-noach", { status: "drafting" });
    const r = await call("get_calendar", { date: "2026-10-17" }, ctx);
    assert.deepEqual(r.shabbat, { civil: "2026-10-17", hebrewEn: "6 Cheshvan 5787" });
    assert.equal(r.parashah.en, "Noach");
    assert.deepEqual(r.haftarah, { ref: "Isaiah 54:1-55:5", special: null, defaultHaftarah: null });
    assert.ok(r.aliyot[0].startsWith("Torah: Noach"));
    assert.ok(r.aliyot.some(l => /^\s*1\s+Genesis 6:9-22/.test(l)));
    assert.deepEqual(r.weeks, [{ slug: "2026-10-17-noach", status: "drafting", version: 1 }]);
    assert.equal(r.nextWeek.shabbat, "Noach", "the fake answers every date with the same item");
    const bad = await call("get_calendar", { date: "2026-10-18" }, { ...ctx, fetchImpl: net({ "https://www.hebcal.com/leyning": () => ({ items: [] }) }) }).catch(e => e);
    assert.match(bad.message, /no reading for 2026-10-18/);
  } finally { await rm(workDir, { recursive: true, force: true }); }
});

test("find_past_sheets: by parashah, by book, by overlapping ref; joined with the store's status; the index read from the site", async () => {
  const { ctx, store, workDir } = await ctxWith();
  try {
    await writeStatus(store, "2025-10-25-noach", { status: "delivered" });
    const byParashah = await call("find_past_sheets", { parashah: "Noach" }, ctx);
    assert.deepEqual(byParashah.map(r => [r.slug, r.status]), [["2025-10-25-noach", "delivered"]]);
    assert.equal(byParashah[0].page, "https://haftarah.test/2025-10-25-noach");
    assert.equal((await call("find_past_sheets", { book: "Isaiah" }, ctx)).length, 2);
    assert.deepEqual((await call("find_past_sheets", { ref: "Isaiah 54:10-54:17" }, ctx)).map(r => r.slug), ["2025-10-25-noach"]);
    assert.deepEqual(await call("find_past_sheets", { ref: "Hosea 2:1-22" }, ctx), []);
  } finally { await rm(workDir, { recursive: true, force: true }); }
});

test("find_past_sheets: an en-dashed ref finds the week; the limit is clamped to 1..100", async () => {
  const { ctx, workDir } = await ctxWith();
  try {
    assert.deepEqual((await call("find_past_sheets", { ref: "Isaiah 54:10–54:17" }, ctx)).map(r => r.slug), ["2025-10-25-noach"]);
    assert.equal((await call("find_past_sheets", { book: "Isaiah", limit: 0 }, ctx)).length, 1);
    assert.equal((await call("find_past_sheets", { book: "Isaiah", limit: -3 }, ctx)).length, 1);
    assert.equal((await call("find_past_sheets", { book: "Isaiah", limit: 1000 }, ctx)).length, 2);
  } finally { await rm(workDir, { recursive: true, force: true }); }
});

test("get_calendar: an impossible date is refused before Hebcal is asked; a clock in milliseconds works", async () => {
  const urls = [];
  const inner = net();
  const { ctx, workDir } = await ctxWith(new MemoryStore(), { fetchImpl: async (url, o) => { urls.push(String(url)); return inner(url, o); } });
  try {
    await assert.rejects(call("get_calendar", { date: "2026-02-30" }, ctx), /2026-02-30 is not a date/);
    assert.equal(urls.length, 0, "Hebcal was not asked");
    const r = await call("get_calendar", {}, { ...ctx, now: () => Date.parse("2026-10-15T12:00:00Z") });
    assert.equal(r.shabbat.civil, "2026-10-17");
  } finally { await rm(workDir, { recursive: true, force: true }); }
});

test("get_sheet: parts, version and status, counts by register, lint; a slug the store lacks is an error", async () => {
  const { ctx, store, workDir } = await ctxWith();
  try {
    await writeJson(store, "weeks/2026-10-17-noach/sheet.json", torahWeek);
    await writeStatus(store, "2026-10-17-noach", { status: "drafting" });
    const r = await call("get_sheet", { slug: "2026-10-17-noach" }, ctx);
    assert.equal(r.version, 1); assert.equal(r.status, "drafting");
    assert.deepEqual(r.meta.readings.map(x => [x.id, x.kind, x.verses]), torahWeek.readings.map(x => [x.id, x.kind, x.verses.length]));
    assert.ok(r.openingNote !== undefined && r.nextWeek !== undefined && r.verses === undefined, "the default parts are meta, openingNote, nextWeek");
    assert.ok(Array.isArray(r.counts) && r.counts[0].total >= 0 && "cap" in r.counts[0]);
    assert.ok(Array.isArray(r.lint.errors) && Array.isArray(r.lint.warnings));
    const v = await call("get_sheet", { slug: "2026-10-17-noach", parts: ["verses", "commentary"] }, ctx);
    assert.equal(v.verses[0].id, "torah"); assert.ok(Array.isArray(v.verses[0].verses)); assert.ok(Array.isArray(v.commentary[0].commentary));
    await assert.rejects(call("get_sheet", { slug: "2026-10-24-lech-lecha" }, ctx), /no week 2026-10-24-lech-lecha in the store/);
  } finally { await rm(workDir, { recursive: true, force: true }); }
});

test("get_texts slices the stored texts file for the reading; a reading with no texts says so", async () => {
  const { ctx, store, workDir } = await ctxWith();
  try {
    await writeJson(store, "weeks/2026-10-17-noach/sheet.json", min);
    await writeJson(store, "weeks/2026-10-17-noach/texts.json", digestTexts);
    const r = await call("get_texts", { slug: "2026-10-17-noach", source: "Rashi" }, ctx);
    assert.ok(r.items.length >= 1 && r.items.every(i => i.source === "Rashi on Isaiah"));
    assert.equal(r.cursor, null);
    await assert.rejects(call("get_texts", { slug: "2026-10-17-noach", reading: "torah" }, ctx), /no texts-torah\.json for 2026-10-17-noach; run fetch_texts/);
  } finally { await rm(workDir, { recursive: true, force: true }); }
});

test("save_briefing writes briefing.md with the issues and picks appended and bumps the version", async () => {
  const { ctx, store, workDir } = await ctxWith();
  try {
    await writeJson(store, "weeks/2026-10-17-noach/sheet.json", min);
    await writeStatus(store, "2026-10-17-noach", { status: "drafting" });
    const r = await call("save_briefing", { slug: "2026-10-17-noach", markdown: "# Briefing\n\nThe portion.", issues: ["The barren woman", "Noah's waters"], picks: ["1", "range A"] }, ctx);
    assert.equal(r.version, 2);
    const md = (await store.get("weeks/2026-10-17-noach/briefing.md")).toString();
    assert.ok(md.startsWith("# Briefing")); assert.ok(md.includes("## Issues\n\n1. The barren woman\n2. Noah's waters")); assert.ok(md.includes("## Picks\n\n- 1\n- range A"));
  } finally { await rm(workDir, { recursive: true, force: true }); }
});
