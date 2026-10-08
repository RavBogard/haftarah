# Handoff: first Cowork run (Noach 5787) → refinements for Claude Code

Written 2026-10-08 at the end of the first real weekly run in a Cowork cloud session (Shabbat Noach, Oct 17, 2026, Isaiah 54:1–55:5). The week's data is in `weeks/2026-10-17-noach/` (sheet.json, sheet-draft.pdf). Every entry in it is still `proposed`; Daniel has the draft PDF to review.

## Daniel's requests

1. **Smaller logo on the front page.** Reduce the mural by about a third. Re-check that the front page still fits (opening note, legend, voices, provenance, wordmark) and that the incipit sizing still looks balanced beside it.

2. **Give each commentary register its own color.** Classical, modern, historians and reference should be told apart by color, not mainly by the shape marks, which are hard to tell apart at a glance. Keep the shapes too (the sheet is sometimes photocopied, and PRODUCT.md says color is never the only signal). Apply the color to the mark and the source label in the apparatus, and to the front-page legend. Pick four colors that read well on a color inkjet and sit with the mural and the #8a0a14 rubric. Update DESIGN.md and PRODUCT.md where they describe the register system as one quiet color.

3. **No "draft for review" label, and one build instead of draft/final.** Daniel's answer to how review works: he looks at the PDF and prints it once he likes it. So:
   - Remove the "draft for review" header badge, the shading of proposed items, and the inline "proposed —" tags.
   - One build produces the sheet he reviews and prints. `--draft` and the final/draft split go away, along with the gate that refuses to build while anything is `proposed`.
   - Keep the citation checks as hard errors: every non-critical entry needs a Sefaria `sourceRef`, and every critical entry may cite only works in `bibliography/<book>.md`.
   - `status` becomes optional. `rejected` still keeps an item off the page, so the record shows what was considered.
   - Update RUNBOOK.md (steps 4–6 and the standing rules), README.md, `.claude/skills/haftarah-sheet/SKILL.md` and the claude.ai skill text in `docs/claude-ai-skill/` to match. "Nothing prints unapproved" now means Daniel approves by printing.

## Problems and slowdowns from this run

**Bugs**

- **Footnotes with italics inside were cut in half.** `fetch.mjs` cut a JPS footnote off at the first `</i>`. In Isaiah 54:11 this left half the note ("as a byform of nophekh; so already Rashi") inside the verse text. Fixed in the working tree, uncommitted: a one-line change to `FOOTNOTE_RE` that allows one level of `<i>` nesting. It needs a unit test.
- **Cloud page images lose the bottom of the page.** On the Linux cloud Chromium, the `--png` screenshots lose the bottom ~86 CSS px: the apparatus is cut off and the footer is missing. The PDF itself is correct, as `pdftoppm` renders of the PDF confirmed. Fix: render the page images from the PDF (pdftoppm when present), or correct the window size for headless Chrome on Linux. The runbook tells Claude to look at these images, so in the cloud it was looking at a false picture until it checked the PDF.
- **Specks show above a verse continued from the previous page.** At the top of a split verse (the continued half of 54:10 on p. 5), small pieces of the previous line's Hebrew marks show above the first line. The clip in `splitRow` needs a little more margin.
- **The layout check failed by one pixel.** `check.mjs` failed on "page 5: 101px gap above the apparatus (max 100)". Either the paginator or the limit needs a small tolerance.
- **The fetched incipit was wrong.** `fetch.mjs` set it to three words including לֹא and left the English empty. The opening words of a haftarah are usually the first two to four words up to a natural break; it should stop before a function word like לֹא and fill the English from JPS.

**Environment**

- **The cloud session can't push to GitHub.** It was refused with "RavBogard/haftarah is not in this session's authorized repository set." The fix above was committed in the cloud (9f133e9) and lost there. Either add the repo to the session's sources or keep pushes on Daniel's machine.
- **The fallback to Daniel's computer doesn't work from a cloud session.** The skill says to fall back to his computer if the cloud build fails, but from a cloud session his computer is reachable only through a Linux VM shell. It has Node 22 and no Chrome or Edge, so it can't build. Say so in the skill, or drop the fallback.
- **Don't run `npm install`.** It created a `package-lock.json` that set off the "untracked files" stop hook. The repo has no dependencies; either say so in the runbook or ignore `package-lock.json` in `.gitignore`.
- **PDFs still go up to Drive by hand.** The connector can't upload a multi-MB PDF, a limit already known from plan 2. The text records (`sheet.json`, `candidates.json`) upload fine.

**Process**

- **"This week" was ambiguous.** `fetch.mjs` with no date picked Oct 10 (Bereshit), which already had two test sheets locally and in Drive. Daniel wanted Oct 17. Suggestion: when the next Shabbat already has a folder, also show the Shabbat after it in the same one-line question.
- **The test folders get in the way.** The Bereshit test folders (`2026-10-10-bereshit-isaiah`, `-machar-chodesh`) still sit in `Haftarah working` and in `weeks/`, numbered 2 and 3. The runbook rule "series number = one more than the highest in the working folder" would give Noach 4. Either rename or delete them, or have the rule skip folders marked as tests.
- **The historian summaries' citations can't be checked from the session.** Claude has no access to Blenkinsopp, Goldingay–Payne, Orlinsky and the rest, so it names a work for a reading without being able to confirm the page. This week it flagged that to Daniel. Worth a standing decision: accept "the standard reading, see X," or require a quotable source.
- **Where the time went.** Most of the run was research and drafting:
  - one research agent, about 6½ minutes;
  - two drafting agents in parallel, about 5 minutes each;
  - the build itself is fast.

  The sheet came out at 10 pages with 45 entries, because Daniel approved every topic from the map.
- **Approving each entry wasn't how Daniel wanted to review.** He answered the map with "approve all of this, let's make the sheet." Approving entries one at a time doesn't fit that, which is part of why request 3 above simplifies review to the PDF.
