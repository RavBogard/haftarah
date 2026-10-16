// api/_lib/mcp.mjs — the MCP Streamable HTTP transport, stateless: every JSON-RPC request arrives by POST
// and is answered in one JSON response (the spec lets a server answer JSON instead of an event stream; with
// no sessions there is nothing to stream). No dependency: the four methods Claude uses are a page of code.
import { readLimitedBody, json } from "./http.mjs";
import { validateInput } from "./tools.mjs";
import { assertNoSecrets } from "./env.mjs";

export const SUPPORTED_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26"];
export const DEFAULT_VERSION = "2025-06-18";
export const MAX_RESULT_CHARS = 120_000;
export const MAX_BODY = 1_048_576;

export const textResult = value => ({ content: [{ type: "text", text: typeof value === "string" ? value : JSON.stringify(value, null, 1) }] });
export const imageResult = (base64, mimeType, text) => ({ content: [{ type: "text", text }, { type: "image", data: base64, mimeType }] });
export const errorResult = message => ({ content: [{ type: "text", text: String(message) }], isError: true });
const rpcError = (id, code, message) => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });
const rpcResult = (id, result) => ({ jsonrpc: "2.0", id, result });

async function dispatch(msg, { tools, instructions, serverInfo, ctx }) {
  if (!msg || msg.jsonrpc !== "2.0" || typeof msg.method !== "string") return rpcError(msg?.id, -32600, "Invalid Request");
  const { id, method, params = {} } = msg;
  if (id === undefined) return null;   // a notification: nothing to answer
  if (method === "initialize") return rpcResult(id, { protocolVersion: SUPPORTED_VERSIONS.includes(params.protocolVersion) ? params.protocolVersion : DEFAULT_VERSION, capabilities: { tools: { listChanged: false } }, serverInfo, instructions });
  if (method === "ping") return rpcResult(id, {});
  if (method === "tools/list") return rpcResult(id, { tools: tools.map(t => ({ name: t.name, description: t.description, inputSchema: t.inputSchema, annotations: t.annotations })) });
  if (method === "tools/call") {
    const tool = tools.find(t => t.name === params.name);
    if (!tool) return rpcError(id, -32602, `Unknown tool: ${params.name}`);
    const input = params.arguments && typeof params.arguments === "object" ? params.arguments : {};
    const problems = validateInput(tool.inputSchema, input);
    if (problems.length) return rpcResult(id, errorResult(problems.join("; ")));
    let result;
    try { result = await tool.handler(input, ctx); }
    catch (err) { return rpcResult(id, errorResult(err && err.message ? err.message : String(err))); }
    const wrapped = result && typeof result === "object" && Array.isArray(result.content) ? result : textResult(result);
    const size = wrapped.content.reduce((n, c) => n + (c.type === "text" ? c.text.length : 0), 0);
    if (size > MAX_RESULT_CHARS) return rpcResult(id, errorResult(`the result is too large for the client (${size} characters); narrow the request or follow a cursor`));
    try { assertNoSecrets(JSON.stringify(wrapped), ctx.config); } catch (err) { return rpcResult(id, errorResult(err.message)); }
    return rpcResult(id, wrapped);
  }
  return rpcError(id, -32601, `Method not found: ${method}`);
}

export async function handleMcp(request, opts) {
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405, { allow: "POST" });
  let raw;
  try { raw = await readLimitedBody(request, MAX_BODY); } catch { return json({ error: "request_too_large" }, 413); }
  let body;
  try { body = JSON.parse(raw); } catch { return json(rpcError(null, -32700, "Parse error"), 400); }
  const messages = Array.isArray(body) ? body : [body];
  const answers = (await Promise.all(messages.map(m => dispatch(m, opts)))).filter(Boolean);
  if (!answers.length) return new Response(null, { status: 202, headers: { "cache-control": "no-store" } });
  return json(Array.isArray(body) ? answers : answers[0]);
}
