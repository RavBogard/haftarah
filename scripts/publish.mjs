#!/usr/bin/env node
/**
 * publish.mjs — put one week on the web: its cleaned sheet.json and its PDF into the Vercel Blob
 * store the site reads, then the index of every published week.
 *
 *   node scripts/publish.mjs weeks/<slug> [--dry-run] [--token TOKEN] [--store URL] [--api URL]
 *
 * Config, first found wins: --token; HAFTARAH_BLOB_TOKEN; the JSON file at
 * $HAFTARAH_WEB_CONFIG or ~/.haftarah-web.json ({"token": "..."}). The token is never printed, and a
 * token for any store but STORE_ID is refused before anything is uploaded.
 *
 * --store is the public store origin (https://<id>.public.blob.vercel-storage.com); without it the
 * origin of the first upload's url is used. --api overrides the Blob API base (tests, outages).
 */
import { readFile, access } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { SLUG, weekPath, INDEX_PATH } from "../site/app/contract.js";

const L = createRequire(import.meta.url)("../template/lib.js");

export const SITE = "https://haftarah.centralreform.org";
export const BLOB_API = "https://vercel.com/api/blob";
// The site's Blob store. Its lowercase form is the host in vercel.json's /data rewrite, so a token
// for any other store would publish where the site never reads.
export const STORE_ID = "wOGdAqvPmTFjKrmY";
const API_VERSION = "13";
const MAX_AGE = { json: 60, pdf: 3600 };
// Schema 2's top-level fields; anything else (candidates, drafts) stays home.
const SCHEMA2 = ["schema", "slug", "shabbat", "series", "haftarah", "verses", "glosses", "commentary", "openingNote", "glossary", "nextWeek", "credits"];

async function exists(p) { try { await access(p); return true; } catch { return false; } }
const rejected = item => item && typeof item === "object" && item.status === "rejected";

// Strip every `status` key, recursively, from a copy.
function dropStatus(value) {
  if (Array.isArray(value)) return value.map(dropStatus);
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) if (k !== "status") out[k] = dropStatus(v);
    return out;
  }
  return value;
}

/** The week's data as the site shows it: no rejected items, no statuses, schema-2 fields only. */
export function cleanSheet(data) {
  const out = {};
  for (const k of SCHEMA2) if (k in data) out[k] = data[k];
  for (const k of ["commentary", "glosses", "glossary"]) if (Array.isArray(out[k])) out[k] = out[k].filter(i => !rejected(i));
  if (rejected(out.nextWeek)) out.nextWeek = null;
  return dropStatus(out);
}

/** One row of index.json. */
export function indexEntry(sheet, slug, published) {
  const s = sheet.shabbat || {}, h = sheet.haftarah || {};
  return {
    slug, civil: s.civil || "", civilDisplay: s.civilDisplay || "", hebrew: s.hebrew || "", hebrewEn: s.hebrewEn || "",
    shabbat: L.shabbatName(sheet), ref: L.enDash(h.ref || ""), book: h.book || "",
    incipit: { he: (h.incipit && h.incipit.he) || "", en: (h.incipit && h.incipit.en) || "" },
    defaultHaftarah: h.defaultHaftarah ? L.enDash(h.defaultHaftarah) : null,
    pdf: weekPath(slug, "sheet.pdf"), published,
  };
}

/** Replace or insert the week by slug; newest civil date first. */
export function upsertIndex(index, entry, now) {
  const weeks = ((index && index.weeks) || []).filter(w => w.slug !== entry.slug);
  weeks.push(entry);
  weeks.sort((a, b) => String(b.civil).localeCompare(String(a.civil)) || String(b.slug).localeCompare(String(a.slug)));
  return { schema: 1, updated: now, weeks };
}

/** "vercel_blob_rw_<storeId>_<secret>" → storeId; anything else → null. */
export function storeIdFromToken(token) {
  const m = /^vercel_blob_rw_([A-Za-z0-9]+)_/.exec(String(token || ""));
  return m ? m[1] : null;
}

