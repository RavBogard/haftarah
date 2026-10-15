#!/usr/bin/env node
/**
 * migrate.mjs — schema 1 → 2, and on request 2 → 3.
 *
 *   node scripts/migrate.mjs weeks/<slug>           # schema 1 → 2 (a schema-2 file only gains missing fields)
 *   node scripts/migrate.mjs weeks/<slug> --to 3    # → schema 3: the haftarah becomes readings[0]
 */
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const L = createRequire(import.meta.url)("../template/lib.js");

const SIGNOFF = "I chose and approved every entry on this sheet; summaries marked as such were drafted with Claude and read before printing. Tell me what I got wrong.";

// Idempotent: a file already on schema 2 comes back unchanged except for fields it still lacks.
export function migrate(d) {
  const out = { ...d };
  out.schema = 2;
  out.series = d.series || { name: "Torah from Scratch", year: String((d.shabbat?.hebrewEn || "").split(/\s+/).pop() || "") };
  if (!d.openingNote) {
    const cal = [];
    if (d.haftarah?.defaultHaftarah) cal.push(`Read in place of the usual haftarah for ${d.shabbat.parashah.en}, ${d.haftarah.defaultHaftarah.replace(/(\d)-(\d)/g, "$1–$2")}.`);
    if (d.haftarah?.whyThisHaftarah) cal.push(d.haftarah.whyThisHaftarah);
    if (d.parashahConnection) cal.push(d.parashahConnection);
    out.openingNote = { calendar: cal.join(" "), setting: (d.context?.paragraphs || []).slice(), status: d.context?.status || "proposed" };
  }
  out.nextWeek = d.nextWeek ?? null;
  out.haftarah = { ...d.haftarah }; delete out.haftarah.whyThisHaftarah;
  delete out.questions; delete out.context; delete out.parashahConnection;
  // Every printable item carries a status, so the gate can see it; anything unmarked is proposed.
  out.glosses = (d.glosses || []).map(g => ({ en: "", status: "proposed", ...g }));
  out.glossary = (d.glossary || []).map(t => ({ status: "proposed", ...t }));
  out.commentary = (d.commentary || []).map(e => e.register === "critical" ? { works: [], ...e } : e);
  const credits = { ...d.credits }; delete credits.note;
  out.credits = { signoff: SIGNOFF, ...credits };
  return out;
}

/**
 * Schema 2 → 3: the haftarah and its verses, glosses and commentary become readings[0]; every verse
 * names its book; every entry gets an id. Everything that belongs to the week stays where it was.
 * The input is not changed. On a schema-3 file it only fills a missing book or id.
 */
export function migrate3(d) {
  if (Number(d.schema) >= 3) {
    const out = structuredClone(d);
    const taken = new Set();
    for (const r of out.readings || []) {
      for (const v of r.verses || []) if (!v.book && r.book) v.book = r.book;
      L.assignEntryIds(r.commentary || [], r.id, taken);
    }
    return out;
  }
  const two = Number(d.schema) === 2 ? d : migrate(d);
  if (!two.haftarah?.book) console.error(`migrate3: ${d.slug || "this week"} has no haftarah.book; verses get no book`);
  const { haftarah = {}, verses = [], glosses = [], commentary = [], ...rest } = structuredClone(two);
  const reading = {
    id: "haftarah", kind: "haftarah", ...haftarah,
    verses: verses.map(v => (haftarah.book ? { ...v, book: v.book || haftarah.book } : v)),
    glosses,
    commentary,
  };
  L.assignEntryIds(reading.commentary, reading.id);
  return { ...rest, schema: 3, readings: [reading] };
}

async function main() {
  const args = process.argv.slice(2);
  const toAt = args.indexOf("--to");
  const to = toAt >= 0 ? Number(args[toAt + 1]) : 2;
  const dirArg = args.find((a, i) => !a.startsWith("--") && !(toAt >= 0 && i === toAt + 1));   // not a flag, not the value after --to
  if (!dirArg || ![2, 3].includes(to)) { console.error("usage: node scripts/migrate.mjs weeks/<slug> [--to 2|3]"); process.exit(1); }
  const p = join(resolve(dirArg), "sheet.json");
  const d = JSON.parse(await readFile(p, "utf8"));
  if (to === 2 && Number(d.schema) >= 3) { console.error(`${p} is schema ${d.schema}; migrating it to 2 would lose its readings, so nothing was written`); process.exit(1); }
  const out = to === 3 ? migrate3(d) : migrate(d);
  await writeFile(p, JSON.stringify(out, null, 2) + "\n", "utf8");
  const view = L.readingView(out);
  const todo = [];
  for (const g of view.glosses || []) if (!g.en) todo.push(`gloss ${g.verse} ${g.lemma}: add "en" (the English words it belongs to)`);
  for (const e of view.commentary || []) if (e.register === "critical" && !(e.works || []).length) todo.push(`critical ${e.verse} ${e.source}: add "works" keys from bibliography/${view.haftarah.book}.md`);
  console.log(`Migrated ${p} to schema ${to}.` + (todo.length ? `\nStill needed:\n  - ${todo.join("\n  - ")}` : ""));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) main().catch(err => { console.error(err.message || err); process.exit(1); });
