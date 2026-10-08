---
name: Haftarah Sheet
description: A weekly letter-size critical edition of the haftarah for Central Reform Congregation, printed in color under the Siona Benjamin mural.
colors:
  paper: "#ffffff"
  ink: "#000000"
  ink-2: "#595959"
  frame: "#4d4d4d"
  rubric: "#8a0a14"
  reg-traditional: "#8a0a14"
  reg-modern: "#1d4f9c"
  reg-critical: "#0b6a62"
  reg-reference: "#8a5a00"
  legend-unused: "#a6a6a6"
typography:
  incipit:
    fontFamily: "Ezra SIL, Noto Serif Hebrew, SBL Hebrew, serif"
    fontSize: "60pt (fit 40–54pt)"
    fontWeight: 400
    lineHeight: 1.2
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
    fontSize: "9.2pt"
    fontWeight: 400
    lineHeight: 1.36
  gloss:
    fontFamily: "Literata, Georgia, serif"
    fontSize: "9pt"
    fontWeight: 400
    lineHeight: 1.32
spacing:
  page-margin-top: "0.62in"
  page-margin-bottom: "0.62in"
  page-margin-inner: "0.6in"
  page-margin-outer: "0.75in"
  head-height: "0.26in"
  foot-height: "0.22in"
  body-offset: "14pt"
  hero-top: "1.35in"
  hero-mark: "1.6in"
  gloss-margin: "1.35in"
  gloss-clearance: "0.13in"
  verse-gutter: "0.34in"
  column-gap: "0.12in"
  apparatus-column-gap: "0.26in"
  prose-column-gap: "0.28in"
  verse-gap: "5.5pt"
  setumah: "15pt"
  petuchah: "24pt"
  pisqa-inline: "1.6em"
  poetry-indent: "1.1em"
  entry-gap: "5pt"
  rule-offset: "7pt"
components:
  running-head:
    textColor: "{colors.frame}"
    typography: "{typography.gloss}"
    height: "{spacing.head-height}"
    padding: "0 0 5pt"
  footer:
    textColor: "{colors.frame}"
    typography: "{typography.gloss}"
    height: "{spacing.foot-height}"
  folio:
    textColor: "{colors.ink}"
    typography: "{typography.gloss}"
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
  chapter-locator:
    textColor: "{colors.rubric}"
    typography: "{typography.gloss}"
  margin-note:
    textColor: "{colors.ink}"
    typography: "{typography.gloss}"
    width: "calc({spacing.gloss-margin} - {spacing.gloss-clearance})"
    padding: "0 0 0 9pt"
  apparatus-entry:
    textColor: "{colors.ink}"
    typography: "{typography.apparatus}"
    padding: "0 0 5pt"
  register-siglum:
    textColor: "{colors.reg-traditional} | {colors.reg-modern} | {colors.reg-critical} | {colors.reg-reference}"
    size: "6.5pt"
  source-name:
    textColor: "the entry's register color"
    typography: "{typography.apparatus}"
  reading-line:
    textColor: "{colors.rubric}"
    typography: "{typography.text}"
  opening-note:
    textColor: "{colors.ink}"
    typography: "{typography.text}"
    maxWidth: "5.4in"
  legend:
    textColor: "{colors.ink-2}"
    typography: "{typography.gloss}"
  voices:
    textColor: "{colors.ink-2}"
    typography: "{typography.gloss}"
  glossary:
    textColor: "{colors.ink}"
    typography: "{typography.apparatus}"
  next-week:
    textColor: "{colors.rubric}"
    typography: "{typography.text}"
  colophon:
    textColor: "{colors.ink-2}"
    typography: "{typography.gloss}"
---

# Design System: Haftarah Sheet

## Overview

**Creative North Star: "The Critical Edition"**

The weekly haftarah sheet is set as a critical edition of itself, in the lineage of the Biblia Hebraica Stuttgartensia. Scripture owns the column; every note is tied to a word or a verse by a small letter; all commentary lives in a ruled apparatus beneath the text. The page is white paper and black ink with one rubric, the ring red of the Siona Benjamin floor mural that is Central Reform Congregation's mark, spent only on sources and keys; the four commentary registers each take a color from the same mural. It refuses the stacked source-sheet (sources as a vertical list of labeled blocks) and the pew-Chumash commentary band.

