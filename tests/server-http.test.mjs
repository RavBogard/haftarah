// tests/server-http.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { json, text, readLimitedBody, canonicalOrigin, draftUrl, verifyDraft, NO_STORE } from "../api/_lib/http.mjs";

test("json and text answer with no-store and the right content type", async () => {
  const j = json({ a: 1 }, 201);
  assert.equal(j.status, 201); assert.equal(j.headers.get("content-type"), "application/json"); assert.equal(j.headers.get("cache-control"), "no-store");
  assert.deepEqual(await j.json(), { a: 1 });
  const x = text("hi", 404);
  assert.equal(x.status, 404); assert.ok(x.headers.get("content-type").startsWith("text/plain"));
  assert.equal(NO_STORE["cache-control"], "no-store");
});

test("readLimitedBody stops at the limit by declared length and by bytes read", async () => {
  assert.equal(await readLimitedBody(new Request("https://x/", { method: "POST", body: "abc" }), 10), "abc");
  await assert.rejects(readLimitedBody(new Request("https://x/", { method: "POST", body: "a".repeat(11) }), 10), /request_too_large/);
  await assert.rejects(readLimitedBody(new Request("https://x/", { method: "POST", body: "abc", headers: { "content-length": "999" } }), 10), /request_too_large/);
  assert.equal(await readLimitedBody(new Request("https://x/"), 10), "");
});

test("canonicalOrigin: the request's origin when it is one of ours, else the primary", () => {
  const origins = ["https://haftarah.vercel.app", "https://haftarah.centralreform.org"];
  assert.equal(canonicalOrigin(new Request("https://haftarah.centralreform.org/api/mcp"), origins), "https://haftarah.centralreform.org");
  assert.equal(canonicalOrigin(new Request("https://haftarah-abc-ravbogards-projects.vercel.app/api/mcp"), origins), "https://haftarah.vercel.app");
  assert.equal(canonicalOrigin(new Request("http://localhost:3000/api/mcp"), origins), "https://haftarah.vercel.app");
});

test("draft URLs are signed for 24 hours and verify only unchanged and in time", () => {
  const now = () => Date.parse("2026-10-15T12:00:00Z");
  const u = draftUrl("https://haftarah.vercel.app", "k".repeat(32), "2026-10-17-noach", "sheet.pdf", now);
  const url = new URL(u);
  assert.equal(url.pathname, "/api/draft/2026-10-17-noach/sheet.pdf");
  const exp = Number(url.searchParams.get("exp")), sig = url.searchParams.get("sig");
  assert.equal(exp, now() + 24 * 3600_000);
  assert.equal(verifyDraft("k".repeat(32), "2026-10-17-noach", "sheet.pdf", exp, sig, now), true);
  assert.equal(verifyDraft("k".repeat(32), "2026-10-17-noach", "sheet-torah.pdf", exp, sig, now), false);
  assert.equal(verifyDraft("k".repeat(32), "2026-10-17-noach", "sheet.pdf", exp, sig, () => exp + 1), false);
  assert.equal(verifyDraft("other", "2026-10-17-noach", "sheet.pdf", exp, sig, now), false);
  assert.equal(verifyDraft("k".repeat(32), "2026-10-17-noach", "sheet.pdf", "NaN", sig, now), false);
});

test("draft links: a Date-returning now works, a missing secret refuses, and the key is derived rather than the secret itself", () => {
  const at = new Date("2026-10-15T12:00:00Z");
  const u = new URL(draftUrl("https://haftarah.vercel.app", "k".repeat(32), "2026-10-17-noach", "sheet.pdf", () => at));
  const exp = Number(u.searchParams.get("exp")), sig = u.searchParams.get("sig");
  assert.equal(exp, at.getTime() + 24 * 3600_000);
  assert.equal(verifyDraft("k".repeat(32), "2026-10-17-noach", "sheet.pdf", exp, sig, () => at), true);
  assert.notEqual(sig, createHmac("sha256", "k".repeat(32)).update(`2026-10-17-noach/sheet.pdf/${exp}`).digest("base64url"), "not signed with the raw secret");
  assert.throws(() => draftUrl("https://haftarah.vercel.app", "", "2026-10-17-noach", "sheet.pdf"), /no signing secret/);
  assert.throws(() => draftUrl("https://haftarah.vercel.app", null, "2026-10-17-noach", "sheet.pdf"), /no signing secret/);
  assert.equal(verifyDraft("", "2026-10-17-noach", "sheet.pdf", exp, sig, () => at), false);
  assert.equal(verifyDraft(null, "2026-10-17-noach", "sheet.pdf", exp, sig, () => at), false);
});
