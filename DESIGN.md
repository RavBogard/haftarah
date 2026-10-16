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
  map-land: "#f1efe9"
  map-sea: "#e3eaf4"
  map-water-line: "#1d4f9c"
  map-coast: "#8c8c8c"
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
  figure-map:
    textColor: "{colors.ink}"
    width: "2.6in"
    typography: "{typography.gloss}"
  figure-timeline:
    textColor: "{colors.ink}"
    width: "full measure"
    typography: "{typography.gloss}"
  figure-caption:
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
- A front page of context (mural, incipit, opening note, keys line, voices) before the text begins on page 2
- Scripture in two aligned columns with a shared verse gutter and a keyed gloss margin
- Apparatus pinned to the foot of every text page in two balanced columns

## Colors

One ink, two greys, one rubric and four register colors. The rubric is the ring red of the Siona Benjamin floor mural, CRC's mark, and it is spent on keys and the frame's few accents: the reading line, chapter locators, margin keys, the voices' names. Each commentary register has its own color, drawn from the mural, on its siglum and its source name. Running heads and footers are dark grey. The sheet is designed for color and printed in color.

### Primary
- **Mural Rubric** (`rubric`, #8a0a14): sampled from the ring of the mural. Spent on the cover reading line (reference), chapter locators in the verse gutter, footnote and gloss keys in both languages, the names in the voices paragraph and the next-week line. It is also the classical register's color. It never enters the scripture column's words.
- **Register colors** (`reg-traditional` #8a0a14 the ring red; `reg-modern` #1d4f9c the lapis of the outer band; `reg-critical` #0b6a62 the turquoise band, darkened; `reg-reference` #8a5a00 the ochre centre, darkened): one per register, on the siglum and the source name in the apparatus and on the footer legend's sigla. Each holds at least 5.9:1 against paper, so a 9pt source name stays legible on an inkjet. Shape still carries the register on a photocopy.

### Neutral
- **Paper** (`paper`): the page.
- **Ink** (`ink`): scripture in both languages, verse numbers, headings, apparatus bodies, margin notes, the folio, the wordmark. Also the rule color.
- **Secondary Ink** (`ink-2`, #595959): apparatus tails, the "]" bracket after a lemma, the verse number inside a margin note, the "JPS" tail, the legend, the voices paragraph, provenance, colophon, the ketiv in Hebrew, the dates in the reading line, the tagline. 65% black; it survives an office laser.
- **Frame Grey** (`frame`, #4d4d4d): running heads and footers only, so the frame recedes behind the text and the red is left for meaning.
- **Legend Grey** (`legend-unused`, #a6a6a6): the front page's keys line in a week with no margin keys.
- **Map tints** (`map-land` #f1efe9, `map-sea` #e3eaf4, `map-water-line` #1d4f9c the lapis, `map-coast` #8c8c8c): the figures' base only, kept pale so the places and bars read over them. They appear nowhere else.

### Named Rules
**The Mural Palette Rule.** Every color comes from the mural: the rubric for keys and accents, four register colors for the commentary voices. None is spent on the text itself. If a surface needs a color the mural does not have, it has left the world.

**The Red Rule.** Red means a source or a key. If a red mark is neither, it is noise; take it out.

**The Color Preference.** Shape carries register, letters carry keys, position carries hierarchy; color is never the only signal. But the sheet is designed for color: the mural, the rubric and the greys are chosen for an inkjet, not a photocopier.

### Chanter's copy
The one exception to the Mural Palette Rule and the Color Preference, in `sheet-trope.pdf` and only there: each trope phrase in the Hebrew column sits on a background in its family's color. The colors follow TropeTrainer's, so people who learned on it recognize them: zakef #fff176, etnachta #9ec5ff, sof pasuk #f59a9a, revia #ffc078 (also munach legarmeh), tevir #9be29b, segol #eaa0ea, kadma v'azla #ffd2d2, telisha ketana #ffb3c6, pazer #d3c1ff (also telisha gedola), zakef gadol #ffd9a3, end of the haftarah #66c2c2. The front-page legend gains one row, "Chanter's copy · trope phrases by family", listing only the families used that week. Nothing else on the sheet changes. The colors live in `template/trope.css` and apply only while `<html>` carries `data-trope`; the rendered study sheet carries the same phrase spans, unstyled. The study sheet keeps its rules: color is never the only signal, and nothing has a background but paper.

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

**Front page.** Page 1 is context, not text. The hero sits with its top 1.35in from the trim whatever the incipit does: the mural (1.6in square) on the left, and on the right the fitted incipit, its italic English rendering 10pt below, and the reading line 14pt below that (reference in rubric at weight 600, the Shabbat name in ink, the civil and Hebrew dates in secondary grey). The opening note follows 16pt down at text size in a 5.4in measure: the calendar reason first, then the historical setting opened by a hairline rule. Then the keys line (the letter keys explained, in legend grey when the week has none; the register sigla are not named on the front page since 2026-10-16, the text-page footers naming the ones used), the voices (one running paragraph: each source named this week in rubric with a one-line identification), and the provenance pushed to the foot with `margin-top: auto` and a 0.12in margin below. The footer carries the folio and the wordmark block (lowercase "central reform congregation" at text size with the tagline beneath at gloss size). When the opening note is long enough that the voices would push the provenance off the page, the voices move to the end matter and the front page keeps the rest.

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

No radii anywhere. The only drawn geometry is the 0.5pt black hairline (head rule, apparatus rule, end-matter section rules, the rule inside the opening note) and the four register sigla, drawn as inline SVG in a 10-unit viewbox: a filled square, a filled circle, a filled triangle and a filled diamond, all at one weight and one size (6.5pt in the apparatus, 6pt in the footer micro-legend). The mural is the only image.

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
Inline SVG in `currentColor` (the register's color), all filled, one weight, 3pt before the verse number. Square: classical commentators. Circle: modern commentators. Triangle: what historians say. Diamond: reference. The text-page footer names, in those plain words, the ones used that week; the front page does not name them (cut 2026-10-16), and on the web each siglum names its register on hover.

### Front Page
In order from the top: the hero with its top at 1.35in (mural 1.6in square, 0.4in gap, then the right-aligned RTL incipit block: fitted Hebrew incipit, italic English rendering 10pt below, reading line 14pt below with the reference in rubric at weight 600, the Shabbat name, and the civil and Hebrew dates in secondary grey); the opening note (text size, 5.4in measure, calendar paragraph then the setting under a hairline rule); the keys line (gloss size, secondary grey); the voices (heading at gloss size weight 600, then one running paragraph with each name in rubric at weight 500 separated by rubric middots); the provenance at the foot (gloss size, secondary grey, the signature in italic ink). The footer carries the wordmark and tagline.

### Glossary
Two columns at apparatus size, 0.28in gap; each entry a hanging-indent paragraph (10pt) opening with the term at weight 600 and its Hebrew in Ezra SIL at 1.1em.

### Next Week
One line at text size in rubric at weight 500, 14pt below the last end-matter block: "Next week: Noach · Isaiah 54:1–55:5 · October 17, 2026". Omitted when `nextWeek` is null or rejected; Claude confirms the reading with Daniel when the calendar offers a choice.

### Figures: Map and Timeline
The one addition to the printed page since 2.0 began, and only on a week that has places or dates. They sit on page 1 when it holds them (the map beside the setting, the timeline under the opening note), else at the top of the first text page above the verses; a sheet with neither is unchanged. Both are inline SVG from `lib.js`, set in the sheet's fonts, with labels no smaller than the 9pt floor; shape and weight carry meaning as well as color.
- **Map (`figure-map`):** 2.6in wide on page 1 and on page 2, in Literata at about 9.4pt, over the map tints with a hairline frame and a scale bar in whole kilometres. A scene place is a filled rubric dot with a bold rubric label; a context place an open dot with an ink-2 outline and an ink-2 label; an empire an italic ochre label (`reg-reference`) with no dot.
- **Timeline (`figure-timeline`):** the full measure, labels and ticks about 9.3pt, one lane each for event, king, prophet, empire and composition. Bars take a register color (king ink, prophet lapis, empire ochre, composition turquoise), an event is a rubric mark, and an approximate date is a dashed, paler bar or an open mark. A label that does not fit goes inside the bar, beside it, plain or cut with an ellipsis.
- **Caption (`figure-caption`):** gloss size, ink-2, directly under the figure: "Places in this reading · coastlines modern, borders not drawn" and "Dates BCE · c. marks a rounded date".

The colophon credits the map and the chronology on a sheet that carries them. On the web the same SVG sits beside the setting at 52rem and wider, stacks below it on a narrow screen, and the timeline scrolls sideways in a labelled region under 52rem; the tints take dark-mode values there.

### Colophon and Provenance
Gloss size in secondary grey, 1.45 and 1.4 leading respectively, max width 5.6in; the provenance is the rabbi's signoff; the editions are named once, in the colophon (off the front page since 2026-10-16).

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

## The web sheet (screen)

`site/web.css` carries the print design onto a screen; the printed rules above still govern the sheet, and the screen adds only what a screen needs. This section records what the stylesheet does.

### Dark theme
Dark follows the system setting unless the page is set to light, and the settings card can force either. Paper `#121110`, ink `#ebe6dc`, secondary ink and frame `#a8a195`, rubric `#e0616b`. The registers become classical `#e0616b`, modern `#86aaea`, historians `#5ec4b9`, reference `#d7b05c`; the unused-legend grey is `#5c5852`. The light theme keeps the print values.

### Text size
Five sizes set on the root: 15, 17, 19, 21 and 24px, with 17px the default. Every other size is in rem or em and follows.

### Type scale
English at 1rem with 1.5 leading; Hebrew at 1.18em with 1.75 leading. The apparatus is .9rem with 1.42 leading, and glosses and chrome (masthead, legend, voices, provenance, summaries) are .88rem. The incipit is Ezra SIL at clamp(2.6rem, 7vw, 4.4rem).

### Layout
From 1100px up the reading is a two-track grid: the verses on the left and a 22rem sticky rail of apparatus on the right, with a 3rem gap. Below 1100px it is one column: each verse shows its Hebrew above its English, and its apparatus sits under them in a `details` element that opens on the verse's count of entries. Below 640px the front page and glossary go to one column and the mural shrinks to 5.5rem. The masthead is 2.75rem and stays on screen; the page is at most 82rem wide.

### Panel
A source or a word opens in a panel that slides in from the right, 30rem wide (or the full width of a narrower screen), under the masthead and down to the bottom edge, with a hairline on its left edge. Under 640px it is a sheet from the bottom, full width and 86vh high, with a hairline on top. A closed panel leaves the tab order.

### Interaction
A hover is a `rgba(ink, .06)` wash (.08 white on dark). The active Hebrew word takes a .035 wash (.05 on dark) and a one-pixel rubric hairline underneath. Focus is a 2px ring in the modern blue `#1d4f9c`, or `#86aaea` on dark, offset 2px. Touch targets in the masthead are 2.75rem.

### Motion
Two motions: the panel slide, 220ms on a decelerating curve, and the smooth scroll that carries the rail to the current verse. Small state changes (word hover, the settings switch, the summary chevron) take .12 to .18s. Under reduced motion the panel appears without sliding and the rail jumps.

### Shadow
One shadow family, a soft drop with a faint contact line, for the panels, the settings card and the note popovers. Nothing else on the page has one.

### Trope colors
The trope backgrounds are light pastels and keep their light values on the dark theme; the words on them turn dark (`#111`) so they stay readable.

### Presenter view
`?present` covers the page with one verse at a time for a shared screen, in a fixed light palette whatever the theme (paper #ffffff, ink #000000, rubric #8a0a14, the light register colors). The verse label in rubric and "3 / 22" in ink-2 sit at the top at 1.6vh + .6rem. Hebrew in Ezra SIL at clamp(1.6rem, 7vh, 5.5rem) with 1.6 leading; English at clamp(1.2rem, 4.2vh, 3.2rem) with 1.4; the verse's commentary under a 1px rule at clamp(1rem, 2.6vh, 2rem). A long verse shrinks all three together, to half size at most, rather than scroll; − and + scale them by a tenth between .6 and 2. Previous, Next and Exit are 44px outlined buttons at the bottom right. B is a black screen. Trope colors start off. Nothing moves.

### Verse links and highlights
A verse reached by its link takes the wash and a 1px rubric outline. A teacher highlight is a 3px rubric bar inside the verse's left edge, a tint on its words (rgba(138,10,20,.10); dark rgba(224,97,107,.18)) and its note in the apparatus behind a 2px rubric rule. The verse header's "Copy link" and "Copy verse" are set like "on Sefaria": ink-2 italic at .85em, rubric on hover.

### Show
Hebrew, Both or English. One language alone turns the wide row into two tracks, the verse number (2.8rem) then the text; English alone keeps a 42em measure.

### No inline styles
The Content-Security-Policy forbids style attributes, so every style lives in web.css; a script that positions something (the note popover, the presenter's fit) uses the CSSOM, which the policy allows.

### The library
The landing's index has four doors, pill buttons 44px high in a row (ink-2 outline; the open one filled ink on paper): By week, By parashah, By book, Special Shabbatot. By week is the list as before; a week with a Torah reading sets its two refs on two lines, Torah first. By parashah is five bands, one per book of the Torah, each a grid of cells at least 8.5rem wide: the English name, the Hebrew under it in Ezra SIL ink-2, and a 6px rubric dot per year held. An empty cell is the same box in the unused grey, not a link. This week's cell has a 1.5px rubric ring inside its edge and says "this week" to a screen reader; the dots' years are read out as words. By book is two columns, the Torah books and the haftarah books with the chapters covered in ink-2 lining figures; Special Shabbatot is a list. Each row's count reads "3 sheets". The short addresses (/noach, /torah/genesis, …) use the same rows under a plain heading.

### Two readings
A week with a Torah selection shows it first. Each reading opens with a heading in rubric at 1.05rem, 600: "Torah" or "Haftarah", then its ref in ink at 500 and its selection in ink-2 italic; a .5px rule above every heading but the first. Verse rows, keys (one letter series per reading), the rail and the presenter run on through both. The hero lists both refs on two lines ("Torah · Genesis 6:9–7:16", "Haftarah · Isaiah 54:1–55:5") and both printed sheets; "Last time: the 5786 sheet" sits under them in ink-2, rubric on hover, when there is one.

### The word panel
A tapped Hebrew word opens in the panel: the word in Ezra SIL at 2rem, then a plain-English sentence at 1.05rem ("A verb, narrative past: ‘he said’. Simple action (Qal).") with the Hebrew grammatical term in parentheses after the plain words, never before them. Prefixes and suffixes are chips (a .5px frame, the Hebrew piece then its English). The grammatical detail line is ink-2 at .88rem with "Show the code" folded after it. "This word here" lists each occurrence of the dictionary word in the reading as a rubric link to its verse; the whole-Tanakh count follows, then "Search this word on STEPBible" and "Bible Hub" set like "Open on Sefaria". The BDB entry from Sefaria sits last, folded under "Dictionary (BDB)". A word with no analysis shows "No word analysis for this word." and the dictionary entry unfolded.

### The Translation row
In the Aa card, under Show: a segmented control like Show's, "JPS 2023" first, then the editions the week offers. With another edition on, each verse's English column shows that edition's text (its own footnotes removed; the sheet's keyed letters belong to JPS and are not placed in it), a line in ink-2 italic at .88rem above the text says "Notes and glosses refer to the JPS translation.", and the footer gains that edition's credit on its own line. The rail, the notes and the Hebrew do not change. Copy verse and the presenter show the edition on screen.

### Everything on this verse
A fourth control in the verse header, in rubric, opens Sefaria's related texts in the panel. The panel is visibly not the sheet: its body sits on `--panel-alt` (#f6f4ef; dark #1b1a18) and an inverted banner (ink on paper's colours) "From Sefaria, not edited by CRC" heads it. Categories are collapsed `details` rows with a count, in the spec's order with Quoting Commentary last; inside, each work's name at 500 with its items as rubric links, and "on this sheet" in ink-2 italic after a work the sheet already cites. Texts with no English are hidden until "Show texts with no English" is checked. A tapped item replaces the list with that text, still on the alt background, with "← Everything on <ref>" to come back.

### The update note
When a new build is waiting, a strip sits under the masthead (the `.strip` class, shared with the shared-marks strip): "This site has been updated. The new version opens the next time you launch it." and a rubric Dismiss, a 44px target. It is on `--paper` inside a .5px `--rule` frame like the settings card, with no shadow, at .95rem with .6rem and .9rem of padding; it is a status region, never a dialog, and it takes no focus when it appears; when Dismiss puts it away with focus on it, focus goes to the Aa button (Not now on the install card does the same, and Add to my marks on the shared-marks strip moves it to the first added verse's number). It never shows on a first install and never on the shared screen (`html[data-present]` hides it).

### The install card
In iPad and iPhone Safari, outside the installed app, a card under the hero on the week page and the landing: a title at 1rem, 600 ("Keep these sheets on this iPad", or "iPhone"), a numbered list of two steps ("Tap Share (the square with an arrow)." and "Tap Add to Home Screen."), a note in ink-2 at .95rem ("Sheets you open from the Home Screen stay readable without a connection, and marks made there are kept.") and a rubric Not now, 44px, which dismisses it for good. On `--paper` in a .5px `--rule` frame, 38em at most, no shadow; hidden in the presenter.

### My marks
A reader's own mark is the reference ochre (`--reg-reference`: print `#8a5a00`, dark `#d7b05c`): a 3px bar inside the row's right edge and a 2px underline under the verse number, so colour is never the only signal; the teacher's highlight stays a bar on the left in rubric, and a verse with both shows both. The verse number's name to a screen reader ends " Marked." The header's Mark this verse reads Unmark once the verse is marked: the label alone carries the state, with no aria-pressed. A press and hold on the number marks it. A mark shared in a link is a 1px dashed `--ink-2` outline on the row, offered by a strip ("3 marked verses shared with you." and Add to my marks) until the reader adds or dismisses it. My marks, in the Aa card and the side panel, is a list: each verse's reference as a rubric link, its English in ink-2 under it, a Remove button, then "Copy link to my marks" and "Copy my marks as text"; empty, it says "No marks yet. Press and hold a verse number, or use Mark this verse in its header. Marks stay on this device."

### The Torah sheet in print
`sheet-torah.pdf` is the same template as the haftarah's, page for page. Two differences are set by the build option `reading: "torah"`: the front page's head reads "Torah · <date>", and the last verse ends on a plain sof pasuk, not the haftarah's closing cadence (this shows only when trope colors are on). The running heads give the Torah book and range because they follow from the Torah reading's own book and ref, not from the option.
