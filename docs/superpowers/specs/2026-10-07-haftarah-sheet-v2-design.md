# Haftarah sheet v2: design spec

Date: 2026-10-07, revised 2026-10-08 after the design review. Status: approved for planning.

## 1. Goal

A beautiful, consistent, useful haftarah study sheet for Torah from Scratch every week, made in Claude Cowork from any computer, delivered to a public Google Drive folder that students open each week, printed in color by Daniel. The weekly process is a conversation: confirm the Shabbat and the haftarah, map what the commentators and scholars say about the passage, dig into the texts that matter this week, approve, build, deliver.

What stays from v1: the critical-edition design (scripture owns the page, apparatus at the foot, keyed margin glosses, register by shape), the Node + headless Chrome build, one data file per week as the record, Sefaria as the source of texts.

What changes: where things live, how the weekly conversation runs, the front page and branding, and the fixes from the design review.

## 2. Decisions already made (with Daniel, 2026-10-07)

- Readers: mixed group, many long-time students, not Hebrew-fluent. Printed by Daniel, always in color. Used together at the table: read the haftarah, then use some of the commentary.
- Divine name: יי throughout the Hebrew text and in any Hebrew quoted in commentary. English stays as JPS prints it.
- Commentary in English for all registers. Hebrew appears only as specific words inside entries and in the haftarah itself.
- No discussion questions, ever. No thematic section headings.
- One short opening note on the cover: the calendar reason and the connection to the parashah, then the historical-critical setting of the book. It replaces the "why this haftarah" paragraph and the context box.
- No page-count target. The build still reports the count.
- Glossary of names and places stays.
- Haftarah choice: usually the coming Shabbat's; sometimes Daniel takes the parashah's own haftarah instead of the special one. The skill offers both and he picks.
- Series identity: Torah from Scratch, numbered by Hebrew year: "5787 · No. 3".
- Brand: the Siona Benjamin floor mural is CRC's mark. Cover A (mural as hero) approved from the mockup `docs/mockups/cover-A-mural-hero.png`, with the mural reduced to 2.4in and given more air above so the incipit still leads. Rubric color taken from the mural's ring red.
- Front page, not a cover (2026-10-08): the sheet is a class handout, not a book. Page 1 is an orientation page (mural, incipit, reading line, the whole opening note, legend, voices, provenance); the haftarah text starts at the top of page 2. Stapled in the upper right corner, printed back to front in color.
- Gloss key (2026-10-08): the ° is retired. The rabbi's glosses and the JPS translators' notes share one letter series per sheet, keyed in both the English and the Hebrew for glosses; JPS notes end with a small grey "JPS".
- Register names in plain words (2026-10-08): classical commentators, modern commentators, what historians say, reference.
- Voices on this sheet (2026-10-08): one line per commentator used that week, from a table in the template; drafted titles set in red italic.
- Next week line (2026-10-08): printed at the foot of the last page, but only after Daniel confirms the reading; it is a proposed item under the hard gate like everything else.
- GATE: the יי carries the verse's cantillation mark on the second yud so a chanter is not thrown. Proceeded because Daniel answered the other loose ends and said nothing against it; reversible in one line of code.
- GATE: the diamond siglum is approved as a fourth register, "reference works", shown in the legend only when used. Proceeded because the Isaiah sheet already uses it for a real entry and dropping it would lose approved content.

## 3. Where things live

### 3.1 Code: GitHub, public, no copyrighted text

`RavBogard/haftarah` holds template, fonts, scripts, mural, runbook, docs. The `weeks/` directory leaves the repository entirely, and the repository's history is recreated so no JPS text remains in it (the repo has two commits, so this is a recreate and force-push, not surgery). A `.gitignore` entry keeps `weeks/` out for good; the local checkout keeps a `weeks/` working directory that is never committed.

Cloud Cowork sessions clone the public repo read-only. Nothing in the weekly path pushes to GitHub. Template changes are a separate, deliberate task done from Daniel's machine or a session with GitHub auth.

### 3.2 Records and deliverables: Google Drive

Two folders under the existing "Torah from Scratch" Drive folder:

- `Haftarah sheets` (public, anyone with the link): one PDF per week, named `5787-03 Bereshit — I Samuel 20.18-42.pdf` (year-number, parashah, reading). Students use this.
- `Haftarah working` (private): one subfolder per week slug holding `sheet.json`, `candidates.json`, `sheet-draft.pdf`, and a copy of the final. This is the record and the seed for next year.

The skill reads and writes Drive through the Google Drive connector available in Cowork. Open question for the first implementation task: whether the connector can upload a binary PDF. If it cannot, the fallback is a small Node uploader using a Drive API token stored outside the repo. This is the one spike in the plan.

