#!/usr/bin/env node
/**
 * chrome.mjs — the one way the scripts read a page rendered by headless Chrome: check.mjs (the
 * printed layout), web-check.mjs (the site) and golden.mjs (the print golden).
 *
 * dumpDom collects Chrome's output as bytes and decodes it once at the end: decoding chunk by chunk
 * breaks a Hebrew letter whose two bytes straddle a chunk boundary. It kills a Chrome that does not
 * finish in time instead of hanging the check.
 */
import { spawn } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { chromeFlags } from "./build.mjs";

export const DUMP_TIMEOUT_MS = 90_000;
const span = ms => (ms >= 1000 ? `${Math.round(ms / 1000)}s` : `${ms}ms`);

/**
 * The DOM after the page's scripts ran. `size` ("1440,900") sets the window; `env` is Chrome's
 * environment (tests pass isolatedEnv's). On timeout the child is killed, its pipes destroyed and the
 * promise rejected at once: on Windows a surviving helper can hold stdout open, so "close" may never come.
 */
export async function dumpDom(browser, url, { size = null, timeoutMs = DUMP_TIMEOUT_MS, spawnImpl = spawn, env = process.env } = {}) {
  const profile = join(tmpdir(), `haftarah-dom-${process.pid}-${Math.random().toString(36).slice(2)}`);
  await mkdir(profile, { recursive: true });
  const args = [...chromeFlags(profile), ...(size ? [`--window-size=${size}`] : []), "--dump-dom", url];
  try {
    return await new Promise((resolve, reject) => {
      const child = spawnImpl(browser, args, { stdio: ["ignore", "pipe", "pipe"], env });
      const out = [], err = [];
      let settled = false;
      const settle = (fn, value) => { if (!settled) { settled = true; clearTimeout(timer); fn(value); } };
      child.stdout.on("data", d => out.push(Buffer.from(d)));
      child.stderr.on("data", d => err.push(Buffer.from(d)));
      const timer = setTimeout(() => {
        try { child.kill(); } catch {}
        child.stdout.destroy(); child.stderr.destroy();
        settle(reject, new Error(`Chrome did not finish ${url} within ${span(timeoutMs)}; killed`));
      }, timeoutMs);
      child.on("error", e => settle(reject, e));
      child.on("close", code => {
        if (code !== 0) return settle(reject, new Error(`dump-dom exited ${code}\n${Buffer.concat(err).toString("utf8").slice(-500)}`));
        settle(resolve, Buffer.concat(out).toString("utf8"));
      });
    });
  } finally {
    await rm(profile, { recursive: true, force: true }).catch(() => {});
  }
}

/** "HeadlessChrome/155.0.0.0", plus "Edg/…" for Edge, from a user agent or a page that shows one. */
export function parseBrowserVersion(text) {
  const chrome = /(?:Headless)?Chrome\/[\d.]+/.exec(text || ""), edge = /Edg\/[\d.]+/.exec(text || "");
  return [chrome && chrome[0], edge && edge[0]].filter(Boolean).join(" ") || "unknown";
}

export async function browserVersion(browser, opts = {}) {
  const page = "data:text/html,<body><script>document.body.textContent=navigator.userAgent</script></body>";
  return parseBrowserVersion(await dumpDom(browser, page, opts));   // opts: { env, timeoutMs, … } as dumpDom
}

/** What prints, as one string: the <html> tag render.js stamps (pages, keys, divine-name count) and the whole sheet. */
export function printSignature(dom) {
  const root = (String(dom).match(/<html[^>]*>/) || [""])[0];
  const main = (String(dom).match(/<main id="sheet"[\s\S]*?<\/main>/) || [""])[0];
  return `${root}\n${main}`;
}

export const sha256 = s => createHash("sha256").update(String(s), "utf8").digest("hex");
