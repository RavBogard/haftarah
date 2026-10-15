#!/usr/bin/env node
/**
 * translations.mjs — the other English versions a reader can switch to (spec 5.6), fetched from
 * Sefaria at publish into weeks/<slug>/translations.json. The sheet's own English (JPS 2023) is the
 * default and lives in sheet.json; this file holds the rest, verse-aligned, with each version's title
 * and licence so the page can credit what it shows. Only the editions in customs.translations that
 * this table knows are offered; copyrighted versions (Fox) never are.
 *
 *   node scripts/translations.mjs weeks/<slug> [--customs crc]
 */
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { getJSON, flattenVerses } from "./fetch.mjs";
import { loadCustoms } from "./customs.mjs";

const L = createRequire(import.meta.url)("../template/lib.js");

export const DEFAULT_KEY = "jps2023";
export const DEFAULT_LABEL = "JPS 2023";
// Keys are what customs.translations names; titles are Sefaria's exact versionTitle strings.
export const TRANSLATIONS = {
  jps1985: { label: "JPS 1985", titles: ["Tanakh: The Holy Scriptures, published by JPS"], credit: "English: Tanakh: The Holy Scriptures (The Jewish Publication Society, 1985), CC BY-NC, via Sefaria." },
  koren: { label: "Koren", titles: ["The Koren Jerusalem Bible"], credit: "English: The Koren Jerusalem Bible (Koren Publishers Jerusalem), CC BY-NC, via Sefaria." },
  metsudah: {
    label: "Metsudah",
    titles: ["The Metsudah Tanach series, Lakewood, N.J", "Metsudah Chumash, Metsudah Publications, 2009"],
    credits: {
      "The Metsudah Tanach series, Lakewood, N.J": "English: The Metsudah Tanach series (Lakewood, N.J.), CC BY, via Sefaria.",
      "Metsudah Chumash, Metsudah Publications, 2009": "English: Metsudah Chumash (Metsudah Publications, 2009), CC BY, via Sefaria.",
    },
  },
};
const creditFor = (key, title) => TRANSLATIONS[key].credits ? TRANSLATIONS[key].credits[title] : TRANSLATIONS[key].credit;

/** A verse's HTML without Sefaria's footnotes (they belong to that edition, not to the sheet's keyed notes). */
export function plainVersion(html) {
  return String(html == null ? "" : html)
    .replace(/<sup class="footnote-marker">[^<]*<\/sup>/g, "")
    .replace(/<i class="footnote">(?:<i>.*?<\/i>|(?!<\/i>)[\s\S])*?<\/i>/g, "")
    .replace(/\s+(<br\s*\/?>)/g, "$1").replace(/[ \t]{2,}/g, " ").trim();
}

export const versionsOf = json => ((json && json.versions) || []).filter(v => v && v.language === "en").map(v => ({ versionTitle: v.versionTitle || "", license: v.license || "", text: v.text }));

const textsUrl = ref => `https://www.sefaria.org/api/v3/texts/${encodeURIComponent(ref.replace(/\s+/g, " "))}?version=${encodeURIComponent("english|all")}&return_format=default`;

export async function translationsFor(sheet, customs, { get = getJSON } = {}) {
  const wanted = (customs.translations || []).filter(k => k !== DEFAULT_KEY);
  const unknown = wanted.filter(k => !TRANSLATIONS[k]);
  const keys = wanted.filter(k => TRANSLATIONS[k]);
  const translations = { schema: 1, slug: sheet.slug || "", readings: {} };
  const report = {};
  for (const r of L.readings(sheet)) {
    if (!(r.verses || []).length) continue;
    let json;
    try { json = await get(textsUrl(r.ref)); } catch (err) { throw new Error(`translations: ${r.id} (${r.ref}): ${err.message}`); }
    const have = versionsOf(json);
    const versions = [], offered = [], absent = [];
    for (const key of keys) {
      const title = TRANSLATIONS[key].titles.find(t => have.some(v => v.versionTitle === t));
      if (!title) { absent.push(key); continue; }
      const v = have.find(x => x.versionTitle === title);
      const flat = flattenVerses(v.text || [], json.sections || [], json.toSections || []);
      const byKey = new Map(flat.map(x => [`${x.chapter}:${x.verse}`, plainVersion(x.text)]));
      const verses = {};
      for (const sv of r.verses) verses[`${sv.chapter}:${sv.verse}`] = byKey.get(`${sv.chapter}:${sv.verse}`) || "";
      versions.push({ key, label: TRANSLATIONS[key].label, title, license: v.license, credit: creditFor(key, title), verses });
      offered.push(key);
    }
    translations.readings[r.id] = { ref: r.ref, versions };
    report[r.id] = { offered, absent, ...(unknown.length ? { unknown } : {}) };
  }
  return { translations, report };
}

export async function buildTranslations(dir, { customs, get = getJSON, log = console.log } = {}) {
  const sheet = JSON.parse(await readFile(join(dir, "sheet.json"), "utf8"));
  const { translations, report } = await translationsFor(sheet, customs, { get });
  const file = join(dir, "translations.json");
  await writeFile(file, JSON.stringify(translations));
  for (const [id, rep] of Object.entries(report)) {
    log(`translations  ${id}  ${rep.offered.join(", ") || "none"}${rep.absent.length ? ` (not on Sefaria for this book: ${rep.absent.join(", ")})` : ""}${rep.unknown ? ` (unknown in customs: ${rep.unknown.join(", ")})` : ""}`);
  }
  return { file, report };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const args = process.argv.slice(2);
  const i = args.indexOf("--customs");
  const dir = args.find((a, j) => !a.startsWith("--") && j !== i + 1);
  if (!dir) { console.error("usage: node scripts/translations.mjs weeks/<slug> [--customs crc]"); process.exit(1); }
  loadCustoms(i >= 0 ? args[i + 1] : "crc").then(customs => buildTranslations(dir, { customs })).catch(err => { console.error(`translations: ${err.message}`); process.exit(1); });
}
