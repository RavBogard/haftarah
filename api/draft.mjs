// api/draft.mjs — one private PDF for a signed, expiring link (build_sheet makes the links).
import { configFrom } from "./_lib/env.mjs";
import { verifyDraft, json } from "./_lib/http.mjs";
import { BlobStore } from "./_lib/store.mjs";
import { isSlug } from "../site/app/contract.js";

const FILES = new Set(["sheet.pdf", "sheet-torah.pdf", "sheet-trope.pdf"]);
export function createDraftApp(env, { fetchImpl = globalThis.fetch, store = null, now = () => new Date() } = {}) {
  return async (request, over = {}) => {
    const config = configFrom(env);
    const url = new URL(request.url), q = url.searchParams;
    // The rewrite carries slug and file in the query; the original path /api/draft/<slug>/<file> works too.
    const m = /^\/api\/draft\/([^/]+)\/([^/]+)$/.exec(url.pathname);
    const slug = q.get("slug") || (m ? m[1] : ""), file = q.get("file") || (m ? m[2] : "");
    if (!isSlug(slug) || !FILES.has(file)) return json({ error: "not_found" }, 404);
    if (!config.authSecret || !verifyDraft(config.authSecret, slug, file, q.get("exp"), q.get("sig"), over.now || now)) return json({ error: "forbidden" }, 403);
    let s = store; try { s = s || new BlobStore({ token: config.workingToken, fetchImpl }); } catch { return json({ error: "server_not_configured", missing: ["HAFTARAH_WORKING_READ_WRITE_TOKEN"] }, 503); }
    const bytes = await s.get(`weeks/${slug}/${file}`);
    if (!bytes) return json({ error: "not_found" }, 404);
    return new Response(bytes, { status: 200, headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="${slug} ${file}"`, "cache-control": "no-store", "referrer-policy": "no-referrer", "x-content-type-options": "nosniff" } });
  };
}

export default { async fetch(request) { try { return await createDraftApp(process.env)(request); } catch { return json({ error: "server_error" }, 500); } } };
