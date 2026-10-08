# Haftarah Sheet v2 Template Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the v2 prototype template into the finished sheet the design review asked for: front page, binding-aware frame, poetry lineation, one key series, red diet, voices, next-week line, a paginator that never leaves dead bands or one-verse pages, schema 2 data, a hard build gate, and tests that pin all of it.

**Architecture:** The browser-side renderer (`template/render.js`) keeps doing the layout, but every pure function it needs (divine name, poetry splitting, key assignment, register names, voices, bibliography parsing) moves into `template/lib.js`, a small UMD file that both the browser and `node --test` can load. The Node scripts (`fetch`, `build`, `migrate`, `check`) stay dependency-free. Layout invariants are checked by a new `scripts/check.mjs` that runs headless Chrome with `--dump-dom` and reads `data-*` attributes the renderer writes onto every page.

**Tech Stack:** Node 18+ (`node:test`, no npm dependencies), headless Chrome/Edge, plain CSS, Sefaria v3 and Hebcal JSON APIs.

**Spec:** `docs/superpowers/specs/2026-10-07-haftarah-sheet-v2-design.md` (sections 5, 6, 7; rollout step 1). Sections 3, 4 and rollout steps 2 to 5 (repo history, Drive, runbook v2, cloud) are a second plan written after this one ships.

## Global Constraints

- Node 18+; no npm packages. Tests run with `node --test tests/`.
- Browser: Chrome or Edge via `findBrowser()` in `scripts/build.mjs`; the build logs the browser path it used, and `check.mjs` uses the same function.
- Fonts: Literata, Ezra SIL, Noto Serif Hebrew, self-hosted in `template/fonts/`.
- Rubric `#8a0a14`. Secondary greys: tails and provenance `#595959`; running heads and footers `#4d4d4d`. Paper white, ink black.
- Four sizes: incipit 60pt nominal (fit to a 3.5in box, 64pt max, 48pt min), text 10.5pt, apparatus 9.2pt, gloss 9pt. Nothing is set at a fifth size; sub-elements scale by em.
- Page: US letter, duplex, stapled upper right. Recto (odd pages): staple corner top right, inner margin right 0.6in, outer margin left 0.75in. Verso: mirrored. Top 0.62in, bottom 0.62in.
- Divine name: every Tetragrammaton in Hebrew becomes יי with the verse's accents (U+0591–U+05AE) kept on the second yud. English stays as JPS prints it.
- Commentary registers in data: `traditional | modern | critical | reference`. Printed names: classical commentators / modern commentators / what historians say / reference.
- Series label format: `5787 · No. 3`. Series name: `Torah from Scratch`. Wordmark: `central reform congregation` (lowercase). Tagline: `A Jewish Presence in the City of St. Louis`.
- Nothing prints unapproved. The final build exits non-zero while anything is `proposed`.
- `weeks/` files are data, never template. Do not edit `template/` from a weekly task.
- Commit messages end with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

## Review Focus

Inputs the spec implies but no task's tests would otherwise exercise, most likely to bite first. Each one has a test added to the owning task.

1. A haftarah with no JPS footnotes and no glosses at all (common for short readings): the margin column must stay empty, the legend must still print "a–z translators' notes" greyed, and `assignKeys` must return an empty sequence. (Task 3 test `assignKeys with nothing to key`.)
2. A verse whose English is poetry with a trailing footnote key on the last line, for example `…nations<sup class="fn">c</sup>—`: the key, the dash and the word before them must stay on one line. (Task 2 test `nowrapKeys keeps key and dash with their word`.)
3. More than 26 keys on one sheet (a long Isaiah reading with many JPS notes): the series must continue `aa, ab…`, never wrap to `a` again. (Task 3 test `letterFor past z`.)
4. A reading of one verse, or a reading whose last page would hold one verse: the "never one verse on a page" rule must yield instead of looping. (Task 7 check: `check.mjs` on the fixture week with `--only-verses 1`.)
5. A critical entry that cites a work not yet in `bibliography/<book>.md`: the final build must name the entry and the key, not crash on a missing file. (Task 11 test `gate names missing work and missing bibliography file`.)

---

## File Structure

| File | Responsibility |
|---|---|
| `package.json` (new) | `npm test` → `node --test tests/`; `npm run check -- weeks/<slug>`; no dependencies |
| `template/lib.js` (new) | Pure functions shared by the browser and tests: `divineName`, `stripMarks`, `splitPoetry`, `nowrapKeys`, `letterFor`, `isDeadRef`, `normalizeRefs`, `assignKeys`, `SIGLA`, `REGISTER_NAMES`, `voicesFor`, `parseBibliography`, `fitIncipitSize` |
| `template/voices.json` (new) | Source-name prefix → one-line introduction |
| `template/render.js` | Browser paginator: front page, frame, text pages, apparatus, end matter; writes `data-*` attributes for `check.mjs` |
| `template/sheet.css` | Tokens, frame, front page, text grid, margin notes, apparatus, end matter |
| `template/sheet.html` | Adds `{{LIB}}` script before `{{RENDER}}` |
| `scripts/build.mjs` | HTML + PDF + PNG; injects lib path and voices; hard gate; logs browser |
| `scripts/check.mjs` (new) | Dumps the rendered DOM twice, asserts layout invariants and determinism |
| `scripts/migrate.mjs` (new) | Schema 1 → 2 |
| `scripts/fetch.mjs` | Writes schema 2 skeletons with `series`, `openingNote`, `nextWeek` |
| `bibliography/I Samuel.md`, `bibliography/Isaiah.md` (new) | Closed lists of works the critical register may cite |
| `tests/lib.test.mjs`, `tests/gate.test.mjs` (new) | Unit tests |
| `tests/fixtures/week-min/sheet.json` (new) | Three-verse synthetic week (public-domain English) used by gate and check tests |
| `DESIGN.md`, `PRODUCT.md`, `README.md` | Updated to the v2 truth |

---

### Task 1: Shared library and test scaffold

**Files:**
- Create: `package.json`, `template/lib.js`, `tests/lib.test.mjs`
- Modify: `template/sheet.html`, `scripts/build.mjs:96-106` (template substitution), `template/render.js:36-55` (remove the inline divine-name code and use the lib)

**Interfaces:**
- Produces: `HaftarahLib.divineName(html) → { html, count }`, `HaftarahLib.stripMarks(s) → string`. In the browser the object is `window.HaftarahLib`; in Node `require("../template/lib.js")`.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "haftarah-sheet",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test tests/",
    "check": "node scripts/check.mjs"
  }
}
```

- [ ] **Step 2: Write the failing tests**

`tests/lib.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const lib = require("../template/lib.js");

test("divineName replaces the pointed name and keeps its accent", () => {
  // יְהוָ֖ה : sheva, qamats, tipcha (U+0596)
  const r = lib.divineName("אֲנִ֣י יְהוָ֖ה");
  assert.equal(r.count, 1);
  assert.equal(r.html, "אֲנִ֣י יי֖");
});

test("divineName handles the Elohim pointing and unpointed forms", () => {
  assert.equal(lib.divineName("אֲדֹנָ֥י יֱהֹוִ֖ה").html, "אֲדֹנָ֥י יי֖");
  assert.equal(lib.divineName("יהוה").html, "יי");
  assert.equal(lib.divineName("יהוה אחד יהוה").count, 2);
});

test("divineName leaves Judah and Jonathan alone", () => {
  const s = "יְהוּדָ֖ה וִיהוֹנָתָ֑ן";
  assert.equal(lib.divineName(s).html, s);
  assert.equal(lib.divineName(s).count, 0);
});

