// api/_lib/http.mjs — small Fetch-API helpers the four functions share.
import { createHmac, timingSafeEqual } from "node:crypto";

export const NO_STORE = { "cache-control": "no-store", "referrer-policy": "no-referrer", "x-content-type-options": "nosniff" };
export const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...NO_STORE, ...headers } });
export const text = (body, status = 200, headers = {}) => new Response(body, { status, headers: { "content-type": "text/plain; charset=utf-8", ...NO_STORE, ...headers } });

/** The body as text, refusing more than `limit` bytes (declared or read). */
export async function readLimitedBody(request, limit) {
  if (Number(request.headers.get("content-length") || 0) > limit) throw new Error("request_too_large");
  if (!request.body) return "";
  const reader = request.body.getReader(); const chunks = []; let size = 0;
  for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > limit) { await reader.cancel(); throw new Error("request_too_large"); } chunks.push(value); }
  return Buffer.concat(chunks).toString("utf8");
}
/** The origin this deployment speaks as for the request: its own when it is one of ours, else the primary. */
export function canonicalOrigin(request, origins) { const o = new URL(request.url).origin; return origins.includes(o) ? o : origins[0]; }

const sig = (secret, slug, file, exp) => createHmac("sha256", secret).update(`${slug}/${file}/${exp}`).digest("base64url");
/** A 24-hour link to one private file, served by api/draft.mjs. */
export function draftUrl(origin, secret, slug, file, now = Date.now, ttlMs = 24 * 3600_000) { const exp = now() + ttlMs; return `${origin}/api/draft/${slug}/${file}?exp=${exp}&sig=${sig(secret, slug, file, exp)}`; }
export function verifyDraft(secret, slug, file, exp, given, now = Date.now) {
  const e = Number(exp);
  if (!Number.isFinite(e) || e < now() || typeof given !== "string") return false;
  const a = Buffer.from(sig(secret, slug, file, e)), b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
}
