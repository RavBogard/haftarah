# Weekly haftarah sheet: runbook v3

One sheet a week for Torah from Scratch at Central Reform Congregation. The template never changes during a weekly run; only `weeks/<slug>/sheet.json` does. `README.md` documents every field of that file. Read `PRODUCT.md` once per session. The English is pinned to the JPS Gender-Sensitive Edition, and gender-sensitive God-language applies to everything you write.

## Standing rules

- Nothing prints unapproved, and Daniel approves by printing. He reads the texts and summaries in the conversation, then looks at the PDF and prints it once he likes it. There is no per-entry approval and no draft build.
- Never invent a citation. Every classical, modern and reference entry is a Sefaria text by ref, printed with that ref. Historical-critical summaries name only works listed in `bibliography/<book>.md`. The build refuses to run when either rule is broken.
- No discussion questions, no thematic headings. Commentary is English; Hebrew only for specific words and the haftarah itself.
- Be brief. Ask only when blocked, with a short "Needs you:" list. Put context first, then the question, in prose.
- When Daniel turns something down, set `status: "rejected"` rather than deleting it, so the record shows what was considered. `status` is otherwise optional.

## 0. Where to work

Work in a cloud session. Clone `https://github.com/RavBogard/haftarah` read-only. The build finds the preinstalled Chromium and adds `--no-sandbox` when running as root.

- **Do not run `npm install`.** The repo has no dependencies; Node 18+ and a Chrome-family browser are all it needs.
- **The cloud session cannot push to GitHub.** Nothing in the weekly path needs to. If you find a bug in the template or scripts, do not fix it in the cloud copy; write it up in the delivery line (or a handoff note in the working folder) so it is fixed on Daniel's machine.
- **If the cloud build fails, say so in one line and stop.** From a cloud session Daniel's computer is reachable only through a Linux VM with Node and no browser, so it cannot build there. Daniel can run the build himself in Claude Code on his machine.

`weeks/` is git-ignored. It is a scratch folder; the record of every week lives in Drive (step 7).

## 1. Calendar

```
node scripts/fetch.mjs                     # next Shabbat, Diaspora schedule
node scripts/fetch.mjs --date 2026-10-17
node scripts/fetch.mjs --ref "Isaiah 54:1-55:5" --date 2026-10-17   # Daniel's pick overrides Hebcal
```

Tell Daniel in one line: the Shabbat date, the parashah, the calendar's haftarah (and why, if special), and the parashah's own haftarah when they differ. He picks.

"This week" can mean the coming Shabbat or the one after. When the coming Shabbat already has a folder (in `weeks/` or the Drive working folder), offer both in the same one-line question. `fetch.mjs` with no `--date` does this for you: it names both Shabbatot and stops.

Before going further, look in the Drive working folder for an earlier year's record of the same reading. If one exists, load its `sheet.json`, show Daniel last time's entries, and ask what to keep.

Sheets are not numbered. Each is known by its date: the front page carries the Hebrew date with the year ("6 Cheshvan 5787").

## 2. Fetch

`fetch.mjs` writes `sheet.json` (Hebrew from Miqra according to the Masorah, English from JPS Gender-Sensitive, verse-aligned) and `candidates.json` (every source Sefaria links to the passage, grouped, with a register guess). It never overwrites an existing `sheet.json` without `--force`. Leave the divine name alone in the data; the renderer sets it as יי.

It also proposes the incipit: the first two to four Hebrew words up to the first strong pause, never ending on a function word like לֹא, with the matching JPS words. Check both against the verse; the name a haftarah is known by is not always its first words.

## 3. The map

Before listing any sources, read the passage and its links and give Daniel a brief of under 300 words: how the passage moves; the cruxes (textual problems, famous verses, theological knots); where the traditional commentators agree and split; what critical scholarship says about date, setting and composition; the connection to the parashah.

## 4. Digging in

Daniel names the issues that matter this week, or approves the whole map. For each, pull the actual texts with the Sefaria tools on exact refs (`Radak on I Samuel 20:18`), show each in full, translated where needed and labelled, and talk it through. Write each chosen entry to `commentary[]`.

- **Classical** (red square) and **modern** (blue circle): quote or abridge a Sefaria text; set `sourceRef`. For a Hebrew-only source, translate faithfully and set `translation: "claude"`; abridge with `kind: "abridged"`.
- **What historians say** (teal triangle): a 60 to 120 word summary with a short descriptive `source` title, naming only works from `bibliography/<book>.md` in `works`. The works themselves cannot be checked from a session, so a summary gives the standard reading and points to the work ("see Blenkinsopp"); it never claims a page number or a quotation it has not seen (Daniel's ruling, 2026-10-08). When a week needs a work not yet listed, add the line, verify the work exists (publisher catalogue or WorldCat), and mention the addition in the delivery line.
- **Reference** (ochre diamond): a Sefaria reference work by ref.
- **Margin glosses** (`glosses[]`): word-level notes of 15 to 30 words keyed to one Hebrew word copied exactly from the verse, with `en` naming the English words to key. The JPS translators' notes print in the margin automatically; do not duplicate them.

## 5. Opening note, glossary, next week

Draft each and show it with the rest.

- `openingNote`: the calendar paragraph (why this reading this Shabbat), then the historical setting in one or two paragraphs. It fills the front page with the mural, the incipit and the legend, so keep it to what fits.
- `haftarah.incipit`: check what fetch proposed (step 2).
- `glossary[]`: names and places in the passage, one or two sentences each, with the Hebrew.
- `nextWeek`: the coming Shabbat and its haftarah from Hebcal. When the calendar offers a choice, show both and let Daniel pick, or set `nextWeek` to null.

## 6. Build

```
node scripts/build.mjs weeks/<slug> --png   # sheet.pdf and page images; refuses on a broken citation and names it
node scripts/check.mjs weeks/<slug>         # layout invariants
```

Look at the page images before calling anything done. Where `pdftoppm` is installed (the cloud image has it), the images are rendered from the PDF itself; otherwise they are browser screenshots, and on Linux those lose the bottom of the page, so open the PDF if a page looks cut off. Send Daniel the PDF. If he asks for changes, edit `sheet.json` and build again; the sheet he prints is the last one built.

## 7. Deliver

- **Public folder** `Haftarah` (owner daniel@centralreform.org, anyone with the link can view; id `1TbSmoeBaCSLciL_-_HSCuKWkJMSZvGwd`): the PDF, named `2026-10-17 Noach — Isaiah 54.1-55.5.pdf` (date, parashah, reading).
- **Working folder** `Haftarah working/<slug>/` (private; id `1BamL1Odk8xP5znSIRr3ENc2nt7QRo7ti`; create the week's subfolder): `sheet.json`, `candidates.json` and a copy of the PDF.

The Google Drive connector uploads text files directly (`textContent`, `contentMimeType: application/json`, conversion disabled); compare the reported `fileSize` with the local size after stripping carriage returns. A PDF of several megabytes is too large to pass through the connector, so hand Daniel the PDF and say in the delivery line that it goes into both folders by hand.

One line back to Daniel: Shabbat, reading, page count, entries by register, Drive link, any bibliography additions, and any template bug found this run.
