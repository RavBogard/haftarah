# Codebase readiness for 2.0 (read-only assessment, 2026-10-15)

Baseline: `npm test` = 131 pass, 0 fail. About 5.9k lines, dependency-free. The only spawned-CLI tests are in tests/deliver.test.mjs, and they are already isolated (HOME, USERPROFILE, HAFTARAH_DROPBOX_CONFIG, HAFTARAH_WEB_CONFIG). web-check.mjs (needs Chrome) and check.mjs (print layout) are NOT in `npm test`, so "print stays byte-identical" has no automated guard today (see section 3).

## 0. Where "one haftarah range per week" is baked in

| Where | Coupling |
|---|---|
| sheet.json `haftarah{ref,book,incipit,heRef,versions,title,defaultHaftarah}` + flat `verses[]`, `glosses[]`, `commentary[]` | One reading, one book, one verse list. Everything keys on `(chapter, verse)` with no book. |
| lib.js `sheetModel` | `verses = data.verses`; `final: i === last` (trope sof-haftarah on the last verse); `showChapter` from previous verse; entries matched by `(chapter, verse)` only; book/ref/heRef/title from `data.haftarah`; `voicesFor` is global. |
| lib.js `assignKeys` / `isDeadRef` | One letter series per sheet; the "range" is first..last of `verses`; a JPS cross-reference is dead unless inside that one range. |
| lib.js `tropeHtml(final)` / `tropeFamiliesUsed(verses)` | sof-haftarah colour assumes the haftarah's end; Torah needs a plain sof-pasuk end. |
| template/render.js (print), ~lines 46, 135-140, 201, 239, 698, 729, 758, 776, 784 | Reads `data.haftarah.*` directly, `final` for the last verse, running head "book range". Has its own paginator and partly duplicates sheetModel (calls assignKeys, builds entries itself): two renderers to keep in step. |
| scripts/build.mjs ~87-93, 120, 137 | Bibliography file chosen by `data.haftarah.book`; title "<parashah> haftarah". |
| scripts/check.mjs ~142 | yy count uses `data.verses` + `haftarah.incipit`. |
| scripts/lint.mjs `findVerse`, `vref` | `(chapter, verse)` lookup, no book. |
| scripts/deliver.mjs ~44-46 | Drive PDF name requires `haftarah.ref`. |
| scripts/fetch.mjs ~457-603 | Hebcal leyning item reduced to `haftRef`; `DEFAULT_HAFTAROT` map; candidates.json/texts.json keyed to one ref; throws when no haftarah. |
| scripts/publish.mjs `SCHEMA2`, `cleanSheet`, `indexEntry`, `upsertIndex` | The `SCHEMA2` whitelist silently drops any new top-level field. Index row has one ref/book/incipit. index.json is one flat file, schema 1. |
| site/app/sheet.js | `rangeLabel(model.book, ...)`; row ids `v${chapter}-${verse}` (no book, collide across readings); `sefariaUrl(v.ref)`; `slugFromPath` and `/data/weeks/<slug>/` hard-wired; masthead range = model.ref. |
| site/app/landing.js `pickHero`, `rowHtml` | Newest week only; one ref/book per row; no grouping. |
| vercel.json | Rewrite only for `YYYY-MM-DD-slug`; no routes for library, parashah, presenter. Slug regex duplicated in publish.mjs, vercel.json, sheet.js. |
| scripts/web-check.mjs `serveSite` | Single-week fixture server, one-row index, asserts `sheet.haftarah.book`. |

Reusable untouched: divineName, hebrewKey/findHebrew/findEnglish/plainText, splitPoetry, nowrapKeys, letterFor, escapeHtml, enDash, voiceKey/voicesFor, parseBibliography, fitIncipitSize, the trope tokenizer (tropeTokens/tropePhrases), sefaria.js (fetchText, lookupWord, pickEntries), panel.js `clean()` sanitizer and popover/panel mechanics, settings.js, putBlob/loadWebConfig/storeIdFromToken, web-build.mjs (file-list additions only), fonts, trope.css.

## 1. Per-feature table

Effort: S <= 2 days, M ~ 1 week, L ~ 2-3 weeks, XL > 1 month.

