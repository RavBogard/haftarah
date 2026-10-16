// tests/server-oauth.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { configFrom } from "../api/_lib/env.mjs";
import { sign, verify, metadata, resourceMetadata, register, authorize, googleCallback, token, bearer, challenge, pkceChallenge, redirectPermitted, ALLOWED_REDIRECTS } from "../api/_lib/oauth.mjs";

const ENV = { PUBLIC_BASE_URL: "https://haftarah.vercel.app", HAFTARAH_AUTH_SECRET: "s".repeat(48), GOOGLE_OAUTH_CLIENT_ID: "cid.apps.googleusercontent.com", GOOGLE_OAUTH_CLIENT_SECRET: "gsecret", HAFTARAH_OWNER_EMAILS: "daniel@centralreform.org" };
const config = configFrom(ENV);
const ORIGIN = "https://haftarah.vercel.app";
let t = Date.parse("2026-10-15T12:00:00Z");
const now = () => t;
const random = () => "r".repeat(32);
const ctx = () => ({ config, now, random });
const VERIFIER = "v".repeat(43);
const CLAUDE_CB = "https://claude.ai/api/mcp/auth_callback";
const b64 = o => Buffer.from(JSON.stringify(o)).toString("base64url");
const idToken = (claims) => `${b64({ alg: "RS256" })}.${b64({ iss: "https://accounts.google.com", aud: "cid.apps.googleusercontent.com", exp: Math.floor(t / 1000) + 3600, nonce: "r".repeat(32), email: "daniel@centralreform.org", email_verified: true, ...claims })}.sig`;
const googleOk = (claims = {}) => async (url, init) => { assert.equal(String(url), "https://oauth2.googleapis.com/token"); assert.equal(init.method, "POST"); const f = new URLSearchParams(init.body); assert.equal(f.get("grant_type"), "authorization_code"); assert.equal(f.get("redirect_uri"), `${ORIGIN}/api/auth/google/callback`); return new Response(JSON.stringify({ id_token: idToken(claims), access_token: "ga" }), { status: 200 }); };

async function registerClaude() {
  const r = await register({ redirect_uris: [CLAUDE_CB, "http://localhost:51234/callback"], client_name: "Claude", token_endpoint_auth_method: "none" }, ctx());
  assert.equal(r.status, 201);
  return r.body.client_id;
}
function authorizeUrl(clientId, extra = {}) {
  const u = new URL(`${ORIGIN}/oauth/authorize`);
  for (const [k, v] of Object.entries({ client_id: clientId, redirect_uri: CLAUDE_CB, response_type: "code", code_challenge: pkceChallenge(VERIFIER), code_challenge_method: "S256", scope: "haftarah.pipeline offline_access", state: "xyz", resource: `${ORIGIN}/api/mcp`, ...extra })) if (v != null) u.searchParams.set(k, v);
  return u;
}

test("sign/verify: a record round-trips, a changed byte or a wrong kind or an expired record is null", () => {
  const s = sign("k", "hc", { a: 1 }, 1000, now);
  assert.deepEqual(verify("k", "hc", s, now).a, 1);
  assert.equal(verify("k", "hr", s, now), null);
  assert.equal(verify("k", "hc", s.slice(0, -1) + (s.endsWith("A") ? "B" : "A"), now), null);
  assert.equal(verify("k", "hc", s, () => t + 1001), null);
  assert.equal(verify("other", "hc", s, now), null);
  assert.equal(verify("k", "hc", "garbage", now), null);
});

