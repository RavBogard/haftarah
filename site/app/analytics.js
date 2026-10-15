// Aggregate counts only: which verses are viewed, which sources opened, how many words are looked up,
// presenter starts, installs. No identifiers, no cookies, no storage, never the word a reader looked up,
// never the query or the verse fragment of the address. Do Not Track or Global Privacy Control turns it off.
import CONFIG from "./analytics-config.js";

// Every event the page may send, and the only properties each may carry.
export const EVENTS = {
  verse_view: ["week", "verse"],
  source_open: ["week", "source"],
  word_lookup: ["week"],
  present_start: ["week"],
  install: [],
};

/** An event's data: its allow-listed properties only, as strings of at most 120 characters; null for an unknown event. */
export function eventData(name, props = {}) {
  const keys = EVENTS[name];
  if (!keys) return null;
  const out = {};
  for (const k of keys) if (props && props[k] != null) out[k] = String(props[k]).slice(0, 120);
  return out;
}

export const optedOut = nav => !!nav && (nav.doNotTrack === "1" || nav.globalPrivacyControl === true);

/** The body Umami's /api/send takes for one event. */
export function umamiBody(config, name, data, loc) {
  return { type: "event", payload: { website: config.websiteId, hostname: loc.hostname, url: loc.pathname, name, data } };
}

export function createAnalytics(config = CONFIG, { fetchImpl = globalThis.fetch, nav = globalThis.navigator, loc = globalThis.location } = {}) {
  const on = config && config.provider === "umami" && config.websiteId && config.endpoint && !optedOut(nav);
  const seen = new Set();
  function send(name, data) {
    try {
      const p = fetchImpl(config.endpoint, { method: "POST", keepalive: true, headers: { "content-type": "application/json" }, body: JSON.stringify(umamiBody(config, name, data, loc)) });
      if (p && typeof p.catch === "function") p.catch(() => {});
    } catch {}
  }
  function track(name, props) {
    const data = eventData(name, props);
    if (!on || !data) return false;
    if (name === "verse_view") { const k = `${data.week}|${data.verse}`; if (seen.has(k)) return false; seen.add(k); }
    send(name, data);
    return true;
  }
  return { track, provider: on ? "umami" : "none" };
}
