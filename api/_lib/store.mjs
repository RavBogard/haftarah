// api/_lib/store.mjs — the private working store (haftarah-working) and its in-memory twin, and how a
// week moves between the store and a folder on disk, where the scripts work.
import { readFile, writeFile, mkdir, access } from "node:fs/promises";
import { join, extname, resolve, sep } from "node:path";
import { putBlob, getBlob, listBlobs, storeIdFromToken, blobOrigin, BLOB_API } from "../../scripts/publish.mjs";
import { WORKING_STORE_ID } from "./env.mjs";
import { SLUG } from "../../site/app/contract.js";

export const WEEK_FILES = ["sheet.json", "status.json", "candidates.json", "candidates-torah.json", "texts.json", "texts-torah.json", "prior.json", "digest.md", "briefing.md", "sheet.html", "sheet-torah.html", "sheet-trope.html", "sheet.pdf", "sheet-torah.pdf", "sheet-trope.pdf", "words.json", "translations.json", "links.json"];
const TYPES = { ".json": "application/json", ".md": "text/markdown; charset=utf-8", ".html": "text/html; charset=utf-8", ".pdf": "application/pdf", ".jpg": "image/jpeg", ".png": "image/png", ".txt": "text/plain; charset=utf-8" };
const BLOB_API_VERSION = "13";   // the x-api-version scripts/publish.mjs sends
export const contentTypeOf = name => TYPES[extname(name).toLowerCase()] || "application/octet-stream";

/**
 * fetchImpl with `signal` added to every request (joined with the request's own signal when it has one); with no
 * signal, fetchImpl itself. The server's per-call deadline reaches every upstream request this way.
 */
export function withSignal(fetchImpl, signal) {
  if (!signal || typeof fetchImpl !== "function") return fetchImpl;
  return (url, init = {}) => fetchImpl(url, { ...init, signal: init.signal ? AbortSignal.any([init.signal, signal]) : signal });
}
/** The store with its requests bound to `signal`; a store that makes no requests (MemoryStore) is itself. */
export const storeWithSignal = (store, signal) => (signal && store && typeof store.withSignal === "function" ? store.withSignal(signal) : store);

export class MemoryStore {
  constructor() { this.files = new Map(); }
  async get(pathname) { const f = this.files.get(pathname); return f ? Buffer.from(f.body) : null; }
  async put(pathname, body, contentType = contentTypeOf(pathname)) { this.files.set(pathname, { body: Buffer.from(body), contentType, uploadedAt: new Date().toISOString() }); }
  async list(prefix) { return [...this.files.entries()].filter(([p]) => p.startsWith(prefix)).map(([pathname, f]) => ({ pathname, size: f.body.length, contentType: f.contentType, uploadedAt: f.uploadedAt })); }
  /** Remove the named paths; a path not there is no error. */
  async del(pathnames) { for (const p of [].concat(pathnames)) this.files.delete(p); }
}

export class BlobStore {
  constructor({ token, fetchImpl = globalThis.fetch, api = undefined }) {
    if (!token) throw new Error("HAFTARAH_WORKING_READ_WRITE_TOKEN is not set");
    const id = storeIdFromToken(token);
    if (!id || id.toLowerCase() !== WORKING_STORE_ID.toLowerCase()) throw new Error(`the working token is for store ${id || "(unknown)"}, not the private store ${WORKING_STORE_ID}; refused`);
    this.token = token; this.fetchImpl = fetchImpl; this.api = api;
  }
  /** The same store, every request carrying `signal` (the tool call's deadline). */
  withSignal(signal) { return new BlobStore({ token: this.token, fetchImpl: withSignal(this.fetchImpl, signal), api: this.api }); }
  async get(pathname) { const res = await getBlob({ pathname, token: this.token, access: "private", fetchImpl: this.fetchImpl }); return res ? Buffer.from(await res.arrayBuffer()) : null; }
  async put(pathname, body, contentType = contentTypeOf(pathname)) { await putBlob({ pathname, body, contentType, maxAge: 0, token: this.token, fetchImpl: this.fetchImpl, access: "private", ...(this.api ? { api: this.api } : {}) }); }
  async list(prefix) { return (await listBlobs({ token: this.token, prefix, fetchImpl: this.fetchImpl, access: "private", ...(this.api ? { api: this.api } : {}) })).map(b => ({ pathname: b.pathname, size: b.size, contentType: b.contentType, uploadedAt: b.uploadedAt })); }
  /** Remove the named paths through Blob's delete API (by their URLs on the private origin); a path not there is no error. */
  async del(pathnames) {
    const list = [].concat(pathnames);
    if (!list.length) return;
    const origin = blobOrigin(this.token, "private");
    const headers = { authorization: `Bearer ${this.token}`, "x-api-version": BLOB_API_VERSION, "content-type": "application/json", "x-vercel-blob-store-id": storeIdFromToken(this.token) };
    const body = JSON.stringify({ urls: list.map(p => `${origin}/${p}`) });
    let res;
    try { res = await this.fetchImpl(`${this.api || BLOB_API}/delete`, { method: "POST", headers, body }); }
    catch (err) { throw new Error(`deleting ${list.join(", ")}: network error: ${err.cause?.code || err.message}`); }
    if (!res.ok) throw new Error(`deleting ${list.join(", ")}: Blob answered HTTP ${res.status}`);
  }
}

