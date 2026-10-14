# The web sheet: haftarah.centralreform.org

Design spec, 2026-10-14. Approved in conversation by Daniel the same day (layout A, Sefaria panels,
publish at delivery, public, dark mode and text size in v1, landing page with an index). The printed
sheet does not change in this work.

## 1. Purpose

A natively web version of every haftarah study sheet at a dependable address, published as part of
the weekly run. It is for three readers: people looking a sheet up later, participants joining the
class on Zoom, and participants with an iPad at the table. It is the same sheet as the PDF, laid out
for a screen instead of a letter page, with what a screen can add: the commentary keeps pace with
the text, keyed notes open in place, every source opens in full from Sefaria, every Hebrew word
opens its root and dictionary senses, trope colors switch on for chanters, and the reader chooses
light or dark and the text size.

Success: the weekly run ends with the sheet on Drive and on the web in one command; a reader on any
device can read the whole sheet, open any source, and look up any word without leaving the page.

## 2. Settled decisions

- Publish moment: the delivery step (RUNBOOK step 7), not every build. Re-delivering updates the web.
- Clicking a source opens an in-page panel with the full text from Sefaria plus an "Open on Sefaria" link.
- Desktop layout A: scripture in two columns, commentary in a rail that keeps pace with scrolling.
  Narrow screens fold each verse's commentary under the verse.
- Public and indexable. JPS and Masorah attribution on every page, as on the PDF.
- Version one: the sheet, clickable Hebrew words, clickable sources, trope toggle, PDF download,
  the landing page with the index, dark mode, text size. Chanting audio later. No search, no
  discussion questions, no comments.
- Home is a landing page: a welcome, an obvious jump to this week's sheet, and the index of all sheets.
- On phones the Hebrew sits above the English (Daniel can flip this).
- Week data never enters the public GitHub repo (standing rule about JPS text).
- No framework, no npm dependencies, Node 18+ only, matching the rest of the repo.

## 3. Architecture

```
site/                      the web app, deployed by Vercel as project "haftarah"
  index.html               landing page shell
  sheet.html               week page shell (served for /<slug> by a rewrite)
  web.css                  the screen stylesheet (tokens from DESIGN.md, dark palette, layouts)
  app/
    landing.js             fills index.html from /data/index.json
    sheet.js               fills sheet.html from /data/weeks/<slug>/sheet.json
    sefaria.js             Sefaria fetches: text by ref (v3 texts API), word lookup (words API)
    panel.js               the side panel (source, word), note popovers, settings
  vercel.json              rewrites, headers, build command, output directory
scripts/
  web-build.mjs            copies template/lib.js, template/trope.css, template/fonts, assets/logo.png
                           into site/dist beside the site files; Vercel runs it as the build command
  publish.mjs              uploads a week to Vercel Blob (sheet.json cleaned, sheet.pdf) and updates index.json
  deliver.mjs              calls publish last (skip with --no-web)
  web-check.mjs            headless-browser check of the built site against a fixture week
template/lib.js            gains sheetModel(data, { voices }) (DOM-free), used by sheet.js
```

Hosting: one Vercel project, `haftarah`, in Daniel's team (`team_AyFDvnGV3IHjAY32PlW1tltN`), root
directory the repo root, build command `node scripts/web-build.mjs`, output directory `site/dist`.
Domain `haftarah.centralreform.org`; `centralreform.org` is already verified on the team, so the
one manual step is a CNAME at SiteGround (`haftarah` to `cname.vercel-dns.com`), as for overlays.

Storage: one Vercel Blob store (public access) holding:

```
index.json                       the list of published weeks (schema below)
weeks/<slug>/sheet.json          the week's data, cleaned (section 4)
weeks/<slug>/sheet.pdf           the printed sheet
```

The site reaches the store same-origin through a rewrite in `vercel.json`:
`/data/(.*)` to `https://<store-host>.public.blob.vercel-storage.com/$1`. The store host is not a
secret and is committed in `vercel.json`. Publishing never redeploys the site; the site is
redeployed only when its own files change (git push to main).

Caching: blobs are uploaded with a cache max-age of 60 seconds for JSON and 3600 for the PDF, so a
re-delivery shows within a minute. The site's own files use Vercel's defaults.

## 4. Data contract

### Cleaned `sheet.json`

`publish.mjs` writes the week's `sheet.json` to Blob after cleaning:

- every item whose `status` is `"rejected"` is removed (commentary, glosses, glossary, nextWeek);
- every `status` field is removed;
- `candidates`, drafts and anything not in the schema-2 list below are not uploaded.

Everything else is the schema-2 file as built: `schema, slug, shabbat, series, haftarah, verses,
glosses, commentary, openingNote, glossary, nextWeek, credits`. The site applies no further
visibility rules; what is in the file prints.

