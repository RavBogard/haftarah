#!/usr/bin/env node
/**
 * deliver.mjs — send the week's files to Google Drive through the drop box
 * (tools/dropbox/Code.gs), byte-exact, with a sha256 check on every file.
 *
 *   node scripts/deliver.mjs weeks/<slug> [--dry-run] [--only public|working] [--url URL] [--token TOKEN]
 *   --no-web      skip the web publish (scripts/publish.mjs) that otherwise runs last
 *   --no-side     skip the web page's side files (words, translations, links)
 *
 * Config, first found wins: --url/--token; HAFTARAH_DROPBOX_URL and
 * HAFTARAH_DROPBOX_TOKEN; the JSON file at $HAFTARAH_DROPBOX_CONFIG or
 * ~/.haftarah-dropbox.json ({"url": "...", "token": "..."}).
 *
 * Public folder: sheet.pdf as "<date> <parashah> — <ref with ':' as '.'>.pdf"; a week with a Torah
 * reading sends sheet-torah.pdf too, and both names gain the reading ("<date> <parashah> Torah — …",
 * "… Haftarah — …"). In a week with a Torah reading, either PDF (sheet.pdf or sheet-torah.pdf) older
 * than sheet.json is refused (run build.mjs again); a haftarah-only week's sheet.pdf is not checked.
 * Working folder, subfolder <slug>: sheet.json, candidates.json, texts.json, digest.md, briefing.md,
 * candidates-torah.json, texts-torah.json, prior.json (those present) and the PDFs under their public names.
 *
 * After the Drive uploads the week goes to the web through publish.mjs when a Blob token is configured (~/.haftarah-web.json); --no-web skips it.
 */
