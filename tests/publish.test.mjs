import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { cleanSheet, indexEntry, upsertIndex, loadWebConfig, storeIdFromToken, publish } from "../scripts/publish.mjs";

const TOKEN = "vercel_blob_rw_AbC123xyz_s3cr3tpart";
const STORE = "https://abc123xyz.public.blob.vercel-storage.com";
let root, week, sheet;

before(async () => {
  root = await mkdtemp(join(tmpdir(), "publish-"));
  week = join(root, "weeks", "2026-10-17-noach");
  await mkdir(week, { recursive: true });
  sheet = JSON.parse(await readFile(new URL("./fixtures/week-notes/sheet.json", import.meta.url), "utf8"));
  sheet.slug = "2026-10-17-noach";
  sheet.commentary[1].status = "rejected";
  sheet.glossary[2].status = "rejected";
  sheet.candidates = [{ junk: true }];
  await writeFile(join(week, "sheet.json"), JSON.stringify(sheet, null, 2));
  await writeFile(join(week, "sheet.pdf"), Buffer.concat([Buffer.from("%PDF-1.7\n"), randomBytes(50_000)]));
});
after(async () => { await rm(root, { recursive: true, force: true }); });

test("cleanSheet drops rejected items, every status, and fields outside schema 2", () => {
  const out = cleanSheet(structuredClone(sheet));
  assert.deepEqual(Object.keys(out).sort(), ["commentary", "credits", "glossary", "glosses", "haftarah", "nextWeek", "openingNote", "schema", "series", "shabbat", "slug", "verses"].filter(k => k in sheet).sort());
  assert.equal(out.commentary.length, sheet.commentary.length - 1);
  assert.equal(out.glossary.length, sheet.glossary.length - 1);
  assert.ok(!JSON.stringify(out).includes('"status"'));
  assert.ok(!("candidates" in out));
  assert.deepEqual(out.verses, sheet.verses);
  // a rejected next week becomes null; a proposed one stays, without its status
  const d = structuredClone(sheet); d.nextWeek = { shabbat: "Noach", ref: "Isaiah 54:1-55:5", status: "rejected" };
  assert.equal(cleanSheet(d).nextWeek, null);
  d.nextWeek.status = "proposed";
  assert.deepEqual(cleanSheet(d).nextWeek, { shabbat: "Noach", ref: "Isaiah 54:1-55:5" });
});

test("indexEntry and upsertIndex", () => {
  const e = indexEntry(sheet, "2026-10-17-noach", "2026-10-15T20:11:03Z");
  assert.deepEqual(e, {
    slug: "2026-10-17-noach", civil: "2026-10-10", civilDisplay: "October 10, 2026",
    hebrew: "כ״ט בְּתִשְׁרֵי תשפ״ז", hebrewEn: "29 Tishrei 5787", shabbat: "Shabbat Bereshit, Machar Chodesh",
    ref: "I Samuel 20:18–42", book: "I Samuel", incipit: { he: "מָחָ֣ר חֹ֑דֶשׁ", en: "Tomorrow will be the new moon" },
    defaultHaftarah: "Isaiah 42:5–43:10", pdf: "weeks/2026-10-17-noach/sheet.pdf", published: "2026-10-15T20:11:03Z",
  });
  const older = { ...e, slug: "2026-10-03-haazinu", civil: "2026-10-03" };
  const newer = { ...e, slug: "2026-10-24-lech-lecha", civil: "2026-10-24" };
  let idx = upsertIndex({ schema: 1, weeks: [] }, e, "2026-10-15T20:11:03Z");
  idx = upsertIndex(idx, older, "2026-10-15T20:12:00Z");
  idx = upsertIndex(idx, newer, "2026-10-15T20:13:00Z");
  idx = upsertIndex(idx, { ...e, published: "2026-10-16T00:00:00Z" }, "2026-10-16T00:00:00Z");  // replaces, does not duplicate
  assert.equal(idx.schema, 1);
  assert.equal(idx.updated, "2026-10-16T00:00:00Z");
  assert.deepEqual(idx.weeks.map(w => w.slug), ["2026-10-24-lech-lecha", "2026-10-17-noach", "2026-10-03-haazinu"]);
  assert.equal(idx.weeks[1].published, "2026-10-16T00:00:00Z");
});

