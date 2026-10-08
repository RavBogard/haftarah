# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

delegated: static HTML + CSS rendered to a letter-size PDF with headless Chrome/Edge, driven by a dependency-free Node script. Chosen because the weekly run happens inside Claude Cowork on the rabbi's own machine (Windows today), where Node 24 and Edge/Chrome are present and nothing else should need installing. Fonts are self-hosted in the repo so the PDF renders identically on any machine.

## Users

Rabbi Daniel Bogard of Central Reform Congregation (St. Louis) produces one sheet a week in Claude Cowork, in a short sitting, from the Sefaria MCP. The readers are an adult Torah study group / adult-education class who sit around a table with the printed sheet and discuss the week's haftarah. They are literate, curious adults; many read some Hebrew, most rely on the English, a few can chant.

## Product Purpose

A weekly printed study sheet (letter size, 4 to 6 pages) carrying the full haftarah for the coming Shabbat in Hebrew with vowels and cantillation, the JPS Gender-Sensitive English alongside, and a curated apparatus of commentary in three registers: traditional (Rashi, Radak, Malbim, Metzudat David, Abarbanel, Targum, Talmud), modern (Steinsaltz, Fox, and other modern works on Sefaria), and historical-critical (dating, authorship, setting, redaction, archaeology). Success is a sheet that looks the same every week, takes minutes rather than hours to produce, and gives the group enough to argue about for an hour.

## Positioning

A Mikraot Gedolot for a Reform study table: Sefaria's sources, pulled live each week and approved one by one by the rabbi, laid out by a fixed template so the design never has to be redone. Unlike a Sefaria source sheet, it is a finished, typeset print object with a stable identity; unlike a published commentary volume, it is tuned to this congregation, this week, and the rabbi's own selections.

## Operating Context

- The weekly ritual: in Cowork, Claude reads the Jewish calendar (Sefaria `get_current_calendar`, Diaspora schedule), fetches the haftarah text in both languages, lists candidate commentary from Sefaria's links, and proposes a shortlist. The rabbi approves or rejects each source and each Claude-written summary. Only approved items render. A draft PDF with proposed items visibly flagged supports the review; a clean PDF is the final.
- Special haftarot are normal, not edge cases: Machar Chodesh, Shabbat Rosh Chodesh, the Three of Affliction, the Seven of Consolation, Shabbat Shuvah, the four parshiyot, festivals. The sheet always names the actual reading and, when it differs from the parashah's default haftarah, says why.
- The sheet is printed double-sided on letter paper on an office printer, usually black and white, sometimes color. It is also sent as a PDF.
- Hebrew source text: Sefaria's "Miqra according to the Masorah" (full te'amim). English: "THE JPS TANAKH: Gender-Sensitive Edition". Both are verse-aligned.
- Historical-critical content does not exist on Sefaria in quotable form; Claude drafts it as attributed summaries (naming the scholarship it rests on) and the rabbi approves before it prints.

## Capabilities and Constraints

- One template, one weekly data file. Everything week-specific lives in the data file; nothing week-specific lives in the template.
- Hebrew is set with vowels and cantillation (Tikkun-grade), so the Hebrew face must carry the full te'amim range with correct mark placement.
- Fixed length target of 4 to 6 letter pages. Commentary volume is the variable the rabbi controls to hit it.
- Every commentary entry is keyed to a verse or verse range and labeled by register (traditional, modern, historical-critical) and by source.
- Each sheet carries a historical context box (dating, authorship, setting of the book) and a glossary of names and places. Discussion questions and a parashah-connection note are optional extras the rabbi can switch on in the data file.
- Undecided: whether sheets are also published on the congregation website. The build must not preclude an HTML export later.
- Undecided: the CRC logo file and any brand colors. The template reserves a logo slot on the cover and renders a typographic fallback until the file is supplied.

## Brand Commitments

- Issued by Central Reform Congregation, with its logo on the cover. Logo and brand colors to be supplied by the rabbi.
- The series must have a consistent look week to week; the identity belongs to the series, not to the individual sheet.
- Translation is pinned: JPS Gender-Sensitive Edition (2023). Gender-sensitive language is a commitment, not a preference.
- Sources are always attributed by name; Claude-written summaries are always labeled as such.

## Evidence on Hand

- Sefaria MCP tools available in Cowork: calendar, text by reference with version selection, links between texts, English translations, text search.
- First live sample: Shabbat Bereshit 5787 (October 10, 2026) falls on Erev Rosh Chodesh, so the haftarah is Machar Chodesh, I Samuel 20:18-42.

## Product Principles

- The text is the host; commentary is the guest. Scripture gets the best position and the best type on every page.
- Three registers, one voice. Traditional, modern, and critical commentary sit as equals on the page and are told apart by a quiet, consistent system, never by one shouting over the others.
- Nothing unattributed, nothing unapproved. Provenance is part of the design.
- Fast to make, slow to read. The weekly run should feel like filling a form; the sheet should feel like a book.

## Accessibility & Inclusion

- Printed body text no smaller than 10 pt for English, with Hebrew sized to match its x-height; commentary no smaller than 8.5 pt. The group includes older adults.
- Must survive black-and-white photocopying: register and hierarchy may not depend on color alone.
- Gender-sensitive translation throughout; Claude-written text follows the same convention for God-language and human referents.
