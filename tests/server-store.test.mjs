// tests/server-store.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MemoryStore, BlobStore, WEEK_FILES, contentTypeOf, pullWeek, pushWeek, readJson, writeJson, readStatus, writeStatus, listWeeks, weekPrefix } from "../api/_lib/store.mjs";

const WORKING = "vercel_blob_rw_URJlaSwtVImD5fOT_s3cret";

test("MemoryStore: put, get, list by prefix; a missing path is null", async () => {
  const s = new MemoryStore();
  assert.equal(await s.get("weeks/x/sheet.json"), null);
  await s.put("weeks/x/sheet.json", Buffer.from("{}"), "application/json");
  await s.put("weeks/y/sheet.json", "{}", "application/json");
  assert.equal((await s.get("weeks/x/sheet.json")).toString(), "{}");
  assert.deepEqual((await s.list("weeks/x/")).map(b => b.pathname), ["weeks/x/sheet.json"]);
  assert.equal((await s.list("weeks/")).length, 2);
});

test("BlobStore refuses a token for another store before any request, naming the store and never the token", async () => {
  assert.throws(() => new BlobStore({ token: "vercel_blob_rw_wOGdAqvPmTFjKrmY_pub", fetchImpl: async () => { throw new Error("must not be called"); } }), err => /store wOGdAqvPmTFjKrmY/.test(err.message) && /URJlaSwtVImD5fOT/.test(err.message) && !err.message.includes("_pub"));
  assert.throws(() => new BlobStore({ token: null }), /HAFTARAH_WORKING_READ_WRITE_TOKEN/);
});

test("BlobStore puts privately, reads from the private origin with the bearer, and lists through the API", async () => {
  const seen = [];
  const fetchImpl = async (url, init = {}) => {
    seen.push({ url: String(url), method: init.method || "GET", headers: init.headers || {} });
    const u = String(url);
    if (init.method === "PUT") return new Response(JSON.stringify({ url: `https://urjlaswtvimd5fot.private.blob.vercel-storage.com/${new URL(u).searchParams.get("pathname")}` }), { status: 200 });
    if (u.startsWith("https://vercel.com/api/blob/?")) return new Response(JSON.stringify({ blobs: [{ pathname: "weeks/x/sheet.json", size: 2, uploadedAt: "2026-10-15T00:00:00Z" }], hasMore: false }), { status: 200 });
    if (u.includes("/weeks/x/sheet.json")) return new Response("{}", { status: 200 });
    return new Response("", { status: 404 });
  };
  const s = new BlobStore({ token: WORKING, fetchImpl });
  await s.put("weeks/x/sheet.json", "{}", "application/json");
  assert.equal(seen[0].headers["x-vercel-blob-access"], "private");
  assert.equal(seen[0].headers["x-cache-control-max-age"], "0");
  assert.equal((await s.get("weeks/x/sheet.json")).toString(), "{}");
  assert.ok(seen[1].url.startsWith("https://urjlaswtvimd5fot.private.blob.vercel-storage.com/weeks/x/sheet.json"));
  assert.equal(seen[1].headers.authorization, `Bearer ${WORKING}`);
  assert.equal(await s.get("weeks/x/none.json"), null);
  assert.deepEqual((await s.list("weeks/x/")).map(b => b.pathname), ["weeks/x/sheet.json"]);
});