test("metadata and resource metadata are the origin's, as Claude reads them", () => {
  const m = metadata(ORIGIN);
  assert.equal(m.issuer, ORIGIN);
  assert.equal(m.authorization_endpoint, `${ORIGIN}/oauth/authorize`);
  assert.equal(m.token_endpoint, `${ORIGIN}/oauth/token`);
  assert.equal(m.registration_endpoint, `${ORIGIN}/oauth/register`);
  assert.deepEqual(m.scopes_supported, ["haftarah.pipeline", "offline_access"]);
  assert.deepEqual(m.code_challenge_methods_supported, ["S256"]);
  assert.deepEqual(m.token_endpoint_auth_methods_supported, ["none"]);
  assert.deepEqual(resourceMetadata(ORIGIN), { resource: `${ORIGIN}/api/mcp`, authorization_servers: [ORIGIN], scopes_supported: ["haftarah.pipeline"], bearer_methods_supported: ["header"] });
  const c = challenge(ORIGIN);
  assert.equal(c.status, 401);
  assert.equal(c.headers.get("www-authenticate"), `Bearer resource_metadata="${ORIGIN}/.well-known/oauth-protected-resource", scope="haftarah.pipeline"`);
});

test("register: Claude's metadata is accepted; a non-https non-loopback redirect, a secret auth method or a stray grant is refused", async () => {
  const id = await registerClaude();
  assert.ok(id.startsWith("hc."));
  for (const bad of [{ redirect_uris: ["http://evil.example/cb"] }, { redirect_uris: ["https://evil.example/cb"] }, { redirect_uris: [CLAUDE_CB, "https://evil.example/cb"] }, { redirect_uris: [CLAUDE_CB], token_endpoint_auth_method: "client_secret_post" }, { redirect_uris: [CLAUDE_CB], grant_types: ["implicit"] }, { redirect_uris: [] }, "nope"]) {
    const r = await register(bad, ctx());
    assert.equal(r.status, 400, JSON.stringify(bad));
    assert.ok(["invalid_redirect_uri", "invalid_client_metadata"].includes(r.body.error));
  }
  for (const evil of [["https://evil.example/cb"], [CLAUDE_CB, "https://evil.example/cb"]]) {
    assert.equal((await register({ redirect_uris: evil }, ctx())).body.error, "invalid_redirect_uri", "an https redirect off the allow-list is refused");
  }
  assert.ok((await register({ redirect_uris: ["https://claude.com/api/mcp/auth_callback", "http://127.0.0.1:9/x"] }, ctx())).status === 201);
});

test("redirectPermitted: Claude's two callbacks exactly, or any http loopback; nothing else", () => {
  assert.deepEqual(ALLOWED_REDIRECTS, ["https://claude.ai/api/mcp/auth_callback", "https://claude.com/api/mcp/auth_callback"]);
  assert.equal(redirectPermitted("http://127.0.0.1:51234/callback"), true);
  assert.equal(redirectPermitted("http://localhost/anything"), true);
  assert.equal(redirectPermitted("http://[::1]:8080/callback"), true);
  assert.equal(redirectPermitted(CLAUDE_CB), true);
  assert.equal(redirectPermitted("https://claude.ai/other"), false);
  assert.equal(redirectPermitted("https://claude.ai/api/mcp/auth_callback?x=1"), false);
  assert.equal(redirectPermitted("https://localhost/callback"), false, "loopback is http only");
  assert.equal(redirectPermitted("http://evil.example/callback"), false);
  assert.equal(redirectPermitted("not a url"), false);
});

test("authorize refuses a client record whose redirect is no longer permitted, even with a valid signature", async () => {
  const stale = sign(config.authSecret, "hc", { redirect_uris: ["https://evil.example/cb"], client_name: "old" }, 3600_000, now);
  const r = await authorize(authorizeUrl(stale, { redirect_uri: "https://evil.example/cb" }), ctx());
  assert.equal(r.status, 400); assert.equal(r.body.error, "invalid_client"); assert.equal(r.redirect, undefined);
});

