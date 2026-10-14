# Haftarah study sheets

A weekly, letter-size study sheet for Central Reform Congregation: the haftarah in Hebrew (Miqra according to the Masorah, with cantillation) and English (JPS Gender-Sensitive Edition), with commentary in three registers laid out as a critical edition. Text comes from Sefaria; the layout is fixed; each week is one data file.

```
PRODUCT.md                  what this is and for whom (durable product facts)
DESIGN.md                   the visual system (written from the built sheet)
template/
  sheet.html                page shell filled by the build
  sheet.css                 the one frame every week shares
  trope.css                 the chanter's-copy colors; on only while <html data-trope> is set
  render.js                 browser-side paginator: front page, text pages, apparatus, margin notes, end matter
  lib.js                    pure functions shared by the renderer and the tests (keys, poetry, divine name, incipit fit, trope phrases: tropeHtml, tropeFamiliesUsed)
  voices.json               one-line identifications of named sources, for the front page
  fonts/                    Ezra SIL (Hebrew), Literata (English), Noto Serif Hebrew (fallback); OFL licenses alongside
scripts/
  fetch.mjs                 Hebcal + Sefaria -> weeks/<slug>/sheet.json, candidates.json and texts.json
  digest.mjs                texts.json + candidates.json -> weeks/<slug>/digest.md, a one-page map of the passage
  lint.mjs                  entry lint (glosses, voices, God-language, word counts); build runs it first; --fix
  build.mjs                 sheet.json -> sheet.html -> sheet.pdf (headless Chrome/Edge), optional page PNGs; refuses a broken citation or failed lint; --trope adds the chanter's copy
  deliver.mjs               week files -> Google Drive through the drop box, byte-exact (sha256-checked)
  check.mjs                 renders twice and asserts the layout rules (no lone verse, no gap over the rule, keys in series, same output both times)
  migrate.mjs               schema 1 -> schema 2
tools/dropbox/
  Code.gs, SETUP.md         the Google Apps Script drop box deliver.mjs posts to; one-time setup
docs/prompts/
  draft-entries.md          the brief handed to the drafting subagent in step 4
bibliography/
  <book>.md                 the closed list of works a critical entry may cite
tests/                      node --test; npm test
assets/
  logo.png                  the Siona Benjamin mural, CRC's mark, on the front page
weeks/
  <date>-<parashah>[-<special>]/
    sheet.json              the week's content (the record)
    candidates.json         what Sefaria links to the passage
    texts.json              full texts of the core commentators and linked sources
    digest.md               one-page map of the passage
    briefing.md             the briefing, the issues and Daniel's picks
    sheet.pdf               the sheet Daniel reviews and prints
    sheet-trope.pdf         the chanter's copy (optional)
    preview/                page images
RUNBOOK.md                  the weekly runbook Claude follows in Cowork (the Cowork skill points here)
```

## Weekly use

Requirements: Node 18+ and Chrome or Edge. Nothing to install; do not run `npm install`.

```
node scripts/fetch.mjs --date 2026-10-17 --known <slug,slug>   # 1. fetch the reading (omit --date for next Shabbat; --known: weeks that exist only in Drive; --no-texts skips texts.json)
node scripts/digest.mjs weeks/<slug>            # 2. one-page map of the passage; read before the briefing
# 3. fill weeks/<slug>/sheet.json: incipit, opening note, commentary, glosses, glossary, next week
node scripts/lint.mjs weeks/<slug> [--fix]      # 4. optional; build runs it
node scripts/build.mjs weeks/<slug> --png       # 5. sheet.pdf and page images; refuses on a broken citation or failed lint and names it
node scripts/build.mjs weeks/<slug> --trope     #    optional; also sheet-trope.pdf, the chanter's copy: trope phrases highlighted by family
node scripts/check.mjs weeks/<slug>             # 6. layout check; on a gap failure it names the entry to trim
node scripts/deliver.mjs weeks/<slug>           # 7. to Drive (--dry-run first)
npm test                                        # unit tests, when the template or scripts change
```

