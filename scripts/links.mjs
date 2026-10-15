#!/usr/bin/env node
/**
 * links.mjs — "Everything on this verse" (spec 5.7): what Sefaria links to each verse, in textual
 * categories only, grouped by work, with no text (the page fetches one item when it is tapped).
 * Written at publish into weeks/<slug>/links.json. User sheets, topics, manuscripts, media and essays
 * are never kept. Visibly not the sheet: the page says so.
 *
 *   node scripts/links.mjs weeks/<slug>
 */
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { getJSON } from "./fetch.mjs";

const L = createRequire(import.meta.url)("../template/lib.js");

export const CATEGORIES = ["Commentary", "Targum", "Midrash", "Talmud", "Halakhah", "Kabbalah", "Chasidut", "Jewish Thought", "Musar", "Second Temple", "Reference", "Liturgy", "Tanakh", "Quoting Commentary"];
const BY_WORK = new Set(["Commentary", "Quoting Commentary"]);

/** Sefaria's links for one verse → the spec's categories in order, each by work, Hebrew-only refs apart. */
export function groupLinks(links) {
  const byCat = new Map();
  let n = 0;
  for (const l of Array.isArray(links) ? links : []) {
    if (!l || !CATEGORIES.includes(l.category) || !l.ref) continue;
    const title = (BY_WORK.has(l.category) && l.collectiveTitle && l.collectiveTitle.en) || l.index_title || l.ref;
    if (!byCat.has(l.category)) byCat.set(l.category, new Map());
    const works = byCat.get(l.category);
    if (!works.has(title)) works.set(title, { title, refs: [], he: [], num: l.commentaryNum != null ? Number(l.commentaryNum) : null });
    const w = works.get(title);
    (l.sourceHasEn === false ? w.he : w.refs).push(l.ref);
    n++;
  }
  const groups = CATEGORIES.filter(c => byCat.has(c)).map(category => ({
    category,
    works: [...byCat.get(category).values()]
      .sort((a, b) => (a.num != null && b.num != null ? a.num - b.num : a.num != null ? -1 : b.num != null ? 1 : a.title.localeCompare(b.title)))
      .map(({ title, refs, he }) => ({ title, refs, he })),
  }));
  return { n, groups };
}

const relatedUrl = ref => `https://www.sefaria.org/api/related/${encodeURIComponent(ref.replace(/\s+/g, " "))}`;

export async function relatedFor(sheet, { get = getJSON } = {}) {
  const links = { schema: 1, slug: sheet.slug || "", readings: {} };
  const report = {};
  for (const r of L.readings(sheet)) {
    if (!(r.verses || []).length) continue;
    const verses = {};
    const rep = { verses: 0, links: 0, failed: [], errors: {} };   // errors: why each failed verse failed (the report only)
    for (const v of r.verses) {
      const key = `${v.chapter}:${v.verse}`;
      rep.verses++;
      try {
        const json = await get(relatedUrl(`${v.book || r.book} ${key}`));
        verses[key] = groupLinks(json && json.links);
        rep.links += verses[key].n;
      } catch (err) {
        verses[key] = { n: 0, groups: [], failed: true };
        rep.failed.push(key);
        rep.errors[key] = (err && err.message) || String(err);
      }
    }
    links.readings[r.id] = { verses };
    report[r.id] = rep;
  }
  return { links, report };
}

export async function buildLinks(dir, { get = getJSON, log = console.log } = {}) {
  const sheet = JSON.parse(await readFile(join(dir, "sheet.json"), "utf8"));
  const { links, report } = await relatedFor(sheet, { get });
  const file = join(dir, "links.json");
  await writeFile(file, JSON.stringify(links));
  for (const [id, rep] of Object.entries(report)) log(`links    ${id}  ${rep.verses} verses, ${rep.links} links${rep.failed.length ? `; Sefaria did not answer for ${rep.failed.join(", ")} (first: ${rep.errors[rep.failed[0]]})` : ""}`);
  return { file, report };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const dir = process.argv.slice(2).find(a => !a.startsWith("--"));
  if (!dir) { console.error("usage: node scripts/links.mjs weeks/<slug>"); process.exit(1); }
  buildLinks(dir).catch(err => { console.error(`links: ${err.message}`); process.exit(1); });
}
