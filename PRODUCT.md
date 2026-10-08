# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

delegated: static HTML + CSS rendered to a letter-size PDF with headless Chrome/Edge, driven by a dependency-free Node script. Chosen because the weekly run happens inside Claude Cowork on the rabbi's own machine (Windows today), where Node 24 and Edge/Chrome are present and nothing else should need installing. Fonts are self-hosted in the repo so the PDF renders identically on any machine.

## Users

Rabbi Daniel Bogard of Central Reform Congregation (St. Louis) produces one sheet a week in Claude Cowork, in a short sitting, from the Sefaria MCP. The readers are an adult Torah study group / adult-education class who sit around a table with the printed sheet and discuss the week's haftarah. They are literate, curious adults; many read some Hebrew, most rely on the English, a few can chant; many are older; the sheet is read at arm's length.

## Product Purpose

A weekly printed study sheet (letter size) carrying the full haftarah for the coming Shabbat in Hebrew with vowels and cantillation, the JPS Gender-Sensitive English alongside, and a curated apparatus of commentary in three registers: traditional (Rashi, Radak, Malbim, Metzudat David, Abarbanel, Targum, Talmud), modern (Steinsaltz, Fox, and other modern works on Sefaria), and historical-critical (dating, authorship, setting, redaction, archaeology). Success is a sheet that looks the same every week, takes minutes rather than hours to produce, and gives the group enough to argue about for an hour.

## Positioning

A Mikraot Gedolot for a Reform study table: Sefaria's sources, pulled live each week and approved one by one by the rabbi, laid out by a fixed template so the design never has to be redone. Unlike a Sefaria source sheet, it is a finished, typeset print object with a stable identity; unlike a published commentary volume, it is tuned to this congregation, this week, and the rabbi's own selections.

## Operating Context

- The weekly ritual: in Cowork, Claude reads the Jewish calendar (Sefaria `get_current_calendar`, Diaspora schedule), fetches the haftarah text in both languages, lists candidate commentary from Sefaria's links, and proposes a shortlist. The rabbi reads the texts and summaries in the conversation, then reviews the built PDF and approves the sheet by printing it. One build makes the sheet he reviews and prints; anything he turns down is marked rejected and stays off the page.
- Special haftarot are normal, not edge cases: Machar Chodesh, Shabbat Rosh Chodesh, the Three of Affliction, the Seven of Consolation, Shabbat Shuvah, the four parshiyot, festivals. The sheet always names the actual reading and, when it differs from the parashah's default haftarah, says why.
- The sheet is printed double-sided in color by the rabbi, stapled upper right. It is also sent as a PDF.
- Hebrew source text: Sefaria's "Miqra according to the Masorah" (full te'amim). English: "THE JPS TANAKH: Gender-Sensitive Edition". Both are verse-aligned.
- Historical-critical content does not exist on Sefaria in quotable form; Claude drafts it as attributed summaries (naming only works on the closed bibliography) and the rabbi reads it before he prints.

## Capabilities and Constraints

- One template, one weekly data file. Everything week-specific lives in the data file; nothing week-specific lives in the template.
- Hebrew is set with vowels and cantillation (Tikkun-grade), so the Hebrew face must carry the full te'amim range with correct mark placement.
- No page target; the build reports the count. Commentary volume is the variable the rabbi controls.
- Every commentary entry is keyed to a verse or verse range and labeled by register (traditional, modern, historical-critical) and by source.
- Each sheet opens with a front page: calendar reason, historical setting, legend, voices. Discussion questions are never printed. A glossary of names and places and a next-week line close the sheet.
- Undecided: whether sheets are also published on the congregation website. The build must not preclude an HTML export later.

## Brand Commitments

- Issued by Central Reform Congregation under its mark, the Siona Benjamin floor mural; rubric #8a0a14 from the mural's ring; wordmark lowercase "central reform congregation" with the tagline "A Jewish Presence in the City of St. Louis".
- The series must have a consistent look week to week; the identity belongs to the series, not to the individual sheet.
- Translation is pinned: JPS Gender-Sensitive Edition (2023). Gender-sensitive language is a commitment, not a preference.
- Sources are always attributed by name; Claude-written summaries are always labeled as such.

## Evidence on Hand

- Sefaria MCP tools available in Cowork: calendar, text by reference with version selection, links between texts, English translations, text search.
- First live sample: Shabbat Bereshit 5787 (October 10, 2026) falls on Erev Rosh Chodesh, so the haftarah is Machar Chodesh, I Samuel 20:18-42.

## Product Principles

- The text is the host; commentary is the guest. Scripture gets the best position and the best type on every page.
- Three registers, one voice. Traditional, modern, and critical commentary sit as equals on the page and are told apart by a consistent system, a shape and a color from the mural for each, never by one shouting over the others.
- Nothing unattributed, nothing unapproved: Daniel approves a sheet by printing it. Provenance is part of the design.
- Fast to make, slow to read. The weekly run should feel like filling a form; the sheet should feel like a book.

## Accessibility & Inclusion

- Printed body text no smaller than 10 pt for English, with Hebrew sized to match its x-height; commentary no smaller than 9pt. The group includes older adults.
- Shape and color together carry register, letters carry keys, position carries hierarchy; color is never the only signal, so a photocopy still reads. But the sheet is designed for color: the mural, the rubric, the four register colors and the greys are chosen for an inkjet, not a photocopier.
- Gender-sensitive translation throughout; Claude-written text follows the same convention for God-language and human referents.
