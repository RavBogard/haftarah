import { test } from "node:test";
import assert from "node:assert/strict";
import { slugFromPath, dataUrl, rangeLabel, countLabel } from "../site/app/sheet.js";

test("slugFromPath normalizes case and a trailing slash", () => {
  assert.equal(slugFromPath("/2026-10-17-noach"), "2026-10-17-noach");
  assert.equal(slugFromPath("/2026-10-17-Noach/"), "2026-10-17-noach");
  assert.equal(slugFromPath("/2026-10-10-bereshit-machar-chodesh"), "2026-10-10-bereshit-machar-chodesh");
  assert.equal(slugFromPath("/"), null);
  assert.equal(slugFromPath("/sheet.html"), null);
  assert.equal(slugFromPath("/2026-10-17-noach/extra"), null);
});

test("dataUrl, rangeLabel, countLabel", () => {
  assert.equal(dataUrl("2026-10-17-noach", "sheet.pdf"), "/data/weeks/2026-10-17-noach/sheet.pdf");
  assert.equal(rangeLabel("Isaiah", { chapter: 54, verse: 1 }, { chapter: 54, verse: 1 }), "Isaiah 54:1");
  assert.equal(rangeLabel("Isaiah", { chapter: 54, verse: 1 }, { chapter: 54, verse: 5 }), "Isaiah 54:1–5");
  assert.equal(rangeLabel("Isaiah", { chapter: 54, verse: 12 }, { chapter: 55, verse: 3 }), "Isaiah 54:12–55:3");
  assert.equal(countLabel(6, 1), "6 comments · 1 note");
  assert.equal(countLabel(1, 0), "1 comment");
  assert.equal(countLabel(0, 2), "2 notes");
  assert.equal(countLabel(0, 0), "");
});

import { createRequire } from "node:module";
import { wordForms, pickEntries, joinText, parseText } from "../site/app/sefaria.js";
const L = createRequire(import.meta.url)("../template/lib.js");

test("wordForms strips cantillation first, then vowels", () => {
  const f = wordForms("עֲזַבְתִּ֑יךְ", L);
  assert.equal(f.vocal, "עֲזַבְתִּיךְ".normalize("NFC"));
  assert.equal(f.consonants, "עזבתיך");
});

test("pickEntries leads with the short gloss and folds BDB; tolerates entries without content", () => {
  const json = [
    { headword: "עָזַב", parent_lexicon: "BDB Dictionary", content: { morphology: "verb", senses: [{ definition: "leave, forsake", senses: [{ definition: "a. leave" }] }] } },
    { headword: "עָזַב", parent_lexicon: "BDB Augmented Strong", content: { senses: [{ definition: "to leave, loose, forsake" }] } },
    { headword: "x" },
    { parent_lexicon: "Other", content: {} },
  ];
  const p = pickEntries(json);
  assert.deepEqual(p.roots, ["עָזַב", "x"]);
  assert.equal(p.short.length, 1);
  assert.equal(p.short[0].lexicon, "BDB Augmented Strong");
  assert.equal(p.full.length, 1);
  assert.equal(p.full[0].morphology, "verb");
  assert.deepEqual(p.full[0].senses[0].senses[0].definition, "a. leave");
  assert.deepEqual(pickEntries(null), { roots: [], short: [], full: [] });
  assert.deepEqual(pickEntries([{ headword: "y", parent_lexicon: "Jastrow" }]).full.map(e => e.lexicon), ["Jastrow"]);
});

test("joinText and parseText", () => {
  assert.equal(joinText("one"), "<p>one</p>");
  assert.equal(joinText(["a", ["b", "c"]]), "<p>a</p><p>b</p><p>c</p>");
  const t = parseText({ ref: "Radak on Isaiah 54:1", heRef: "רד״ק", versions: [{ language: "he", versionTitle: "Mikraot", text: "ש" }, { language: "en", versionTitle: "Claude", text: ["x"] }] });
  assert.deepEqual(t, { ref: "Radak on Isaiah 54:1", heRef: "רד״ק", he: { html: "<p>ש</p>", versionTitle: "Mikraot" }, en: { html: "<p>x</p>", versionTitle: "Claude" } });
  assert.equal(parseText({ ref: "r", versions: [] }).en, null);
  assert.throws(() => parseText({ error: "Could not find title" }), /Could not find title/);
});
