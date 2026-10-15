import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const CSP = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'self'; connect-src 'self' https://www.sefaria.org; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'";
const site = (...p) => join(ROOT, "site", ...p);

test("vercel.json sends the Content-Security-Policy on every page and not on /data/", () => {
  const v = JSON.parse(readFileSync(join(ROOT, "vercel.json"), "utf8"));
  const entry = v.headers.find(h => h.headers.some(x => x.key === "Content-Security-Policy"));
  assert.equal(entry.source, "/((?!data/).*)");
  assert.equal(entry.headers.find(x => x.key === "Content-Security-Policy").value, CSP);
  const re = new RegExp(`^${entry.source}$`);
  for (const p of ["/", "/2026-10-17-noach", "/sheet.html", "/app/sheet.js"]) assert.ok(re.test(p), p);
  for (const p of ["/data/index.json", "/data/weeks/2026-10-17-noach/sheet.pdf"]) assert.ok(!re.test(p), p);
});

test("site pages load scripts only from files", () => {
  for (const f of readdirSync(site()).filter(f => f.endsWith(".html"))) {
    const tags = readFileSync(site(f), "utf8").match(/<script\b[^>]*>/g) || [];
    assert.deepEqual(tags.filter(t => !/\ssrc=/.test(t)), [], f);
  }
});

test("no style attribute in the site's markup or in the markup its scripts write", () => {
  const files = [...readdirSync(site()).filter(f => f.endsWith(".html")).map(f => site(f)), ...readdirSync(site("app")).filter(f => f.endsWith(".js")).map(f => site("app", f))];
  assert.deepEqual(files.filter(f => /\sstyle\s*=\s*["'`]/.test(readFileSync(f, "utf8"))), []);
});