The frame is the identity. Running head and hairline rule, verse gutter, gloss margin, and the apparatus rule across the foot are identical on every page and every week; only the words change. With the content removed the page is still recognizable. Density is that of a scholarly book, not a handout: four type sizes, two line-height regimes, and a strict spacing vocabulary taken from the Masoretic paragraph breaks.

Confirmed rejections observed in the build: no shadows, no radii, no motion, no color used for meaning, no fifth type size, no decorative rules or ornaments, no discussion questions. The only non-print chrome (gray desk, page shadow) is screen-review scaffolding and is not part of the design.

**Key Characteristics:**
- One ink, two greys, one rubric, four register colors from the mural; register carried by mark and color together
- Four type sizes: incipit 60pt nominal (fitted 40–54pt), text 10.5pt, apparatus 9.2pt, gloss 9pt
- Hairline rules (0.5pt black) as the only dividers
- Fixed letter-page frame, mirrored around a staple in the upper right corner
- A front page of context (mural, incipit, opening note, legend, voices) before the text begins on page 2
- Scripture in two aligned columns with a shared verse gutter and a keyed gloss margin
- Apparatus pinned to the foot of every text page in two balanced columns

## Colors

One ink, two greys, one rubric and four register colors. The rubric is the ring red of the Siona Benjamin floor mural, CRC's mark, and it is spent on keys and the frame's few accents: the reading line, chapter locators, margin keys, the voices' names. Each commentary register has its own color, drawn from the mural, on its siglum and its source name. Running heads and footers are dark grey. The sheet is designed for color and printed in color.

