import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { writeFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { dumpDom, screenshot, parseBrowserVersion, printSignature, sha256 } from "../scripts/chrome.mjs";

// A stand-in for a spawned Chrome: `script(child)` decides what it writes and when it exits.
function fakeSpawn(script) {
  const calls = [];
  const spawnImpl = (cmd, args, opts) => {
    const child = new EventEmitter();
    child.stdout = new PassThrough(); child.stderr = new PassThrough();
    child.killed = false;
    child.kill = () => { child.killed = true; setTimeout(() => child.emit("close", null), 5); return true; };
    calls.push({ cmd, args, opts, child });
    setImmediate(() => script(child));
    return child;
  };
  return { spawnImpl, calls };
}

test("dumpDom decodes UTF-8 once, so a chunk boundary inside a Hebrew letter is harmless", async () => {
  const body = Buffer.from("<html><body>שָׁלוֹם</body></html>", "utf8");
  const { spawnImpl, calls } = fakeSpawn(child => {
    child.stdout.write(body.subarray(0, 13));   // "<html><body>" is 12 bytes; byte 13 is the first half of ש
    child.stdout.write(body.subarray(13));
    child.stdout.end();
    setTimeout(() => child.emit("close", 0), 20);
  });
  const dom = await dumpDom("chrome", "file:///x.html", { size: "1440,900", spawnImpl });
  assert.equal(dom, "<html><body>שָׁלוֹם</body></html>");
  assert.ok(calls[0].args.includes("--window-size=1440,900"));
  assert.ok(calls[0].args.includes("--dump-dom"));
  assert.equal(calls[0].args.at(-1), "file:///x.html");
});

test("dumpDom kills a Chrome that does not finish", async () => {
  const { spawnImpl, calls } = fakeSpawn(() => {});   // never writes, never exits
  await assert.rejects(dumpDom("chrome", "file:///hang.html", { timeoutMs: 50, spawnImpl }), /did not finish file:\/\/\/hang\.html within 50ms; killed/);
  assert.equal(calls[0].child.killed, true);
});

test("dumpDom reports Chrome's exit code and the end of its stderr", async () => {
  const { spawnImpl } = fakeSpawn(child => { child.stderr.write("GPU process crashed"); child.stderr.end(); setTimeout(() => child.emit("close", 21), 10); });
  await assert.rejects(dumpDom("chrome", "file:///x.html", { spawnImpl }), /dump-dom exited 21[\s\S]*GPU process crashed/);
});

test("dumpDom settles right after the kill even if the child never closes (a helper holding stdout on Windows)", async () => {
  const { spawnImpl, calls } = fakeSpawn(() => {});
  // This child ignores the kill: no "exit", no "close", ever.
  const stubborn = (...a) => { const c = spawnImpl(...a); c.kill = () => { c.killed = true; return true; }; return c; };
  const started = Date.now();
  await assert.rejects(dumpDom("chrome", "file:///stuck.html", { timeoutMs: 50, spawnImpl: stubborn }), /did not finish file:\/\/\/stuck\.html within 50ms; killed/);
  assert.ok(Date.now() - started < 2000, "settled promptly after the kill");
  assert.equal(calls[0].child.killed, true);
  assert.equal(calls[0].child.stdout.destroyed, true);
  assert.equal(calls[0].child.stderr.destroyed, true);
});

test("dumpDom starts Chrome with the environment it is given, and process.env by default", async () => {
  const env = { PATH: "x", HOME: "/nowhere" };
  const { spawnImpl, calls } = fakeSpawn(child => { child.stdout.end("<html></html>"); setTimeout(() => child.emit("close", 0), 5); });
  await dumpDom("chrome", "file:///x.html", { env, spawnImpl });
  await dumpDom("chrome", "file:///y.html", { spawnImpl });
  assert.equal(calls[0].opts.env, env);
  assert.equal(calls[1].opts.env, process.env);
});

test("parseBrowserVersion names Chrome, and Edge when it is Edge", () => {
  assert.equal(parseBrowserVersion("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/155.0.0.0 Safari/537.36"), "HeadlessChrome/155.0.0.0");
  assert.equal(parseBrowserVersion("AppleWebKit/537.36 HeadlessChrome/131.0.0.0 Safari/537.36 Edg/131.0.2903.70"), "HeadlessChrome/131.0.0.0 Edg/131.0.2903.70");
  assert.equal(parseBrowserVersion(""), "unknown");
});

test("printSignature keeps the stamped <html> tag and the sheet, nothing else", () => {
  const dom = '<html lang="en" data-pages="2" data-keys="a,b"><head><title>t</title></head><body><p class="review-note">n</p><main id="sheet" aria-label="Haftarah sheet"><section class="page">x</section></main><div id="stage">measuring</div></body></html>';
  assert.equal(printSignature(dom), '<html lang="en" data-pages="2" data-keys="a,b">\n<main id="sheet" aria-label="Haftarah sheet"><section class="page">x</section></main>');
  assert.match(sha256("x"), /^[0-9a-f]{64}$/);
});

test("screenshot passes the size and output path and resolves to the path once the file exists", async () => {
  const dir = await mkdtemp(join(tmpdir(), "shot-"));
  const out = join(dir, "a.png");
  try {
    const { spawnImpl, calls } = fakeSpawn(async child => { await writeFile(out, "png"); child.stdout.end(); child.emit("close", 0); });
    assert.equal(await screenshot("chrome", "file:///x.html", { size: "192,192", out, spawnImpl }), out);
    assert.ok(calls[0].args.includes("--window-size=192,192"));
    assert.ok(calls[0].args.includes(`--screenshot=${out}`));
    assert.equal(calls[0].args.at(-1), "file:///x.html");
    const none = fakeSpawn(child => { child.stdout.end(); child.emit("close", 0); });
    await assert.rejects(screenshot("chrome", "file:///y.html", { size: "1,1", out: join(dir, "missing.png"), spawnImpl: none.spawnImpl }), /no screenshot of file:\/\/\/y\.html/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