### 3.3 Where the build runs

Default: the Cowork cloud session (clone, fetch, build, upload). The runbook's claim that the cloud has Chromium must be verified in the first task; the Isaiah conversion was built there, which is encouraging but not proof. Fallback: Daniel's machine, which has Node 24, Chrome and Edge. The skill tries cloud first and says in one line when it falls back.

### 3.4 Memory across years

When `fetch` runs for a reading that exists in `Haftarah working` from an earlier year, the skill loads that sheet.json, shows Daniel the approved entries from last time, and asks what to keep. Approved entries carry over as `proposed` so nothing prints without a fresh yes.

## 4. The weekly conversation (runbook v2)

1. **Calendar.** One line: Shabbat date, parashah, the calendar's haftarah (and why, if special), and the parashah's own haftarah when they differ. Daniel picks. Hebcal supplies the schedule; Daniel's pick overrides.
2. **Fetch.** Hebrew (Miqra according to the Masorah) and English (JPS Gender-Sensitive) from Sefaria, verse-aligned, plus every linked source. Divine name untouched in the data; the renderer makes it יי.
3. **The map.** Before any list of sources, Claude reads the passage and its links and gives a short brief: how the passage moves; the cruxes (textual problems, famous verses, theological knots); where the traditional commentators agree and split; what critical scholarship says about date, setting, composition; the parashah connection. Under 300 words. This replaces "shortlist 8 to 14".
4. **Digging in.** Daniel names the issues that matter this week. Claude pulls the actual texts for those issues, shows each in full (translated where needed, labeled), and they talk. Entries are written to sheet.json as `proposed`; an entry becomes `approved` only after Daniel has seen its words.
5. **Opening note, glossary, next week.** Drafted, shown, approved. The next-week line names the coming Shabbat and its haftarah from Hebcal; when the calendar offers a choice (a special Shabbat), both are shown and Daniel picks, or he defers it.
6. **Build.** Draft PDF with proposed items shaded, to Daniel. Fixes. Final build. The final build refuses to run while any item is `proposed`; it prints what is blocking.
7. **Deliver.** Final PDF to the public folder; sheet.json, candidates.json, draft and final to the working folder. One line back: Shabbat, reading, pages, entries by register, Drive link.

Standing rules carry over: nothing prints unapproved; show translations and summaries in full before approving; never invent a citation; be brief; ask only when blocked, with a short "Needs you:" list.

### 4.1 Historical-critical sources

Rule one, enforced in code: every traditional, modern and reference entry is a text fetched from Sefaria by reference, quoted or abridged, with that reference printed in the tail. No Sefaria ref, no entry.

Rule two, for the historical-critical register only (approved 2026-10-07): summaries are drafted and may name only works on a closed list, `bibliography/<book>.md`, one line per work (author, title, year, what it is good for). Daniel does not manage this list. Claude seeds it from standard reference scholarship (Anchor Bible, Hermeneia, Old Testament Library, Alter, The Jewish Study Bible, and the like) and maintains it; when a week needs a work not yet listed, Claude adds the line, verifies the work exists (publisher catalogue or WorldCat), and mentions the addition in the delivery line. Nothing is ever cited that is not on the list, and nothing goes on the list unverified.

## 5. Data file (schema 2)

Changes to `sheet.json`:

- `series`: `{ "name": "Torah from Scratch", "year": "5787", "number": 3 }`. Number assigned by the skill: one more than the highest number in the working folder for that year.
- `openingNote`: `{ "calendar": "<paragraph>", "setting": "<paragraph or two>", "status": "proposed|approved" }`. Replaces `haftarah.whyThisHaftarah`, `parashahConnection` and `context`.
- `questions` removed. `glossary` unchanged. `commentary[].register` gains `reference`.
- `credits.signoff`: the one-sentence first-person line printed at the foot of the front page.
- `nextWeek`: `{ "shabbat": "Noach", "ref": "Isaiah 54:1-55:5", "civilDisplay": "October 17, 2026", "status": "proposed|approved" }`. Filled by fetch from Hebcal, printed only when approved.
- Voices are not in the data file: `template/voices.json` maps a source name (Rashi, Radak, Malbim, Metzudat David, Abarbanel, Ralbag, Targum Jonathan, Steinsaltz, Ibn Ezra, and so on) to one line of place and dates; the renderer prints the lines for the sources used that week. Unknown sources print without a line and the build warns.
- Everything else unchanged. A migration script converts the two existing schema-1 files.

## 6. The sheet (template changes)

### 6.0 Status and the design review (2026-10-07)

