import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createMcpApp } from "../api/mcp.mjs";
import { createOauthApp } from "../api/oauth.mjs";
import { createDraftApp } from "../api/draft.mjs";
import { createPrefetchApp } from "../api/prefetch.mjs";
import { MemoryStore, writeJson, writeStatus, readStatus } from "../api/_lib/store.mjs";
import { pkceChallenge } from "../api/_lib/oauth.mjs";
import { draftUrl, logFailure } from "../api/_lib/http.mjs";

const ORIGIN = "https://haftarah.vercel.app";
const ENV = { PUBLIC_BASE_URL: ORIGIN, HAFTARAH_AUTH_SECRET: "s".repeat(48), GOOGLE_OAUTH_CLIENT_ID: "cid", GOOGLE_OAUTH_CLIENT_SECRET: "gsecret", HAFTARAH_OWNER_EMAILS: "daniel@centralreform.org", HAFTARAH_WORKING_READ_WRITE_TOKEN: "vercel_blob_rw_URJlaSwtVImD5fOT_w", CRON_SECRET: "cron-s", VERCEL: "1" };
const min = JSON.parse(await readFile(new URL("./fixtures/week-min/sheet.json", import.meta.url), "utf8"));
const t = Date.parse("2026-10-15T12:00:00Z"), now = () => new Date(t);
const b64 = o => Buffer.from(JSON.stringify(o)).toString("base64url");
const google = async (url, init) => String(url) === "https://oauth2.googleapis.com/token" ? new Response(JSON.stringify({ id_token: `${b64({})}.${b64({ iss: "https://accounts.google.com", aud: "cid", exp: Math.floor(t / 1000) + 600, nonce: new URLSearchParams(init.body).get("code") === "gcode" ? NONCE : "x", email: "daniel@centralreform.org", email_verified: true })}.s` }), { status: 200 }) : new Response("", { status: 404 });
let NONCE = "";

async function connect() {
  const oauth = createOauthApp(ENV, { fetchImpl: google, now: () => t, random: () => (NONCE = "n".repeat(32)) });
  const reg = await oauth(new Request(`${ORIGIN}/api/oauth?action=register`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ redirect_uris: ["https://claude.ai/api/mcp/auth_callback"], client_name: "Claude" }) }));
  assert.equal(reg.status, 201);
  const { client_id } = await reg.json();
  const au = await oauth(new Request(`${ORIGIN}/api/oauth?action=authorize&client_id=${encodeURIComponent(client_id)}&redirect_uri=${encodeURIComponent("https://claude.ai/api/mcp/auth_callback")}&response_type=code&code_challenge=${pkceChallenge("v".repeat(43))}&code_challenge_method=S256&scope=haftarah.pipeline&state=st`));
  assert.equal(au.status, 302); const g = new URL(au.headers.get("location")); assert.equal(g.origin, "https://accounts.google.com");
  const cb = await oauth(new Request(`${ORIGIN}/api/oauth?action=callback&code=gcode&state=${encodeURIComponent(g.searchParams.get("state"))}`));
  assert.equal(cb.status, 303); const code = new URL(cb.headers.get("location")).searchParams.get("code"); assert.ok(code);
  const tk = await oauth(new Request(`${ORIGIN}/api/oauth?action=token`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "authorization_code", code, client_id, redirect_uri: "https://claude.ai/api/mcp/auth_callback", code_verifier: "v".repeat(43) }).toString() }));
  assert.equal(tk.status, 200);
  return (await tk.json()).access_token;
}

test("the oauth function serves discovery under both well-known paths and routes every action; an unknown action is 404", async () => {
  const oauth = createOauthApp(ENV, { now: () => t });
  const m = await (await oauth(new Request(`${ORIGIN}/api/oauth?action=metadata`))).json();
  assert.equal(m.issuer, ORIGIN); assert.equal(m.token_endpoint, `${ORIGIN}/oauth/token`);
  const r = await (await oauth(new Request(`${ORIGIN}/api/oauth?action=resource`))).json();
  assert.equal(r.resource, `${ORIGIN}/api/mcp`);
  const alt = await (await oauth(new Request(`https://haftarah.centralreform.org/api/oauth?action=metadata`))).json();
  assert.equal(alt.issuer, ORIGIN, "an origin not in PUBLIC_ALTERNATE_ORIGINS speaks as the primary");
  assert.equal((await oauth(new Request(`${ORIGIN}/api/oauth?action=nope`))).status, 404);
  assert.equal((await oauth(new Request(`${ORIGIN}/api/oauth?action=revoke`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: "token=x" }))).status, 200);
  // The paths themselves, as a platform that passes the original path through would deliver them.
  assert.equal((await (await oauth(new Request(`${ORIGIN}/.well-known/oauth-protected-resource/api/mcp`))).json()).resource, `${ORIGIN}/api/mcp`);
  assert.equal((await (await oauth(new Request(`${ORIGIN}/.well-known/oauth-authorization-server`))).json()).issuer, ORIGIN);
  const nosecret = createOauthApp({ ...ENV, HAFTARAH_AUTH_SECRET: "" }, { now: () => t });
  const s = await nosecret(new Request(`${ORIGIN}/api/oauth?action=metadata`));
  assert.equal(s.status, 503); assert.match((await s.json()).missing.join(), /HAFTARAH_AUTH_SECRET/);
});

