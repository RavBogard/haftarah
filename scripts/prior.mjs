/**
 * prior.mjs — "Last time": the most recent earlier sheet for the same parashah, what it printed, and
 * what of it fits this year's readings. fetch.mjs writes prior.json every run and, unless --no-carry,
 * copies the fitting entries in (status "carried", Daniel cuts: carry-forward is on by default); digest.mjs prints the "Last time" section.
 *
 * The prior comes from the public library (index.json and that week's sheet.json, GET only: the
 * published copy, which has what printed and none of what was cut), or from a week folder restored
 * from Drive (--prior <dir>), which also has the rejected entries.
 */
import { readFile } from "node:fs/promises";
import { join, basename, resolve } from "node:path";
import { createRequire } from "node:module";
import { indexUrl, dataUrl } from "../site/app/contract.js";
import { weekKeys, isParashahKey } from "../site/app/parashot.js";
import { migrate3 } from "./migrate.mjs";

const L = createRequire(import.meta.url)("../template/lib.js");
export const SITE = "https://haftarah.centralreform.org";

const newestFirst = (a, b) => String(b.civil).localeCompare(String(a.civil)) || String(a.slug).length - String(b.slug).length || String(a.slug).localeCompare(String(b.slug));

/** The newest week before `civil` that shares a parashah key with `keys`; null when there is none. */
export function findPrior(index, { keys, civil }) {
  const want = new Set(keys || []);
  const rows = ((index && index.weeks) || []).filter(w => String(w.civil || "") < civil && weekKeys(w).some(k => want.has(k)));
  return rows.sort(newestFirst)[0] || null;
}

/** What prior.json keeps of an earlier sheet: per reading, the printed entries with ids and chapters, its glosses, and what was cut. */
export function priorFromSheet(sheet, { slug, source }) {
  const s = sheet.shabbat || {};
  return {
    slug, source,
    hebrewEn: s.hebrewEn || "",
    cycle: String((sheet.series && sheet.series.year) || (s.hebrewEn || "").split(/\s+/).pop() || ""),
    parashahKey: L.parashahKey((s.parashah && s.parashah.en) || ""),
    readings: L.readings(sheet).map(r => {
      // A schema-2 sheet's entries get the ids migrate --to 3 would give them; a schema-3 sheet's keep theirs.
      const list = L.assignEntryIds(structuredClone(r.commentary || []), r.id);
      const chapterOf = e => (e.chapter != null ? e.chapter : ((r.verses || []).find(v => v.verse === e.verse) || {}).chapter ?? null);
      const strip = ({ status, carried, ...e }) => ({ ...e, chapter: chapterOf(e) });
      return {
        id: r.id, kind: r.kind, ref: r.ref || "", book: r.book || "",
        entries: list.filter(e => e.status !== "rejected").map(strip),
        glosses: (r.glosses || []).filter(g => g.status !== "rejected").map(({ status, ...g }) => g),
        cut: list.filter(e => e.status === "rejected").map(e => ({ id: e.id, chapter: chapterOf(e), verse: e.verse, source: e.source || "", sourceRef: e.sourceRef || "" })),
      };
    }),
  };
}

/** prior.json when there is nothing to build on, and why. */
export function noPrior(keys, error = null) {
  const out = { slug: null, parashahKey: (keys && keys[0]) || "", searched: "web library" };
  if (error) out.error = error;
  return out;
}