### `index.json`

```jsonc
{
  "schema": 1,
  "updated": "2026-10-15T20:11:03Z",
  "weeks": [
    {
      "slug": "2026-10-17-noach",
      "civil": "2026-10-17", "civilDisplay": "October 17, 2026",
      "hebrew": "ו׳ בְּחֶשְׁוָן תשפ״ז", "hebrewEn": "6 Cheshvan 5787",
      "shabbat": "Shabbat Noach",                 // parashah plus special, as the running head prints it
      "ref": "Isaiah 54:1–55:5", "book": "Isaiah",
      "incipit": { "he": "רׇנִּ֥י עֲקָרָ֖ה", "en": "Shout, O infertile one" },
      "defaultHaftarah": null,
      "pdf": "weeks/2026-10-17-noach/sheet.pdf",
      "published": "2026-10-15T20:11:03Z"
    }
  ]
}
```

Sorted by `civil` descending. `publish.mjs` fetches the current index, replaces or inserts the
week by slug, and uploads it back. A missing index (first publish) starts empty.

## 5. The site

### 5.1 Addresses

- `/` the landing page.
- `/<slug>` one week, where slug is `YYYY-MM-DD-parashah[-special]` as `weeks/` names it.
  `vercel.json` rewrites `^/(\d{4}-\d{2}-\d{2}-[a-z0-9-]+)$` to `/sheet.html`; `sheet.js` reads the
  slug from `location.pathname`.
- `/<slug>?trope=1` opens with trope colors on (the existing contract).
- Anything else: Vercel's 404 points back to `/`.

### 5.2 Landing page (`index.html`, `landing.js`)

Mode: Read. In order:

1. Masthead as on the week page: "Torah from Scratch" toward the left, the series year, the Aa button.
2. The welcome: the mural (as on the front page of the sheet) beside the title "Haftarah" with one
   short paragraph in Daniel's voice saying what these sheets are (the weekly haftarah for Torah from
   Scratch at Central Reform Congregation: Hebrew with cantillation, the JPS translation, commentary
   in three registers). Draft copy is written in the plan and shown to Daniel before it ships; it is
   a user-visible wording decision.
3. This week: the newest entry in `index.json`, set like the sheet's own hero: the Hebrew incipit
   large, its English rendering in italic, the reading in rubric, the Shabbat name, the Hebrew and
   civil dates, and one link, "Read this week's sheet", to `/<slug>`. If that week's Shabbat is more
   than seven days past, the heading reads "The latest sheet" instead.
4. All sheets: one row per week, newest first: Hebrew date, Shabbat name (the link), reading, civil
   date. A row for the current week is marked by the rubric on its reading.
5. Footer: attribution line and the wordmark block.

Empty state (no index yet): the welcome and a line "The first sheet is on its way."

### 5.3 Week page (`sheet.html`, `sheet.js`)

The structure the mockup established (screenshots in `docs/mockups/web/`):

- **Masthead** (sticky, 2.75rem): left the Shabbat name in italic (a link to the top), right the
  running range of the verses on screen ("Isaiah 54:1–5"), then an "All sheets" link to `/` and the
  Aa button. Above the text it reads "Haftarah · 6 Cheshvan 5787" and "Torah from Scratch".
- **Front matter**: hero (mural, incipit, English rendering, reading line with Hebrew and civil
  dates, a "The printed sheet (PDF)" link), the opening note (calendar paragraph, then the setting
  under a hairline), the legend (four registers, unused ones in legend grey; the keys line; the trope
  families row visible only under `data-trope`), voices on this sheet, provenance with the signoff.
- **The reading** on wide screens (min-width 1100px): a two-track grid, the text and a 22rem rail.
  Each verse row: English (poetry lines preserved, JPS keys and gloss keys as small italic rubric
  buttons), the gutter (chapter locator in rubric at chapter changes and the first verse; the verse
  number as a button), the Hebrew (Ezra SIL at 1.18x, line-height 1.75, divine name as יי, gloss keys
  after their word, every trope phrase in its `tr` span, every word wrapped as a focusable button).
  Masoretic breaks become vertical space as in print. The rail is sticky, scrolls on its own, holds
  one block per verse: a verse header with an "on Sefaria" link, the verse's notes (gloss style:
  key letter, lemma, bracket, text, "JPS" tail), then its entries (siglum, bold verse number, italic
  lemma, source name in the register color as a button when it has a Sefaria ref, body, italic tail).
  As the page scrolls, the topmost visible verse becomes current: its gutter number turns rubric,
  its rail block gets a 2px ink bar and the rail scrolls it to the top (smooth; instant under
  reduced motion; paused 1.5s after the reader scrolls the rail by hand). A verse number click
  does the same on demand.