### 1. Torah portion alongside the haftarah
- **Changes:** `sheetModel` loops over `readings[]` (own verses, entries, keys, `final`, range). `assignKeys` gets a per-reading range for `isDeadRef`; decide one letter series or one per reading. `tropeHtml` needs a reading kind (Torah ends sof-pasuk, not sof-haftarah). fetch.mjs: Hebcal gives Torah and aliyot, plus a much larger text and a texts.json for Torah commentators. build/lint/check/deliver/publish go through a `primaryReading(data)` accessor. sheet.js: reading sections or tabs, `rangeLabel` per reading book, row ids with reading. bibliography/ has only I Samuel and Isaiah; Torah needs its own.
- **Reuse:** divineName, findHebrew/English, voicesFor, panel/sefaria, trope tokenizer.
- **Schema:** `readings: [{ id: "torah"|"haftarah", kind, book, ref, heRef, title, incipit, versions, aliyot: [{ n, ref }] }]`; `verses[].book`; `commentary[].reading` and `glosses[].reading`. Keep top-level `haftarah` and `verses` as the compatible view so existing weeks stay valid. index: `readings: [{ kind, book, ref }]`, keep `ref`/`book` = haftarah.
- **Print:** none if the Torah is web-only. render.js must ignore `readings` unless present.
- **Test gaps:** no multi-reading fixture; web-check asserts `sheet.haftarah.book`; no golden for print.
- **Effort:** L code, XL with commentary authoring.
- **Riskiest:** evolving the schema and the shared `(chapter, verse)` keys while print stays byte-identical.

### 2. Multi-year library by parashah/book, year-over-year reuse
- **Changes:** index shape and routes; landing.js becomes a library (group by parashah, book, year); new `/parashah/<key>` and `/book/<name>` pages; vercel.json rewrites; reuse tool (fetch.mjs `--from-year` or a new reuse.mjs) plus a "same verse in other years" UI. `upsertIndex` is read-modify-write with no lock.
- **Reuse:** putBlob, web-build, settings, pickHero.
- **Schema:** index schema 2: `weeks[].parashahKey`, `year` (Hebrew year int), `special`, `readings[]`, `tags`; derived `library.json` (`{ "Isaiah 54:1": [{ slug, entryIds }] }`); `commentary[].id` (stable hash of source+sourceRef+lemma) and `reuse: { from: slug, id }`.
- **Print:** none.
- **Test gaps:** `upsertIndex` tested for one week only; nothing for several years, ordering ties, or migrating the live index; landing.js `run` untested.
- **Effort:** L.
- **Riskiest:** commentary has no stable identity today, so reuse and dedupe need a content-hash id and a backfill of published weeks.

### 3. Verse-synced chant audio
- **Changes:** new site/app/audio.js (player, cue lookup, hook into sheet.js `sync` and `.current`); publish.mjs uploads audio (new content type, long maxAge, Range support through the `/data` rewrite); recording and rights workflow.
- **Reuse:** rows and `.current` mechanics, sheet.js `sync`.
- **Schema:** `audio: { src, voice, duration, cues: [{ chapter, verse, start, end }] }` per reading; later `words: [{ t }]`; index `hasAudio`.
- **Print:** none.
- **Test gaps:** no audio, Range, or cue-lookup tests.
- **Effort:** M for the player, L for producing cues.
- **Riskiest:** getting accurate verse timestamps (alignment tooling), not the player.

### 4. Translation switching (JPS default)
- **Changes:** fetch.mjs stores only JPS in `verses[].en` and `notes`; others come from Sefaria on demand (new sefaria.js `fetchVerse(ref, versionTitle)`) or are precomputed. `assignKeys` ties JPS footnote markers and gloss `en` phrases (`findEnglish`) to the JPS text, so keys and anchors must be disabled or re-anchored per translation. Poetry splitting relies on JPS `<br>`. Attribution (`provenance.en`) per version.
- **Reuse:** fetchText/parseText, clean(), settings pattern.
- **Schema:** nothing if live; else `verses[].tr: { "<id>": { html, versionTitle } }` and `translations: { default: "jps", offered: [{ id, title, license }] }`.
- **Print:** none (print stays JPS).
- **Test gaps:** keys and gloss tests are JPS-shaped; no test that a switch hides or re-keys notes.
- **Effort:** M.
- **Riskiest:** gloss and footnote anchoring on other translations; licensing.