**Chanter's copy.** For the few who chant, `--trope` also writes `sheet-trope.html` and `sheet-trope.pdf`: the same sheet with every trope phrase in the Hebrew column on a colored background, the way TropeTrainer printed it. A phrase ends at each word with a disjunctive accent, except that tipcha, pashta, yetiv and zarka fold into the phrase that follows; the last word of a verse ends a sof pasuk phrase, and the haftarah's last phrase has its own color for the closing melody. The family colors follow TropeTrainer's, so people who learned on it recognize them. The colors are a runtime toggle: every sheet's Hebrew carries the phrase spans, colored (and the legend row shown) only while `<html>` has the attribute `data-trope`, so nothing is rebuilt to turn them on or off; add `?trope=1` to any sheet HTML to look. A web version reuses three pieces, `tropeHtml` and `tropeFamiliesUsed` from `template/lib.js` and `template/trope.css`, plus `TROPE_FAMILIES` for a legend. `check.mjs weeks/<slug> --trope` checks the copy, and nothing delivers it to Drive.

The build prints the browser it used (`Browser: C:/Program Files/Google/Chrome/Application/chrome.exe`) and the page count. Chrome and Edge are tried in that order; set `HAFTARAH_BROWSER` to pin another. The page images are rendered from the PDF with `pdftoppm` when it is on the PATH, so what you see in `preview/` is what prints; without it they are headless screenshots, which on Linux Chromium lose the bottom of the page.

In Claude Cowork, ask for "this week's haftarah sheet" and Claude follows `RUNBOOK.md`: calendar, fetch, a short map of the passage, the texts Daniel wants to dig into, build, and delivery to Drive. Daniel reviews the PDF and approves it by printing it. `weeks/` is git-ignored scratch; the records live in Drive. The next-week line is confirmed with the rabbi when the coming Shabbat has a choice of readings.

If no shell is available, open `weeks/<slug>/sheet.html` in Chrome and print to PDF: Letter, margins None, background graphics on.

## Data file

`sheet.json` (schema 2) is self-contained. The parts the weekly run edits:

