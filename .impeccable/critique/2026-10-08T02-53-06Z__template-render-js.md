---
target: the whole haftarah sheet (v2 prototype, both weeks)
total_score: 21
max_score: 32
na_heuristics: 3,9
p0_count: 2
p1_count: 5
target_identity: "file:C:\\Users\\dsbog\\haftarah\\template\\render.js"
target_fingerprint: "sha256:caabb8b96e80e702d66a21f34755c25137c40ea9318670ac89f59a54e0722b54"
target_path: "C:\\Users\\dsbog\\haftarah\\template\\render.js"
timestamp: 2026-10-08T02-53-06Z
slug: template-render-js
---
Method: dual-agent (A: design-review sub-agent · B: detector and geometry sub-agent) plus two outside sub-agents (a book typographer and a table-usability walkthrough), all run on the v2 prototype render (commit d19894b): Machar Chodesh 6 pages, Isaiah draft 8 pages.

## Design Health Score (Assessment A, Read surface)

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of system status | 3 | Running head verse range and folio are excellent; legend lives on the cover only |
| 2 | Match system / real world | 3 | "(cont.)" used for entries that never started; JPS "19.2ff" beside the sheet's "20:18" |
| 3 | User control and freedom | n/a | Paper has no actions to undo |
| 4 | Consistency and standards | 2 | Letters start at "h"; "p" keys two notes on one page; two bracket conventions unexplained; DESIGN.md out of date |
| 5 | Error prevention | 2 | Poetic turnovers read as new lines; the ° key looks like a telisha mark |
| 6 | Recognition rather than recall | 2 | Dead cross-references ("See note at 10.11"); legend only on the cover |
| 7 | Flexibility and efficiency | 3 | Bold gutter numbers, red source names, verse ranges in the head: verse 30 found in two seconds |
| 8 | Aesthetic and minimalist | 3 | Series line three times on the cover; provenance twice; 1in voids above the apparatus |
| 9 | Error recovery | n/a | No recoverable actions on paper |
| 10 | Help and documentation | 3 | Legend, provenance, tails honest; "]" and qere/ketiv brackets never explained |
| **Total** | | **21/32** | Competent, not yet a pleasure |

## Design specificity

The cover is authored: mural and incipit on one baseline, rubric from the ring, lowercase wordmark, a signed sentence that sounds like a person. Nobody else could ship page 1. The typographer's dissent: it reads as the first page of a journal article, not a cover, because a running head frames it like an interior page and the opening note is forty percent of the ink. Inside, the frame is a competent critical edition that any congregation with a Sefaria login could produce. What is specific inside is content (the editorial titles on triangle and diamond entries), not design, and nothing from the cover travels inward.

Detector: one advisory on each built sheet, the grey desk colour behind screen previews, which never prints. No real findings. Browser geometry: no collisions, no element outside its page, no note below the apparatus rule, columns balanced everywhere. Font sizes and colours confirmed at the stated values. Divine name replaced 5 times (Samuel) and 12 times (Isaiah).

## Where the four agree

1. Poetry lineation is lost (Isaiah, every text page): a wrapped JPS line is indistinguishable from a new poetic line, and 42:6 ends with a lone em dash. P0.
2. End matter breaks under a long reading: an empty "Names and places" heading between two hairlines, then a page holding nothing but the colophon. P0.
3. The verse-30 problem: all of verse 30's commentary lands on the page after verse 30, labelled "(cont.)" though nothing precedes it. The usability walkthrough calls this the one live-class failure. P1.
4. The margin key system is JPS's, not the sheet's: letters start at "h" (Samuel) or "b" (Isaiah); "p" keys two different notes on one page; notes point to pages the reader does not have; lemma and note run together with no separator ("h vacant At the festal meal."). P1.
5. The ° gloss key is near-invisible among the te'amim, has no anchor in the English, and looks like a telisha mark (three reviewers took telisha marks for stray keys; the detector pass checked the characters and they are cantillation). A reader with no Hebrew cannot connect a gloss to its word. P1.
6. Dead bands between the text and the apparatus: 0.9in to 1.3in on five pages, because the paginator moves a whole verse row and never splits one; the live Isaiah render even isolates 42:5 and 42:6 on one-verse pages when their entries are front-loaded. P1.
7. Too much red: more than thirty red marks on Samuel page 2. Running heads, footer, in-text letters, sigla and source names all compete, so red stops meaning anything. Sigla are of unequal weight (filled square shouts, hollow circle and triangle whisper). P2.
8. Sizes for older eyes: 8.5pt grey italic tails at 50 percent black, 6.5pt superscript keys, 20-character margin lines. P1.
9. Cover repetition and drift: series line three times, provenance repeated in the colophon, legend tiny and changing week to week, mural sliding 0.85in down the page when the incipit wraps to two lines. P2.
10. Nothing introduces the voices: Rashi, Radak, Malbim and Steinsaltz appear with no dates or places, and invented titles ("Saul's concession") sit in the same red slot as commentator names, so a newcomer reads them as commentators. P2.

## Strengths every reviewer asked to protect

- The apparatus entry grammar (siglum, bold verse, italic lemma, ], red source, body, grey tail) and the bottom-pinned, balanced two-column apparatus under a full-measure hairline.
- The Literata and Ezra SIL pairing at roughly 11/15 against 14.5/18, one ink and one oxblood red.
- Running heads with live verse ranges, bold gutter verse numbers, the red chapter-over-verse tag.
- The gloss content itself (Hebrew word, transliteration, translation, one sentence of why it matters) and "Names and places" as set on Samuel page 6.
- The signed line "Tell me what I got wrong."

## Persona red flags

- Ruth, 78, bifocals, twenty years in the class, no Hebrew: squints at the tails, the superscript letters, the ° rings, the stacked chapter numbers and the pointed Hebrew inside margin glosses; cannot find the word a gloss points to; reads "20 … 18" and wonders if verse 20 precedes 18.
- Marcus, 41, first visit: lost by line four of the cover (haftarah, Rosh Chodesh, Megillah, Deuteronomistic, Masoretic); never decodes the shapes; thinks "Saul's concession" is a commentator; would love "Names and places" if he knew it existed.
- The rabbi: "look at the Rashi on verse 30" fails on page 3; two notes keyed "p"; no legend when a student asks what the triangle is; the last page offers nothing about next week.

## Minor observations

- Hebrew first baseline sits about 3px below the English on every row.
- Single-word last lines with the sof pasuq on about a dozen Hebrew verses; English runts ("stone.", "a mark,").
- Qere/ketiv brackets and the mid-verse pisqa gap (Samuel 20:27) are unexplained.
- Footnote key "j" in Isaiah 42:21 precedes its first word.
- Pagination differed between the build's Chrome and Playwright's Chromium (8 vs 9 pages for Isaiah): the build browser must be pinned and the test suite must run on it.
- DESIGN.md still records rubric #6e1e2b, a 66pt incipit, the photocopy rule and discussion questions.

## Questions the reviewers left on the table

- Is the apparatus really an apparatus, or is it the reading? If the class reads commentary aloud, should it be nearer the text size?
- What if the margin belonged to the rabbi alone, with JPS footnotes folded under the English column?
- What does the last page owe the group? A "Next week" line in the rabbi's voice would end the sheet the way the cover opens it.