test("pullWeek and pushWeek move a week's files between the store and a folder; contentTypeOf knows the kinds", async () => {
  const dir = await mkdtemp(join(tmpdir(), "haftarah-store-"));
  try {
    const s = new MemoryStore();
    await writeFile(join(dir, "sheet.json"), "{\"a\":1}");
    await writeFile(join(dir, "digest.md"), "# d");
    await writeFile(join(dir, "sheet.pdf"), Buffer.from([0x25, 0x50]));
    const pushed = await pushWeek(s, "2026-10-17-noach", dir, ["sheet.pdf", "sheet.json", "digest.md", "missing.json"]);
    assert.deepEqual(pushed, ["sheet.pdf", "sheet.json", "digest.md"], "a file the folder lacks is skipped, not an error");
    assert.equal((await s.list("weeks/2026-10-17-noach/")).find(b => b.pathname.endsWith("sheet.pdf")).contentType, "application/pdf");
    const out = await mkdtemp(join(tmpdir(), "haftarah-store-"));
    try {
      const pulled = await pullWeek(s, "2026-10-17-noach", out);
      assert.equal(pulled[0], "sheet.json", "sheet.json lands first so the PDFs are never older than it");
      assert.deepEqual(pulled.sort(), ["digest.md", "sheet.json", "sheet.pdf"]);
      assert.equal(await readFile(join(out, "sheet.json"), "utf8"), "{\"a\":1}");
      const some = await mkdtemp(join(tmpdir(), "haftarah-store-"));
      assert.deepEqual(await pullWeek(s, "2026-10-17-noach", some, ["sheet.json", "texts.json"]), ["sheet.json"]);
      assert.deepEqual(await readdir(some), ["sheet.json"]);
      await rm(some, { recursive: true, force: true });
    } finally { await rm(out, { recursive: true, force: true }); }
    assert.equal(contentTypeOf("pages/haftarah-01.jpg"), "image/jpeg");
    assert.equal(contentTypeOf("digest.md"), "text/markdown; charset=utf-8");
    assert.equal(contentTypeOf("sheet.html"), "text/html; charset=utf-8");
    assert.ok(WEEK_FILES.includes("status.json") && WEEK_FILES.includes("texts-torah.json"));
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("status: none at first, version 1 on the first write, +1 on every write, fields merged; listWeeks reads them all", async () => {
  const s = new MemoryStore();
  assert.equal(await readStatus(s, "2026-10-17-noach"), null);
  const now = () => new Date("2026-10-15T12:00:00Z");
  const a = await writeStatus(s, "2026-10-17-noach", { status: "drafting" }, now);
  assert.deepEqual(a, { status: "drafting", version: 1, updatedAt: "2026-10-15T12:00:00Z", built: null, delivered: null });
  const b = await writeStatus(s, "2026-10-17-noach", { status: "built", built: "2026-10-15T12:00:00Z" }, now);
  assert.equal(b.version, 2); assert.equal(b.status, "built");
  await writeJson(s, "weeks/2026-10-24-lech-lecha/sheet.json", { slug: "2026-10-24-lech-lecha" });
  assert.deepEqual(await readJson(s, "weeks/2026-10-24-lech-lecha/sheet.json"), { slug: "2026-10-24-lech-lecha" });
  assert.equal(await readJson(s, "weeks/none/sheet.json"), null);
  assert.deepEqual(await listWeeks(s), [{ slug: "2026-10-24-lech-lecha", status: null }, { slug: "2026-10-17-noach", status: b }]);
  await s.put("weeks/Stray/status.json", "{}");
  assert.equal((await listWeeks(s)).length, 2, "a folder that is not a week slug is left out, not an error");
});

test("a week's file names cannot leave its folder, and the slug must be a week slug", async () => {
  const base = await mkdtemp(join(tmpdir(), "haftarah-store-"));
  try {
    const s = new MemoryStore();
    await s.put("weeks/2026-10-17-noach/sheet.json", "{}");
    await s.put("weeks/2026-10-17-noach/../escaped.txt", "x");
    const out = join(base, "week");
    await assert.rejects(pullWeek(s, "2026-10-17-noach", out), /unsafe file name: \.\.\/escaped\.txt/);
    assert.deepEqual((await readdir(base)).sort(), ["week"], "nothing written beside the folder");
    assert.deepEqual(await readdir(out), [], "nothing written at all: every name is checked first");
    await writeFile(join(base, "outside.txt"), "o");
    await assert.rejects(pushWeek(s, "2026-10-17-noach", out, ["../outside.txt"]), /unsafe file name/);
    assert.equal(await s.get("weeks/2026-10-17-noach/../outside.txt"), null);
    for (const bad of ["", "/etc/passwd", "\\x", "a\\b", "a/../../b"]) await assert.rejects(pullWeek(s, "2026-10-17-noach", out, [bad]), /unsafe file name/, JSON.stringify(bad));
    assert.throws(() => weekPrefix("Noach"), /not a week slug/);
    assert.throws(() => weekPrefix("2026-10-17-noach/../x"), /not a week slug/);
    assert.equal(weekPrefix("2026-10-17-noach"), "weeks/2026-10-17-noach/");
    await assert.rejects(pushWeek(s, "../x", out, ["sheet.json"]), /not a week slug/);
  } finally { await rm(base, { recursive: true, force: true }); }
});

test("writeStatus keeps every field of the current record and takes a now in milliseconds as well as a Date", async () => {
  const s = new MemoryStore();
  await writeStatus(s, "2026-10-17-noach", { status: "delivered", published: "https://haftarah.vercel.app/2026-10-17-noach" }, () => Date.parse("2026-10-15T12:00:00Z"));
  const b = await writeStatus(s, "2026-10-17-noach", { status: "built" }, () => new Date("2026-10-15T13:00:00Z"));
  assert.equal(b.published, "https://haftarah.vercel.app/2026-10-17-noach");
  assert.equal(b.version, 2); assert.equal(b.status, "built"); assert.equal(b.built, null); assert.equal(b.updatedAt, "2026-10-15T13:00:00Z");
  assert.equal((await readStatus(s, "2026-10-17-noach")).published, b.published);
});
