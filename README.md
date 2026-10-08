# Haftarah study sheets

A weekly, letter-size study sheet for Central Reform Congregation: the haftarah in Hebrew (Miqra according to the Masorah, with cantillation) and English (JPS Gender-Sensitive Edition), with commentary in three registers laid out as a critical edition. Text comes from Sefaria; the layout is fixed; each week is one data file.

```
PRODUCT.md                  what this is and for whom (durable product facts)
DESIGN.md                   the visual system (written from the built sheet)
template/
  sheet.html                page shell filled by the build
  sheet.css                 the one frame every week shares
  render.js                 browser-side paginator: front page, text pages, apparatus, margin notes, end matter
  lib.js                    pure functions shared by the renderer and the tests (keys, poetry, divine name, incipit fit)
  voices.json               one-line identifications of named sources, for the front page
  fonts/                    Ezra SIL (Hebrew), Literata (English), Noto Serif Hebrew (fallback); OFL licenses alongside
scripts/
  fetch.mjs                 Hebcal + Sefaria -> weeks/<slug>/sheet.json and candidates.json
  build.mjs                 sheet.json -> sheet.html -> sheet.pdf (headless Chrome/Edge), optional page PNGs; refuses a broken citation
  check.mjs                 renders twice and asserts the layout rules (no lone verse, no gap over the rule, keys in series, same output both times)
  migrate.mjs               schema 1 -> schema 2
bibliography/
  <book>.md                 the closed list of works a critical entry may cite
tests/                      node --test; npm test
assets/
  logo.png                  the Siona Benjamin mural, CRC's mark, on the front page
weeks/
  <date>-<parashah>[-<special>]/
    sheet.json              the week's content (the record)
    candidates.json         what Sefaria links to the passage
    sheet.pdf               the sheet Daniel reviews and prints
    preview/                page images
.claude/skills/haftarah-sheet/SKILL.md   the weekly runbook Claude follows in Cowork
```

## Weekly use

Requirements: Node 18+ and Chrome or Edge. Nothing to install; do not run `npm install`.

```
node scripts/fetch.mjs --date 2026-10-17        # 1. fetch the reading (omit --date for next Shabbat)
# 2. fill weeks/<slug>/sheet.json: incipit, opening note, commentary, glosses, glossary, next week
node scripts/build.mjs weeks/<slug> --png       # 3. sheet.pdf and page images; refuses on a broken citation and names it
node scripts/check.mjs weeks/<slug>             # 4. layout check
npm test                                        # unit tests, when the template or scripts change
```

The build prints the browser it used (`Browser: C:/Program Files/Google/Chrome/Application/chrome.exe`) and the page count. Chrome and Edge are tried in that order; set `HAFTARAH_BROWSER` to pin another. The page images are rendered from the PDF with `pdftoppm` when it is on the PATH, so what you see in `preview/` is what prints; without it they are headless screenshots, which on Linux Chromium lose the bottom of the page.

In Claude Cowork, ask for "this week's haftarah sheet" and Claude follows `RUNBOOK.md`: calendar, fetch, a short map of the passage, the texts Daniel wants to dig into, build, and delivery to Drive. Daniel reviews the PDF and approves it by printing it. `weeks/` is git-ignored scratch; the records live in Drive. The next-week line is confirmed with the rabbi when the coming Shabbat has a choice of readings.

If no shell is available, open `weeks/<slug>/sheet.html` in Chrome and print to PDF: Letter, margins None, background graphics on.

## Data file

`sheet.json` (schema 2) is self-contained. The parts the weekly run edits:

```jsonc
{
  "schema": 2,
  "series": { "name": "Torah from Scratch", "year": "5787", "number": 3 },   // number: one more than the highest issued this year
  "haftarah": {
    "ref": "I Samuel 20:18-42",
    "incipit": { "he": "מָחָ֣ר חֹ֑דֶשׁ", "en": "Tomorrow will be the new moon" },   // fetch proposes the first words up to a pause
    "defaultHaftarah": "Isaiah 42:5-43:10"       // set by fetch when a special Shabbat replaces the usual reading
  },
  "openingNote": {                                 // the front page: calendar reason, then the historical setting
    "calendar": "one paragraph",
    "setting": ["paragraph", "paragraph"]
  },
  "verses": [ { "chapter": 20, "verse": 18, "he": "<html>", "en": "<html>", "notes": [ { "marker": "h", "lemma": "vacant", "text": "At the festal meal." } ], "break": null } ],
  "glosses": [ { "verse": 19, "lemma": "הָאָֽזֶל", "en": "the Ezel stone", "text": "<i>Ezel</i>: a place-name ..." } ],
  "commentary": [
    {
      "verse": 30, "verseEnd": 31,                  // verseEnd optional; chapter when the reading spans chapters
      "register": "traditional | modern | critical | reference",
      "source": "Rashi",                            // printed in the register color; a drafted title for critical entries
      "lemma": "son of a perverse, rebellious woman", // the words commented on; lemmaLang: "he" for Hebrew
      "text": "<html>",
      "sourceRef": "Rashi on I Samuel 20:30",        // Sefaria ref; required for every register but critical
      "translation": "claude | Metsudah translation | ...", // "claude" prints "translated for this sheet"
      "works": ["McCarter 1980"],                    // critical only: keys from bibliography/<book>.md
      "cites": "McCarter, <i>I Samuel</i>",          // printed in the tail
      "kind": "abridged",                            // optional
      "status": "rejected",                          // optional; only "rejected" matters: it keeps the entry off the page
      "order": 1                                     // order within the verse
    }
  ],
  "glossary": [ { "term": "Abner", "he": "אַבְנֵר", "text": "..." } ],
  "nextWeek": { "shabbat": "Noach", "special": null, "ref": "Isaiah 54:1-55:5", "civilDisplay": "October 17, 2026" },   // or null
  "credits": { "issuedBy": "Central Reform Congregation", "editor": "Rabbi Daniel Bogard", "signoff": "one first-person sentence" }
}
```

`node scripts/migrate.mjs weeks/<slug> --number N` converts a schema-1 file. There are no discussion questions and no context box: the opening note replaced them.

Every item prints unless its `status` is `rejected`; there is no approval state and no draft build, because Daniel approves a sheet by printing it. Rules the build enforces, refusing to run and naming the entry: every entry outside the critical register needs a Sefaria `sourceRef`; every critical entry names only `works` listed in `bibliography/<book>.md`; the incipit has its English. A sheet with `"test": true` is skipped when `fetch.mjs` numbers the next one. The renderer sets the divine name as יי, keys JPS footnotes and glosses in one letter series per sheet, shows register by a filled mark and a color from the mural (red square classical, blue circle modern, teal triangle historians, ochre diamond reference), and turns Masoretic paragraph breaks into vertical space.

## How a page is laid out

The sheet is stapled in the upper right corner and printed duplex, so the margins mirror: the inner margin is on the right of a recto and the left of a verso, the verse range in the running head and the page number sit in the corner away from the staple, and the gloss column stays on the right of every page. Page 1 is the front page (mural, incipit, reading line, opening note, legend, voices, provenance, wordmark footer); the text starts on page 2. Translators' notes and word glosses share one letter series (a, b, c ...) per sheet, keyed in the English and the Hebrew and answered in the margin; commentary sits in the ruled apparatus at the foot, marked by register with a filled red square (classical commentators), blue circle (modern commentators), teal triangle (what historians say) or ochre diamond (reference), the source name in the same color. The renderer measures every verse row, margin note and apparatus entry off-screen, then fills letter pages: verse rows go down as far as the apparatus for those verses leaves room. An entry whose verse is on an earlier page is labelled with that page ("30 · p. 3"); a verse never sits alone on a page; a long verse is split across pages at a line boundary rather than leaving a band of white above the rule; margin notes that do not fit beside their verse carry to the next page's margin. End matter (glossary, voices when the front page was full, colophon, next week) goes above the last apparatus when it all fits, else on one page together. `node scripts/check.mjs weeks/<slug>` renders twice and asserts these rules.

## Sources and licenses

Hebrew: Miqra according to the Masorah (CC BY-SA), via Sefaria. English: THE JPS TANAKH: Gender-Sensitive Edition (The Jewish Publication Society, 2023), via Sefaria. Schedule: Hebcal leyning API. Fonts: Ezra SIL (SIL OFL), Literata (OFL), Noto Serif Hebrew (OFL); license texts in `template/fonts/`.
