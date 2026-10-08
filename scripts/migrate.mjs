#!/usr/bin/env node
/** migrate.mjs — schema 1 → 2.   node scripts/migrate.mjs weeks/<slug> --number 3 */
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SIGNOFF = "I chose and approved every entry on this sheet; summaries marked as such were drafted with Claude and read before printing. Tell me what I got wrong.";

// Idempotent: a file already on schema 2 comes back unchanged except for fields it still lacks.
export function migrate(d, number) {
  const out = { ...d };
  out.schema = 2;
  out.series = d.series || { name: "Torah from Scratch", year: String((d.shabbat?.hebrewEn || "").split(/\s+/).pop() || ""), number };
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

async function main() {
  const dirArg = process.argv.slice(2).find(a => !a.startsWith("--"));
  const numIdx = process.argv.indexOf("--number");
  const number = numIdx > -1 ? Number(process.argv[numIdx + 1]) : null;
  if (!dirArg || number == null || Number.isNaN(number)) { console.error("usage: node scripts/migrate.mjs weeks/<slug> --number N"); process.exit(1); }
  const p = join(resolve(dirArg), "sheet.json");
  const d = JSON.parse(await readFile(p, "utf8"));
  const out = migrate(d, number);
  await writeFile(p, JSON.stringify(out, null, 2) + "\n", "utf8");
  const todo = [];
  for (const g of out.glosses) if (!g.en) todo.push(`gloss ${g.verse} ${g.lemma}: add "en" (the English words it belongs to)`);
  for (const e of out.commentary) if (e.register === "critical" && !(e.works || []).length) todo.push(`critical ${e.verse} ${e.source}: add "works" keys from bibliography/${out.haftarah.book}.md`);
  console.log(`Migrated ${p} to schema 2.` + (todo.length ? `\nStill needed:\n  - ${todo.join("\n  - ")}` : ""));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) main().catch(err => { console.error(err.message || err); process.exit(1); });
