// tests/server-mcp.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { handleMcp, MAX_RESULT_CHARS, textResult, errorResult } from "../api/_lib/mcp.mjs";
import { configFrom } from "../api/_lib/env.mjs";
import { withSignal, MemoryStore } from "../api/_lib/store.mjs";
import { TOOLS, DEFAULT_DEADLINE_MS, toolCtx } from "../api/_lib/tools.mjs";

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

test("GET and DELETE are 405; a body over MAX_BODY is 413; a batch is refused (2025-06-18 removed batching) and none of it runs", async () => {
  assert.equal((await handleMcp(new Request("https://x/api/mcp"), opts)).status, 405);
  assert.equal((await handleMcp(new Request("https://x/api/mcp", { method: "DELETE" }), opts)).status, 405);
  assert.equal((await post("[]", { "content-length": String(2 * 1024 * 1024) })).status, 413);
  let ran = 0;
  const counting = { ...opts, tools: [{ ...tools[0], handler: async () => { ran++; return {}; } }] };
  const r = await postWith(counting, [rpc("tools/call", { name: "echo", arguments: { s: "a" } }, 1), rpc("ping", {}, 2)]);
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { jsonrpc: "2.0", id: null, error: { code: -32600, message: "batches are not accepted; send one request at a time" } });
  assert.equal(ran, 0);
});

// Fix round 1: every result passes the guards, and nothing escapes the transport as a 500.
const more = [
  { name: "leakThrow", description: "Throws a secret", inputSchema: { type: "object", properties: {} }, annotations: {}, handler: async (_, ctx) => { throw new Error(`token ${ctx.config.cronSecret} rejected`); } },
  { name: "nothing", description: "Returns undefined", inputSchema: { type: "object", properties: {} }, annotations: {}, handler: async () => undefined },
  { name: "leakContent", description: "Content with a secret", inputSchema: { type: "object", properties: {} }, annotations: {}, handler: async (_, ctx) => ({ content: [{ type: "text", text: ctx.config.cronSecret }] }) },
];
const postWith = (o, body) => handleMcp(new Request("https://haftarah.vercel.app/api/mcp", { method: "POST", headers: { "content-type": "application/json" }, body: typeof body === "string" ? body : JSON.stringify(body) }), o);
const opts2 = { ...opts, tools: [...tools, ...more] };

test("a thrown error carrying a credential, and pass-through content carrying one, are refused without a trace of it", async () => {
  for (const name of ["leakThrow", "leakContent"]) {
    const r = await postWith(opts2, rpc("tools/call", { name, arguments: {} }));
    assert.equal(r.status, 200);
    const raw = await r.text();
    assert.ok(!raw.includes("cron-secret-value"), name);
    const j = JSON.parse(raw);
    assert.equal(j.result.isError, true); assert.equal(j.result.content[0].text, "a credential would have left the server in a result; refused");
  }
});

test("a handler returning undefined answers null text; initialize with params null works; a broken tools value is -32603 without its message", async () => {
  const u = await (await postWith(opts2, rpc("tools/call", { name: "nothing", arguments: {} }))).json();
  assert.deepEqual(u.result, { content: [{ type: "text", text: "null" }] });
  const i = await postWith(opts2, rpc("initialize", null));
  assert.equal(i.status, 200); assert.equal((await i.json()).result.protocolVersion, "2025-06-18");
  const c = await postWith(opts2, rpc("tools/call", null));
  assert.equal(c.status, 200); assert.equal((await c.json()).error.code, -32602);
  const bad = await postWith({ ...opts, tools: "not a list" }, rpc("tools/list", {}, 9));
  assert.equal(bad.status, 200);
  assert.deepEqual(await bad.json(), { jsonrpc: "2.0", id: 9, error: { code: -32603, message: "Internal error" } });
});

test("an empty batch is refused like any batch, with id null", async () => {
  const r = await postWith(opts, "[]");
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { jsonrpc: "2.0", id: null, error: { code: -32600, message: "batches are not accepted; send one request at a time" } });
});

// I3 of the final review: every call has a deadline, answered as a tool error, and the signal reaches the requests.
test("a handler that never resolves is answered within a second as timed out when its deadline is 100 ms", async () => {
  const hang = { name: "hang", description: "Never answers", inputSchema: { type: "object", properties: {} }, annotations: {}, deadlineMs: 100, handler: () => new Promise(() => {}) };
  const t0 = Date.now();
  const j = await (await postWith({ ...opts, tools: [hang] }, rpc("tools/call", { name: "hang", arguments: {} }))).json();
  assert.ok(Date.now() - t0 < 1000, `${Date.now() - t0} ms`);
  assert.equal(j.result.isError, true);
  assert.equal(j.result.content[0].text, "hang timed out after 0.1 s; nothing more is reported for this call");
});

test("the deadline's signal reaches a fetchImpl the tool hands it, which honours it and is aborted when the deadline passes", async () => {
  let aborted = false;
  // A fetch that hangs until its signal fires, as undici does.
  const fetchImpl = (url, init = {}) => new Promise((_, reject) => { init.signal?.addEventListener("abort", () => { aborted = true; reject(init.signal.reason); }, { once: true }); });
  // The real get_calendar, its deadline cut to 100 ms: Hebcal never answers.
  const tool = { ...TOOLS.find(t => t.name === "get_calendar"), deadlineMs: 100 };
  const ctx = toolCtx({ store: new MemoryStore(), config, fetchImpl, now: () => new Date("2026-10-15T12:00:00Z") });
  const t0 = Date.now();
  const j = await (await postWith({ ...opts, tools: [tool], ctx }, rpc("tools/call", { name: "get_calendar", arguments: {} }))).json();
  assert.ok(Date.now() - t0 < 1000, `${Date.now() - t0} ms`);
  assert.equal(j.result.isError, true); assert.equal(j.result.content[0].text, "get_calendar timed out after 0.1 s; nothing more is reported for this call");
  assert.equal(aborted, true, "the request was aborted, not left hanging");
  // No signal (the CLI, a test calling a handler directly): the fetch is the same function, untouched.
  assert.equal(withSignal(fetchImpl, null), fetchImpl);
});

test("a tool with no deadlineMs gets the default; defineTool gives 90 s, the long tools 240 s", () => {
  assert.equal(DEFAULT_DEADLINE_MS, 90_000);
  const long = TOOLS.filter(t => t.deadlineMs === 240_000).map(t => t.name).sort();
  assert.deepEqual(long, ["build_sheet", "deliver_week", "fetch_texts", "start_week"]);
  assert.ok(TOOLS.every(t => t.deadlineMs === 240_000 || t.deadlineMs === 90_000));
});

test("textResult and errorResult shapes", () => {
  assert.deepEqual(textResult({ a: 1 }), { content: [{ type: "text", text: JSON.stringify({ a: 1 }, null, 1) }] });
  assert.deepEqual(errorResult("no"), { content: [{ type: "text", text: "no" }], isError: true });
});
