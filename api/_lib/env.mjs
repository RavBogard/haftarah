// api/_lib/env.mjs — the server's configuration from an env object (never process.env here), and the
// guard that keeps every credential out of every tool result.
export const WORKING_STORE_ID = "URJlaSwtVImD5fOT";   // haftarah-working, private
export const SCOPE = "haftarah.pipeline";
export const OFFLINE = "offline_access";
export const MCP_PATH = "/api/mcp";
export const DEFAULT_ORIGIN = "https://haftarah.vercel.app";

const list = s => String(s || "").split(",").map(x => x.trim()).filter(Boolean);

export function configFrom(env = {}) {
  const origins = [env.PUBLIC_BASE_URL || DEFAULT_ORIGIN, ...list(env.PUBLIC_ALTERNATE_ORIGINS)].filter((o, i, a) => a.indexOf(o) === i);
  const onVercel = !!env.VERCEL;
  return {
    origins, site: origins[0],
    workingToken: env.HAFTARAH_WORKING_READ_WRITE_TOKEN || null,
    publicToken: env.BLOB_READ_WRITE_TOKEN || env.HAFTARAH_BLOB_TOKEN || null,
    dropbox: env.HAFTARAH_DROPBOX_URL && env.HAFTARAH_DROPBOX_TOKEN ? { url: env.HAFTARAH_DROPBOX_URL, token: env.HAFTARAH_DROPBOX_TOKEN } : null,
    authSecret: env.HAFTARAH_AUTH_SECRET && env.HAFTARAH_AUTH_SECRET.length >= 32 ? env.HAFTARAH_AUTH_SECRET : null,   // a weak key counts as unset
    cronSecret: env.CRON_SECRET || null,
    google: env.GOOGLE_OAUTH_CLIENT_ID && env.GOOGLE_OAUTH_CLIENT_SECRET ? { clientId: env.GOOGLE_OAUTH_CLIENT_ID, clientSecret: env.GOOGLE_OAUTH_CLIENT_SECRET } : null,
    owners: list(env.HAFTARAH_OWNER_EMAILS).map(s => s.toLowerCase()),
    customs: env.HAFTARAH_CUSTOMS || "crc",
    cacheDir: env.HAFTARAH_CACHE || (onVercel ? "/tmp/haftarah-cache" : null),
    workDir: env.HAFTARAH_WORK || (onVercel ? "/tmp/haftarah/weeks" : null),
  };
}

/** Every secret string the config holds (the drop-box URL counts: it is a capability). */
export function secretValues(c) {
  return [c.workingToken, c.publicToken, c.dropbox?.url, c.dropbox?.token, c.authSecret, c.cronSecret, c.google?.clientSecret].filter(Boolean);
}
/** Throws when `text` contains any credential; the message never does. It checks plain substrings, and the
 * URL-encoded form when that differs: any other encoding of a credential (base64, JSON escapes) would pass. */
export function assertNoSecrets(text, c) {
  const s = String(text);
  for (const v of secretValues(c)) {
    if (v.length < 8) continue;
    const enc = encodeURIComponent(v);
    if (s.includes(v) || (enc !== v && s.includes(enc))) throw new Error("a credential would have left the server in a result; refused");
  }
}
