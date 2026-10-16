// api/oauth.mjs — discovery, registration, authorize (to Google), the Google callback, token, revoke. Reached
// through vercel.json's rewrites, which carry the action in the query and keep the client's own parameters;
// a request that arrives on the original path is routed by the path instead.
import { configFrom } from "./_lib/env.mjs";
import { metadata, resourceMetadata, register, authorize, googleCallback, token } from "./_lib/oauth.mjs";
import { canonicalOrigin, json, text, readLimitedBody } from "./_lib/http.mjs";

const MAX_OAUTH_BODY = 16_384;
const ACTION_BY_PATH = { "/.well-known/oauth-authorization-server": "metadata", "/.well-known/oauth-protected-resource": "resource", "/oauth/authorize": "authorize", "/oauth/token": "token", "/oauth/register": "register", "/oauth/revoke": "revoke", "/api/auth/google/callback": "callback" };
export const EDITOR_ONLY = "This connector is for the sheet's editor only. Sign in with the account that edits the sheet, or close this window.";
const redirect = (location, status) => new Response(null, { status, headers: { location, "cache-control": "no-store", "referrer-policy": "no-referrer" } });

export function createOauthApp(env, { fetchImpl = globalThis.fetch, now = () => Date.now(), random = undefined } = {}) {
  return async request => {
    const config = configFrom(env);
    if (!config.authSecret) return json({ error: "server_not_configured", missing: ["HAFTARAH_AUTH_SECRET"] }, 503);
    const origin = canonicalOrigin(request, config.origins);
    const url = new URL(request.url);
    const action = url.searchParams.get("action") || Object.entries(ACTION_BY_PATH).find(([p]) => url.pathname === p || url.pathname.startsWith(p + "/"))?.[1];
    url.searchParams.delete("action");
    // The library reads the origin from the URL it is given: the canonical one, never a preview's.
    const canonical = new URL(`${origin}${url.pathname}${url.search}`);
    const ctx = { config, now, fetchImpl, ...(random ? { random } : {}) };
    const answer = r => (r.redirect ? redirect(r.redirect, r.status === 303 ? 303 : 302) : json(r.body, r.status));
    switch (action) {
      case "metadata": return json(metadata(origin), 200, { "access-control-allow-origin": "*" });
      case "resource": return json(resourceMetadata(origin), 200, { "access-control-allow-origin": "*" });
      case "register": {
        if (request.method !== "POST" || !(request.headers.get("content-type") || "").toLowerCase().startsWith("application/json")) return json({ error: "invalid_client_metadata" }, 400);
        let body; try { body = JSON.parse(await readLimitedBody(request, MAX_OAUTH_BODY)); } catch { return json({ error: "invalid_client_metadata" }, 400); }
        return answer(await register(body, ctx));
      }
      case "authorize": return request.method === "GET" ? answer(await authorize(canonical, ctx)) : json({ error: "invalid_request" }, 405);
      case "callback": {
        const r = await googleCallback(canonical, ctx);
        return r.redirect ? redirect(r.redirect, 303) : text(EDITOR_ONLY, r.status || 400);
      }
      case "token": {
        if (request.method !== "POST" || !(request.headers.get("content-type") || "").toLowerCase().startsWith("application/x-www-form-urlencoded")) return json({ error: "invalid_request" }, 400);
        let form; try { form = new URLSearchParams(await readLimitedBody(request, MAX_OAUTH_BODY)); } catch { return json({ error: "invalid_request" }, 413); }
        return answer(await token(form, ctx));
      }
      // Tokens are stateless and expire on their own; revocation has nothing to forget (RFC 7009 answers 200).
      case "revoke": return request.method === "POST" ? json({}, 200) : json({ error: "invalid_request" }, 405);
      default: return json({ error: "not_found" }, 404);
    }
  };
}

export default { async fetch(request) { try { return await createOauthApp(process.env)(request); } catch { return json({ error: "server_error" }, 500); } } };