A prototype of the template changes below was built (commit d19894b) and both weeks rendered, so that the review judged the real v2 and not v1. The review ran as four independent passes on those renders: the `/impeccable critique` pair (design review; detector plus browser geometry) and two outside critiques (a book typographer; a usability walkthrough at the table with three personas). Score 21/32. Snapshot: `.impeccable/critique/2026-10-08T02-53-06Z__template-render-js.md`. Everything in 6.1 to 6.3 is the result. Daniel ruled on the open conventions the same night (6.2); the whole section is decided.

### 6.1 Fixes the review found (all decided)

Renderer:

- **Poetry lineation.** Split JPS verse on its line breaks; each line is a block with a 1.1em hanging indent so a turnover reads as a turnover. A footnote key and the punctuation after it never break from their word; an em dash never starts a line.
- **End matter.** A section with no visible items is not emitted (the empty "Names and places" heading). The colophon never stands alone on a page: it flows under the last apparatus if room remains, else it joins the glossary. A page whose body is under about 15 percent full is a build error.
- **The verse-30 problem.** "(cont.)" is reserved for an entry split mid-text. An entry whose verse is on an earlier page is labelled with that page: "30 · p. 3", in the tail's grey. When the last verse on a page spills all of its entries, the verse moves with them to the next page if the slack left behind is under 1.2in.
- **Dead bands.** A verse row may break across pages when the gap between the text and the apparatus rule would otherwise exceed 0.5in (JPS and every Bible split verses across pages). A page never holds a single verse unless the reading has only one left.
- **Margin keys.** JPS footnote letters are re-lettered per sheet from "a" and the superscripts in the English rewritten to match (the duplicate "p" and the "h" start disappear). JPS cross-references to passages not on the sheet ("See note at 10.11", "See 49.6 and note") are dropped; "19.2" becomes "19:2". Every margin note uses the apparatus grammar: italic lemma, grey "]", then the note. Gloss notes carry their verse number.
- **Hebrew cleanliness.** `text-wrap: pretty` on both text columns to kill one-word last lines; the gloss key sits after the sof pasuq without a space; the English first baseline is seated level with the Hebrew's.
- **Build browser pinned.** Pagination differed between headless Chrome and Playwright's Chromium (8 vs 9 pages). The build names its browser in the log and the tests run on the same binary.

Type and colour:

- Apparatus 9.2pt, margin and tails 9pt, tails at 65 percent black (#595959), superscript keys 0.72em. Four Sizes Rule keeps: 60 / 10.5 / 9.2 / 9.
- Red means a source or a key. Red stays on: the cover reading line, chapter tags, apparatus source names, margin keys, sigla. Red leaves: running heads and footer (70 percent black), in-text superscript letters (ink).
- Sigla become one family at one weight: all filled (square, circle, triangle, diamond) at 75 percent of x-height, so no register shouts.
- Verse numbers semibold 10pt rather than bold.
- Outer margin 0.75in so thumbs clear the glosses; 0.25in clear between the Hebrew's right edge and the margin column.

Cover and frame:

- Series line once per page: in the running head. The footer carries the wordmark and tagline on the front page and the folio plus micro-legend on text pages.
- The mural's top is fixed at 1.6in from the trim; the incipit block centres on the mural rather than the mural sliding to meet a two-line incipit. Incipit sized to a 3.5in box, 64pt maximum, one line; two lines only at 54pt with a 1.3em pitch.
- Provenance appears once. The front page keeps editions and the signed sentence; the colophon keeps credits and the series line.
- Text-page footer: folio away from the staple, and in place of the wordmark a micro-legend of the sigla with their names at gloss size, so a reader on page 4 never has to turn back to the cover for the triangle. The wordmark and tagline live on the cover only.
- Legend on the front page is stable: the same four sigla in the same order every week (unused ones in grey), plus "a–z translators' notes (JPS)" and, when the week has one, a one-line key to the qere/ketiv brackets.
- Chapter shown on the first verse of every page as "42:7" in the gutter, not only at chapter changes.

### 6.2 Conventions Daniel ruled on (2026-10-08)

1. **Front page, not a cover.** The whole opening note stays on page 1, which is an orientation page rather than a cover: running head, hero (mural fixed at 1.6in from the trim, incipit centred on it), reading line, calendar paragraph, hairline, setting paragraphs, the stable legend in plain words, "Voices on this sheet", provenance with the signed sentence, footer wordmark and tagline. The haftarah text begins at the top of page 2. The front page keeps its running head like every other page; the series line appears there once, in the head.
2. **Binding corner.** Stapled upper right, duplex. On a recto the staple corner is top right; on a verso it is top left. The frame mirrors accordingly: the running head puts the verse range in the corner away from the staple (recto left, verso right) and the Shabbat name in the staple corner, where losing it costs nothing; the folio sits at the bottom away from the staple (recto left, verso right); the inner margin is the staple side. The gloss column stays on the right of every page; its first note starts below the staple zone (top 0.9in).
3. **One key series.** Glosses and JPS notes share letters a, b, c per sheet in reading order. A JPS note's letter is in the English only, as JPS prints it; a gloss's letter is in the English after the translated word and in the Hebrew after the lemma. In the margin every note reads: red letter, italic lemma, grey "]", note; JPS notes end "JPS" in the tail grey. The ° glyph is gone from the sheet and from the legend.
4. **Register names.** Legend and voices use "classical commentators / modern commentators / what historians say / reference"; the data file keeps `traditional | modern | critical | reference`.
5. **Voices on this sheet.** Printed on the front page under the legend, one line each for the sources used that week, from `template/voices.json`. Drafted titles ("Saul's concession") are set in red italic in the apparatus, named sources in red roman.
6. **Next week.** A rubric line at the foot of the last page, "Next week: Noach · Isaiah 54:1–55:5 · October 17", printed only when `nextWeek.status` is approved. The final build's hard gate covers it.

### 6.3 Original cover and template decisions (approved before the review; superseded where 6.1 or 6.2 says otherwise, and "cover" now means the front page)

Cover, per mockup A:

- Running head: left "Torah from Scratch" italic; right "Haftarah · 5787 · No. 3". Text pages keep Shabbat name left, verse range right.
- Hero row: mural at 2.4in on the left with about 0.55in of air above it, aligned to the bottom of the reading line; incipit at 60pt, English rendering, reading line (reference, Shabbat name, dates) stacked on the right.
- Opening note: calendar paragraph, hairline, setting paragraph(s), max width 5.4in.
- Legend line under the note: the sigla actually used this week, with their names, at gloss size.
- Provenance at the foot of the cover: editions, then `credits.signoff`, signed.
- Footer on every page: "central reform congregation" lowercase at text size, tagline "A Jewish Presence in the City of St. Louis" beneath at gloss size on the cover only; right side "Torah from Scratch · 5787 · No. 3"; folio on text pages as now.

Everywhere:

- Rubric becomes `#8a0a14`, sampled from the mural's ring. The One Rubric Rule stands.
- Divine name: the renderer replaces the Tetragrammaton (with any pointing) by יי, keeping the cantillation mark on the second yud. The build logs the count replaced.
- Margin glosses set in full ink, not gray; gray stays for tails and the frame.
- Apparatus tails no smaller than 8.5pt.
- The Photocopy Rule in DESIGN.md is rewritten as a preference: shape carries register, color is never the only signal, but the sheet is designed for color.
- Legend moves from the last page to the cover; the colophon on the last page shrinks to editions and the signoff.
- Final build is a hard gate on `proposed` items.
- DESIGN.md and PRODUCT.md are updated to match (users, always color, Drive delivery, cover A, rubric, series).

Not in v2: a one-color line extraction of the mural, HTML or phone export, booklet fold, Hebrew lemmas in the apparatus.

## 7. Testing

- Both existing weeks rebuild under the new template; page images reviewed; no sidenote crosses the apparatus rule; front page fits on one page with the longest opening note and voices list we have, and the haftarah text always starts on page 2.
- Review regressions, each a check in the test script: no empty end-matter heading; no page under 15 percent full; no "(cont.)" on an entry that did not split; margin letters per sheet start at "a" with no duplicates; no poetic line without its hanging indent; no gap over 0.5in between text and apparatus rule unless the page ends the reading; red count per text page under a stated ceiling; pagination identical across two runs on the pinned browser.
- Divine-name check: count of יי in the rendered Hebrew equals the count of the Tetragrammaton in the source verses; a unit test on the replacement function covers pointed and unpointed forms and the mark-carrying case.
- Final build with one `proposed` entry exits non-zero and names the entry.
- Schema migration: both v1 files convert and rebuild identically apart from the intended changes.
- Cloud run: one full fetch, build and Drive upload from a Cowork cloud session before the runbook calls cloud the default.

## 8. Migration and rollout

0. **Full design review first (Daniel, 2026-10-07). Done 2026-10-08** on the v2 prototype; findings in 6.1, Daniel's rulings in 6.2. The plan follows.
1. Template, renderer, schema, bibliography, build gate, tests (local, from this machine).
2. Repo history recreated without `weeks/`; force-push; `.gitignore` updated.
3. Drive folders created; the two existing weeks uploaded (Machar Chodesh as 5787 · No. 3 after a rebuild; the Isaiah draft kept in working only).
4. Runbook v2 in the repo; the synced claude.ai skill rewritten to: clone, read runbook, follow it, Drive for all records.
5. Cloud verification run. Then the first real week.