/** The store prefix of one week; a slug that is not a week slug is refused. */
export function weekPrefix(slug) {
  if (!SLUG.test(String(slug ?? ""))) throw new Error(`not a week slug: ${slug}`);
  return `weeks/${slug}/`;
}
/** A file name inside a week folder: relative, forward slashes, no ".." segment, and resolving inside dir. */
export function safeName(name, dir) {
  const n = String(name ?? "");
  if (!n || n.startsWith("/") || n.startsWith("\\") || n.includes("\\") || n.split("/").includes("..")) throw new Error(`unsafe file name: ${n}`);
  if (dir != null && !resolve(dir, n).startsWith(resolve(dir) + sep)) throw new Error(`unsafe file name: ${n}`);
  return n;
}
const exists = p => access(p).then(() => true, () => false);

/** Download a week's files (those named, else every file under the week) into dir. Returns the names pulled. */
export async function pullWeek(store, slug, dir, files = null) {
  weekPrefix(slug);
  await mkdir(dir, { recursive: true });
  const names = [...(files || (await store.list(weekPrefix(slug))).map(b => b.pathname.slice(weekPrefix(slug).length)))];
  // sheet.json first: deliver refuses a PDF older than sheet.json, so it must never land after the PDFs.
  names.sort((a, b) => (a === "sheet.json" ? -1 : b === "sheet.json" ? 1 : 0));
  for (const name of names) safeName(name, dir);   // every name checked before anything is written
  const pulled = [];
  for (const name of names) {
    const body = await store.get(weekPrefix(slug) + name);
    if (!body) continue;
    if (name.includes("/")) await mkdir(join(dir, name.slice(0, name.lastIndexOf("/"))), { recursive: true });
    await writeFile(join(dir, name), body);
    pulled.push(name);
  }
  return pulled;
}
/** Upload the named files that exist in dir. Returns the names pushed. */
export async function pushWeek(store, slug, dir, files) {
  weekPrefix(slug);
  for (const name of files) safeName(name, dir);
  const pushed = [];
  for (const name of files) {
    if (!(await exists(join(dir, name)))) continue;
    await store.put(weekPrefix(slug) + name, await readFile(join(dir, name)), contentTypeOf(name));
    pushed.push(name);
  }
  return pushed;
}
export async function readJson(store, pathname) { const b = await store.get(pathname); return b ? JSON.parse(b.toString("utf8")) : null; }
export async function writeJson(store, pathname, value) { await store.put(pathname, Buffer.from(JSON.stringify(value, null, 1), "utf8"), "application/json"); }
export const readStatus = (store, slug) => readJson(store, `${weekPrefix(slug)}status.json`);
/** Merge `patch` into the week's status, bump its version, stamp it; the first write is version 1. */
export async function writeStatus(store, slug, patch, now = () => new Date()) {
  const cur = { status: "drafting", version: 0, built: null, delivered: null, ...((await readStatus(store, slug)) || {}) };
  const v = now();   // a Date or milliseconds
  const at = new Date(typeof v === "number" ? v : v.getTime());
  const next = { ...cur, ...patch, version: (Number(cur.version) || 0) + 1, updatedAt: at.toISOString().replace(/\.\d{3}Z$/, "Z") };
  await writeJson(store, `${weekPrefix(slug)}status.json`, next);
  return next;
}
/** Every week in the store, newest slug first, with its status (null when none was written). */
export async function listWeeks(store) {
  const slugs = [...new Set((await store.list("weeks/")).map(b => b.pathname.split("/")[1]).filter(s => SLUG.test(s || "")))].sort().reverse();
  const out = [];
  for (const slug of slugs) out.push({ slug, status: await readStatus(store, slug) });
  return out;
}