test("the mcp function: 401 with the challenge without a bearer, 503 naming the missing variable, and a full round from registration to a tool call", async () => {
  const store = new MemoryStore(); const workDir = await mkdtemp(join(tmpdir(), "haftarah-work-"));
  try {
    await writeJson(store, "weeks/2026-10-17-noach/sheet.json", min); await writeStatus(store, "2026-10-17-noach", { status: "drafting" });
    const mcp = createMcpApp({ ...ENV, HAFTARAH_WORK: workDir }, { store, now, fetchImpl: async () => new Response("", { status: 404 }), launcher: null });
    const unauth = await mcp(new Request(`${ORIGIN}/api/mcp`, { method: "POST", body: "{}" }));
    assert.equal(unauth.status, 401); assert.match(unauth.headers.get("www-authenticate"), /resource_metadata="https:\/\/haftarah\.vercel\.app\/\.well-known\/oauth-protected-resource"/);
    const token = await connect();
    const post = body => mcp(new Request(`${ORIGIN}/api/mcp`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify(body) }));
    const init = await (await post({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } })).json();
    assert.equal(init.result.serverInfo.name, "haftarah"); assert.ok(init.result.instructions.length > 100);
    const list = await (await post({ jsonrpc: "2.0", id: 2, method: "tools/list" })).json();
    assert.equal(list.result.tools.length, 14);
    const sheet = await (await post({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "get_sheet", arguments: { slug: "2026-10-17-noach" } } })).json();
    assert.equal(JSON.parse(sheet.result.content[0].text).version, 1);
    const noStore = createMcpApp({ ...ENV, HAFTARAH_WORKING_READ_WRITE_TOKEN: "" }, { now });
    const s = await noStore(new Request(`${ORIGIN}/api/mcp`, { method: "POST", headers: { authorization: `Bearer ${token}` }, body: "{}" }));
    assert.equal(s.status, 503); assert.match((await s.json()).missing.join(), /HAFTARAH_WORKING_READ_WRITE_TOKEN/);
    const noSecret = createMcpApp({ ...ENV, HAFTARAH_AUTH_SECRET: "" }, { now });
    const ns = await noSecret(new Request(`${ORIGIN}/api/mcp`, { method: "POST", body: "{}" }));
    assert.equal(ns.status, 503); assert.match((await ns.json()).missing.join(), /HAFTARAH_AUTH_SECRET/);
  } finally { await rm(workDir, { recursive: true, force: true }); }
});

test("the draft function streams a private PDF for a valid signed link and refuses a bad signature, an expired link or a file outside the allow-list", async () => {
  const store = new MemoryStore();
  await store.put("weeks/2026-10-17-noach/sheet.pdf", Buffer.from("%PDF-1.4 x"), "application/pdf");
  const draft = createDraftApp(ENV, { store, now });
  const good = draftUrl(ORIGIN, ENV.HAFTARAH_AUTH_SECRET, "2026-10-17-noach", "sheet.pdf", () => t);
  const u = new URL(good);
  const r = await draft(new Request(`${ORIGIN}/api/draft?slug=2026-10-17-noach&file=sheet.pdf&exp=${u.searchParams.get("exp")}&sig=${u.searchParams.get("sig")}`));
  assert.equal(r.status, 200); assert.equal(r.headers.get("content-type"), "application/pdf"); assert.match(r.headers.get("content-disposition"), /inline; filename="2026-10-17-noach sheet\.pdf"/); assert.equal(await r.text(), "%PDF-1.4 x");
  // The link as build_sheet signs it: the path form, when the platform passes the original path through.
  assert.equal((await draft(new Request(good))).status, 200);
  assert.equal((await draft(new Request(`${ORIGIN}/api/draft?slug=2026-10-17-noach&file=sheet.pdf&exp=${u.searchParams.get("exp")}&sig=bad`))).status, 403);
  assert.equal((await draft(new Request(`${ORIGIN}/api/draft?slug=2026-10-17-noach&file=sheet.pdf&exp=${u.searchParams.get("exp")}&sig=${u.searchParams.get("sig")}`), { now: () => new Date(t + 25 * 3600_000) })).status, 403);
  const head = await draft(new Request(good, { method: "HEAD" }));
  assert.equal(head.status, 200); assert.equal(head.headers.get("content-length"), "10"); assert.equal(await head.text(), "");
  const post = await draft(new Request(good, { method: "POST", body: "x" }));
  assert.equal(post.status, 405); assert.equal(post.headers.get("allow"), "GET, HEAD");
  const other = new URL(draftUrl(ORIGIN, ENV.HAFTARAH_AUTH_SECRET, "2026-10-17-noach", "texts.json", () => t));
  assert.equal((await draft(new Request(`${ORIGIN}/api/draft?slug=2026-10-17-noach&file=texts.json&exp=${other.searchParams.get("exp")}&sig=${other.searchParams.get("sig")}`))).status, 404);
});

