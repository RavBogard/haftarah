---
name: Haftarah Sheet
description: A weekly letter-size critical edition of the haftarah, printed in one ink and one rubric.
colors:
  paper: "#ffffff"
  ink: "#000000"
  ink-2: "#4a4a4a"
  rubric: "#6e1e2b"
  proposed-tint: "#f3eced"
typography:
  incipit:
    fontFamily: "Ezra SIL, Noto Serif Hebrew, SBL Hebrew, serif"
    fontSize: "66pt"
    fontWeight: 400
    lineHeight: 1.25
    letterSpacing: "0"
  text:
    fontFamily: "Literata, Georgia, serif"
    fontSize: "10.5pt"
    fontWeight: 400
    lineHeight: 1.42
    fontFeature: "oldstyle-nums proportional-nums"
    fontVariation: "opsz auto"
  text-hebrew:
    fontFamily: "Ezra SIL, Noto Serif Hebrew, SBL Hebrew, serif"
    fontSize: "calc(10.5pt * 1.18)"
    fontWeight: 400
    lineHeight: 1.62
  heading:
    fontFamily: "Literata, Georgia, serif"
    fontSize: "10.5pt"
    fontWeight: 600
    lineHeight: 1.42
  apparatus:
    fontFamily: "Literata, Georgia, serif"
    fontSize: "8.8pt"
    fontWeight: 400
    lineHeight: 1.36
  gloss:
    fontFamily: "Literata, Georgia, serif"
    fontSize: "8.5pt"
    fontWeight: 400
    lineHeight: 1.32
spacing:
  page-margin-top: "0.62in"
  page-margin-bottom: "0.62in"
  page-margin-inner: "0.62in"
  page-margin-outer: "0.55in"
  head-height: "0.26in"
  foot-height: "0.22in"
  body-offset: "14pt"
  gloss-margin: "1.22in"
  verse-gutter: "0.34in"
  column-gap: "0.12in"
  apparatus-column-gap: "0.26in"
  prose-column-gap: "0.28in"
  verse-gap: "5.5pt"
  setumah: "15pt"
  petuchah: "24pt"
  pisqa-inline: "1.6em"
  entry-gap: "5pt"
  rule-offset: "7pt"
components:
  running-head:
    textColor: "{colors.rubric}"
    typography: "{typography.gloss}"
    height: "{spacing.head-height}"
    padding: "0 0 5pt"
  folio:
    textColor: "{colors.ink}"
    typography: "{typography.gloss}"
    height: "{spacing.foot-height}"
  draft-flag:
    backgroundColor: "{colors.rubric}"
    textColor: "{colors.paper}"
    typography: "{typography.gloss}"
    padding: "1pt 5pt 2pt"
  verse-english:
    textColor: "{colors.ink}"
    typography: "{typography.text}"
  verse-hebrew:
    textColor: "{colors.ink}"
    typography: "{typography.text-hebrew}"
  verse-number:
    textColor: "{colors.ink}"
    typography: "{typography.heading}"
    width: "{spacing.verse-gutter}"
  chapter-number:
    textColor: "{colors.rubric}"
    typography: "{typography.gloss}"
  sidenote:
    textColor: "{colors.ink-2}"
    typography: "{typography.gloss}"
    width: "{spacing.gloss-margin}"
    padding: "0 0 0 7pt"
  sidenote-proposed:
    backgroundColor: "{colors.proposed-tint}"
    textColor: "{colors.ink-2}"
    typography: "{typography.gloss}"
  apparatus-entry:
    textColor: "{colors.ink}"
    typography: "{typography.apparatus}"
    padding: "0 0 5pt"
  apparatus-entry-proposed:
    backgroundColor: "{colors.proposed-tint}"
    textColor: "{colors.ink}"
    typography: "{typography.apparatus}"
  register-siglum:
    textColor: "{colors.rubric}"
    size: "7pt"
  source-name:
    textColor: "{colors.rubric}"
    typography: "{typography.apparatus}"
  reading-line:
    textColor: "{colors.rubric}"
    typography: "{typography.text}"
  context-box:
    textColor: "{colors.ink}"
    typography: "{typography.apparatus}"
    padding: "8pt 0 0"
  glossary:
    textColor: "{colors.ink}"
    typography: "{typography.apparatus}"
  colophon:
    textColor: "{colors.ink-2}"
    typography: "{typography.gloss}"
---

# Design System: Haftarah Sheet

## Overview

**Creative North Star: "The Critical Edition"**

