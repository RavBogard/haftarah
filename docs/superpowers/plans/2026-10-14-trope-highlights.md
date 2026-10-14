# Trope-phrase highlights: a chanter's copy of the sheet

Approved by Daniel 2026-10-14 ("go"). Exploration notes: the defunct TropeTrainer desktop app
printed the haftarah with every trope phrase on a colored background (example PDF:
`C:\Users\dsbog\OneDrive\Desktop\rosh-hashana-ii.pdf`). We add the same thing as a second PDF
beside the study sheet. The study sheet itself does not change.

## Global Constraints

- **The default build is unchanged.** `node scripts/build.mjs weeks/<slug>` without `--trope`
  must write the same `sheet.html` and the same layout as before (check.mjs's determinism and
  layout checks keep passing). Nothing in the study sheet's look changes: no color carries meaning
  there (DESIGN.md).
- **Highlights appear only in the Hebrew column (`.he`) of the chanter's copy**, never in English,
  margin notes, apparatus or the incipit.
- **Phrase rule (TropeTrainer's):** walk the verse word by word; a block ends at every word that
  carries a block-ending accent; tipcha, pashta, yetiv and zarka do NOT end a block (they fold into
  the block that follows); the verse's last word always ends a block. Block-ending accents and the
  family each gives its block:

  | accent (code point) | family |
  |---|---|
  | etnachta U+0591 | `etnachta` |
  | zakef katon U+0594 | `zakef` |
  | zakef gadol U+0595 | `zakef-gadol` |
  | revia U+0597 | `revia` |
  | munach U+05A3 immediately followed by a standalone paseq token `׀` (munach legarmeh) | `revia` |
  | tevir U+059B | `tevir` |
  | segol/segolta U+0592, shalshelet U+0593 | `segol` |
  | geresh U+059C, geresh muqdam U+059D, gershayim U+059E | `azla` |
  | telisha ketana U+05A9 | `telisha-ketana` |
  | pazer U+05A1, telisha gedola U+05A0, karnei farah U+059F | `pazer` |
  | last word of the verse | `sof-pasuk`, or `sof-haftarah` when it is the haftarah's last verse |

  Folding accents (never end a block): tipcha U+0596, pashta U+0599, yetiv U+059A, zarka as
  U+05AE **and** as U+0598 (Sefaria's Masorah text uses both). Conjunctives (never end a block):
  munach U+05A3 (except legarmeh), mahpach U+05A4, mercha U+05A5, mercha kefula U+05A6, darga
  U+05A7, kadma U+05A8, yerach ben yomo U+05AA, and anything else in U+0591–U+05AE not listed.
  A word with two accents (kadma + zakef katon, kadma + geresh, munach + zakef katon) ends a
  block if any of its accents is block-ending; the family is that accent's.
- **Family colors (TropeTrainer-like, exact values):**

  | family | background |
  |---|---|
  | zakef | `#fff176` |
  | etnachta | `#9ec5ff` |
  | sof-pasuk | `#f59a9a` |
  | revia | `#ffc078` |
  | tevir | `#9be29b` |
  | segol | `#eaa0ea` |
  | azla | `#ffd2d2` |
  | telisha-ketana | `#ffb3c6` |
  | pazer | `#d3c1ff` |
  | zakef-gadol | `#ffd9a3` |
  | sof-haftarah | `#66c2c2` |

- **Verse HTML is preserved.** Wrapping a verse in phrase spans must not add, drop or reorder a
  single character of its text content; existing tags (the `<b>׀</b>` paseq, `.pisqa`, `.mam-kq-k`
  ketiv spans, footnote `.fn`, keying circles) stay intact and are never split by a span boundary.
- Tokens: a verse is split into words on whitespace that is outside tags (`<…>` is atomic; a tag
  may contain spaces). A token with no Hebrew letter: if it is the paseq `׀` (bare or wrapped in a
  tag) it joins the current block; any other letterless token (e.g. `<span class="pisqa"></span>`)
  is emitted between blocks, unwrapped. A token with Hebrew letters but no accent (a ketiv in
  parentheses, a maqaf-joined word is already one token) joins the current block.
- Repo conventions: Node 18+, no dependencies, no `npm install`. `template/lib.js` is UMD and
  DOM-free; `template/render.js` runs in the browser; tests are `node --test` in `tests/`
  (`npm test`). Follow the existing comment style (short prose comments explaining why).
- Daniel is the user; no questions to him mid-plan. Rulings go in the ledger.

## Task 1: `tropePhrases` in template/lib.js, with tests

Add to `template/lib.js` (export it from the factory's return object like the others):

```js
// Trope phrases for the chanter's copy: the verse HTML cut into blocks, each ending at a
// block-ending accent (TropeTrainer's grouping: tipcha, pashta, yetiv and zarka fold into the
// block after them). Returns [{ family, html }] in verse order, plus separators for letterless
// tokens as { family: null, html }. Joining every html with " " gives the input back.
function tropePhrases(html, { final = false } = {}) { … }
const TROPE_FAMILIES = [
  ["zakef", "zakef"], ["etnachta", "etnachta"], ["sof-pasuk", "sof pasuk"], ["revia", "revia"],
  ["tevir", "tevir"], ["segol", "segol"], ["azla", "kadma v’azla"], ["telisha-ketana", "telisha ketana"],
  ["pazer", "pazer"], ["zakef-gadol", "zakef gadol"], ["sof-haftarah", "end of the haftarah"],
];
```

Requirements:

- Implement the phrase rule, token rule and two-accent rule from Global Constraints exactly.
- Tokenize the HTML with tags atomic (a `<…>` run is one unit even if it contains spaces); whitespace
  outside tags separates tokens. Accent detection looks only at text outside tags. Entities
  (`&thinsp;`, `&nbsp;`) count as whitespace between tokens.
- `final: true` names the verse's last block `sof-haftarah` instead of `sof-pasuk`.
- `TROPE_FAMILIES` is the fixed display order for the legend, `[key, label]` pairs as above.
- Tests in `tests/lib.test.mjs` (TDD: write them first, see them fail, then implement). Use these
  cases; the expected families are the whole point, spell them out:
  1. Isaiah 54:1 `רׇנִּ֥י עֲקָרָ֖ה לֹ֣א יָלָ֑דָה פִּצְחִ֨י רִנָּ֤ה וְצַֽהֲלִי֙ לֹא־חָ֔לָה כִּֽי־רַבִּ֧ים בְּֽנֵי־שׁוֹמֵמָ֛ה מִבְּנֵ֥י בְעוּלָ֖ה אָמַ֥ר יְהֹוָֽה׃`
     → families `etnachta, zakef, tevir, sof-pasuk`, with block texts
     `רׇנִּ֥י עֲקָרָ֖ה לֹ֣א יָלָ֑דָה` / `פִּצְחִ֨י רִנָּ֤ה וְצַֽהֲלִי֙ לֹא־חָ֔לָה` / `כִּֽי־רַבִּ֧ים בְּֽנֵי־שׁוֹמֵמָ֛ה` / `מִבְּנֵ֥י בְעוּלָ֖ה אָמַ֥ר יְהֹוָֽה׃`.
  2. Isaiah 54:2 with the paseq as the renderer sees it (after `&thinsp;` → space):
     `הַרְחִ֣יבִי <b>׀</b> מְק֣וֹם אׇהֳלֵ֗ךְ וִירִיע֧וֹת מִשְׁכְּנוֹתַ֛יִךְ יַטּ֖וּ אַל־תַּחְשֹׂ֑כִי הַאֲרִ֙יכִי֙ מֵיתָרַ֔יִךְ וִיתֵדֹתַ֖יִךְ חַזֵּֽקִי׃`
     → `revia` (`הַרְחִ֣יבִי <b>׀</b>`, legarmeh: munach then the paseq token joins the block),
     `revia` (`מְק֣וֹם אׇהֳלֵ֗ךְ`), `tevir`, `etnachta` (`יַטּ֖וּ אַל־תַּחְשֹׂ֑כִי`), `zakef`
     (`הַאֲרִ֙יכִי֙ מֵיתָרַ֔יִךְ`), `sof-pasuk` (`וִיתֵדֹתַ֖יִךְ חַזֵּֽקִי׃`).
  3. Two accents on one word: `עַל־מ֨וֹשָׁב֜וֹ` (kadma + geresh) ends an `azla` block;
     `וּמִ֨מְּחִתָּ֔ה` (kadma + zakef katon) ends a `zakef` block.
  4. `final: true` → last block is `sof-haftarah`; `final` omitted → `sof-pasuk`.
  5. Zarka in both encodings folds: a word carrying U+05AE and one carrying U+0598 each stay in
     the block that ends at the following segol (U+0592).
  6. A ketiv span joins the block: `אֶת־<span class="mam-kq-k">(החצי)</span> [הַ֣חִצִּ֔ים]` — the
     letterless-accent token `(החצי)` (wrapped) has letters but no accent and stays in the zakef
     block; no span boundary falls inside the tag.
  7. Pisqa separator: `… ׃ <span class="pisqa"></span>` is impossible mid-verse in our data, but a
     letterless token such as `<span class="pisqa"></span>` between words is returned as
     `{ family: null, html: '<span class="pisqa"></span>' }`, not inside a block.
  8. Round trip: for every verse string in
     `tests/fixtures/week-notes/sheet.json` and `tests/fixtures/week-min/sheet.json`
     (`data.verses[*].he`, after `&thinsp;` → space), `tropePhrases(he).map(p => p.html).join(" ")`
     equals the input, and no block's html is empty.
- Run `npm test`; all passing, output pristine.
- Commit: `lib: tropePhrases cuts a verse into trope-family blocks`.

## Task 2: the chanter's copy — renderer, CSS, build and check flags

Files: `template/render.js`, `template/sheet.css`, `scripts/build.mjs`, `scripts/check.mjs`.

**Option plumbing.** `build.mjs` gets a `--trope` flag. With it, after writing `sheet.html` and
`sheet.pdf` exactly as today, the build also writes `sheet-trope.html` (same template, with
`trope: true` added to the `OPTIONS` JSON, title suffixed ` (chanter’s copy)`) and prints it to
`sheet-trope.pdf` with the same Chrome flags and the same qpdf packing, logging
`Wrote weeks/<slug>/sheet-trope.pdf: N pages, K KB` like the main PDF. `--png` previews stay for
the main sheet only. Without `--trope`, nothing new is written and `sheet.html` is byte-identical
to today's output. The usage line in `parseArgs` and the header comment list the new flag.

`check.mjs` gets `--trope`: it then checks `sheet-trope.html` instead of `sheet.html` (one line
where the html path is built; the usage comment at the top mentions it). It must pass on the
chanter's copy of a real week.

**Renderer.** `render.js` reads `opts.trope`. When true:

- In `buildVerseRow`, after `divineName` and the gloss keying (`keyHebrew`) have produced `heHtml`,
  replace it with the phrases wrapped: each block becomes
  `<span class="tr tr-${family}">${html}</span>`, separators pass through unwrapped, all joined
  with a single space. `final` is true for the last verse of `data.verses`. The split-row logic
  (`splitRow`, `lineBoxes`) must keep working across a block that wraps lines; verify with
  check.mjs on a real week.
- `document.documentElement.dataset.trope = "1"` so the CSS and check can see the mode.
- On the front page, after the register legend, add a second legend row
  `el("div", "legend trope-legend")` whose first child is the label
  `<span class="label">Chanter’s copy · trope phrases by family</span>` followed by one
  `<span class="tr tr-${key}">${label}</span>` per family in `L.TROPE_FAMILIES` order, **only for
  families used on this sheet** (collect the set while building verse rows; build verse rows
  before the front page if needed, or compute the set up front from `data.verses` with
  `L.tropePhrases`). The front page's fill/overflow logic already measures everything in `p.body`,
  so the row participates in the voices-to-end-matter rule for free.

**CSS** (`sheet.css`, next to the `.he` rules):

```css
/* Chanter's copy: each trope phrase on its family's color (TropeTrainer's grouping). */
.he .tr { padding: 0 0.14em; -webkit-box-decoration-break: clone; box-decoration-break: clone; }
.tr-zakef { background: #fff176; } …one rule per family with the exact values in Global Constraints…
.trope-legend .label { color: var(--ink-2); margin-right: 4pt; }
.trope-legend .tr { padding: 1pt 5px; color: var(--ink); }
```

The Hebrew line-height (`--lh-he: 1.62`) is already enough that blocks on neighboring lines do not
touch; do not change it.

**Verification (put the commands and output in the report):**

1. `npm test` passes.
2. `node scripts/build.mjs weeks/2026-10-17-noach` (no flag) — then `git status` / a hash of
   `weeks/2026-10-17-noach/sheet.html` before and after your change shows the default output is
   unchanged (build it once on the base commit first and keep the hash).
3. `node scripts/build.mjs weeks/2026-10-17-noach --trope` writes both PDFs; report both page counts.
4. `node scripts/check.mjs weeks/2026-10-17-noach` and `node scripts/check.mjs weeks/2026-10-17-noach --trope`
   both pass.
5. Render page 2 of `sheet-trope.pdf` to PNG (pdftoppm if on PATH, else a headless Chrome
   screenshot of `sheet-trope.html?page=2` at `--window-size=816,1056 --force-device-scale-factor=2`)
   and look at it with the Read tool: blocks colored per family, no block crossing a tag, spaces
   between blocks, the legend row present on page 1. Note what you saw in the report.

`weeks/` is git-ignored; nothing from it is committed. Commit:
`Chanter's copy: --trope builds sheet-trope.pdf with trope-phrase highlights`.

## Task 3: documentation

Files: `README.md`, `RUNBOOK.md`, `DESIGN.md`, `PRODUCT.md`.

- `README.md`: in the tree listing, under `scripts/ build.mjs`, mention `--trope`; in "Weekly use"
  step 5 show `--trope` as optional with a trailing comment `# also sheet-trope.pdf, the chanter's
  copy: trope phrases highlighted by family`; in the `weeks/<slug>/` listing add
  `sheet-trope.pdf  the chanter's copy (optional)`. Add a short paragraph after the weekly-use
  block, "Chanter's copy", three or four sentences: what it is, the phrase rule in one sentence
  (blocks end at a disjunctive; tipcha, pashta, yetiv and zarka fold forward), the family colors
  follow TropeTrainer's so people who learned on it recognize them, and that the study sheet
  itself is unchanged.
- `RUNBOOK.md` line with `build.mjs`: add `--trope` as optional with the same short comment; one
  sentence where the build is described saying the chanter's copy is only built when Daniel asks
  for it that week.
- `DESIGN.md`: one short subsection "Chanter's copy" under Colors (or the nearest fitting place)
  stating the exception: in `sheet-trope.pdf` and only there, the Hebrew column carries phrase
  backgrounds in the eleven TropeTrainer-like family colors (list them with values); nothing else
  on the sheet changes; the study sheet keeps its rule that color never carries meaning.
- `PRODUCT.md`: one bullet in the right list: an optional chanter's copy with trope phrases
  highlighted for the few who chant.
- No code changes. Commit: `Docs: the chanter's copy`.