### Primary
- **Mural Rubric** (`rubric`, #8a0a14): sampled from the ring of the mural. Spent on the cover reading line (reference), chapter locators in the verse gutter, footnote and gloss keys in both languages, the names in the voices paragraph and the next-week line. It is also the classical register's color. It never enters the scripture column's words.
- **Register colors** (`reg-traditional` #8a0a14 the ring red; `reg-modern` #1d4f9c the lapis of the outer band; `reg-critical` #0b6a62 the turquoise band, darkened; `reg-reference` #8a5a00 the ochre centre, darkened): one per register, on the siglum and the source name in the apparatus and on the legend's sigla (front page and footer). Each holds at least 5.9:1 against paper, so a 9pt source name stays legible on an inkjet. Shape still carries the register on a photocopy.

### Neutral
- **Paper** (`paper`): the page.
- **Ink** (`ink`): scripture in both languages, verse numbers, headings, apparatus bodies, margin notes, the folio, the wordmark. Also the rule color.
- **Secondary Ink** (`ink-2`, #595959): apparatus tails, the "]" bracket after a lemma, the verse number inside a margin note, the "JPS" tail, the legend, the voices paragraph, provenance, colophon, the ketiv in Hebrew, the dates in the reading line, the tagline. 65% black; it survives an office laser.
- **Frame Grey** (`frame`, #4d4d4d): running heads and footers only, so the frame recedes behind the text and the red is left for meaning.
- **Legend Grey** (`legend-unused`, #a6a6a6): the sigla in the front-page legend that are not used this week.

### Named Rules
**The Mural Palette Rule.** Every color comes from the mural: the rubric for keys and accents, four register colors for the commentary voices. None is spent on the text itself. If a surface needs a color the mural does not have, it has left the world.

**The Red Rule.** Red means a source or a key. If a red mark is neither, it is noise; take it out.

**The Color Preference.** Shape carries register, letters carry keys, position carries hierarchy; color is never the only signal. But the sheet is designed for color: the mural, the rubric and the greys are chosen for an inkjet, not a photocopier.

## Typography

**Display Font:** Ezra SIL (with Noto Serif Hebrew, SBL Hebrew) for all Hebrew, from the incipit down to inline lemmas
**Body Font:** Literata variable, optical sizing on (with Georgia) for all English
**Label/Mono Font:** none; labels are Literata at gloss size

**Character:** The BHS Hebrew face carrying full te'amim, paired with a book serif whose optical sizes keep the small apparatus open. Italics mark lemmas, keys and attributions; weight marks structure (600 for headings, verse numbers, glossary terms, the reading-line reference; 700 for apparatus verse numbers; 500 for source names and voices).

### Hierarchy
- **Incipit** (400, 60pt nominal, 1.2): the front page's Hebrew first words, right-aligned beside the mural. The renderer measures the words and fits them to a 3.5in box: one line between 40 and 54pt, otherwise two lines at 44pt (scaled down with the mural so the two stay level). The one display moment.
- **Text** (400, 10.5pt, 1.42 English / 1.62 Hebrew): scripture in both languages; Hebrew runs at 1.18x the English size so x-heights match and the te'amim have air. Poetry: one block per JPS line with a 1.1em hanging indent (JPS's own indented lines sit one step further in). Also headings (600), the reading line, the opening note, the next-week line and the English rendering of the incipit (italic).
- **Apparatus** (400, 9.2pt, 1.36): commentary entries and the glossary.
- **Gloss** (400, 9pt, 1.32 margin / 1.4 front page / 1.0 frame): margin notes, apparatus tails, running head, folio, legend, voices, provenance, colophon, chapter locators. This is the floor for an older reading group; nothing prints smaller.

Figures are oldstyle proportional by default. Lining figures are used where numbers align or sit alone: the verse gutter (lining tabular), the running head, the footer, the reading line, apparatus verse numbers and page pointers. Hebrew inside English runs (lemmas, glossary terms) is set at 1.1x to 1.12x the surrounding size.

### Named Rules
**The Four Sizes Rule.** Incipit, text, apparatus, gloss. Nothing is set at a fifth size; sub-elements (footnote keys, ketiv, the verse number inside a margin note) scale by em within their parent rather than claiming a size of their own.

**The Italic Is a Key Rule.** Italic means "this is being quoted, keyed or attributed": lemmas, margin keys, apparatus tails, drafted titles, page pointers, the English rendering of the incipit, the signature, and the running head's Shabbat name. It is not used for emphasis in body prose beyond what the source text carries.

## Layout

Letter portrait (8.5 x 11in), `@page` margin 0 with the frame drawn by the template. Page margins: 0.62in top and bottom, 0.6in inner (the staple side), 0.75in outer (where thumbs go). The running head is a 0.26in block (gloss size, frame grey, baseline-aligned, 5pt bottom padding) closed by a 0.5pt black rule; the page body starts 14pt below it. The footer is a 0.22in block sitting inside the bottom margin.

**Binding.** Stapled upper right, duplex. On a recto the staple corner is top right and the inner margin (0.6in) is on the right; on a verso the mirror. The verse range in the running head and the folio sit in the corner away from the staple. The gloss column stays on the right of every page.

**Front page.** Page 1 is context, not text. The hero sits with its top 1.35in from the trim whatever the incipit does: the mural (1.6in square) on the left, and on the right the fitted incipit, its italic English rendering 10pt below, and the reading line 14pt below that (reference in rubric at weight 600, the Shabbat name in ink, the civil and Hebrew dates in secondary grey). The opening note follows 16pt down at text size in a 5.4in measure: the calendar reason first, then the historical setting opened by a hairline rule. Then the legend (every siglum in its register color with its plain name, unused ones in legend grey, and a line explaining the letter keys), the voices (one running paragraph: each source named this week in rubric with a one-line identification), and the provenance pushed to the foot with `margin-top: auto` and a 0.12in margin below. The footer carries the folio and the wordmark block (lowercase "central reform congregation" at text size with the tagline beneath at gloss size). When the opening note is long enough that the voices would push the provenance off the page, the voices move to the end matter and the front page keeps the rest.

**Text pages.** A four-track grid: English column `1fr`, verse gutter 0.34in, Hebrew column `1fr`, gloss margin 1.35in (of which 0.13in is clearance), with a 0.12in column gap. Each verse is a subgrid row; rows are separated by 5.5pt. Masoretic paragraph breaks become vertical space (setumah 15pt, petuchah 24pt); a mid-verse pisqa is a 1.6em inline gap in the Hebrew. A chapter locator ("42:7") in rubric at gloss size sits above the verse number on the first row of every page and wherever the chapter changes. Margin notes are absolutely positioned to their verse's top and pushed down on collision; notes that will not fit beside their verse carry to the next page's margin, keyed by letter and verse number. The footer carries the folio away from the staple and a micro-legend of the sigla used that week toward it.

**Pagination.** The renderer measures every verse row, margin note and apparatus entry off-screen and fills pages by these rules: a verse's entries print on the verse's page when they fit; an entry whose verse is on an earlier page is labelled with that page ("30 · p. 3"), never "(cont.)"; a verse never sits alone on a page; a short verse whose entries all spill moves to the next page with them only when that leaves no more than half an inch of white, otherwise it stays and its entries follow under a pointer; a verse that would leave more than half an inch of white above the apparatus rule is split across pages at a line boundary in both languages (two lines minimum on the head), so the band that remains is never taller than a two-line verse; margin notes fill the margin beside their verses in key order and any that do not fit carry to the next page's margin, each displaced note showing its verse number. Nothing keyed is ever dropped: if notes are still waiting after the last verse they get a page of their own margin, and `check.mjs` refuses a sheet whose printed notes do not match the keys assigned.

**Apparatus.** Absolutely positioned at the foot of the page body, above the footer, opening with a 0.5pt rule and 7pt of padding, two balanced columns with a 0.26in gap. Entries are 5pt apart and may break across columns (orphans and widows 2). The page's apparatus holds only the entries placed on that page.

**End matter.** Section headings at text size, weight 600, each opened by a hairline rule. Glossary runs in two columns with a 0.28in gap at apparatus size; prose blocks are capped at 5.6in. No section prints empty; the colophon never stands alone on a page (it goes above the last apparatus with whatever else fits, or on one page with the glossary and voices); the next-week line is last.

There is no responsive behavior; the artifact is a fixed page. A screen view only centers pages on a gray desk for review.

## Elevation & Depth

None. The sheet is a flat printed page; depth is conveyed by rules, weight, and size alone. The two shadows in the stylesheet (`0 2px 2px rgba(0,0,0,.08), 0 14px 32px rgba(20,10,12,.18)` under each page on the gray review desk) exist only in `@media screen` to show page edges during review and are not part of the design; `data-single` mode removes them.

### Named Rules
**The Flat Page Rule.** No shadows, no tonal layering, no backgrounds other than paper.

## Shapes

No radii anywhere. The only drawn geometry is the 0.5pt black hairline (head rule, apparatus rule, end-matter section rules, the rule inside the opening note) and the four register sigla, drawn as inline SVG in a 10-unit viewbox: a filled square, a filled circle, a filled triangle and a filled diamond, all at one weight and one size (6.5pt in the apparatus, 7pt in the legend, 6pt in the footer micro-legend). The mural is the only image.

## Components

### Running Head and Footer
- **Running head:** full-measure flex row, gloss size, frame grey, letter-spacing 0.01em; Shabbat name in italic toward the staple, verse range in lining figures away from it; hairline rule beneath. On the front page: the series name ("Torah from Scratch", italic) toward the staple and "Haftarah · 5787 · No. 3" away from it.
- **Footer:** gloss size, lining figures, frame grey; folio in ink away from the staple. Text pages carry the micro-legend toward the staple; the front page carries the wordmark block.

### Verse Row
- **English cell:** text size, 1.42, left-aligned, hyphenated, pretty-wrapped. Poetry lines are blocks with a 1.1em hanging indent. Footnote and gloss keys as italic superscript letters at 0.72em, kept with their word and any punctuation after it.
- **Verse gutter:** centered, weight 600, lining tabular figures, ink; the chapter locator above the verse number in rubric at gloss size (weight 400) on each page's first row and at every chapter change.
- **Hebrew cell:** Ezra SIL at 1.18x text size, 1.62, RTL isolated. The divine name is set as יי with the verse's cantillation kept. The ketiv is set at 0.72em in secondary grey beside the qere; a mid-verse pisqa is a 1.6em gap. A gloss key is a small italic rubric letter after its word.

### Margin Note
- **Shape:** the gloss margin less its clearance (1.22in), gloss size, 1.32, ink, hanging indent 9pt.
- **Grammar:** the key letter in rubric italic; for a gloss, the verse number in secondary grey at 0.9em; the lemma in italic (Hebrew lemmas upright in Ezra SIL at 1.12em); a grey "]"; the note; and for a JPS note the tail "JPS" in secondary grey at 0.85em with 0.04em tracking.
- **Behavior:** anchored to its verse's top edge and stacked downward on collision; as many as fit stay beside the verse and the rest carry to the next page's margin, where every displaced note (JPS or gloss) shows its verse number.

### Apparatus Entry
- **Order:** register siglum (6.5pt, register color), bold lining verse number, italic lemma (Hebrew lemmas upright in Ezra SIL at 1.1em) closed by a grey "]", source name in the register color at weight 500 (a drafted title for a critical or reference entry is italic at the same weight), body at apparatus size, then an italic grey tail at gloss size carrying the Sefaria reference or the cited work and any "translated for this sheet" label.
- **Pointer:** when the entry's verse sits on an earlier page the verse number is followed by " · p. N" in italic grey at gloss size. Nothing says "(cont.)".

### Register Sigla
Inline SVG in `currentColor` (the register's color), all filled, one weight, 3pt before the verse number. Square: classical commentators. Circle: modern commentators. Triangle: what historians say. Diamond: reference. The front-page legend names all four in those plain words and greys the ones unused that week; the text-page footer repeats only the ones used.

### Front Page
In order from the top: the hero with its top at 1.35in (mural 1.6in square, 0.4in gap, then the right-aligned RTL incipit block: fitted Hebrew incipit, italic English rendering 10pt below, reading line 14pt below with the reference in rubric at weight 600, the Shabbat name, and the civil and Hebrew dates in secondary grey); the opening note (text size, 5.4in measure, calendar paragraph then the setting under a hairline rule); the legend (gloss size, secondary grey, sigla in their register colors or legend grey, then the keys line); the voices (heading at gloss size weight 600, then one running paragraph with each name in rubric at weight 500 separated by rubric middots); the provenance at the foot (gloss size, secondary grey, the signature in italic ink). The footer carries the wordmark and tagline.

### Glossary
Two columns at apparatus size, 0.28in gap; each entry a hanging-indent paragraph (10pt) opening with the term at weight 600 and its Hebrew in Ezra SIL at 1.1em.

### Next Week
One line at text size in rubric at weight 500, 14pt below the last end-matter block: "Next week: Noach · Isaiah 54:1–55:5 · October 17, 2026". Omitted when `nextWeek` is null or rejected; Claude confirms the reading with Daniel when the calendar offers a choice.

### Colophon and Provenance
Gloss size in secondary grey, 1.45 and 1.4 leading respectively, max width 5.6in; the provenance names the Hebrew and English editions once, on the front page, and ends in the rabbi's signoff.

## Do's and Don'ts

### Do:
- **Do** spend the rubric only on keys and accents: the reading line, chapter locators, margin and footnote keys, the voices' names, the next-week line.
- **Do** mark register with a filled siglum (square, circle, triangle, diamond) in the register's color, and color the source name to match.
- **Do** keep every element at one of the four sizes (60pt fitted, 10.5pt, 9.2pt, 9pt), scaling sub-elements by em; nothing prints below 9pt.
- **Do** attribute every entry: source name in the register color, Sefaria reference or cited work in the tail, and a "translated for this sheet" label when the words are not the source's own.
- **Do** keep the frame identical across pages and weeks; only the words change.
- **Do** separate text from apparatus with a 0.5pt black hairline, never with a background.
- **Do** keep the gloss margin to the right of the Hebrew on every page.
- **Do** mirror the running head and folio around the staple, so the page number is always in the free corner.

### Don't:
- **Don't** put red on anything that is not a source or a key.
- **Don't** put the rubric inside the scripture columns' words; only keys and chapter locators may be rubric there.
- **Don't** add a fifth type size, a second typeface family for English, or a second color.
- **Don't** use shadows, radii, tints, or motion in the printed artifact; the screen desk is review scaffolding only.
- **Don't** leave a verse alone on a page or a heading without items.
- **Don't** write "(cont.)"; an entry carried past its verse's page says which page the verse is on.
- **Don't** stack sources as labeled blocks or run a commentary band beside the text; commentary lives in the foot apparatus or the keyed margin.
