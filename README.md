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
  lib.js                    pure functions shared by the renderer and the tests (keys, poetry, divine name, incipit fit, trope phrases: tropeHtml, tropeFamiliesUsed; the web sheet's model: sheetModel, shabbatName, escapeHtml, enDash)
  voices.json               one-line identifications of named sources, for the front page
  fonts/                    Ezra SIL (Hebrew), Literata (English), Noto Serif Hebrew (fallback); OFL licenses alongside
customs/crc.json            CRC's customs as data: calendar, rite, Torah selection rule, versions, series, credits, entry cap (toConfirm: what Daniel has not yet confirmed)
data/words/frequency.json  how often each dictionary word is tagged in the Hebrew Bible (derived from STEP TAHOT; node scripts/words.mjs --frequency)
scripts/
  leyning.mjs               Hebcal's leyning item -> aliyot, maftir, the Torah selection (aliyah:N[-M], triennial, full, a ref)
  prior.mjs                 "Last time": last year's sheet for the parashah, prior.json, carried entries (on by default; --no-carry), the See also sentence
  customs.mjs               loads and checks customs/<id>.json
  rites.mjs                 each rite's default haftarah per parashah
  week-files.mjs            the file names in a week folder, per reading
  words.mjs                 the word analysis behind the web page's word panel (STEP TAHOT and TBESH, OSHB as fallback) -> weeks/<slug>/words.json; --download, --frequency, --check
  translations.mjs          the other English editions (JPS 1985, Koren, Metsudah where Sefaria has them) -> weeks/<slug>/translations.json
  links.mjs                 Sefaria's related texts per verse, textual categories only, refs only -> weeks/<slug>/links.json
  fetch.mjs                 Hebcal + Sefaria -> weeks/<slug>/sheet.json, candidates.json and texts.json
  digest.mjs                texts.json + candidates.json -> weeks/<slug>/digest.md, a one-page map of the passage
  lint.mjs                  entry lint (glosses, voices, God-language, word counts); build runs it first; --fix
  build.mjs                 sheet.json -> sheet.html -> sheet.pdf (headless Chrome/Edge), optional page PNGs; refuses a broken citation or failed lint; --trope adds the chanter's copy
  deliver.mjs               week files -> Google Drive through the drop box, byte-exact (sha256-checked)
  check.mjs                 renders twice and asserts the layout rules (no lone verse, no gap over the rule, keys in series, same output both times)
  migrate.mjs               schema 1 -> 2; --to 3 for schema 3
  web-build.mjs             assembles site/dist for Vercel
  publish.mjs               puts a week on the web (Blob store + index)
  web-check.mjs             headless check of the built site at desktop and phone widths; --serve to look
  pack-engine.mjs           template/ -> dist/engine/, the engine as a package (see "The engine package")
api/                        the MCP server: four Vercel functions over api/_lib/, the only folder with dependencies (api/package.json)
plugin/                     the Claude plugin: the connector and the one-page skill
.claude-plugin/marketplace.json   the marketplace entry that makes the plugin installable from this repo
tools/dropbox/
  Code.gs, SETUP.md         the Google Apps Script drop box deliver.mjs posts to; one-time setup
tools/make-icons.mjs        renders site/icons/ from assets/logo.png with headless Chrome; run once, commit the PNGs
docs/prompts/
  draft-entries.md          the brief handed to the drafting subagent in step 4
bibliography/
  <book>.md                 the closed list of works a critical entry may cite
tests/                      node --test; npm test (publish.test.mjs, web.test.mjs, web-build.test.mjs cover the web sheet)
site/                       the web sheet: index.html (the library), sheet.html (a week), library.html (short addresses), 404.html, web.css, app/*.js (ES modules; words.js composes the word panel's sentences; offline.js is the service worker's logic, offline-client.js registers it, marks.js and install.js are the reader's marks and the install card)
site/sw.js                  the service worker, a module worker over app/offline.js; web-build writes its build hash and precache list
site/manifest.webmanifest   the web app manifest (name, start URL, icons)
site/icons/                 icon-192, icon-512, maskable-512 and apple-touch-icon (180), rendered from the mural by tools/make-icons.mjs
vercel.json                 Vercel build command, output dir and the /data/ rewrite
assets/
  logo.png                  the Siona Benjamin mural, CRC's mark, on the front page
weeks/
  <date>-<parashah>[-<special>]/
    sheet.json              the week's content (the record)
    candidates.json         what Sefaria links to the passage
    texts.json              full texts of the core commentators and linked sources
    candidates-torah.json, texts-torah.json   the same for the Torah selection
    prior.json              last year's sheet for this parashah (or why there is none)
    digest.md               one-page map of the passage
    briefing.md             the briefing, the issues and Daniel's picks
    sheet.pdf               the sheet Daniel reviews and prints
    sheet-torah.pdf         the Torah sheet, when the week has a Torah selection
    words.json, translations.json, links.json   the web page's side files, written at publish (never on Drive)
    status.json             the server's status and version for a week in the working store; never on Drive
    sheet-trope.pdf         the chanter's copy (optional)
    preview/                page images
RUNBOOK.md                  the weekly runbook: the connector's run first, the CLI as the fallback (the plugin's skill points here)
```

## Weekly use

Requirements: Node 18+ and Chrome or Edge. Nothing to install; do not run `npm install`. This is the CLI. The usual way to make a week is the connector (see "The MCP server"); the scripts below are its fallback and the reference for what each tool does.

```
node scripts/fetch.mjs --date 2026-10-17 --known <slug,slug>   # 1. the calendar, the haftarah, Hebcal's aliyot, last year's sheet (prior.json); --no-texts skips texts
node scripts/digest.mjs weeks/<slug>            # 2. the map: the Torah calendar, Last time, then each reading verse by verse
node scripts/fetch.mjs --date 2026-10-17 --torah-pick aliyah:1-2   #    only when Daniel asks for a Torah sheet: his selection (or --torah "<ref>"); last year's fitting entries come in for it too (--no-carry skips)
# 3. fill weeks/<slug>/sheet.json: incipits, opening note, commentary, glosses, glossary, next week
node scripts/lint.mjs weeks/<slug> [--fix]      # 4. optional; build runs it; prints each reading's entries against the cap
node scripts/build.mjs weeks/<slug> --png       # 5. sheet.pdf (haftarah) and sheet-torah.pdf (Torah) with page images; --reading torah|haftarah for one
node scripts/build.mjs weeks/<slug> --trope     #    optional; the haftarah's chanter's copy
node scripts/check.mjs weeks/<slug>             # 6. layout check of every built reading
node scripts/deliver.mjs weeks/<slug>           # 7. to Drive and the web, both PDFs (--dry-run first; --no-web for Drive only)
node scripts/publish.mjs --side <slug>             #    add the web page's side files to a week published without them (words, translations, links)
node scripts/publish.mjs --reindex --dry-run    #    rebuild index.json from the store (after a repair; --from weeks refreshes the index rows of already-published weeks from a local folder)
npm test                                        # unit tests, the print golden, and (with Chrome) the layout and web checks
```

**Chanter's copy.** For the few who chant, `--trope` also writes `sheet-trope.html` and `sheet-trope.pdf`: the same sheet with every trope phrase in the Hebrew column on a colored background, the way TropeTrainer printed it. A phrase ends at each word with a disjunctive accent, except that tipcha, pashta, yetiv and zarka fold into the phrase that follows; the last word of a verse ends a sof pasuk phrase, and the haftarah's last phrase has its own color for the closing melody. The family colors follow TropeTrainer's, so people who learned on it recognize them. The colors are a runtime toggle: every sheet's Hebrew carries the phrase spans, colored (and the legend row shown) only while `<html>` has the attribute `data-trope`, so nothing is rebuilt to turn them on or off; add `?trope=1` to any sheet HTML to look. A web version reuses three pieces, `tropeHtml` and `tropeFamiliesUsed` from `template/lib.js` and `template/trope.css`, plus `TROPE_FAMILIES` for a legend; `trope.css` relies on `sheet.css` for the `--ink`/`--ink-2` variables, the `.he` container class and the base `.legend` layout, and the caller passes `final` for the haftarah's last verse. `check.mjs weeks/<slug> --trope` checks the copy, and nothing delivers it to Drive.

The build prints the browser it used (`Browser: C:/Program Files/Google/Chrome/Application/chrome.exe`) and the page count. Chrome and Edge are tried in that order; set `HAFTARAH_BROWSER` to pin another. The page images are rendered from the PDF with `pdftoppm` when it is on the PATH, so what you see in `preview/` is what prints; without it they are headless screenshots, which on Linux Chromium lose the bottom of the page.

**Tests and the print golden.** `npm test` also builds the two test fixtures and compares them with `tests/golden/print.json`, the record of what they print; with Chrome or Edge present it renders them too, and runs `check.mjs` and `web-check.mjs`. When the golden fails, the printed sheet changed. Three narrow re-records exist, each refusing when it would hide something else: `node scripts/golden.mjs --update-dom` after a Chrome update (only the rendered layer; the built HTML and sources must hold), `--update-sources` after a deliberate template or `lib.js` change (only the source hashes; every recorded fixture must hold), and `--add <fixture>` for a new fixture. The golden also hashes `lib.js`'s unexported helpers and constants, so a change a function sees only through its closure fails too. `--update` re-records everything and is kept for Wave 4's one print change, after looking at the PDFs. Any test that starts another program takes its environment from `tests/helpers/isolatedEnv.mjs` (a lint test enforces it), so no test can reach the real Drive or Blob credentials.

In Claude Cowork, ask for "this week's haftarah sheet" and Claude follows `RUNBOOK.md`: calendar, fetch, a short map of the passage, the texts Daniel wants to dig into, build, and delivery to Drive. Daniel reviews the PDF and approves it by printing it. `weeks/` is git-ignored scratch; the records live in Drive. The next-week line is confirmed with the rabbi when the coming Shabbat has a choice of readings.

If no shell is available, open `weeks/<slug>/sheet.html` in Chrome and print to PDF: Letter, margins None, background graphics on.

## Customs

Every choice a congregation might make differently is data in `customs/<id>.json`; CRC's is `customs/crc.json`, and the scripts take `--customs <id>` (default `crc`). Fields: `calendar.diaspora` (Hebcal's `i=off`), `haftarahRite` (the table in `scripts/rites.mjs` that names the usual haftarah when a special Shabbat replaces it), `torah` (`mode`: `selection` means Daniel picks each week, `triennial` and `full` pick for themselves; `rule`; `triennial`, the triennial year, null until set), `nusach`, `versions` (the Sefaria Hebrew and English version titles), `translations`, `divineName`, `entryCap` (entries per reading above which lint warns), `series`, `credits`, and `toConfirm`, the fields Daniel has not confirmed yet (fetch prints them every run). CRC's Torah custom was settled on 2026-10-16: a Torah sheet is made only when Daniel asks for one, as a selection he picks (`rule: "on request"`); the cap of 24 still waits on him.

## Data file

`sheet.json` is self-contained, in one of two shapes that both stay valid for good. Schema 2 holds one reading, the haftarah. Schema 3 holds a list of readings, so a week can carry a Torah selection beside its haftarah (fetch writes schema 3 from 2.0's second wave). `template/lib.js` reads either: `readings(data)` lists the readings, `primaryReading(data)` is the haftarah (else the first reading), and `readingView(data, id)` gives one reading in the schema-2 shape that the printed sheet and every script read. A schema-2 file comes back from `readingView` untouched, which is why its print never changes. `node scripts/migrate.mjs weeks/<slug> --to 3` converts a file; without `--to 3` it converts schema 1 to 2 as before. `lint.mjs`, `build.mjs` and `check.mjs` cover every reading of a schema-3 sheet: the haftarah builds `sheet.html` and `sheet.pdf` exactly as a schema-2 week does, and a Torah selection builds `sheet-torah.html` and `sheet-torah.pdf` from the same template (`--reading torah|haftarah` narrows build and check to one). The chanter's copy is the haftarah's only.

Schema 2, the parts the weekly run edits:

```jsonc
{
  "schema": 2,
  "slug": "2026-10-10-bereshit-machar-chodesh",    // the week folder's name and the page address
  "shabbat": { "civil": "2026-10-10", "civilDisplay": "October 10, 2026", "hebrewEn": "29 Tishrei 5787", "parashah": { "en": "Bereshit", "ref": "Genesis 1:1-6:8" }, "special": "Shabbat Machar Chodesh" },   // from Hebcal, with "hebrew" (the date in Hebrew) and parashah "he"
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

Schema 3 moves the reading into `readings[]` and leaves the week's own fields where they were:

```jsonc
{
  "schema": 3,
  // slug, shabbat, series, openingNote, glossary, nextWeek and credits: exactly as in schema 2
  "readings": [
    {
      "id": "torah", "kind": "torah",
      "ref": "Genesis 6:9-7:16", "book": "Genesis", "selection": "aliyot 1-2",   // the passage the sheet prints; selection says how it was chosen
      "aliyot": [ { "n": 1, "ref": "Genesis 6:9-22", "verses": 14 }, { "n": "M", "ref": "Genesis 11:29-32", "verses": 4 } ],   // Hebcal's full list, maftir last
      "maftir": { "ref": "Genesis 11:29-32" },        // with "reason" on a special Shabbat ("Chanukah Day 1 (on Shabbat)")
      "incipit": {}, "title": {}, "versions": {}, "verses": [], "glosses": [], "commentary": []   // as for the haftarah
    },
    {
      "id": "haftarah", "kind": "haftarah",          // ids are unique in the sheet; kind is "haftarah" or "torah"
      "ref": "I Samuel 20:18-42", "book": "I Samuel",  // with every other field schema 2 keeps in "haftarah"
      "verses": [ { "book": "I Samuel", "chapter": 20, "verse": 18, "he": "<html>", "en": "<html>", "notes": [], "break": null } ],
      "glosses": [],                                    // as in schema 2
      "commentary": [ { "id": "e-3d5f2921", "verse": 18, "register": "traditional", "source": "Rashi" } ]   // and the rest as in schema 2
    }
  ],
  "highlights": [ { "reading": "haftarah", "chapter": 20, "verse": 30, "words": [2, 4], "note": "<html>" } ],   // optional, in either schema; web only
  "prior": { "slug": "2025-10-25-noach", "hebrewEn": "3 Cheshvan 5786", "cycle": "5786" },   // last year's sheet for this parashah, set by fetch; the web page links it
  "places": [ { "id": "gibeah", "name": "Gibeah", "role": "scene", "source": "openbible:gibeah-1", "lat": 31.823, "lon": 35.231 },   // optional; role scene, context or empire; lat/lon filled by geo.mjs resolve, or hand-entered with "approved": true
              { "id": "philistines", "name": "Philistines", "role": "empire", "lat": 31.75, "lon": 34.65, "approved": true, "label": "l" } ],
  "mapRegion": "land",                                 // optional: land, near-east, or [lonMin, latMin, lonMax, latMax]; default from the places
  "timeline": [ { "id": "david", "chronology": "david" },   // kings, empires and prophets cite data/chronology.json
                { "id": "hdr", "label": "History of David’s Rise written", "kind": "composition", "start": -1000, "end": -850, "approx": true, "works": ["McCarter 1980"] } ]   // events and compositions carry dates and works
}
```

`places`, `mapRegion` and `timeline` are the week's figures (see "Map and timeline"): `places` lists where the reading happens and what its note names, `mapRegion` frames the map, and `timeline` lists the periods the reading belongs to. All three are optional and ignored by a week that lacks them.

`prior` is only a pointer; the entries live in the week folder's `prior.json`, which never reaches the web. An entry carried from last year keeps its `id` and has `status: "carried"` and `carried: "<slug>"`; it prints like any other until Daniel sets it to `rejected`, and lint names each one. Carry-forward runs on every fetch unless `--no-carry` is passed: a carried entry is cut by setting its `status` to `rejected` (deleting it brings it back on the next run). The "See also" sentence is proposed once, when the prior is first found; delete it and it stays deleted. `leyning` (Hebcal's aliyot list, written by fetch) is working data and is not published.

In schema 3 every verse names its `book`, and every commentary entry has an `id`: "e-" and eight hex digits, given once (by `migrate --to 3`, later by whoever adds the entry) and kept when the entry is edited. On the web a verse's address is `<reading>-<chapter>-<verse>`, as in `/2026-10-10-bereshit-machar-chodesh#haftarah-20-30`. A Torah reading's verses are addressed `torah-<chapter>-<verse>`. A week with a Torah reading prints two sheets from one `sheet.json`: `sheet-torah.pdf` and `sheet.pdf`, each with its own front page; the week's opening note, glossary and next-week line appear on both.

`highlights` are Daniel's marks for discussion, shown on the web page and never on the printed sheet: the verse gets a rubric bar, the words from `words[0]` to `words[1]` (counting the verse's Hebrew words from 0, as the page counts them) a tint, and `note`, when given, sits in the verse's apparatus. A range past the verse's last word is cut short; a reversed range is ignored.

`publish.mjs` sends to the web exactly the top-level fields shown in the two blocks above (`PUBLISHED_FIELDS`) and nothing else; a test fails when this section and that list disagree. It removes rejected entries and glosses from every reading, rejected glossary items and highlights, and every `status`. A published `sheet.json` also carries a `side` field written by publish (not by the weekly run): see "Side files".

`node scripts/migrate.mjs weeks/<slug>` converts a schema-1 file. There are no discussion questions and no context box: the opening note replaced them.

Every item prints unless its `status` is `rejected`; there is no approval state and no draft build, because Daniel approves a sheet by printing it. Rules the build enforces, refusing to run and naming the entry: every entry outside the critical register needs a Sefaria `sourceRef`; every critical entry names only `works` listed in `bibliography/<book>.md`; the incipit has its English. The renderer sets the divine name as יי, keys JPS footnotes and glosses in one letter series per sheet, shows register by a filled mark and a color from the mural (red square classical, blue circle modern, teal triangle historians, ochre diamond reference), and turns Masoretic paragraph breaks into vertical space.

## Side files

Beside `sheet.json` in the Blob store, publish writes three files the page fetches only when first needed (spec 4.7), and a `side` manifest inside the published `sheet.json` says which are there:

```jsonc
"side": { "words": "tahot", "translations": { "haftarah": [{ "key": "jps1985", "label": "JPS 1985" }] }, "links": true }   // written by publish; with --no-side, only the files the week folder already has
```

- `words.json` (`scripts/words.mjs`): per reading and verse, each Hebrew word as the page counts it (`verseWords` in `template/lib.js`), its morphemes with STEP's morphology and glosses, its dictionary word, and a `lemmas` table with TBESH's gloss and the whole-Tanakh count from `data/words/frequency.json`. A word that does not align to STEP's text is left out and named in `missing`; a verse with no rows refuses the publish. `--source oshb` uses Open Scriptures' morphology instead (no glosses). Publish's first run on a machine downloads only what the week needs, its book's TAHOT group (or groups) and TBESH, into `~/.haftarah-cache/` (or `$HAFTARAH_CACHE`); `node scripts/words.mjs --download` fetches all of STEP's files (about 74 MB) at once. Both sources are pinned to a commit (`STEP_SHA`, `OSHB_SHA` in `scripts/words.mjs`), so an upstream change never alters a week unnoticed.
- `translations.json` (`scripts/translations.mjs`): the English editions in `customs.translations` that Sefaria has for the book, by exact title (JPS 1985, Koren, Metsudah), verse-aligned without their footnotes, each with its title, licence and credit line. JPS 2023 is the sheet's own English and is not repeated here.
- `links.json` (`scripts/links.mjs`): what Sefaria links to each verse in the textual categories (Commentary, Targum, Midrash, Talmud, Halakhah, Kabbalah, Chasidut, Jewish Thought, Musar, Second Temple, Reference, Liturgy, Tanakh, then Quoting Commentary), grouped by work, Hebrew-only items apart, refs only.

`deliver` and `publish` build the three before any upload; uploads then go PDFs, side files, `sheet.json`, index, so a live sheet never names a side file that failed to upload. Words is required: a verse it cannot analyse stops the publish. Translations and links degrade: a Sefaria failure is logged (`side: links not built: …`) and that file is left out of the upload and the manifest, so the page simply lacks the tool that week. `--no-side` rebuilds nothing but still uploads the side files the week folder already has and lists them in the manifest, so a republish never strips a tool a week has; `node scripts/publish.mjs --side <slug>` adds them to a week that was published without them, from the store's copy of its sheet. In `deliver` the Drive upload comes first and publish (which builds the side files) after it, so a words failure leaves Drive done and the web not; retry with `node scripts/publish.mjs weeks/<slug>`. The index rows carry `hasWords`, `hasLinks` and `translations`; `--reindex` from the store reads `hasWords` and `hasLinks` from the store's listing, which after a `--no-side` republish still holds the files the manifest names, so the two agree.

## Map and timeline

A week may carry two figures, both drawn by `template/lib.js` (`mapSvg`, `timelineSvg`) as the same SVG for the printed sheet and the web page, with no tiles and no library. The map is equirectangular, on Natural Earth's land, lakes and rivers, with the week's places marked by role (scene: a filled rubric dot and a bold rubric label; context: an open dot and an ink-2 label; empire: an italic ochre text label with no dot, for a people or a kingdom), a scale bar, and the caption "Places in this reading · coastlines modern, borders not drawn". The timeline is one band with a lane each for events, kings, prophets, empires and compositions, a bar for each span (dashed when the date is approximate), and the caption "Dates BCE · c. marks a rounded date" (it reads "Dates BCE and CE" or "Dates CE" when the items cross year 0 or fall after it). Both are optional: a week without `places` and `timeline` prints and publishes exactly as before, and the golden proves it.

**The data.** `data/geo/basemap.json` (under 150 KB) and `data/geo/gazetteer.json` are committed. `node tools/make-geodata.mjs` writes them, once: it downloads Natural Earth's land, rivers and lakes (public domain; `NE_SHA` in `scripts/geo.mjs`) and OpenBible's `ancient.jsonl` (CC BY 4.0; `OB_SHA`) at those pinned commits into `~/.haftarah-cache/geo/` (or `$HAFTARAH_CACHE/geo/`), reduces them, and writes the two files. The downloads stay in the cache and are never committed; OpenBible's geometry and image files are never downloaded. The gazetteer is used only when a week's places are resolved and never reaches the site. `data/chronology.json` is a closed, reviewed table, like the bibliography: kings after Galil (1996), prophets, empires and events after The Jewish Study Bible (2014), the Assyrian and Babylonian anchors exact, and every reign or ministry that begins before 722 BCE rounded to five years and printed with "c.". An entry is added by hand from a reference work and reviewed with Daniel; the weekly run never drafts one.

**Places.**

- `node scripts/geo.mjs lookup <name>` lists the gazetteer's records for a name, each with its sites and their votes.
- Set `source: "openbible:<slug>"` and a `role` on each place, then run `node scripts/geo.mjs resolve weeks/<slug>` (`--dry-run` shows without writing). It fills `lat` and `lon` only where the record's best site has at least 500 votes and at least twice the runner-up's. A record with several close sites (`candidates`) or none (`none`) is refused by name and nothing is guessed.
- A hand coordinate is entered as `lat`, `lon` and `approved: true`, and only when the opening note can defend the spot. Otherwise the place is left out.
- `label` (`r`, `l`, `t`, `b`) sets the side of the dot a label prefers; the drawing moves a label that collides.
- `mapRegion` is `"land"`, `"near-east"` or `[west, south, east, north]`; without it the box is fitted around the places. A place outside the chosen box is left off the drawing and named in the figure's description ("Outside this map: …").

**Timeline items.** A king, empire or prophet is `{ "id", "chronology": "<key>" }`, citing `data/chronology.json`. An event or a composition carries its `label`, `kind`, `start`, `end` (negative for BCE), `approx` and `works`, keys from `bibliography/<book>.md`.

**The gate.** `build.mjs` refuses, naming the entry: a place with neither a coordinate the gazetteer stands behind nor `approved: true`; a king, empire or prophet that does not cite the table; an event or composition with no `works`. Lint warns over 12 places, a label over 28 characters, and over 14 timeline items.

**Where the figures print.** On page 1, the map beside the setting and the timeline under the opening note, when page 1 holds them; otherwise at the top of the first text page, the map 2.6in wide, with that page's budget reduced by their height. `node scripts/check.mjs weeks/<slug>` prints `figures: front`, `figures: page2` or `figures: none`, and fails if either placement overflows. Labels hold the sheet's 9pt floor. A label that will not fit its bar goes beside it, is set plain, or is cut with an ellipsis; a bar whose label would keep fewer than two letters is left unlabelled, and the figure's description names every item either way. Figures are week-level: on a week with a Torah selection both sheets carry them, and the build checks them once, against every bibliography the week's readings load (a timeline item may cite a work from the haftarah's bibliography and still print on the Torah sheet).

**On the web.** The page draws the same SVG. The map sits beside the setting at 52rem and wider and stacks below it on a narrow screen; the timeline scrolls sideways inside a labelled region on a screen narrower than 52rem. Each figure is an image with a title and a description that lists the places and the dates. `web-build` copies `data/geo/basemap.json` and `data/chronology.json` into the site as `/geo/basemap.json` and `/geo/chronology.json`; the page fetches them only for a week that has figures, after the verses are on screen, so a missing file costs the figures and nothing else (the web check reports it).

## How a page is laid out

The sheet is stapled in the upper right corner and printed duplex, so the margins mirror: the inner margin is on the right of a recto and the left of a verso, the verse range in the running head and the page number sit in the corner away from the staple, and the gloss column stays on the right of every page. Page 1 is the front page (mural, incipit, reading line, opening note, legend, voices, provenance, wordmark footer); the text starts on page 2; a week's map and timeline sit on page 1 beside and under the opening note when it holds them, else at the top of page 2 (see "Map and timeline"). Translators' notes and word glosses share one letter series (a, b, c ...) per sheet, keyed in the English and the Hebrew and answered in the margin; commentary sits in the ruled apparatus at the foot, marked by register with a filled red square (classical commentators), blue circle (modern commentators), teal triangle (what historians say) or ochre diamond (reference), the source name in the same color. The renderer measures every verse row, margin note and apparatus entry off-screen, then fills letter pages: verse rows go down as far as the apparatus for those verses leaves room. An entry whose verse is on an earlier page is labelled with that page ("30 · p. 3"); a verse never sits alone on a page; a long verse is split across pages at a line boundary rather than leaving a band of white above the rule; margin notes that do not fit beside their verse carry to the next page's margin. End matter (glossary, voices when the front page was full, colophon, next week) goes above the last apparatus when it all fits, else on one page together. `node scripts/check.mjs weeks/<slug>` renders twice and asserts these rules.

## Sources and licenses

Hebrew: Miqra according to the Masorah (CC BY-SA), via Sefaria. English: THE JPS TANAKH: Gender-Sensitive Edition (The Jewish Publication Society, 2023), via Sefaria. English: Tanakh: The Holy Scriptures (The Jewish Publication Society, 1985), CC BY-NC, via Sefaria. English: The Koren Jerusalem Bible (Koren Publishers Jerusalem), CC BY-NC, via Sefaria. English: The Metsudah Tanach series (Lakewood, N.J.), CC BY, via Sefaria. For the Torah, English: Metsudah Chumash (Metsudah Publications, 2009), CC BY, via Sefaria. The other editions are offered on the web page only, cached at publish, each credited in the footer while it is shown; Fox and other copyrighted versions are not offered. Sources from Sefaria; each entry credits its text and translation. Word analysis: STEPBible TAHOT and TBESH, data created by www.STEPBible.org based on work at Tyndale House Cambridge (CC BY 4.0), trimmed and aligned for this site. STEP asks that its data not be redistributed raw: only the per-week derived `words.json` (with the credit) and the counts in `data/words/frequency.json` leave the cache, and a note of what was changed (trimmed to the week's words, aligned to Miqra according to the Masorah, the divine name set as יי) is in that file's `credit`. Word analysis: Open Scriptures Hebrew Bible morphology (CC BY 4.0); Westminster Leningrad Codex (public domain). This is the fallback, `--source oshb`. Calendar and readings: Hebcal (CC BY 4.0). The leyning API supplies the parashah, haftarah, aliyot and special readings; the credit appears on every web page that shows content (the 404 page has no footer; the week page's credit is set when its data loads), and the printed colophon credits the map and the chronology on sheets that carry them; the Hebcal line stays on the web, since adding it to every colophon would change sheets that have no figures. Map: Natural Earth (public domain); places: OpenBible.info Bible Geocoding Data (CC BY 4.0). Dates rounded, after Galil (1996) and The Jewish Study Bible (2014). Each line is the credit for its own figure, the map's with a map and the dates' with a timeline, in the printed colophon and in the web footer. Natural Earth and OpenBible are downloaded once into the cache at pinned commits; only the reduced basemap and gazetteer are committed. Fonts: Ezra SIL (SIL OFL), Literata (OFL), Noto Serif Hebrew (OFL); license texts in `template/fonts/`.

## Texts and digest

`texts.json` is refreshed on every fetch, like `candidates.json`, even when `sheet.json` is kept. It holds:

- **commentaries:** the core commentators on the book (Rashi, Radak, Ibn Ezra, Ralbag, Malbim, Metzudat David and Zion, Abarbanel, Shadal, Steinsaltz, Targum Jonathan), plus any other "<X> on <Book>" linked to three or more verses.
  - Each is fetched once per chapter with Hebrew and every English version, keyed by exact segment ref ("Radak on Isaiah 54:9:1").
  - A comment filed under an earlier verse but covering several (Abarbanel) is marked `sectionFiled`, with `coversFrom`/`coversTo`; `coverage[verse]` names the segment that covers a silent verse.
- **linked:** Talmud, Mishnah, Tosefta, midrash, liturgy, Targum, top halakhah and Zohar segments, with Hebrew, each English `versionTitle`, and anchor verses.
  - Capped per kind and kept under about 2 MB.
  - What was left out is listed in `notFetched`.

For a Torah selection, fetch writes `candidates-torah.json` and `texts-torah.json` beside the haftarah's files. The Torah draws five to seven times a haftarah's commentary, so its texts hold a core list only (Rashi, Ramban, Ibn Ezra, Sforno, Rashbam, Or HaChaim, Kli Yakar, Chizkuni, Shadal, Steinsaltz, Haamek Davar, Rabbeinu Bahya, Bekhor Shor), fetched in that order, the last ones given up first to stay under about 2 MB (listed in `notFetched.commentariesOverBudget`); its candidates set aside super-commentaries and quoting commentaries in `skipped`. Every Sefaria call is tried three times with a growing wait. `digest.md` opens with the Torah calendar (Hebcal's aliyot, the triennial range, the selection or how to make one) and "Last time" (what last year's sheet printed, what of it falls in this year's readings, the verses it never reached, what was carried), then digests the Torah selection and the haftarah.

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

- **Public folder `Haftarah`:** `sheet.pdf`, named `<date> <parashah> — <reading>.pdf`; a week with a Torah selection also sends `sheet-torah.pdf`, and both names say which: `<date> <parashah> Torah — <ref>.pdf`, `<date> <parashah> Haftarah — <ref>.pdf`. In a Torah week both `sheet.pdf` and `sheet-torah.pdf` must be at least as new as `sheet.json` or deliver refuses (a haftarah-only week's `sheet.pdf` is not checked); build both before delivering.
- **Working folder `Haftarah working/<slug>/`:** `sheet.json` and `candidates.json`; `texts.json`, `candidates-torah.json`, `texts-torah.json`, `prior.json`, `digest.md` and `briefing.md` when present; and the PDF.
- **Re-running:** replaces files of the same name. The old copy goes to Drive's trash.
- **Sending one side only:** use `--only public` or `--only working`.
- **Configuration:** set `HAFTARAH_DROPBOX_URL` and `HAFTARAH_DROPBOX_TOKEN`, or put `{"url","token"}` in `~/.haftarah-dropbox.json` (or the file named by `HAFTARAH_DROPBOX_CONFIG`). The token is never printed.

## The web sheet

Every delivered week is also a web page at `https://haftarah.centralreform.org/<slug>`, with the landing page and index at `/`. The site is `site/` (plain HTML, CSS and ES modules, no framework), assembled by `scripts/web-build.mjs` into `site/dist` and deployed by Vercel from `main` (project `haftarah`; `vercel.json` at the repo root holds the build command, the output directory and the rewrites). Week data never enters the repo: `scripts/publish.mjs` (run by `deliver.mjs`) uploads the cleaned `sheet.json` and the PDF to a public Vercel Blob store and updates `index.json`; the site reads them same-origin through the `/data/` rewrite, so a re-delivery shows within a minute and the site redeploys only when its own files change. The page builds its content from `sheetModel` in `template/lib.js`, the same key, divine-name, trope and entry-tail rules as the printed sheet. Sources open in full from Sefaria's texts API; Hebrew words open their root and senses from the words API; both are called from the browser, no key. Settings (text size, theme, trope colors) persist per device. `npm run web-check` builds and checks the site headlessly; `node scripts/web-check.mjs weeks/<slug> --serve` serves it for a look.

The week page is built for studying together. Every verse has an address, `/<slug>#haftarah-54-3` (links from the first release, `#v54-3`, still work); each verse's header has "Copy link" and "Copy verse" (the verse in the reader's Show setting, a "— Isaiah 54:3 (JPS 2023)" line and the link). The Aa card adds Show (Hebrew, Both, English) and "Present on a shared screen", the presenter view (`?present`): one verse at a time, large, stepped with the arrows, Space or a presenter remote's PageDown and PageUp; C shows the verse's commentary, N the next verse, B blanks the screen, T trope colors, + and − size, Escape returns to the page. Teacher highlights in the week data (`highlights`, see "Data file") show on the page only. Three study tools come from the side files (see "Side files"): a tap on a Hebrew word opens the word panel (a plain-English sentence on what the word is doing, the Hebrew term after it, its prefixes and suffixes, every place its dictionary word occurs in the reading, how often it occurs in the Hebrew Bible, links to STEPBible and Bible Hub, and Sefaria's BDB entry folded below); the Aa card's Translation row shows another English edition in the English column, with a line saying the notes and glosses refer to the JPS translation and the edition's credit in the footer; "Everything on this verse" in each verse's header opens what Sefaria links to the verse, in textual categories, grouped by work, visibly not the sheet. While a week carries word analysis, the footer credits the word data's source (STEPBible, or Open Scriptures for `--source oshb`). Device preferences are stored under `haftarah:v1:` keys (a reader's marks under `marks:<slug>`, the install card's dismissal under `install-card`). Analytics go through one hook (`site/app/analytics.js`) with an allow-list of aggregate events; the provider is set in `site/app/analytics-config.js` and ships as `none`. The pages carry a strict Content-Security-Policy (`vercel.json`): no inline scripts, no style attributes, connections only to the site and Sefaria.

**The library.** The landing has four doors over one list: by week (newest first; a week with a Torah reading shows both refs), by parashah (54 cells in Torah order in five book bands, a dot per year held, empty cells muted, this week ringed), by book (the Torah books, and the haftarah books Joshua to Malachi with the chapters covered), and special Shabbatot. Short addresses lead to the permanent page: `/noach` (the latest Noach sheet; `/vayakhel` also finds a combined Vayakhel-Pekudei week), `/5787/noach`, `/torah/genesis`, `/prophets/isaiah`, `/special/shuva`. `vercel.json` sends exactly these to `library.html` (an allow-list made from `site/app/parashot.js`; a test holds the two together; anything else is the 404 page), which resolves them from `index.json`. A week with a Torah reading shows it first under its own heading, then the haftarah; both PDFs are linked, and "Last time" links last year's sheet. `node scripts/publish.mjs --reindex` rebuilds `index.json` from the store's weeks (each row with `parashahKeys`, `tags`, `cycle`, `readings` and `pdfTorah`, the last only where the store holds `sheet-torah.pdf`), keeping when each was first published; a listing with no weeks never replaces an index that had some. `--reindex --from weeks` refreshes the index rows of already-published weeks from a local folder; a local week not yet in the index is skipped and named (deliver publishes it).

**Offline and installed.** The site is an installable app. A service worker (`site/sw.js`, a module worker, its logic in `site/app/offline.js`; every page registers it with `updateViaCache: "none"`) keeps the pages, the stylesheet, the scripts, the fonts and the mural in a cache named for the build and answers every page load from it, so a page open across a deploy keeps its own build whole until the next launch (an unknown address tries the network for three seconds, then the cached not-found page; a PDF download is left to the browser) (`scripts/web-build.mjs` writes the hash of every shipped file and the list to precache into the worker, so the cache changes exactly when a file does), keeps the week files it has served (`sheet.json` and the side files, the last sixty, in `haftarah-data`) and serves them at once while fetching a fresh copy behind them, asks the network first for the index, hurried to the copy it holds after three seconds when it holds one (the slow answer still lands in the cache behind it, and with nothing held it waits for the network), and keeps the last hundred answers from Sefaria (`haftarah-sefaria`) the same way. A sheet opened on a first visit is asked for again once the worker takes control, so it is cached too. A sheet a reader has opened once opens again with no network; a week republished after that shows its new text on the reader's next launch. A new build never interrupts a page: it installs and waits (the worker never calls `skipWaiting`), the page says "This site has been updated. The new version opens the next time you launch it.", and the next launch uses it; a first install shows no note, and the presenter never shows it. PDFs are never cached. `site/manifest.webmanifest` and the icons in `site/icons/` (192, 512, a maskable 512 and the 180 apple-touch icon, rendered once from the mural by `node tools/make-icons.mjs`, which needs Chrome) make the site installable; iPad and iPhone Safari readers, outside the installed app, see a two-step Add to Home Screen card once on the week page and the landing ("Sheets you open from the Home Screen stay readable without a connection, and marks made there are kept.": iOS keeps a Home Screen app's storage apart from Safari's), dismissed for good with Not now. A reader can mark verses for themselves (press and hold a verse number, or Mark this verse in its header; the button's label, Mark this verse or Unmark, carries its state); the marks stay on the device under `haftarah:v1:marks:<slug>`, list under My marks in the Aa card and the side panel, and travel only as a link (`/<slug>#m=haftarah-54-3,haftarah-54-9`, a fragment no server sees; a bare `54-9` means the primary reading) or as text. A browser that refuses to store a mark says "This mark could not be saved on this device." The policy allows `worker-src 'self'` and `manifest-src 'self'`. `npm run web-check` registers the worker against its own server and asserts the precache, the cached week file, the update note, the marks and the card; so that Chrome's virtual clock does not run ahead of the worker, the check holds it with small real requests to `/sw.js?wait=N` while the worker settles (check mode only).

## The MCP server

The weekly run has a remote MCP server, and it is the usual way to make a week (spec 5.11). It is `api/`: four Vercel functions over `api/_lib/` on the same project as the site (`api/mcp.mjs` the tools, `api/oauth.mjs` sign-in, `api/draft.mjs` the draft links, `api/prefetch.mjs` the cron), at `https://haftarah.vercel.app/api/mcp` until `haftarah.centralreform.org` has its CNAME. `api/` is the only folder with dependencies (`api/package.json`: `@sparticuz/chromium` 153.0.0, a headless-shell pack, driven by `playwright-core` 1.63.0). The engine, the scripts and the site stay dependency-free and never import from it. The server renders the PDF, the layout check's DOM dump and the page images with that one browser over one reused page; the CLI keeps spawning the local Chrome or Edge. On a preview, a five-page week built in about 8 seconds and printed the same page count as the local build. The server needs Node 22 or later (`api/package.json` says so in `engines`); Vercel runs 24. The CLI's floor under "Weekly use" is unchanged.

A week lives in a private Blob store (`haftarah-working`) under `weeks/<slug>/`: the working files (`sheet.json` with its rejected entries, the candidates and texts files, `prior.json`, `digest.md`, `briefing.md`, the HTML and PDFs, the page images) and `status.json` (`drafting`, `built` or `delivered`, with a version that every write must quote). Each tool call pulls the week into `/tmp`, works there and pushes it back. The version check is per instance: writes to one week inside one function instance run one at a time, but that lock does not span two instances, which the skill's rule of one save at a time covers. Every call has a deadline (90 seconds; 240 for `start_week`, `fetch_texts`, `build_sheet` and `deliver_week`), after which it answers as timed out, and one JSON-RPC request per POST: a batch is refused. Drive stays the mirror, and the public store gets only what `deliver_week` publishes, through the same `deliver.mjs` and `publish.mjs` the CLI uses. The server refuses to put a credential in any tool result.

The fourteen tools, in the order a week uses them:

| Tool | What it does |
|---|---|
| `get_calendar` | The coming Shabbat or a given date: parashah, haftarah (and why, on a special Shabbat), Hebcal's aliyot, next week, and the weeks the store already holds, with their status |
| `find_past_sheets` | Earlier weeks in the public library by parashah, book or overlapping ref, joined with the store's status |
| `start_week` | Starts a week: the haftarah verse-aligned, the Torah selection when a pick is given, last year's sheet and its carried entries, the candidates |
| `fetch_texts` | One reading's texts from Sefaria into the store, then `digest.md`; one reading per call |
| `get_texts` | A filtered, paged slice of those texts, for drafting |
| `get_sheet` | The working sheet by parts, with its version, status, entry counts against the cap and the lint |
| `save_briefing` | Stores the briefing, the numbered issues and Daniel's picks as `briefing.md` |
| `save_entries` | Adds or updates entries and glosses and adds glossary items; every entry passes the citation gate; needs the current version |
| `update_sheet` | The week's own fields: opening note, glossary, next week, credits, highlights, places, map region, timeline, a reading's incipit |
| `set_status` | Marks entries or glosses rejected, or clears the mark |
| `add_bibliography_work` | Adds a work to a book's bibliography as an overlay in the store, verified by a publisher or WorldCat URL |
| `build_sheet` | The gate and lint, then the PDFs, the layout check and the page images; returns 24-hour links to the PDFs |
| `get_page_image` | One page of a built sheet as an image (an image rides better alone than beside a build report) |
| `deliver_week` | Drive and the public site, only on Daniel's "ship it"; `dryRun` lists what would go where |

**Sign-in.** Google, for the owner only. The server is its own OAuth 2.1 authorization server and keeps no database: every client, request, code and token is a signed record (HMAC, keyed by `HAFTARAH_AUTH_SECRET`). Claude registers itself, the browser goes to Google, and a Google identity whose verified email is not in `HAFTARAH_OWNER_EMAILS` is refused. Access tokens last an hour and refresh tokens 30 days. Each refresh mints a new 30-day refresh token, so a session, or a leaked refresh token, lasts until the secret rotates or the address leaves `HAFTARAH_OWNER_EMAILS`. `/oauth/revoke` answers but revokes nothing: the records are stateless. To sign everyone out, rotate `HAFTARAH_AUTH_SECRET`: every record signed with the old key stops verifying. To shut one address out, remove it from `HAFTARAH_OWNER_EMAILS`: the list is checked again on every request and every refresh.

**The Wednesday cron.** `vercel.json` runs `api/prefetch.mjs` at 03:00 and 04:00 UTC on Thursday, which is Wednesday night in St. Louis in both daylight and standard time. It starts the coming Shabbat's week and fetches the texts of each reading, so the digest is waiting on Thursday. A week already in the store is left alone, so the second run does nothing unless the first failed. Vercel sends `CRON_SECRET` as a bearer token, and the function refuses anything else.

**The draft links.** `build_sheet` returns a signed link to each PDF, good for 24 hours, served by `api/draft.mjs` from the private store. Daniel opens one and prints it; that is the approval.

### Environment

All of these are set in the Vercel project. A value is never written in the repo.

| Variable | What it is | Who sets it |
|---|---|---|
| `PUBLIC_BASE_URL` | The server's canonical origin, `https://haftarah.vercel.app` (also the default); the plugin's URL and the Google redirect hang from it | Daniel, in Vercel |
| `PUBLIC_ALTERNATE_ORIGINS` | Other origins the server answers as, comma-separated: `https://haftarah.centralreform.org` | Daniel, in Vercel |
| `HAFTARAH_WORKING_READ_WRITE_TOKEN` | The private working store's token; refused if it is the public store's | Vercel, when the store was connected to the project |
| `BLOB_READ_WRITE_TOKEN` | The public store's token (`HAFTARAH_BLOB_TOKEN` is read when it is absent); used only by `deliver_week` | Vercel, from the public store |
| `HAFTARAH_DROPBOX_URL`, `HAFTARAH_DROPBOX_TOKEN` | The Drive drop box (see "Delivery to Drive"); both or neither | Daniel, in Vercel |
| `HAFTARAH_AUTH_SECRET` | The key that signs every OAuth record, at least 32 characters; a shorter one counts as unset | Daniel, in Vercel |
| `CRON_SECRET` | The bearer token Vercel sends the cron | Daniel, in Vercel |
| `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` | The Google OAuth client that signs the owner in; until both are set no one can sign in | Daniel, from the Google console (below) |
| `HAFTARAH_OWNER_EMAILS` | The Google addresses allowed in, comma-separated | Daniel, in Vercel |
| `HAFTARAH_CUSTOMS` | The customs file to use; default `crc` | Optional |
| `HAFTARAH_CACHE`, `HAFTARAH_WORK` | Where the word-data cache and the week's working copy go; on Vercel they default to folders under `/tmp` | Optional |

### Installing the plugin

The plugin (`plugin/`) carries the connector (`plugin/.mcp.json`, pointing at `https://haftarah.vercel.app/api/mcp`) and one skill, `haftarah-sheet`: the standing rules and the run in tool order. In Claude Code:

    /plugin marketplace add RavBogard/haftarah
    /plugin install haftarah@haftarah

On claude.ai, open Customize, then Plugins, and add the same repository. The first use opens Google's sign-in; sign in with an address in `HAFTARAH_OWNER_EMAILS`. Then ask for "this week's haftarah sheet". When the CNAME for `haftarah.centralreform.org` exists, the connector's URL changes in `plugin/.mcp.json`, one line.

Before the first week from the plugin, Daniel removes the old `haftarah-sheet` skill he uploaded to claude.ai (Customize › Skills): it says to clone the repo, and it answers to the same requests as the plugin's skill. Its source, `docs/claude-ai-skill/`, is gone from the repo. In Claude Code the repo's own skill is now `haftarah-cli` (`.claude/skills/haftarah-cli/`), the clone-and-scripts path for when the connector is down, so it no longer shares a name with the plugin's.

### The Google console

In Google Cloud, create an OAuth client of type Web application. Its authorized redirect URI is `https://haftarah.vercel.app/api/auth/google/callback`; add `https://haftarah.centralreform.org/api/auth/google/callback` once the CNAME exists. Put the client's ID and secret in the Vercel project as `GOOGLE_OAUTH_CLIENT_ID` and `GOOGLE_OAUTH_CLIENT_SECRET` and redeploy.

### The local fallback

If the connector is down, nothing is lost: RUNBOOK.md's CLI sections (0b to 7) make the same week from Claude Code with the scripts above, on a machine with Chrome or Edge.

## The engine package

`node scripts/pack-engine.mjs` copies the engine from `template/` into `dist/engine/` (git-ignored; the script writes only under `dist/` and refuses any other output folder). The folder holds `lib.js`, `render.js`, `sheet.html`, `sheet.css`, `trope.css`, `voices.json` and `fonts/`, each byte for byte as in `template/`, with a `package.json` (`@haftarah/engine`, dependency-free, versioned from the repo's own `package.json`, now 2.0.0), a README and `MANIFEST.json` (the sha256 of every file, text with line endings folded to LF). `--out` and `--version` override the folder and the version. The B'nei Mitzvah portal installs it with `npm install <path to dist/engine>`, or a tarball made from it with `npm pack`, and builds its sheets from it. A test holds the package equal to `template/` and builds a sheet from the package that prints exactly what the repo prints, so the print golden's guarantee covers the portal too.
