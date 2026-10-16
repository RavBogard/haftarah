import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { migrate3 } from "../scripts/migrate.mjs";
import { makeWeekTorah } from "./helpers/makeWeekTorah.mjs";
import { cleanSheet, indexEntry, upsertIndex, loadWebConfig, storeIdFromToken, publish, STORE_ID, PUBLISHED_FIELDS, listBlobs, weeksInListing, reindex, STORE_ORIGIN, sideManifestFrom, buildSide, backfillSide, parseArgs, putBlob, getBlob, blobOrigin } from "../scripts/publish.mjs";

const TOKEN = "vercel_blob_rw_wOGdAqvPmTFjKrmY_s3cr3tpart";
const STORE = "https://wogdaqvpmtfjkrmy.public.blob.vercel-storage.com";
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

test("cleanSheet drops rejected items, every status, and fields outside PUBLISHED_FIELDS", () => {
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
    parashah: "Bereshit", parashahHe: "בְּרֵאשִׁית", parashahKey: "bereshit", cycle: "5787", special: "Shabbat Machar Chodesh",
    readings: [{ id: "haftarah", kind: "haftarah", ref: "I Samuel 20:18–42", book: "I Samuel" }],
    parashahKeys: ["bereshit"], tags: ["machar-chodesh"], pdfTorah: null,
    hasWords: false, hasLinks: false, translations: [],
  });
  const older = { ...e, slug: "2026-10-03-haazinu", civil: "2026-10-03" };
  const newer = { ...e, slug: "2026-10-24-lech-lecha", civil: "2026-10-24" };
  let idx = upsertIndex({ schema: 1, weeks: [] }, e, "2026-10-15T20:11:03Z");
  idx = upsertIndex(idx, older, "2026-10-15T20:12:00Z");
  idx = upsertIndex(idx, newer, "2026-10-15T20:13:00Z");
  idx = upsertIndex(idx, { ...e, published: "2026-10-16T00:00:00Z" }, "2026-10-16T00:00:00Z");  // replaces, does not duplicate
  assert.equal(idx.schema, 2);
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
  // The SDK's variable is ignored: only our own names choose the token.
  assert.deepEqual(await loadWebConfig({ env: { BLOB_READ_WRITE_TOKEN: "sdktok" }, home }), { token: "filetok" });
  assert.deepEqual(await loadWebConfig({ flags: { token: "flagtok" }, env: { HAFTARAH_BLOB_TOKEN: "envtok" }, home }), { token: "flagtok" });
  await writeFile(join(home, "other.json"), JSON.stringify({ token: "othertok" }));
  assert.deepEqual(await loadWebConfig({ env: { HAFTARAH_WEB_CONFIG: join(home, "other.json") }, home }), { token: "othertok" });
  await rm(home, { recursive: true, force: true });
});