### 5. Per-word morphology, in-reading concordance, frequency (precomputed at publish)
- **Changes:** new scripts/analyze.mjs (or inside publish): tokenise with `hebrewWords`, lemma and morphology from a data source, frequency per book and Tanakh, in-reading occurrences. Replaces the runtime `lookupWord` (two blind fetches). sheet.js `wrapWords` needs a stable word index (`data-w`); panel `openWord` reads it. Separate lazy `words.json` per reading.
- **Reuse:** hebrewWords, hebrewKey, panel UI, lookupWord as fallback.
- **Schema:** new side file `weeks/<slug>/words.json`: `{ schema: 1, reading, words: [{ c, v, i, he, lemma, root, pos, morph, gloss, freq: { book, tanakh }, also: [{ ref }] }] }`; index `hasWords`; add path to publish.
- **Print:** none.
- **Test gaps:** no test that tokenizer word counts equal `wrapWords` counts (ketiv/qere, maqaf); no data-source test.
- **Effort:** L.
- **Riskiest:** data source licensing and quality, and word identity staying stable across text edits.

### 6. "Everything Sefaria has on this verse" layer
- **Changes:** new site/app/links.js using Sefaria related/links per ref, grouped by category, lazy per verse, shown in the panel. A publish-time snapshot would give offline, speed and privacy (live calls reveal reader activity to Sefaria). fetch.mjs already computes candidates.
- **Reuse:** panel.js shell, clean(), sefariaUrl, fetch.mjs candidates logic.
- **Schema:** optional `links.json`: `{ "20:18": { counts: {}, top: [{ ref, category, title }] } }`.
- **Print:** none.
- **Test gaps:** network-failure paths for new calls; grouping/sorting.
- **Effort:** M.
- **Riskiest:** volume and relevance (thousands of links on Isaiah verses), rate limits if live.

### 7. Map + timeline from data, web and print
- **Changes:** print: new frame in render.js, sheet.css, sheet.html, build.mjs data checks, check.mjs layout asserts. Deterministic SVG, no JS library, no network tiles. Web: same SVG from pure lib.js `mapSvg(model)` and `timelineSvg(model)`. The place and date authoring is the real work.
- **Reuse:** lib.js pure-function pattern, fonts, legend scheme.
- **Schema (top-level, optional; add to SCHEMA2):** `places: [{ id, name, he, lat, lon, kind, verses: [{ chapter, verse }] }]`, `timeline: [{ id, label, from, to, approx, ref, verses, source }]`, `map: { bbox, basemap }`.
- **Print:** YES, the only feature that changes print; paginator and page count change only for weeks that carry the data.
- **Test gaps:** no print golden; check.mjs not in npm test; no fixtures with places or timeline.
- **Effort:** L.
- **Riskiest:** print pagination of a new block in a measured, duplex, no-gap layout, and a licensed deterministic basemap.

### 8. Presenter view for Zoom
- **Changes:** site/present.html and app/present.js (large type, verse stepping, no rail, BroadcastChannel or hash `#v20-18`); vercel.json rewrite `/:slug/present`; reuse sheetModel. Needs row ids with reading.
- **Reuse:** sheetModel, settings (size, theme), trope toggle.
- **Schema:** none (state in the URL).
- **Print:** none.
- **Test gaps:** no keyboard-nav tests; web-check only visits `/<slug>`.
- **Effort:** S-M.
- **Riskiest:** low; screen-share legibility.

### 9. Device-local highlights
- **Changes:** app/highlights.js on localStorage or IndexedDB keyed by `slug + reading + chapter:verse + wordIndex`; depends on the word index from #5 (otherwise brittle on republish); export/import. Namespace the existing unprefixed keys first.
- **Reuse:** wrapWords (already per-word spans), settings storage helpers.
- **Schema:** none; local key `haftarah:hl:v1:<slug>`.
- **Print:** none.
- **Test gaps:** no re-anchoring-after-republish test; storage-failure only guarded by try/catch.
- **Effort:** S-M.
- **Riskiest:** anchors surviving a republish; iOS storage eviction.

### 10. Offline PWA
- **Changes:** manifest and service worker at root scope; precache fonts and shell; per-week json/pdf/audio strategy. `/data/*` is a same-origin rewrite to Blob, fine for a service worker, but json maxAge is 60 s so a staleness policy is needed (stale-while-revalidate keyed on `index.updated`). Cache versioning from web-build's file list. Sefaria panels degrade offline. Needs CSP-clean pages.
- **Reuse:** web-build file listing, immutable fonts header.
- **Schema:** index per-week `version` (publish already writes `published`); web-build writes `precache.json`.
- **Print:** none.
- **Test gaps:** no service-worker harness; dump-dom cannot test offline (needs CDP or Playwright).
- **Effort:** M.
- **Riskiest:** cache invalidation against weekly republish, audio size and quota, iOS PWA limits.

