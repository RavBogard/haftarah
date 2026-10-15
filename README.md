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
scripts/
  leyning.mjs               Hebcal's leyning item -> aliyot, maftir, the Torah selection (aliyah:N[-M], triennial, full, a ref)
  prior.mjs                 "Last time": last year's sheet for the parashah, prior.json, carried entries (on by default; --no-carry), the See also sentence
  customs.mjs               loads and checks customs/<id>.json
  rites.mjs                 each rite's default haftarah per parashah
  week-files.mjs            the file names in a week folder, per reading
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
tools/dropbox/
  Code.gs, SETUP.md         the Google Apps Script drop box deliver.mjs posts to; one-time setup
docs/prompts/
  draft-entries.md          the brief handed to the drafting subagent in step 4
bibliography/
  <book>.md                 the closed list of works a critical entry may cite
tests/                      node --test; npm test (publish.test.mjs, web.test.mjs, web-build.test.mjs cover the web sheet)
site/                       the web sheet: index.html (the library), sheet.html (a week), library.html (short addresses), 404.html, web.css, app/*.js (ES modules)
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
    sheet-trope.pdf         the chanter's copy (optional)
    preview/                page images
RUNBOOK.md                  the weekly runbook Claude follows in Cowork (the Cowork skill points here)
```

## Weekly use

Requirements: Node 18+ and Chrome or Edge. Nothing to install; do not run `npm install`.

```
node scripts/fetch.mjs --date 2026-10-17 --known <slug,slug>   # 1. the calendar, the haftarah, Hebcal's aliyot, last year's sheet (prior.json); --no-texts skips texts
node scripts/digest.mjs weeks/<slug>            # 2. the map: the Torah calendar, Last time, then each reading verse by verse
node scripts/fetch.mjs --date 2026-10-17 --torah-pick aliyah:1-2   #    after the briefing: Daniel's Torah selection (or --torah "<ref>"); last year's fitting entries come in for it too (--no-carry skips)
# 3. fill weeks/<slug>/sheet.json: incipits, opening note, commentary, glosses, glossary, next week
node scripts/lint.mjs weeks/<slug> [--fix]      # 4. optional; build runs it; prints each reading's entries against the cap
node scripts/build.mjs weeks/<slug> --png       # 5. sheet.pdf (haftarah) and sheet-torah.pdf (Torah) with page images; --reading torah|haftarah for one
node scripts/build.mjs weeks/<slug> --trope     #    optional; the haftarah's chanter's copy
node scripts/check.mjs weeks/<slug>             # 6. layout check of every built reading
node scripts/deliver.mjs weeks/<slug>           # 7. to Drive and the web, both PDFs (--dry-run first; --no-web for Drive only)
node scripts/publish.mjs --reindex --dry-run    #    rebuild index.json from the store (after a repair; --from weeks to upsert local weeks)
npm test                                        # unit tests, the print golden, and (with Chrome) the layout and web checks
```

**Chanter's copy.** For the few who chant, `--trope` also writes `sheet-trope.html` and `sheet-trope.pdf`: the same sheet with every trope phrase in the Hebrew column on a colored background, the way TropeTrainer printed it. A phrase ends at each word with a disjunctive accent, except that tipcha, pashta, yetiv and zarka fold into the phrase that follows; the last word of a verse ends a sof pasuk phrase, and the haftarah's last phrase has its own color for the closing melody. The family colors follow TropeTrainer's, so people who learned on it recognize them. The colors are a runtime toggle: every sheet's Hebrew carries the phrase spans, colored (and the legend row shown) only while `<html>` has the attribute `data-trope`, so nothing is rebuilt to turn them on or off; add `?trope=1` to any sheet HTML to look. A web version reuses three pieces, `tropeHtml` and `tropeFamiliesUsed` from `template/lib.js` and `template/trope.css`, plus `TROPE_FAMILIES` for a legend; `trope.css` relies on `sheet.css` for the `--ink`/`--ink-2` variables, the `.he` container class and the base `.legend` layout, and the caller passes `final` for the haftarah's last verse. `check.mjs weeks/<slug> --trope` checks the copy, and nothing delivers it to Drive.

The build prints the browser it used (`Browser: C:/Program Files/Google/Chrome/Application/chrome.exe`) and the page count. Chrome and Edge are tried in that order; set `HAFTARAH_BROWSER` to pin another. The page images are rendered from the PDF with `pdftoppm` when it is on the PATH, so what you see in `preview/` is what prints; without it they are headless screenshots, which on Linux Chromium lose the bottom of the page.

**Tests and the print golden.** `npm test` also builds the two test fixtures and compares them with `tests/golden/print.json`, the record of what they print; with Chrome or Edge present it renders them too, and runs `check.mjs` and `web-check.mjs`. When the golden fails, the printed sheet changed. Three narrow re-records exist, each refusing when it would hide something else: `node scripts/golden.mjs --update-dom` after a Chrome update (only the rendered layer; the built HTML and sources must hold), `--update-sources` after a deliberate template or `lib.js` change (only the source hashes; every recorded fixture must hold), and `--add <fixture>` for a new fixture. The golden also hashes `lib.js`'s unexported helpers and constants, so a change a function sees only through its closure fails too. `--update` re-records everything and is kept for Wave 4's one print change, after looking at the PDFs. Any test that starts another program takes its environment from `tests/helpers/isolatedEnv.mjs` (a lint test enforces it), so no test can reach the real Drive or Blob credentials.

In Claude Cowork, ask for "this week's haftarah sheet" and Claude follows `RUNBOOK.md`: calendar, fetch, a short map of the passage, the texts Daniel wants to dig into, build, and delivery to Drive. Daniel reviews the PDF and approves it by printing it. `weeks/` is git-ignored scratch; the records live in Drive. The next-week line is confirmed with the rabbi when the coming Shabbat has a choice of readings.

If no shell is available, open `weeks/<slug>/sheet.html` in Chrome and print to PDF: Letter, margins None, background graphics on.

## Customs

Every choice a congregation might make differently is data in `customs/<id>.json`; CRC's is `customs/crc.json`, and the scripts take `--customs <id>` (default `crc`). Fields: `calendar.diaspora` (Hebcal's `i=off`), `haftarahRite` (the table in `scripts/rites.mjs` that names the usual haftarah when a special Shabbat replaces it), `torah` (`mode`: `selection` means Daniel picks each week, `triennial` and `full` pick for themselves; `rule`), `nusach`, `versions` (the Sefaria Hebrew and English version titles), `translations`, `divineName`, `entryCap` (entries per reading above which lint warns), `series`, `credits`, and `toConfirm`, the fields Daniel has not confirmed yet (fetch prints them every run). CRC's Torah custom (spec open item 11.4) is still open: the file says a weekly selection and a cap of 24 until he confirms.

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
  "prior": { "slug": "2025-10-25-noach", "hebrewEn": "3 Cheshvan 5786", "cycle": "5786" }   // last year's sheet for this parashah, set by fetch; the web page links it
}
```

`prior` is only a pointer; the entries live in the week folder's `prior.json`, which never reaches the web. An entry carried from last year keeps its `id` and has `status: "carried"` and `carried: "<slug>"`; it prints like any other until Daniel sets it to `rejected`, and lint names each one. Carry-forward runs on every fetch unless `--no-carry` is passed: a carried entry is cut by setting its `status` to `rejected` (deleting it brings it back on the next run), and a "See also" sentence removed from the opening note by hand comes back on the next fetch unless `--no-carry` is passed. `leyning` (Hebcal's aliyot list, written by fetch) is working data and is not published.

In schema 3 every verse names its `book`, and every commentary entry has an `id`: "e-" and eight hex digits, given once (by `migrate --to 3`, later by whoever adds the entry) and kept when the entry is edited. On the web a verse's address is `<reading>-<chapter>-<verse>`, as in `/2026-10-10-bereshit-machar-chodesh#haftarah-20-30`. A Torah reading's verses are addressed `torah-<chapter>-<verse>`. A week with a Torah reading prints two sheets from one `sheet.json`: `sheet-torah.pdf` and `sheet.pdf`, each with its own front page; the week's opening note, glossary and next-week line appear on both.

`highlights` are Daniel's marks for discussion, shown on the web page and never on the printed sheet: the verse gets a rubric bar, the words from `words[0]` to `words[1]` (counting the verse's Hebrew words from 0, as the page counts them) a tint, and `note`, when given, sits in the verse's apparatus. A range past the verse's last word is cut short; a reversed range is ignored.

`publish.mjs` sends to the web exactly the top-level fields shown in the two blocks above (`PUBLISHED_FIELDS`) and nothing else; a test fails when this section and that list disagree. It removes rejected entries and glosses from every reading, rejected glossary items and highlights, and every `status`.

`node scripts/migrate.mjs weeks/<slug>` converts a schema-1 file. There are no discussion questions and no context box: the opening note replaced them.

Every item prints unless its `status` is `rejected`; there is no approval state and no draft build, because Daniel approves a sheet by printing it. Rules the build enforces, refusing to run and naming the entry: every entry outside the critical register needs a Sefaria `sourceRef`; every critical entry names only `works` listed in `bibliography/<book>.md`; the incipit has its English. The renderer sets the divine name as יי, keys JPS footnotes and glosses in one letter series per sheet, shows register by a filled mark and a color from the mural (red square classical, blue circle modern, teal triangle historians, ochre diamond reference), and turns Masoretic paragraph breaks into vertical space.

## How a page is laid out

The sheet is stapled in the upper right corner and printed duplex, so the margins mirror: the inner margin is on the right of a recto and the left of a verso, the verse range in the running head and the page number sit in the corner away from the staple, and the gloss column stays on the right of every page. Page 1 is the front page (mural, incipit, reading line, opening note, legend, voices, provenance, wordmark footer); the text starts on page 2. Translators' notes and word glosses share one letter series (a, b, c ...) per sheet, keyed in the English and the Hebrew and answered in the margin; commentary sits in the ruled apparatus at the foot, marked by register with a filled red square (classical commentators), blue circle (modern commentators), teal triangle (what historians say) or ochre diamond (reference), the source name in the same color. The renderer measures every verse row, margin note and apparatus entry off-screen, then fills letter pages: verse rows go down as far as the apparatus for those verses leaves room. An entry whose verse is on an earlier page is labelled with that page ("30 · p. 3"); a verse never sits alone on a page; a long verse is split across pages at a line boundary rather than leaving a band of white above the rule; margin notes that do not fit beside their verse carry to the next page's margin. End matter (glossary, voices when the front page was full, colophon, next week) goes above the last apparatus when it all fits, else on one page together. `node scripts/check.mjs weeks/<slug>` renders twice and asserts these rules.

## Sources and licenses

Hebrew: Miqra according to the Masorah (CC BY-SA), via Sefaria. English: THE JPS TANAKH: Gender-Sensitive Edition (The Jewish Publication Society, 2023), via Sefaria. Calendar and readings: Hebcal (CC BY 4.0). The leyning API supplies the parashah, haftarah, aliyot and special readings; the credit appears on every web page, and in the printed colophon from Wave 4 (print changes wait for it). Fonts: Ezra SIL (SIL OFL), Literata (OFL), Noto Serif Hebrew (OFL); license texts in `template/fonts/`.

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

- **Public folder `Haftarah`:** `sheet.pdf`, named `<date> <parashah> — <reading>.pdf`; a week with a Torah selection also sends `sheet-torah.pdf`, and both names say which: `<date> <parashah> Torah — <ref>.pdf`, `<date> <parashah> Haftarah — <ref>.pdf`. A Torah week's `sheet-torah.pdf` must be newer than `sheet.json` or deliver refuses (the haftarah's `sheet.pdf` is not checked); build both before delivering.
- **Working folder `Haftarah working/<slug>/`:** `sheet.json` and `candidates.json`; `texts.json`, `candidates-torah.json`, `texts-torah.json`, `prior.json`, `digest.md` and `briefing.md` when present; and the PDF.
- **Re-running:** replaces files of the same name. The old copy goes to Drive's trash.
- **Sending one side only:** use `--only public` or `--only working`.
- **Configuration:** set `HAFTARAH_DROPBOX_URL` and `HAFTARAH_DROPBOX_TOKEN`, or put `{"url","token"}` in `~/.haftarah-dropbox.json` (or the file named by `HAFTARAH_DROPBOX_CONFIG`). The token is never printed.

## The web sheet

Every delivered week is also a web page at `https://haftarah.centralreform.org/<slug>`, with the landing page and index at `/`. The site is `site/` (plain HTML, CSS and ES modules, no framework), assembled by `scripts/web-build.mjs` into `site/dist` and deployed by Vercel from `main` (project `haftarah`; `vercel.json` at the repo root holds the build command, the output directory and the rewrites). Week data never enters the repo: `scripts/publish.mjs` (run by `deliver.mjs`) uploads the cleaned `sheet.json` and the PDF to a public Vercel Blob store and updates `index.json`; the site reads them same-origin through the `/data/` rewrite, so a re-delivery shows within a minute and the site redeploys only when its own files change. The page builds its content from `sheetModel` in `template/lib.js`, the same key, divine-name, trope and entry-tail rules as the printed sheet. Sources open in full from Sefaria's texts API; Hebrew words open their root and senses from the words API; both are called from the browser, no key. Settings (text size, theme, trope colors) persist per device. `npm run web-check` builds and checks the site headlessly; `node scripts/web-check.mjs weeks/<slug> --serve` serves it for a look.

The week page is built for studying together. Every verse has an address, `/<slug>#haftarah-54-3` (links from the first release, `#v54-3`, still work); each verse's header has "Copy link" and "Copy verse" (the verse in the reader's Show setting, a "— Isaiah 54:3 (JPS 2023)" line and the link). The Aa card adds Show (Hebrew, Both, English) and "Present on a shared screen", the presenter view (`?present`): one verse at a time, large, stepped with the arrows, Space or a presenter remote's PageDown and PageUp; C shows the verse's commentary, N the next verse, B blanks the screen, T trope colors, + and − size, Escape returns to the page. Teacher highlights in the week data (`highlights`, see "Data file") show on the page only. Device preferences are stored under `haftarah:v1:` keys. Analytics go through one hook (`site/app/analytics.js`) with an allow-list of aggregate events; the provider is set in `site/app/analytics-config.js` and ships as `none`. The pages carry a strict Content-Security-Policy (`vercel.json`): no inline scripts, no style attributes, connections only to the site and Sefaria.

**The library.** The landing has four doors over one list: by week (newest first; a week with a Torah reading shows both refs), by parashah (54 cells in Torah order in five book bands, a dot per year held, empty cells muted, this week ringed), by book (the Torah books, and the haftarah books Joshua to Malachi with the chapters covered), and special Shabbatot. Short addresses lead to the permanent page: `/noach` (the latest Noach sheet; `/vayakhel` also finds a combined Vayakhel-Pekudei week), `/5787/noach`, `/torah/genesis`, `/prophets/isaiah`, `/special/shuva`. `vercel.json` sends exactly these to `library.html` (an allow-list made from `site/app/parashot.js`; a test holds the two together; anything else is the 404 page), which resolves them from `index.json`. A week with a Torah reading shows it first under its own heading, then the haftarah; both PDFs are linked, and "Last time" links last year's sheet. `node scripts/publish.mjs --reindex` rebuilds `index.json` from the store's weeks (each row with `parashahKeys`, `tags`, `cycle`, `readings` and `pdfTorah`), keeping when each was first published.