The weekly haftarah sheet is set as a critical edition of itself, in the lineage of the Biblia Hebraica Stuttgartensia. Scripture owns the column; every note is tied to a word or a verse by a small mark; all commentary lives in a ruled apparatus beneath the text. The page is white paper and black ink with one oxblood rubric spent only on the frame and the keys. It refuses the stacked source-sheet (sources as a vertical list of labeled blocks) and the pew-Chumash commentary band.

The frame is the identity. Running head and hairline rule, verse gutter, gloss margin, and the apparatus rule across the foot are identical on every page and every week; only the words change. With the content removed the page is still recognizable. Density is that of a scholarly book, not a handout: four type sizes, two line-height regimes, and a strict spacing vocabulary taken from the Masoretic paragraph breaks.

Confirmed rejections observed in the build: no shadows, no radii, no motion, no color used for meaning, no fifth type size, no decorative rules or ornaments. The only non-print chrome (gray desk, page shadow) is screen-review scaffolding and is not part of the design.

**Key Characteristics:**
- One ink, one rubric; register carried by mark, never by hue
- Four type sizes: incipit 66pt, text 10.5pt, apparatus 8.8pt, gloss 8.5pt
- Hairline rules (0.5pt black) as the only dividers
- Fixed letter-page frame, mirrored margins on verso
- Scripture in two aligned columns with a shared verse gutter and a keyed gloss margin
- Apparatus pinned to the foot of every text page in two balanced columns

## Colors

A photocopy-safe palette: paper, ink, a secondary gray, and a single oxblood rubric reserved for the frame and the keys.

### Primary
- **Oxblood Rubric** (`rubric`): the only color. Spent on running heads, the draft flag ground, register sigla, source names in the apparatus, chapter numbers in the verse gutter, footnote keys and circelli, the discussion-question markers, and the cover reading line (reference, Shabbat name). It never enters the scripture column's words.

### Neutral
- **Paper** (`paper`): the page. Also the draft flag's text.
- **Ink** (`ink`): scripture in both languages, verse numbers, headings, apparatus bodies, lemmas inside sidenotes, the folio. Also the rule color.
- **Secondary Ink** (`ink-2`): the gray of margin glosses, apparatus tails, the footer's issuer line, dates, provenance, colophon, the ketiv in Hebrew, and the "]" bracket after a lemma.
- **Proposed Tint** (`proposed-tint`): a faint rubric-tinted ground behind unapproved sidenotes and apparatus entries. Draft mode only; it never prints in a final sheet.

### Named Rules
**The One Rubric Rule.** One color, spent on the frame and the keys, never on the text itself. If a surface needs a second color it has left the world.

**The Photocopy Rule.** Color never carries meaning alone. Register is a mark (square, circle, triangle), proposal state is a tint plus a bold "proposed" prefix, keys are letters and circelli. Every distinction survives a black-and-white copy.

## Typography

**Display Font:** Ezra SIL (with Noto Serif Hebrew, SBL Hebrew) for all Hebrew, from the incipit down to inline lemmas
**Body Font:** Literata variable, optical sizing on (with Georgia) for all English
**Label/Mono Font:** none; labels are Literata at gloss size

**Character:** The BHS Hebrew face carrying full te'amim, paired with a book serif whose optical sizes keep the small apparatus open. Italics mark lemmas and attributions; weight marks structure (600 for headings, verse numbers, glossary terms; 700 for apparatus verse numbers; 500 for source names).

### Hierarchy
- **Incipit** (400, 66pt, 1.25): the cover's Hebrew first words, right-aligned, balanced wrap. The one display moment.
- **Text** (400, 10.5pt, 1.42 English / 1.62 Hebrew): scripture in both languages; Hebrew runs at 1.18x the English size so x-heights match and the te'amim have air. Also headings (600), the cover's reading line, the "why this haftarah" paragraph, discussion questions, and the English incipit rendering (italic).
- **Apparatus** (400, 8.8pt, 1.36): commentary entries, the context box, and the glossary.
- **Gloss** (400, 8.5pt, 1.32 margin / 1.0 frame): margin notes, running head, folio, provenance, colophon, chapter numbers. This is the floor for an older reading group.

Figures are oldstyle proportional by default. Lining figures are used where numbers align or sit alone: the verse gutter (lining tabular), the running head, the footer, the cover reading line, apparatus verse numbers, question markers. Hebrew inside English runs (lemmas, glossary terms) is set at 1.1x to 1.12x the surrounding size.