/** {token}; throws when missing. The message never contains a token. */
export async function loadWebConfig({ flags = {}, env = process.env, home = homedir() } = {}) {
  // Not BLOB_READ_WRITE_TOKEN: a stray SDK token for some other project must not be picked up.
  let token = flags.token || env.HAFTARAH_BLOB_TOKEN || "";
  const file = env.HAFTARAH_WEB_CONFIG || join(home, ".haftarah-web.json");
  if (!token && (await exists(file))) {
    let cfg;
    try { cfg = JSON.parse(await readFile(file, "utf8")); }
    catch { throw new Error(`${file} is not valid JSON`); }
    token = cfg.token || "";
  }
  if (!token) {
    throw new Error(`web publishing not configured (no Blob token). Set HAFTARAH_BLOB_TOKEN, or write {"token": "..."} to ${file}. See RUNBOOK.md step 7.`);
  }
  return { token };
}

function human(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

/** PUT one blob with the headers @vercel/blob sends. Returns the API's reply (url, pathname, ...). */
export async function putBlob({ pathname, body, contentType, maxAge, token, fetchImpl = globalThis.fetch, api = BLOB_API }) {
  const headers = {
    authorization: `Bearer ${token}`,
    "x-api-version": API_VERSION,
    "x-content-type": contentType,
    "x-add-random-suffix": "0",
    "x-allow-overwrite": "1",
    "x-cache-control-max-age": String(maxAge),
    "x-vercel-blob-access": "public",
  };
  const storeId = storeIdFromToken(token);
  if (storeId) headers["x-vercel-blob-store-id"] = storeId;
  let res;
  try { res = await fetchImpl(`${api}/?pathname=${encodeURIComponent(pathname)}`, { method: "PUT", headers, body }); }
  catch (err) { throw new Error(`${pathname}: network error: ${err.cause?.code || err.message}`); }
  if (!res.ok) {
    const text = (await res.text().catch(() => "")).replace(/\s+/g, " ").slice(0, 160);
    throw new Error(`${pathname}: Blob answered HTTP ${res.status}${text ? ` (${text})` : ""}`);
  }
  const reply = await res.json().catch(() => { throw new Error(`${pathname}: Blob did not answer JSON`); });
  if (!reply.url || !String(reply.url).endsWith(`/${pathname}`)) {
    throw new Error(`${pathname}: Blob answered with an unexpected url ${reply.url || "(none)"}; expected it to end with /${pathname}`);
  }
  return reply;
}

async function fetchIndex(store, fetchImpl) {
  const url = `${store}/index.json?${Date.now()}`;   // past the CDN's copy
  let res;
  try { res = await fetchImpl(url, { method: "GET", headers: { "cache-control": "no-cache" } }); }
  catch (err) { throw new Error(`index.json: network error: ${err.cause?.code || err.message}`); }
  if (res.status === 404) return { schema: 1, weeks: [] };
  if (!res.ok) throw new Error(`index.json: Blob answered HTTP ${res.status}`);
  const text = await res.text();
  let idx;
  try { idx = JSON.parse(text); } catch { throw new Error("index.json: not JSON; the store's copy is damaged, nothing was changed"); }
  if (!idx || !Array.isArray(idx.weeks)) throw new Error("index.json: not JSON of the expected shape; nothing was changed");
  return idx;
}

/**
 * Publish the week. Returns { urls: { sheet, pdf, index }, page }. Throws on the first failure;
 * the index is uploaded last, so a failed week never changes it.
 */
export async function publish(dir, { dryRun = false, config, log = console.log, fetchImpl = globalThis.fetch, api = BLOB_API, store = null, now = () => new Date() } = {}) {
  const slug = basename(resolve(dir));
  // The folder name becomes the page address and the Blob path: it must be a real week slug.
  if (!SLUG.test(slug)) throw new Error(`publish: folder name "${slug}" is not a week slug (YYYY-MM-DD-parashah[-special])`);
  for (const f of ["sheet.json", "sheet.pdf"]) if (!(await exists(join(dir, f)))) throw new Error(`${dir} is missing ${f}`);
  const raw = JSON.parse(await readFile(join(dir, "sheet.json"), "utf8"));
  if (raw.slug && raw.slug !== slug) throw new Error(`publish: folder "${slug}" does not match sheet.json slug "${raw.slug}"`);
  const clean = cleanSheet(raw);
  const json = Buffer.from(JSON.stringify(clean), "utf8");
  const pdf = await readFile(join(dir, "sheet.pdf"));
  const paths = { sheet: weekPath(slug, "sheet.json"), pdf: weekPath(slug, "sheet.pdf"), index: INDEX_PATH };
  const page = `${SITE}/${slug}`;
  const removed = (raw.commentary || []).filter(rejected).length;

  if (dryRun) {
    log(`web      ${paths.sheet}  (${human(json.length)}; ${(clean.commentary || []).length} entries, ${(clean.glosses || []).length} glosses, ${(clean.glossary || []).length} glossary terms; ${removed} rejected entr${removed === 1 ? "y" : "ies"} removed)`);
    log(`web      ${paths.pdf}  (${human(pdf.length)})`);
    log(`web      ${paths.index}  (upsert ${slug})`);
    log(`Page:    ${page}`);
    return { urls: {}, page };
  }

  const token = config.token;
  const id = storeIdFromToken(token);
  if (!id || id.toLowerCase() !== STORE_ID.toLowerCase()) {
    throw new Error(`publish: the Blob token is for store ${id || "(unknown)"}, not the site's store ${STORE_ID}; nothing uploaded`);
  }
  const urls = {};
  const r1 = await putBlob({ pathname: paths.sheet, body: json, contentType: "application/json", maxAge: MAX_AGE.json, token, fetchImpl, api });
  urls.sheet = r1.url;
  log(`web      ${paths.sheet}  ${human(json.length)}  ${r1.url}`);
  const r2 = await putBlob({ pathname: paths.pdf, body: pdf, contentType: "application/pdf", maxAge: MAX_AGE.pdf, token, fetchImpl, api });
  urls.pdf = r2.url;
  log(`web      ${paths.pdf}  ${human(pdf.length)}  ${r2.url}`);

  const origin = store || new URL(r1.url).origin;
  const stamp = now().toISOString().replace(/\.\d{3}Z$/, "Z");
  const index = upsertIndex(await fetchIndex(origin, fetchImpl), indexEntry(clean, slug, stamp), stamp);
  const body = Buffer.from(JSON.stringify(index), "utf8");
  const r3 = await putBlob({ pathname: paths.index, body, contentType: "application/json", maxAge: MAX_AGE.json, token, fetchImpl, api });
  urls.index = r3.url;
  log(`web      ${paths.index}  ${human(body.length)}  ${r3.url}  (${index.weeks.length} week${index.weeks.length === 1 ? "" : "s"})`);
  log(`Page:    ${page}`);
  return { urls, page };
}

function parseArgs(argv) {
  const out = { flags: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const m = a.match(/^--(token|store|api)(?:=(.*))?$/);
    if (m) { out.flags[m[1]] = m[2] ?? argv[++i]; continue; }
    if (a === "--dry-run") { out.dryRun = true; continue; }
    if (a.startsWith("--")) throw new Error(`unknown option ${a}`);
    if (out.dir) throw new Error(`one week folder only (got ${out.dir} and ${a})`);
    out.dir = a;
  }
  if (!out.dir) throw new Error("usage: node scripts/publish.mjs weeks/<slug> [--dry-run] [--token TOKEN] [--store URL] [--api URL]");
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const opts = { api: args.flags.api || process.env.HAFTARAH_BLOB_API || BLOB_API, store: args.flags.store || null };
  if (args.dryRun) { await publish(args.dir, { ...opts, dryRun: true }); return; }
  const config = await loadWebConfig({ flags: { token: args.flags.token } });
  await publish(args.dir, { ...opts, config });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch(err => { console.error(err.message.startsWith("publish: ") ? err.message : `publish: ${err.message}`); process.exit(1); });
}
