// tests/server-env.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { configFrom, assertNoSecrets, secretValues, WORKING_STORE_ID, SCOPE, MCP_PATH } from "../api/_lib/env.mjs";

const ENV = {
  PUBLIC_BASE_URL: "https://haftarah.vercel.app", PUBLIC_ALTERNATE_ORIGINS: "https://haftarah.centralreform.org, ",
  HAFTARAH_WORKING_READ_WRITE_TOKEN: "vercel_blob_rw_URJlaSwtVImD5fOT_wsecret", BLOB_READ_WRITE_TOKEN: "vercel_blob_rw_wOGdAqvPmTFjKrmY_psecret",
  HAFTARAH_DROPBOX_URL: "https://script.google.com/macros/s/x/exec", HAFTARAH_DROPBOX_TOKEN: "dropbox-secret",
  HAFTARAH_AUTH_SECRET: "a".repeat(40), CRON_SECRET: "csecret", GOOGLE_OAUTH_CLIENT_ID: "id.apps.googleusercontent.com", GOOGLE_OAUTH_CLIENT_SECRET: "gsecret",
  HAFTARAH_OWNER_EMAILS: "Daniel@centralreform.org, crcmusic@centralreform.org", VERCEL: "1",
};

test("configFrom reads every name once, trims and lowercases, and defaults the paths on Vercel", () => {
  const c = configFrom(ENV);
  assert.deepEqual(c.origins, ["https://haftarah.vercel.app", "https://haftarah.centralreform.org"]);
  assert.equal(c.site, "https://haftarah.vercel.app");
  assert.deepEqual(c.owners, ["daniel@centralreform.org", "crcmusic@centralreform.org"]);
  assert.deepEqual(c.dropbox, { url: ENV.HAFTARAH_DROPBOX_URL, token: "dropbox-secret" });
  assert.deepEqual(c.google, { clientId: "id.apps.googleusercontent.com", clientSecret: "gsecret" });
  assert.equal(c.cacheDir, "/tmp/haftarah-cache");
  assert.equal(c.workDir, "/tmp/haftarah/weeks");
  assert.equal(c.customs, "crc");
  assert.equal(WORKING_STORE_ID, "URJlaSwtVImD5fOT");
  assert.equal(SCOPE, "haftarah.pipeline");
  assert.equal(MCP_PATH, "/api/mcp");
});

test("configFrom with nothing set: null credentials, the default origin, no paths off Vercel", () => {
  const c = configFrom({});
  assert.deepEqual(c.origins, ["https://haftarah.vercel.app"]);
  assert.equal(c.workingToken, null); assert.equal(c.dropbox, null); assert.equal(c.google, null); assert.equal(c.authSecret, null);
  assert.deepEqual(c.owners, []);
  assert.equal(c.cacheDir, null); assert.equal(c.workDir, null);
  const blank = configFrom({ PUBLIC_BASE_URL: "", HAFTARAH_WORKING_READ_WRITE_TOKEN: "", GOOGLE_OAUTH_CLIENT_ID: "x", GOOGLE_OAUTH_CLIENT_SECRET: "", VERCEL: "" });
  assert.equal(blank.site, "https://haftarah.vercel.app"); assert.equal(blank.workingToken, null); assert.equal(blank.google, null); assert.equal(blank.cacheDir, null);
});

test("secretValues lists every secret and assertNoSecrets throws on any of them, naming none", () => {
  const c = configFrom(ENV);
  assert.deepEqual(new Set(secretValues(c)), new Set(["vercel_blob_rw_URJlaSwtVImD5fOT_wsecret", "vercel_blob_rw_wOGdAqvPmTFjKrmY_psecret", ENV.HAFTARAH_DROPBOX_URL, "dropbox-secret", "a".repeat(40), "csecret", "gsecret"]));
  assert.doesNotThrow(() => assertNoSecrets("a sheet with 12 entries", c));
  assert.throws(() => assertNoSecrets("token dropbox-secret here", c), err => /a credential/.test(err.message) && !err.message.includes("dropbox-secret"));
  assert.doesNotThrow(() => assertNoSecrets("anything", configFrom({})));
  assert.doesNotThrow(() => assertNoSecrets("csecret", c), "a secret shorter than 8 characters is not guarded (it would match ordinary text)");
});

test("an auth secret under 32 characters counts as unset", () => {
  assert.equal(configFrom({ HAFTARAH_AUTH_SECRET: "x".repeat(31) }).authSecret, null);
  assert.equal(configFrom({ HAFTARAH_AUTH_SECRET: "x".repeat(32) }).authSecret, "x".repeat(32));
});

test("assertNoSecrets also catches a URL-encoded copy of a credential", () => {
  const c = configFrom(ENV);
  assert.throws(() => assertNoSecrets(`see ${encodeURIComponent(ENV.HAFTARAH_DROPBOX_URL)}`, c), err => /a credential/.test(err.message) && !err.message.includes("script.google"));
});