### Named Rules
**The Four Sizes Rule.** Incipit, text, apparatus, gloss. Nothing is set at a fifth size; sub-elements (footnote keys, circelli, ketiv) scale by em within their parent rather than claiming a size of their own.

**The Italic Is a Key Rule.** Italic means "this is being quoted or attributed": lemmas, sidenote keys, apparatus tails, the English rendering of the incipit, and the running head's left side. It is not used for emphasis in body prose beyond what the source text carries.

## Layout

Letter portrait (8.5 x 11in), `@page` margin 0 with the frame drawn by the template. Page margins: 0.62in top and bottom, 0.62in inner, 0.55in outer, mirrored on verso pages. The running head is a 0.26in block (gloss size, baseline-aligned, 5pt bottom padding) closed by a 0.5pt black rule; the page body starts 14pt below it. The footer is a 0.22in block sitting inside the bottom margin, folio on the outer edge in ink, the issuer's name on the inner edge in secondary gray.

**Cover.** A 0.5in issuer slot (the CRC logo when assets/logo.* exists; otherwise a typographic wordmark: the congregation name at text size, weight 600, with "Haftarah study sheet" beneath at gloss size), then the incipit block 1.0in down, right-aligned and RTL: Hebrew incipit, italic English rendering 12pt below, rubric reading line 20pt below that (reference at weight 600, Shabbat name, dates in gray with the Hebrew date in Ezra SIL). A "why this reading" paragraph (max width 5.1in) when the haftarah is special. The context box follows under a hairline rule; the provenance line is pushed to the foot with `margin-top: auto`. If the context box overflows the cover it moves to its own page.

**Text pages.** A four-track grid: English column `1fr`, verse gutter 0.34in, Hebrew column `1fr`, gloss margin 1.22in, with a 0.12in column gap. Each verse is a subgrid row; rows are separated by 5.5pt. Masoretic paragraph breaks become vertical space (setumah 15pt, petuchah 24pt); a mid-verse pisqa is a 1.6em inline gap in the Hebrew. The gloss margin is always to the right of the Hebrew, on both recto and verso, because glosses are keyed to Hebrew words: this is a recorded deviation from the contract's "outer margin". Sidenotes are absolutely positioned to their verse's top and pushed down on collision.

**Apparatus.** Absolutely positioned at the foot of the page body, above the footer, opening with a 0.5pt rule and 7pt of padding, two balanced columns with a 0.26in gap. Entries are 5pt apart, may break across columns (orphans and widows 2), and carry over to the next page with a "(cont.)" marker. The page's apparatus holds only the entries whose verses appear on that page.

**End matter.** Section headings at text size, weight 600, each opened by a hairline rule (the first omits it). Glossary and context box run in two columns with a 0.28in gap; prose blocks and discussion questions are capped at 5.6in.

There is no responsive behavior; the artifact is a fixed page. A screen view only centers pages on a gray desk for review.

## Elevation & Depth

None. The sheet is a flat printed page; depth is conveyed by rules, weight, and size alone. The two shadows in the stylesheet (`0 2px 2px rgba(0,0,0,.08), 0 14px 32px rgba(20,10,12,.18)` under each page on the gray review desk) exist only in `@media screen` to show page edges during review and are not part of the design; `data-single` mode removes them.

### Named Rules
**The Flat Page Rule.** No shadows, no tonal layering, no backgrounds other than paper. The proposed tint is a review mark, not a surface.

## Shapes

No radii anywhere. The only drawn geometry is the 0.5pt black hairline (head rule, apparatus rule, end-matter section rules, context-box rule) and the three register sigla, drawn as inline SVG in a 10-unit viewbox and set at 7pt square: a filled square, a 1.4-unit stroked open circle, and a 1.4-unit stroked triangle with rounded joins. A fourth, an open diamond, is drawn in the code for reference works but is not an approved register. The circellus (°) that keys a gloss to a Hebrew word is a raised glyph at 0.55em, set in Literata inside the Hebrew run.

## Components

### Running Head and Footer
- **Running head:** full-measure flex row, gloss size, rubric, letter-spacing 0.01em; left side italic (on the cover: the issuer when a logo renders, otherwise the Hebrew date so the name is said once; Shabbat name on text pages), right side lining figures (section title or verse range), hairline rule beneath.
- **Draft flag:** on draft renders only, "draft for review" set in paper on a rubric ground, 1pt 5pt 2pt padding, 10pt from the left text, upright.
- **Footer:** gloss size, lining figures; folio in ink at the outer edge, issuer's name in secondary gray at the inner edge.

