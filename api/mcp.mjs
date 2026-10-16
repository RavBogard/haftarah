// api/mcp.mjs — the MCP endpoint. process.env is read here and nowhere below.
import { configFrom } from "./_lib/env.mjs";
import { handleMcp } from "./_lib/mcp.mjs";
import { TOOLS, toolCtx } from "./_lib/tools.mjs";
import { BlobStore } from "./_lib/store.mjs";
import { bearer, challenge } from "./_lib/oauth.mjs";
import { canonicalOrigin, json } from "./_lib/http.mjs";
import { vercelLauncher } from "./_lib/browser.mjs";

export const SERVER_INFO = { name: "haftarah", version: "2.0.0" };
// A placeholder until the server's instructions are written (api/_lib/instructions.mjs replaces it).
export const INSTRUCTIONS = "Haftarah sheet pipeline. Never call deliver_week without Daniel's explicit go-ahead. Never invent a citation.";

export function createMcpApp(env, { fetchImpl = globalThis.fetch, launcher = vercelLauncher, store = null, now = () => new Date(), scripts = undefined } = {}) {
  return async request => {
    const config = configFrom(env);
    const origin = canonicalOrigin(request, config.origins);
    if (!config.authSecret) return json({ error: "server_not_configured", missing: ["HAFTARAH_AUTH_SECRET"] }, 503);
    const auth = bearer(request, { config, now });
    if (!auth) return challenge(origin);
    let weekStore = store;
    if (!weekStore) { try { weekStore = new BlobStore({ token: config.workingToken, fetchImpl }); } catch (err) { return json({ error: "server_not_configured", missing: ["HAFTARAH_WORKING_READ_WRITE_TOKEN"], detail: err.message }, 503); } }
    // workDir from the config, never the default tmp folder; draft links signed for the origin the client reached.
    const ctx = toolCtx({ store: weekStore, config: { ...config, site: origin }, fetchImpl, now, log: m => console.log(String(m)), workDir: config.workDir, launcher, scripts });
    ctx.actor = auth.actor;
    return handleMcp(request, { tools: TOOLS, instructions: INSTRUCTIONS, serverInfo: SERVER_INFO, ctx });
  };
}

// Vercel's web handler: an object with fetch(request). A failure outside the transport is a bare 500, no stack.
export default { async fetch(request) { try { return await createMcpApp(process.env)(request); } catch { return json({ error: "server_error" }, 500); } } };
