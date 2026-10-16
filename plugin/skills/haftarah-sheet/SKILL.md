---
name: haftarah-sheet
description: Make the weekly Torah and haftarah study sheets for Torah from Scratch (Central Reform Congregation) with the haftarah connector: calendar, briefing, drafting, build, approve by printing, deliver on "ship it".
---

# The weekly sheet

Use the **haftarah** connector for every file, build and delivery; it holds the week, the credentials and the browser, so nothing is cloned and nothing is installed. Use the **Sefaria connector** for look-ups ("show me Radak on 54:9", a lexicon entry, a search). RUNBOOK.md in RavBogard/haftarah is the long form of these rules; this page is the conversation.

## Standing rules

- **Nothing prints unapproved, and Daniel approves by printing.** Before you hand him the draft links, show him in chat, in full, everything Claude wrote itself: its own translations (the original Hebrew or Aramaic on request), every historians summary, every margin gloss, the opening note and the glossary. Published translations are not repeated in chat; they are in the PDF. No per-entry approval, no draft build.
- **Never invent a citation.** Every classical, modern and reference entry is a Sefaria text by ref; historians summaries name only works in the book's bibliography (`add_bibliography_work` adds one, verified by a publisher or WorldCat page). `save_entries` refuses what breaks either rule; fix it, do not argue with it.
- **Translation style and God-language.** Every translation follows the JPS 2023 gender-sensitive style: no He/His/Him/Lord/King/Father for God; "God", "the Holy One", "the Eternal", or restructure. An adapted published translation says "adapted" in `translation`. Human referents follow the source.
- No discussion questions, no thematic headings. Commentary in English; Hebrew only for specific words and the readings themselves.
- Be brief everywhere except the briefing. Ask only when blocked, with a short "Needs you:" list, context first. Daniel arrives cold: nothing is put to him for a choice until he has had the briefing. Picks among clear options are tappable pop-ups; anything nuanced is prose.
- When Daniel turns something down, mark it with `set_status` (status rejected) rather than deleting it.
- **`deliver_week` runs only on Daniel's explicit "ship it"** (or "deliver", "send it") after he has printed. Never on your own judgment, never because the build passed.
- Grunt work (drafting entries, translating) goes to subagents briefed with `get_texts`; the main conversation keeps the briefing, the picks and the rulings.

## The run

1. **Calendar.** `get_calendar` (no date: the coming Shabbat). One line to Daniel: the date, the parashah, the haftarah and why if special, the parashah's own haftarah when they differ. `weeks` says whether the Wednesday pre-fetch already started the week; `find_past_sheets` shows last year's sheet for the parashah.
2. **Start and texts.** `start_week` unless the week exists; then `fetch_texts` for the haftarah. Read the digest it returns: it is the map for the briefing. (The Torah's texts come after the pick, step 4.)
3. **The briefing.** About one printed page (500–700 words for the haftarah, about 350 more for the Torah), plain prose under short labelled sections, written to be read cold: the portion panel by panel; this Shabbat, with the Torah's shape by aliyah from the digest and a recommended selection; three to five themes; the commentary tradition, each source by its Sefaria ref; the critical view, naming only bibliography works. No questions inside it. Then number the issues it raised and offer them as a multi-select pop-up with "Take the whole map", plus the range pop-up when there is a choice and the Torah pick (an aliyah, a run of aliyot, the triennial range, the maftir, or his own range). `save_briefing` with the issues and his picks.
4. **The Torah pick.** `start_week` again with `torahPick` (`aliyah:1-2`, `aliyah:M`, `triennial`, `full`) or `torahRef`; then `fetch_texts` for the torah. Show the carried entries from last year with the rest; he cuts.
5. **Drafting.** Brief a subagent per reading from this skill's `draft-entries.md`, pointed at `get_texts` for this week (source, kind, verse filters; follow the cursor). Review its entries (citations, translation, God-language, section-filed commentaries), then `save_entries` per reading with `expectedVersion` from the last `get_sheet` or save; on `version_conflict`, `get_sheet` again and resend, never force; it names what it refused and why, and returns lint. Three registers, the per-reading cap, glosses keyed to one Hebrew word. `update_sheet` for the opening note, incipits, glossary, next week, and the map and timeline when the reading has places.
6. **Build.** `build_sheet`. Clear the lint warnings that matter; if the check fails on a gap it names the entry to trim and by how many words. Look at the pages with `get_page_image`. Then show Daniel the Claude-written texts in full together with the PDF links. Changes: `save_entries`/`update_sheet`, build again. The sheet he prints is the last one built.
7. **Deliver.** On his "ship it": `deliver_week` (with `dryRun: true` first if anything looks unusual). One line back: Shabbat, readings, page counts, entries by register per reading (and how many carried), the Drive links and the page address, any bibliography additions.

If the connector is down, say so in one line and stop: Daniel can run the same steps from Claude Code with the scripts in RUNBOOK.md.