test("loadWebConfig: flag over env over file; the token never appears in the error", async () => {
  const home = await mkdtemp(join(tmpdir(), "home-"));
  await assert.rejects(loadWebConfig({ env: {}, home }), /web publishing not configured/);
  const err = await loadWebConfig({ env: {}, home }).catch(e => e);
  assert.match(err.message, /\.haftarah-web\.json/);
  await writeFile(join(home, ".haftarah-web.json"), JSON.stringify({ token: "filetok" }));
  assert.deepEqual(await loadWebConfig({ env: {}, home }), { token: "filetok" });
  assert.deepEqual(await loadWebConfig({ env: { HAFTARAH_BLOB_TOKEN: "envtok" }, home }), { token: "envtok" });
  assert.deepEqual(await loadWebConfig({ env: { BLOB_READ_WRITE_TOKEN: "sdktok" }, home }), { token: "sdktok" });
  assert.deepEqual(await loadWebConfig({ flags: { token: "flagtok" }, env: { HAFTARAH_BLOB_TOKEN: "envtok" }, home }), { token: "flagtok" });
  await writeFile(join(home, "other.json"), JSON.stringify({ token: "othertok" }));
  assert.deepEqual(await loadWebConfig({ env: { HAFTARAH_WEB_CONFIG: join(home, "other.json") }, home }), { token: "othertok" });
  await rm(home, { recursive: true, force: true });
});

test("storeIdFromToken", () => {
  assert.equal(storeIdFromToken(TOKEN), "AbC123xyz");
  assert.equal(storeIdFromToken("something-else"), null);
});

// A stub of the Blob API: records every request, serves the index it last stored.
function stubApi({ index = null, failPdf = false, badIndex = false } = {}) {
  const calls = [];
  let stored = index;
  const fetchImpl = async (url, init = {}) => {
    const u = new URL(url);
    calls.push({ method: init.method || "GET", url: String(url), headers: init.headers || {}, body: init.body });
    if (init.method === "PUT") {
      const pathname = u.searchParams.get("pathname");
      if (init.headers.authorization !== `Bearer ${TOKEN}`) return new Response(JSON.stringify({ error: { code: "forbidden" } }), { status: 403 });
      if (failPdf && pathname.endsWith(".pdf")) return new Response("busy", { status: 503 });
      if (pathname === "index.json") stored = JSON.parse(init.body);
      return new Response(JSON.stringify({ url: `${STORE}/${pathname}`, downloadUrl: `${STORE}/${pathname}?download=1`, pathname, contentType: init.headers["x-content-type"], contentDisposition: "inline", etag: "x" }), { status: 200 });
    }
    if (u.pathname === "/index.json") {
      if (badIndex) return new Response("<html>oops</html>", { status: 200 });
      return stored ? new Response(JSON.stringify(stored), { status: 200 }) : new Response("Not found", { status: 404 });
    }
    return new Response("Not found", { status: 404 });
  };
  return { calls, fetchImpl, get stored() { return stored; } };
}

test("publish uploads sheet.json, sheet.pdf, then the index, with the SDK's headers", async () => {
  const api = stubApi();
  const lines = [];
  const r = await publish(week, { config: { token: TOKEN }, fetchImpl: api.fetchImpl, log: l => lines.push(l), now: () => new Date("2026-10-15T20:11:03Z") });
  const puts = api.calls.filter(c => c.method === "PUT");
  assert.deepEqual(puts.map(c => new URL(c.url).searchParams.get("pathname")), ["weeks/2026-10-17-noach/sheet.json", "weeks/2026-10-17-noach/sheet.pdf", "index.json"]);
  assert.ok(puts.every(c => c.url.startsWith("https://vercel.com/api/blob/?pathname=")));
  const h = puts[0].headers;
  assert.equal(h["x-api-version"], "13");
  assert.equal(h["x-content-type"], "application/json");
  assert.equal(h["x-add-random-suffix"], "0");
  assert.equal(h["x-allow-overwrite"], "1");
  assert.equal(h["x-cache-control-max-age"], "60");
  assert.equal(h["x-vercel-blob-access"], "public");
  assert.equal(h["x-vercel-blob-store-id"], "AbC123xyz");
  assert.equal(puts[1].headers["x-content-type"], "application/pdf");
  assert.equal(puts[1].headers["x-cache-control-max-age"], "3600");
  assert.ok(Buffer.isBuffer(puts[1].body) || puts[1].body instanceof Uint8Array);
  // the uploaded sheet is the cleaned one
  const up = JSON.parse(puts[0].body);
  assert.ok(!JSON.stringify(up).includes('"status"'));
  assert.equal(up.commentary.length, sheet.commentary.length - 1);
  // the index was fetched from the store (404 = empty) and written with the week
  const gets = api.calls.filter(c => c.method === "GET");
  assert.equal(gets.length, 1);
  assert.ok(gets[0].url.startsWith(`${STORE}/index.json?`));
  assert.deepEqual(api.stored.weeks.map(w => w.slug), ["2026-10-17-noach"]);
  assert.equal(api.stored.updated, "2026-10-15T20:11:03Z");
  assert.equal(r.page, "https://haftarah.centralreform.org/2026-10-17-noach");
  assert.match(lines[0], /^web {2,}weeks\/2026-10-17-noach\/sheet\.json {2,}[\d.]+ KB {2,}https:\/\/abc123xyz\.public/);
  assert.match(lines.at(-1), /^Page: {1,}https:\/\/haftarah\.centralreform\.org\/2026-10-17-noach$/);
  assert.ok(lines.every(l => !l.includes(TOKEN) && !l.includes("s3cr3tpart")));
});

