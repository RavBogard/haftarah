import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findPrior, priorFromSheet, noPrior, lookupPrior, carryInto, seeAlsoSentence, withSeeAlso, applyPrior, lastTimeMarkdown } from "../scripts/prior.mjs";
import { migrate3 } from "../scripts/migrate.mjs";
import { makeWeekTorah } from "./helpers/makeWeekTorah.mjs";

const load = async f => JSON.parse(await readFile(new URL(`./fixtures/${f}/sheet.json`, import.meta.url), "utf8"));
const row = (slug, civil, extra = {}) => ({ slug, civil, cycle: civil.slice(0, 4) === "2025" ? "5786" : "5787", ...extra });

test("findPrior: the newest earlier week with a shared key; a later week or another parashah never", () => {
  const index = { weeks: [
    row("2026-10-17-noach", "2026-10-17", { parashahKeys: ["noach"] }),
    row("2025-10-25-noach", "2025-10-25", { parashahKeys: ["noach"] }),
    row("2024-11-02-noach", "2024-11-02", { parashahKeys: ["noach"] }),
    row("2025-11-01-lech-lecha", "2025-11-01", { parashahKeys: ["lech-lecha"] }),
  ] };
  assert.equal(findPrior(index, { keys: ["noach"], civil: "2026-10-17" }).slug, "2025-10-25-noach");
  assert.equal(findPrior(index, { keys: ["noach"], civil: "2024-11-02" }), null);
  assert.equal(findPrior({ weeks: [] }, { keys: ["noach"], civil: "2026-10-17" }), null);
  assert.equal(findPrior(null, { keys: ["noach"], civil: "2026-10-17" }), null);
});

test("findPrior: a combined week is last time for either half, and either half for the combined week", () => {
  const index = { weeks: [row("2025-03-22-vayakhel-pekudei", "2025-03-22", { parashahKeys: ["vayakhel", "pekudei"] }), row("2024-03-09-vayakhel", "2024-03-09", { parashahKeys: ["vayakhel"] })] };
  assert.equal(findPrior(index, { keys: ["vayakhel"], civil: "2027-03-06" }).slug, "2025-03-22-vayakhel-pekudei");
  assert.equal(findPrior(index, { keys: ["pekudei"], civil: "2027-03-13" }).slug, "2025-03-22-vayakhel-pekudei");
  assert.equal(findPrior(index, { keys: ["vayakhel", "pekudei"], civil: "2025-03-21" }).slug, "2024-03-09-vayakhel");
  const legacy = { weeks: [{ slug: "2025-10-25-noach", civil: "2025-10-25", parashah: "Noach" }] };
  assert.equal(findPrior(legacy, { keys: ["noach"], civil: "2026-10-17" }).slug, "2025-10-25-noach", "a row from before parashahKeys still matches by name");
});

test("priorFromSheet: a schema-2 sheet's printed entries with the ids migrate would give, chapters filled, cuts listed", async () => {
  const notes = await load("week-notes");
  notes.commentary[2].status = "rejected";
  const p = priorFromSheet(notes, { slug: "2025-10-04-bereshit-machar-chodesh", source: "folder" });
  assert.equal(p.cycle, "5787");
  assert.equal(p.parashahKey, "bereshit");
  const [r] = p.readings;
  assert.deepEqual([r.id, r.kind, r.book], ["haftarah", "haftarah", "I Samuel"]);
  assert.equal(r.entries.length, notes.commentary.length - 1);
  assert.equal(r.cut.length, 1);
  const ids = migrate3(notes).readings[0].commentary.map(e => e.id);
  assert.ok(r.entries.every(e => ids.includes(e.id)), "the same ids migrate --to 3 gives");
  assert.ok(r.entries.every(e => e.chapter === 20 && !("status" in e)));
});

test("carryInto copies what fits this year's reading, marks it carried, and adds nothing on a rerun", async () => {
  const min = await load("week-min");
  const prior = priorFromSheet(makeWeekTorah(min), { slug: "2025-10-25-noach", source: "web library" });
  const fresh = migrate3({ ...min, commentary: [] });
  fresh.readings.unshift({ id: "torah", kind: "torah", ref: "Genesis 6:9-10", book: "Genesis", verses: [{ book: "Genesis", chapter: 6, verse: 9 }, { book: "Genesis", chapter: 6, verse: 10 }], glosses: [], commentary: [] });
  const { sheet, added } = carryInto(fresh, prior);
  assert.deepEqual(added.map(a => [a.reading, `${a.chapter}:${a.verse}`]), [["torah", "6:9"], ["haftarah", "20:18"], ["haftarah", "20:19"]]);
  const carried = sheet.readings[1].commentary;
  assert.ok(carried.every(e => e.status === "carried" && e.carried === "2025-10-25-noach" && /^e-/.test(e.id)));
  assert.equal(fresh.readings[1].commentary.length, 0, "the input is not changed");
  assert.deepEqual(carryInto(sheet, prior).added, []);
  const otherBook = migrate3({ ...min, haftarah: { ...min.haftarah, book: "Isaiah" }, commentary: [] });
  assert.deepEqual(carryInto(otherBook, prior).added.filter(a => a.reading === "haftarah"), [], "a different haftarah (a special Shabbat) carries nothing");
});