test("prefetch: 401 without the cron secret, skips a Shabbat whose week exists, otherwise starts the week and fetches the haftarah texts", async () => {
  const store = new MemoryStore(); const workDir = await mkdtemp(join(tmpdir(), "haftarah-work-"));
  try {
    const hebcalItem = { name: { en: "Noach", he: "נח" }, haftara: "Isaiah 54:1-55:5", fullkriyah: {} };
    const passage = { book: "Isaiah", sections: [54, 1], toSections: [54, 2], versions: [{ languageFamilyName: "hebrew", text: ["א", "ב"] }, { languageFamilyName: "english", text: ["a", "b"] }] };
    const fetchImpl = async url => { const u = String(url); if (u.startsWith("https://www.hebcal.com/leyning")) return new Response(JSON.stringify({ items: [hebcalItem] })); if (u.startsWith("https://www.hebcal.com/converter")) return new Response(JSON.stringify({ hd: 6, hm: "Cheshvan", hy: 5787, hebrew: "x" })); if (u.includes("/api/v3/texts/Isaiah")) return new Response(JSON.stringify(passage)); if (u.includes("/api/links/")) return new Response("[]"); if (u.endsWith("/data/index.json")) return new Response(JSON.stringify({ schema: 2, weeks: [] })); return new Response("", { status: 404, statusText: "Not Found" }); };
    const app = createPrefetchApp({ ...ENV, HAFTARAH_WORK: workDir }, { store, fetchImpl, now: () => new Date("2026-10-14T03:00:00Z") });
    assert.equal((await app(new Request(`${ORIGIN}/api/prefetch`))).status, 401);
    assert.equal((await app(new Request(`${ORIGIN}/api/prefetch`, { headers: { authorization: "Bearer wrong" } }))).status, 401);
    const ok = await (await app(new Request(`${ORIGIN}/api/prefetch`, { headers: { authorization: "Bearer cron-s" } }))).json();
    assert.equal(ok.slug, "2026-10-17-noach"); assert.equal(ok.started, true); assert.deepEqual(ok.texts, ["texts.json"]);
    assert.equal((await readStatus(store, "2026-10-17-noach")).status, "drafting");
    const again = await (await app(new Request(`${ORIGIN}/api/prefetch`, { headers: { authorization: "Bearer cron-s" } }))).json();
    assert.deepEqual(again, { slug: "2026-10-17-noach", skipped: "the week is already in the store" });
  } finally { await rm(workDir, { recursive: true, force: true }); }
});

test("logFailure writes the name and at most 300 characters of the message, never the stack, and withholds a message that holds a credential", () => {
  const lines = [], out = (...a) => lines.push(a.join(" "));
  logFailure("prefetch", new TypeError("x".repeat(400)), ENV, out);
  assert.equal(lines[0], `prefetch: TypeError ${"x".repeat(300)}`);
  const err = new Error(`${"y".repeat(299)} ${ENV.HAFTARAH_WORKING_READ_WRITE_TOKEN}`);   // the token straddles the 300-character cut
  logFailure("mcp", err, ENV, out);
  assert.equal(lines[1], "mcp: Error (message withheld: it held a credential)");
  assert.ok(!lines.join("\n").includes("URJlaSwtVImD5fOT_w") && !lines.join("\n").includes("    at "));
});

test("every function's default export is the web handler Vercel calls: an object with fetch(request)", async () => {
  for (const f of ["mcp", "oauth", "draft", "prefetch"]) {
    const m = await import(`../api/${f}.mjs`);
    assert.equal(typeof m.default?.fetch, "function", f);
  }
});