test("publish upserts into an existing index", async () => {
  const api = stubApi({ index: { schema: 1, updated: "2026-10-01T00:00:00Z", weeks: [{ slug: "2026-10-24-lech-lecha", civil: "2026-10-24" }, { slug: "2026-10-17-noach", civil: "2026-10-17", stale: true }] } });
  await publish(week, { config: { token: TOKEN }, fetchImpl: api.fetchImpl, log: () => {} });
  assert.deepEqual(api.stored.weeks.map(w => w.slug), ["2026-10-24-lech-lecha", "2026-10-17-noach"]);
  assert.ok(!api.stored.weeks[1].stale);
});

test("a failed upload names the file and status and leaves the index untouched", async () => {
  const failing = stubApi({ index: { schema: 1, weeks: [{ slug: "old", civil: "2026-01-01" }] }, failPdf: true });
  const err = await publish(week, { config: { token: TOKEN }, fetchImpl: failing.fetchImpl, log: () => {} }).catch(e => e);
  assert.match(err.message, /weeks\/2026-10-17-noach\/sheet\.pdf: Blob answered HTTP 503/);
  assert.ok(!err.message.includes(TOKEN));
  assert.deepEqual(failing.stored.weeks.map(w => w.slug), ["old"]);
  assert.equal(failing.calls.filter(c => c.method === "PUT" && c.url.includes("index.json")).length, 0);
});

test("publish refuses a non-JSON index", async () => {
  const api = stubApi({ badIndex: true });
  const err = await publish(week, { config: { token: TOKEN }, fetchImpl: api.fetchImpl, log: () => {} }).catch(e => e);
  assert.match(err.message, /index\.json: not JSON/);
  assert.equal(api.calls.filter(c => c.method === "PUT" && c.url.includes("index.json")).length, 0);
});

test("a wrong token is reported without being echoed", async () => {
  const api = stubApi();
  const err = await publish(week, { config: { token: "vercel_blob_rw_X_wrong" }, fetchImpl: api.fetchImpl, log: () => {} }).catch(e => e);
  assert.match(err.message, /sheet\.json: Blob answered HTTP 403/);
  assert.ok(!err.message.includes("wrong"));
});

test("publish checks the returned url against the pathname", async () => {
  const fetchImpl = async (url, init) => new Response(JSON.stringify({ url: `${STORE}/weeks/2026-10-17-noach/sheet-abc123.json`, pathname: "weeks/2026-10-17-noach/sheet-abc123.json" }), { status: 200 });
  const err = await publish(week, { config: { token: TOKEN }, fetchImpl, log: () => {} }).catch(e => e);
  assert.match(err.message, /unexpected url/);
});

test("dry run makes no requests and reports the cleaned counts", async () => {
  const api = stubApi();
  const lines = [];
  await publish(week, { dryRun: true, fetchImpl: api.fetchImpl, log: l => lines.push(l) });
  assert.equal(api.calls.length, 0);
  assert.match(lines.join("\n"), /weeks\/2026-10-17-noach\/sheet\.json/);
  assert.match(lines.join("\n"), /weeks\/2026-10-17-noach\/sheet\.pdf/);
  assert.match(lines.join("\n"), new RegExp(`${sheet.commentary.length - 1} entries`));
  assert.match(lines.join("\n"), /1 rejected entry removed/);
  assert.match(lines.at(-1), /^Page: {1,}https:\/\/haftarah\.centralreform\.org\/2026-10-17-noach$/);
});
