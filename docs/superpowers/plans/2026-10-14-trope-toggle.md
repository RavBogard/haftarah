# Trope highlights as a runtime toggle, ready for the web sheet

Daniel (2026-10-14): he will build a dynamic online version of each sheet at a dependable address
(e.g. haftarah.centralreform.org), not a copy of the PDF's formatting. He wants the trope
highlighting "ready as an option that can be toggled there", without worrying about integration.
So: the highlighting stops being a build-time-only mode and becomes something any sheet HTML can
switch on and off at runtime, with the pieces a web renderer needs factored out of the paginator.

## Global Constraints

- **The printed study sheet does not change.** `node scripts/build.mjs weeks/<slug>` without
  `--trope` still writes a byte-identical `sheet.html`, and its rendered layout is unchanged:
  the per-page table `scripts/check.mjs` prints (rows, gap, fill, split, etc.) must be identical
  before and after, and both checks pass. The `--trope` chanter's copy keeps its look exactly.
- **The toggle contract** (what the web version relies on): colors show only while `<html>` has
  the attribute `data-trope`. Set it and the Hebrew phrase blocks are colored and the trope legend
  row is visible; remove it and the page looks like the plain sheet. Nothing is rebuilt.
- **Reusable pieces** live in `template/lib.js` (DOM-free, UMD) and `template/trope.css`:
  - `tropeHtml(verseHtml, { final })` → the verse HTML with each phrase wrapped
    `<span class="tr tr-<family>">…</span>`, separators (family null) left bare, joined with one
    space. This is the exact wrapping render.js does today, moved into lib.
  - `tropeFamiliesUsed(verses)` → the Set of family keys a list of verses (`[{ he }]`, the
    haftarah's verses in order, last one `final`) uses. `&thinsp;`/U+2009 are treated as spaces
    first, as the renderer does.
  - `template/trope.css`: every trope rule, gated on the attribute: the `.he .tr` padding and
    `box-decoration-break`, the eleven `.tr-<family>` backgrounds (same hex values as today),
    the `.trope-legend` rules, and `html:not([data-trope]) .trope-legend { display: none; }`.
    `template/sheet.css` imports it as its first rule: `@import url("trope.css");` so the PDF
    build needs no HTML change.
- The URL parameter `?trope=1` (alongside the existing `?page=N`) sets `data-trope` at render,
  so a screenshot or a browser tab can show the colors on any sheet.
- Repo conventions: Node 18+, no dependencies, no `npm install`; `node --test` tests in `tests/`;
  short prose comments saying why; no questions to Daniel mid-plan, rulings go in the ledger.

## Task 1: lib + CSS + renderer: wrap always, color on toggle

Files: `template/lib.js`, `tests/lib.test.mjs`, `template/trope.css` (new), `template/sheet.css`,
`template/render.js`, `template/sheet.html` (only if needed), `scripts/build.mjs` (only if needed).

1. **lib.js.** Add `tropeHtml` and `tropeFamiliesUsed` as specified in Global Constraints, next
   to `tropePhrases`; export both. Tests first (TDD) in `tests/lib.test.mjs`:
   - `tropeHtml` on Isaiah 54:7 `בְּרֶ֥גַע קָטֹ֖ן עֲזַבְתִּ֑יךְ וּבְרַחֲמִ֥ים גְּדֹלִ֖ים אֲקַבְּצֵֽךְ׃` equals
     `<span class="tr tr-etnachta">בְּרֶ֥גַע קָטֹ֖ן עֲזַבְתִּ֑יךְ</span> <span class="tr tr-sof-pasuk">וּבְרַחֲמִ֥ים גְּדֹלִ֖ים אֲקַבְּצֵֽךְ׃</span>`,
     and with `{ final: true }` the last class is `tr-sof-haftarah`.
   - A separator stays bare: a verse with `<span class="pisqa"></span>` between two words of a
     block yields `…</span> <span class="pisqa"></span> <span class="tr tr-…">…`.
   - Stripping the tags from `tropeHtml(he)` gives the same text as stripping them from `he`,
     for every verse in both fixtures (`tests/fixtures/week-notes/sheet.json`,
     `tests/fixtures/week-min/sheet.json`, top-level `verses`).
   - `tropeFamiliesUsed([{ he: 54:7 above }])` is exactly `{ etnachta, sof-haftarah }` (one verse,
     so it is the last); with two verses the first's last block is `sof-pasuk`.
2. **trope.css + sheet.css.** Move the trope rules out of `sheet.css` into `template/trope.css`,
   each gated on `html[data-trope]` (write the selector once per rule, e.g.
   `html[data-trope] .he .tr { … }`, `html[data-trope] .tr-zakef { background: #fff176; }`), plus
   `html:not([data-trope]) .trope-legend { display: none; }`. Add `@import url("trope.css");` as the
   first line of `sheet.css` (before the `@font-face` rules; an `@import` must precede other
   rules). Keep the comment that names TropeTrainer's grouping.
3. **render.js.**
   - `buildVerseRow`: always wrap with `L.tropeHtml(heHtml, { final })` (drop the `if (opts.trope)`).
   - Front page: always build the trope legend row (families from `L.tropeFamiliesUsed(data.verses)`),
     so the CSS can show it when toggled on; it is `display: none` without the attribute and so
     does not change the default front page's fill.
   - Set `document.documentElement.dataset.trope = "1"` when `opts.trope` is true OR the page URL
     has `trope=1` (`new URLSearchParams(location.search).get("trope") === "1"`), before the front
     page is built (as today).
   - Screen-only toggle: at the end of the render, append to the `.review-note` paragraph a
     `<button type="button" class="trope-toggle">` that flips the attribute on click, with text
     `Trope colors: on` / `Trope colors: off` matching the current state. `.review-note` is already
     hidden in print and in `data-single` mode, so the PDF never sees it. Style the button in
     `sheet.css` next to `.review-note` (plain, small, same grey family; no new colors).
   - Title suffix and everything else stay as they are.
4. **Verification (commands and output in the report):**
   - `npm test` (one known pre-existing failure: `tests/deliver.test.mjs` "CLI exits 1 …" timeout).
   - Default layout unchanged: before touching anything, run
     `node scripts/build.mjs weeks/2026-10-17-noach --no-pdf` and
     `node scripts/check.mjs weeks/2026-10-17-noach`, saving check's full table output to the
     scratchpad; record sha256 of `weeks/2026-10-17-noach/sheet.html`. After the change, rebuild
     the same way, run check again, and `diff` the two tables: they must be identical; the sheet.html
     hash must match. Do the same pair for `--trope` and `check --trope` (table identical).
   - `node scripts/build.mjs weeks/2026-10-17-noach --trope` writes both PDFs with the same page
     counts as before (10 and 10).
   - Three headless-Chrome screenshots (816×1056, scale 2, into the scratchpad
     `C:\Users\dsbog\AppData\Local\Temp\claude\C--Users-dsbog-haftarah\18f4b07b-c521-439a-a602-ec6638f03720\scratchpad\`):
     `sheet.html?page=2` (plain: no colors), `sheet.html?page=2&trope=1` (colors on the default
     sheet, proving the toggle), `sheet-trope.html?page=1` (legend row present). Look at each with
     the Read tool and say what you saw.
   - Commit: `Trope colors are a runtime toggle: data-trope, trope.css, tropeHtml in lib`.

## Task 2: documentation

Files: `README.md`, `DESIGN.md`, `RUNBOOK.md`.

- `README.md`: in the tree listing add `trope.css` under `template/` ("the chanter's-copy colors;
  on only while <html data-trope> is set") and mention `tropeHtml`/`tropeFamiliesUsed` on the
  `lib.js` line. Replace the "Chanter's copy" paragraph's last sentence with two: the colors are a
  runtime toggle (the attribute contract, and `?trope=1` on any sheet HTML for a look), and the
  three pieces a web version reuses: `tropeHtml`, `tropeFamiliesUsed`, `trope.css`, plus
  `TROPE_FAMILIES` for a legend.
- `DESIGN.md`: in the "Chanter's copy" subsection, one sentence: the colors live in `trope.css`
  and apply only while `<html>` carries `data-trope`; the study sheet's markup carries the phrase
  spans unstyled.
- `RUNBOOK.md`: one clause on the build line or the sentence after it: opening `sheet.html` in a
  browser, the review bar has a "Trope colors" button, and `?trope=1` does the same.
- Commit: `Docs: trope colors as a toggle; what the web sheet reuses`.