import { readFile, access, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { publish, loadWebConfig } from "./publish.mjs";
import { PDF_FILES, READING_FILES, PRIOR_FILE, torahReading } from "./week-files.mjs";
import { createRequire } from "node:module";
const L = createRequire(import.meta.url)("../template/lib.js");

const REQUIRED = ["sheet.json", "candidates.json", PDF_FILES.haftarah];
const OPTIONAL = ["texts.json", "digest.md", "briefing.md", READING_FILES.torah.candidates, READING_FILES.torah.texts, PRIOR_FILE];
const MIME = { ".pdf": "application/pdf", ".json": "application/json", ".md": "text/markdown" };

function mimeOf(name) {
  const ext = name.slice(name.lastIndexOf(".")).toLowerCase();
  return MIME[ext] || "application/octet-stream";
}

async function exists(p) {
  try { await access(p); return true; } catch { return false; }
}

/** "2026-10-17 Noach — Isaiah 54.1-55.5.pdf"; with a label (a week with two readings), "2026-10-17 Noach Haftarah — …". */
export function publicName(sheet, { label = null } = {}) {
  const date = sheet?.shabbat?.civil;
  const parashah = sheet?.shabbat?.parashah?.en;
  const ref = sheet?.haftarah?.ref;
  if (!date || !parashah || !ref) {
    throw new Error("sheet.json needs shabbat.civil, shabbat.parashah.en and haftarah.ref to name the PDF");
  }
  const clean = s => String(s).replace(/:/g, ".").replace(/[\/\\]/g, "-").replace(/\s+/g, " ").trim();
  return `${clean(date)} ${clean(parashah)}${label ? ` ${label}` : ""} — ${clean(ref)}.pdf`;
}

/** What goes where. `only` is "public", "working" or undefined for both. */
export async function planFiles(dir, { only } = {}) {
  const missing = [];
  for (const f of REQUIRED) if (!(await exists(join(dir, f)))) missing.push(f);
  if (missing.length) throw new Error(`${dir} is missing ${missing.join(", ")}`);

  const sheet = JSON.parse(await readFile(join(dir, "sheet.json"), "utf8"));
  const slug = basename(resolve(dir));
  // A week with a Torah reading has two PDFs; each name says which reading it is. A week with one keeps the old name.
  const torah = torahReading(sheet);
  const pdfs = [];
  if (torah) {
    if (!(await exists(join(dir, PDF_FILES.torah)))) throw new Error(`${dir} is missing ${PDF_FILES.torah} (the sheet has a Torah reading; run build.mjs)`);
    pdfs.push({ path: join(dir, PDF_FILES.torah), name: publicName(L.readingView(sheet, torah.id), { label: "Torah" }) });
  }
  pdfs.push({ path: join(dir, PDF_FILES.haftarah), name: publicName(L.readingView(sheet, L.primaryReading(sheet).id), torah ? { label: "Haftarah" } : {}) });
  // In a two-reading week, never ship a stale PDF: both must be at least as new as the sheet they were
  // built from (a `build --reading torah` after a haftarah edit leaves sheet.pdf behind). A haftarah-only week is not checked.
  const sheetTime = (await stat(join(dir, "sheet.json"))).mtimeMs;
  for (const p of torah ? pdfs : []) {
    if ((await stat(p.path)).mtimeMs < sheetTime) throw new Error(`${basename(p.path)} is older than sheet.json; run build.mjs`);
  }
  const files = [];

  if (only !== "working") {
    for (const p of pdfs) files.push({ target: "public", name: p.name, path: p.path, mimeType: "application/pdf" });
  }
  if (only !== "public") {
    for (const f of ["sheet.json", "candidates.json"]) {
      files.push({ target: "working", slug, name: f, path: join(dir, f), mimeType: mimeOf(f) });
    }
    for (const f of OPTIONAL) {
      if (await exists(join(dir, f))) files.push({ target: "working", slug, name: f, path: join(dir, f), mimeType: mimeOf(f) });
    }
    for (const p of pdfs) files.push({ target: "working", slug, name: p.name, path: p.path, mimeType: "application/pdf" });
  }
  return { slug, publicName: pdfs[pdfs.length - 1].name, publicNames: pdfs.map(p => p.name), files };
}

/** {url, token}; throws when either is missing. Never includes the token in a message. */
export async function loadConfig({ flags = {}, env = process.env, home = homedir() } = {}) {
  let url = flags.url || env.HAFTARAH_DROPBOX_URL || "";
  let token = flags.token || env.HAFTARAH_DROPBOX_TOKEN || "";
  const file = env.HAFTARAH_DROPBOX_CONFIG || join(home, ".haftarah-dropbox.json");
  if ((!url || !token) && (await exists(file))) {
    let cfg;
    try { cfg = JSON.parse(await readFile(file, "utf8")); }
    catch { throw new Error(`${file} is not valid JSON`); }
    url ||= cfg.url || "";
    token ||= cfg.token || "";
  }
  if (!url || !token) {
    throw new Error(
      `drop box not configured (missing ${[!url && "url", !token && "token"].filter(Boolean).join(" and ")}). ` +
      `Set HAFTARAH_DROPBOX_URL and HAFTARAH_DROPBOX_TOKEN, or write {"url","token"} to ${file}. See tools/dropbox/SETUP.md.`
    );
  }
  return { url, token };
}

function sha256(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

function human(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

/**
 * POST one file. Apps Script answers a POST with a 302 to
 * script.googleusercontent.com; fetch follows it as a GET (the fetch spec
 * turns POST into GET on 301/302), which is what serves the JSON reply.
 * One retry on a network error or a 5xx.
 */
async function postFile(url, payload, fetchImpl) {
  const body = JSON.stringify(payload);
  let lastErr;
  for (let attempt = 1; attempt <= 2; attempt++) {
    let res;
    try {
      res = await fetchImpl(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
        redirect: "follow",
      });
    } catch (err) {
      lastErr = new Error(`network error: ${err.cause?.code || err.message}`);
      continue;
    }
    if (res.status >= 500) {
      lastErr = new Error(`drop box answered HTTP ${res.status}`);
      continue;
    }
    const text = await res.text();
    let reply;
    try { reply = JSON.parse(text); }
    catch {
      const hint = /<html|<!doctype/i.test(text)
        ? " (an HTML page: is the deployment set to Execute as Me / Who has access Anyone, and is the URL the /exec one?)"
        : "";
      throw new Error(`drop box did not answer JSON, HTTP ${res.status}${hint}`);
    }
    if (!reply.ok) throw new Error(`drop box refused: ${reply.error || "unknown error"}`);
    return reply;
  }
  throw lastErr;
}

/**
 * Deliver the week. Returns the per-file replies. Throws on the first failure,
 * including a sha256 mismatch.
 */
export async function deliver(dir, { only, dryRun = false, config, log = console.log, fetchImpl = globalThis.fetch, webConfig = null, publishImpl = publish, side = true, cache = undefined, customs = null } = {}) {
  const plan = await planFiles(dir, { only });

  if (dryRun) {
    for (const f of plan.files) {
      const size = (await readFile(f.path)).length;
      const where = f.target === "public" ? "Haftarah/" : `Haftarah working/${f.slug}/`;
      log(`${f.target.padEnd(7)}  ${where}${f.name}  (${human(size)}, from ${basename(f.path)})`);
    }
    return [];
  }

  const results = [];
  const folders = {};
  for (const f of plan.files) {
    const buf = await readFile(f.path);
    const local = sha256(buf);
    const payload = { token: config.token, target: f.target, name: f.name, mimeType: f.mimeType, base64: buf.toString("base64") };
    if (f.target === "working") payload.slug = f.slug;
    let reply;
    try {
      reply = await postFile(config.url, payload, fetchImpl);
    } catch (err) {
      throw new Error(`${f.target} ${f.name}: ${err.message}`);
    }
    if (reply.sha256 !== local || reply.size !== buf.length) {
      throw new Error(
        `${f.target} ${f.name}: CHECKSUM MISMATCH. Local ${buf.length} bytes sha256 ${local}; ` +
        `Drive ${reply.size} bytes sha256 ${reply.sha256}. The Drive copy (${reply.url}) is not the built file.`
      );
    }
    log(`${f.target.padEnd(7)}  ${f.name}  ${human(buf.length)}  sha256 ok  ${reply.url}`);
    folders[f.target] = reply.folderUrl;
    results.push({ ...f, ...reply });
  }
  if (folders.public) log(`Public folder:  ${folders.public}`);
  if (folders.working) log(`Working folder: ${folders.working}`);
  // The web comes last so a Drive failure never leaves the site ahead of the record.
  if (webConfig) await publishImpl(dir, { config: webConfig, log, fetchImpl, side, cache, customs });
  return results;
}

function parseArgs(argv) {
  const out = { flags: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const m = a.match(/^--(url|token|only)(?:=(.*))?$/);
    if (m) { out.flags[m[1]] = m[2] ?? argv[++i]; continue; }
    if (a === "--no-web") { out.noWeb = true; continue; }
    if (a === "--no-side") { out.noSide = true; continue; }
    if (a === "--dry-run") { out.dryRun = true; continue; }
    if (a.startsWith("--")) throw new Error(`unknown option ${a}`);
    if (out.dir) throw new Error(`one week folder only (got ${out.dir} and ${a})`);
    out.dir = a;
  }
  if (!out.dir) throw new Error("usage: node scripts/deliver.mjs weeks/<slug> [--dry-run] [--only public|working] [--no-web] [--no-side]");
  if (out.flags.only && !["public", "working"].includes(out.flags.only)) throw new Error("--only takes public or working");
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const only = args.flags.only;
  if (args.dryRun) {
    await deliver(args.dir, { only, dryRun: true });
    if (!args.noWeb) await publish(args.dir, { dryRun: true, side: !args.noSide });
    return;
  }
  const config = await loadConfig({ flags: { url: args.flags.url, token: args.flags.token } });
  let webConfig = null;
  if (args.noWeb) console.log("Web: skipped (--no-web).");
  else {
    try { webConfig = await loadWebConfig(); }
    catch (err) { console.log(`Web: skipped; ${err.message}`); }
  }
  await deliver(args.dir, { only, config, webConfig, side: !args.noSide });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch(err => {
    console.error(`deliver: ${err.message}`);
    process.exit(1);
  });
}
