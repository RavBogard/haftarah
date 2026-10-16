// api/_lib/oauth.mjs — a stateless OAuth 2.1 authorization server for one person. Every client, pending
// request, authorization code, access token and refresh token is a record signed with HAFTARAH_AUTH_SECRET
// (HMAC-SHA256) carrying its own expiry; nothing is stored. Identity comes from Google's OIDC code flow:
// only an address in HAFTARAH_OWNER_EMAILS gets a code. Rotating the secret signs everyone out.
import { createHmac, createHash, timingSafeEqual, randomBytes } from "node:crypto";
import { SCOPE, OFFLINE, MCP_PATH } from "./env.mjs";

export const TTL = { client: 10 * 365 * 24 * 3600_000, request: 10 * 60_000, code: 5 * 60_000, access: 3600_000, refresh: 30 * 24 * 3600_000 };
const GOOGLE_AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN = "https://oauth2.googleapis.com/token";
const GOOGLE_ISSUERS = new Set(["https://accounts.google.com", "accounts.google.com"]);
export const GOOGLE_CALLBACK_PATH = "/api/auth/google/callback";
const STANDARD = new Set(["invalid_request", "invalid_client", "invalid_grant", "unauthorized_client", "unsupported_grant_type", "invalid_scope", "invalid_target", "unsupported_response_type", "access_denied", "server_error", "temporarily_unavailable", "invalid_client_metadata", "invalid_redirect_uri"]);

const b64 = s => Buffer.from(s).toString("base64url");
const unb64 = s => Buffer.from(s, "base64url").toString("utf8");
const hmac = (secret, s) => createHmac("sha256", secret).update(s).digest("base64url");
export const hashOpaque = s => createHash("sha256").update(s).digest("hex");
export const pkceChallenge = v => createHash("sha256").update(v).digest("base64url");
const defaultRandom = () => randomBytes(24).toString("base64url");

/** `<kind>.<payload>.<mac>`: payload is JSON with `exp` (ms) and `iat` added. */
export function sign(secret, kind, payload, ttlMs, now = Date.now) {
  const body = b64(JSON.stringify({ ...payload, iat: now(), exp: now() + ttlMs }));
  return `${kind}.${body}.${hmac(secret, `${kind}.${body}`)}`;
}
/** The payload when the kind, the mac and the expiry hold; null otherwise. Never throws. */
export function verify(secret, kind, token, now = Date.now) {
  if (typeof token !== "string" || !secret) return null;
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== kind) return null;
  const expected = Buffer.from(hmac(secret, `${parts[0]}.${parts[1]}`)), given = Buffer.from(parts[2]);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  let p; try { p = JSON.parse(unb64(parts[1])); } catch { return null; }
  if (!p || typeof p.exp !== "number" || p.exp < now()) return null;
  return p;
}

export const metadata = origin => ({ issuer: origin, authorization_endpoint: `${origin}/oauth/authorize`, token_endpoint: `${origin}/oauth/token`, revocation_endpoint: `${origin}/oauth/revoke`, registration_endpoint: `${origin}/oauth/register`, scopes_supported: [SCOPE, OFFLINE], response_types_supported: ["code"], grant_types_supported: ["authorization_code", "refresh_token"], code_challenge_methods_supported: ["S256"], token_endpoint_auth_methods_supported: ["none"] });
export const resourceMetadata = origin => ({ resource: `${origin}${MCP_PATH}`, authorization_servers: [origin], scopes_supported: [SCOPE], bearer_methods_supported: ["header"] });
/** The 401 that starts Claude's flow. */
export const challenge = origin => new Response(JSON.stringify({ error: "invalid_token" }), { status: 401, headers: { "content-type": "application/json", "cache-control": "no-store", "www-authenticate": `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource", scope="${SCOPE}"` } });