### 11. Privacy-respecting analytics
- **Changes:** cookie-less counts via Vercel Web Analytics or a first-party hit endpoint (the repo has no functions; adding one ends "static only"). CSP and Referrer-Policy already set. Note browser calls to Sefaria already leak reader activity; say so in the privacy statement.
- **Reuse:** vercel.json headers.
- **Schema:** none. **Print:** none. **Test gaps:** none.
- **Effort:** S.
- **Riskiest:** picking a provider that stays dependency-free and honest.

### 12. Cowork skill to MCP server
- **Changes:** publish/deliver/cleanSheet/indexEntry/buildSite are already importable; fetch/build/check/lint are script-style with `main()` and `process.exit`, so make each importable with injectable fs/env/fetch. Tools: fetch_week, digest, lint, build, check, deliver, publish. Tool results replace stdout scraping; tokens never in output (publish already guards); Chrome steps need timeouts.
- **Reuse:** publish/deliver exports, loadWebConfig/loadConfig.
- **Schema:** optional `weeks/<slug>/state.json` for step status. **Print:** none.
- **Test gaps:** only deliver has CLI tests; fetch/build/check/lint untested as modules; the Windows test-delivery hazard is the template for MCP tests.
- **Effort:** L.
- **Riskiest:** refactoring every script to importable without changing behavior, and never delivering to real Drive from a test.

## 2. Schema additions (consolidated)

- Prefer additive: weeks stay `"schema": 2` unless `readings[]` becomes canonical; then add a migrate.mjs 2 to 3 step that derives `readings` from `haftarah` + `verses`. Print keeps reading the old fields so output is byte-identical.
- sheet.json (all optional): `readings[]`, `verses[].book`, `commentary[].id`, `commentary[].reading`, `glosses[].reading`, `places[]`, `timeline[]`, `map{}`, `audio{}`, `translations{}`, `parashahKey`, `year`.
- Side files in Blob next to sheet.json: `words.json`, `links.json`, `audio/<reading>.mp3`.
- index.json schema 2: per week `parashahKey`, `year`, `readings[]`, `hasAudio`, `hasWords`, `hasLinks`, `version`. Keep `ref`, `book`, `incipit`, `defaultHaftarah`, `pdf` so the current landing keeps working. Add derived `library.json`.
- publish.mjs: extend `SCHEMA2` in the same commit as any new field, and add a test that every field documented in README.md is in the whitelist (otherwise fields vanish silently).
- Index race: read-modify-write, no lock. Fine for one weekly publisher, not for an MCP server with retries; add If-Match/ETag or rebuild from a blob listing.

## 3. Print pipeline guard

Only #7 (and #1 if the Torah were printed) touches print. Everything else lives in site/ or in new pure lib.js functions the print never calls. To keep print byte-identical:
1. Add a golden test first: build every tests/fixtures sheet (plus two real weeks copied into fixtures) to sheet.html and compare to committed hashes; put check.mjs in the test run behind a Chrome-present skip.
2. New keys are optional and ignored by render.js when absent; changes to lib.js are additive.
3. Generalising `sheetModel` must not change `assignKeys` letter order or `isDeadRef` for single-reading weeks (assert in the golden).
4. lib.js ships to the browser: new functions DOM-free, pure, UMD.

## 4. Test coverage gaps (cross-cutting)