test("storeIdFromToken", () => {
  assert.equal(storeIdFromToken(TOKEN), STORE_ID);
  assert.equal(storeIdFromToken("vercel_blob_rw_AbC123xyz_s3cr3t"), "AbC123xyz");
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

test("publish uploads sheet.pdf, sheet.json, then the index, with the SDK's headers", async () => {
  const api = stubApi();
  const lines = [];
  const r = await publish(week, { config: { token: TOKEN }, fetchImpl: api.fetchImpl, log: l => lines.push(l), now: () => new Date("2026-10-15T20:11:03Z"), side: false });
  const all = api.calls.filter(c => c.method === "PUT");
  assert.deepEqual(all.map(c => new URL(c.url).searchParams.get("pathname")), ["weeks/2026-10-17-noach/sheet.pdf", "weeks/2026-10-17-noach/sheet.json", "index.json"]);
  assert.ok(all.every(c => c.url.startsWith("https://vercel.com/api/blob/?pathname=")));
  const puts = [all[1], all[0]];   // [sheet.json, sheet.pdf], as the checks below read them
  const h = puts[0].headers;
  assert.equal(h["x-api-version"], "13");
  assert.equal(h["x-content-type"], "application/json");
  assert.equal(h["x-add-random-suffix"], "0");
  assert.equal(h["x-allow-overwrite"], "1");
  assert.equal(h["x-cache-control-max-age"], "60");
  assert.equal(h["x-vercel-blob-access"], "public");
  assert.equal(h["x-vercel-blob-store-id"], STORE_ID);
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
  assert.match(lines[1], /^web {2,}weeks\/2026-10-17-noach\/sheet\.json {2,}[\d.]+ KB {2,}https:\/\/wogdaqvpmtfjkrmy\.public/);
  assert.match(lines.at(-1), /^Page: {1,}https:\/\/haftarah\.centralreform\.org\/2026-10-17-noach$/);
  assert.ok(lines.every(l => !l.includes(TOKEN) && !l.includes("s3cr3tpart")));
});

test("publish upserts into an existing index", async () => {
  const api = stubApi({ index: { schema: 1, updated: "2026-10-01T00:00:00Z", weeks: [{ slug: "2026-10-24-lech-lecha", civil: "2026-10-24" }, { slug: "2026-10-17-noach", civil: "2026-10-17", stale: true }] } });
  await publish(week, { config: { token: TOKEN }, fetchImpl: api.fetchImpl, log: () => {}, side: false });
  assert.deepEqual(api.stored.weeks.map(w => w.slug), ["2026-10-24-lech-lecha", "2026-10-17-noach"]);
  assert.ok(!api.stored.weeks[1].stale);
});

test("a failed upload names the file and status and leaves the index untouched", async () => {
  const failing = stubApi({ index: { schema: 1, weeks: [{ slug: "old", civil: "2026-01-01" }] }, failPdf: true });
  const err = await publish(week, { config: { token: TOKEN }, fetchImpl: failing.fetchImpl, log: () => {}, side: false }).catch(e => e);
  assert.match(err.message, /weeks\/2026-10-17-noach\/sheet\.pdf: Blob answered HTTP 503/);
  assert.ok(!err.message.includes(TOKEN));
  assert.deepEqual(failing.stored.weeks.map(w => w.slug), ["old"]);
  assert.equal(failing.calls.filter(c => c.method === "PUT" && c.url.includes("index.json")).length, 0);
});

test("publish refuses a non-JSON index", async () => {
  const api = stubApi({ badIndex: true });
  const err = await publish(week, { config: { token: TOKEN }, fetchImpl: api.fetchImpl, log: () => {}, side: false }).catch(e => e);
  assert.match(err.message, /index\.json: not JSON/);
  assert.equal(api.calls.filter(c => c.method === "PUT" && c.url.includes("index.json")).length, 0);
});

test("a wrong token is reported without being echoed", async () => {
  const api = stubApi();
  const err = await publish(week, { config: { token: `vercel_blob_rw_${STORE_ID}_wrong` }, fetchImpl: api.fetchImpl, log: () => {}, side: false }).catch(e => e);
  assert.match(err.message, /sheet\.pdf: Blob answered HTTP 403/);   // the first upload is the PDF
  assert.ok(!err.message.includes("wrong"));
});

test("publish checks the returned url against the pathname", async () => {
  const fetchImpl = async (url, init) => new Response(JSON.stringify({ url: `${STORE}/weeks/2026-10-17-noach/sheet-abc123.json`, pathname: "weeks/2026-10-17-noach/sheet-abc123.json" }), { status: 200 });
  const err = await publish(week, { config: { token: TOKEN }, fetchImpl, log: () => {}, side: false }).catch(e => e);
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

test("a token for another store is refused before any upload, without echoing it", async () => {
  const api = stubApi();
  const err = await publish(week, { config: { token: "vercel_blob_rw_AbC123xyz_s3cr3tpart" }, fetchImpl: api.fetchImpl, log: () => {} }).catch(e => e);
  assert.match(err.message, /^publish: the Blob token is for store AbC123xyz, not the site's store wOGdAqvPmTFjKrmY; nothing uploaded$/);
  assert.equal(api.calls.length, 0);
  const err2 = await publish(week, { config: { token: "not-a-blob-token" }, fetchImpl: api.fetchImpl, log: () => {} }).catch(e => e);
  assert.match(err2.message, /nothing uploaded/);
  assert.ok(!err2.message.includes("not-a-blob-token"));
  assert.equal(api.calls.length, 0);
});

test("publish refuses a folder that is not a week slug, or disagrees with sheet.json", async () => {
  const bad = join(root, "weeks", "noach");
  await mkdir(bad, { recursive: true });
  await writeFile(join(bad, "sheet.json"), JSON.stringify(sheet));
  await writeFile(join(bad, "sheet.pdf"), "%PDF-1.7\n");
  const api = stubApi();
  for (const dryRun of [true, false]) {
    const err = await publish(bad, { dryRun, config: { token: TOKEN }, fetchImpl: api.fetchImpl, log: () => {} }).catch(e => e);
    assert.equal(err.message, 'publish: folder name "noach" is not a week slug (YYYY-MM-DD-parashah[-special])');
  }
  const other = join(root, "weeks", "2026-10-24-lech-lecha");
  await mkdir(other, { recursive: true });
  await writeFile(join(other, "sheet.json"), JSON.stringify(sheet));
  await writeFile(join(other, "sheet.pdf"), "%PDF-1.7\n");
  for (const dryRun of [true, false]) {
    const err = await publish(other, { dryRun, config: { token: TOKEN }, fetchImpl: api.fetchImpl, log: () => {} }).catch(e => e);
    assert.equal(err.message, 'publish: folder "2026-10-24-lech-lecha" does not match sheet.json slug "2026-10-17-noach"');
  }
  assert.equal(api.calls.length, 0);
});

test("dry run copes with a sheet that has no commentary", async () => {
  const dir = join(root, "bare", "2026-10-17-noach");
  await mkdir(dir, { recursive: true });
  const { commentary, ...rest } = sheet;
  await writeFile(join(dir, "sheet.json"), JSON.stringify(rest));
  await writeFile(join(dir, "sheet.pdf"), "%PDF-1.7\n");
  const lines = [];
  await publish(dir, { dryRun: true, log: l => lines.push(l) });
  assert.match(lines[0], /0 entries, .* 0 rejected entries removed/);
});

test("an index row written before v2 stays exactly as it was", () => {
  const old = { slug: "2026-10-03-haazinu", civil: "2026-10-03", shabbat: "Shabbat Ha'azinu", ref: "II Samuel 22:1–51", pdf: "weeks/2026-10-03-haazinu/sheet.pdf" };
  const idx = upsertIndex({ schema: 1, weeks: [old] }, indexEntry(sheet, "2026-10-17-noach", "t"), "t");
  assert.deepEqual(idx.weeks.find(w => w.slug === old.slug), old);
});

test("a schema-3 week gives the same index row as its schema-2 file", () => {
  assert.deepEqual(indexEntry(migrate3(sheet), "2026-10-17-noach", "t"), indexEntry(sheet, "2026-10-17-noach", "t"));
});

test("cleanSheet cleans every reading of a schema-3 sheet and keeps highlights", () => {
  const m = migrate3(structuredClone(sheet));
  m.highlights = [
    { reading: "haftarah", chapter: 20, verse: 30, words: [0, 2], note: "n", status: "proposed" },
    { reading: "haftarah", chapter: 20, verse: 31, status: "rejected" },
  ];
  const out = cleanSheet(m);
  assert.equal(out.schema, 3);
  assert.equal(out.readings[0].commentary.length, sheet.commentary.length - 1);
  assert.ok(!JSON.stringify(out).includes('"status"'));
  assert.ok(!("candidates" in out));
  assert.deepEqual(out.highlights, [{ reading: "haftarah", chapter: 20, verse: 30, words: [0, 2], note: "n" }]);
  assert.equal(m.readings[0].commentary.length, sheet.commentary.length, "the input is not changed");
});

// The top-level keys of every jsonc block in README's "Data file" section (two-space indent = top level).
function documentedFields(readme) {
  const section = readme.split(/^## /m).find(s => s.startsWith("Data file")) || "";
  const keys = new Set();
  for (const block of section.match(/```jsonc[\s\S]*?```/g) || []) for (const m of block.matchAll(/^ {2}"([A-Za-z]+)":/gm)) keys.add(m[1]);
  return [...keys].sort();
}

test("every field README documents is published, and every published field is documented", () => {
  const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");
  assert.deepEqual(documentedFields(readme), [...PUBLISHED_FIELDS].sort());
});

test("a schema-2 week publishes as before: three uploads, no Torah PDF asked for, and the index row gains its library fields", async () => {
  const api = stubApi();
  await publish(week, { config: { token: TOKEN }, fetchImpl: api.fetchImpl, log: () => {}, side: false });
  assert.deepEqual(api.calls.filter(c => c.method === "PUT").map(c => new URL(c.url).searchParams.get("pathname")), ["weeks/2026-10-17-noach/sheet.pdf", "weeks/2026-10-17-noach/sheet.json", "index.json"]);
  const row = api.stored.weeks[0];
  assert.deepEqual([row.parashahKeys, row.tags, row.pdfTorah], [["bereshit"], ["machar-chodesh"], null]);
});

test("a week with a Torah reading publishes both PDFs, and its index row points at the Torah sheet", async () => {
  const dir = join(root, "two", "2026-10-10-bereshit-machar-chodesh");
  await mkdir(dir, { recursive: true });
  const two = makeWeekTorah(JSON.parse(await readFile(new URL("./fixtures/week-notes/sheet.json", import.meta.url), "utf8")));
  await writeFile(join(dir, "sheet.json"), JSON.stringify(two));
  await writeFile(join(dir, "sheet.pdf"), "%PDF-1.7\nhaftarah\n");
  const missing = await publish(dir, { dryRun: true, log: () => {} }).catch(e => e);
  assert.match(missing.message, /is missing sheet-torah\.pdf/);
  await writeFile(join(dir, "sheet-torah.pdf"), "%PDF-1.7\ntorah\n");
  const api = stubApi();
  const r = await publish(dir, { config: { token: TOKEN }, fetchImpl: api.fetchImpl, log: () => {}, side: false });
  assert.deepEqual(api.calls.filter(c => c.method === "PUT").map(c => new URL(c.url).searchParams.get("pathname")),
    ["weeks/2026-10-10-bereshit-machar-chodesh/sheet.pdf", "weeks/2026-10-10-bereshit-machar-chodesh/sheet-torah.pdf", "weeks/2026-10-10-bereshit-machar-chodesh/sheet.json", "index.json"]);
  assert.ok(r.urls.pdfTorah.endsWith("/sheet-torah.pdf"));
  const row = api.stored.weeks[0];
  assert.equal(row.pdfTorah, "weeks/2026-10-10-bereshit-machar-chodesh/sheet-torah.pdf");
  assert.deepEqual(row.readings.map(x => [x.id, x.ref, x.selection]), [["torah", "Genesis 6:9–33", "aliyah 1, its first verses"], ["haftarah", "I Samuel 20:18–42", undefined]]);
  const lines = [];
  await publish(dir, { dryRun: true, log: l => lines.push(l) });
  assert.ok(lines.some(l => /sheet-torah\.pdf/.test(l)));
});

test("indexEntry lists both halves of a combined parashah, for /vayakhel and /pekudei and both grid cells", () => {
  const d = structuredClone(sheet); d.shabbat.parashah = { en: "Vayakhel-Pekudei", he: "וַיַּקְהֵל־פְקוּדֵי" }; d.shabbat.special = null;
  const e = indexEntry(d, "2028-03-25-vayakhel-pekudei", "t");
  assert.equal(e.parashahKey, "vayakhel-pekudei");
  assert.deepEqual(e.parashahKeys, ["vayakhel", "pekudei"]);
  assert.deepEqual(e.tags, []);
});

test("Chanukah on a Shabbat is tagged for /special/chanukah, with Rosh Chodesh too when both fall together", () => {
  const d = structuredClone(sheet); d.shabbat.parashah = { en: "Miketz", he: "מקץ" };
  d.shabbat.special = "Shabbat Rosh Chodesh Chanukah";
  assert.deepEqual(indexEntry(d, "2026-12-12-miketz", "t").tags, ["chanukah", "rosh-chodesh"]);
  d.shabbat.special = "Chanukah Day 1 (on Shabbat)";
  assert.deepEqual(indexEntry(d, "2026-12-12-miketz", "t").tags, ["chanukah"]);
});

// A stub of the store for --reindex and --side: a listing in two pages (side files listed like the PDFs),
// public sheet.json files (GET by public path, any query), the index.
function storeStub({ weeks, index = null }) {
  const calls = [];
  let stored = index;
  const blobs = Object.entries(weeks).flatMap(([slug, files]) => Object.keys(files).map(f => ({ pathname: `weeks/${slug}/${f}`, url: `${STORE}/weeks/${slug}/${f}`, uploadedAt: "2026-10-01T00:00:00.000Z", size: 1 })));
  blobs.push({ pathname: "weeks/not-a-week/sheet.json", url: `${STORE}/weeks/not-a-week/sheet.json`, uploadedAt: "x", size: 1 });
  const fetchImpl = async (url, init = {}) => {
    const u = new URL(url);
    calls.push({ method: init.method || "GET", url: String(url), headers: init.headers || {}, body: init.body });
    if (u.hostname === "vercel.com" && (init.method || "GET") === "GET") {
      if (init.headers.authorization !== `Bearer ${TOKEN}`) return new Response("forbidden", { status: 403 });
      const first = !u.searchParams.get("cursor");
      const half = Math.ceil(blobs.length / 2);
      return new Response(JSON.stringify(first ? { blobs: blobs.slice(0, half), hasMore: true, cursor: "c2" } : { blobs: blobs.slice(half), hasMore: false }), { status: 200 });
    }
    if (init.method === "PUT") {   // every PUT is recorded; index.json and a week's sheet.json change what is served
      const pathname = u.searchParams.get("pathname");
      if (pathname === "index.json") stored = JSON.parse(init.body);
      const w = /^weeks\/([^/]+)\/sheet\.json$/.exec(pathname);
      if (w) (weeks[w[1]] = weeks[w[1]] || {})["sheet.json"] = JSON.parse(init.body);
      return new Response(JSON.stringify({ url: `${STORE}/${pathname}`, pathname }), { status: 200 });
    }
    if (u.pathname === "/index.json") return stored ? new Response(JSON.stringify(stored), { status: 200 }) : new Response("no", { status: 404 });
    const m = /^\/weeks\/([^/]+)\/sheet\.json$/.exec(u.pathname);
    if (m && weeks[m[1]]) return new Response(JSON.stringify(weeks[m[1]]["sheet.json"]), { status: 200 });
    return new Response("no", { status: 404 });
  };
  return { calls, fetchImpl, get stored() { return stored; } };
}

test("weeksInListing keeps week folders only, by slug and file", () => {
  const m = weeksInListing([{ pathname: "weeks/2026-10-17-noach/sheet.json" }, { pathname: "weeks/2026-10-17-noach/sheet-torah.pdf" }, { pathname: "index.json" }, { pathname: "weeks/junk/sheet.json" }]);
  assert.deepEqual([...m.keys()], ["2026-10-17-noach"]);
  assert.deepEqual(Object.keys(m.get("2026-10-17-noach")), ["sheet.json", "sheet-torah.pdf"]);
  assert.equal(STORE_ORIGIN, STORE);
});

test("--reindex from the store: one v2 row per published sheet, earlier publish times kept, the vanished dropped and named", async () => {
  const a = cleanSheet({ ...structuredClone(sheet), slug: "2026-10-10-bereshit-machar-chodesh" });
  const b = cleanSheet({ ...structuredClone(sheet), slug: "2025-10-25-noach", shabbat: { ...sheet.shabbat, civil: "2025-10-25", parashah: { en: "Noach", he: "נֹחַ" }, special: null } });
  const st = storeStub({ weeks: { "2026-10-10-bereshit-machar-chodesh": { "sheet.json": a, "sheet.pdf": 1 }, "2025-10-25-noach": { "sheet.json": b, "sheet.pdf": 1 } },
    index: { schema: 1, weeks: [{ slug: "2026-10-10-bereshit-machar-chodesh", civil: "2026-10-10", published: "2026-10-09T12:00:00Z" }, { slug: "2024-01-01-gone", civil: "2024-01-01" }] } });
  const lines = [];
  const { index } = await reindex({ config: { token: TOKEN }, fetchImpl: st.fetchImpl, store: STORE, log: l => lines.push(l), now: () => new Date("2026-10-15T20:00:00Z") });
  assert.deepEqual(index.weeks.map(w => w.slug), ["2026-10-10-bereshit-machar-chodesh", "2025-10-25-noach"]);
  assert.equal(index.weeks[0].published, "2026-10-09T12:00:00Z");
  assert.equal(index.weeks[1].published, "2026-10-01T00:00:00.000Z");
  assert.deepEqual(index.weeks[1].parashahKeys, ["noach"]);
  assert.equal(index.weeks[1].cycle, "5787");
  assert.deepEqual(st.stored, index, "uploaded");
  assert.ok(lines.some(l => /dropped +2024-01-01-gone/.test(l)));
  assert.equal(st.calls.filter(c => c.url.includes("cursor=c2")).length, 1, "the listing's second page was read");
  assert.ok(lines.every(l => !l.includes("s3cr3tpart")));
});

test("--reindex --from a weeks folder refreshes only weeks already in the index; an unpublished one is skipped and named; --dry-run uploads nothing", async () => {
  const from = join(root, "from");
  await mkdir(join(from, "2026-10-17-noach"), { recursive: true });
  await writeFile(join(from, "2026-10-17-noach", "sheet.json"), JSON.stringify({ ...sheet, slug: "2026-10-17-noach" }));
  await mkdir(join(from, "2026-10-31-vayera"), { recursive: true });   // the coming week's draft, never delivered
  await writeFile(join(from, "2026-10-31-vayera", "sheet.json"), JSON.stringify({ ...sheet, slug: "2026-10-31-vayera" }));
  await mkdir(join(from, "scratch"), { recursive: true });
  const old = { slug: "2026-10-17-noach", civil: "2026-10-17", published: "2026-10-16T09:00:00Z" };
  const st = storeStub({ weeks: {}, index: { schema: 2, weeks: [{ slug: "2026-10-24-lech-lecha", civil: "2026-10-24" }, old] } });
  const lines = [];
  const dry = await reindex({ from, dryRun: true, fetchImpl: st.fetchImpl, store: STORE, log: l => lines.push(l) });
  assert.deepEqual(dry.index.weeks.map(w => w.slug), ["2026-10-24-lech-lecha", "2026-10-17-noach"]);
  const row = dry.index.weeks[1];
  assert.equal(row.published, "2026-10-16T09:00:00Z", "the first publish time is kept");
  assert.ok(Array.isArray(row.readings) && "parashahKeys" in row, "the row is refreshed with the v2 fields");
  assert.ok(lines.includes("skip     2026-10-31-vayera  (not published; deliver it first)"));
  assert.equal(st.calls.filter(c => c.method === "PUT").length, 0);
  assert.ok(st.calls.every(c => !c.url.startsWith("https://vercel.com")), "a folder needs no listing");
  await reindex({ from, config: { token: TOKEN }, fetchImpl: st.fetchImpl, store: STORE, log: () => {} });
  assert.deepEqual(st.stored.weeks.map(w => w.slug), ["2026-10-24-lech-lecha", "2026-10-17-noach"]);
  await assert.rejects(reindex({ from, config: { token: "vercel_blob_rw_Other123_x" }, fetchImpl: st.fetchImpl, store: STORE, log: () => {} }), /not the site's store/);
});

test("--reindex from the store: an empty listing never replaces an index that had weeks", async () => {
  const st = storeStub({ weeks: {}, index: { schema: 2, weeks: [{ slug: "2026-10-17-noach", civil: "2026-10-17" }] } });
  await assert.rejects(reindex({ config: { token: TOKEN }, fetchImpl: st.fetchImpl, store: STORE, log: () => {} }),
    /publish --reindex: the store listing had no weeks; refusing to replace a 1-week index \(nothing uploaded\)/);
  assert.equal(st.calls.filter(c => c.method === "PUT").length, 0);
});

test("--reindex from the store: a token for another store is refused before the listing", async () => {
  const st = storeStub({ weeks: {}, index: { schema: 2, weeks: [] } });
  await assert.rejects(reindex({ config: { token: "vercel_blob_rw_Other123_x" }, fetchImpl: st.fetchImpl, store: STORE, log: () => {} }), /not the site's store/);
  assert.equal(st.calls.filter(c => c.url.startsWith("https://vercel.com")).length, 0, "no listing GET");
  assert.equal(st.calls.filter(c => c.method === "PUT").length, 0);
});

test("--reindex from the store: pdfTorah only where the store holds sheet-torah.pdf", async () => {
  const torahWeek = s => cleanSheet({ ...makeWeekTorah(JSON.parse(readFileSync(new URL("./fixtures/week-min/sheet.json", import.meta.url), "utf8"))), slug: s });
  const withPdf = { ...torahWeek("2026-10-17-noach"), shabbat: { ...sheet.shabbat, civil: "2026-10-17" } };
  const without = { ...torahWeek("2025-10-25-noach"), shabbat: { ...sheet.shabbat, civil: "2025-10-25" } };
  const st = storeStub({ weeks: {
    "2026-10-17-noach": { "sheet.json": withPdf, "sheet.pdf": 1, "sheet-torah.pdf": 1 },
    "2025-10-25-noach": { "sheet.json": without, "sheet.pdf": 1 },
  } });
  const { index } = await reindex({ config: { token: TOKEN }, fetchImpl: st.fetchImpl, store: STORE, log: () => {} });
  const by = Object.fromEntries(index.weeks.map(w => [w.slug, w]));
  assert.equal(by["2026-10-17-noach"].pdfTorah, "weeks/2026-10-17-noach/sheet-torah.pdf");
  assert.equal(by["2025-10-25-noach"].pdfTorah, null, "a Torah reading without its PDF in the store gets no link");
});

// Side-file builders that write small files instead of calling STEP or Sefaria.
const fakeBuilders = (made = []) => ({
  words: async (dir) => { made.push("words"); await writeFile(join(dir, "words.json"), JSON.stringify({ schema: 1, source: "tahot", readings: { haftarah: { verses: {} } }, lemmas: {} })); return { file: join(dir, "words.json"), report: {} }; },
  translations: async (dir, { customs }) => { made.push(`translations:${(customs && customs.translations || []).join("+")}`); await writeFile(join(dir, "translations.json"), JSON.stringify({ schema: 1, readings: { haftarah: { ref: "x", versions: [{ key: "jps1985", label: "JPS 1985", verses: {} }, { key: "koren", label: "Koren", verses: {} }] } } })); return { file: "", report: {} }; },
  links: async (dir) => { made.push("links"); await writeFile(join(dir, "links.json"), JSON.stringify({ schema: 1, readings: { haftarah: { verses: {} } } })); return { file: "", report: {} }; },
});

test("sideManifestFrom reads whichever side files the folder has; null when none", async () => {
  const dir = await mkdtemp(join(tmpdir(), "side-"));
  try {
    assert.equal(await sideManifestFrom(dir), null);
    await fakeBuilders().words(dir);
    assert.deepEqual(await sideManifestFrom(dir), { words: "tahot" });
    await fakeBuilders().translations(dir, { customs: { translations: ["jps1985"] } });
    await fakeBuilders().links(dir);
    assert.deepEqual(await sideManifestFrom(dir), { words: "tahot", translations: { haftarah: [{ key: "jps1985", label: "JPS 1985" }, { key: "koren", label: "Koren" }] }, links: true });
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("publish builds the side files before uploading, uploads them after the PDFs and before sheet.json, writes the manifest into the published sheet, and the index row gains hasWords, hasLinks and translations", async () => {
  const api = stubApi();
  const made = [];
  const lines = [];
  try {
    await publish(week, { config: { token: TOKEN }, fetchImpl: api.fetchImpl, log: l => lines.push(l), builders: fakeBuilders(made), customs: { translations: ["jps2023", "jps1985"] } });
    assert.deepEqual(made, ["words", "translations:jps2023+jps1985", "links"]);
    const puts = api.calls.filter(c => c.method === "PUT").map(c => new URL(c.url).searchParams.get("pathname"));
    assert.deepEqual(puts, ["weeks/2026-10-17-noach/sheet.pdf", "weeks/2026-10-17-noach/words.json", "weeks/2026-10-17-noach/translations.json", "weeks/2026-10-17-noach/links.json", "weeks/2026-10-17-noach/sheet.json", "index.json"]);
    const up = JSON.parse(api.calls.find(c => c.method === "PUT" && c.url.includes("sheet.json")).body);
    assert.deepEqual(up.side, { words: "tahot", translations: { haftarah: [{ key: "jps1985", label: "JPS 1985" }, { key: "koren", label: "Koren" }] }, links: true });
    const row = api.stored.weeks[0];
    assert.equal(row.hasWords, true); assert.equal(row.hasLinks, true); assert.deepEqual(row.translations, ["jps1985", "koren"]);
    assert.match(lines.join("\n"), /web      weeks\/2026-10-17-noach\/words\.json/);
    const sideHeaders = api.calls.find(c => c.method === "PUT" && c.url.includes("words.json")).headers;
    assert.equal(sideHeaders["x-content-type"], "application/json");
    assert.equal(sideHeaders["x-cache-control-max-age"], "60");
  } finally {
    // the builders wrote into the shared week folder; later tests expect it without side files
    for (const f of ["words.json", "translations.json", "links.json"]) await rm(join(week, f), { force: true });
  }
});

test("publish --no-side publishes as before: three uploads, no manifest, the index row says so", async () => {
  const api = stubApi();
  const made = [];
  await publish(week, { config: { token: TOKEN }, fetchImpl: api.fetchImpl, log: () => {}, side: false, builders: fakeBuilders(made) });
  assert.deepEqual(made, []);
  assert.deepEqual(api.calls.filter(c => c.method === "PUT").map(c => new URL(c.url).searchParams.get("pathname")), ["weeks/2026-10-17-noach/sheet.pdf", "weeks/2026-10-17-noach/sheet.json", "index.json"]);
  const up = JSON.parse(api.calls.find(c => c.method === "PUT" && c.url.includes("sheet.json")).body);
  assert.ok(!("side" in up));
  const row = api.stored.weeks[0];
  assert.deepEqual([row.hasWords, row.hasLinks, row.translations], [false, false, []]);
});

test("publish --no-side keeps the side files a week already has: nothing rebuilt, those files uploaded and in the manifest", async () => {
  const api = stubApi();
  const made = [];
  await fakeBuilders().words(week);
  await fakeBuilders().links(week);
  try {
    await publish(week, { config: { token: TOKEN }, fetchImpl: api.fetchImpl, log: () => {}, side: false, builders: fakeBuilders(made) });
    assert.deepEqual(made, [], "no builder called");
    assert.deepEqual(api.calls.filter(c => c.method === "PUT").map(c => new URL(c.url).searchParams.get("pathname")), ["weeks/2026-10-17-noach/sheet.pdf", "weeks/2026-10-17-noach/words.json", "weeks/2026-10-17-noach/links.json", "weeks/2026-10-17-noach/sheet.json", "index.json"]);
    const up = JSON.parse(api.calls.find(c => c.method === "PUT" && c.url.includes("sheet.json")).body);
    assert.deepEqual(up.side, { words: "tahot", links: true });
    const row = api.stored.weeks[0];
    assert.deepEqual([row.hasWords, row.hasLinks, row.translations], [true, true, []]);
  } finally { for (const f of ["words.json", "links.json"]) await rm(join(week, f), { force: true }); }
});

test("a links or translations failure degrades: the publish goes on, the file and its manifest entry are left out, the log says why", async () => {
  const api = stubApi();
  const lines = [];
  const builders = fakeBuilders();
  await writeFile(join(week, "links.json"), "{}");   // an older copy: must not survive a failed rebuild
  builders.links = async () => { throw new Error("Sefaria answered HTTP 502"); };
  try {
    await publish(week, { config: { token: TOKEN }, fetchImpl: api.fetchImpl, log: l => lines.push(l), builders, customs: { translations: ["jps1985"] } });
    const puts = api.calls.filter(c => c.method === "PUT").map(c => new URL(c.url).searchParams.get("pathname"));
    assert.ok(!puts.includes("weeks/2026-10-17-noach/links.json"));
    const up = JSON.parse(api.calls.find(c => c.method === "PUT" && c.url.includes("sheet.json")).body);
    assert.ok(up.side && !("links" in up.side) && up.side.words === "tahot" && up.side.translations);
    assert.ok(lines.includes("side: links not built: Sefaria answered HTTP 502"), lines.join("\n"));
    assert.equal(api.stored.weeks[0].hasLinks, false);
  } finally { for (const f of ["words.json", "translations.json", "links.json"]) await rm(join(week, f), { force: true }); }
});

test("sideManifestFrom: a missing file is skipped, a corrupt one stops the publish naming the file", async () => {
  const dir = await mkdtemp(join(tmpdir(), "side-"));
  try {
    await writeFile(join(dir, "words.json"), "{ not json");
    await assert.rejects(sideManifestFrom(dir), /^Error: side: cannot read words\.json: /);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("publish parseArgs: --side takes slugs only, and at least one", () => {
  assert.deepEqual(parseArgs(["--side", "2026-10-17-noach", "2026-10-24-lech-lecha"]).side, ["2026-10-17-noach", "2026-10-24-lech-lecha"]);
  assert.throws(() => parseArgs(["--side"]), /--side needs at least one slug/);
  assert.throws(() => parseArgs(["--side", "2026-10-17-noach", "--reindex"]), /--side takes slugs only/);
  assert.throws(() => parseArgs(["weeks/2026-10-17-noach", "--side", "2026-10-17-noach"]), /--side takes slugs only/);
  assert.deepEqual(parseArgs(["weeks/x", "--no-side"]).noSide, true);
});

test("a words failure still stops the publish before any upload", async () => {
  const api = stubApi();
  const builders = fakeBuilders();
  builders.words = async () => { throw new Error("words: I Samuel 20:19 has no rows in tahot"); };
  await assert.rejects(publish(week, { config: { token: TOKEN }, fetchImpl: api.fetchImpl, log: () => {}, builders }), /I Samuel 20:19 has no rows/);
  assert.equal(api.calls.filter(c => c.method === "PUT").length, 0);
});

test("dry run lists the side files as made at publish and builds nothing", async () => {
  const api = stubApi();
  const made = [];
  const lines = [];
  await publish(week, { dryRun: true, fetchImpl: api.fetchImpl, log: l => lines.push(l), builders: fakeBuilders(made) });
  assert.deepEqual(made, []);
  assert.equal(api.calls.length, 0);
  assert.match(lines.join("\n"), /web      weeks\/2026-10-17-noach\/words\.json  \(made at publish\)/);
  assert.match(lines.join("\n"), /web      weeks\/2026-10-17-noach\/links\.json  \(made at publish\)/);
});

test("--reindex from the store: hasWords and hasLinks follow the listing, translations the published sheet", async () => {
  const sheetWith = { ...cleanSheet(sheet), side: { words: "tahot", links: true, translations: { haftarah: [{ key: "koren", label: "Koren" }] } } };
  const api = storeStub({
    weeks: {
      "2026-10-17-noach": { "sheet.json": sheetWith, "sheet.pdf": true, "words.json": true, "translations.json": true, "links.json": true },
      "2026-10-10-bereshit": { "sheet.json": { ...cleanSheet(sheet), slug: "2026-10-10-bereshit", side: { words: "tahot", links: true } }, "sheet.pdf": true },
    },
    index: { schema: 2, weeks: [] },
  });
  const { index } = await reindex({ config: { token: TOKEN }, fetchImpl: api.fetchImpl, log: () => {}, now: () => new Date("2026-10-16T00:00:00Z") });
  const noach = index.weeks.find(w => w.slug === "2026-10-17-noach"), bereshit = index.weeks.find(w => w.slug === "2026-10-10-bereshit");
  assert.deepEqual([noach.hasWords, noach.hasLinks, noach.translations], [true, true, ["koren"]]);
  assert.deepEqual([bereshit.hasWords, bereshit.hasLinks, bereshit.translations], [false, false, []], "the store holds no side files for it, whatever the sheet says");
});

test("--reindex from the store: a sheet whose side lists translations but no translations.json in the store gets translations []", async () => {
  const sheetWith = { ...cleanSheet(sheet), side: { words: "tahot", translations: { haftarah: [{ key: "koren", label: "Koren" }] } } };
  const api = storeStub({ weeks: { "2026-10-17-noach": { "sheet.json": sheetWith, "sheet.pdf": true, "words.json": true } }, index: { schema: 2, weeks: [] } });
  const { index } = await reindex({ config: { token: TOKEN }, fetchImpl: api.fetchImpl, log: () => {}, now: () => new Date("2026-10-16T00:00:00Z") });
  assert.deepEqual([index.weeks[0].hasWords, index.weeks[0].translations], [true, []]);
});

test("--reindex --from: a local folder's side files set the flags; without them the old row's flags stay", async () => {
  const api = stubApi({ index: { schema: 2, updated: "2026-10-15T00:00:00Z", weeks: [{ ...indexEntry(cleanSheet(sheet), "2026-10-17-noach", "2026-10-15T20:11:03Z"), hasWords: true, hasLinks: true, translations: ["koren"] }] } });
  const r1 = await reindex({ from: join(root, "weeks"), dryRun: true, fetchImpl: api.fetchImpl, log: () => {} });
  assert.deepEqual([r1.index.weeks[0].hasWords, r1.index.weeks[0].hasLinks, r1.index.weeks[0].translations], [true, true, ["koren"]]);
  await fakeBuilders().words(week);
  try {
    const r2 = await reindex({ from: join(root, "weeks"), dryRun: true, fetchImpl: api.fetchImpl, log: () => {} });
    assert.deepEqual([r2.index.weeks[0].hasWords, r2.index.weeks[0].hasLinks, r2.index.weeks[0].translations], [true, false, []]);
  } finally { await rm(join(week, "words.json"), { force: true }); }
});

test("backfillSide: a published week gets its side files from the store's sheet, the manifest and the index row; an unpublished slug is refused", async () => {
  const published = cleanSheet(sheet);
  const api = storeStub({ weeks: { "2026-10-17-noach": { "sheet.json": published, "sheet.pdf": true } }, index: { schema: 2, weeks: [indexEntry(published, "2026-10-17-noach", "2026-10-15T20:11:03Z")] } });
  const made = [];
  const lines = [];
  await backfillSide("2026-10-17-noach", { config: { token: TOKEN }, fetchImpl: api.fetchImpl, log: l => lines.push(l), builders: fakeBuilders(made), customs: { translations: ["jps1985"] }, now: () => new Date("2026-10-16T00:00:00Z") });
  assert.deepEqual(made, ["words", "translations:jps1985", "links"]);
  const puts = api.calls.filter(c => c.method === "PUT").map(c => new URL(c.url).searchParams.get("pathname"));
  assert.deepEqual(puts, ["weeks/2026-10-17-noach/words.json", "weeks/2026-10-17-noach/translations.json", "weeks/2026-10-17-noach/links.json", "weeks/2026-10-17-noach/sheet.json", "index.json"]);
  const up = JSON.parse(api.calls.find(c => c.method === "PUT" && c.url.includes("sheet.json")).body);
  assert.equal(up.side.words, "tahot");
  assert.deepEqual(up.verses, published.verses, "the published sheet is re-uploaded unchanged apart from side");
  const row = api.stored.weeks[0];
  assert.equal(row.published, "2026-10-15T20:11:03Z");
  assert.deepEqual([row.hasWords, row.hasLinks, row.translations], [true, true, ["jps1985", "koren"]]);
  await assert.rejects(backfillSide("2026-10-03-haazinu", { config: { token: TOKEN }, fetchImpl: api.fetchImpl, log: () => {}, builders: fakeBuilders() }), /publish --side: 2026-10-03-haazinu is not published/);
});

test("putBlob sends x-vercel-blob-access private when asked, public by default; blobOrigin and getBlob read a private blob with the bearer", async () => {
  const seen = [];
  const token = "vercel_blob_rw_ABCDEFGHIJKLMNOP_secret";
  const fetchImpl = async (url, init) => { seen.push({ url: String(url), headers: init.headers, method: init.method }); return new Response(JSON.stringify({ url: "https://abcdefghijklmnop.private.blob.vercel-storage.com/weeks/x/sheet.json", pathname: "weeks/x/sheet.json" }), { status: 200 }); };
  await putBlob({ pathname: "weeks/x/sheet.json", body: "{}", contentType: "application/json", maxAge: 0, token, fetchImpl, access: "private" });
  assert.equal(seen[0].headers["x-vercel-blob-access"], "private");
  await putBlob({ pathname: "weeks/x/sheet.json", body: "{}", contentType: "application/json", maxAge: 0, token, fetchImpl });
  assert.equal(seen[1].headers["x-vercel-blob-access"], "public");
  assert.equal(blobOrigin(token, "private"), "https://abcdefghijklmnop.private.blob.vercel-storage.com");
  assert.equal(blobOrigin(token, "public"), "https://abcdefghijklmnop.public.blob.vercel-storage.com");
  const got = await getBlob({ pathname: "weeks/x/sheet.json", token, access: "private", fetchImpl: async (url, init) => { seen.push({ url: String(url), headers: init.headers }); return new Response("{\"a\":1}", { status: 200 }); } });
  assert.equal(seen[2].url, "https://abcdefghijklmnop.private.blob.vercel-storage.com/weeks/x/sheet.json?cache=0", "a private read is a consistent read, past the CDN");
  assert.equal(seen[2].headers.authorization, `Bearer ${token}`);
  assert.equal(await got.text(), "{\"a\":1}");
  const missing = await getBlob({ pathname: "weeks/x/none.json", token, access: "private", fetchImpl: async () => new Response("", { status: 404 }) });
  assert.equal(missing, null, "a 404 is null, not an error");
  await assert.rejects(getBlob({ pathname: "weeks/x/sheet.json", token, access: "private", fetchImpl: async () => new Response("", { status: 500 }) }), err => /HTTP 500/.test(err.message) && !err.message.includes("secret"));
});
