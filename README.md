# Haftarah study sheets

A weekly, letter-size study sheet for Central Reform Congregation: the haftarah in Hebrew (Miqra according to the Masorah, with cantillation) and English (JPS Gender-Sensitive Edition), with commentary in three registers laid out as a critical edition. Text comes from Sefaria; the layout is fixed; each week is one data file.

```
PRODUCT.md                  what this is and for whom (durable product facts)
DESIGN.md                   the visual system (written from the built sheet)
template/
  sheet.html                page shell filled by the build
  sheet.css                 the one frame every week shares
  render.js                 browser-side paginator: cover, text pages, apparatus, sidenotes, end matter
  fonts/                    Ezra SIL (Hebrew), Literata (English), Noto Serif Hebrew (fallback); OFL licenses alongside
scripts/
  fetch.mjs                 Hebcal + Sefaria -> weeks/<slug>/sheet.json and candidates.json
  build.mjs                 sheet.json -> sheet.html -> sheet.pdf (headless Chrome/Edge), optional page PNGs
assets/
  logo.svg | logo.png       CRC logo (not yet supplied; a typographic wordmark renders until it is)
weeks/
  <date>-<parashah>[-<special>]/
    sheet.json              the week's content and approvals (the record)
    candidates.json         what Sefaria links to the passage
    sheet.pdf               final
    sheet-draft.pdf         review proof with proposed items shaded
    preview/, preview-draft/ page images
.claude/skills/haftarah-sheet/SKILL.md   the weekly runbook Claude follows in Cowork
```

## Weekly use

Requirements: Node 18+ and Chrome or Edge. Nothing to install.

```
node scripts/fetch.mjs --date 2026-10-17        # 1. fetch the reading (omit --date for next Shabbat)
# 2. fill weeks/<slug>/sheet.json: incipit, why-note, approved commentary, context, glossary
node scripts/build.mjs weeks/<slug> --draft --png  # 3. review proof
node scripts/build.mjs weeks/<slug>                # 4. final PDF (approved items only)
```

In Claude Cowork, ask for "this week's haftarah sheet" and Claude follows `.claude/skills/haftarah-sheet/SKILL.md`: it fetches, proposes commentary for approval, fills the data file, builds, and reports the page count.

If no shell is available, open `weeks/<slug>/sheet.html` in Chrome and print to PDF: Letter, margins None, background graphics on. Set `HAFTARAH_BROWSER` to a browser executable if the build cannot find Chrome or Edge.

## Data file

`sheet.json` (schema 2) is self-contained. The parts the weekly run edits:

```jsonc
{
  "schema": 2,
  "series": { "name": "Torah from Scratch", "year": "5787", "number": 3 },   // number: one more than the highest issued this year
  "haftarah": {
    "ref": "I Samuel 20:18-42",
    "incipit": { "he": "מָחָ֣ר חֹ֑דֶשׁ", "en": "Tomorrow will be the new moon" },
    "defaultHaftarah": "Isaiah 42:5-43:10"       // set by fetch when a special Shabbat replaces the usual reading
  },
  "openingNote": {                                 // the front page: calendar reason, then the historical setting
    "calendar": "one paragraph",
    "setting": ["paragraph", "paragraph"],
    "status": "proposed | approved"
  },
  "verses": [ { "chapter": 20, "verse": 18, "he": "<html>", "en": "<html>", "notes": [ { "marker": "h", "lemma": "vacant", "text": "At the festal meal." } ], "break": null } ],
  "glosses": [ { "verse": 19, "lemma": "הָאָֽזֶל", "en": "the Ezel stone", "text": "<i>Ezel</i>: a place-name ...", "status": "approved" } ],
  "commentary": [
    {
      "verse": 30, "verseEnd": 31,                  // verseEnd optional; chapter when the reading spans chapters
      "register": "traditional | modern | critical | reference",
      "source": "Rashi",                            // printed in the rubric; a drafted title for critical entries
      "lemma": "son of a perverse, rebellious woman", // the words commented on; lemmaLang: "he" for Hebrew
      "text": "<html>",
      "sourceRef": "Rashi on I Samuel 20:30",        // Sefaria ref; required for every register but critical
      "translation": "claude | Metsudah translation | ...", // "claude" prints "translated for this sheet"
      "works": ["McCarter 1980"],                    // critical only: keys from bibliography/<book>.md
      "cites": "McCarter, <i>I Samuel</i>",          // printed in the tail
      "kind": "abridged",                            // optional
      "status": "proposed | approved | rejected",
      "order": 1                                     // order within the verse
    }
  ],
  "glossary": [ { "term": "Abner", "he": "אַבְנֵר", "text": "...", "status": "approved" } ],
  "nextWeek": { "shabbat": "Noach", "special": null, "ref": "Isaiah 54:1-55:5", "civilDisplay": "October 17, 2026", "status": "proposed" },
  "credits": { "issuedBy": "Central Reform Congregation", "editor": "Rabbi Daniel Bogard", "signoff": "one first-person sentence" }
}
```

`node scripts/migrate.mjs weeks/<slug> --number N` converts a schema-1 file. There are no discussion questions and no context box: the opening note replaced them.

Rules the build enforces: a final build refuses to run while anything is `proposed` (commentary, glosses, glossary, the opening note, the next-week line) and names what is blocking; every entry outside the critical register needs a Sefaria `sourceRef`; every critical entry names only `works` listed in `bibliography/<book>.md`. Draft builds print the same list as a warning and shade proposed items. The renderer sets the divine name as יי, keys JPS footnotes and glosses in one letter series per sheet, shows register by a filled mark (square classical, circle modern, triangle historians, diamond reference), and turns Masoretic paragraph breaks into vertical space.

## How a page is laid out

Page 1 is the front page (mural, incipit, reading line, opening note, legend, voices, provenance); the text starts on page 2. The renderer measures every verse row, margin note and apparatus entry off-screen, then fills letter pages: verse rows go down as far as the apparatus for those verses leaves room. An entry whose verse is on an earlier page is labelled with that page ("30 · p. 3"); a verse never sits alone on a page; a long verse is split across pages at a line boundary rather than leaving a band of white above the rule; margin notes that do not fit beside their verse carry to the next page's margin. End matter (glossary, voices when the front page was full, colophon, next week) goes above the last apparatus when it all fits, else on one page together. `node scripts/check.mjs weeks/<slug>` renders twice and asserts these rules.

## Sources and licenses

Hebrew: Miqra according to the Masorah (CC BY-SA), via Sefaria. English: THE JPS TANAKH: Gender-Sensitive Edition (The Jewish Publication Society, 2023), via Sefaria. Schedule: Hebcal leyning API. Fonts: Ezra SIL (SIL OFL), Literata (OFL), Noto Serif Hebrew (OFL); license texts in `template/fonts/`.