- No test imports render.js, build.mjs, fetch.mjs, check.mjs or web-check.
- web-check is the only browser test: not in `npm test`, fixture week only, two viewports, `--dump-dom` only, so popovers, panel, Escape and word click are never exercised in a browser.
- sheet.js `run()` (257 lines of DOM), panel.js, settings.js, landing.js `run` have only helper-level tests.
- Fixtures: only week-min and week-notes; none with multi-chapter poetry plus ketiv, empty commentary, Torah, places or audio.
- Isolation rule (keep): any test that spawns a CLI sets USERPROFILE and HOME plus HAFTARAH_DROPBOX_CONFIG and HAFTARAH_WEB_CONFIG to throwaway paths; also clear HAFTARAH_BLOB_TOKEN and HAFTARAH_DROPBOX_URL/TOKEN unless pointed at a local fake. Recommend one `tests/helpers/isolatedEnv.mjs` and a lint test that fails any tests/*.mjs using execFile/spawn/fork without it.

## 5. Technical debt to pay first (ordered)

1. Print golden and check.mjs/web-check in the test run (makes all schema work safe).
2. CSP blockers: the inline `<script type="module">import { run } ...</script>` in site/sheet.html and site/index.html (move to external boot modules); inline `style=` in the settings.js SVG template. Then add a Content-Security-Policy header in vercel.json (script-src 'self'; connect-src 'self' https://www.sefaria.org; style/img/font 'self'; frame-ancestors 'none'). Needed before audio, PWA and analytics.
3. web-check hardening: `dumpDom` has no kill timer, so a hung Chrome hangs the check, and it relies on `--virtual-time-budget`; add a timeout, move to CDP or Playwright for interaction and offline tests, loop over all fixtures.
4. Accessibility: note popovers (`sup.fn button`) and `button.src` set `aria-expanded` but have no `aria-controls` or id on the target (`.notepop` is appended to the end of body with `role="note"`, no association); thousands of `.w` role=button tab stops (use a roving tabindex per verse); `#settings` is `role="dialog"` with no focus trap; the closed side panel is only `aria-hidden` while its content stays focusable (use `inert`). The Aa button's `aria-controls="settings"` is correct.
5. Stable ids: row ids `v${chapter}-${verse}` lack book/reading; commentary has no `id`; `(chapter, verse)` matching in sheetModel and lint. Prerequisite for Torah, reuse, highlights, audio cues.
6. One contract module for the slug regex (publish.mjs, vercel.json, sheet.js) and the `/data/weeks/<slug>/` paths (sheet.js, web-check, publish).
7. Duplicate rendering logic between render.js and sheetModel (entry tails, sorting, keys): web and print can drift silently. Converge only after the golden exists.
8. publish.mjs: silent whitelist, index race (above).
9. web-build.mjs: hand-written copy table; no content hashing of JS/CSS; needs a manifest-driven copy and a file list for service-worker precache.
10. Shared test env helper for all CLI tests (fetch.mjs and publish.mjs `main()` hit the network if run in a test).
11. localStorage keys unprefixed (`size`, `theme`, `trope`): namespace before highlights and PWA state.
12. Minor: fetch.mjs `DEFAULT_HAFTAROT` hard-coded (Ashkenazi only); `?check=1` hooks and 404.html ship to production (low risk).

## 6. Proposed build order (what unblocks what)

0. Foundations (S-M): print golden, check/web-check in `npm test`, isolatedEnv helper, web-check timeout. Unblocks every change that must keep print identical.
1. Web hygiene (S-M): external boot scripts, CSP header, a11y fixes, namespaced storage, shared contract module.
2. Identity and schema (M): `commentary[].id`, `verses[].book`, row ids with reading, `readings[]` accessor `primaryReading(data)` in build/lint/check/deliver/fetch/publish, SCHEMA2 whitelist test, index schema 2, migrate 2 to 3. Unblocks Torah, library, reuse, highlights, audio cues.
3. Presenter view (S-M) and analytics (S): cheap, independent, early visible value.
4. Library and reuse (L): needs step 2.
5. Torah portion (L): needs step 2; can run in parallel with step 4. Content authoring is the long pole, so start fetch and render first.
6. Precomputed words (L), then highlights (S-M, needs the word index), then Sefaria links layer (M, shares side-file plumbing), and translation switching (M, independent; do after Torah so it covers both readings).
7. Map + timeline (L): data authoring can start anytime (needs only the `places[]`/`timeline[]` shapes); the print work comes last, after the golden and render.js/sheetModel convergence, because it is the only print change.
8. Audio (M + alignment): needs step 2 (stable verse ids) and CSP; do before the PWA so the offline strategy covers it.
9. Offline PWA (M): last web feature (needs CSP, versioned manifest, side-file inventory, audio policy).
10. MCP server (L): can start after step 2 (stable module APIs); gated by making fetch/build/check/lint importable with injectable env and no `process.exit`; blocks no feature.

Summary: Torah and library are the structural changes (schema and identity); words, links and audio add side files and publish plumbing; map/timeline is the only print risk; presenter, highlights and analytics are small.
