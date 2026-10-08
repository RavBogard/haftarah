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

`sheet.json` is self-contained. The parts the weekly run edits:

```jsonc
{
  "haftarah": {
    "ref": "I Samuel 20:18-42",
    "incipit": { "he": "מָחָ֣ר חֹ֑דֶשׁ", "en": "Tomorrow will be the new moon" },
    "whyThisHaftarah": "one paragraph, or an array of paragraphs",
    "defaultHaftarah": "Isaiah 42:5-43:10"       // set by fetch when a special Shabbat replaces the usual reading
  },
  "verses": [ { "chapter": 20, "verse": 18, "he": "<html>", "en": "<html>", "notes": [ { "marker": "h", "lemma": "vacant", "text": "At the festal meal." } ], "break": null } ],
  "glosses": [ { "verse": 19, "lemma": "הָאָֽזֶל", "text": "<i>Ezel</i>: a place-name ...", "status": "approved" } ],
  "commentary": [
    {
      "verse": 30, "verseEnd": 31,                  // verseEnd optional
      "register": "traditional | modern | critical | reference",
      "source": "Rashi",                            // printed in oxblood
      "lemma": "son of a perverse, rebellious woman", // the words commented on; lemmaLang: "he" for Hebrew
      "text": "<html>",
      "sourceRef": "Rashi on I Samuel 20:30",        // Sefaria ref, printed in the tail
      "translation": "claude | Metsudah translation | ...", // "claude" prints "translated for this sheet"
      "cites": "McCarter, <i>I Samuel</i>",          // for critical summaries
      "kind": "abridged",                            // optional
      "status": "proposed | approved | rejected",
      "order": 1                                     // order within the verse
    }
  ],
  "context": { "heading": "First Samuel: the book and its world", "paragraphs": ["..."], "status": "approved" },
  "glossary": [ { "term": "Abner", "he": "אַבְנֵר", "text": "..." } ],
  "questions": [],                                  // optional "For discussion" block
  "parashahConnection": "",                         // optional paragraph on the cover
  "credits": { "issuedBy": "Central Reform Congregation", "editor": "Rabbi Daniel Bogard", "note": "..." }
}
```

Rules the renderer enforces: final builds print only `approved` items; draft builds shade `proposed` items and never show `rejected` ones; register is shown by a drawn mark in the rubric color (filled square traditional, open circle modern, triangle historical-critical; a diamond is available for reference works) and the colophon lists only the marks the sheet uses; Claude translations and critical summaries are labeled in the entry tail; JPS translators' footnotes print as margin notes automatically; Masoretic paragraph breaks (setumah, petuchah) become vertical space between verses, and a mid-verse break becomes a gap in the line.

## How a page is laid out

The renderer measures every verse row, sidenote, and apparatus entry off-screen, then fills letter pages: verse rows go down as far as the apparatus for those verses leaves room; when a verse's apparatus will not fit, the rest spills to the next page's apparatus marked "(cont.)". Sidenotes stack beside their verses and push down when they collide. End matter (glossary, questions, colophon) uses space left above the last apparatus when there is any, then its own pages. The build reports the page count against the 4 to 6 page target.

## Sources and licenses

Hebrew: Miqra according to the Masorah (CC BY-SA), via Sefaria. English: THE JPS TANAKH: Gender-Sensitive Edition (The Jewish Publication Society, 2023), via Sefaria. Schedule: Hebcal leyning API. Fonts: Ezra SIL (SIL OFL), Literata (OFL), Noto Serif Hebrew (OFL); license texts in `template/fonts/`.
