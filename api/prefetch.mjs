// api/prefetch.mjs — the Wednesday-night cron: start the coming Shabbat's week and fetch its texts so the
// digest is waiting on Thursday. Idempotent: a week already in the store is left alone (the two schedules
// cover daylight time and standard time). Vercel sends Authorization: Bearer <CRON_SECRET>; anything else is 401.
import { configFrom } from "./_lib/env.mjs";
import { json, sameSecret, logFailure } from "./_lib/http.mjs";
import { BlobStore, readStatus } from "./_lib/store.mjs";
import { TOOLS, toolCtx } from "./_lib/tools.mjs";
import { nextShabbat, weekSlug, getJSON, leyningUrl } from "../scripts/fetch.mjs";
import { loadCustoms } from "../scripts/customs.mjs";

const tool = n => TOOLS.find(t => t.name === n);
export function createPrefetchApp(env, { fetchImpl = globalThis.fetch, store = null, now = () => new Date() } = {}) {
  return async request => {
    const config = configFrom(env);
    if (!config.cronSecret || !sameSecret(request.headers.get("authorization") || "", `Bearer ${config.cronSecret}`)) return json({ error: "unauthorized" }, 401);
    let s = store; try { s = s || new BlobStore({ token: config.workingToken, fetchImpl }); } catch (err) { return json({ error: "server_not_configured", missing: ["HAFTARAH_WORKING_READ_WRITE_TOKEN"], detail: err.message }, 503); }
    const customs = await loadCustoms(config.customs);
    const date = nextShabbat(now());
    const item = ((await getJSON(leyningUrl(date, customs), { fetchImpl })).items || [])[0];
    if (!item) return json({ date, skipped: "Hebcal has no reading for this date" });
    const slug = weekSlug(date, item.name?.en || "", item.reason?.haftara || null);
    if (await readStatus(s, slug)) return json({ slug, skipped: "the week is already in the store" });
    const ctx = toolCtx({ store: s, config, fetchImpl, now, log: m => console.log(String(m)), workDir: config.workDir });
    const started = await tool("start_week").handler({ date }, ctx);
    const texts = [];
    for (const r of started.readings) { const t = await tool("fetch_texts").handler({ slug, reading: r.kind }, ctx); texts.push(t.file); }
    return json({ slug, started: true, readings: started.readings.map(r => r.kind), texts });
  };
}

export default { async fetch(request) { try { return await createPrefetchApp(process.env)(request); } catch (err) { logFailure("prefetch", err, process.env); return json({ error: "server_error" }, 500); } } };
