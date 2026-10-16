# Weekly haftarah sheet: runbook v6

One sheet a week for Torah from Scratch at Central Reform Congregation. The template never changes during a weekly run; only `weeks/<slug>/sheet.json` does. `README.md` documents every field of that file. Read `PRODUCT.md` once per session. This file is the one home of the standing rules; the Cowork skill only points here and carries the drop-box credentials.

## Standing rules

- **Nothing prints unapproved, and Daniel approves by printing.** Before the build, show him in chat, in full, everything Claude wrote itself: its own translations (with the original Hebrew/Aramaic available on request), every historians summary, every margin gloss, the opening note and the glossary. Published translations are not repeated in chat; they are in the PDF. There is no per-entry approval and no draft build.
- **Never invent a citation.** Every classical, modern and reference entry is a Sefaria text by ref, printed with that ref. Historians summaries name only works listed in `bibliography/<book>.md`. The build refuses to run when either rule is broken.
- **Translation style (Daniel's ruling, 2026-10-14).** Every translation on the sheet, published or Claude's, follows the JPS 2023 gender-sensitive style and Daniel's God-language: no "He/His/Him/Lord/King/Father" for God; use "God", "the Holy One", "the Eternal", or restructure the sentence. Published translations may be adapted to match ("the Lord" → "God", "the Holy One, Blessed be He" → "the Holy One"); an adapted published translation says so in `translation` (e.g. "William Davidson Talmud, adapted"). Human referents follow the source.
- No discussion questions, no thematic headings. Commentary is English; Hebrew only for specific words and the haftarah itself.
- Be brief everywhere except the briefing (step 3). Ask only when blocked, with a short "Needs you:" list. Context first, then the question.
- Daniel arrives cold. Nothing is put to him for a choice until he has had the briefing.
- Questions: tappable pop-ups for picks among clear options (which reading, which issues, keep or cut); prose for anything nuanced. Every option in a pop-up must already be explained in the briefing.
- When Daniel turns something down, set `status: "rejected"` rather than deleting it.
- Grunt work (pulling and translating texts, drafting entries, uploads) goes to subagents; the main conversation keeps the briefing, Daniel's picks and the rulings.

## 0. Where to work

Work in a cloud session. Clone `https://github.com/RavBogard/haftarah` read-only. Node 18+ and the preinstalled Chromium are all it needs; `pdftoppm` and `qpdf`, when present, improve previews and PDF size.

- **Do not run `npm install`.** The repo has no dependencies.
- **Do not change the template or scripts in the cloud copy.** If you find a bug, open a GitHub issue on RavBogard/haftarah with the GitHub connector (title, what happened, the week, the fix you'd suggest) and mention the issue number in the delivery line.
- **If the cloud build fails, say so in one line and stop.** Daniel can run the build in Claude Code on his machine.

`weeks/` is git-ignored scratch; the record of every week lives in Drive (step 7). The web page of a week is published by step 7; nothing in steps 1–6 touches the web.

## 1. Calendar

First list the subfolder names in the Drive working folder (`Haftarah working`, id `1BamL1Odk8xP5znSIRr3ENc2nt7QRo7ti`) with the Drive connector, and pass them to fetch so it knows which weeks already exist:

```
node scripts/fetch.mjs --known 2026-10-10-bereshit-machar-chodesh,...      # next Shabbat, Diaspora schedule
node scripts/fetch.mjs --date 2026-10-17
node scripts/fetch.mjs --ref "Isaiah 54:1-55:5" --date 2026-10-17           # Daniel's pick overrides Hebcal
```

With no `--date`, when the coming Shabbat already has a folder, fetch names both Shabbatot and stops; offer both in one line. Otherwise tell Daniel in one line: the date, the parashah, the haftarah (and why, if special), and the parashah's own haftarah when they differ. When there is a real choice (special Shabbat, Ashkenazi/Sephardi ranges), it goes in the briefing's "This Shabbat" section and he picks by pop-up after the briefing.

Fetch also prints Hebcal's aliyot for the week (the full list, the maftir with its reason on a special Shabbat, the triennial range) and looks up last year's sheet for the same parashah in the web library, writing `prior.json` and saying `Last time: <slug>` or `Last time: none`. Carry-forward is on by default (Daniel cuts): last year's entries that fall in this year's readings come into `sheet.json` as `status: "carried"`, with a "See also" sentence in the opening note; `--no-carry` skips that when Daniel asks for a fresh start. The web copy has only what printed; when last year's cuts matter, restore that week's folder from `Haftarah working/` and run fetch with `--prior <folder>` (`--prior` requires a folder path; with no value fetch refuses). The `customs/crc.json: not yet confirmed …` line is a reminder for Daniel, not an error.

A fetch that gets both the haftarah's and the Torah's texts takes about 3.5 minutes. Run it with a long timeout or in the background, and do not treat silence as a hang.

`--ref "<ref>"` on a kept week (one whose folder already exists) no longer refreshes `candidates.json` or `texts.json` for the new ref. Use `--force` (which also wipes the haftarah's entries; the message says so), or delete the folder's texts files first.

Sheets are not numbered. Each is known by its date ("6 Cheshvan 5787").

## 2. Fetch and digest

`fetch.mjs` writes:

- `sheet.json`: schema 3: the haftarah (and, once Daniel picks it, the Torah selection, first), Hebrew and English verse-aligned, and `leyning`, Hebcal's aliyot. Never overwritten without `--force`; a later run with a Torah pick adds the Torah reading to it. Leave the divine name alone in the data; the renderer sets it as יי.
- `candidates.json`: every source Sefaria links to the passage.
- `texts.json`: the full Hebrew and every English version of the core commentators on the range, and of the linked Talmud, midrash, liturgy, Targum and Zohar segments. Section-filed commentaries are marked `sectionFiled` (Abarbanel files a whole unit under its first verse: his comment on Isaiah 54:7 is at "Abarbanel on Isaiah 54:6"). Draft from this file instead of calling Sefaria verse by verse.
- `candidates-torah.json` and `texts-torah.json`: the same for the Torah selection, once there is one (a core list of Torah commentators; super-commentaries and quoting commentaries set aside).
- `prior.json`: last year's sheet for this parashah, by reading, with its entry ids; or why there is none.

Then run `node scripts/digest.mjs weeks/<slug>` and read `digest.md`: the Torah calendar, Last time, then each reading verse by verse. It is the map for the briefing.

Check fetch's proposed incipit against the verse; the name a haftarah is known by is not always its first words.

## 3. The briefing

Before any question about sources, give Daniel a briefing in chat of about one printed page (500 to 700 words for the haftarah; about 350 more for the Torah), plain prose under short labelled sections, written so he can read it cold. Every named source must be real: take refs from `digest.md`/`texts.json`.

1. **The portion.** Panel by panel, with verse ranges: who speaks, to whom, the images, how it ends.
2. **This Shabbat.** The calendar reason, other Shabbatot that use the same verses, the link to the parashah, and any choice of range. **The Torah selection** (CRC picks it weekly; spec 11.4 is open until Daniel says otherwise): give the parashah's shape by aliyah from the aliyot list in `digest.md`, the special maftir and why on a special Shabbat, and a recommended selection with a sentence on why.
3. **Major themes.** Three to five, two or three sentences each, tied to verses.
4. **The commentary tradition.** The famous verses and the Talmud, midrash and liturgy built on them; where Targum, Rashi, Radak, Ibn Ezra, Abarbanel, Malbim and others agree and split; any textual crux. Name each source by its Sefaria ref and say in a sentence what it argues.
5. **The critical view.** Date, setting, authorship, composition, inner-biblical allusion, naming only works in `bibliography/<book>.md`.

No questions inside the briefing. Then number the issues it raised (one line each) and offer them as a multi-select pop-up with "Take the whole map", plus the range pop-up when there is a choice. Then a pop-up for the Torah selection: the aliyot one by one, a run of them (aliyot 1-2), the triennial range, the maftir, or "my own range" (prose). Run `node scripts/fetch.mjs --date <date> --torah-pick aliyah:1-2` (or `--torah "<ref>"`), then `node scripts/digest.mjs weeks/<slug>` again. Every fetch run (unless `--no-carry`, which Daniel may ask for) copies last year's entries that fall in this year's readings into the sheet as `status: "carried"` and adds a "See also the <year> sheet" sentence to the opening note; show Daniel the carried entries with the rest and set any he cuts to `rejected` (deleting a carried entry brings it back on the next run). The "See also" sentence is proposed once, when the prior is first found; delete it and it stays deleted. Save the briefing, the numbered issues and Daniel's picks to `weeks/<slug>/briefing.md`; it is delivered with the week.

## 4. Digging in

Do not run a second round of explanation; the briefing is that round. Hand the drafting to a subagent with `docs/prompts/draft-entries.md`, filled in with the week's slug, reading and chosen issues. It drafts from `texts.json`, writes `weeks/<slug>/draft_entries.json`, and reports every entry in full. Brief the drafting subagent per reading: the Torah from `texts-torah.json`, the haftarah from `texts.json`; it should prefer voices not carried from last year unless Daniel keeps one. Review its work (citations, translation, God-language, whether it missed a section-filed commentary), then merge the entries into the reading's `commentary` in `sheet.json`. The Torah gets the same three registers. Lint prints each reading's entries against the cap (24 to start) and warns above it; cut before the build rather than after.

- **Classical** (red square) and **modern** (blue circle): quote, adapt or abridge a Sefaria text; set `sourceRef`. A Hebrew-only source is translated faithfully with `translation: "claude"`; abridge with `kind: "abridged"`.
- **What historians say** (teal triangle): 60 to 120 words, a short descriptive `source` title, naming only works from `bibliography/<book>.md` in `works`. The works themselves cannot be checked from a session, so a summary gives the standard reading and points to the work ("see Blenkinsopp"); it never claims a page number or a quotation it has not seen (Daniel's ruling, 2026-10-08). When a week needs a work not yet listed, add the line, verify the work exists (publisher catalogue or WorldCat), and mention the addition in the delivery line.
- **Reference** (ochre diamond): a Sefaria reference work by ref.
- **Margin glosses** (`glosses[]`): 15 to 30 words, keyed to one Hebrew word from the verse, with `en` naming the English words to key. The JPS translators' notes print in the margin automatically; do not duplicate them, and do not key a gloss on the same English words as a JPS note.

## 5. Opening note, glossary, next week

Draft each and show it with the rest.

- `openingNote`: the calendar paragraph, then the historical setting in one or two paragraphs.
- each reading's `incipit`: check what fetch proposed (step 2). Keep the opening note's "See also" sentence unless Daniel cuts it; it prints on both front pages.
- `glossary[]`: names and places in the passage, one or two sentences each, with the Hebrew.
- `nextWeek`: fetch fills it from Hebcal. When the coming Shabbat has a choice, show both and let Daniel pick, or set it to null.
- `places[]` and `timeline[]` (optional): list the places the reading names and the periods it belongs to. `node scripts/geo.mjs lookup <name>` shows the records and sites. Set `source: "openbible:<slug>"` on each place and its `role`: scene for where the reading happens, context for nearby places the note mentions, empire for a people or kingdom (a text label). `node scripts/geo.mjs resolve weeks/<slug>` fills the coordinates and refuses a place with no site or several; then enter `lat`/`lon` with `approved: true` only if the note can defend the spot, else leave the place out. Timeline kings, empires and prophets cite `data/chronology.json` (`"chronology": "<key>"`); an event or composition carries `start`/`end`, `approx` and `works` from the bibliography. In the delivery line list each place with its source and each timeline item with its source. Under the standing-authority rule the figures are a logged decision, not a stop, unless a place had candidates.

## 6. Build

```
node scripts/lint.mjs weeks/<slug> --fix    # optional: lint runs inside build; --fix rewrites near-miss Hebrew lemmas
node scripts/build.mjs weeks/<slug> --png   # lint, then sheet.pdf (haftarah) and sheet-torah.pdf (Torah, when the week has one) with page images (preview/, preview-torah/)
node scripts/build.mjs weeks/<slug> --trope # optional; also sheet-trope.pdf, the chanter's copy: trope phrases highlighted by family
node scripts/check.mjs weeks/<slug>         # layout invariants for every built reading; the figures line reads figures: front, figures: page2 or figures: none
```

Clear lint warnings that matter (God-language, voices, stacked note letters, word counts). If check fails on a gap, it names the entry to trim and by how many words. Look at both PDFs' page images before calling anything done. The chanter's copy is the haftarah's only. Then show Daniel the Claude-written texts in full (standing rules) together with the PDF. If he asks for changes, edit `sheet.json` and build again; the sheet he prints is the last one built. Build the chanter's copy only when Daniel asks for it that week (to look first, open `sheet.html` in a browser and use the review bar's "Trope colors" button, or add `?trope=1`), check it with `check.mjs weeks/<slug> --trope`, and hand him the PDF; step 7 does not deliver it.

## 7. Deliver

```
NODE_USE_ENV_PROXY=1 node scripts/deliver.mjs weeks/<slug> --dry-run
NODE_USE_ENV_PROXY=1 node scripts/deliver.mjs weeks/<slug>
```

`NODE_USE_ENV_PROXY=1` matters in a cloud session: Node's built-in fetch ignores the sandbox's HTTPS proxy without it, and uploads hang.

`deliver.mjs` sends the files byte-exact through the drop box (a Google Apps Script web app in Daniel's account; setup in `tools/dropbox/SETUP.md`). The URL and token come from the Cowork skill, which writes them to `~/.haftarah-dropbox.json`; never print the token.

After Drive, the same command puts the week on the web: `scripts/publish.mjs` uploads the cleaned `sheet.json` (rejected items and statuses removed) and the PDF to the site's Blob store and updates the index, and the page is live at `https://haftarah.centralreform.org/<slug>` within a minute. The site redeploys only when its own files change, and an installed iPad then shows "This site has been updated. The new version opens the next time you launch it." until its next launch; a week republished after a reader has opened it reaches that reader on their next launch, not mid-session. The Blob token comes from the Cowork skill, which writes it to `~/.haftarah-web.json`; never print it. Without a token the step says `Web: skipped` and the Drive delivery still counts; `--no-web` skips it on purpose. Re-delivering a week republishes it; if the web step alone fails after Drive succeeded, retry just that with `node scripts/publish.mjs weeks/<slug>`.

Before uploading, publish builds the page's three side files in the week folder: `words.json` (STEP's word analysis, aligned to the sheet's Hebrew; the first run on a machine downloads the week's TAHOT file and TBESH into `~/.haftarah-cache/`, not all of STEP's files), `translations.json` (JPS 1985, Koren and Metsudah where Sefaria has them) and `links.json` (what Sefaria links to each verse). Each prints one line per reading; words names any word it could not analyse, and any verse with a tag inside a word. A verse STEP has no rows for stops the publish (check the Hebrew numbering). A Sefaria failure on the translations or the links does not: the line `side: translations not built: <reason>` (or links) says so, the week goes up without that tool, and a later `node scripts/publish.mjs weeks/<slug>` adds it. A verse Sefaria did not answer for on the related links is tolerated and named (`Sefaria did not answer for 20:19 (first: <reason>)`); the page says so on that verse. `--dry-run` lists the side files but builds none of them. `--no-side` rebuilds nothing but still uploads the side files the folder already has; `node scripts/publish.mjs --side <slug>` adds them to a week published without them. The side files never go to Drive.

- **Public folder** `Haftarah` (id `1TbSmoeBaCSLciL_-_HSCuKWkJMSZvGwd`): the PDF, named `2026-10-17 Noach — Isaiah 54.1-55.5.pdf`; with a Torah selection, two: `2026-10-17 Noach Torah — Genesis 6.9-7.16.pdf` and `2026-10-17 Noach Haftarah — Isaiah 54.1-55.5.pdf`.
- **Working folder** `Haftarah working/<slug>/`: `sheet.json`, `candidates.json`, `texts.json`, `candidates-torah.json`, `texts-torah.json`, `prior.json`, `digest.md`, `briefing.md` and a copy of the PDF.

The script checks every file's sha256 against what Drive stored. If the drop box is not configured or fails, send Daniel the PDF in chat, create the week's working subfolder with the Drive connector, and say in the delivery line which files still need to go in by hand. Never retype file contents into the Drive connector.

In a Torah week both `sheet.pdf` and `sheet-torah.pdf` must be at least as new as `sheet.json` or deliver refuses (a haftarah-only week's `sheet.pdf` is not checked); build both before delivering.

After a deploy that changes the index's shape (Wave 2 did), run `node scripts/publish.mjs --reindex --dry-run`, read the rows, then `node scripts/publish.mjs --reindex` once, so every live row gets `parashahKeys`, `cycle`, `tags`, `readings` and `pdfTorah`. Rows published before Wave 2 lack `cycle`, and `/5786/noach` cannot find them until then. `--reindex --from weeks` only refreshes the index rows of already-published weeks from a local folder; a local week not in the index (the coming week's draft) is skipped with `skip <slug> (not published; deliver it first)`.

One line back to Daniel: Shabbat, readings (Torah selection and haftarah), page counts of both PDFs, entries by register per reading (and how many were carried), Drive links and the page address, any bibliography additions, and any GitHub issues filed.