```jsonc
{
  "schema": 2,
  "series": { "name": "Torah from Scratch", "year": "5787" },   // sheets are not numbered; the front page shows the Hebrew date
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

`node scripts/migrate.mjs weeks/<slug>` converts a schema-1 file. There are no discussion questions and no context box: the opening note replaced them.

Every item prints unless its `status` is `rejected`; there is no approval state and no draft build, because Daniel approves a sheet by printing it. Rules the build enforces, refusing to run and naming the entry: every entry outside the critical register needs a Sefaria `sourceRef`; every critical entry names only `works` listed in `bibliography/<book>.md`; the incipit has its English. The renderer sets the divine name as יי, keys JPS footnotes and glosses in one letter series per sheet, shows register by a filled mark and a color from the mural (red square classical, blue circle modern, teal triangle historians, ochre diamond reference), and turns Masoretic paragraph breaks into vertical space.

## How a page is laid out

The sheet is stapled in the upper right corner and printed duplex, so the margins mirror: the inner margin is on the right of a recto and the left of a verso, the verse range in the running head and the page number sit in the corner away from the staple, and the gloss column stays on the right of every page. Page 1 is the front page (mural, incipit, reading line, opening note, legend, voices, provenance, wordmark footer); the text starts on page 2. Translators' notes and word glosses share one letter series (a, b, c ...) per sheet, keyed in the English and the Hebrew and answered in the margin; commentary sits in the ruled apparatus at the foot, marked by register with a filled red square (classical commentators), blue circle (modern commentators), teal triangle (what historians say) or ochre diamond (reference), the source name in the same color. The renderer measures every verse row, margin note and apparatus entry off-screen, then fills letter pages: verse rows go down as far as the apparatus for those verses leaves room. An entry whose verse is on an earlier page is labelled with that page ("30 · p. 3"); a verse never sits alone on a page; a long verse is split across pages at a line boundary rather than leaving a band of white above the rule; margin notes that do not fit beside their verse carry to the next page's margin. End matter (glossary, voices when the front page was full, colophon, next week) goes above the last apparatus when it all fits, else on one page together. `node scripts/check.mjs weeks/<slug>` renders twice and asserts these rules.

## Sources and licenses

Hebrew: Miqra according to the Masorah (CC BY-SA), via Sefaria. English: THE JPS TANAKH: Gender-Sensitive Edition (The Jewish Publication Society, 2023), via Sefaria. Schedule: Hebcal leyning API. Fonts: Ezra SIL (SIL OFL), Literata (OFL), Noto Serif Hebrew (OFL); license texts in `template/fonts/`.

## Texts and digest

`texts.json` is refreshed on every fetch, like `candidates.json`, even when `sheet.json` is kept. It holds:

- **commentaries:** the core commentators on the book (Rashi, Radak, Ibn Ezra, Ralbag, Malbim, Metzudat David and Zion, Abarbanel, Shadal, Steinsaltz, Targum Jonathan), plus any other "<X> on <Book>" linked to three or more verses.
  - Each is fetched once per chapter with Hebrew and every English version, keyed by exact segment ref ("Radak on Isaiah 54:9:1").
  - A comment filed under an earlier verse but covering several (Abarbanel) is marked `sectionFiled`, with `coversFrom`/`coversTo`; `coverage[verse]` names the segment that covers a silent verse.
- **linked:** Talmud, Mishnah, Tosefta, midrash, liturgy, Targum, top halakhah and Zohar segments, with Hebrew, each English `versionTitle`, and anchor verses.
  - Capped per kind and kept under about 2 MB.
  - What was left out is listed in `notFetched`.

`digest.md` lists, verse by verse, the rabbinic and liturgical texts anchored there, with a one-line opening, and which commentators have text on the verse. Noise (lexicons, quoting commentaries, the Chasidut and Musar long tail) is counted at the end, not listed.

## Lint and pagination

`build.mjs` runs `scripts/lint.mjs` after the citation gate. Errors stop the build and name the entry; warnings print and the build continues.

- **Errors:**
  - a gloss's Hebrew lemma is not in its verse, even ignoring mark order, accents, meteg and vowels;
  - a gloss's English anchor is not in the verse's English.
- **Warnings:**
  - a lemma that matches only after normalizing (`--fix` rewrites it to the verse's exact text);
  - a gloss anchor that contains or ends at a JPS note marker;
  - a named source with no line in `template/voices.json`;
  - capitalized He/His/Him/Himself/Lord/King/Father for God;
  - word counts outside commentary 25–120, historians 60–130, glosses 12–35.

The renderer locates lemmas with the same tolerant matching. "Voices on this sheet" collapses "Talmud, Berakhot 10a" and "Talmud, Sanhedrin 99a" into one line, and does the same for any "Source, ref" entries.

When a gap over an inch remains and the next verse can't be split, the renderer places the verse and sends the page's last apparatus entries to the next page under their "· p. N" label. When the gap check fails, `check.mjs` lists the verses and apparatus entries with their heights, the shortfall, and a suggested trim.

The build downsamples the mural to 300 ppi as a JPEG in the page. When `qpdf` is on the PATH, it also repacks the PDF losslessly: about 0.8 MB with it, about 1.0 MB without.

## Delivery to Drive

The week's files go to Drive through the drop box, a small Google Apps Script web app in Daniel's account (`tools/dropbox/Code.gs`; one-time setup in `tools/dropbox/SETUP.md`). It writes the bytes as built and returns a sha256, which the script checks against the local file.

    node scripts/deliver.mjs weeks/<slug> --dry-run     # show what goes where
    node scripts/deliver.mjs weeks/<slug>               # upload; one line per file, then both folder links

In a sandbox that reaches the internet through an HTTPS proxy (the Cowork cloud session), run it with `NODE_USE_ENV_PROXY=1`; Node's fetch ignores the proxy otherwise.

- **Public folder `Haftarah`:** `sheet.pdf`, named `<date> <parashah> — <reading>.pdf`.
- **Working folder `Haftarah working/<slug>/`:** `sheet.json` and `candidates.json`; `texts.json`, `digest.md` and `briefing.md` when present; and the PDF.
- **Re-running:** replaces files of the same name. The old copy goes to Drive's trash.
- **Sending one side only:** use `--only public` or `--only working`.
- **Configuration:** set `HAFTARAH_DROPBOX_URL` and `HAFTARAH_DROPBOX_TOKEN`, or put `{"url","token"}` in `~/.haftarah-dropbox.json` (or the file named by `HAFTARAH_DROPBOX_CONFIG`). The token is never printed.