test("See also: a parashah's short address; a festival's slug; added once to the calendar paragraph", () => {
  assert.equal(seeAlsoSentence({ slug: "2025-10-25-noach", cycle: "5786", parashahKey: "noach" }), "See also the 5786 sheet: haftarah.centralreform.org/5786/noach.");
  assert.equal(seeAlsoSentence({ slug: "2026-04-04-pesach-shabbat-chol-ha-moed", cycle: "5786", parashahKey: "pesach-shabbat-chol-ha-moed" }), "See also the 5786 sheet: haftarah.centralreform.org/2026-04-04-pesach-shabbat-chol-ha-moed.");
  const s = "See also the 5786 sheet: haftarah.centralreform.org/5786/noach.";
  assert.deepEqual(withSeeAlso({ calendar: "", setting: [] }, s), { calendar: s, setting: [] });
  assert.deepEqual(withSeeAlso({ calendar: "Read in place of X.", setting: [] }, s).calendar, `Read in place of X. ${s}`);
  assert.deepEqual(withSeeAlso({ calendar: ["One.", "Two."] }, s).calendar, ["One.", `Two. ${s}`]);
  assert.deepEqual(withSeeAlso(withSeeAlso({ calendar: "A." }, s), s).calendar, `A. ${s}`);
});

test("applyPrior: carry-forward is on by default (pointer, entries, sentence); --no-carry gives a fresh sheet the pointer only and leaves a kept sheet alone", async () => {
  const min = await load("week-min");
  const prior = priorFromSheet(min, { slug: "2025-10-25-noach", source: "web library" });
  const fresh = migrate3({ ...min, commentary: [] });
  const a = applyPrior(fresh, prior, { fresh: true });
  assert.deepEqual(a.sheet.prior, { slug: "2025-10-25-noach", hebrewEn: "29 Tishrei 5787", cycle: "5787" });
  assert.equal(a.added.length, 2);
  assert.ok(a.sheet.readings[0].commentary.every(e => e.status === "carried"));
  assert.match(a.sheet.openingNote.calendar, /See also the 5787 sheet: haftarah\.centralreform\.org\/5787\/bereshit\.$/);
  const kept = applyPrior(fresh, prior, {});
  assert.equal(kept.added.length, 2, "a kept sheet carries by default too");
  const again = applyPrior(a.sheet, prior, {});
  assert.deepEqual(again.added, []);
  assert.equal(again.changed, false, "a rerun changes nothing");
  const cut = structuredClone(a.sheet); cut.readings[0].commentary[0].status = "rejected";
  assert.deepEqual(applyPrior(cut, prior, {}).added, [], "an entry Daniel cut stays cut");
  const b = applyPrior(fresh, prior, { fresh: true, carry: false });
  assert.deepEqual(b.sheet.prior, a.sheet.prior);
  assert.equal(b.added.length, 0);
  assert.equal(b.sheet.openingNote.calendar, fresh.openingNote.calendar);
  const c = applyPrior(min, prior, { carry: false });
  assert.equal(c.sheet, min);
  assert.equal(c.changed, false);
});