test("authorize sends the owner to Google with PKCE state bound to the request; bad inputs go back to the client or are refused", async () => {
  const id = await registerClaude();
  const r = await authorize(authorizeUrl(id), ctx());
  assert.ok(r.redirect.startsWith("https://accounts.google.com/o/oauth2/v2/auth?"));
  const g = new URL(r.redirect);
  assert.equal(g.searchParams.get("client_id"), "cid.apps.googleusercontent.com");
  assert.equal(g.searchParams.get("redirect_uri"), `${ORIGIN}/api/auth/google/callback`);
  assert.equal(g.searchParams.get("scope"), "openid email");
  assert.equal(g.searchParams.get("prompt"), "select_account");
  assert.equal(g.searchParams.get("nonce"), "r".repeat(32));
  const st = verify(config.authSecret, "hr", g.searchParams.get("state"), now);
  assert.equal(st.redirect_uri, CLAUDE_CB); assert.equal(st.state, "xyz"); assert.equal(st.code_challenge, pkceChallenge(VERIFIER)); assert.equal(st.scope, "haftarah.pipeline offline_access");
  const plain = await authorize(authorizeUrl(id, { code_challenge_method: "plain" }), ctx());
  assert.ok(plain.redirect.startsWith(`${CLAUDE_CB}?error=invalid_request&state=xyz`), "a verified redirect gets the error");
  const wrongRedirect = await authorize(authorizeUrl(id, { redirect_uri: "https://evil.example/cb" }), ctx());
  assert.equal(wrongRedirect.status, 400); assert.equal(wrongRedirect.body.error, "invalid_client");
  const wrongResource = await authorize(authorizeUrl(id, { resource: "https://other.example/api/mcp" }), ctx());
  assert.ok(wrongResource.redirect.includes("error=invalid_target"));
  const noGoogle = await authorize(authorizeUrl(id), { ...ctx(), config: configFrom({ ...ENV, GOOGLE_OAUTH_CLIENT_ID: "" }) });
  assert.ok(noGoogle.redirect.includes("error=temporarily_unavailable"));
});

test("the Google callback for the owner issues a code bound to the request; the token endpoint exchanges it with PKCE and the tokens verify", async () => {
  const id = await registerClaude();
  const g = new URL((await authorize(authorizeUrl(id), ctx())).redirect);
  const cb = new URL(`${ORIGIN}/api/auth/google/callback?code=gcode&state=${encodeURIComponent(g.searchParams.get("state"))}`);
  const r = await googleCallback(cb, { ...ctx(), fetchImpl: googleOk() });
  assert.equal(r.status, 303);
  const back = new URL(r.redirect);
  assert.equal(back.origin + back.pathname, CLAUDE_CB);
  assert.equal(back.searchParams.get("state"), "xyz");
  const code = back.searchParams.get("code");
  assert.ok(code.startsWith("hcode."));
  const tk = await token(new URLSearchParams({ grant_type: "authorization_code", code, client_id: id, redirect_uri: CLAUDE_CB, code_verifier: VERIFIER, resource: `${ORIGIN}/api/mcp` }), ctx());
  assert.equal(tk.status, 200);
  assert.equal(tk.body.token_type, "Bearer"); assert.equal(tk.body.expires_in, 3600); assert.equal(tk.body.scope, "haftarah.pipeline offline_access");
  const auth = bearer(new Request(`${ORIGIN}/api/mcp`, { headers: { authorization: `Bearer ${tk.body.access_token}` } }), ctx());
  assert.deepEqual({ actor: auth.actor, scope: auth.scope }, { actor: "daniel@centralreform.org", scope: "haftarah.pipeline offline_access" });
  assert.equal(bearer(new Request(`${ORIGIN}/api/mcp`), ctx()), null);
  assert.equal(bearer(new Request(`${ORIGIN}/api/mcp`, { headers: { authorization: `Bearer ${tk.body.refresh_token}` } }), ctx()), null, "a refresh token is not a bearer");
  t += 3601 * 1000;
  assert.equal(bearer(new Request(`${ORIGIN}/api/mcp`, { headers: { authorization: `Bearer ${tk.body.access_token}` } }), ctx()), null, "expired after an hour");
  const rt = await token(new URLSearchParams({ grant_type: "refresh_token", refresh_token: tk.body.refresh_token, client_id: id }), ctx());
  assert.equal(rt.status, 200);
  assert.notEqual(rt.body.access_token, tk.body.access_token); assert.notEqual(rt.body.refresh_token, tk.body.refresh_token);
  assert.ok(bearer(new Request(`${ORIGIN}/api/mcp`, { headers: { authorization: `Bearer ${rt.body.access_token}` } }), ctx()));
  t -= 3601 * 1000;
});

