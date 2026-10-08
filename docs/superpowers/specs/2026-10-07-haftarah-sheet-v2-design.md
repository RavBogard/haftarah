# Haftarah sheet v2: design spec

Date: 2026-10-07. Status: draft for Daniel's review.

## 1. Goal

A beautiful, consistent, useful haftarah study sheet for Torah from Scratch every week, made in Claude Cowork from any computer, delivered to a public Google Drive folder that students open each week, printed in color by Daniel. The weekly process is a conversation: confirm the Shabbat and the haftarah, map what the commentators and scholars say about the passage, dig into the texts that matter this week, approve, build, deliver.

What stays from v1: the critical-edition design (scripture owns the page, apparatus at the foot, keyed margin glosses, register by shape), the Node + headless Chrome build, one data file per week as the record, Sefaria as the source of texts.

What changes: where things live, how the weekly conversation runs, and the cover and branding.

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
5. **Opening note and glossary.** Drafted, shown, approved.
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
- `credits.signoff`: the one-sentence first-person line printed at the foot of the cover.
- Everything else unchanged. A migration script converts the two existing schema-1 files.

## 6. The sheet (template changes)

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

- Both existing weeks rebuild under the new template; page images reviewed; no sidenote crosses the apparatus rule; cover fits on one page with the longest opening note we have.
- Divine-name check: count of יי in the rendered Hebrew equals the count of the Tetragrammaton in the source verses; a unit test on the replacement function covers pointed and unpointed forms and the mark-carrying case.
- Final build with one `proposed` entry exits non-zero and names the entry.
- Schema migration: both v1 files convert and rebuild identically apart from the intended changes.
- Cloud run: one full fetch, build and Drive upload from a Cowork cloud session before the runbook calls cloud the default.

## 8. Migration and rollout

0. **Full design review first (Daniel, 2026-10-07).** Before any implementation planning: a complete `/impeccable critique` of the whole sheet, every page and every component, not only the cover and branding, plus an outside critique with fresh eyes. The bar Daniel set: usable, gorgeous, enjoyable, intuitive at a glance, a pleasure to hold, graphic form serving the class's use at the table. Findings fold into section 6 before the plan is written. The 2026-10-08 critique snapshot in `.impeccable/critique/` covered branding and the cover; it is an input, not the review.
1. Template, renderer, schema, bibliography, build gate, tests (local, from this machine).
2. Repo history recreated without `weeks/`; force-push; `.gitignore` updated.
3. Drive folders created; the two existing weeks uploaded (Machar Chodesh as 5787 · No. 3 after a rebuild; the Isaiah draft kept in working only).
4. Runbook v2 in the repo; the synced claude.ai skill rewritten to: clone, read runbook, follow it, Drive for all records.
5. Cloud verification run. Then the first real week.
