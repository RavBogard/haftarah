---
name: haftarah-sheet
description: Make this week's haftarah study sheet for Central Reform Congregation. Use when the rabbi asks for the haftarah sheet, the weekly sheet, this week's haftarah, or a sheet for a named Shabbat or date. Fetches the reading from Sefaria, proposes commentary for approval, and renders the letter-size PDF.
---

# Weekly haftarah sheet

One sheet a week. The template never changes; only `weeks/<slug>/sheet.json` does. Your job is to fill that file with the rabbi's approved choices and build the PDF. Work in short rounds and never print anything the rabbi has not approved.

## 0. Before you start

- Project root: this repository (github.com/RavBogard/haftarah). Scripts need Node 18+ and Chrome or Edge. Run from the root.
- Any machine works. In a Cowork cloud session, clone the repo, run fetch and build there (the build finds the preinstalled Chromium and adds `--no-sandbox` when running as root), then commit `weeks/<slug>/` back to GitHub and send the PDF to the rabbi. On a local machine, `git pull` first.
- If a shell is not available in this session, do steps 1 to 3 with the Sefaria MCP tools instead of `fetch.mjs`, write `sheet.json` by hand following `README.md` (section "Data file"), and ask the rabbi to run the build command or open `sheet.html` in a browser and print to PDF.
- Read `PRODUCT.md` once if you have not this session. The translation is pinned (JPS Gender-Sensitive Edition). Gender-sensitive God-language applies to everything you write.

## 1. Fetch the reading

```
node scripts/fetch.mjs                 # next Shabbat, Diaspora schedule
node scripts/fetch.mjs --date 2026-10-17
```

This writes `weeks/<slug>/sheet.json` (text in both languages, dates, parashah, special-Shabbat reason) and `weeks/<slug>/candidates.json` (every source Sefaria links to the passage, grouped and counted, with a register guess). It never overwrites an existing `sheet.json` unless you pass `--force`.

Tell the rabbi in one line what came back: the Shabbat, the haftarah reference, whether it is a special haftarah and why, and the verse count. If Hebcal and the rabbi disagree about the reading (Reform practice sometimes differs), use `--ref "<Sefaria ref>"` with the rabbi's reading.

## 2. Set the cover

Fill these in `sheet.json`:

- `haftarah.incipit.he`: the two to four Hebrew words the haftarah is known by, copied exactly (with vowels and cantillation) from `verses[0].he` or wherever they occur. Default is the first three words; a special haftarah usually has a traditional name (Machar Chodesh, Nachamu, Shuvah). Ask if unsure.
- `haftarah.incipit.en`: the JPS English for those words.
- `haftarah.whyThisHaftarah`: one short paragraph. For a default haftarah: why this passage pairs with this parashah. For a special Shabbat: the calendar rule and its source (Megillah 31a for Machar Chodesh and Rosh Chodesh; the cycle of the Three and the Seven after Tisha B'Av; the four parshiyot). Draft it, show it, get a yes.

## 3. Propose commentary

Open `candidates.json`. Shortlist 8 to 14 entries across the three registers, keyed to the verses the group will care about. A good spread for a 25-verse haftarah: 5 to 7 traditional, 2 to 3 modern, 3 to 4 historical-critical, plus 4 to 6 margin glosses.

- **Traditional** (filled square): Rashi, Radak, Metzudat David, Malbim, Abarbanel, Ralbag, Targum Jonathan, Talmud and midrash. Fetch the text with `get_text` on the exact ref (for example `Radak on I Samuel 20:18`). Rashi on the Prophets has the Metsudah English; most others are Hebrew only. For Hebrew-only sources, translate faithfully and set `translation: "claude"`; the sheet prints "translated for this sheet". Abridge long entries and set `kind: "abridged"`.
- **Modern** (open circle): Steinsaltz (English), Everett Fox's essays, and other modern works Sefaria links. Quote or abridge; name the translation.
- **Historical-critical** (triangle): Sefaria has little of this in quotable form. Draft a short summary (60 to 120 words) resting on named scholarship (for Samuel: McCarter's Anchor Bible volume, Alter's *The David Story*, *The Jewish Study Bible*; for Isaiah: Blenkinsopp, Baltzer; for the Twelve: Andersen and Freedman, Sweeney). Put the attribution in `cites` (HTML allowed, italics for titles). Give the entry a short descriptive `source` title ("The new-moon feast", "A damaged verse"). The sheet prints "summary drafted for this sheet". Never invent a citation.
- **Margin glosses** (`glosses[]`): terse word-level notes keyed to one Hebrew word, copied exactly from the verse text including marks. Masorah-parva terse: 15 to 30 words. Lexical, text-critical, or a cross-reference. The JPS translators' footnotes already print in the margin automatically; do not duplicate them.

Present the shortlist to the rabbi as a numbered list: register mark, verse, source, lemma, first line. Ask which to approve, drop, or swap. Write every chosen entry into `commentary[]` with `status: "proposed"`, and change to `"approved"` only when the rabbi has seen the actual text (show translations and summaries in full before approving). Set `"rejected"` rather than deleting, so the record shows what was considered.

Also draft and get approval for:
- `context` (the historical context box on the cover): heading plus 2 to 3 short paragraphs on the book, its composition, and the scene's world. `status: "approved"` once approved.
- `glossary[]`: 5 to 10 names and places in the passage, each one or two sentences, with the Hebrew in `he`.
- `questions[]` and `parashahConnection`: only if the rabbi asks for them this week.

## 4. Build and check length

```
node scripts/build.mjs weeks/<slug> --draft --png     # review proof; proposed items shaded
node scripts/build.mjs weeks/<slug>                   # final; approved items only
```

The build prints the page count against the 4 to 6 page target. Over 6: drop or abridge entries (long traditional entries first), shorten glosses. Under 4: add entries. Look at the page images in `weeks/<slug>/preview/` before declaring done: check that no sidenote overlaps the apparatus rule, that the incipit fits on one or two lines, and that nothing is cut off.

The final build warns if anything is still proposed; resolve every warning before sending the PDF.

## 5. Deliver

Hand the rabbi `weeks/<slug>/sheet.pdf` and one line: Shabbat, reading, page count, number of entries by register. Keep `sheet.json` as the record of the week.

## Register and attribution rules

- Nothing prints unattributed. Every entry carries `source` and either `sourceRef` (a Sefaria ref) or `cites`.
- Claude translations and summaries are always labeled; the renderer does this from `translation: "claude"` and `register: "critical"`. Do not remove the labels.
- Register is drawn by mark, never color; a black-and-white photocopy must lose nothing.
- Do not edit `template/` for a weekly sheet. If the template needs a change, that is a separate task.
