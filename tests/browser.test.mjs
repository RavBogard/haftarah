// check.mjs and web-check.mjs inside npm test. Both need Chrome or Edge; without one they are skipped
// with a message, never failed. Each works in its own temp folder, so it cannot collide with the
// print golden building the fixtures in place.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, copyFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { isolatedEnv } from "./helpers/isolatedEnv.mjs";
import { findBrowser } from "../scripts/build.mjs";
import { parseArgs } from "../scripts/web-check.mjs";

const run = promisify(execFile);
const ROOT = fileURLToPath(new URL("..", import.meta.url));
const skip = findBrowser() ? false : "no Chrome or Edge on this machine (set HAFTARAH_BROWSER to run the browser checks)";

test("web-check parseArgs: the week is the one argument that is neither a flag nor a flag's value", () => {
  assert.deepEqual(parseArgs([]), { week: null, port: null, out: null, serve: false });
  assert.deepEqual(parseArgs(["--out", "/tmp/d", "weeks/x"]), { week: "weeks/x", port: null, out: "/tmp/d", serve: false });
  assert.deepEqual(parseArgs(["weeks/x", "--serve", "--port", "9000"]), { week: "weeks/x", port: 9000, out: null, serve: true });
});

for (const name of ["week-min", "week-notes"]) {
  test(`check.mjs passes on ${name}`, { skip, timeout: 240_000 }, async () => {
    const iso = await isolatedEnv();
    try {
      const dir = join(iso.home, name);
      await mkdir(dir);
      await copyFile(join(ROOT, "tests", "fixtures", name, "sheet.json"), join(dir, "sheet.json"));
      await run(process.execPath, [join(ROOT, "scripts", "build.mjs"), dir, "--no-pdf"], { env: iso.env, cwd: ROOT, maxBuffer: 1 << 24 });
      const { stdout } = await run(process.execPath, [join(ROOT, "scripts", "check.mjs"), dir], { env: iso.env, cwd: ROOT, maxBuffer: 1 << 24 });
      assert.match(stdout, /Check passed\./);
    } finally { await iso.cleanup(); }
  });
}

test("web-check passes at desktop and phone widths", { skip, timeout: 300_000 }, async () => {
  const iso = await isolatedEnv();
  try {
    const { stdout } = await run(process.execPath, [join(ROOT, "scripts", "web-check.mjs"), "--out", join(iso.home, "dist")], { env: iso.env, cwd: ROOT, maxBuffer: 1 << 24 });
    assert.match(stdout, /All web checks passed\./);
  } finally { await iso.cleanup(); }
});