test("applyPrior: the See also sentence is proposed once, when the pointer is first set; deleted, it stays deleted", async () => {
  const min = await load("week-min");
  const prior = priorFromSheet(min, { slug: "2025-10-25-noach", source: "web library" });
  const first = applyPrior(migrate3({ ...min, commentary: [] }), prior, { fresh: true }).sheet;
  assert.match(first.openingNote.calendar, /See also/);
  const edited = structuredClone(first);
  edited.openingNote.calendar = "Daniel's own words.";
  const rerun = applyPrior(edited, prior, {});
  assert.deepEqual(rerun.sheet.openingNote, edited.openingNote, "the deleted sentence is not put back");
  assert.equal(rerun.changed, false);
  assert.equal(rerun.sheet, edited);
  const newer = { ...prior, slug: "2026-10-17-noach" };
  assert.match(applyPrior(edited, newer, {}).sheet.openingNote.calendar, /Daniel's own words\. See also/, "a different prior is a first time");
});

test("applyPrior: a schema-2 kept sheet it changes comes back schema 3 with the pointer set, even with nothing to carry", async () => {
  const min = await load("week-min");
  const prior = { ...priorFromSheet(min, { slug: "2025-10-25-noach", source: "web library" }), readings: [] };
  const r = applyPrior(min, prior, {});
  assert.equal(r.changed, true);
  assert.deepEqual(r.added, []);
  assert.equal(r.sheet.schema, 3);
  assert.equal(r.sheet.prior.slug, "2025-10-25-noach");
  assert.ok(Array.isArray(r.sheet.readings) && !("haftarah" in r.sheet));
  const ptr = applyPrior(min, prior, { carry: false, fresh: true });
  assert.equal(ptr.sheet.schema, 3, "the pointer alone is a change too");
  assert.equal(min.schema, 2, "the input is not changed");
});

test("lookupPrior: each GET carries a timeout signal; an abort becomes no prior with the reason, never a throw", async () => {
  const seen = [];
  const hang = async (url, init = {}) => { seen.push(init.signal); const e = new Error("The operation was aborted due to timeout"); e.name = "TimeoutError"; throw e; };
  const p = await lookupPrior({ keys: ["noach"], civil: "2026-10-17", fetchImpl: hang });
  assert.equal(p.slug, null);
  assert.match(p.error, /library index could not be read \(The operation was aborted due to timeout\)/);
  assert.ok(seen[0] instanceof AbortSignal);
  const calls = [];
  const second = async (url, init = {}) => {
    calls.push(init.signal);
    if (String(url).endsWith("/data/index.json")) return new Response(JSON.stringify({ weeks: [{ slug: "2025-10-25-noach", civil: "2025-10-25", parashahKeys: ["noach"] }] }), { status: 200 });
    const e = new Error("This operation was aborted"); e.name = "AbortError"; throw e;
  };
  const q = await lookupPrior({ keys: ["noach"], civil: "2026-10-17", fetchImpl: second });
  assert.equal(q.slug, null);
  assert.match(q.error, /2025-10-25-noach's sheet could not be read \(This operation was aborted\)/);
  assert.ok(calls.length === 2 && calls.every(s => s instanceof AbortSignal));
});

test("no prior: the reason is kept, nothing is set on the sheet, and the digest says so", async () => {
  const none = noPrior(["haazinu"]);
  assert.deepEqual(none, { slug: null, parashahKey: "haazinu", searched: "web library" });
  const min = await load("week-min");
  const r = applyPrior(min, none, { fresh: true, carry: true });
  assert.equal(r.sheet, min);
  assert.match(lastTimeMarkdown(none, min), /^# Last time\n\nNo earlier sheet for haazinu in the web library\.\n$/);
  assert.match(lastTimeMarkdown(noPrior(["noach"], "the library index could not be read (HTTP 503)"), min), /Could not look: the library index could not be read \(HTTP 503\)\./);
  const failing = async () => new Response("down", { status: 503 });
  const looked = await lookupPrior({ keys: ["noach"], civil: "2026-10-17", fetchImpl: failing });
  assert.equal(looked.slug, null);
  assert.match(looked.error, /HTTP 503/);
});

test("lookupPrior reads the public library with GETs only, or a Drive folder when given", async () => {
  const notes = await load("week-notes");
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method || "GET" });
    if (String(url).endsWith("/data/index.json")) return new Response(JSON.stringify({ weeks: [{ slug: "2025-10-04-bereshit-machar-chodesh", civil: "2025-10-04", parashahKeys: ["bereshit"] }] }), { status: 200 });
    if (String(url).endsWith("/data/weeks/2025-10-04-bereshit-machar-chodesh/sheet.json")) return new Response(JSON.stringify(notes), { status: 200 });
    return new Response("no", { status: 404 });
  };
  const p = await lookupPrior({ keys: ["bereshit"], civil: "2026-10-10", fetchImpl });
  assert.equal(p.slug, "2025-10-04-bereshit-machar-chodesh");
  assert.equal(p.source, "web library");
  assert.deepEqual(calls.map(c => c.method), ["GET", "GET"]);
  assert.ok(calls.every(c => c.url.startsWith("https://haftarah.centralreform.org/data/")));
  const dir = await mkdtemp(join(tmpdir(), "prior-"));
  await writeFile(join(dir, "sheet.json"), JSON.stringify(notes));
  const q = await lookupPrior({ keys: ["bereshit"], civil: "2026-10-10", priorDir: dir, fetchImpl: async () => { throw new Error("no network for a folder"); } });
  assert.equal(q.source, "folder");
  assert.equal(q.slug, notes.slug);
  await rm(dir, { recursive: true, force: true });
});

test("lastTimeMarkdown: what was printed, what of it is in this year's reading, the verses it never reached, what was carried", async () => {
  const min = await load("week-min");
  const prior = priorFromSheet(min, { slug: "2025-10-25-noach", source: "web library" });
  const now = applyPrior(migrate3({ ...min, commentary: [] }), prior, {}).sheet;
  const md = lastTimeMarkdown(prior, now);
  assert.match(md, /^# Last time: 29 Tishrei 5787 \(2025-10-25-noach, from the web library\)/);
  assert.match(md, /Haftarah I Samuel 20:18-20: 2 entries printed; 2 in this year's reading \(20:18 Rashi; 20:19 A fixture summary\)\./);
  assert.match(md, /Verses with no entry last time: 20:20\./);
  assert.match(md, /Carried into this sheet: 2 \(status "carried"; set "rejected" to cut\)\./);
});