test("the token endpoint refuses a wrong verifier, a wrong client, a wrong redirect, a reused-after-expiry code and an unknown grant with the standard errors", async () => {
  const id = await registerClaude();
  // A client id is a signed record of the client's metadata, so a second identical registration in the same
  // millisecond is the same id; the other client differs in its metadata, as a real second client would.
  const other = (await register({ redirect_uris: [CLAUDE_CB], client_name: "Another client", token_endpoint_auth_method: "none" }, ctx())).body.client_id;
  assert.notEqual(other, id);
  const g =new URL((await authorize(authorizeUrl(id), ctx())).redirect);
  const code = new URL((await googleCallback(new URL(`${ORIGIN}/api/auth/google/callback?code=g&state=${encodeURIComponent(g.searchParams.get("state"))}`), { ...ctx(), fetchImpl: googleOk() })).redirect).searchParams.get("code");
  const form = o => new URLSearchParams({ grant_type: "authorization_code", code, client_id: id, redirect_uri: CLAUDE_CB, code_verifier: VERIFIER, ...o });
  assert.equal((await token(form({ code_verifier: "w".repeat(43) }), ctx())).body.error, "invalid_grant");
  assert.equal((await token(form({ client_id: other }), ctx())).body.error, "invalid_grant");
  assert.equal((await token(form({ redirect_uri: "http://localhost:51234/callback" }), ctx())).body.error, "invalid_grant");
  assert.equal((await token(form({}), { ...ctx(), now: () => t + 6 * 60_000 })).body.error, "invalid_grant", "a code lives five minutes");
  assert.equal((await token(new URLSearchParams({ grant_type: "password" }), ctx())).body.error, "unsupported_grant_type");
  assert.equal((await token(new URLSearchParams({ grant_type: "refresh_token", refresh_token: "hrt.bad", client_id: id }), ctx())).body.error, "invalid_grant");
});

test("the callback for an address outside HAFTARAH_OWNER_EMAILS issues no code and redirects with access_denied; an unverified email, a wrong nonce, a wrong audience and Google's own error are handled", async () => {
  const id = await registerClaude();
  const state = async () => new URL((await authorize(authorizeUrl(id), ctx())).redirect).searchParams.get("state");
  const cb = async (q, fetchImpl) => googleCallback(new URL(`${ORIGIN}/api/auth/google/callback?${q}&state=${encodeURIComponent(await state())}`), { ...ctx(), fetchImpl });
  const stranger = await cb("code=g", googleOk({ email: "someone@example.org" }));
  assert.equal(stranger.status, 303); assert.ok(stranger.redirect.startsWith(`${CLAUDE_CB}?error=access_denied&state=xyz`)); assert.ok(!stranger.redirect.includes("code="));
  assert.ok((await cb("code=g", googleOk({ email_verified: false }))).redirect.includes("error=access_denied"));
  assert.ok((await cb("code=g", googleOk({ nonce: "other" }))).redirect.includes("error=access_denied"));
  assert.ok((await cb("code=g", googleOk({ aud: "someone-else" }))).redirect.includes("error=access_denied"));
  assert.ok((await cb("error=access_denied", googleOk())).redirect.includes("error=access_denied"), "Cancel at Google");
  const down = await cb("code=g", async () => new Response("", { status: 503 }));
  assert.ok(down.redirect.includes("error=temporarily_unavailable"));
  const stale = await googleCallback(new URL(`${ORIGIN}/api/auth/google/callback?code=g&state=hr.bad`), { ...ctx(), fetchImpl: googleOk() });
  assert.equal(stale.status, 400, "no verified client redirect: a plain error, no redirect");
});

