// The two-reading fixture, derived from week-min so no new text enters the repo: the haftarah is
// week-min migrated to schema 3, untouched, and the Torah reading is the same synthetic verses (and
// their gloss and classical entry) relabelled Genesis 6:9-11. The slug stays week-min's, so the
// haftarah's view is exactly migrate3(week-min)'s and must build the same sheet.html.
// tests/fixtures/week-torah/sheet.json is this function's output; tests/build.test.mjs holds them equal.
import { createRequire } from "node:module";
import { migrate3 } from "../../scripts/migrate.mjs";
const L = createRequire(import.meta.url)("../../template/lib.js");

const ALIYOT = [
  { n: 1, ref: "Genesis 6:9-22", verses: 14 }, { n: 2, ref: "Genesis 7:1-16", verses: 16 }, { n: 3, ref: "Genesis 7:17-8:14", verses: 22 },
  { n: 4, ref: "Genesis 8:15-9:7", verses: 15 }, { n: 5, ref: "Genesis 9:8-17", verses: 10 }, { n: 6, ref: "Genesis 9:18-10:32", verses: 44 },
  { n: 7, ref: "Genesis 11:1-32", verses: 32 }, { n: "M", ref: "Genesis 11:29-32", verses: 4 },
];

export function makeWeekTorah(weekMin) {
  const week = migrate3(weekMin);
  const h = week.readings[0];
  const first = h.verses[0].verse;
  const to = v => 9 + (v - first);   // week-min is one chapter: 20:18 becomes 6:9
  const torah = {
    id: "torah", kind: "torah", ref: `Genesis 6:9-${to(h.verses[h.verses.length - 1].verse)}`, heRef: null, book: "Genesis",
    selection: "aliyah 1, its first verses", aliyot: ALIYOT, maftir: { ref: "Genesis 11:29-32" },
    incipit: { ...h.incipit }, title: { en: "Noach", he: (h.title && h.title.he) || "" }, versions: { ...h.versions },
    verses: h.verses.map(v => ({ ...v, book: "Genesis", chapter: 6, verse: to(v.verse), ref: `Genesis 6:${to(v.verse)}` })),
    glosses: h.glosses.map(g => ({ ...g, chapter: 6, verse: to(g.verse) })),
    commentary: h.commentary.filter(e => e.register !== "critical").map(({ id, ...e }) => ({
      ...e, chapter: 6, verse: to(e.verse), ...(e.verseEnd ? { verseEnd: to(e.verseEnd) } : {}),
      sourceRef: String(e.sourceRef || "").replace(/ on .*$/, ` on Genesis 6:${to(e.verse)}`),
    })),
  };
  L.assignEntryIds(torah.commentary, "torah", new Set(h.commentary.map(e => e.id)));
  week.readings.unshift(torah);
  // Next week is Noach in week-min; its Torah reading is what the Torah sheet's colophon names.
  if (week.nextWeek) week.nextWeek = { ...week.nextWeek, torahRef: "Genesis 6:9–11:32" };
  return week;
}
