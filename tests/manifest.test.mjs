import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { MANIFEST_URL } from "../site/app/contract.js";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const site = (...p) => join(ROOT, "site", ...p);
const manifest = JSON.parse(readFileSync(site("manifest.webmanifest"), "utf8"));

test("the manifest is a standalone app rooted at /", () => {
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.start_url, "/");
  assert.equal(manifest.scope, "/");
  assert.equal(manifest.id, "/");
  assert.ok(manifest.name && manifest.short_name);
});

test("every icon the manifest names exists under site/", () => {
  assert.ok(manifest.icons.length >= 3);
  for (const icon of manifest.icons) {
    assert.ok(icon.src.startsWith("/"), icon.src);
    assert.ok(existsSync(site(icon.src.slice(1))), icon.src);
  }
  assert.ok(manifest.icons.some(i => i.purpose === "maskable"), "a maskable icon");
});

test("the four icons are PNGs of their named size and stay light", () => {
  for (const [name, px] of [["icon-192.png", 192], ["icon-512.png", 512], ["maskable-512.png", 512], ["apple-touch-icon.png", 180]]) {
    const b = readFileSync(site("icons", name));
    assert.deepEqual([...b.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], `${name} signature`);
    assert.equal(b.readUInt32BE(16), px, `${name} width`);
    assert.equal(b.readUInt32BE(20), px, `${name} height`);
    assert.ok(b.length < 512 * 1024, `${name} is ${b.length} bytes`);
  }
});

test("the manifest's declared sizes match the files", () => {
  for (const icon of manifest.icons) {
    const b = readFileSync(site(icon.src.slice(1)));
    assert.equal(icon.sizes, `${b.readUInt32BE(16)}x${b.readUInt32BE(20)}`, icon.src);
  }
});

test("the three entry pages link the manifest, the touch icon and a theme colour, and no longer the mural as icon", () => {
  assert.equal(MANIFEST_URL, "/manifest.webmanifest");
  for (const page of ["index.html", "sheet.html", "library.html"]) {
    const html = readFileSync(site(page), "utf8");
    assert.ok(html.includes(`<link rel="manifest" href="${MANIFEST_URL}">`), `${page} manifest`);
    assert.match(html, /<link rel="apple-touch-icon" href="\/icons\/apple-touch-icon\.png">/, `${page} touch icon`);
    assert.match(html, /<meta name="theme-color" content="#/, `${page} theme-color`);
    assert.doesNotMatch(html, /<link rel="icon" href="\/mural\.png"/, `${page} icon`);
  }
});

test("404.html is not an entry point and links no manifest", () => {
  assert.doesNotMatch(readFileSync(site("404.html"), "utf8"), /rel="manifest"/);
});