const isLoopback = h => h === "localhost" || h === "127.0.0.1" || h === "[::1]" || h === "::1";
function normalizeRedirect(value) {
  if (typeof value !== "string" || value.length > 2048) throw new Error("invalid_redirect_uri");
  let u; try { u = new URL(value); } catch { throw new Error("invalid_redirect_uri"); }
  if (u.username || u.password || u.hash) throw new Error("invalid_redirect_uri");
  if (u.protocol !== "https:" && !(u.protocol === "http:" && isLoopback(u.hostname))) throw new Error("invalid_redirect_uri");
  return u.toString();
}
/** Loopback redirects match on everything but the port (Claude Code picks an ephemeral one). */
function redirectAllowed(list, given) {
  const g = new URL(given);
  return list.some(r => { const u = new URL(r); return r === given || (u.protocol === "http:" && isLoopback(u.hostname) && g.protocol === "http:" && isLoopback(g.hostname) && u.pathname === g.pathname); });
}
function normalizeScope(value) {
  const scopes = (value || SCOPE).split(/\s+/).filter(Boolean);
  if (new Set(scopes).size !== scopes.length || !scopes.includes(SCOPE) || scopes.some(s => s !== SCOPE && s !== OFFLINE)) throw new Error("invalid_scope");
  return scopes.includes(OFFLINE) ? `${SCOPE} ${OFFLINE}` : SCOPE;
}
const withQuery = (url, values) => { const u = new URL(url); for (const [k, v] of Object.entries(values)) if (v != null) u.searchParams.set(k, v); return u.toString(); };
const err = (error, status = 400) => ({ status: STANDARD.has(error) ? status : 500, body: { error: STANDARD.has(error) ? error : "server_error" } });

export async function register(body, { config, now }) {
  try {
    if (!body || typeof body !== "object") throw new Error("invalid_client_metadata");
    const redirects = body.redirect_uris;
    if (!Array.isArray(redirects) || redirects.length < 1 || redirects.length > 10) throw new Error("invalid_redirect_uri");
    if (body.token_endpoint_auth_method !== undefined && body.token_endpoint_auth_method !== "none") throw new Error("invalid_client_metadata");
    const grants = body.grant_types ?? ["authorization_code", "refresh_token"], responses = body.response_types ?? ["code"];
    if (!Array.isArray(grants) || !grants.includes("authorization_code") || grants.some(g => g !== "authorization_code" && g !== "refresh_token") || !Array.isArray(responses) || responses.length !== 1 || responses[0] !== "code") throw new Error("invalid_client_metadata");
    const redirect_uris = [...new Set(redirects.map(normalizeRedirect))];
    const client_name = typeof body.client_name === "string" ? body.client_name.slice(0, 120) : "MCP client";
    const client_id = sign(config.authSecret, "hc", { redirect_uris, client_name }, TTL.client, now);
    return { status: 201, body: { client_id, client_id_issued_at: Math.floor(now() / 1000), client_name, redirect_uris, grant_types: ["authorization_code", "refresh_token"], response_types: ["code"], token_endpoint_auth_method: "none" } };
  } catch (e) { return err(e.message === "invalid_redirect_uri" ? "invalid_redirect_uri" : "invalid_client_metadata"); }
}

/** GET /oauth/authorize → { redirect } to Google, or to the client with an error, or { status, body }. */
export async function authorize(url, { config, now, random = defaultRandom }) {
  const q = url.searchParams;
  const origin = url.origin;
  let verified = null;
  try {
    const client = verify(config.authSecret, "hc", q.get("client_id") || "", now);
    const redirect = normalizeRedirect(q.get("redirect_uri"));
    if (!client || !redirectAllowed(client.redirect_uris, redirect)) throw new Error("invalid_client");
    verified = redirect;
    const state = q.get("state");
    if (state && state.length > 1024) throw new Error("invalid_request");
    if (q.get("response_type") !== "code") throw new Error("unsupported_response_type");
    const challengeValue = q.get("code_challenge") || "";
    if (q.get("code_challenge_method") !== "S256" || !/^[A-Za-z0-9_-]{43}$/.test(challengeValue)) throw new Error("invalid_request");
    const scope = normalizeScope(q.get("scope"));
    const resource = `${origin}${MCP_PATH}`;
    if (q.get("resource") && q.get("resource") !== resource) throw new Error("invalid_target");
    if (!config.google || !config.owners.length) throw new Error("temporarily_unavailable");
    const nonce = random();
    const rec = sign(config.authSecret, "hr", { client: hashOpaque(q.get("client_id")), redirect_uri: redirect, code_challenge: challengeValue, scope, resource, state, nonce }, TTL.request, now);
    return { redirect: withQuery(GOOGLE_AUTH, { client_id: config.google.clientId, redirect_uri: `${origin}${GOOGLE_CALLBACK_PATH}`, response_type: "code", scope: "openid email", state: rec, nonce, prompt: "select_account", access_type: "online" }) };
  } catch (e) {
    const code = STANDARD.has(e.message) ? e.message : "server_error";
    if (verified) return { redirect: withQuery(verified, { error: code, state: q.get("state") && q.get("state").length <= 1024 ? q.get("state") : undefined }) };
    return err(code);
  }
}