- **Narrow screens** (below 1100px): one column; each verse is gutter, Hebrew, English, then its
  commentary as a `<details>` whose summary reads "6 comments · 1 note". Verses with nothing show no
  summary at all. The verse number toggles the details. The rail does not exist; the same nodes
  move between rail and rows on a media-query change.
- **Note popovers**: a key letter opens its note beside the key (position computed, kept inside the
  viewport); Escape, outside click or the same key closes it. One open at a time.
- **Side panel** (desktop: 30rem from the right; phones: 86vh from the bottom): header with the kind
  ("Source" or "Word") and a close button; body scrolls. Source: name, register siglum and name, the
  ref and Hebrew ref, Hebrew text, its version title, English text, its version title, "Open on
  Sefaria". No English on Sefaria: say so in one line. Word: the word as in the verse, the verse
  ref, "Root" with the headword(s), then one block per lexicon entry: the short gloss first (BDB
  Augmented Strong's senses when present), with the full BDB article folded under "Full entry";
  then "Open the verse on Sefaria". No entry: one line suggesting the word without its prefix.
  The word stays marked (hairline under it) while its panel is open. Escape closes the panel.
- **End matter**: "Names and places" in two columns (one on phones), the next-week line in rubric,
  then the footer (attribution, wordmark, tagline).
- **Settings** (the Aa button, a small panel under it): text size − and + (five steps, 15 to 24px
  root size), theme Auto / Light / Dark, the trope-colors switch, "Download the printed sheet
  (PDF)". Size, theme and trope persist in localStorage per device; `?trope=1` wins for that load.
- **Title**: "Haftarat Noach · Isaiah 54:1–55:5" (the haftarah's English title, else the Shabbat name).

### 5.4 Sefaria

- Source text: `GET https://www.sefaria.org/api/v3/texts/<ref>?version=primary&version=translation`;
  take the `he` and `en` versions, join array text as paragraphs, show `versionTitle` under each.
- Word: strip cantillation (`hebrewKey`, NFC) and call `GET /api/words/<word>?lookup_ref=<verse ref>`;
  if empty, retry with consonants only (`stripMarks`). Entries carry `headword`, `parent_lexicon`,
  `content.senses` (nested), `content.morphology`.
- Links: `https://www.sefaria.org/<ref with spaces as _ and : as .>?lang=bi`.
- Both APIs are open and answer with `access-control-allow-origin: *` (verified 2026-10-14). No key,
  no proxy. Responses are not cached by the site beyond the browser's own cache.

### 5.5 Visual system

Inherit DESIGN.md: one ink, two greys, the mural rubric, four register colors and sigla, Ezra SIL
and Literata, hairline rules, no radii, no backgrounds but paper. Screen additions, recorded in the
surface brief and later in DESIGN.md's web section by the documenter:

- Dark palette: paper #121110, ink #ebe6dc, ink-2 and frame #a8a195, rubric and traditional
  #e0616b, modern #86aaea, critical #5ec4b9, reference #d7b05c, legend grey #5c5852. Every register
  color holds at least 5.5:1 on the dark paper. Trope backgrounds keep their light values and the
  words on them go dark.
- Interaction tints are neutral: hover `rgba(ink, .06)`, active word wash `rgba(ink, .035)` with a
  rubric hairline beneath. The focus ring is the modern blue (light) or its dark counterpart.
- Panels and popovers are paper with a hairline and one soft offset shadow; the only depth on the site.
- Root type size 17px (phones 17px), English 1rem at 1.5, Hebrew 1.18em at 1.75, apparatus .9rem at
  1.42, gloss and chrome .88rem. The four-sizes rule carries over: text, apparatus, gloss, and the
  incipit (clamp 2.6rem to 4.4rem).
- Motion: the rail's smooth scroll and the panel's slide (220ms, ease-out); nothing else moves.
  `prefers-reduced-motion` removes both.
- Icons are inline SVG, 1.5px stroke: menu, close, chevron, download, external link.

### 5.6 Accessibility

Keyboard: every word, key, source name, verse number and control is a button or link with a visible
focus ring; Escape closes whatever is open; the panel traps nothing and returns focus to its opener
on close. Touch targets at least 44px on the chrome; words and keys are inline text and rely on the
line-height for height. Color never carries meaning alone (sigla, letters, position do). Contrast
at or above 4.5:1 for all text in both themes. `lang="he"` and `dir="rtl"` on Hebrew blocks;
`aria-expanded` on openers; the panel is `aria-hidden` when closed.

## 6. `sheetModel` in `lib.js`

A DOM-free function so the web page and, later, the paginator prepare content the same way:

```js
sheetModel(data, { voices }) => {
  shabbatName, seriesLabel, title,                 // strings the running head and <title> use
  front: { incipit, reading, openingNote, legend: { used: Set, hasKeys }, voices: [...], provenance },
  verses: [{ chapter, verse, ref, break, showChapter,
             enLines: [html],                       // poetry lines or one line, keys keyed as <sup class="fn">a</sup>
             heHtml,                                // divine name, gloss keys, trope spans, final flag applied
             keys: [{ key, kind, lemma, he, text, verse, chapter }],
             entries: [{ register, verse, verseEnd, lemma, lemmaLang, source, sourceRef, bodyHtml, tail: [strings], drafted }] }],
  glossary: [...], nextWeek, families: [family keys used], yyCount
}
```

It uses the existing `assignKeys`, `divineName`, `findHebrew`, `splitPoetry`, `nowrapKeys`,
`tropeHtml`, `tropeFamiliesUsed`, `voicesFor`, and the entry-tail rules now in `render.js`
(`buildEntry`). `render.js` is not changed in this work; moving it onto `sheetModel` is a later,
separate change guarded by `check.mjs`'s byte-identical rule.

## 7. `publish.mjs`

```
node scripts/publish.mjs weeks/<slug> [--dry-run] [--token TOKEN] [--store URL]
```

- Config, first found wins: flags; `HAFTARAH_BLOB_TOKEN`; `~/.haftarah-web.json` (`{"token": "..."}`,
  path overridable by `HAFTARAH_WEB_CONFIG`). The token is never printed. The Cowork skill carries
  it beside the drop-box credentials.
- Steps: read and clean `sheet.json`; upload `weeks/<slug>/sheet.json` and `weeks/<slug>/sheet.pdf`;
  fetch `index.json` (404 means empty), upsert the week, upload it. Every upload is a PUT to the
  Blob REST API with the same headers `@vercel/blob` sends (bearer token, API version, content type,
  no random suffix, overwrite allowed, cache max-age); the implementer verifies the header names
  against the current `@vercel/blob` source and the response's `url` against the expected path.
- Output: one line per file with its size and the public URL, then the page address
  `https://haftarah.centralreform.org/<slug>`. `--dry-run` prints the plan and the cleaned item counts.
- Errors name the file and the HTTP status; a failed upload leaves the index untouched (index is last).
- `deliver.mjs` runs publish after its Drive uploads unless `--no-web` is passed or the web config is
  missing, in which case it says so in one line and exits 0. The runbook's step 7 gains that line.

## 8. Failure modes

- Sefaria unreachable or an unknown ref: the panel shows "Sefaria did not answer" with the error and
  the Sefaria link; nothing else on the page is affected.
- `index.json` or the week's JSON fails to load: the landing shows the welcome and "The sheets could
  not be loaded; try again in a minute"; the week page shows the masthead and "This sheet could not
  be loaded" with a link to the public Drive folder.
- A slug with no data: "No sheet at this address" and the index.
- JavaScript disabled: `<noscript>` with the same two lines and the Drive link.
- Fonts not yet loaded: `font-display: swap` with Noto Serif Hebrew and Georgia as fallbacks.

## 9. Testing

- `tests/lib.test.mjs`: `sheetModel` on both fixtures: verse count, key sequence equals
  `assignKeys`'s, entries sorted by `order`, rejected items absent, Hebrew has `יי` and `tr` spans,
  the tail strings match `buildEntry`'s rules for the four registers.
- `tests/publish.test.mjs`: cleaning (rejected removed, statuses gone, field list intact), index
  upsert and sort, naming, config loading (token never in messages), dry-run output; uploads tested
  against a stub `fetch`.
- `scripts/web-check.mjs`: builds the site into `site/dist`, serves it with a tiny static server that
  maps `/data/` to a fixture folder, opens it in headless Chrome at 1440x900 and 390x844 and asserts:
  no console errors, the verse count, the key series in the DOM, the rail present at desktop and
  absent at phone width, one `details` per verse with commentary at phone width, the masthead range
  after scrolling, the dark theme tokens applied under `data-theme="dark"`. Run by hand and in the
  plan's verification; not a weekly step.
- Existing `npm test` keeps passing in full. (The "one environmental timeout" this line once allowed for was the deliver CLI test really delivering the fixture on Windows; it is fixed and must stay fixed.)

## 10. Out of scope for version one

Chanting audio; search; server-rendered pages and per-week social previews; comments; changes to
the printed sheet or to `render.js`; analytics.

## 11. Open items

- Create the Blob store and the Vercel project, connect the GitHub repo, add the domain (Vercel MCP
  can do all three); Daniel adds the CNAME at SiteGround and puts the Blob token where the Cowork
  skill can find it.
- Landing-page welcome copy: drafted in the plan, shown to Daniel before it ships.
- Mobile order (Hebrew above English) stands unless Daniel flips it.