test("an owner removed from HAFTARAH_OWNER_EMAILS loses access at once: bearer is null and the refresh grant is invalid_grant", async () => {
  const id = await registerClaude();
  const g = new URL((await authorize(authorizeUrl(id), ctx())).redirect);
  const code = new URL((await googleCallback(new URL(`${ORIGIN}/api/auth/google/callback?code=g&state=${encodeURIComponent(g.searchParams.get("state"))}`), { ...ctx(), fetchImpl: googleOk() })).redirect).searchParams.get("code");
  const tk = await token(new URLSearchParams({ grant_type: "authorization_code", code, client_id: id, redirect_uri: CLAUDE_CB, code_verifier: VERIFIER }), ctx());
  assert.equal(tk.status, 200);
  const req = () => new Request(`${ORIGIN}/api/mcp`, { headers: { authorization: `Bearer ${tk.body.access_token}` } });
  assert.ok(bearer(req(), ctx()), "still an owner: admitted");
  const removed = { ...ctx(), config: configFrom({ ...ENV, HAFTARAH_OWNER_EMAILS: "someone-else@centralreform.org" }) };
  assert.equal(bearer(req(), removed), null);
  assert.equal((await token(new URLSearchParams({ grant_type: "refresh_token", refresh_token: tk.body.refresh_token, client_id: id }), removed)).body.error, "invalid_grant");
});

test("the Google callback refuses a signed request record whose redirect is not permitted: 400, no redirect, no call to Google", async () => {
  const rec = sign(config.authSecret, "hr", { client: "x", redirect_uri: "https://evil.example/cb", code_challenge: pkceChallenge(VERIFIER), scope: "haftarah.pipeline", resource: `${ORIGIN}/api/mcp`, state: "xyz", nonce: "r".repeat(32) }, 600_000, now);
  const r = await googleCallback(new URL(`${ORIGIN}/api/auth/google/callback?code=g&state=${encodeURIComponent(rec)}`), { ...ctx(), fetchImpl: async () => { throw new Error("must not be called"); } });
  assert.equal(r.status, 400); assert.equal(r.body.error, "invalid_request"); assert.equal(r.redirect, undefined);
});

test("the code exchange refuses a code once its owner is no longer in the owners list", async () => {
  const id = await registerClaude();
  const g = new URL((await authorize(authorizeUrl(id), ctx())).redirect);
  const code = new URL((await googleCallback(new URL(`${ORIGIN}/api/auth/google/callback?code=g&state=${encodeURIComponent(g.searchParams.get("state"))}`), { ...ctx(), fetchImpl: googleOk() })).redirect).searchParams.get("code");
  const removed = { ...ctx(), config: configFrom({ ...ENV, HAFTARAH_OWNER_EMAILS: "someone-else@centralreform.org" }) };
  assert.equal((await token(new URLSearchParams({ grant_type: "authorization_code", code, client_id: id, redirect_uri: CLAUDE_CB, code_verifier: VERIFIER }), removed)).body.error, "invalid_grant");
});

test("sign, verify and the endpoints take a now that returns a Date as well as milliseconds", async () => {
  const dateNow = () => new Date(t);
  const s = sign("k", "hc", { a: 1 }, 1000, dateNow);
  assert.equal(verify("k", "hc", s, now).a, 1);
  assert.equal(verify("k", "hc", s, () => new Date(t + 1001)), null);
  const dctx = () => ({ config, now: dateNow, random });
  const id = (await register({ redirect_uris: [CLAUDE_CB] }, dctx())).body.client_id;
  const g = new URL((await authorize(authorizeUrl(id), dctx())).redirect);
  const code = new URL((await googleCallback(new URL(`${ORIGIN}/api/auth/google/callback?code=g&state=${encodeURIComponent(g.searchParams.get("state"))}`), { ...dctx(), fetchImpl: googleOk() })).redirect).searchParams.get("code");
  const tk = await token(new URLSearchParams({ grant_type: "authorization_code", code, client_id: id, redirect_uri: CLAUDE_CB, code_verifier: VERIFIER }), dctx());
  assert.equal(tk.status, 200);
  assert.ok(bearer(new Request(`${ORIGIN}/api/mcp`, { headers: { authorization: `Bearer ${tk.body.access_token}` } }), dctx()));
});

test("pkceChallenge is S256 base64url", () => {
  assert.equal(pkceChallenge(VERIFIER), createHash("sha256").update(VERIFIER).digest("base64url"));
});