/** The prior: a Drive-restored folder when given, else the public library. Never throws for a library it cannot reach. */
export async function lookupPrior({ keys, civil, priorDir = null, fetchImpl = globalThis.fetch, site = SITE }) {
  if (priorDir) {
    const sheet = JSON.parse(await readFile(join(priorDir, "sheet.json"), "utf8"));
    return priorFromSheet(sheet, { slug: sheet.slug || basename(resolve(priorDir)), source: "folder" });
  }
  const get = async url => {
    const res = await fetchImpl(url, { method: "GET", headers: { accept: "application/json" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  };
  let index;
  try { index = await get(`${site}${indexUrl()}`); }
  catch (err) { return noPrior(keys, `the library index could not be read (${err.message})`); }
  const row = findPrior(index, { keys, civil });
  if (!row) return noPrior(keys);
  try { return priorFromSheet(await get(`${site}${dataUrl(row.slug, "sheet.json")}`), { slug: row.slug, source: "web library" }); }
  catch (err) { return noPrior(keys, `${row.slug}'s sheet could not be read (${err.message})`); }
}

/** Copy each prior entry that falls in this year's reading of the same kind and book; ids kept; reruns add nothing. */
export function carryInto(sheet, prior) {
  if (!prior || !prior.slug) return { sheet, added: [] };
  const out = Number(sheet.schema) >= 3 ? structuredClone(sheet) : migrate3(sheet);
  const have = new Set(L.readings(out).flatMap(r => (r.commentary || []).map(e => e.id)).filter(Boolean));
  const added = [];
  for (const pr of prior.readings || []) {
    const r = (out.readings || []).find(x => x.kind === pr.kind && x.book === pr.book);
    if (!r) continue;
    const here = new Set((r.verses || []).map(v => `${v.chapter}:${v.verse}`));
    for (const e of pr.entries || []) {
      if (!e.id || have.has(e.id) || !here.has(`${e.chapter}:${e.verse}`)) continue;
      (r.commentary = r.commentary || []).push({ ...e, status: "carried", carried: prior.slug });
      have.add(e.id);
      added.push({ reading: r.id, id: e.id, chapter: e.chapter, verse: e.verse, source: e.source || "" });
    }
  }
  return { sheet: added.length ? out : sheet, added };
}

/** The opening note's proposed sentence (spec 5.4). A festival has no short address, so it links the slug. */
export function seeAlsoSentence(prior) {
  const path = isParashahKey(prior.parashahKey) ? `${prior.cycle}/${prior.parashahKey}` : prior.slug;
  return `See also the ${prior.cycle} sheet: ${SITE.replace(/^https:\/\//, "")}/${path}.`;
}

/** The opening note with the sentence at the end of its calendar paragraph, once. */
export function withSeeAlso(note, sentence) {
  const on = { ...(note || {}) };
  const cal = on.calendar;
  if ([].concat(cal || []).some(p => String(p).includes(sentence))) return on;
  if (Array.isArray(cal)) on.calendar = cal.length ? [...cal.slice(0, -1), `${cal[cal.length - 1]} ${sentence}`] : [sentence];
  else on.calendar = cal ? `${cal} ${sentence}` : sentence;
  return on;
}

/**
 * What fetch does with the prior. Carry-forward is on by default (Daniel cuts): the pointer, the fitting
 * entries and the "See also" sentence, on a new sheet and on a kept one (reruns add nothing). With
 * carry: false (--no-carry), a new sheet gets the pointer only and a kept sheet is left alone.
 */
export function applyPrior(sheet, prior, { carry = true, fresh = false } = {}) {
  if (!prior || !prior.slug || !(carry || fresh)) return { sheet, changed: false, added: [] };
  let out = sheet, added = [];
  const pointer = { slug: prior.slug, hebrewEn: prior.hebrewEn, cycle: prior.cycle };
  if (JSON.stringify(sheet.prior) !== JSON.stringify(pointer)) out = { ...out, prior: pointer };
  if (carry) {
    ({ sheet: out, added } = carryInto(out, prior));
    const note = withSeeAlso(out.openingNote, seeAlsoSentence(prior));
    if (JSON.stringify(note) !== JSON.stringify(out.openingNote)) out = { ...out, openingNote: note };
  }
  return { sheet: out, changed: out !== sheet, added };
}

// "20:2, 20:4–6": verse labels, consecutive runs in one chapter joined.
function runs(list) {
  const out = [];
  for (const [c, v] of list) {
    const last = out[out.length - 1];
    if (last && last.c === c && last.to === v - 1) last.to = v;
    else out.push({ c, from: v, to: v });
  }
  return out.map(x => (x.from === x.to ? `${x.c}:${x.from}` : `${x.c}:${x.from}–${x.to}`)).join(", ");
}

/** The digest's "Last time" section. */
export function lastTimeMarkdown(prior, sheet) {
  if (!prior || !prior.slug) {
    const why = prior && prior.error ? `Could not look: ${prior.error}.` : `No earlier sheet for ${(prior && prior.parashahKey) || "this parashah"} in the ${(prior && prior.searched) || "web library"}.`;
    return `# Last time\n\n${why}\n`;
  }
  const out = [`# Last time: ${prior.hebrewEn} (${prior.slug}, from the ${prior.source})`, ""];
  const now = sheet ? L.readings(sheet) : [];
  for (const pr of prior.readings || []) {
    const label = pr.kind === "torah" ? "Torah" : "Haftarah";
    const r = now.find(x => x.kind === pr.kind && x.book === pr.book);
    const here = new Set(((r && r.verses) || []).map(v => `${v.chapter}:${v.verse}`));
    const inRange = pr.entries.filter(e => here.has(`${e.chapter}:${e.verse}`));
    const outside = pr.entries.length - inRange.length;
    const named = inRange.map(e => `${e.chapter}:${e.verse} ${e.source}`).join("; ");
    out.push(`${label} ${pr.ref}: ${pr.entries.length} entr${pr.entries.length === 1 ? "y" : "ies"} printed; ${r ? `${inRange.length} in this year's reading${named ? ` (${named})` : ""}` : `this year's ${label.toLowerCase()} is a different passage`}${outside && r ? `; ${outside} outside it` : ""}.`);
    if (pr.cut && pr.cut.length) out.push(`Cut last time: ${pr.cut.map(e => `${e.chapter}:${e.verse} ${e.source}`).join("; ")}.`);
    if (r) {
      const covered = new Set(pr.entries.map(e => `${e.chapter}:${e.verse}`));
      const bare = (r.verses || []).filter(v => !covered.has(`${v.chapter}:${v.verse}`)).map(v => [v.chapter, v.verse]);
      if (bare.length) out.push(`Verses with no entry last time: ${runs(bare)}.`);
      const carried = (r.commentary || []).filter(e => e.carried === prior.slug).length;
      if (carried) out.push(`Carried into this sheet: ${carried} (status "carried"; set "rejected" to cut).`);
    }
    out.push("");
  }
  for (const r of now) if (!(prior.readings || []).some(pr => pr.kind === r.kind)) out.push(`${r.kind === "torah" ? "Torah" : "Haftarah"}: not on the ${prior.cycle} sheet.`, "");
  return out.join("\n").replace(/\n+$/, "\n");
}
