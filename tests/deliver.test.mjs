import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createHash, randomBytes } from "node:crypto";
import { mkdtemp, mkdir, writeFile, readFile, rm, utimes } from "node:fs/promises";
import { makeWeekTorah } from "./helpers/makeWeekTorah.mjs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { isolatedEnv } from "./helpers/isolatedEnv.mjs";
import { migrate3 } from "../scripts/migrate.mjs";
import { publicName, planFiles, loadConfig, deliver } from "../scripts/deliver.mjs";

const run = promisify(execFile);
const script = fileURLToPath(new URL("../scripts/deliver.mjs", import.meta.url));
const TOKEN = "t0ken-for-tests-only";

// A stand-in for the Apps Script web app: POST /exec stores the reply and
// answers 302 to /echo on the "googleusercontent" side, which serves it on GET.
let server, base, root, week;
const drive = new Map();              // "public/name" or "working/slug/name" -> Buffer
const replies = new Map();
const seen = [];                      // {method, path} of every request
let mode = "ok";                      // "ok" | "badsha" | "fail5xx-once"
let fiveHundreds = 0;

before(async () => {
  server = createServer(async (req, res) => {
    seen.push({ method: req.method, path: req.url.split("?")[0] });
    const url = new URL(req.url, "http://x");
    if (url.pathname === "/echo" && req.method === "GET") {
      const r = replies.get(url.searchParams.get("key"));
      res.writeHead(200, { "content-type": "application/json" });
      return res.end(JSON.stringify(r ?? { ok: false, error: "no such key" }));
    }
    if (url.pathname === "/exec" && req.method === "POST") {
      if (mode === "fail5xx-once" && fiveHundreds++ === 0) { res.writeHead(503); return res.end("busy"); }
      let raw = "";
      for await (const c of req) raw += c;
      const b = JSON.parse(raw);
      let reply;
      if (b.token !== TOKEN) reply = { ok: false, error: "unauthorized" };
      else if (b.target === "working" && !b.slug) reply = { ok: false, error: "slug is required" };
      else {
        const bytes = Buffer.from(b.base64, "base64");
        const key = b.target === "public" ? `public/${b.name}` : `working/${b.slug}/${b.name}`;
        drive.set(key, bytes);
        const folder = b.target === "public" ? "PUB" : `WORK-${b.slug}`;
        reply = {
          ok: true, id: "id-" + drive.size, name: b.name, url: `https://drive.example/file/${encodeURIComponent(key)}`,
          size: bytes.length,
          sha256: mode === "badsha" ? "0".repeat(64) : createHash("sha256").update(bytes).digest("hex"),
          folderId: folder, folderUrl: `https://drive.example/folders/${folder}`,
        };
      }
      const k = String(replies.size + 1);
      replies.set(k, reply);
      res.writeHead(302, { location: `${base}/echo?key=${k}` });
      return res.end();
    }
    res.writeHead(405); res.end();
  });
  await new Promise(r => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${server.address().port}`;

  root = await mkdtemp(join(tmpdir(), "deliver-"));
  week = join(root, "weeks", "2026-10-17-noach");
  await mkdir(week, { recursive: true });
  const sheet = JSON.parse(await readFile(new URL("./fixtures/week-min/sheet.json", import.meta.url), "utf8"));
  sheet.slug = "2026-10-17-noach";
  sheet.shabbat.civil = "2026-10-17";
  sheet.shabbat.parashah.en = "Noach";
  sheet.haftarah.ref = "Isaiah 54:1-55:5";
  await writeFile(join(week, "sheet.json"), JSON.stringify(sheet, null, 2));
  await writeFile(join(week, "candidates.json"), "{\r\n  \"x\": 1\r\n}\r\n");   // CRLF must survive
  await writeFile(join(week, "sheet.pdf"), Buffer.concat([Buffer.from("%PDF-1.7\n"), randomBytes(200_000)]));
  await writeFile(join(week, "digest.md"), "# digest\n");
});

after(async () => {
  server.close();
  await rm(root, { recursive: true, force: true });
});

const config = () => ({ url: `${base}/exec`, token: TOKEN });
const quiet = () => {};

test("publicName follows the date — parashah — ref pattern", () => {
  assert.equal(
    publicName({ shabbat: { civil: "2026-10-17", parashah: { en: "Noach" } }, haftarah: { ref: "Isaiah 54:1-55:5" } }),
    "2026-10-17 Noach — Isaiah 54.1-55.5.pdf",
  );
  assert.equal(
    publicName({ shabbat: { civil: "2026-12-12", parashah: { en: "Vayeshev" }, special: "Shabbat Chanukah" }, haftarah: { ref: "Zechariah 2:14-4:7" } }),
    "2026-12-12 Vayeshev — Zechariah 2.14-4.7.pdf",
  );
  assert.throws(() => publicName({ shabbat: { civil: "2026-10-17" }, haftarah: {} }), /parashah/);
});

test("planFiles picks the public PDF and the working set, optional files only when present", async () => {
  const plan = await planFiles(week);
  assert.equal(plan.slug, "2026-10-17-noach");
  assert.deepEqual(
    plan.files.map(f => `${f.target}:${f.name}`),
    [
      "public:2026-10-17 Noach — Isaiah 54.1-55.5.pdf",
      "working:sheet.json",
      "working:candidates.json",
      "working:digest.md",
      "working:2026-10-17 Noach — Isaiah 54.1-55.5.pdf",
    ],
  );
  assert.deepEqual((await planFiles(week, { only: "public" })).files.map(f => f.target), ["public"]);
  assert.ok((await planFiles(week, { only: "working" })).files.every(f => f.target === "working"));
});

test("planFiles refuses a week without its PDF", async () => {
  const bare = join(root, "weeks", "bare");
  await mkdir(bare, { recursive: true });
  await writeFile(join(bare, "sheet.json"), "{}");
  await assert.rejects(planFiles(bare), /missing candidates\.json, sheet\.pdf/);
});

test("deliver uploads byte-exact through the 302-to-GET redirect", async () => {
  drive.clear(); seen.length = 0; mode = "ok";
  const lines = [];
  const results = await deliver(week, { config: config(), log: l => lines.push(l) });
  assert.equal(results.length, 5);

  for (const [key, local] of [
    ["public/2026-10-17 Noach — Isaiah 54.1-55.5.pdf", "sheet.pdf"],
    ["working/2026-10-17-noach/2026-10-17 Noach — Isaiah 54.1-55.5.pdf", "sheet.pdf"],
    ["working/2026-10-17-noach/candidates.json", "candidates.json"],
    ["working/2026-10-17-noach/digest.md", "digest.md"],
  ]) {
    assert.ok(drive.get(key)?.equals(await readFile(join(week, local))), key);
  }
  // every POST was followed by a GET of the echo URL
  assert.equal(seen.filter(s => s.method === "POST" && s.path === "/exec").length, 5);
  assert.equal(seen.filter(s => s.method === "GET" && s.path === "/echo").length, 5);
  assert.match(lines.at(-2), /^Public folder: +https:\/\/drive\.example\/folders\/PUB$/);
  assert.match(lines.at(-1), /^Working folder: https:\/\/drive\.example\/folders\/WORK-2026-10-17-noach$/);
  assert.ok(lines.every(l => !l.includes(TOKEN)));
});

test("deliver fails loudly on a sha256 mismatch", async () => {
  mode = "badsha";
  await assert.rejects(deliver(week, { config: config(), log: quiet }), /CHECKSUM MISMATCH/);
  mode = "ok";
});

test("deliver retries once after a 5xx", async () => {
  mode = "fail5xx-once"; fiveHundreds = 0;
  const r = await deliver(week, { only: "public", config: config(), log: quiet });
  assert.equal(r.length, 1);
  assert.equal(fiveHundreds, 2);
  mode = "ok";
});

test("deliver reports a refused token without echoing it", async () => {
  const err = await deliver(week, { only: "public", config: { url: `${base}/exec`, token: "wrong-token-xyz" }, log: quiet }).catch(e => e);
  assert.match(err.message, /unauthorized/);
  assert.ok(!err.message.includes("wrong-token-xyz"));
});

test("dry run makes no requests", async () => {
  seen.length = 0;
  const lines = [];
  await deliver(week, { dryRun: true, log: l => lines.push(l) });
  assert.equal(seen.length, 0);
  assert.equal(lines.length, 5);
  assert.match(lines[0], /^public +Haftarah\/2026-10-17 Noach — Isaiah 54\.1-55\.5\.pdf/);
});

test("loadConfig: flags over env over file; missing config is an error", async () => {
  const home = await mkdtemp(join(tmpdir(), "home-"));
  await assert.rejects(loadConfig({ env: {}, home }), /drop box not configured \(missing url and token\)/);
  await writeFile(join(home, ".haftarah-dropbox.json"), JSON.stringify({ url: "https://file/exec", token: "filetok" }));
  assert.deepEqual(await loadConfig({ env: {}, home }), { url: "https://file/exec", token: "filetok" });
  assert.deepEqual(
    await loadConfig({ env: { HAFTARAH_DROPBOX_URL: "https://env/exec" }, home }),
    { url: "https://env/exec", token: "filetok" },
  );
  assert.deepEqual(
    await loadConfig({ flags: { token: "flagtok" }, env: { HAFTARAH_DROPBOX_TOKEN: "envtok" }, home }),
    { url: "https://file/exec", token: "flagtok" },
  );
  await rm(home, { recursive: true, force: true });
});

test("CLI exits 1 with a clear message when not configured", async () => {
  // isolatedEnv: HOME and USERPROFILE in a temp folder, no tokens, so the child can never deliver for real.
  const { env, cleanup } = await isolatedEnv();
  try {
    const err = await run(process.execPath, [script, week], { env }).catch(e => e);
    assert.equal(err.code, 1);
    assert.match(err.stderr, /deliver: drop box not configured/);
    const ok = await run(process.execPath, [script, week, "--dry-run"], { env });
    assert.match(ok.stdout, /working +Haftarah working\/2026-10-17-noach\/sheet\.json/);
  } finally { await cleanup(); }
});

test("CLI uploads with config from env", async () => {
  const { env, cleanup } = await isolatedEnv({ HAFTARAH_DROPBOX_URL: `${base}/exec`, HAFTARAH_DROPBOX_TOKEN: TOKEN });
  try {
    seen.length = 0;
    const { stdout } = await run(process.execPath, [script, week, "--only", "working", "--no-web"], { env });
    assert.match(stdout, /working +sheet\.json .* sha256 ok/);
    assert.ok(!stdout.includes(TOKEN));
    assert.ok(!/^web /m.test(stdout) && !/Page:/.test(stdout), "no web publish");
    // Every upload reached the local stub (POST /exec, then GET /echo for the reply), nothing else.
    assert.ok(seen.length > 0 && seen.every(r => (r.method === "POST" && r.path === "/exec") || (r.method === "GET" && r.path === "/echo")));
    assert.equal(seen.filter(r => r.path === "/exec").length, (stdout.match(/sha256 ok/g) || []).length);
  } finally { await cleanup(); }
});

test("deliver runs publish after the Drive uploads when a web config is given", async () => {
  drive.clear(); mode = "ok";
  const lines = [];
  const calls = [];
  await deliver(week, { only: "public", config: config(), log: l => lines.push(l), webConfig: { token: "webtok" }, publishImpl: async (dir, o) => { calls.push({ dir, token: o.config.token }); o.log("web      weeks/x/sheet.json  1 KB  https://example/x"); } });
  assert.deepEqual(calls, [{ dir: week, token: "webtok" }]);
  assert.ok(lines.findIndex(l => l.startsWith("Public folder:")) < lines.findIndex(l => l.startsWith("web ")), "Drive first, then the web");
});

test("deliver passes side through to publish: true by default, false for --no-side", async () => {
  drive.clear(); mode = "ok";
  const seen = [];
  const publishImpl = async (dir, o) => { seen.push(o.side); };
  await deliver(week, { only: "public", config: config(), log: () => {}, webConfig: { token: "webtok" }, publishImpl });
  await deliver(week, { only: "public", config: config(), log: () => {}, webConfig: { token: "webtok" }, publishImpl, side: false });
  assert.deepEqual(seen, [true, false]);
});

test("deliver skips the web without a web config", async () => {
  drive.clear(); mode = "ok";
  let called = 0;
  await deliver(week, { only: "public", config: config(), log: quiet, publishImpl: async () => { called++; } });
  assert.equal(called, 0);
});

test("planFiles names the PDF from the haftarah of a schema-3 week", async () => {
  const w3 = join(root, "weeks", "2026-10-24-lech-lecha");
  await mkdir(w3, { recursive: true });
  const two = JSON.parse(await readFile(join(week, "sheet.json"), "utf8"));
  Object.assign(two, { slug: "2026-10-24-lech-lecha" });
  two.shabbat.civil = "2026-10-24"; two.shabbat.parashah.en = "Lech-Lecha"; two.haftarah.ref = "Isaiah 40:27-41:16";
  await writeFile(join(w3, "sheet.json"), JSON.stringify(migrate3(two), null, 2));
  await writeFile(join(w3, "candidates.json"), "{}");
  await writeFile(join(w3, "sheet.pdf"), "%PDF-1.7\n");
  const plan = await planFiles(w3);
  assert.equal(plan.publicName, "2026-10-24 Lech-Lecha — Isaiah 40.27-41.16.pdf");
});

test("a week with a Torah reading sends both PDFs, each named with its reading, and refuses without the Torah PDF", async () => {
  const w = join(root, "weeks", "2026-10-17-noach-torah");
  await mkdir(w, { recursive: true });
  const one = JSON.parse(await readFile(join(week, "sheet.json"), "utf8"));
  await writeFile(join(w, "sheet.json"), JSON.stringify(makeWeekTorah(one), null, 2));
  await writeFile(join(w, "candidates.json"), "{}");
  await writeFile(join(w, "candidates-torah.json"), "{}");
  await writeFile(join(w, "sheet.pdf"), "%PDF-1.7\nh\n");
  await assert.rejects(planFiles(w), /missing sheet-torah\.pdf \(the sheet has a Torah reading; run build\.mjs\)/);
  await writeFile(join(w, "sheet-torah.pdf"), "%PDF-1.7\nt\n");
  const plan = await planFiles(w);
  assert.deepEqual(plan.files.map(f => `${f.target}:${f.name}`), [
    "public:2026-10-17 Noach Torah — Genesis 6.9-11.pdf",
    "public:2026-10-17 Noach Haftarah — Isaiah 54.1-55.5.pdf",
    "working:sheet.json",
    "working:candidates.json",
    "working:candidates-torah.json",
    "working:2026-10-17 Noach Torah — Genesis 6.9-11.pdf",
    "working:2026-10-17 Noach Haftarah — Isaiah 54.1-55.5.pdf",
  ]);
  assert.equal(plan.publicName, "2026-10-17 Noach Haftarah — Isaiah 54.1-55.5.pdf");
});

test("deliver never ships a stale PDF: a PDF older than sheet.json is refused with a one-line message", async () => {
  const w = join(root, "weeks", "2026-10-17-noach-stale");
  await mkdir(w, { recursive: true });
  const one = JSON.parse(await readFile(join(week, "sheet.json"), "utf8"));
  await writeFile(join(w, "sheet.json"), JSON.stringify(makeWeekTorah(one), null, 2));
  await writeFile(join(w, "candidates.json"), "{}");
  await writeFile(join(w, "sheet.pdf"), "%PDF-1.7\nh\n");
  await writeFile(join(w, "sheet-torah.pdf"), "%PDF-1.7\nt\n");
  await planFiles(w);   // fresh: fine
  const past = new Date(Date.now() - 60_000), now = new Date();
  await utimes(join(w, "sheet-torah.pdf"), past, past);
  await utimes(join(w, "sheet.json"), now, now);
  await assert.rejects(planFiles(w), err => /^.*sheet-torah\.pdf is older than sheet\.json; run build\.mjs$/.test(err.message) && !err.message.includes("\n"));
  await assert.rejects(deliver(w, { config: { url: `${base}/exec`, token: TOKEN }, log: () => {} }), /older than sheet\.json/);
  await utimes(join(w, "sheet-torah.pdf"), now, now);
  await utimes(join(w, "sheet.pdf"), past, past);
  // A Torah week checks both: `build --reading torah` after a haftarah edit leaves sheet.pdf stale.
  await assert.rejects(planFiles(w), err => /^sheet\.pdf is older than sheet\.json; run build\.mjs$/.test(err.message));
  await utimes(join(w, "sheet.pdf"), now, now);
  await planFiles(w);   // both fresh again: fine
});

test("a haftarah-only week whose sheet.pdf is older than sheet.json still plans and dry-runs (no mtime check on that path)", async () => {
  const past = new Date(Date.now() - 60_000), now = new Date();
  await utimes(join(week, "sheet.pdf"), past, past);
  await utimes(join(week, "sheet.json"), now, now);
  const plan = await planFiles(week);
  assert.equal(plan.publicName, "2026-10-17 Noach — Isaiah 54.1-55.5.pdf");
  assert.deepEqual(await deliver(week, { dryRun: true, log: () => {} }), []);
});

test("deliver passes cache and customs through to the publish step", async () => {
  const got = {};
  await deliver(week, { config: { url: `${base}/exec`, token: TOKEN }, webConfig: { token: "t" }, log: () => {}, publishImpl: async (dir, opts) => { Object.assign(got, opts); return { urls: {}, page: "" }; }, cache: "/tmp/cache-x", customs: { id: "test" } });
  assert.equal(got.cache, "/tmp/cache-x");
  assert.equal(got.customs.id, "test");
});
