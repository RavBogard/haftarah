// The library over index.json: the short addresses (/noach, /5787/noach, /torah/genesis,
// /prophets/isaiah, /special/shuva) and, from Task 11, the landing's views. Pure: no DOM. Every row
// is an index.json week; rows written before index v2 are read through weekKeys and fall back to
// their v1 fields (publish.mjs --reindex fills them in).
import { PARASHOT, COMBINED, TORAH_BOOKS, PROPHET_BOOKS, SPECIALS, keyOf, isParashahKey, parashahName, weekKeys } from "./parashot.js";
import { isSlug } from "./contract.js";

/** Newest Shabbat first; two sheets on one Shabbat: the plainer (shorter) slug first. */
export const newestFirst = (a, b) => String(b.civil || "").localeCompare(String(a.civil || "")) || String(a.slug).length - String(b.slug).length || String(a.slug).localeCompare(String(b.slug));

/** What a short address asks for, or null for any other path. */
export function parseAlias(pathname) {
  const p = String(pathname == null ? "" : pathname).replace(/\/+$/, "");
  let m = /^\/(\d{4})\/([a-z0-9-]+)$/.exec(p);
  if (m && isParashahKey(m[2])) return { kind: "week", year: m[1], key: m[2] };
  m = /^\/([a-z0-9-]+)$/.exec(p);
  if (m && isParashahKey(m[1])) return { kind: "week", year: null, key: m[1] };
  m = /^\/torah\/([a-z0-9-]+)$/.exec(p);
  if (m) { const book = TORAH_BOOKS.find(b => keyOf(b) === m[1]); if (book) return { kind: "torah", book }; }
  m = /^\/prophets\/([a-z0-9-]+)$/.exec(p);
  if (m) { const book = PROPHET_BOOKS.find(b => keyOf(b) === m[1]); if (book) return { kind: "prophets", book }; }
  m = /^\/special\/([a-z0-9-]+)$/.exec(p);
  if (m) { const s = SPECIALS.find(x => x.tag === m[1]); if (s) return { kind: "special", tag: s.tag, en: s.en }; }
  return null;
}

/**
 * A week alias → the latest sheet for that parashah (that year's, with a year); a combined pair and its
 * halves find each other. A combined alias prefers the newest week that holds both halves, and falls
 * back to either half only when there is none. A row whose slug is not a week slug is never a result.
 */
export function resolveWeekAlias(alias, weeks) {
  const want = COMBINED[alias.key] || [alias.key];
  const hits = (weeks || []).filter(w => isSlug(w.slug) && weekKeys(w).some(k => want.includes(k)) && (!alias.year || String(w.cycle || "") === alias.year)).sort(newestFirst);
  const both = want.length > 1 ? hits.filter(w => want.every(k => weekKeys(w).includes(k))) : [];
  const best = both[0] || hits[0];
  return best ? { slug: best.slug } : { missing: { key: alias.key, year: alias.year, en: parashahName(alias.key) } };
}

/** The Torah book a week belongs to: its parashah's, else its Torah reading's; null for a festival without one. */
export function torahBookOf(w) {
  const keys = weekKeys(w);
  const p = PARASHOT.find(x => keys.includes(x.key));
  if (p) return p.book;
  const t = (w.readings || []).find(r => r.kind === "torah");
  return t ? t.book || null : null;
}
export const haftarahOf = w => (w.readings || []).find(r => r.kind === "haftarah") || null;
export const haftarahBookOf = w => (haftarahOf(w) || {}).book || w.book || null;
export const haftarahRefOf = w => (haftarahOf(w) || {}).ref || w.ref || "";

/** A list alias → its title and its weeks, newest first. */
export function weeksFor(alias, weeks) {
  const list = (weeks || []).slice().sort(newestFirst);
  if (alias.kind === "torah") return { title: `Torah: ${alias.book}`, weeks: list.filter(w => torahBookOf(w) === alias.book) };
  if (alias.kind === "prophets") return { title: `Haftarot from ${alias.book}`, weeks: list.filter(w => haftarahBookOf(w) === alias.book) };
  if (alias.kind === "special") return { title: alias.en, weeks: list.filter(w => (w.tags || []).includes(alias.tag)) };
  return { title: "", weeks: [] };
}

/** The by-parashah grid: five book bands, a cell per parashah in Torah order with its years and latest sheet. */
export function parashahGrid(weeks, { currentSlug = null } = {}) {
  return TORAH_BOOKS.map(book => ({
    book,
    cells: PARASHOT.filter(p => p.book === book).map(p => {
      const mine = (weeks || []).filter(w => weekKeys(w).includes(p.key)).sort(newestFirst);
      return {
        key: p.key, en: p.en, he: p.he,
        years: [...new Set(mine.map(w => String(w.cycle || "")).filter(Boolean))].sort(),
        latest: mine.length ? mine[0].slug : null,
        current: !!currentSlug && mine.some(w => w.slug === currentSlug),
      };
    }),
  }));
}

/** The chapters a list of refs covers, sorted: "Isaiah 54:1–55:5" → 54, 55; "…; 29:22–23" adds 29. */
export function chaptersOf(refs) {
  const out = new Set();
  for (const ref of refs || []) for (const m of String(ref).matchAll(/(\d+):\d+(?:[–-](\d+):\d+)?/g)) {
    const a = Number(m[1]), z = m[2] ? Number(m[2]) : a;
    for (let c = a; c <= z; c++) out.add(c);
  }
  return [...out].sort((a, b) => a - b);
}

/** The by-book door: the Torah books with their weeks; the haftarah books that hold sheets, Joshua to Malachi, with the chapters covered. */
export function byBook(weeks) {
  const list = (weeks || []).slice().sort(newestFirst);
  return {
    torah: TORAH_BOOKS.map(book => ({ book, key: keyOf(book), weeks: list.filter(w => torahBookOf(w) === book) })),
    prophets: PROPHET_BOOKS.map(book => {
      const ws = list.filter(w => haftarahBookOf(w) === book);
      return { book, key: keyOf(book), weeks: ws, chapters: chaptersOf(ws.map(haftarahRefOf)) };
    }).filter(b => b.weeks.length),
  };
}

/** The special-Shabbat door: the specials that hold sheets, in SPECIALS order. */
export function specials(weeks) {
  const list = (weeks || []).slice().sort(newestFirst);
  return SPECIALS.map(s => ({ tag: s.tag, en: s.en, weeks: list.filter(w => (w.tags || []).includes(s.tag)) })).filter(s => s.weeks.length);
}
