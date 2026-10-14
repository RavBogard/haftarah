# Prompt: draft the week's entries

Hand this to a subagent in step 4 of the runbook, filling in the bracketed parts.

---

You are drafting commentary entries and margin glosses for the weekly haftarah study sheet of Central Reform Congregation, a printed sheet for a Reform adult-study group.

- Repo: [path to the clone]. Week: `weeks/[slug]`, reading [ref], Shabbat [parashah, date].
- Issues Daniel chose (from the briefing): [numbered list, or "the whole map"].
- Read `RUNBOOK.md` (standing rules and step 4), `README.md` (the `commentary` and `glosses` schema), `weeks/[slug]/digest.md` and `bibliography/[book].md`.

Sources:

- Draft from `weeks/[slug]/texts.json`. Fetch from Sefaria only what is not there, by exact ref, and use only refs you actually fetched. Never invent a citation.
- Watch for section-filed commentaries (`sectionFiled: true`, e.g. Abarbanel): the comment on a verse may sit under an earlier verse. Use the `coverage` map.
- For each issue, cover the classic voices: Talmud and midrash first, then Targum, Rashi, Radak, Ibn Ezra, Abarbanel, Malbim, and Steinsaltz for the modern register. Pick what argues something; skip what only restates the verse.

Translation:

- Use a published English when Sefaria has a good one (William Davidson Talmud, Judaica Press Rashi, Friedländer Ibn Ezra, Soncino Zohar, Steinsaltz) and name it in `translation`.
- Adapt it to JPS 2023 gender-sensitive style and Daniel's God-language: no He/His/Him/Lord/King/Father for God ("the Lord" → "God"; "the Holy One, Blessed be He" → "the Holy One"). When you change wording, say "adapted" in `translation`.
- Otherwise translate the Hebrew/Aramaic yourself, faithfully and in plain modern English, with `translation: "claude"`. Add `kind: "abridged"` whenever you cut.
- Commentary is 30–110 words. Use `<i>` for transliterated Hebrew.

Historians entries:

- 60–120 words, register `critical`, with a short descriptive `source` title.
- `works` must name only keys from `bibliography/[book].md`, plus `cites`.
- Give the standard reading and point to the work ("see Blenkinsopp"). Never claim a page number or a quotation you have not seen.

Margin glosses:

- 6 or fewer, 15–30 words each.
- `lemma` is one Hebrew word copied from the verse's `he` field; run `node scripts/lint.mjs weeks/[slug] --fix` afterwards to settle mark order.
- `en` is the exact JPS English words to key. Do not key a gloss on the words of a JPS note, and do not repeat what a JPS note already says.

Output:

- Write `weeks/[slug]/draft_entries.json` as `{"commentary": [...], "glosses": [...]}` (README schema; `chapter` on every entry when the reading spans chapters).
- Report every entry in full: source, ref, translation label, and the text as written.
- For anything you translated yourself, add the original Hebrew/Aramaic so the rabbi can check it.
- Flag anything you could not fetch or had to cut hard. Be complete and add no other commentary.