/** GET /api/auth/google/callback → { status: 303, redirect } to the client (a code, or an error), or { status, body }. */
export async function googleCallback(url, { config, now, fetchImpl = globalThis.fetch }) {
  const q = url.searchParams;
  const rec = verify(config.authSecret, "hr", q.get("state") || "", now);
  if (!rec) return err("invalid_request");
  const back = values => ({ status: 303, redirect: withQuery(rec.redirect_uri, { ...values, state: rec.state ?? undefined }) });
  if (q.get("error") || !q.get("code")) return back({ error: "access_denied" });
  let claims;
  try {
    const res = await fetchImpl(GOOGLE_TOKEN, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" }, body: new URLSearchParams({ code: q.get("code"), client_id: config.google.clientId, client_secret: config.google.clientSecret, redirect_uri: `${url.origin}${GOOGLE_CALLBACK_PATH}`, grant_type: "authorization_code" }).toString(), signal: AbortSignal.timeout(8000) });
    if (!res.ok) return back({ error: "temporarily_unavailable" });
    const j = await res.json();
    claims = JSON.parse(unb64(String(j.id_token || "").split(".")[1] || ""));
  } catch { return back({ error: "temporarily_unavailable" }); }
  // Received straight from Google's token endpoint over TLS with the client secret, so the signature is
  // not checked again (OIDC Core 3.1.3.7); the claims that bind it to this request and this client are.
  const email = String(claims?.email || "").trim().toLowerCase();
  const ok = claims && GOOGLE_ISSUERS.has(claims.iss) && claims.aud === config.google.clientId && Number(claims.exp) * 1000 > now() && claims.nonce === rec.nonce && (claims.email_verified === true || claims.email_verified === "true") && config.owners.includes(email);
  if (!ok) return back({ error: "access_denied" });
  const code = sign(config.authSecret, "hcode", { client: rec.client, redirect_uri: rec.redirect_uri, code_challenge: rec.code_challenge, scope: rec.scope, resource: rec.resource, actor: email }, TTL.code, now);
  return back({ code });
}

function issue(config, now, random, { actor, scope, client, resource }, family = random()) {
  const access_token = sign(config.authSecret, "hat", { actor, scope, client, resource }, TTL.access, now);
  const refresh_token = sign(config.authSecret, "hrt", { actor, scope, client, resource, family, n: random() }, TTL.refresh, now);
  return { status: 200, body: { access_token, token_type: "Bearer", expires_in: TTL.access / 1000, refresh_token, scope } };
}
/** POST /oauth/token (form) → { status, body }. */
export async function token(form, { config, now, random = defaultRandom }) {
  const grant = form.get("grant_type");
  if (grant !== "authorization_code" && grant !== "refresh_token") return err("unsupported_grant_type");
  const clientId = form.get("client_id") || "";
  const client = verify(config.authSecret, "hc", clientId, now);
  if (!client) return err("invalid_client", 401);
  const clientHash = hashOpaque(clientId);
  if (grant === "authorization_code") {
    const c = verify(config.authSecret, "hcode", form.get("code") || "", now);
    const verifier = form.get("code_verifier") || "";
    let redirect = null; try { redirect = normalizeRedirect(form.get("redirect_uri")); } catch {}
    if (!c || c.client !== clientHash || c.redirect_uri !== redirect || !/^[A-Za-z0-9._~-]{43,128}$/.test(verifier) || pkceChallenge(verifier) !== c.code_challenge || (form.get("resource") && form.get("resource") !== c.resource)) return err("invalid_grant");
    return issue(config, now, random, c);
  }
  if (grant === "refresh_token") {
    const r = verify(config.authSecret, "hrt", form.get("refresh_token") || "", now);
    if (!r || r.client !== clientHash) return err("invalid_grant");
    return issue(config, now, random, r, r.family);
  }
  return err("unsupported_grant_type");
}
/** The access token's payload ({ actor, scope, client, resource, exp }) for a request's Authorization header, or null. */
export function bearer(request, { config, now }) {
  const m = /^Bearer\s+(\S+)$/i.exec(request.headers.get("authorization") || "");
  if (!m) return null;
  const p = verify(config.authSecret, "hat", m[1], now);
  return p && p.scope && p.scope.split(" ").includes(SCOPE) ? p : null;
}