### Verse Row
- **English cell:** text size, 1.42, left-aligned, hyphenated. Small caps for the divine name scaled to 0.78em with 0.06em tracking. JPS footnote keys as italic rubric superscripts at 0.62em.
- **Verse gutter:** centered, weight 600, lining tabular figures, ink; a chapter number appears above the verse number in rubric at gloss size (weight 400) when the chapter changes.
- **Hebrew cell:** Ezra SIL at 1.18x text size, 1.62, RTL isolated. The ketiv is set at 0.72em in secondary gray beside the qere; a mid-verse pisqa is a 1.6em gap. A rubric circellus follows a keyed word.

### Sidenote
- **Shape:** 1.22in wide, gloss size, 1.32, secondary gray, hanging indent 7pt.
- **Key:** a JPS footnote letter in rubric italic, or a rubric circellus (upright) when the gloss is keyed to a Hebrew word; the Hebrew lemma follows in ink at 1.12em.
- **Behavior:** anchored to its verse's top edge and stacked downward on collision.
- **Proposed (draft only):** proposed-tint ground with a 2pt outline of the same tint.

### Apparatus Entry
- **Order:** register siglum (7pt, rubric), bold lining verse number, italic lemma (Hebrew lemmas upright in Ezra SIL at 1.1em) closed by a gray "]", source name in rubric at weight 500, body at apparatus size, then an italic gray tail at 0.9em carrying the Sefaria reference and any "translated for this sheet" or "summary drafted for this sheet" label.
- **Continued:** when carried to a later page the verse number is followed by " (cont.)" in italic at weight 400.
- **Proposed (draft only):** proposed-tint ground with a 3pt outline; the tail is prefixed "proposed — " in bold upright rubric.

### Register Sigla
Inline SVG in `currentColor` (rubric), 7pt square, 3pt before the verse number. Filled square: traditional. Open circle: modern. Triangle: historical-critical. The diamond (reference works) is supported by the renderer but unused and not approved as a fourth register. A legend in the end matter names only the sigla actually used that week.

### Cover Incipit Block
Right-aligned RTL block 1.0in below the issuer slot: Hebrew incipit at 66pt, balanced wrap; italic English rendering at text size 12pt below; rubric reading line 20pt below with the reference at weight 600, the Shabbat name, and the civil and Hebrew dates in secondary gray.

### Context Box
Hairline rule above, 8pt padding, heading at text size weight 600 spanning both columns, body at apparatus size in two columns with a 0.28in gap, left-aligned and hyphenated. Moves to its own page if it would overflow the cover.

### Glossary
Two columns at apparatus size, 0.28in gap; each entry a hanging-indent paragraph (10pt) opening with the term at weight 600 and its Hebrew in Ezra SIL at 1.1em.

### Colophon and Provenance
Gloss size in secondary gray, 1.45 and 1.4 leading respectively, max width 5.6in; the provenance line names the Hebrew and English editions and the approving rabbi.

## Do's and Don'ts

### Do:
- **Do** spend the rubric only on the frame and the keys: running heads, sigla, source names, chapter numbers, footnote keys, the reading line.
- **Do** mark register with a siglum (filled square, open circle, triangle) and nothing else.
- **Do** keep every element at one of the four sizes (66pt, 10.5pt, 8.8pt, 8.5pt), scaling sub-elements by em.
- **Do** attribute every entry: source name in rubric, Sefaria reference in the tail, and a "translated" or "summary drafted" label when the words are not the source's own.
- **Do** keep the frame identical across pages and weeks; only the words change.
- **Do** separate text from apparatus with a 0.5pt black hairline, never with a background.
- **Do** keep the gloss margin to the right of the Hebrew on every page.

### Don't:
- **Don't** let color carry meaning alone; every distinction must survive a black-and-white photocopy.
- **Don't** put the rubric inside the scripture columns' words; only keys and chapter numbers may be rubric there.
- **Don't** add a fifth type size, a second typeface family for English, or a second color.
- **Don't** use shadows, radii, tints, or motion in the printed artifact; the screen desk is review scaffolding only.
- **Don't** print the proposed tint or the draft flag on a final sheet.
- **Don't** introduce the diamond siglum as a live register without an approved fourth register.
- **Don't** stack sources as labeled blocks or run a commentary band beside the text; commentary lives in the foot apparatus or the keyed margin.
