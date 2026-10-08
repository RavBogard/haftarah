# Weekly haftarah sheet: runbook v2

One sheet a week for Torah from Scratch at Central Reform Congregation. The template never changes during a weekly run; only `weeks/<slug>/sheet.json` does. `README.md` documents every field of that file. Read `PRODUCT.md` once per session. The English is pinned to the JPS Gender-Sensitive Edition, and gender-sensitive God-language applies to everything you write.

## Standing rules

- Nothing prints unapproved. An item becomes `approved` only after Daniel has seen its exact words; translations and summaries are shown in full first.
- Never invent a citation. Every classical, modern and reference entry is a Sefaria text by ref, printed with that ref. Historical-critical summaries name only works listed in `bibliography/<book>.md`.
- No discussion questions, no thematic headings. Commentary is English; Hebrew only for specific words and the haftarah itself.
- Be brief. Ask only when blocked, with a short "Needs you:" list. Put context first, then the question, in prose.
- Set `rejected` rather than deleting, so the record shows what was considered.

## 0. Where to work

1. **Cloud session (default).** Clone `https://github.com/RavBogard/haftarah` read-only. Nothing in the weekly path pushes to GitHub. The build finds the preinstalled Chromium and adds `--no-sandbox` when running as root.
2. **Daniel's machine (fallback).** If the cloud build fails, say so in one line and work in his local checkout after `git pull`. It has Node 24, Chrome and Edge.

`weeks/` is git-ignored. It is a scratch folder; the record of every week lives in Drive (step 7).

## 1. Calendar

```
node scripts/fetch.mjs                     # next Shabbat, Diaspora schedule
node scripts/fetch.mjs --date 2026-10-17
node scripts/fetch.mjs --ref "Isaiah 54:1-55:5" --date 2026-10-17   # Daniel's pick overrides Hebcal
```

Tell Daniel in one line: the Shabbat date, the parashah, the calendar's haftarah (and why, if special), and the parashah's own haftarah when they differ. He picks.

Before going further, look in the Drive working folder for an earlier year's record of the same reading. If one exists, load its `sheet.json`, show Daniel last time's approved entries, and ask what to keep. Carried entries come back as `proposed`.

Set `series.number` to one more than the highest number already issued this year in the working folder.

## 2. Fetch

`fetch.mjs` writes `sheet.json` (Hebrew from Miqra according to the Masorah, English from JPS Gender-Sensitive, verse-aligned) and `candidates.json` (every source Sefaria links to the passage, grouped, with a register guess). It never overwrites an existing `sheet.json` without `--force`. Leave the divine name alone in the data; the renderer sets it as יי.

## 3. The map

Before listing any sources, read the passage and its links and give Daniel a brief of under 300 words: how the passage moves; the cruxes (textual problems, famous verses, theological knots); where the traditional commentators agree and split; what critical scholarship says about date, setting and composition; the connection to the parashah.

## 4. Digging in

Daniel names the issues that matter this week. For each, pull the actual texts with the Sefaria tools on exact refs (`Radak on I Samuel 20:18`), show each in full, translated where needed and labelled, and talk it through. Write each chosen entry to `commentary[]` as `proposed`.

- **Classical** (filled square) and **modern** (filled circle): quote or abridge a Sefaria text; set `sourceRef`. For a Hebrew-only source, translate faithfully and set `translation: "claude"`; abridge with `kind: "abridged"`.
- **What historians say** (filled triangle): a 60 to 120 word summary with a short descriptive `source` title, naming only works from `bibliography/<book>.md` in `works`. When a week needs a work not yet listed, add the line, verify the work exists (publisher catalogue or WorldCat), and mention the addition in the delivery line.
- **Reference** (filled diamond): a Sefaria reference work by ref.
- **Margin glosses** (`glosses[]`): word-level notes of 15 to 30 words keyed to one Hebrew word copied exactly from the verse, with `en` naming the English words to key. The JPS translators' notes print in the margin automatically; do not duplicate them.

## 5. Opening note, glossary, next week

Draft each, show it, get a yes.

- `openingNote`: the calendar paragraph (why this reading this Shabbat), then the historical setting in one or two paragraphs. It fills the front page with the mural, the incipit and the legend, so keep it to what fits.
- `haftarah.incipit`: the two to four Hebrew words the haftarah is known by, copied exactly, and their JPS English.
- `glossary[]`: names and places in the passage, one or two sentences each, with the Hebrew.
- `nextWeek`: the coming Shabbat and its haftarah from Hebcal. When the calendar offers a choice, show both and let Daniel pick or defer.

## 6. Build

```
node scripts/build.mjs weeks/<slug> --draft --png   # proof: proposed items shaded, blockers listed
node scripts/check.mjs weeks/<slug> --draft         # layout invariants
node scripts/build.mjs weeks/<slug> --png           # final: refuses while anything is proposed and names it
node scripts/check.mjs weeks/<slug>
```

Send Daniel the draft. Look at the page images before calling anything done. When everything is approved, build the final and run the check on it.

## 7. Deliver

- **Public folder** `Haftarah` (owner daniel@centralreform.org, anyone with the link can view; id `1TbSmoeBaCSLciL_-_HSCuKWkJMSZvGwd`): the final PDF, named `5787-03 Bereshit — I Samuel 20.18-42.pdf` (year-number, parashah, reading).
- **Working folder** `Haftarah working/<slug>/`: `sheet.json`, `candidates.json`, `sheet-draft.pdf` and a copy of the final.

The Google Drive connector uploads text files directly (`textContent`, conversion disabled). A PDF of several megabytes is too large to pass through the connector, so until a PDF uploader exists, hand Daniel the PDFs and say so in the delivery line.

One line back to Daniel: Shabbat, reading, page count, entries by register, Drive link, and any bibliography additions.
