---
target: the haftarah study sheet (template/sheet.html)
total_score: 22
max_score: 28
na_heuristics: 3,5,9
p0_count: 1
p1_count: 2
target_identity: "file:C:\\Users\\dsbog\\haftarah\\template\\sheet.html"
target_fingerprint: "sha256:f7a6319a819d02d238523ca6adcc5fede36877789e11289c5b4b7fef825aa729"
target_path: "C:\\Users\\dsbog\\haftarah\\template\\sheet.html"
timestamp: 2026-10-08T02-11-17Z
slug: template-sheet-html
---
Method: dual-agent (A: design review · B: detector + browser)

# Critique: Torah from Scratch haftarah sheet (template/sheet.html)

Context fixed by Daniel during this run: the Siona Benjamin floor mural is CRC's brand going forward; every copy is printed in color; the divine name becomes יי; discussion questions are gone; cover note replaces the context box; no page target.

## Design Health Score (applicable max 28; 3, 5, 9 n/a: a printed sheet has no input, undo, or recovery)

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of system status | 3 | Running head + folio locate the reader; no "of 6" |
| 2 | Match system / real world | 4 | BHS and Mikraot Gedolot conventions the room knows |
| 3 | User control and freedom | n/a | print |
| 4 | Consistency and standards | 4 | Frame identical page to page |
| 5 | Error prevention | n/a | print |
| 6 | Recognition rather than recall | 2 | Sigla legend is on p.6; the reader meets sigla on p.2 |
| 7 | Flexibility and efficiency | 3 | Glosses give a fast layer; text column never signals that a verse has apparatus |
| 8 | Aesthetic and minimalist | 4 | Nothing spare |
| 9 | Error recovery | n/a | print |
| 10 | Help and documentation | 2 | No legend near first use; "(cont.)" is the only wayfinding |
| **Total** | | **22/28** | **Strong** |

## Design specificity verdict

LLM assessment: a well-authored critical edition that belongs to no one in particular. Swap the logo and any Reform synagogue could ship pages 2 to 6 unchanged. Generic: the Literata + Ezra SIL + oxblood pairing (the current default "serious Jewish text" look); the cover composition (small logo top-left, large right-aligned incipit, right-aligned metadata, rule, two prose columns); the series never named ("Torah from Scratch" appears on zero pages; the cover head says only "Haftarah"); the colophon written as a changelog; the footer issuer in title case on every page. Already carrying identity: the three-register apparatus with sigla (a Reform table holding Rashi, Steinsaltz and McCarter as equals is this class's idea), the circellus-keyed margin glosses, the incipit as the one display moment, the honest provenance line.

Deterministic scan: `impeccable detect` exit 0, 2 advisories, both `design-system-color` for the screen-only desk gray (#c9ccd1 under @media screen), never printed. Browser detector in the live page: 89 findings, all explained: 81 tiny-text (8.5 to 8.8pt notes and 7.9pt citation tails measured against 12 to 16px screen floors), 4 text-overflow (wrapped inline spans; nothing spills in the render), 4 undersized-ui-text (italic book titles in citations). None is a defect on paper; the 7.9pt tails are the one size worth a look for older eyes.

ui-ux-pro-max was consulted; its design-system output targets web products (indigo/orange SaaS palette, Google Fonts pairings, hover and focus rules) and nothing in it applies to a typeset print piece. Nothing adopted.

## Overall impression

The text pages are the real thing: the apparatus writing, the Masoretic spacing, one rubric spent exactly as the rule says. The cover is the weakest page and the only one a reader sees first. With the mural confirmed as the brand and color confirmed for every copy, the single biggest opportunity is a cover that is mostly mural, with the series named on it.

## What's working

- The apparatus entries, especially the titled critical ones ("The new-moon feast", "A damaged verse"), read better than most published study Bibles.
- Setumah, petuchah and mid-verse pisqa are honored as space; almost no congregational sheet does this.
- One rubric, no leak into scripture; register by shape, which stays right even in color.

## Priority issues

- **[P0] The mural at 0.5in is a coin.** Unreadable in color, a gray washer if copied. Why: the brand is present but invisible, and the cover's top third is empty around it. Fix: full-color disc at about 2.6in on the cover as the main event, with the incipit beside or below it; plus a one-color line extraction of the mural's ring structure (four concentric rules, twelve divisions, no figures) drawn once as SVG, used small (7 to 10pt) at the outer end of the running-head rule and in the end page. Command: /impeccable typeset (cover) after a shape pass.
- **[P1] The series is unnamed.** Fix: "Torah from Scratch" as the cover masthead (with a Hebrew counterpart if Daniel wants one), in the verso running head, and an issue line "5787 · No. 3" in the reading line. Check the Drive brand kit for the wordmark before inventing one.
- **[P1] Colophon voice.** "About this sheet" reads as software. Fix: two first-person sentences signed by the editor, then the legal provenance (Masorah, JPS) as a second paragraph.
- **[P2] Legend placement.** Sigla key lives on p.6. Fix: one line at the foot of the cover note, three sigla and three words.
- **[P2] Footer wordmark.** Title-case full name every page. Fix: lowercase "central reform congregation" per the website; tagline "A Jewish Presence in the City of St. Louis" on the cover only.

## Persona red flags

- Long-time Hebrew reader: all apparatus lemmas are English, even when Rashi or Radak comment on a Hebrew word. Wants the Hebrew lemma first.
- Newcomer with no Hebrew: meets circellus glosses with Hebrew lemmas on p.2; transliteration appears only sometimes ("nifkadta"). Make it consistent.
- Older reader under fluorescent light: 8.5pt gray (#4a4a4a) glosses in a 1.22in column sit on the floor. Set glosses in full ink; keep gray for tails only. Tails at 7.9pt are below the stated 8.5pt floor.
- Daniel printing 25 copies: six pages is three sheets, fine. The "Final" banner on this build says 15 approved entries while two are still proposed; the final build must refuse, not warn.

## Minor observations

- Cover head right says "Haftarah"; once a masthead exists this slot should carry the issue number.
- p.6 is more than half empty; with the opening note merged the glossary may fit on p.5.
- Hebrew date on the cover is set larger than the civil date beside it.
- Two "p" footnote keys on p.4 (JPS's own lettering) look like an error.
- The Isaiah draft uses the diamond "reference" register, which DESIGN.md says is not approved.
- With color on every copy, the Photocopy Rule should be rewritten as a preference (shape over hue) rather than a constraint.

## Questions to consider

1. Should the cover be mostly mural, with the incipit set over or beside it, and almost nothing else?
2. Is the binder the real product? "5787 · No. 3" makes every sheet part of a run people keep.
3. Hebrew lemmas in the apparatus with English in parentheses: more CRC, or less welcoming?
4. The one rubric: oxblood is BHS's lineage; the mural's red is the room's. Which does this publication claim?
5. Does the sheet want a last word each week ("next week: ...") so it ends on an invitation rather than a colophon?
