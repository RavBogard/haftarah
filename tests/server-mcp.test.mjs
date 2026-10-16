// tests/server-mcp.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { handleMcp, MAX_RESULT_CHARS, textResult, errorResult } from "../api/_lib/mcp.mjs";
import { configFrom } from "../api/_lib/env.mjs";

const tools = [
  { name: "echo", description: "Echo", inputSchema: { type: "object", properties: { s: { type: "string" } }, required: ["s"] }, annotations: { readOnlyHint: true }, handler: async ({ s }) => ({ said: s }) },
  { name: "boom", description: "Throws", inputSchema: { type: "object", properties: {} }, annotations: {}, handler: async () => { throw new Error("it broke: step 3"); } },
  { name: "big", description: "Too big", inputSchema: { type: "object", properties: {} }, annotations: {}, handler: async () => ({ s: "x".repeat(MAX_RESULT_CHARS + 1) }) },
  { name: "leak", description: "Leaks", inputSchema: { type: "object", properties: {} }, annotations: {}, handler: async (_, ctx) => ({ t: ctx.config.cronSecret }) },
];
const config = configFrom({ CRON_SECRET: "cron-secret-value" });
const opts = { tools, instructions: "Never deliver without Daniel's go-ahead.", serverInfo: { name: "haftarah", version: "2.0.0" }, ctx: { config } };
const post = (body, headers = {}) => handleMcp(new Request("https://haftarah.vercel.app/api/mcp", { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...headers }, body: typeof body === "string" ? body : JSON.stringify(body) }), opts);
const rpc = (method, params, id = 1) => ({ jsonrpc: "2.0", id, method, params });

test("initialize answers the client's protocol version when supported, with tools capability and the instructions", async () => {
  const r = await post(rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "claude", version: "1" } }));
  assert.equal(r.status, 200); assert.equal(r.headers.get("content-type"), "application/json");
  const j = await r.json();
  assert.equal(j.id, 1); assert.equal(j.result.protocolVersion, "2025-06-18");
  assert.deepEqual(j.result.capabilities, { tools: { listChanged: false } });
  assert.deepEqual(j.result.serverInfo, { name: "haftarah", version: "2.0.0" });
  assert.equal(j.result.instructions, opts.instructions);
  const old = await (await post(rpc("initialize", { protocolVersion: "1999-01-01" }))).json();
  assert.equal(old.result.protocolVersion, "2025-06-18", "an unknown version gets our default");
});

test("a notification is 202 with no body; ping answers {}; an unknown method is -32601; a parse error is -32700 with id null", async () => {
  const n = await post({ jsonrpc: "2.0", method: "notifications/initialized" });
  assert.equal(n.status, 202); assert.equal(await n.text(), "");
  assert.deepEqual((await (await post(rpc("ping", {}, 7))).json()), { jsonrpc: "2.0", id: 7, result: {} });
  const u = await (await post(rpc("resources/list", {}))).json();
  assert.equal(u.error.code, -32601);
  const p = await post("{not json");
  assert.equal(p.status, 400); const pj = await p.json(); assert.equal(pj.error.code, -32700); assert.equal(pj.id, null);
});

test("tools/list exposes name, description, inputSchema and annotations; tools/call validates, wraps JSON as text, reports a thrown error as isError without a stack", async () => {
  const l = await (await post(rpc("tools/list", {}))).json();
  assert.deepEqual(l.result.tools.map(t => t.name), ["echo", "boom", "big", "leak"]);
  assert.deepEqual(l.result.tools[0].annotations, { readOnlyHint: true });
  assert.equal(l.result.tools[0].inputSchema.type, "object");
  const ok = await (await post(rpc("tools/call", { name: "echo", arguments: { s: "hi" } }))).json();
  assert.deepEqual(ok.result, { content: [{ type: "text", text: JSON.stringify({ said: "hi" }, null, 1) }] });
  const bad = await (await post(rpc("tools/call", { name: "echo", arguments: {} }))).json();
  assert.equal(bad.result.isError, true); assert.match(bad.result.content[0].text, /s is required/);
  const unknown = await (await post(rpc("tools/call", { name: "nope", arguments: {} }))).json();
  assert.equal(unknown.error.code, -32602);
  const thrown = await (await post(rpc("tools/call", { name: "boom", arguments: {} }))).json();
  assert.equal(thrown.result.isError, true); assert.equal(thrown.result.content[0].text, "it broke: step 3"); assert.ok(!thrown.result.content[0].text.includes("    at "));
});

test("a result over MAX_RESULT_CHARS and a result carrying a credential are refused as tool errors", async () => {
  const big = await (await post(rpc("tools/call", { name: "big", arguments: {} }))).json();
  assert.equal(big.result.isError, true); assert.match(big.result.content[0].text, /too large/);
  const leak = await (await post(rpc("tools/call", { name: "leak", arguments: {} }))).json();
  assert.equal(leak.result.isError, true); assert.match(leak.result.content[0].text, /credential/); assert.ok(!JSON.stringify(leak).includes("cron-secret-value"));
});

test("GET and DELETE are 405; a body over MAX_BODY is 413; a batch is answered as a batch", async () => {
  assert.equal((await handleMcp(new Request("https://x/api/mcp"), opts)).status, 405);
  assert.equal((await handleMcp(new Request("https://x/api/mcp", { method: "DELETE" }), opts)).status, 405);
  assert.equal((await post("[]", { "content-length": String(2 * 1024 * 1024) })).status, 413);
  const b = await (await post([rpc("ping", {}, 1), rpc("ping", {}, 2)])).json();
  assert.deepEqual(b.map(x => x.id), [1, 2]);
});

test("textResult and errorResult shapes", () => {
  assert.deepEqual(textResult({ a: 1 }), { content: [{ type: "text", text: JSON.stringify({ a: 1 }, null, 1) }] });
  assert.deepEqual(errorResult("no"), { content: [{ type: "text", text: "no" }], isError: true });
});
