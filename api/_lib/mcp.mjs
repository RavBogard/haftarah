// api/_lib/mcp.mjs — the MCP Streamable HTTP transport, stateless: every JSON-RPC request arrives by POST
// and is answered in one JSON response (the spec lets a server answer JSON instead of an event stream; with
// no sessions there is nothing to stream). No dependency: the four methods Claude uses are a page of code.
import { readLimitedBody, json } from "./http.mjs";
import { validateInput, DEFAULT_DEADLINE_MS } from "./tools.mjs";
import { assertNoSecrets } from "./env.mjs";
import { storeWithSignal } from "./store.mjs";

export const SUPPORTED_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26"];
export const DEFAULT_VERSION = "2025-06-18";
export const MAX_RESULT_CHARS = 120_000;
export const MAX_BODY = 1_048_576;

export const textResult = value => ({ content: [{ type: "text", text: typeof value === "string" ? value : JSON.stringify(value ?? null, null, 1) }] });
export const imageResult = (base64, mimeType, text) => ({ content: [{ type: "text", text }, { type: "image", data: base64, mimeType }] });
export const errorResult = message => ({ content: [{ type: "text", text: String(message) }], isError: true });
const rpcError = (id, code, message) => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });
const rpcResult = (id, result) => ({ jsonrpc: "2.0", id, result });
const CREDENTIAL_REFUSED = "a credential would have left the server in a result; refused";

/** Every tools/call result passes here, errors included: the size check, then the credential guard. */
function finish(wrapped, ctx) {
  const size = wrapped.content.reduce((n, c) => n + (c && c.type === "text" ? String(c.text).length : 0), 0);
  if (size > MAX_RESULT_CHARS) return errorResult(`the result is too large for the client (${size} characters); narrow the request or follow a cursor`);
  try { assertNoSecrets(JSON.stringify(wrapped), (ctx && ctx.config) || {}); } catch { return errorResult(CREDENTIAL_REFUSED); }
  return wrapped;
}

const TIMED_OUT = Symbol("timed out");
const seconds = ms => `${Math.round(ms / 100) / 10} s`;

/**
 * A tool's answer as MCP content: a validation problem, a throw or the deadline as an error result, else the value.
 * Each call gets its deadline (the tool's deadlineMs, else DEFAULT_DEADLINE_MS) as ctx.signal, which the tools hand
 * to every upstream request, and the store bound to it. When the deadline passes the call is answered at once with
 * an error result; the handler's work may go on until the function ends (whatever ignores the signal), but nothing
 * more from it is reported for this call.
 */
async function callTool(tool, p, ctx) {
  const input = p.arguments && typeof p.arguments === "object" && !Array.isArray(p.arguments) ? p.arguments : {};
  const problems = validateInput(tool.inputSchema, input);
  if (problems.length) return errorResult(problems.join("; "));
  const deadlineMs = Number(tool.deadlineMs) > 0 ? Number(tool.deadlineMs) : DEFAULT_DEADLINE_MS;
  // An AbortController on a ref'd timer, not AbortSignal.timeout: that one's timer is unref'd, and a call whose
  // only pending work is a stalled request must still be answered.
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(new DOMException(`${tool.name} timed out`, "TimeoutError")), deadlineMs);
  const signal = ac.signal;
  const callCtx = { ...(ctx || {}), signal, store: storeWithSignal(ctx && ctx.store, signal) };
  const late = new Promise(resolve => signal.addEventListener("abort", () => resolve(TIMED_OUT), { once: true }));
  let result;
  try { result = await Promise.race([Promise.resolve().then(() => tool.handler(input, callCtx)), late]); }
  catch (err) { return errorResult(signal.aborted ? timedOut(tool, deadlineMs) : err && err.message ? err.message : String(err)); }
  finally { clearTimeout(timer); }
  if (result === TIMED_OUT) return errorResult(timedOut(tool, deadlineMs));
  return result && typeof result === "object" && Array.isArray(result.content) ? result : textResult(result);
}
const timedOut = (tool, ms) => `${tool.name} timed out after ${seconds(ms)}; nothing more is reported for this call`;

async function route(msg, { tools, instructions, serverInfo, ctx }) {
  if (!msg || typeof msg !== "object" || msg.jsonrpc !== "2.0" || typeof msg.method !== "string") return rpcError(msg?.id, -32600, "Invalid Request");
  const { id, method, params } = msg;
  if (id === undefined) return null;   // a notification: nothing to answer
  const p = params && typeof params === "object" ? params : {};
  if (method === "initialize") return rpcResult(id, { protocolVersion: SUPPORTED_VERSIONS.includes(p.protocolVersion) ? p.protocolVersion : DEFAULT_VERSION, capabilities: { tools: { listChanged: false } }, serverInfo, instructions });
  if (method === "ping") return rpcResult(id, {});
  if (method === "tools/list") return rpcResult(id, { tools: tools.map(t => ({ name: t.name, description: t.description, inputSchema: t.inputSchema, annotations: t.annotations })) });
  if (method === "tools/call") {
    const tool = tools.find(t => t.name === p.name);
    if (!tool) return rpcError(id, -32602, `Unknown tool: ${p.name}`);
    return rpcResult(id, finish(await callTool(tool, p, ctx), ctx));
  }
  return rpcError(id, -32601, `Method not found: ${method}`);
}

/** Nothing escapes as a 500: a failure outside a tool handler is an Internal error, without its message. */
async function dispatch(msg, opts) {
  try { return await route(msg, opts); }
  catch { return rpcError(msg && typeof msg === "object" ? msg.id : null, -32603, "Internal error"); }
}

export async function handleMcp(request, opts) {
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405, { allow: "POST" });
  let raw;
  try { raw = await readLimitedBody(request, MAX_BODY); } catch { return json({ error: "request_too_large" }, 413); }
  let body;
  try { body = JSON.parse(raw); } catch { return json(rpcError(null, -32700, "Parse error"), 400); }
  // The 2025-06-18 protocol removed JSON-RPC batching; one request per POST also keeps one bearer from starting
  // a dozen builds at once.
  if (Array.isArray(body)) return json(rpcError(null, -32600, "batches are not accepted; send one request at a time"));
  const answer = await dispatch(body, opts);
  if (!answer) return new Response(null, { status: 202, headers: { "cache-control": "no-store" } });
  return json(answer);
}