test("stripMarks removes vowels and accents", () => {
  assert.equal(lib.stripMarks("וְנִפְקַ֕דְתָּ"), "ונפקדת");
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL, `Cannot find module '../template/lib.js'`.

- [ ] **Step 4: Create `template/lib.js`**

```js
/* lib.js — pure functions shared by the renderer (browser) and the tests (Node).
   UMD: window.HaftarahLib in the browser, module.exports in Node. No DOM here. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.HaftarahLib = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // Any Tetragrammaton, with any pointing (including the Elohim pointing).
  const TETRA = /י[֑-ׇ]*ה[֑-ׇ]*ו[֑-ׇ]*ה[֑-ׇ]*/g;

  // יי, with the verse's cantillation marks (U+0591–U+05AE) kept on the second yud.
  function divineName(html) {
    let count = 0;
    const out = String(html == null ? "" : html).replace(TETRA, m => {
      count++;
      const accents = (m.match(/[֑-֮]/g) || []).join("");
      return "יי" + accents;
    });
    return { html: out, count };
  }

  function stripMarks(s) {
    return String(s).normalize("NFD").replace(/[֑-ֽֿ-ׇ]/g, "").normalize("NFC");
  }

  return { TETRA, divineName, stripMarks };
});
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test`
Expected: 4 passing.

- [ ] **Step 6: Load the lib in the page and the renderer**

`template/sheet.html`: replace the render script line with

```html
<script src="{{LIB}}"></script>
<script src="{{RENDER}}" defer></script>
```

`scripts/build.mjs`, in the `tpl.replace` chain, add after the `{{RENDER}}` replacement:

```js
    .replace("{{LIB}}", toPosix(relative(weekDir, join(ROOT, "template", "lib.js"))))
```

`template/render.js`: delete the `stripMarks`, `TETRA`, `yyCount` and `divineName` definitions (lines 36 to 52 of the prototype) and replace with

```js
  const L = window.HaftarahLib;
  const stripMarks = L.stripMarks;
  let yyCount = 0;
  const divineName = html => { const r = L.divineName(html); yyCount += r.count; return r.html; };
```

- [ ] **Step 7: Rebuild one week and confirm the count still reports**

Run: `node scripts/build.mjs weeks/2026-10-10-bereshit-machar-chodesh --no-pdf && grep -c "lib.js" weeks/2026-10-10-bereshit-machar-chodesh/sheet.html`
Expected: `Wrote …sheet.html` and `1`. Open the HTML in a browser: the review note ends with "Divine name set as יי 5 times."

- [ ] **Step 8: Commit**

```bash
git add package.json template/lib.js template/sheet.html template/render.js scripts/build.mjs tests/lib.test.mjs
git commit -m "Shared lib for renderer and tests; divine name moves there

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Poetry lineation

**Files:**
- Modify: `template/lib.js`, `template/render.js` (`buildVerseRow`), `template/sheet.css` (`.en`), `tests/lib.test.mjs`

**Interfaces:**
- Produces: `splitPoetry(en) → string[]` (one entry per JPS line; a prose verse returns one entry), `nowrapKeys(html) → string`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/lib.test.mjs`:

```js
test("splitPoetry splits on JPS line breaks and trims", () => {
  const en = 'Sing to G<small>OD</small> a new song,<br>Praise from the ends of the earth—<br>You coastlands<sup class="fn">e</sup> and their inhabitants!';
  assert.deepEqual(lib.splitPoetry(en), [
    "Sing to G<small>OD</small> a new song,",
    "Praise from the ends of the earth—",
    'You coastlands<sup class="fn">e</sup> and their inhabitants!',
  ]);
});

test("splitPoetry returns prose as one line and ignores a trailing break", () => {
  assert.deepEqual(lib.splitPoetry("Jonathan said to him.<br>"), ["Jonathan said to him."]);
  assert.deepEqual(lib.splitPoetry("Jonathan said to him."), ["Jonathan said to him."]);
});

test("nowrapKeys keeps key and dash with their word", () => {
  const out = lib.nowrapKeys('a light of nations<sup class="fn">c</sup>—');
  assert.equal(out, '<span class="nb">a light of nations<sup class="fn">c</sup>—</span>'.replace('<span class="nb">a light of ', 'a light of <span class="nb">'));
});
```

The expected string is `a light of <span class="nb">nations<sup class="fn">c</sup>—</span>`: only the last word, its key and the dash are wrapped.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL, `lib.splitPoetry is not a function`.

- [ ] **Step 3: Implement in `template/lib.js`** (inside the factory, before `return`; add both names to the returned object)

```js
  // JPS poetry arrives with <br> between lines. Prose has none.
  function splitPoetry(en) {
    return String(en == null ? "" : en)
      .split(/<br\s*\/?>/i)
      .map(s => s.trim())
      .filter((s, i, arr) => s.length || i < arr.length - 1)
      .filter(s => s.length);
  }

  // A footnote key, and any dash or punctuation after it, never separates from its word.
  function nowrapKeys(html) {
    return String(html == null ? "" : html).replace(
      /(\S+)(<sup class="fn">[a-z]+<\/sup>)([—–\-,;:.!?”’)]*)/g,
      '<span class="nb">$1$2$3</span>'
    );
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: all passing.

- [ ] **Step 5: Use it in the renderer**

In `template/render.js`, `buildVerseRow`, replace `const en = el("div", "en", v.en);` with:

```js
    const lines = L.splitPoetry(v.en);
    const en = el("div", "en" + (lines.length > 1 ? " poetry" : ""));
    const enInner = el("div", "inner");
    if (lines.length > 1) lines.forEach(t => enInner.append(el("span", "ln", L.nowrapKeys(t))));
    else enInner.innerHTML = L.nowrapKeys(lines[0] || "");
    en.append(enInner);
```

and wrap the Hebrew the same way so Task 7 can clip both cells:

```js
    const he = el("div", "he");
    const heInner = el("div", "inner", heHtml);
    he.append(heInner);
```

(keep the existing `heHtml` computation above it).

- [ ] **Step 6: CSS**

Append to the text-page section of `template/sheet.css`:

```css
.en.poetry .ln { display: block; padding-left: 1.1em; text-indent: -1.1em; }
.en .nb { white-space: nowrap; }
```

- [ ] **Step 7: Rebuild Isaiah and look**

Run: `node scripts/build.mjs weeks/2026-10-10-bereshit-isaiah --png --no-pdf`
Expected: on page 3 of `weeks/2026-10-10-bereshit-isaiah/preview/`, "You who sail the sea and you creatures / in it," shows "in it," indented under the line it continues; 42:6 no longer ends on a dash alone.

- [ ] **Step 8: Commit**

```bash
git add template/lib.js template/render.js template/sheet.css tests/lib.test.mjs
git commit -m "Poetry: one block per JPS line with a hanging indent; keys never orphan

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: One key series for JPS notes and glosses

**Files:**
- Modify: `template/lib.js`, `template/render.js` (`keyHebrew`, `buildVerseRow`), `template/sheet.css` (`.note`, `.he .circ`, `.en .fn`), `tests/lib.test.mjs`

**Interfaces:**
- Consumes: `visible(item)` from the renderer (passed in as `isVisible`).
- Produces: `letterFor(i)`, `isDeadRef(text)`, `normalizeRefs(text)`, `assignKeys(verses, glosses, isVisible) → { verses, sequence }` where each returned verse has `en` rewritten and `keys: [{ key, kind: "jps"|"gloss", lemma, he, text, verse, chapter }]` in margin order; `sequence` is the list of keys used, in order.
- The gloss schema gains an optional `en` (the English words the gloss belongs to). Without it the English key goes at the end of the verse.

- [ ] **Step 1: Write the failing tests**

Append to `tests/lib.test.mjs`:

```js
test("letterFor past z", () => {
  assert.equal(lib.letterFor(0), "a");
  assert.equal(lib.letterFor(25), "z");
  assert.equal(lib.letterFor(26), "aa");
  assert.equal(lib.letterFor(27), "ab");
});

test("isDeadRef recognises cross-references to pages the reader does not have", () => {
  assert.equal(lib.isDeadRef("See note at 10.11."), true);
  assert.equal(lib.isDeadRef("See 18.11 and note."), true);
  assert.equal(lib.isDeadRef("Cf. 43.9–12."), true);
  assert.equal(lib.isDeadRef("Lit. “very much.”"), false);
  assert.equal(lib.isDeadRef("See above, vv. 12–17."), false);
  assert.equal(lib.isDeadRef("Emendation yields “Let the sea roar”; cf. Ps. 98.7."), false);
});

test("normalizeRefs turns JPS 19.2 into 19:2 and leaves years alone", () => {
  assert.equal(lib.normalizeRefs("see 19.2ff."), "see 19:2ff.");
  assert.equal(lib.normalizeRefs("Ps. 98.7"), "Ps. 98:7");
  assert.equal(lib.normalizeRefs("Duhm (1892)"), "Duhm (1892)");
});

test("assignKeys reletters per sheet, drops dead refs, keys glosses in both languages", () => {
  const verses = [
    { chapter: 20, verse: 18, en: 'you will be missed when your seat remains vacant.<sup class="fn">h</sup>', he: "וְנִפְקַ֕דְתָּ כִּ֥י יִפָּקֵ֖ד", notes: [{ marker: "h", lemma: "vacant", text: "At the festal meal." }] },
    { chapter: 20, verse: 19, en: 'go down all the way<sup class="fn">i</sup> to the place<sup class="fn">j</sup>', he: "אֵ֥צֶל הָאֶ֖בֶן הָאָֽזֶל׃", notes: [{ marker: "i", lemma: "all the way", text: "Lit. “very much.”" }, { marker: "j", lemma: "the place", text: "See 19.2 and note." }] },
  ];
  const glosses = [{ verse: 18, lemma: "וְנִפְקַ֕דְתָּ", en: "you will be missed", text: "<i>nifkadta</i>", status: "approved" }];
  const r = lib.assignKeys(verses, glosses, () => true);
  assert.deepEqual(r.sequence, ["a", "b", "c"]);
  assert.equal(r.verses[0].en, 'you will be missed<sup class="fn">b</sup> when your seat remains vacant.<sup class="fn">a</sup>');
  assert.deepEqual(r.verses[0].keys.map(k => [k.key, k.kind, k.lemma]), [["a", "jps", "vacant"], ["b", "gloss", "you will be missed"]]);
  assert.equal(r.verses[1].en, 'go down all the way<sup class="fn">c</sup> to the place');
  assert.deepEqual(r.verses[1].keys.map(k => k.key), ["c"]);
  assert.equal(r.verses[0].keys[1].he, "וְנִפְקַ֕דְתָּ");
});

test("assignKeys with nothing to key", () => {
  const r = lib.assignKeys([{ chapter: 1, verse: 1, en: "In the beginning.", he: "בְּרֵאשִׁ֖ית", notes: [] }], [], () => true);
  assert.deepEqual(r.sequence, []);
  assert.deepEqual(r.verses[0].keys, []);
  assert.equal(r.verses[0].en, "In the beginning.");
});

test("assignKeys puts a gloss key at the end of the verse when no English anchor is given", () => {
  const r = lib.assignKeys([{ chapter: 1, verse: 1, en: "In the beginning.", he: "בְּרֵאשִׁ֖ית", notes: [] }], [{ verse: 1, lemma: "בְּרֵאשִׁ֖ית", text: "x", status: "approved" }], () => true);
  assert.equal(r.verses[0].en, 'In the beginning.<sup class="fn">a</sup>');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL, `lib.letterFor is not a function`.

- [ ] **Step 3: Implement in `template/lib.js`** (add to the returned object)

```js
  function letterFor(i) {
    let n = i + 1, s = "";
    while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(97 + r) + s; n = Math.floor((n - 1) / 26); }
    return s;
  }

  // A JPS note that only points elsewhere in the book is dead on a six-page handout.
  function isDeadRef(text) {
    const t = String(text == null ? "" : text).replace(/<[^>]+>/g, "").trim();
    return /^(See|Cf\.?|Compare)\b/i.test(t) && /\b\d+\.\d+/.test(t) && !/[“"]/.test(t) && !/\bv{1,2}\./i.test(t);
  }

  // JPS writes 19.2; the sheet writes 19:2. Years (four digits) are not refs.
  function normalizeRefs(text) {
    return String(text == null ? "" : text).replace(/\b(\d{1,3})\.(\d{1,3})\b/g, "$1:$2");
  }

  function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

  // One letter series per sheet, in reading order: a verse's JPS notes first (in the order
  // they appear in the English), then its glosses. Dead JPS notes are dropped with their key.
  function assignKeys(verses, glosses, isVisible) {
    let i = 0;
    const sequence = [];
    const out = verses.map(v => {
      let en = String(v.en == null ? "" : v.en);
      const keys = [];
      for (const n of (v.notes || [])) {
        const sup = `<sup class="fn">${n.marker}</sup>`;
        if (isDeadRef(n.text)) { en = en.replace(sup, ""); continue; }
        const key = letterFor(i++);
        sequence.push(key);
        en = en.replace(sup, `<sup class="fn">@@${key}@@</sup>`);
        keys.push({ key, kind: "jps", lemma: n.lemma || "", text: normalizeRefs(n.text), verse: v.verse, chapter: v.chapter });
      }
      const mine = (glosses || []).filter(g => g.verse === v.verse && (g.chapter == null || g.chapter === v.chapter) && (g.status ? isVisible(g) : true));
      for (const g of mine) {
        const key = letterFor(i++);
        sequence.push(key);
        const sup = `<sup class="fn">@@${key}@@</sup>`;
        if (g.en && en.includes(g.en)) en = en.replace(g.en, g.en + sup);
        else en = en + sup;
        keys.push({ key, kind: "gloss", lemma: g.en || "", he: g.lemma, text: g.text, verse: v.verse, chapter: v.chapter, status: g.status });
      }
      en = en.replace(/@@([a-z]+)@@/g, "$1");
      return Object.assign({}, v, { en, keys });
    });
    return { verses: out, sequence };
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: all passing.

- [ ] **Step 5: Renderer: key the Hebrew with the letter, build the margin notes**

In `template/render.js`:

Replace `keyHebrew(html, lemma)` with a version that takes the key:

```js
  function keyHebrew(html, lemma, key) {
    if (!lemma) return html;
    const mark = `<sup class="fn he">${key}</sup>`;
    if (html.includes(lemma)) return html.replace(lemma, lemma + mark);
    const plainLemma = stripMarks(lemma);
    const re = /[א-ת־֑-ׇ]+/g;
    let m;
    while ((m = re.exec(html))) {
      if (stripMarks(m[0]).replace(/־$/, "") === plainLemma.replace(/־$/, "")) {
        return html.slice(0, m.index + m[0].length) + mark + html.slice(m.index + m[0].length);
      }
    }
    return html + mark;
  }
```

In `buildTextPages`, before `const rows = verses.map(...)`, run the assignment once and keep the sequence for the check script:

```js
    const keyed = L.assignKeys(verses, data.glosses || [], visible);
    keyed.verses.forEach((kv, idx) => { verses[idx].en = kv.en; verses[idx].keys = kv.keys; });
    document.documentElement.dataset.keys = keyed.sequence.join(",");
```

In `buildVerseRow`, replace the gloss and note handling (the `glosses` filter, the `for (const g of glosses) heHtml = keyHebrew(...)`, and the two `notes.push` loops) with:

```js
    let heHtml = divineName(v.he.replace(/&thinsp;| /g, " "));
    for (const k of (v.keys || [])) if (k.kind === "gloss") heHtml = keyHebrew(heHtml, k.he, k.key);
    …
    const notes = [];
    for (const k of (v.keys || [])) {
      const cls = "note " + k.kind + (k.status && k.status !== "approved" ? " proposed" : "");
      const vn = k.kind === "gloss" ? `<span class="vn">${k.verse}</span>` : "";
      const lemma = k.lemma ? `<span class="lemma">${esc(k.lemma)}</span><span class="brk">]</span> ` : "";
      const heLemma = k.kind === "gloss" && k.he ? `<span class="he-lemma">${divineName(esc(k.he))}</span> ` : "";
      const tail = k.kind === "jps" ? ` <span class="tail">JPS</span>` : "";
      notes.push(el("p", cls, `<span class="k">${k.key}</span>${vn}${lemma}${heLemma}${divineName(k.text)}${tail}`));
    }
```

- [ ] **Step 6: CSS**

Replace the `.he .circ` block and the `.note` rules in `template/sheet.css` with:

```css
.he .fn {
  font-family: var(--serif);
  font-size: 0.6em;
  line-height: 0;
  vertical-align: 0.95em;
  color: var(--rubric);
  margin: 0 0.1em;
  font-style: italic;
  font-variant-numeric: lining-nums;
}

.note {
  position: absolute;
  left: 0; right: 0;
  margin: 0;
  font-size: var(--size-gloss);
  line-height: 1.32;
  color: var(--ink);
  text-indent: -9pt;
  padding-left: 9pt;
}
.margin-col.measuring .note { position: static; }
.note .k { color: var(--rubric); font-style: italic; margin-right: 3pt; }
.note .vn { color: var(--ink-2); font-size: 0.9em; margin-right: 3pt; font-variant-numeric: lining-nums; }
.note .lemma { font-style: italic; }
.note .brk { margin: 0 3pt 0 1pt; color: var(--ink-2); }
.note .he-lemma { font-family: var(--hebrew); font-size: 1.12em; direction: rtl; unicode-bidi: isolate; }
.note .tail { color: var(--ink-2); font-size: 0.85em; letter-spacing: 0.04em; }
.note.proposed { background: #f3eced; outline: 2pt solid #f3eced; }
```

Also remove the `.legend .circ` rule and the gloss legend span in `buildCover` (`legend.append(el("span", "glossnote", …))`); Task 6 rebuilds the legend.

- [ ] **Step 7: Rebuild Samuel and look**

Run: `node scripts/build.mjs weeks/2026-10-10-bereshit-machar-chodesh --png --no-pdf`
Expected: page 2 margin begins "a *vacant* ] At the festal meal. JPS", then "b 18 … וְנִפְקַ֕דְתָּ nifkadta…"; the English shows a small red "b" after "you will be missed"; no ° anywhere; page 4 no longer has two notes keyed the same letter; "See note at 10.11" is gone from page 3.

- [ ] **Step 8: Commit**

```bash
git add template/lib.js template/render.js template/sheet.css tests/lib.test.mjs
git commit -m "One key series per sheet for JPS notes and glosses; margin uses the apparatus grammar

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Tokens, sigla, red diet, sizes, margins, chapter locator

**Files:**
- Modify: `template/lib.js` (SIGLA, REGISTER_NAMES move here), `template/sheet.css` (`:root`, `.frame-head`, `.frame-foot`, `.en .fn`, `.gut`, `.entry .sig`, `.entry .tail`, `.page`), `template/render.js` (use `L.SIGLA`, gutter locator), `tests/lib.test.mjs`

**Interfaces:**
- Produces: `L.SIGLA = { traditional, modern, critical, reference }` (SVG strings, all filled), `L.REGISTER_NAMES = { traditional: "classical commentators", modern: "modern commentators", critical: "what historians say", reference: "reference" }`, `L.REGISTER_ORDER = ["traditional","modern","critical","reference"]`.

- [ ] **Step 1: Write the failing test**

```js
test("sigla are one filled family and registers have plain names", () => {
  for (const k of lib.REGISTER_ORDER) {
    assert.match(lib.SIGLA[k], /fill="currentColor"/);
    assert.doesNotMatch(lib.SIGLA[k], /fill="none"/);
  }
  assert.equal(lib.REGISTER_NAMES.critical, "what historians say");
  assert.equal(lib.REGISTER_NAMES.traditional, "classical commentators");
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test` → FAIL, `lib.REGISTER_ORDER is undefined`.

- [ ] **Step 3: Add to `template/lib.js`**

```js
  const SIGLA = {
    traditional: '<svg viewBox="0 0 10 10" aria-hidden="true"><rect x="1.5" y="1.5" width="7" height="7" fill="currentColor"/></svg>',
    modern: '<svg viewBox="0 0 10 10" aria-hidden="true"><circle cx="5" cy="5" r="3.6" fill="currentColor"/></svg>',
    critical: '<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M5 1.2 L9.3 8.8 H0.7 Z" fill="currentColor"/></svg>',
    reference: '<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M5 0.8 L9.2 5 L5 9.2 L0.8 5 Z" fill="currentColor"/></svg>',
  };
  const REGISTER_ORDER = ["traditional", "modern", "critical", "reference"];
  const REGISTER_NAMES = { traditional: "classical commentators", modern: "modern commentators", critical: "what historians say", reference: "reference" };
```

In `render.js` delete the local `SIGLA` and `REGISTER_NAMES` and write `const SIGLA = L.SIGLA, REGISTER_NAMES = L.REGISTER_NAMES;`.

- [ ] **Step 4: Tokens and red diet in `template/sheet.css`**

Replace the `:root` palette and sizes:

```css
  --paper: #ffffff;
  --ink: #000000;
  --ink-2: #595959;          /* tails, provenance, gloss tails: 65% black, survives an office laser */
  --frame: #4d4d4d;          /* running heads and footers */
  --rubric: #8a0a14;         /* the one color, sampled from the ring of the Siona Benjamin mural; means a source or a key */
  --rule: #000000;
  --rule-w: 0.5pt;

  --size-incipit: 60pt;      /* nominal; the renderer fits it to a 3.5in box between 48 and 64pt */
  --size-text: 10.5pt;
  --size-apparatus: 9.2pt;
  --size-gloss: 9pt;         /* margin notes, tails, running head, folio, provenance: the floor */

  --m-outer: 0.75in;         /* away from the staple: thumbs go here */
  --m-inner: 0.6in;          /* the staple side */
  --col-margin: 1.25in;
  --col-gutter: 0.34in;
  --col-gap: 0.12in;
  --margin-clear: 0.25in;    /* between the Hebrew's right edge and the margin column */
```

Then:

```css
.frame-head { color: var(--frame); }
.frame-head .head-left { font-style: italic; }
.frame-foot { color: var(--frame); }
.en .fn { color: var(--ink); font-size: 0.72em; }
.gut { font-weight: 600; font-size: 10pt; }
.gut .ch { display: block; font-size: var(--size-gloss); font-weight: 400; color: var(--rubric); margin-bottom: 1pt; font-variant-numeric: lining-nums; }
.entry .sig { width: 6.5pt; height: 6.5pt; vertical-align: -0.2pt; }
.entry .tail { color: var(--ink-2); font-size: var(--size-gloss); font-style: italic; }
.text-grid { grid-template-columns: [en] 1fr [gut] var(--col-gutter) [he] 1fr [mg] var(--col-margin); column-gap: var(--col-gap); }
.he { padding-right: 0; }
.margin-col { right: 0; width: calc(var(--col-margin) - var(--margin-clear)); }
.en, .he { text-wrap: pretty; }   /* no single-word last lines */
```

(Edit the existing rules in place rather than appending duplicates; the values above are the ones that change.)

- [ ] **Step 5: Chapter locator on the first verse of every page**

In `render.js`, `buildVerseRow(v, isFirst)` builds the gutter as `(v.showChapter ? '<span class="ch">…</span>' : "") + v.verse`. Change it so the locator reads `42:7` and is also shown on the first row of a page: give the row a method to re-render its gutter, called by `renderTextPage`:

```js
    const gut = el("div", "gut");
    row.setLocator = (show) => {
      gut.innerHTML = (show || v.showChapter ? `<span class="ch">${v.chapter}:${v.verse}</span>` : "") + v.verse;
    };
    row.setLocator(false);
```

and in `renderTextPage`, after the rows are appended: `pageRows.forEach((r, k) => r.node.setLocator(k === 0));`. Because the locator changes a row's height, measure rows (in `measureRows`) with the locator on: `rows.forEach(r => r.setLocator(true))` before measuring and `r.setLocator(false)` after. (The chapter tag adds one gloss-size line, so the first row of a page is at most 11pt taller than measured; the overflow check in `renderTextPage` already re-verifies real geometry.)

- [ ] **Step 6: Run tests, rebuild, look**

Run: `npm test && node scripts/build.mjs weeks/2026-10-10-bereshit-machar-chodesh --png --no-pdf`
Expected: tests pass; running heads and footer are dark grey, superscript letters are black, all four sigla are solid, tails read at 9pt, every text page's first gutter shows `20:25`-style locator in red above the bold number.

- [ ] **Step 7: Commit**

```bash
git add template/lib.js template/render.js template/sheet.css tests/lib.test.mjs
git commit -m "Red means a source or a key; filled sigla; 9.2/9pt apparatus; chapter locator per page

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Binding-aware frame

**Files:**
- Modify: `template/render.js` (`newPage`, `setHead`, `renderTextPage` head call, front-page foot), `template/sheet.css` (`.page`, `.page.verso`, `.frame-foot`, folio placement)

**Interfaces:**
- Produces: `newPage(kind)` returns `{ page, head, left, right, body, foot, recto }`; `setHead(p, shabbat, range)` places the range away from the staple; `setFoot(p, { legend, wordmark })`.

- [ ] **Step 1: Margins mirror around the staple corner**

In `template/sheet.css` replace the `.page` padding rules:

```css
/* Stapled upper right, printed duplex. Recto: staple corner top right, so the inner margin is on
   the right. Verso: mirrored. The outer margin is the thumb's. */
.page { padding: var(--m-top) var(--m-inner) var(--m-bottom) var(--m-outer); }
.page.verso { padding-left: var(--m-inner); padding-right: var(--m-outer); }
.frame-foot { left: var(--m-outer); right: var(--m-inner); }
.page.verso .frame-foot { left: var(--m-inner); right: var(--m-outer); }
#stage { padding: 0 var(--m-inner) 0 var(--m-outer); }
```

- [ ] **Step 2: Head and foot place the important item away from the staple**

In `render.js` replace `newPage` and `setHead`:

```js
  function newPage(kind) {
    pageCount++;
    const recto = pageCount % 2 === 1;
    const page = el("section", `page ${kind || ""} ${recto ? "recto" : "verso"}`);
    page.dataset.kind = kind || "";
    const head = el("header", "frame-head");
    const left = el("span", "head-left");
    const right = el("span", "head-right");
    head.append(left, right);
    const body = el("div", "page-body");
    const foot = el("footer", "frame-foot");
    page.append(head, body, foot);
    root.append(page);
    const p = { page, head, left, right, body, foot, recto };
    setFoot(p, {});
    return p;
  }

  // The staple corner is top right on a recto, top left on a verso. The verse range goes in the
  // free corner; the Shabbat name sits under the staple, where losing it costs nothing.
  function setHead(p, shabbat, range) {
    const flag = DRAFT ? '<span class="draft-flag">draft for review</span>' : "";
    const name = `<span class="shabbat">${esc(shabbat)}</span>`;
    const rng = `<span class="range">${esc(range || "")}</span>`;
    p.left.innerHTML = (p.recto ? rng : name) + (p.recto ? "" : flag);
    p.right.innerHTML = (p.recto ? name : rng) + (p.recto ? flag : "");
  }

  // Folio away from the staple (recto bottom left, verso bottom right); the other side carries
  // either the micro-legend (text pages) or the wordmark and tagline (front page).
  function setFoot(p, { legend, wordmark }) {
    const folio = `<span class="folio">${pageCount}</span>`;
    let other = "";
    if (wordmark) other = `<span class="wm-block"><span class="wm">${WORDMARK}</span><span class="tagline">${TAGLINE}</span></span>`;
    else if (legend) other = `<span class="micro-legend">${legend}</span>`;
    p.foot.innerHTML = p.recto ? folio + other : other + folio;
  }
```

`.frame-head .range { font-variant-numeric: lining-nums; font-style: normal; } .frame-head .shabbat { font-style: italic; }` in the CSS; drop the old `.head-left { font-style: italic }` rule so style follows content, not side.

- [ ] **Step 3: Text pages get the micro-legend**

In `renderTextPage`, after `setHead(p, shabbatName(), …)`, add:

```js
    setFoot(p, { legend: microLegend() });
```

and define once:

```js
  function microLegend() {
    return usedRegisters().map(k => `<span>${SIGLA[k]}${REGISTER_NAMES[k]}</span>`).join("");
  }
```

CSS:

```css
.frame-foot .micro-legend { display: inline-flex; gap: 10pt; }
.frame-foot .micro-legend svg { width: 6pt; height: 6pt; vertical-align: -0.3pt; margin-right: 3pt; color: var(--rubric); }
.frame-foot .wm-block { display: flex; flex-direction: column; line-height: 1.35; }
.frame-foot .wm { color: var(--ink); font-size: var(--size-text); letter-spacing: 0.01em; }
.frame-foot .tagline { color: var(--ink-2); }
.frame-foot .folio { color: var(--ink); }
```

End-matter pages (`buildEndMatter`) call `setFoot(p, { legend: microLegend() })` too; the front page calls `setFoot(p, { wordmark: true })` (Task 6).

- [ ] **Step 4: Rebuild, check both faces**

Run: `node scripts/build.mjs weeks/2026-10-10-bereshit-machar-chodesh --png --no-pdf`
Expected: page 2 (verso): folio bottom right, verse range top right, Shabbat name top left, wider margin on the right; page 3 (recto): folio bottom left, verse range top left, wider margin on the left. Nothing sits in the top corner nearest the staple except the Shabbat name.

- [ ] **Step 5: Commit**

```bash
git add template/render.js template/sheet.css
git commit -m "Frame mirrors around the upper-right staple; micro-legend in the text-page footer

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: The front page

**Files:**
- Create: `template/voices.json`
- Modify: `template/lib.js` (`voicesFor`, `fitIncipitSize`), `template/render.js` (`buildCover` → `buildFrontPage`), `template/sheet.css` (front page section), `scripts/build.mjs` (inject voices), `tests/lib.test.mjs`

**Interfaces:**
- Consumes: `openingNote`, `series`, `signoff`, `usedRegisters()`, `setFoot`.
- Produces: `voicesFor(commentary, voices, isVisible) → [{ name, line }]`; `fitIncipitSize(widthAt60pt, boxWidth) → { size, lines }`; `window.SHEET_OPTIONS.voices` (the parsed `voices.json`).

- [ ] **Step 1: Write the failing tests**

```js
test("voicesFor introduces each named source once, in order of first use, skipping drafted titles", () => {
  const voices = { "Rashi": "Rashi (R. Shlomo Yitzchaki), Troyes, 1040–1105", "Talmud": "The Babylonian Talmud, c. 200–500 CE" };
  const commentary = [
    { register: "traditional", source: "Talmud, Megillah 31a", status: "approved" },
    { register: "traditional", source: "Rashi", status: "approved" },
    { register: "traditional", source: "Rashi", status: "approved" },
    { register: "critical", source: "A damaged verse", status: "approved" },
    { register: "traditional", source: "Radak", status: "approved" },
    { register: "traditional", source: "Malbim", status: "proposed" },
  ];
  const r = lib.voicesFor(commentary, voices, e => e.status === "approved");
  assert.deepEqual(r.map(v => v.name), ["Talmud, Megillah 31a", "Rashi", "Radak"]);
  assert.equal(r[1].line, voices.Rashi);
  assert.equal(r[2].line, null);
});

test("fitIncipitSize shrinks to the box and falls back to two lines at 54pt", () => {
  assert.deepEqual(lib.fitIncipitSize(300, 336), { size: 60, lines: 1 });   // fits at 60
  assert.deepEqual(lib.fitIncipitSize(400, 336), { size: 50, lines: 1 });   // 60 * 336/400 = 50.4 → 50
  assert.deepEqual(lib.fitIncipitSize(600, 336), { size: 54, lines: 2 });   // would need 33pt: two lines instead
  assert.deepEqual(lib.fitIncipitSize(250, 336), { size: 64, lines: 1 });   // never above 64
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm test` → FAIL, `lib.voicesFor is not a function`.

- [ ] **Step 3: Implement in `template/lib.js`**

```js
  // One line per named source used this week, in order of first use. Drafted titles (critical
  // and reference entries) are not voices. Unknown sources return line: null so the build can warn.
  function voicesFor(commentary, voices, isVisible) {
    const seen = new Map();
    for (const e of commentary || []) {
      if (!isVisible(e)) continue;
      if (e.register === "critical" || e.register === "reference") continue;
      const name = String(e.source || "").trim();
      if (!name || seen.has(name)) continue;
      const key = Object.keys(voices || {}).find(k => name.toLowerCase().startsWith(k.toLowerCase()));
      seen.set(name, { name, line: key ? voices[key] : null });
    }
    return [...seen.values()];
  }

  // The incipit fits a 3.5in box: 64pt at most, 48pt at least on one line; otherwise two lines at 54pt.
  function fitIncipitSize(widthAt60pt, boxWidth) {
    const size = Math.floor(60 * boxWidth / widthAt60pt);
    if (size >= 64) return { size: 64, lines: 1 };
    if (size >= 48) return { size, lines: 1 };
    return { size: 54, lines: 2 };
  }
```

- [ ] **Step 4: Run to verify they pass**

Run: `npm test` → all passing.

- [ ] **Step 5: `template/voices.json`**

```json
{
  "Rashi": "Rashi (R. Shlomo Yitzchaki), Troyes, 1040–1105",
  "Radak": "Radak (R. David Kimchi), Narbonne, c. 1160–1235",
  "Metzudat David": "Metzudat David (R. David Altschuler and his son Yechiel), Prague and Galicia, 18th century",
  "Metzudat Zion": "Metzudat Zion (R. David Altschuler and his son Yechiel), Prague and Galicia, 18th century",
  "Malbim": "Malbim (R. Meir Leibush Wisser), Eastern Europe, 1809–1879",
  "Abarbanel": "Don Isaac Abarbanel, Lisbon, Naples and Venice, 1437–1508",
  "Ralbag": "Ralbag (Gersonides), Provence, 1288–1344",
  "Ibn Ezra": "Abraham ibn Ezra, Spain, Italy and France, 1089–1167",
  "Targum Jonathan": "Targum Jonathan, the Aramaic translation of the Prophets, Land of Israel and Babylonia, 1st–4th centuries CE",
  "Talmud": "The Babylonian Talmud, Babylonia, c. 200–500 CE",
  "Mishnah": "The Mishnah, Land of Israel, c. 200 CE",
  "Midrash": "Rabbinic midrash, Land of Israel, 3rd–10th centuries CE",
  "Steinsaltz": "Rabbi Adin Steinsaltz, Jerusalem, 1937–2020",
  "Fox": "Everett Fox, translator of the Hebrew Bible, Clark University, b. 1947"
}
```

In `scripts/build.mjs`, read it and pass it: after `const logo = await findLogo();` add `const voices = JSON.parse(await readFile(join(ROOT, "template", "voices.json"), "utf8"));` and change the options to `JSON.stringify({ draft: DRAFT, logo, voices })`.

- [ ] **Step 6: Rewrite `buildCover` as `buildFrontPage` in `render.js`**

```js
  function buildFrontPage() {
    const p = newPage("front");
    setHead(p, series.name, `Haftarah · ${seriesLabel}`);
    setFoot(p, { wordmark: true });

    // Hero: the mural sits at a fixed height; the incipit block centres on it.
    const hero = el("div", "hero" + (opts.logo ? "" : " no-mark"));
    if (opts.logo) { const img = el("img", "mark"); img.src = opts.logo; img.alt = ""; hero.append(img); }
    const inc = el("div", "incipit-block");
    const h1 = el("h1", "incipit", divineName(data.haftarah.incipit?.he || ""));
    inc.append(h1);
    if (data.haftarah.incipit?.en) inc.append(el("p", "incipit-en", esc(data.haftarah.incipit.en)));
    const rl = el("div", "reading-line");
    rl.innerHTML =
      `<div class="ref">${esc(dash(data.haftarah.ref))}</div>` +
      `<div class="shabbat">${esc(shabbatName())}</div>` +
      `<div class="dates">${esc(data.shabbat.civilDisplay)}&nbsp;&nbsp;<span class="he-date">${esc(data.shabbat.hebrew || "")}</span></div>`;
    inc.append(rl);
    hero.append(inc);
    p.body.append(hero);

    // Fit the incipit: measure at 60pt on one line, then size to a 3.5in box.
    h1.style.whiteSpace = "nowrap";
    h1.style.fontSize = "60pt";
    const fit = L.fitIncipitSize(h1.getBoundingClientRect().width, 3.5 * 96);
    h1.style.fontSize = fit.size + "pt";
    h1.style.whiteSpace = fit.lines === 2 ? "normal" : "nowrap";
    if (fit.lines === 2) h1.style.lineHeight = "1.3";
    p.page.dataset.incipit = `${fit.size}pt/${fit.lines}`;

    // Opening note: calendar paragraph(s), hairline, setting paragraph(s).
    const note = el("div", "opening-note" + (openingNote.status && openingNote.status !== "approved" ? " proposed" : ""));
    const cal = paras(openingNote.calendar), set = paras(openingNote.setting);
    cal.forEach(t => note.append(el("p", "cal", t)));
    set.forEach((t, i) => note.append(el("p", i === 0 && cal.length ? "setting rule" : "setting", t)));
    p.body.append(note);

    // Legend: always the same four, in the same order; unused ones greyed; then the keys.
    const used = new Set(usedRegisters());
    const legend = el("div", "legend");
    L.REGISTER_ORDER.forEach(k => legend.append(el("span", used.has(k) ? "" : "unused", `${SIGLA[k]}${REGISTER_NAMES[k]}`)));
    const hasKeys = (document.documentElement.dataset.keys || "").length > 0;
    legend.append(el("span", hasKeys ? "" : "unused", `<span class="k">a–z</span>translators’ notes (JPS) and word notes, in the margin`));
    if (data.verses.some(v => /\[[^\]]*\]\s*\([^)]*\)|\([^)]*\)\s*\[[^\]]*\]/.test(v.he))) {
      legend.append(el("span", "", `<span class="k">[ ] ( )</span>read / written: where tradition reads a word differently from its spelling`));
    }
    p.body.append(legend);

    // Voices on this sheet.
    const voices = L.voicesFor(data.commentary || [], opts.voices || {}, visible);
    if (voices.length) {
      const vb = el("div", "voices");
      vb.append(el("h2", null, "Voices on this sheet"));
      const list = el("div", "voices-list");
      voices.forEach(v => list.append(el("p", null, `<span class="name">${esc(v.name)}</span>${v.line ? ` ${esc(v.line)}` : ""}`)));
      vb.append(list);
      p.body.append(vb);
      document.documentElement.dataset.voicesMissing = voices.filter(v => !v.line).map(v => v.name).join("|");
    }

    const prov = el("div", "provenance");
    prov.innerHTML =
      `<span class="editions">Hebrew: ${esc(data.haftarah.versions.he)}. English: ${esc(data.haftarah.versions.en)}.</span> ` +
      `<span class="signoff">${signoff}</span>` +
      (data.credits?.editor && data.credits?.signoff ? ` <span class="signature">— ${esc(data.credits.editor)}</span>` : "");
    p.body.append(prov);

    p.page.dataset.overflow = String(p.body.scrollHeight > p.body.clientHeight + 1);
  }
```

The keys legend needs `data-keys` to exist before the front page is built, so in `run()` call `buildTextPages` before `buildFrontPage` is **not** possible (page order). Instead compute keys first: move the `L.assignKeys(...)` call from `buildTextPages` into `run()` before `buildFrontPage()`, storing the result on `data.verses` as Task 3 does.

Delete the old context-page spill (the `if (p.body.scrollHeight > …)` block). An overflowing front page is reported by `check.mjs` (Task 9) as an error: the fix is a shorter note, which is Daniel's call, not the template's.

- [ ] **Step 7: CSS for the front page** (replace the prototype's Cover section)

```css
/* ---- Front page ---------------------------------------------------------- */

.front .page-body { display: flex; flex-direction: column; }

/* The mural's top sits 1.6in from the trim whatever the incipit does. */
.hero {
  display: grid;
  grid-template-columns: 2.4in 1fr;
  column-gap: 0.4in;
  align-items: center;
  margin-top: calc(1.6in - var(--m-top) - var(--head-h) - 14pt);
}
.hero.no-mark { grid-template-columns: 1fr; }
.hero .mark { width: 2.4in; height: 2.4in; display: block; object-fit: contain; }
.incipit-block { text-align: right; direction: rtl; }
.incipit { font-family: var(--hebrew); font-size: var(--size-incipit); line-height: 1.2; color: var(--ink); margin: 0; text-wrap: balance; }
.incipit-en { direction: ltr; text-align: right; font-size: var(--size-text); font-style: italic; line-height: 1.3; margin: 10pt 0 0; }
.reading-line { direction: ltr; text-align: right; margin-top: 14pt; font-size: var(--size-text); line-height: 1.5; font-variant-numeric: lining-nums; }
.reading-line .ref { color: var(--rubric); font-weight: 600; }
.reading-line .shabbat { color: var(--ink); }
.reading-line .dates { color: var(--ink-2); }
.reading-line .he-date { font-family: var(--hebrew); font-size: calc(var(--size-text) * 1.18); }

.opening-note { margin-top: 20pt; font-size: var(--size-text); line-height: var(--lh-en); max-width: 5.4in; }
.opening-note p { margin: 0 0 6pt; }
.opening-note p:last-child { margin-bottom: 0; }
.opening-note p.rule { border-top: var(--rule-w) solid var(--rule); padding-top: 7pt; margin-top: 12pt; }
.opening-note.proposed { background: #f3eced; outline: 4pt solid #f3eced; }

.legend { margin-top: 14pt; font-size: var(--size-gloss); color: var(--ink-2); display: flex; flex-wrap: wrap; gap: 4pt 14pt; align-items: center; }
.legend svg { width: 7pt; height: 7pt; vertical-align: -0.5pt; margin-right: 4pt; color: var(--rubric); }
.legend .k { color: var(--rubric); font-style: italic; margin-right: 4pt; }
.legend .unused { color: #a6a6a6; }
.legend .unused svg { color: #a6a6a6; }

.voices { margin-top: 14pt; max-width: 6.4in; }
.voices h2 { font-size: var(--size-gloss); font-weight: 600; margin: 0 0 3pt; color: var(--ink); letter-spacing: 0.02em; }
.voices-list { columns: 2; column-gap: 0.28in; font-size: var(--size-gloss); line-height: 1.32; color: var(--ink-2); }
.voices-list p { margin: 0 0 2pt; break-inside: avoid; }
.voices-list .name { color: var(--rubric); font-weight: 500; }

.provenance { margin-top: auto; padding-top: 12pt; margin-bottom: 0.34in; font-size: var(--size-gloss); line-height: 1.4; color: var(--ink-2); max-width: 6.2in; }
.provenance .signature { color: var(--ink); font-style: italic; white-space: nowrap; }
```

Rename the page class: `newPage("front")` → `.front`; update any `.cover` selectors left (`.cover .frame-foot …` rules are replaced by Task 5's foot rules).

- [ ] **Step 8: Drafted titles in red italic**

In `buildEntry`, change the source span to `<span class="src${e.register === "critical" || e.register === "reference" ? " drafted" : ""}">…</span>` and add `.entry .src.drafted { font-style: italic; font-weight: 500; }`.

- [ ] **Step 9: Rebuild both weeks and look**

Run: `node scripts/build.mjs weeks/2026-10-10-bereshit-machar-chodesh --png --no-pdf && node scripts/build.mjs weeks/2026-10-10-bereshit-isaiah --png --no-pdf`
Expected: on both covers the mural's top is at the same height; Isaiah's incipit is on one line at 48–60pt or on two lines at 54pt; the legend shows four sigla with the unused ones grey plus the keys line; "Voices on this sheet" lists the named commentators; the footer carries the wordmark and tagline on the left (recto) and nothing on the right but the folio; the running head says "Torah from Scratch" and "Haftarah · 5787 · No. 3" once. Text starts at the top of page 2.

- [ ] **Step 10: Commit**

```bash
git add template/voices.json template/lib.js template/render.js template/sheet.css scripts/build.mjs tests/lib.test.mjs
git commit -m "Front page: fixed mural, fitted incipit, stable legend, voices, provenance once

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: Paginator v2

**Files:**
- Modify: `template/render.js` (`buildTextPages`, `renderTextPage`, `buildEntry`), `template/sheet.css` (split rows)

**Interfaces:**
- Consumes: `rows` (with `.node`, `.notes`, `.h`, `.mt`, `.noteH`), `entriesFor(v)`, `measureApparatus`, `stackNotes`.
- Produces: per text page `data-rows`, `data-gap` (px between the lowest text or note and the apparatus rule; `-1` without apparatus), `data-fill` (percent of the body height used), `data-split` (`""`, `"head"`, `"tail"`, `"both"`), `data-cont` (entries labelled `(cont.)`), `data-offpage` (entries labelled `· p. N`); `versePage` map `"20:30" → 3`.

Rules, in the order the loop applies them:

1. **Entries carry a page pointer.** An entry printed on a later page than its verse is labelled `30 · p. 3` in the tail grey. `(cont.)` is used only when one entry's text is split across two apparatuses (which this renderer never does; the label stays available for a future split and `data-cont` must be 0).
2. **No one-verse pages.** While a page holds one row and the next row does not fit, pop entries from the page's apparatus into `carry` (front) until the next row fits or the apparatus is empty.
3. **Move the verse with its entries.** When a page's last row spilled every one of its entries and the row is shorter than 1.2in (115px), the row moves to the next page too, unless it is the page's only row.
4. **Split a long verse.** When the loop stops because the next row does not fit and the remaining gap above the apparatus rule exceeds 0.5in (48px), split that row: the head stays, the tail opens the next page. Each cell is clipped at its own line boundary so no line is cut.
5. **Last text page.** No rule forces anything onto a page that would otherwise be empty; the last page may be short.

- [ ] **Step 1: Entry labels**

Replace `buildEntry(e, continued)` with `buildEntry(e, { offpage })`:

```js
  function buildEntry(e, { offpage = null } = {}) {
    const reg = SIGLA[e.register] ? e.register : "traditional";
    const entry = el("p", "entry" + (e.status !== "approved" ? " proposed" : ""));
    const vr = e.verseEnd ? `${e.verse}–${e.verseEnd}` : String(e.verse);
    const where = offpage ? `<span class="where"> · p. ${offpage}</span>` : "";
    const lemma = e.lemma ? `<span class="lem${e.lemmaLang === "he" ? " he-lemma" : ""}">${esc(e.lemma)}</span><span class="brk">]</span>` : "";
    const tailBits = [];
    if (e.sourceRef) tailBits.push(esc(dash(e.sourceRef)));
    if (e.translation === "claude") tailBits.push("translated for this sheet");
    else if (e.translation) tailBits.push(esc(e.translation));
    if (e.register === "critical" && e.kind !== "quotation") tailBits.push("summary drafted for this sheet");
    if (e.cites) tailBits.push(e.cites);
    const drafted = e.register === "critical" || e.register === "reference";
    entry.innerHTML =
      `<span class="sig" title="${REGISTER_NAMES[reg]}">${SIGLA[reg]}</span>` +
      `<span class="v">${vr}${where}</span>${lemma} ` +
      `<span class="src${drafted ? " drafted" : ""}">${esc(e.source)}</span>` +
      `<span class="body">${divineName(e.text)}</span>` +
      (tailBits.length ? ` <span class="tail">${tailBits.join("; ")}.</span>` : "");
    return entry;
  }
```

CSS: `.entry .v .where { font-weight: 400; font-style: italic; color: var(--ink-2); font-size: var(--size-gloss); }` and delete the `.entry.continued` rule.

- [ ] **Step 2: The loop**

Replace the `while (i < rows.length || carry.length)` loop in `buildTextPages` with:

```js
    const versePage = {};
    const keyOf = v => `${v.chapter}:${v.verse}`;
    const PX_IN = 96, GAP_MAX = 0.5 * PX_IN, MOVE_MAX = 1.2 * PX_IN;
    let i = 0, carry = [], lastPage = null, pendingTail = null;

    while (i < rows.length || carry.length || pendingTail) {
      const p = newPage("text");
      lastPage = p;
      const pageRows = [], rowTops = [];
      let pageEntries = carry.slice(); carry = [];
      let textH = 0, spilling = false;

      if (pendingTail) { pageRows.push(pendingTail); rowTops.push(0); textH = pendingTail.h; pendingTail = null; }

      while (pageEntries.length > 1 && appHeight(pageEntries) > bodyH) carry.unshift(pageEntries.pop());
      if (carry.length) spilling = true;

      while (i < rows.length && !spilling) {
        const r = rows[i];
        const top = pageRows.length ? textH : 0;
        const rowH = pageRows.length ? r.h : r.h - r.mt;
        const tryText = textH + rowH;
        let appH = appHeight(pageEntries);
        const notes = stackNotes(rowTops.concat(top), pageRows.concat(r));
        let fits = tryText + appH <= bodyH && notes.bottom + appH <= bodyH;
        // Rule 2: never leave one verse alone because its apparatus is fat.
        while (!fits && pageRows.length === 1 && pageEntries.length) {
          carry.unshift(pageEntries.pop());
          appH = appHeight(pageEntries);
          fits = tryText + appH <= bodyH && notes.bottom + appH <= bodyH;
        }
        if (!fits && pageRows.length) break;
        pageRows.push(r); rowTops.push(top); textH = tryText; i++;
        versePage[keyOf(r.v)] = pageCount;
        for (const x of entriesFor(r.v)) {
          if (spilling) { carry.push(x); continue; }
          const tryEntries = pageEntries.concat(x);
          const tryApp = appHeight(tryEntries);
          const ok = textH + tryApp <= bodyH && notes.bottom + tryApp <= bodyH;
          if (ok || (pageEntries.length === 0 && pageRows.length === 1)) pageEntries = tryEntries;
          else { spilling = true; carry.push(x); }
        }
      }

      // Rule 3: a short last row that lost all its entries goes with them.
      if (pageRows.length > 1) {
        const last = pageRows[pageRows.length - 1];
        const own = entriesFor(last.v);
        if (own.length && own.every(x => carry.includes(x)) && last.h < MOVE_MAX) {
          pageRows.pop(); rowTops.pop(); i--; delete versePage[keyOf(last.v)];
          carry = own.concat(carry.filter(x => !own.includes(x)));
          textH -= last.h;
        }
      }

      let placed = renderTextPage(p, pageRows, pageEntries, bodyH, versePage);
      while (placed.overflow > 0 && (pageRows.length > 1 || pageEntries.length > 1)) {
        if (pageRows.length > 1) {
          const r = pageRows.pop(); i--; delete versePage[keyOf(r.v)];
          const own = entriesFor(r.v);
          pageEntries = pageEntries.filter(x => !own.includes(x));
          carry = own.filter(x => !carry.includes(x)).concat(carry);
        } else {
          carry.unshift(pageEntries.pop());
        }
        placed = renderTextPage(p, pageRows, pageEntries, bodyH, versePage);
      }

      // Rule 4: a gap over half an inch and a row waiting: split the row at a line boundary.
      if (i < rows.length && !spilling && placed.gap > GAP_MAX) {
        const budget = placed.gap - RULE_GAP - 8;
        const split = splitRow(rows[i], budget);
        if (split) {
          pageRows.push(split.head); rowTops.push(textH);
          versePage[keyOf(rows[i].v)] = pageCount;
          for (const x of entriesFor(rows[i].v)) carry.push(x);
          pendingTail = split.tail;
          i++;
          placed = renderTextPage(p, pageRows, pageEntries, bodyH, versePage);
          if (placed.overflow > 0) {           // the head did not fit after all: undo
            pageRows.pop(); rowTops.pop(); i--; delete versePage[keyOf(rows[i].v)];
            carry = carry.filter(x => !entriesFor(rows[i].v).includes(x));
            pendingTail = null;
            placed = renderTextPage(p, pageRows, pageEntries, bodyH, versePage);
          }
        }
      }
      p.leftover = placed.leftover; p.grid = placed.grid;
    }
    return lastPage;
```

`appHeight` and `RULE_GAP` already exist above the loop; keep them.

- [ ] **Step 3: `renderTextPage` gets the page map and writes the data attributes**

```js
  function renderTextPage(p, pageRows, pageEntries, bodyH, versePage) {
    p.body.innerHTML = "";
    const grid = el("div", "text-grid");
    pageRows.forEach((r, k) => { r.node.classList.toggle("first", k === 0); if (r.node.setLocator) r.node.setLocator(k === 0); grid.append(r.node); });
    p.body.append(grid);

    const bodyRect = p.body.getBoundingClientRect();
    const realTops = pageRows.map(r => r.node.getBoundingClientRect().top - bodyRect.top);
    const stacked = stackNotes(realTops, pageRows);
    if (stacked.placed.length) {
      const col = el("div", "margin-col");
      stacked.placed.forEach(({ node, top }) => { node.style.top = top + "px"; col.append(node); });
      p.body.append(col);
    }

    const here = new Set(pageRows.map(r => `${r.v.chapter}:${r.v.verse}`));
    let appTop = bodyH, offpage = 0;
    if (pageEntries.length) {
      const app = el("div", "apparatus");
      pageEntries.forEach(x => {
        const k = `${x.e.chapter || pageRows[0]?.v.chapter}:${x.e.verse}`;
        if (here.has(k)) app.append(x.node);
        else { offpage++; app.append(buildEntry(x.e, { offpage: versePage[k] || null })); }
      });
      p.body.append(app);
      appTop = app.getBoundingClientRect().top - bodyRect.top;
    }
    const gridBottom = pageRows.length ? grid.getBoundingClientRect().bottom - bodyRect.top : 0;
    const contentBottom = Math.max(gridBottom, stacked.bottom);
    const overflow = contentBottom + (pageEntries.length ? RULE_GAP : 0) - appTop;
    const gap = pageEntries.length ? appTop - contentBottom : bodyH - contentBottom;

    const first = pageRows[0]?.v, last = pageRows[pageRows.length - 1]?.v;
    const range = first ? (first === last ? `${first.chapter}:${first.verse}` : first.chapter === last.chapter ? `${first.chapter}:${first.verse}–${last.verse}` : `${first.chapter}:${first.verse}–${last.chapter}:${last.verse}`) : "";
    setHead(p, shabbatName(), range ? `${data.haftarah.book} ${range}` : "Commentary, continued");
    setFoot(p, { legend: microLegend() });

    const used = pageEntries.length ? bodyH - gap + (gridBottom ? 0 : 0) : contentBottom;
    p.page.dataset.rows = String(pageRows.length);
    p.page.dataset.gap = String(Math.round(pageEntries.length ? gap : -1));
    p.page.dataset.fill = String(Math.round(100 * (pageEntries.length ? (contentBottom + (bodyH - appTop)) : contentBottom) / bodyH));
    p.page.dataset.split = pageRows.some(r => r.splitHead) && pageRows.some(r => r.splitTail) ? "both" : pageRows.some(r => r.splitHead) ? "head" : pageRows.some(r => r.splitTail) ? "tail" : "";
    p.page.dataset.cont = "0";
    p.page.dataset.offpage = String(offpage);
    p.page.dataset.leftover = String(Math.round(-overflow));
    return { overflow, leftover: -overflow, grid, gap };
  }
```

- [ ] **Step 4: `splitRow`**

Add to `render.js` (above `buildTextPages`):

```js
  // Line boxes of a cell's inner block, as [top, bottom] pairs relative to the cell.
  function lineBoxes(cell) {
    const inner = cell.querySelector(".inner") || cell;
    const range = document.createRange();
    range.selectNodeContents(inner);
    const top0 = cell.getBoundingClientRect().top;
    const lines = [];
    for (const r of range.getClientRects()) {
      const t = r.top - top0, b = r.bottom - top0;
      const last = lines[lines.length - 1];
      if (last && Math.abs(last[0] - t) < 2) { last[1] = Math.max(last[1], b); }
      else lines.push([t, b]);
    }
    return lines.sort((a, b) => a[0] - b[0]);
  }

  // Split a row so that its head fits in `budget` px. Each cell is clipped at a line boundary of its
  // own. Returns null when fewer than two lines of either language would stay on the head, or when
  // fewer than one line would move to the tail.
  function splitRow(r, budget) {
    stage.append(r.node);
    const en = r.node.querySelector(".en"), he = r.node.querySelector(".he");
    const enL = lineBoxes(en), heL = lineBoxes(he);
    const cut = lines => { let k = 0; while (k < lines.length && lines[k][1] <= budget) k++; return k; };
    const kEn = cut(enL), kHe = cut(heL);
    stage.removeChild(r.node);
    if (kEn < 2 || kHe < 2 || (kEn >= enL.length && kHe >= heL.length)) return null;
    const hEn = kEn < enL.length ? enL[kEn][0] : enL[enL.length - 1][1];
    const hHe = kHe < heL.length ? heL[kHe][0] : heL[heL.length - 1][1];

    const head = r.node;                     // keep the original (its notes point at it)
    head.classList.add("split-head");
    head.querySelector(".en").style.setProperty("--clip", hEn + "px");
    head.querySelector(".he").style.setProperty("--clip", hHe + "px");

    const tailNode = r.node.cloneNode(true);
    tailNode.classList.remove("split-head", "first");
    tailNode.classList.add("split-tail");
    tailNode.querySelector(".en").style.setProperty("--clip", hEn + "px");
    tailNode.querySelector(".he").style.setProperty("--clip", hHe + "px");
    tailNode.querySelector(".gut").innerHTML = `<span class="ch">${r.v.chapter}:${r.v.verse}</span><span class="cont">${r.v.verse}</span>`;
    tailNode.setLocator = () => {};
    stage.append(tailNode);
    const tailH = tailNode.getBoundingClientRect().height;
    stage.removeChild(tailNode);

    const headRow = Object.assign({}, r, { node: head, h: Math.max(hEn, hHe), splitHead: true });
    const tailRow = { v: r.v, node: tailNode, notes: [], noteH: [], h: tailH, mt: 0, splitTail: true };
    return { head: headRow, tail: tailRow };
  }
```

CSS:

```css
.verse-row.split-head .en, .verse-row.split-head .he { height: var(--clip); overflow: hidden; }
.verse-row.split-tail .en, .verse-row.split-tail .he { overflow: hidden; }
.verse-row.split-tail .en .inner, .verse-row.split-tail .he .inner { margin-top: calc(-1 * var(--clip)); }
.verse-row.split-tail .gut .cont { color: var(--ink-2); font-weight: 400; }
```

Because `stackNotes` uses `r.notes` and `r.noteH`, the head keeps the notes and the tail has none.

- [ ] **Step 5: Rebuild both weeks and verify by eye and by data**

Run: `node scripts/build.mjs weeks/2026-10-10-bereshit-isaiah --png --no-pdf && node -e "const s=require('fs').readFileSync('weeks/2026-10-10-bereshit-isaiah/sheet.html','utf8');console.log(s.length)"`

Then open `weeks/2026-10-10-bereshit-isaiah/sheet.html` in Chrome, and in the console run:

```js
[...document.querySelectorAll(".page.text")].map(p => [p.dataset.rows, p.dataset.gap, p.dataset.fill, p.dataset.split, p.dataset.offpage].join(" / "))
```

Expected: every text page except the last has `gap ≤ 48`; no text page has `rows = 1` unless it is the last; pages that split show `head` then `tail` on the next; Samuel page 4's verse-30 entries read `30 · p. 3` if verse 30 stayed on page 3, or verse 30 moved to page 4 with them.

- [ ] **Step 6: Commit**

```bash
git add template/render.js template/sheet.css
git commit -m "Paginator v2: page pointers instead of (cont.), no one-verse pages, verse moves with its entries, split long verses at a line

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: End matter and the next-week line

**Files:**
- Modify: `template/render.js` (`endBlocks`, `buildEndMatter`), `template/sheet.css` (`.nextweek`)

**Interfaces:**
- Consumes: `data.glossary`, `data.nextWeek`, `signoff`, `series`, `visible`.
- Produces: root `data-empty-sections` (count of end headings with no items, must be 0), per end page `data-fill`; the colophon never alone on a page.

- [ ] **Step 1: `endBlocks`**

```js
  function endBlocks() {
    const blocks = [];
    const terms = (data.glossary || []).filter(t => !t.status || visible(t));
    if (terms.length) {
      const b = el("div", "block");
      b.append(el("h2", null, "Names and places"));
      const g = el("div", "glossary");
      for (const t of terms) g.append(el("p", null, `<span class="term">${esc(t.term)}</span>${t.he ? `<span class="term-he">${divineName(esc(t.he))}</span>` : ""} ${divineName(t.text)}`));
      b.append(g); blocks.push(b);
    }
    const col = el("div", "block colophon");
    col.append(el("h2", null, "About this sheet"));
    col.append(el("p", null, `Hebrew text: ${esc(data.haftarah.versions.he)}; English: ${esc(data.haftarah.versions.en)}; both via Sefaria. Commentary as credited in each entry.`));
    col.append(el("p", null, `${esc(data.credits?.issuedBy || "")} · ${esc(series.name)} · ${esc(seriesLabel)}`));
    blocks.push(col);
    if (data.nextWeek && visible(data.nextWeek)) {
      const nw = data.nextWeek;
      const line = `Next week: ${esc(nw.shabbat)}${nw.special ? `, ${esc(nw.special.replace(/^Shabbat\s+/i, ""))}` : ""} · ${esc(dash(nw.ref))}${nw.civilDisplay ? ` · ${esc(nw.civilDisplay)}` : ""}`;
      blocks.push(el("p", "nextweek" + (nw.status !== "approved" ? " proposed" : ""), line));
    }
    document.documentElement.dataset.emptySections = "0";
    return blocks;
  }
```

(Empty sections cannot occur now; the attribute exists so `check.mjs` has one assertion shape for every version.)

- [ ] **Step 2: `buildEndMatter`: inline first, never a lone colophon**

```js
  function buildEndMatter(lastTextPage) {
    const blocks = endBlocks();
    const measure = node => { stage.append(node); const h = node.getBoundingClientRect().height + 16; node.remove(); return h; };
    const heights = blocks.map(b => measure(b.cloneNode(true)));
    // 1. Everything fits above the last apparatus: put it there.
    const total = heights.reduce((a, b) => a + b, 0) + 18;
    if (lastTextPage && lastTextPage.leftover > total + 8) {
      const wrap = el("div", "endmatter inline"); wrap.style.marginTop = "18pt";
      blocks.forEach(b => wrap.append(b));
      lastTextPage.grid.after(wrap);
      return;
    }
    // 2. Otherwise all end matter goes to a new page together (the colophon is never alone).
    const p = newPage("end");
    setHead(p, shabbatName(), dash(data.haftarah.ref));
    setFoot(p, { legend: microLegend() });
    const wrap = el("div", "endmatter");
    p.body.append(wrap);
    blocks.forEach(b => wrap.append(b));
    const used = wrap.getBoundingClientRect().height;
    p.page.dataset.fill = String(Math.round(100 * used / p.body.getBoundingClientRect().height));
    // A glossary too long for one page is a data problem; report it rather than hide it.
    p.page.dataset.overflow = String(p.body.scrollHeight > p.body.clientHeight + 1);
  }
```

Rule 2 means a last text page with 1.4in free and a 2in glossary yields an end page holding glossary and colophon together, which is the spec's second branch.

- [ ] **Step 3: CSS**

```css
.endmatter .nextweek { margin: 14pt 0 0; font-size: var(--size-text); color: var(--rubric); font-weight: 500; }
.endmatter .nextweek.proposed { background: #f3eced; outline: 3pt solid #f3eced; }
```

- [ ] **Step 4: Rebuild Isaiah and check the ending**

Run: `node scripts/build.mjs weeks/2026-10-10-bereshit-isaiah --png --no-pdf`
Expected: no "Names and places" heading without entries; no page whose only content is "About this sheet". (The Isaiah glossary is all `proposed`, so in a final build the end matter is the colophon only, and it rides under the last apparatus.)

- [ ] **Step 5: Commit**

```bash
git add template/render.js template/sheet.css
git commit -m "End matter: no empty sections, colophon never alone; next-week line behind approval

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: `scripts/check.mjs`: layout invariants and determinism

**Files:**
- Create: `scripts/check.mjs`, `tests/fixtures/week-min/sheet.json`
- Modify: `scripts/build.mjs` (export `findBrowser` and the common flags), `tests/lib.test.mjs` (a test that runs check on the fixture)

**Interfaces:**
- Consumes: `data-*` attributes from Tasks 3, 6, 7, 8.
- Produces: `node scripts/check.mjs weeks/<slug> [--draft]` exits 0 when every invariant holds, 1 with a list otherwise; `scripts/build.mjs` exports `findBrowser()` and `chromeFlags(profileDir)`.

- [ ] **Step 1: Make the build's browser helpers importable**

In `scripts/build.mjs` change `function findBrowser()` to `export function findBrowser()`, and extract the flag list:

```js
export function chromeFlags(profile) {
  const common = [
    "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
    "--allow-file-access-from-files", "--hide-scrollbars", `--user-data-dir=${profile}`,
    "--virtual-time-budget=12000", "--run-all-compositor-stages-before-draw",
  ];
  if (process.platform === "linux" && process.getuid?.() === 0) common.push("--no-sandbox");
  return common;
}
```

and guard `main()` so importing does not run it: `if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) main().catch(…)`.

Log the browser: in `main()` after `const browser = findBrowser();` add `console.log(\`Browser: ${browser}\`);`.

- [ ] **Step 2: The fixture week** `tests/fixtures/week-min/sheet.json` (English is the 1917 JPS, public domain; Hebrew is Miqra according to the Masorah, CC BY-SA)

```json
{
  "schema": 2,
  "slug": "fixture-min",
  "status": "approved",
  "series": { "name": "Torah from Scratch", "year": "5787", "number": 0 },
  "shabbat": { "civil": "2026-10-10", "civilDisplay": "October 10, 2026", "hebrew": "כ״ט בְּתִשְׁרֵי תשפ״ז", "hebrewEn": "29 Tishrei 5787", "parashah": { "en": "Bereshit", "he": "בְּרֵאשִׁית", "ref": "Genesis 1:1-6:8" }, "special": null },
  "haftarah": {
    "ref": "I Samuel 20:18-20", "heRef": null, "book": "I Samuel",
    "incipit": { "he": "מָחָ֣ר חֹ֑דֶשׁ", "en": "Tomorrow is the new moon" },
    "title": { "he": "מחר חדש", "en": "Machar Chodesh" },
    "defaultHaftarah": null,
    "versions": { "he": "Miqra according to the Masorah", "en": "JPS 1917 (fixture)" },
    "fetched": "2026-10-08T00:00:00.000Z"
  },
  "openingNote": { "calendar": "A fixture week for the tests.", "setting": ["Nothing here is for printing."], "status": "approved" },
  "verses": [
    { "ref": "I Samuel 20:18", "chapter": 20, "verse": 18, "he": "וַיֹּאמֶר־ל֥וֹ יְהוֹנָתָ֖ן מָחָ֣ר חֹ֑דֶשׁ וְנִפְקַ֕דְתָּ כִּ֥י יִפָּקֵ֖ד מוֹשָׁבֶֽךָ׃", "en": "And Jonathan said unto him: ‘To-morrow is the new moon; and thou wilt be missed, thy seat will be empty.<sup class=\"fn\">a</sup>", "notes": [{ "marker": "a", "lemma": "empty", "text": "See 20.25 and note." }], "break": null },
    { "ref": "I Samuel 20:19", "chapter": 20, "verse": 19, "he": "וְשִׁלַּשְׁתָּ֙ תֵּרֵ֣ד מְאֹ֔ד וּבָאתָ֙ אֶל־הַמָּק֔וֹם אֲשֶׁר־נִסְתַּ֥רְתָּ שָּׁ֖ם בְּי֣וֹם הַֽמַּעֲשֶׂ֑ה וְיָ֣שַׁבְתָּ֔ אֵ֖צֶל הָאֶ֥בֶן הָאָֽזֶל׃", "en": "And in the third day thou shalt hide thyself well, and come to the place where thou didst hide thyself in the day of work, and shalt remain by the stone Ezel.", "notes": [], "break": null },
    { "ref": "I Samuel 20:20", "chapter": 20, "verse": 20, "he": "וַ֨אֲנִ֜י שְׁלֹ֤שֶׁת הַחִצִּים֙ צִדָּ֣ה אוֹרֶ֔ה לְשַֽׁלַּֽח־לִ֖י לְמַטָּרָֽה׃", "en": "And I will shoot three arrows to the side-ward,<br>as though I shot at a mark.<sup class=\"fn\">b</sup>", "notes": [{ "marker": "b", "lemma": "mark", "text": "Lit. “target.”" }], "break": null }
  ],
  "glosses": [{ "verse": 18, "lemma": "וְנִפְקַ֕דְתָּ", "en": "thou wilt be missed", "text": "<i>nifkadta</i>: the empty seat is the plot.", "status": "approved" }],
  "commentary": [
    { "verse": 18, "register": "traditional", "source": "Rashi", "lemma": "thou wilt be missed", "text": "A fixture entry.", "sourceRef": "Rashi on I Samuel 20:18", "translation": "claude", "status": "approved", "order": 1 },
    { "verse": 19, "register": "critical", "source": "A fixture summary", "lemma": "the stone Ezel", "text": "A fixture summary.", "works": ["McCarter 1980"], "cites": "McCarter, <i>I Samuel</i>", "status": "approved", "order": 1 }
  ],
  "glossary": [{ "term": "Ezel", "he": "הָאָֽזֶל", "text": "A stone.", "status": "approved" }],
  "nextWeek": { "shabbat": "Noach", "special": null, "ref": "Isaiah 54:1-55:5", "civilDisplay": "October 17, 2026", "status": "approved" },
  "credits": { "issuedBy": "Central Reform Congregation", "editor": "Rabbi Daniel Bogard", "signoff": "A fixture." }
}
```

- [ ] **Step 3: `scripts/check.mjs`**

```js
#!/usr/bin/env node
/**
 * check.mjs — render a week twice with the pinned browser and assert the layout invariants the
 * design review asked for. Reads the data-* attributes render.js writes on <html> and each .page.
 *
 *   node scripts/check.mjs weeks/<slug> [--draft]
 */
import { readFile, mkdir, rm } from "node:fs/promises";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { findBrowser, chromeFlags } from "./build.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const dirArg = process.argv.slice(2).find(a => !a.startsWith("--"));
if (!dirArg) { console.error("usage: node scripts/check.mjs weeks/<slug> [--draft]"); process.exit(1); }
const DRAFT = process.argv.includes("--draft");
const weekDir = resolve(dirArg);
const html = join(weekDir, DRAFT ? "sheet-draft.html" : "sheet.html");

function dumpDom(browser, url) {
  return new Promise(async (res, rej) => {
    const profile = join(tmpdir(), `haftarah-check-${process.pid}-${Math.random().toString(36).slice(2)}`);
    await mkdir(profile, { recursive: true });
    const child = spawn(browser, [...chromeFlags(profile), "--dump-dom", url], { stdio: ["ignore", "pipe", "pipe"] });
    let out = "", err = "";
    child.stdout.on("data", d => (out += d));
    child.stderr.on("data", d => (err += d));
    child.on("error", rej);
    child.on("close", async code => { await rm(profile, { recursive: true, force: true }).catch(() => {}); code === 0 ? res(out) : rej(new Error(`dump-dom exited ${code}\n${err.slice(-500)}`)); });
  });
}

const attr = (tag, name) => { const m = tag.match(new RegExp(`\\sdata-${name}="([^"]*)"`)); return m ? m[1] : null; };

export function analyse(dom) {
  const rootTag = dom.match(/<html[^>]*>/)[0];
  const pages = [...dom.matchAll(/<section class="page[^"]*"[^>]*>/g)].map(m => m[0]);
  const summary = {
    pages: Number(attr(rootTag, "pages")),
    yy: Number(attr(rootTag, "yy")),
    keys: (attr(rootTag, "keys") || "").split(",").filter(Boolean),
    emptySections: Number(attr(rootTag, "empty-sections") || 0),
    voicesMissing: (attr(rootTag, "voices-missing") || "").split("|").filter(Boolean),
    page: pages.map(t => ({
      kind: attr(t, "kind"), rows: Number(attr(t, "rows") || 0), gap: Number(attr(t, "gap") || -1),
      fill: Number(attr(t, "fill") || 0), split: attr(t, "split") || "", cont: Number(attr(t, "cont") || 0),
      offpage: Number(attr(t, "offpage") || 0), overflow: attr(t, "overflow") === "true", incipit: attr(t, "incipit"),
    })),
    brInEnglish: (dom.match(/<div class="en[^"]*">[\s\S]*?<\/div>\s*<div class="gut"/g) || []).filter(s => /<br/i.test(s)).length,
  };
  const problems = [];
  const textPages = summary.page.filter(p => p.kind === "text");
  const lastText = textPages[textPages.length - 1];
  summary.page.forEach((p, i) => {
    const n = i + 1;
    if (p.overflow) problems.push(`page ${n}: content overflows the page`);
    if (p.kind === "text" && p !== lastText && p.gap > 48) problems.push(`page ${n}: ${p.gap}px gap above the apparatus (max 48)`);
    if (p.kind === "text" && p !== lastText && p.rows === 1 && !p.split) problems.push(`page ${n}: a single verse on a page`);
    if (p.kind !== "front" && p.fill < 15) problems.push(`page ${n}: only ${p.fill}% full`);
    if (p.cont > 0) problems.push(`page ${n}: ${p.cont} entries labelled (cont.)`);
    if (p.split === "tail" && i > 0 && !/head|both/.test(summary.page[i - 1].split)) problems.push(`page ${n}: a split tail with no head on page ${n - 1}`);
  });
  if (summary.emptySections) problems.push(`${summary.emptySections} end-matter heading(s) with no items`);
  if (summary.brInEnglish) problems.push(`${summary.brInEnglish} English cell(s) still contain <br>`);
  const seq = summary.keys;
  const expect = seq.map((_, i) => letterFor(i));
  if (seq.join() !== expect.join()) problems.push(`key series is ${seq.join("")} not ${expect.join("")}`);
  if (new Set(seq).size !== seq.length) problems.push("duplicate margin keys");
  if (summary.page[0]?.kind !== "front") problems.push("page 1 is not the front page");
  if (summary.page[1] && summary.page[1].kind !== "text") problems.push("the text does not start on page 2");
  return { summary, problems };
}

function letterFor(i) { let n = i + 1, s = ""; while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(97 + r) + s; n = Math.floor((n - 1) / 26); } return s; }

async function main() {
  const browser = findBrowser();
  if (!browser) { console.error("No Chrome or Edge found."); process.exit(1); }
  const url = pathToFileURL(html).href;
  const a = analyse(await dumpDom(browser, url));
  const b = analyse(await dumpDom(browser, url));
  const problems = a.problems.slice();
  if (JSON.stringify(a.summary) !== JSON.stringify(b.summary)) problems.push("two renders differ (pagination is not deterministic on this browser)");
  // The divine-name count in the render must equal the count in the data (verses plus incipit).
  const data = JSON.parse(await readFile(join(weekDir, "sheet.json"), "utf8"));
  const TETRA = /י[֑-ׇ]*ה[֑-ׇ]*ו[֑-ׇ]*ה[֑-ׇ]*/g;
  const yyExpected = [...data.verses.map(v => v.he), data.haftarah.incipit?.he || ""].reduce((n, h) => n + (String(h).match(TETRA) || []).length, 0);
  if (yyExpected !== a.summary.yy) problems.push(`divine name: ${a.summary.yy} replaced in the render, ${yyExpected} in the data`);
  console.log(`Browser: ${browser}`);
  console.log(`Pages: ${a.summary.pages}; divine name ${a.summary.yy}x; keys ${a.summary.keys.length}; voices without a line: ${a.summary.voicesMissing.join(", ") || "none"}`);
  console.table(a.summary.page.map((p, i) => ({ page: i + 1, kind: p.kind, rows: p.rows, gap: p.gap, fill: p.fill, split: p.split, offpage: p.offpage })));
  if (problems.length) { console.error("Check failed:\n  - " + problems.join("\n  - ")); process.exit(1); }
  console.log("Check passed.");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) main().catch(err => { console.error(err.message || err); process.exit(1); });
```

- [ ] **Step 4: Unit test the analyser and run check on the fixture**

Append to `tests/lib.test.mjs`:

```js
import { analyse } from "../scripts/check.mjs";

test("analyse flags a lone verse, a wide gap, an empty section and a broken key series", () => {
  const dom = `<html data-pages="3" data-yy="0" data-keys="a,c" data-empty-sections="1">
<section class="page front recto" data-kind="front"></section>
<section class="page text verso" data-kind="text" data-rows="1" data-gap="120" data-fill="40" data-split="" data-cont="0" data-offpage="0"></section>
<section class="page text recto" data-kind="text" data-rows="3" data-gap="10" data-fill="90" data-split="" data-cont="1" data-offpage="0"></section>
</html>`;
  const { problems } = analyse(dom);
  assert.ok(problems.some(p => /single verse/.test(p)));
  assert.ok(problems.some(p => /120px gap/.test(p)));
  assert.ok(problems.some(p => /no items/.test(p)));
  assert.ok(problems.some(p => /key series is ac not ab/.test(p)));
  assert.ok(problems.some(p => /labelled \(cont\.\)/.test(p)));
});
```

Then build and check the fixture:

Run: `node scripts/build.mjs tests/fixtures/week-min --no-pdf && node scripts/check.mjs tests/fixtures/week-min`
Expected: `Check passed.` with 2 pages (front, text) and the key series `a,b` (the dead "See 20.25" note dropped, the gloss keyed `a`, "Lit. target" keyed `b`).

Then the one-verse reading (Review Focus item 4): copy the fixture to the scratch directory with `verses` cut to the first verse and `commentary` and `glosses` filtered to verse 18, build it, and run check:

```bash
S="$CLAUDE_SCRATCHPAD/week-one"; mkdir -p "$S"
node -e "const d=require('./tests/fixtures/week-min/sheet.json');d.verses=d.verses.slice(0,1);d.commentary=d.commentary.filter(e=>e.verse===18);d.glosses=d.glosses.filter(g=>g.verse===18);d.haftarah.ref='I Samuel 20:18';require('fs').writeFileSync(process.argv[1]+'/sheet.json',JSON.stringify(d,null,2))" "$S"
node scripts/build.mjs "$S" --no-pdf && node scripts/check.mjs "$S"
```

Expected: `Check passed.`, two pages, `rows = 1` on the last text page (allowed because it is the last).

Add to `.gitignore`: `tests/fixtures/*/sheet.html`, `tests/fixtures/*/sheet-draft.html`, `tests/fixtures/*/preview*/`.

- [ ] **Step 5: Run check on both real weeks**

Run: `node scripts/build.mjs weeks/2026-10-10-bereshit-machar-chodesh --no-pdf && node scripts/check.mjs weeks/2026-10-10-bereshit-machar-chodesh && node scripts/build.mjs weeks/2026-10-10-bereshit-isaiah --no-pdf && node scripts/check.mjs weeks/2026-10-10-bereshit-isaiah`
Expected: both pass. If a gap or lone-verse failure remains, the paginator (Task 7) is where to fix it, not the check.

- [ ] **Step 6: Commit**

```bash
git add scripts/check.mjs scripts/build.mjs tests/fixtures/week-min/sheet.json tests/lib.test.mjs .gitignore
git commit -m "check.mjs: layout invariants and determinism from the renderer's data attributes

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 10: Schema 2 in fetch and a migration script

**Files:**
- Create: `scripts/migrate.mjs`
- Modify: `scripts/fetch.mjs:188-290`, both `weeks/*/sheet.json`, `README.md` (Data file section)

**Interfaces:**
- Produces: `sheet.json` schema 2: `series { name, year, number }`, `openingNote { calendar, setting, status }`, `nextWeek { shabbat, special, ref, civilDisplay, status } | null`, `glosses[].en`, `commentary[].works` (critical only), `credits.signoff`; no `questions`, `context`, `parashahConnection`, `haftarah.whyThisHaftarah`.

- [ ] **Step 1: `scripts/migrate.mjs`**

```js
#!/usr/bin/env node
/** migrate.mjs — schema 1 → 2.   node scripts/migrate.mjs weeks/<slug> --number 3 */
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const dirArg = process.argv.slice(2).find(a => !a.startsWith("--"));
const numIdx = process.argv.indexOf("--number");
const number = numIdx > -1 ? Number(process.argv[numIdx + 1]) : null;
if (!dirArg || number == null) { console.error("usage: node scripts/migrate.mjs weeks/<slug> --number N"); process.exit(1); }

export function migrate(d, number) {
  if (d.schema >= 2 && d.openingNote && d.series) return d;
  const out = { ...d };
  out.schema = 2;
  out.series = d.series || { name: "Torah from Scratch", year: String((d.shabbat?.hebrewEn || "").split(/\s+/).pop() || ""), number };
  if (!d.openingNote) {
    const cal = [];
    if (d.haftarah?.defaultHaftarah) cal.push(`Read in place of the usual haftarah for ${d.shabbat.parashah.en}, ${d.haftarah.defaultHaftarah.replace(/(\d)-(\d)/g, "$1–$2")}.`);
    if (d.haftarah?.whyThisHaftarah) cal.push(d.haftarah.whyThisHaftarah);
    if (d.parashahConnection) cal.push(d.parashahConnection);
    out.openingNote = { calendar: cal.join(" "), setting: (d.context?.paragraphs || []).slice(), status: d.context?.status || "proposed" };
  }
  out.nextWeek = d.nextWeek ?? null;
  out.haftarah = { ...d.haftarah }; delete out.haftarah.whyThisHaftarah;
  delete out.questions; delete out.context; delete out.parashahConnection;
  out.glosses = (d.glosses || []).map(g => ({ en: "", ...g }));
  out.commentary = (d.commentary || []).map(e => e.register === "critical" ? { works: [], ...e } : e);
  out.credits = { signoff: "I chose and approved every entry on this sheet; summaries marked as such were drafted with Claude and read before printing. Tell me what I got wrong.", ...d.credits };
  return out;
}

const p = join(resolve(dirArg), "sheet.json");
const d = JSON.parse(await readFile(p, "utf8"));
const out = migrate(d, number);
await writeFile(p, JSON.stringify(out, null, 2) + "\n", "utf8");
const todo = [];
for (const g of out.glosses) if (!g.en) todo.push(`gloss ${g.verse} ${g.lemma}: add "en" (the English words it belongs to)`);
for (const e of out.commentary) if (e.register === "critical" && !(e.works || []).length) todo.push(`critical ${e.verse} ${e.source}: add "works" keys from bibliography/${out.haftarah.book}.md`);
console.log(`Migrated ${p} to schema 2.` + (todo.length ? `\nStill needed:\n  - ${todo.join("\n  - ")}` : ""));
```

- [ ] **Step 2: Test the migration**

Append to `tests/lib.test.mjs`:

```js
import { migrate } from "../scripts/migrate.mjs";

test("migrate builds the opening note from the v1 fields and drops what v2 removed", () => {
  const v1 = {
    schema: 1, shabbat: { hebrewEn: "29 Tishrei 5787", parashah: { en: "Bereshit" } },
    haftarah: { ref: "I Samuel 20:18-42", defaultHaftarah: "Isaiah 42:5-43:10", whyThisHaftarah: "Why." },
    context: { status: "approved", heading: "x", paragraphs: ["Setting one.", "Setting two."] },
    questions: ["q"], parashahConnection: "Link.", glosses: [{ verse: 18, lemma: "א" }],
    commentary: [{ verse: 1, register: "critical", source: "S" }, { verse: 2, register: "traditional", source: "Rashi" }],
    credits: { editor: "R" },
  };
  const v2 = migrate(v1, 3);
  assert.equal(v2.schema, 2);
  assert.deepEqual(v2.series, { name: "Torah from Scratch", year: "5787", number: 3 });
  assert.equal(v2.openingNote.calendar, "Read in place of the usual haftarah for Bereshit, Isaiah 42:5–43:10. Why. Link.");
  assert.deepEqual(v2.openingNote.setting, ["Setting one.", "Setting two."]);
  assert.equal(v2.openingNote.status, "approved");
  assert.equal(v2.questions, undefined);
  assert.equal(v2.context, undefined);
  assert.equal(v2.haftarah.whyThisHaftarah, undefined);
  assert.deepEqual(v2.commentary[0].works, []);
  assert.equal(v2.commentary[1].works, undefined);
  assert.equal(v2.glosses[0].en, "");
  assert.match(v2.credits.signoff, /Tell me what I got wrong/);
});
```

Run: `npm test` → passing. (Importing `migrate.mjs` runs its top level; guard it the same way as `check.mjs`: wrap the file-handling lines in `if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) { … }`.)

- [ ] **Step 3: `scripts/fetch.mjs` writes schema 2**

Replace the `sheet` object's fields:

- `schema: 2,`
- after `shabbat`, add `series: { name: "Torah from Scratch", year: String(conv.hy), number: await nextNumber(outRoot, String(conv.hy)) },`
- remove `whyThisHaftarah: ""` from `haftarah`
- replace `context: …, glossary: [], questions: [], parashahConnection: "",` with

```js
    openingNote: { calendar: "", setting: [], status: "proposed" },
    glossary: [],
    nextWeek: await nextWeekFor(date),
```

- in `credits`, replace `note` with `signoff: "I chose and approved every entry on this sheet; summaries marked as such were drafted with Claude and read before printing. Tell me what I got wrong.",`

Add the two helpers above `main()`:

```js
import { readdir } from "node:fs/promises";

// One more than the highest number already issued this Hebrew year in outRoot.
async function nextNumber(outRoot, year) {
  let max = 0;
  let dirs = [];
  try { dirs = await readdir(outRoot); } catch { return 1; }
  for (const d of dirs) {
    try {
      const s = JSON.parse(await readFile(join(outRoot, d, "sheet.json"), "utf8"));
      if (s.series?.year === year && typeof s.series.number === "number") max = Math.max(max, s.series.number);
    } catch {}
  }
  return max + 1;
}

// The following Shabbat's reading, proposed; Daniel confirms it before it prints.
async function nextWeekFor(date) {
  const d = new Date(date + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + 7);
  const next = d.toISOString().slice(0, 10);
  try {
    const ley = await getJSON(`https://www.hebcal.com/leyning?cfg=json&start=${next}&end=${next}`);
    const it = (ley.items || [])[0];
    if (!it || !it.haftara) return null;
    return {
      shabbat: it.name?.en || "",
      special: it.reason?.haftara || null,
      ref: it.haftara,
      civilDisplay: new Date(next + "T12:00:00Z").toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" }),
      status: "proposed",
    };
  } catch { return null; }
}
```

(`readFile` and `join` are already imported in fetch.mjs; add `readdir`.)

- [ ] **Step 4: Migrate the two real weeks and fill what the migration cannot**

Run: `node scripts/migrate.mjs weeks/2026-10-10-bereshit-machar-chodesh --number 3 && node scripts/migrate.mjs weeks/2026-10-10-bereshit-isaiah --number 2`

Then edit the data by hand (these are the English anchors and work keys the entries already imply):

Machar Chodesh glosses `en`: v18 `you will be missed`; v19 `the Ezel stone`; v26 `He must be impure`; v30 `perverse`; v41 `David wept the longer`.
Machar Chodesh critical `works`: v23 Covenant `["McCarter 1980", "Alter 1999"]`; v26 The new-moon feast `["McCarter 1980", "JSB 2014"]`; v30 Saul's concession `["McCarter 1980", "Alter 1999"]`; v41 A damaged verse `["McCarter 1980", "Tov 2012"]`.
Isaiah glosses `en`: fill from each gloss's own English (open the file; each gloss text names the English it belongs to).
Isaiah critical `works`: 42:5 Arguing with Genesis `["Weinfeld 1968"]`; 42:6 An unsolved phrase `["Hillers 1978", "Smith 1981"]`; 42:6 A nationalist light? `["Orlinsky 1967"]`; 42:14 Warrior and woman `["Darr 1987"]`; 43:3 Egypt as ransom `["Blenkinsopp 2002"]` and set that entry's `status` to `"proposed"` with a note in `cites`: `a common reading; see Blenkinsopp` (its citation changed, so Daniel re-approves it).
Isaiah reference entry 42:6 The Mission of Israel: `register` stays `reference`; give it `sourceRef: "Kaufmann Kohler, Jewish Theology (1918), ch. 55"` is not a Sefaria ref, so instead set `register: "critical"`, `works: ["Kohler 1918"]`. (Rule one: non-critical entries must be Sefaria texts.)

- [ ] **Step 5: README data-file section**

Replace the schema description in `README.md` (section "Data file") with the schema 2 field list from the Interfaces block above, one line per field, and remove `questions`, `context`, `parashahConnection`, `whyThisHaftarah`.

- [ ] **Step 6: Build both weeks, run check**

Run: `npm test && node scripts/build.mjs weeks/2026-10-10-bereshit-machar-chodesh --no-pdf && node scripts/check.mjs weeks/2026-10-10-bereshit-machar-chodesh`
Expected: pass; the margin English anchors now sit after the right words.

- [ ] **Step 7: Commit**

```bash
git add scripts/migrate.mjs scripts/fetch.mjs weeks/*/sheet.json README.md tests/lib.test.mjs
git commit -m "Schema 2: series, opening note, next week, gloss anchors, works; migration script

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 11: Bibliography and the hard gate

**Files:**
- Create: `bibliography/I Samuel.md`, `bibliography/Isaiah.md`, `bibliography/README.md`, `tests/gate.test.mjs`
- Modify: `template/lib.js` (`parseBibliography`), `scripts/build.mjs` (gate)

**Interfaces:**
- Produces: `parseBibliography(markdown) → Map<key, { citation, use }>`; `gate(data, biblio) → string[]` exported from `build.mjs`; final build exits 1 when the list is non-empty; `--draft` prints the list and continues.

- [ ] **Step 1: Bibliography files**

`bibliography/README.md`:

```markdown
# Bibliography for the historical-critical register

One file per biblical book. One line per work: `- key: <Author Year> | <full citation> | <what it is good for>`.
Only works on these lists may be named by a critical entry (`commentary[].works`). Claude maintains the
lists: it seeds them from standard reference scholarship, verifies a work exists (publisher catalogue
or WorldCat) before adding a line, and mentions any addition in the delivery line. Daniel never edits them.
```

`bibliography/I Samuel.md`:

```markdown
# I Samuel

- key: McCarter 1980 | P. Kyle McCarter Jr., *I Samuel*, Anchor Bible 8 (Garden City: Doubleday, 1980) | text-critical and historical commentary; the standard
- key: Alter 1999 | Robert Alter, *The David Story: A Translation with Commentary of 1 and 2 Samuel* (New York: Norton, 1999) | literary reading, close attention to the Hebrew
- key: JSB 2014 | Adele Berlin and Marc Zvi Brettler, eds., *The Jewish Study Bible*, 2nd ed. (Oxford: Oxford University Press, 2014) | annotations by Shimon Bar-Efrat on Samuel; good first stop
- key: Tov 2012 | Emanuel Tov, *Textual Criticism of the Hebrew Bible*, 3rd ed. (Minneapolis: Fortress, 2012) | the Septuagint and Qumran evidence for Samuel
- key: Tsumura 2007 | David Toshio Tsumura, *The First Book of Samuel*, NICOT (Grand Rapids: Eerdmans, 2007) | conservative, philologically careful
- key: Halpern 2001 | Baruch Halpern, *David's Secret Demons: Messiah, Murderer, Traitor, King* (Grand Rapids: Eerdmans, 2001) | the History of David's Rise as apology
```

`bibliography/Isaiah.md`:

```markdown
# Isaiah

- key: Blenkinsopp 2002 | Joseph Blenkinsopp, *Isaiah 40–55*, Anchor Bible 19A (New York: Doubleday, 2002) | commentary on Second Isaiah; dating and setting
- key: Baltzer 2001 | Klaus Baltzer, *Deutero-Isaiah*, Hermeneia (Minneapolis: Fortress, 2001) | liturgical-dramatic reading
- key: Goldingay Payne 2006 | John Goldingay and David Payne, *Isaiah 40–55*, ICC, 2 vols. (London: T&T Clark, 2006) | philological detail
- key: JSB 2014 | Adele Berlin and Marc Zvi Brettler, eds., *The Jewish Study Bible*, 2nd ed. (Oxford: Oxford University Press, 2014) | annotations by Benjamin D. Sommer on Isaiah
- key: Sommer 1998 | Benjamin D. Sommer, *A Prophet Reads Scripture: Allusion in Isaiah 40–66* (Stanford: Stanford University Press, 1998) | inner-biblical allusion in Second Isaiah
- key: Weinfeld 1968 | Moshe Weinfeld, “God the Creator in Genesis 1 and in the Prophecy of Second Isaiah” [Hebrew], *Tarbiz* 37 (1968): 105–132 | creation theology against Genesis 1
- key: Hillers 1978 | Delbert R. Hillers, “Berît ʿām: ‘Emancipation of the People’,” *Journal of Biblical Literature* 97 (1978): 175–182 | the phrase in 42:6
- key: Smith 1981 | Mark S. Smith, “Bĕrît ʿam / bĕrît ʿôlām: A New Proposal for the Crux of Isa 42:6,” *Journal of Biblical Literature* 100 (1981): 241–243 | the phrase in 42:6
- key: Orlinsky 1967 | Harry M. Orlinsky, “The So-Called ‘Servant of the Lord’ and ‘Suffering Servant’ in Second Isaiah,” in *Studies on the Second Part of the Book of Isaiah*, VTSup 14 (Leiden: Brill, 1967) | against the missionary reading of “light of nations”
- key: Darr 1987 | Katheryn Pfisterer Darr, “Like Warrior, Like Woman: Destruction and Deliverance in Isaiah 42:10–17,” *Catholic Biblical Quarterly* 49 (1987): 560–571 | the warrior and the woman in labor
- key: Kohler 1918 | Kaufmann Kohler, *Jewish Theology, Systematically and Historically Considered* (New York: Macmillan, 1918) | Classical Reform's Mission of Israel
```

Before committing, verify each line exists against a publisher catalogue or WorldCat and correct any detail that is wrong; a line that cannot be verified is removed, and any entry that named it is set back to `proposed`.

- [ ] **Step 2: Failing tests** (`tests/gate.test.mjs`)

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { gate } from "../scripts/build.mjs";
const require = createRequire(import.meta.url);
const lib = require("../template/lib.js");

const fixture = JSON.parse(await readFile(new URL("./fixtures/week-min/sheet.json", import.meta.url), "utf8"));
const biblio = lib.parseBibliography(await readFile(new URL("../bibliography/I Samuel.md", import.meta.url), "utf8"));

test("parseBibliography reads keys and citations", () => {
  assert.ok(biblio.has("McCarter 1980"));
  assert.match(biblio.get("McCarter 1980").citation, /Anchor Bible 8/);
});

test("gate passes the approved fixture", () => {
  assert.deepEqual(gate(fixture, biblio), []);
});

test("gate names proposed items of every kind", () => {
  const d = structuredClone(fixture);
  d.commentary[0].status = "proposed";
  d.glosses[0].status = "proposed";
  d.glossary[0].status = "proposed";
  d.openingNote.status = "proposed";
  d.nextWeek.status = "proposed";
  const p = gate(d, biblio);
  assert.ok(p.some(x => /commentary.*18 Rashi/.test(x)));
  assert.ok(p.some(x => /gloss.*18/.test(x)));
  assert.ok(p.some(x => /glossary.*Ezel/.test(x)));
  assert.ok(p.some(x => /opening note/.test(x)));
  assert.ok(p.some(x => /next-week/.test(x)));
});

test("gate ignores rejected items", () => {
  const d = structuredClone(fixture);
  d.commentary[0].status = "rejected";
  assert.deepEqual(gate(d, biblio), []);
});

test("gate enforces Sefaria refs outside the critical register", () => {
  const d = structuredClone(fixture);
  delete d.commentary[0].sourceRef;
  assert.ok(gate(d, biblio).some(x => /no Sefaria ref.*18 Rashi/.test(x)));
});

test("gate names missing work and missing bibliography file", () => {
  const d = structuredClone(fixture);
  d.commentary[1].works = ["Nobody 2099"];
  assert.ok(gate(d, biblio).some(x => /not in bibliography\/I Samuel\.md: Nobody 2099/.test(x)));
  d.commentary[1].works = [];
  assert.ok(gate(d, biblio).some(x => /names no work/.test(x)));
  assert.ok(gate(d, null).some(x => /bibliography\/I Samuel\.md is missing/.test(x)));
});
```

Run: `npm test` → FAIL, `gate` not exported.

- [ ] **Step 3: `parseBibliography` in `template/lib.js`**

```js
  // "- key: McCarter 1980 | citation | use" → Map(key → { citation, use })
  function parseBibliography(md) {
    const map = new Map();
    for (const line of String(md == null ? "" : md).split(/\r?\n/)) {
      const m = line.match(/^-\s*key:\s*([^|]+?)\s*\|\s*([^|]+?)\s*(?:\|\s*(.*?))?\s*$/);
      if (m) map.set(m[1], { citation: m[2], use: m[3] || "" });
    }
    return map;
  }
```

- [ ] **Step 4: `gate` in `scripts/build.mjs`**

```js
export function gate(data, biblio) {
  const problems = [];
  const open = s => s && s !== "approved" && s !== "rejected";
  const where = e => `${e.chapter ? e.chapter + ":" : ""}${e.verse} ${e.source}`;
  for (const e of data.commentary || []) if (open(e.status)) problems.push(`commentary entry proposed: ${where(e)}`);
  for (const g of data.glosses || []) if (open(g.status)) problems.push(`gloss proposed: ${g.verse} ${g.lemma}`);
  for (const t of data.glossary || []) if (open(t.status)) problems.push(`glossary term proposed: ${t.term}`);
  if (data.openingNote && open(data.openingNote.status)) problems.push("opening note proposed");
  if (data.nextWeek && open(data.nextWeek.status)) problems.push("next-week line proposed: approve it or set nextWeek to null");
  if (!data.haftarah?.incipit?.en) problems.push("incipit.en is empty");
  for (const e of (data.commentary || []).filter(e => e.status === "approved")) {
    if (e.register !== "critical") { if (!e.sourceRef) problems.push(`no Sefaria ref: ${where(e)}`); continue; }
    if (!(e.works || []).length) problems.push(`critical entry names no work: ${where(e)}`);
    else if (!biblio) problems.push(`bibliography/${data.haftarah.book}.md is missing (needed by ${where(e)})`);
    else for (const k of e.works) if (!biblio.has(k)) problems.push(`work not in bibliography/${data.haftarah.book}.md: ${k} (${where(e)})`);
  }
  return problems;
}
```

In `main()`, replace the old warnings block with:

```js
  let biblio = null;
  try { biblio = HaftarahLib.parseBibliography(await readFile(join(ROOT, "bibliography", `${data.haftarah.book}.md`), "utf8")); } catch {}
  const problems = gate(data, biblio);
  if (problems.length) {
    const msg = "Blocking the final sheet:\n  - " + problems.join("\n  - ");
    if (DRAFT) console.warn(msg.replace("Blocking the final sheet", "Draft; these would block the final"));
    else { console.error(msg); process.exit(1); }
  }
```

with `const HaftarahLib = createRequire(import.meta.url)("../template/lib.js");` near the imports (`import { createRequire } from "node:module";`).

The `counts` object stays for the review note.

- [ ] **Step 5: Run tests; try a final build of the Isaiah draft**

Run: `npm test && node scripts/build.mjs weeks/2026-10-10-bereshit-isaiah --no-pdf; echo "exit $?"`
Expected: tests pass; the Isaiah final build exits 1 and lists its proposed glossary terms, glosses, opening note and the re-proposed Egypt entry. `node scripts/build.mjs weeks/2026-10-10-bereshit-isaiah --draft --no-pdf` succeeds with the same list as a warning.

- [ ] **Step 6: Commit**

```bash
git add bibliography template/lib.js scripts/build.mjs tests/gate.test.mjs
git commit -m "Hard gate: nothing proposed prints; Sefaria refs required; critical works from the closed bibliography

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 12: Documents, final renders, review

**Files:**
- Modify: `DESIGN.md`, `PRODUCT.md`, `README.md`, `.claude/skills/haftarah-sheet/SKILL.md` (one note; the full runbook v2 is plan 2)

- [ ] **Step 1: DESIGN.md**

Frontmatter: `rubric: "#8a0a14"`, add `ink-2: "#595959"`, `frame: "#4d4d4d"`; `incipit.fontSize: "60pt (fit 48–64pt)"`, `apparatus.fontSize: "9.2pt"`, `gloss.fontSize: "9pt"`; margins `page-margin-inner: "0.6in"`, `page-margin-outer: "0.75in"`.

Body edits, by section:

- Overview bullet "Four type sizes": `incipit 60pt nominal (fitted 48–64pt), text 10.5pt, apparatus 9.2pt, gloss 9pt`.
- Colors intro: replace "A photocopy-safe palette…" with `One ink, two greys and one rubric. The rubric is the ring red of the Siona Benjamin floor mural, CRC's mark, and it is spent only on sources and keys: the reading line, chapter locators, apparatus source names, margin keys and the sigla. Running heads and footers are dark grey. The sheet is designed for color and printed in color.`
- Replace **The Photocopy Rule** with: `**The Color Preference.** Shape carries register, letters carry keys, position carries hierarchy; color is never the only signal. But the sheet is designed for color: the mural, the rubric and the greys are chosen for an inkjet, not a photocopier.`
- Add **The Red Rule.** `Red means a source or a key. If a red mark is neither, it is noise; take it out.`
- Typography hierarchy: delete "discussion questions"; Text line adds "poetry: one block per JPS line with a 1.1em hanging indent".
- Layout: add a **Binding** paragraph: `Stapled upper right, duplex. On a recto the staple corner is top right and the inner margin (0.6in) is on the right; on a verso the mirror. The verse range in the running head and the folio sit in the corner away from the staple. The gloss column stays on the right of every page.`
- Replace "End matter … discussion questions" with the Task 8 rules: no empty section, colophon never alone, next-week line last.
- Components: rename **Cover Incipit Block** to **Front Page** and describe Task 6's order (hero at 1.6in, fitted incipit, reading line, opening note with hairline, stable legend with greyed unused sigla and the keys line, voices, provenance). Replace **Sidenote** with the Task 3 grammar (red italic letter, verse number for glosses, italic lemma, grey bracket, note, "JPS" tail). **Register Sigla**: all filled, one weight, plain names. **Apparatus Entry**: add the `· p. N` pointer and red-italic drafted titles.
- Do's and Don'ts: update the sizes line; replace the photocopy don't with `**Don't** put red on anything that is not a source or a key.`; add `**Don't** leave a verse alone on a page or a heading without items.`

- [ ] **Step 2: PRODUCT.md**

- Users: add `many are older; the sheet is read at arm's length.`
- Operating Context: `printed double-sided in color by the rabbi, stapled upper right`; delete "usually black and white".
- Capabilities: replace "Fixed length target of 4 to 6 letter pages" with `No page target; the build reports the count.`; replace the context-box sentence with `Each sheet opens with a front page: calendar reason, historical setting, legend, voices. Discussion questions are never printed.`; delete the two "Undecided" lines (logo and colors are decided: the mural and its red; website publication stays undecided).
- Brand Commitments: `Issued by Central Reform Congregation under its mark, the Siona Benjamin floor mural; rubric #8a0a14 from the mural's ring; wordmark lowercase "central reform congregation" with the tagline "A Jewish Presence in the City of St. Louis".`
- Accessibility: `commentary no smaller than 9pt`; replace the photocopy line with the Color Preference wording.

- [ ] **Step 3: README.md and SKILL.md**

README: update the build section (`check` command, the hard gate, `--draft` behaviour, the browser log line), the data-file section (done in Task 10), and the layout description (front page, binding, keys). SKILL.md: add one line under "0. Before you start": `The template is v2 (front page, one key series, hard gate). Runbook v2 replaces this file in the next plan; until then follow README.md for the data fields.`

- [ ] **Step 4: Final renders and the eye test**

Run: `npm test && node scripts/build.mjs weeks/2026-10-10-bereshit-machar-chodesh --png && node scripts/check.mjs weeks/2026-10-10-bereshit-machar-chodesh && node scripts/build.mjs weeks/2026-10-10-bereshit-isaiah --draft --png && node scripts/check.mjs weeks/2026-10-10-bereshit-isaiah --draft`

Look at every PNG in both `preview/` folders against the review's list: front page (mural fixed, incipit fitted, legend stable, voices, provenance once, wordmark footer); page 2 starts the text; heads and folios mirror around the staple; poetry indents; margin grammar; no `(cont.)`; no gap over half an inch; no lone verse; sigla one family; red only on sources and keys; end matter whole.

- [ ] **Step 5: Commit**

```bash
git add DESIGN.md PRODUCT.md README.md .claude/skills/haftarah-sheet/SKILL.md weeks/*/sheet.json
git commit -m "Docs match the v2 sheet; final renders of both weeks

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Self-review

**Spec coverage.** Section 5 (schema 2): Task 10 (+ `works`, `glosses[].en`, `nextWeek`, voices as a template table). Section 6.1: poetry (2), end matter (8), verse-30 and dead bands and no one-verse pages (7), margin keys (3), Hebrew cleanliness (4), browser pinned (9), sizes and red diet and sigla and margins (4), series once and footer and legend and chapter locator (5, 6, 4), mural fixed and incipit fit (6), provenance once (6, 8). Section 6.2: front page (6), binding (5), one key series (3), register names (4), voices (6), next week (8, 10, 11). Section 6.3 original cover decisions: carried by 6 except where 6.1 overrode them. Section 7 testing: unit tests across tasks; divine-name count check is in `check.mjs` (Task 9, `yyExpected`); final build with a proposed entry exits non-zero and names it (11); migration converts both v1 files (10); cloud run is plan 2. DESIGN.md and PRODUCT.md (12).

**Placeholders.** None found; every step carries its code or its exact edit.

**Type consistency.** `assignKeys` returns `{ verses, sequence }` (Tasks 3, 6, 9); `setFoot(p, { legend, wordmark })` (5, 6, 7, 8); `buildEntry(e, { offpage })` (7, and `renderTextPage`); `fitIncipitSize(widthAt60pt, boxWidth)` (6); `gate(data, biblio)` (11); `analyse(dom)` (9); `migrate(d, number)` (10). `rows[i].node.setLocator` is defined in Task 4 and guarded in Task 7.

**Review Focus.** Items 1 to 3 and 5 have their tests in Tasks 3, 2, 3 and 11. Item 4 (one-verse readings) is the second run in Task 9 step 4.
