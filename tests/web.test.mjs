import { test } from "node:test";
import assert from "node:assert/strict";
import { slugFromPath, dataUrl, rangeLabel, countLabel } from "../site/app/sheet.js";
import { readFileSync as readSite } from "node:fs";

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

import { pickHero, rowHtml } from "../site/app/landing.js";

test("pickHero: the newest week is 'This week' until seven days after its Shabbat", () => {
  const idx = { schema: 1, weeks: [{ slug: "2026-10-17-noach", civil: "2026-10-17", shabbat: "Shabbat Noach", ref: "Isaiah 54:1–55:5" }, { slug: "2026-10-10-bereshit", civil: "2026-10-10" }] };
  assert.equal(pickHero(idx, new Date("2026-10-14T12:00:00Z")).heading, "This week");
  assert.equal(pickHero(idx, new Date("2026-10-24T12:00:00Z")).heading, "This week");
  assert.equal(pickHero(idx, new Date("2026-10-25T12:00:00Z")).heading, "The latest sheet");
  assert.equal(pickHero(idx, new Date("2026-10-25T12:00:00Z")).current, false);
  assert.equal(pickHero(idx, new Date("2026-10-14T12:00:00Z")).entry.slug, "2026-10-17-noach");
  assert.equal(pickHero({ schema: 1, weeks: [] }, new Date()), null);
  assert.equal(pickHero({}, new Date()), null);
  assert.equal(pickHero(null, new Date()), null);
});

test("rowHtml survives an entry with missing fields", () => {
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const html = rowHtml({ slug: "2026-10-03-haazinu", shabbat: "Shabbat Ha'azinu" }, false, esc);
  assert.match(html, /href="\/2026-10-03-haazinu"/);
  assert.match(html, /Shabbat Ha&#39;azinu|Shabbat Ha'azinu/);
  assert.ok(!html.includes("undefined"));
  assert.match(rowHtml({ slug: "s", shabbat: "S", ref: "R", hebrewEn: "H", civilDisplay: "C" }, true, esc), /class="current"/);
});
import { rovingTarget, trapTarget } from "../site/app/a11y.js";

test("rovingTarget: in Hebrew ArrowLeft reads on and ArrowRight goes back; Home, End; the ends hold", () => {
  assert.equal(rovingTarget(0, 5, "ArrowLeft"), 1);
  assert.equal(rovingTarget(4, 5, "ArrowLeft"), 4);
  assert.equal(rovingTarget(3, 5, "ArrowRight"), 2);
  assert.equal(rovingTarget(0, 5, "ArrowRight"), 0);
  assert.equal(rovingTarget(2, 5, "Home"), 0);
  assert.equal(rovingTarget(2, 5, "End"), 4);
  assert.equal(rovingTarget(2, 5, "Tab"), null);
  assert.equal(rovingTarget(0, 0, "ArrowLeft"), null);
});

test("trapTarget wraps Tab at the last control and Shift+Tab at the first, and leaves the middle to the browser", () => {
  assert.equal(trapTarget(4, 5, false), 0);
  assert.equal(trapTarget(0, 5, true), 4);
  assert.equal(trapTarget(2, 5, false), null);
  assert.equal(trapTarget(2, 5, true), null);
  assert.equal(trapTarget(-1, 5, true), 4);
  assert.equal(trapTarget(0, 0, false), null);
});

import { PREFIX, key, load, store, migrateKeys } from "../site/app/storage.js";

// A Storage that keeps its items in a Map.
function memoryStorage(init = {}) {
  const m = new Map(Object.entries(init));
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), dump: () => Object.fromEntries(m) };
}

test("migrateKeys moves the first release's keys under the prefix once; a prefixed value wins", () => {
  const s = memoryStorage({ size: "4", theme: "dark", trope: "1", "haftarah:v1:theme": "light", other: "x" });
  assert.deepEqual(migrateKeys(s), ["size", "trope"]);
  assert.deepEqual(s.dump(), { "haftarah:v1:theme": "light", other: "x", "haftarah:v1:size": "4", "haftarah:v1:trope": "1" });
  assert.deepEqual(migrateKeys(s), []);
});

test("load and store use the prefix and survive a storage that throws", () => {
  const s = memoryStorage();
  store("lang", "he", s);
  assert.equal(s.getItem("haftarah:v1:lang"), "he");
  assert.equal(load("lang", s), "he");
  store("lang", null, s);
  assert.equal(load("lang", s), null);
  assert.equal(key("size"), `${PREFIX}size`);
  const broken = { getItem() { throw new Error("SecurityError"); }, setItem() { throw new Error("QuotaExceededError"); }, removeItem() { throw new Error("SecurityError"); } };
  assert.equal(load("size", broken), null);
  assert.doesNotThrow(() => store("size", "3", broken));
  assert.deepEqual(migrateKeys(broken), []);
});

import { citationText, translationLabel, highlightsFor, wordRange, verseUrl, copyWithStatus } from "../site/app/sheet.js";

test("verseUrl is the canonical week path and the verse anchor, whatever address the reader arrived by", () => {
  assert.equal(verseUrl("https://haftarah.centralreform.org", "2026-10-17-noach", "haftarah-54-1"), "https://haftarah.centralreform.org/2026-10-17-noach#haftarah-54-1");
});

test("copyWithStatus says Copied or Not copied on the button and in the live region, and one pending revert per button", async () => {
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const button = () => ({ textContent: "Copy link", dataset: {} });
  const status = { textContent: "" };
  const written = [];
  const b = button();
  assert.equal(await copyWithStatus(b, "x", { write: async t => { written.push(t); }, status, delay: 10 }), "Copied");
  assert.deepEqual(written, ["x"]);
  assert.equal(b.textContent, "Copied"); assert.equal(status.textContent, "Copied");
  await wait(30);
  assert.equal(b.textContent, "Copy link"); assert.equal(status.textContent, "");
  const f = button();
  assert.equal(await copyWithStatus(f, "x", { write: () => { throw new Error("denied"); }, status, delay: 10 }), "Not copied");
  assert.equal(f.textContent, "Not copied"); assert.equal(status.textContent, "Not copied");
  await wait(30);
  assert.equal(f.textContent, "Copy link"); assert.equal(status.textContent, "");
  // A second copy inside the window restarts the revert instead of reverting early.
  const d = button();
  await copyWithStatus(d, "x", { write: async () => {}, status, delay: 120 });
  await wait(60);
  await copyWithStatus(d, "x", { write: async () => {}, status, delay: 120 });
  await wait(90);   // past the first revert's moment, inside the second's
  assert.equal(d.textContent, "Copied"); assert.equal(status.textContent, "Copied");
  await wait(80);
  assert.equal(d.textContent, "Copy link"); assert.equal(status.textContent, "");
});

test("translationLabel names the JPS editions briefly and leaves any other title as it is", () => {
  assert.equal(translationLabel("THE JPS TANAKH: Gender-Sensitive Edition"), "JPS 2023");
  assert.equal(translationLabel("Tanakh: The Holy Scriptures, published by JPS"), "JPS 1985");
  assert.equal(translationLabel("JPS 1917 (fixture)"), "JPS 1917 (fixture)");
  assert.equal(translationLabel(""), "");
});

test("citationText: Hebrew, English or both, then the reference and the link", () => {
  const v = { he: "עִבְרִית", en: "English line one\nEnglish line two", ref: "Isaiah 54:1", translation: "JPS 2023", url: "https://haftarah.centralreform.org/2026-10-17-noach#haftarah-54-1" };
  assert.equal(citationText({ ...v, mode: "both" }), `עִבְרִית\nEnglish line one\nEnglish line two\n— Isaiah 54:1 (JPS 2023)\n${v.url}`);
  assert.equal(citationText({ ...v, mode: "he" }), `עִבְרִית\n— Isaiah 54:1\n${v.url}`);
  assert.equal(citationText({ ...v, mode: "en" }), `English line one\nEnglish line two\n— Isaiah 54:1 (JPS 2023)\n${v.url}`);
  assert.equal(citationText({ ...v, translation: "", mode: "en" }), `English line one\nEnglish line two\n— Isaiah 54:1\n${v.url}`);
  assert.equal(citationText({ ...v, mode: undefined }), citationText({ ...v, mode: "both" }));
});

test("wordRange clamps a range into the verse and refuses a reversed or empty one; highlightsFor matches reading, chapter and verse", () => {
  assert.deepEqual(wordRange([2, 4], 10), [2, 4]);
  assert.deepEqual(wordRange([8, 20], 10), [8, 9]);
  assert.deepEqual(wordRange([-3, 1], 10), [0, 1]);
  assert.equal(wordRange([5, 2], 10), null);
  assert.equal(wordRange([12, 14], 10), null);
  assert.equal(wordRange([0, 1], 0), null);
  assert.equal(wordRange(null, 10), null);
  assert.equal(wordRange([1], 10), null);
  assert.equal(wordRange(["a", 2], 10), null);
  const list = [
    { reading: "haftarah", chapter: 20, verse: 30, words: [0, 1] },
    { chapter: 20, verse: 30, note: "no reading means the haftarah" },
    { reading: "torah", chapter: 20, verse: 30 },
    { reading: "haftarah", chapter: 21, verse: 30 },
    { reading: "haftarah", verse: 30 },
    null,
  ];
  assert.equal(highlightsFor(list, "haftarah", 20, 30).length, 2);
  assert.equal(highlightsFor(list, "torah", 20, 30).length, 1);
  assert.deepEqual(highlightsFor(undefined, "haftarah", 20, 30), []);
});

import { presentAction, stepIndex, isPresent, startIndex, stripKeys } from "../site/app/present.js";

test("presenter keys: remotes, arrows and letters; modified keys, F5, and Space or Enter on a button stay with the browser", () => {
  for (const k of ["PageDown", "ArrowRight", "ArrowDown", " ", "Enter"]) assert.equal(presentAction({ key: k }), "next", k);
  for (const k of ["PageUp", "ArrowLeft", "ArrowUp", "Backspace"]) assert.equal(presentAction({ key: k }), "prev", k);
  assert.equal(presentAction({ key: "Home" }), "first");
  assert.equal(presentAction({ key: "End" }), "last");
  for (const [k, a] of [["b", "blank"], ["B", "blank"], [".", "blank"], ["c", "notes"], ["n", "preview"], ["t", "trope"], ["+", "bigger"], ["=", "bigger"], ["-", "smaller"], ["?", "help"], ["Escape", "exit"]]) assert.equal(presentAction({ key: k }), a, k);
  assert.equal(presentAction({ key: "+", ctrlKey: true }), null);
  assert.equal(presentAction({ key: "-", metaKey: true }), null);
  assert.equal(presentAction({ key: "ArrowLeft", altKey: true }), null);
  assert.equal(presentAction({ key: " ", onControl: true }), null);
  assert.equal(presentAction({ key: "Enter", onControl: true }), null);
  assert.equal(presentAction({ key: "PageDown", onControl: true }), "next");
  assert.equal(presentAction({ key: "F5" }), null);
});

test("stepIndex holds at both ends", () => {
  assert.equal(stepIndex(0, 3, "next"), 1);
  assert.equal(stepIndex(2, 3, "next"), 2);
  assert.equal(stepIndex(0, 3, "prev"), 0);
  assert.equal(stepIndex(1, 3, "first"), 0);
  assert.equal(stepIndex(0, 3, "last"), 2);
  assert.equal(stepIndex(1, 3, "blank"), 1);
  assert.equal(stepIndex(0, 0, "next"), 0);
});

test("startIndex: the verse in the address, an old v-anchor, else the first", () => {
  const rows = [{ reading: "haftarah", chapter: 20, verse: 18 }, { reading: "haftarah", chapter: 20, verse: 19 }];
  assert.equal(startIndex(rows, "#haftarah-20-19"), 1);
  assert.equal(startIndex(rows, "#v20-19"), 1);
  assert.equal(startIndex(rows, "#torah-20-19"), 0);
  assert.equal(startIndex(rows, "#haftarah-99-1"), 0);
  assert.equal(startIndex(rows, ""), 0);
  // A Torah row with the same chapter and verse comes first on a two-reading page: the old anchor still means the haftarah.
  const both = [{ reading: "torah", chapter: 20, verse: 18 }, { reading: "torah", chapter: 20, verse: 19 }, ...rows];
  assert.equal(startIndex(both, "#v20-19"), 3);
  assert.equal(startIndex(both, "#torah-20-19"), 1);
  assert.equal(startIndex(both, "#haftarah-20-18"), 2);
  assert.equal(startIndex([{ reading: "torah", chapter: 6, verse: 9 }], "#v6-9"), 0, "no haftarah row: the first");
});

test("stripKeys removes the JPS and gloss letters and nothing else", () => {
  assert.equal(stripKeys('<span class="nb">word<sup class="fn">a</sup>,</span> more'), '<span class="nb">word,</span> more');
  assert.equal(stripKeys('עֲקָרָ֖ה<sup class="fn he">b</sup>׃'), "עֲקָרָ֖ה׃");
  assert.equal(stripKeys("x<sup>2</sup>"), "x<sup>2</sup>");
});

test("isPresent reads ?present with or without a value", () => {
  assert.equal(isPresent("?present"), true);
  assert.equal(isPresent("?present=1&check=1"), true);
  assert.equal(isPresent("?trope=1"), false);
  assert.equal(isPresent(""), false);
});

test("rowHtml shows a week with a Torah reading on two lines: the Torah's ref, then the haftarah's", () => {
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const html = rowHtml({ slug: "s", shabbat: "S", ref: "Isaiah 54:1–55:5", readings: [{ kind: "torah", ref: "Genesis 6:9–7:16" }, { kind: "haftarah", ref: "Isaiah 54:1–55:5" }] }, false, esc);
  assert.match(html, /<span class="r two"><span>Genesis 6:9–7:16<\/span><span>Isaiah 54:1–55:5<\/span><\/span>/);
  assert.match(rowHtml({ slug: "s", shabbat: "S", ref: "R" }, false, esc), /<span class="r">R<\/span>/);
});

test("Hebcal is credited (CC BY 4.0) on every page and in README", () => {
  const line = "Calendar and readings: Hebcal (CC BY 4.0).";
  for (const f of ["../site/index.html", "../site/library.html", "../site/app/sheet.js", "../README.md"]) assert.ok(readSite(new URL(f, import.meta.url), "utf8").includes(line), f);
});

import { describe as describeWord, occurrences, hereLine, allLine, stepUrl, bibleHubUrl, cleanGloss, STEMS as PAGE_STEMS, FORMS as PAGE_FORMS, STEM_HINTS as PAGE_HINTS, PARTICLES as PAGE_PARTICLES, PERSON as PAGE_PERSON, GENDER as PAGE_GENDER, NUMBER as PAGE_NUMBER, STATE as PAGE_STATE } from "../site/app/words.js";
import { STEMS, FORMS, STEM_HINTS, PARTICLES, PERSON, GENDER, NUMBER, STATE } from "../scripts/words.mjs";

test("the page's label tables are the ones words.mjs decodes with", () => {
  assert.deepEqual(PAGE_STEMS, STEMS); assert.deepEqual(PAGE_FORMS, FORMS); assert.deepEqual(PAGE_HINTS, STEM_HINTS); assert.deepEqual(PAGE_PARTICLES, PARTICLES);
  assert.deepEqual(PAGE_PERSON, PERSON); assert.deepEqual(PAGE_GENDER, GENDER); assert.deepEqual(PAGE_NUMBER, NUMBER); assert.deepEqual(PAGE_STATE, STATE);
});

const lemmas = { H0559: { he: "אָמַר", gloss: "to say", all: 5308 }, H4186: { he: "מוֹשָׁב", gloss: "seat", all: 44 }, H9021: { he: "ךָ", gloss: "your" }, H3068G: { he: "יְהֹוָה", gloss: "LORD", all: 6520 }, H5186: { he: "נָטָה", gloss: "to stretch", all: 214 } };

test("describe: a verb with a prefix; the sentence is plain English with the Hebrew term after it", () => {
  const w = { i: 0, seg: [{ k: "c", t: "וַ", gl: "and", lem: "H9001" }, { k: "V", stem: "q", form: "w", p: 3, g: "m", n: "s", t: "יֹּֽאמֶר", gl: "he said", lem: "H0559", root: true }], lem: "H0559", morph: "Hc/Vqw3ms", ketiv: null };
  const d = describeWord(w, lemmas);
  assert.equal(d.sentence, "A verb, narrative past: ‘he said’. Simple action (Qal).");
  assert.equal(d.detail, "Qal · narrative past (wayyiqtol) · 3rd person masculine singular");
  assert.deepEqual(d.before, [{ t: "וַ", text: "and" }]);
  assert.deepEqual(d.after, []);
  assert.deepEqual(d.root, { lem: "H0559", he: "אָמַר", gloss: "to say", all: 5308 });
  assert.equal(d.code, "Hc/Vqw3ms");
});

test("describe: a noun with a suffix, a participle, a name, the divine name, a particle, a bare suffix root, a missing word", () => {
  const seat = describeWord({ seg: [{ k: "N", kind: "c", g: "m", n: "s", st: "c", t: "מוֹשָׁבֶֽ", gl: "seat", lem: "H4186", root: true }, { k: "S", kind: "p", p: 2, g: "m", n: "s", t: "ךָ", gl: "your", lem: "H9021" }], lem: "H4186", morph: "HNcmsc/Sp2ms" }, lemmas);
  assert.equal(seat.sentence, "A noun, masculine singular, in construct (‘… of’): ‘seat’.");
  assert.deepEqual(seat.after, [{ t: "ךָ", text: "your" }]);
  assert.equal(seat.detail, "noun · masculine singular construct");
  const ptc = describeWord({ seg: [{ k: "C", t: "וְ", gl: "and", lem: "H9002" }, { k: "V", stem: "q", form: "r", g: "m", n: "s", st: "c", t: "נ֣וֹטֵי", gl: "[who] stretched out", lem: "H5186", root: true }, { k: "S", kind: "p", p: 3, g: "m", n: "p", t: "הֶ֔ם", gl: "them", lem: "H9038" }], lem: "H5186", morph: "HC/Vqrmsc/Sp3mp" }, lemmas);
  assert.equal(ptc.sentence, "A verb, a participle (-ing; one who): ‘[who] stretched out’. Simple action (Qal).");
  assert.deepEqual(ptc.before, [{ t: "וְ", text: "and" }]); assert.deepEqual(ptc.after, [{ t: "הֶ֔ם", text: "them" }]);
  const name = describeWord({ seg: [{ k: "N", kind: "p", pk: "m", t: "יְהוֹנָתָ֖ן", gl: "Jonathan", lem: "H3083H", root: true }], lem: "H3083H", morph: "HNpm" }, lemmas);
  assert.equal(name.sentence, "A name: ‘Jonathan’.");
  assert.equal(name.detail, "proper noun");
  const place = describeWord({ seg: [{ k: "N", kind: "p", pk: "l", t: "יְהוּדָ֖ה", gl: "Judah", lem: "H3063G", root: true }], lem: "H3063G", morph: "HNpl" }, lemmas);
  assert.equal(place.sentence, "A place name: ‘Judah’.");
  const god = describeWord({ seg: [{ k: "N", kind: "p", pk: "t", t: "יְהוָ֖ה", gl: "Yahweh", lem: "H3068G", root: true }], lem: "H3068G", morph: "HNpt" }, lemmas);
  assert.equal(god.sentence, "The divine name, יי.");
  assert.deepEqual(god.root, { lem: "H3068G", he: "יי", gloss: "the Name", all: 6520 });
  const lord = describeWord({ seg: [{ k: "R", t: "לַֽ", gl: "to", lem: "H9005" }, { k: "N", kind: "p", pk: "t", t: "יהוָ֖ה", gl: "LORD", lem: "H3068G", root: true }], lem: "H3068G", morph: "HR/Npt" }, lemmas);
  assert.equal(lord.sentence, "The divine name, יי."); assert.deepEqual(lord.before, [{ t: "לַֽ", text: "to" }]);
  const ki = describeWord({ seg: [{ k: "T", kind: "c", t: "כִּ֥י", gl: "if", lem: "H3588A", root: true }], lem: "H3588A", morph: "HTc" }, {});
  assert.equal(ki.sentence, "A particle, conditional (if, for): ‘if’.");
  assert.deepEqual(ki.root, { lem: "H3588A", he: "", gloss: "", all: undefined });
  const lo = describeWord({ seg: [{ k: "R", def: true, t: "ל֥", gl: "to <the>", lem: "H9005" }, { k: "S", kind: "p", p: 3, g: "m", n: "s", t: "וֹ", gl: "him", lem: "H9033", root: true }], lem: "H9033", morph: "HRd/Sp3ms" }, {});
  assert.equal(lo.sentence, "A pronoun suffix, 3rd person masculine singular: ‘him’.");
  assert.deepEqual(lo.before, [{ t: "ל֥", text: "to" }]);
  const adj = describeWord({ seg: [{ k: "A", kind: "a", g: "m", n: "s", st: "a", t: "צַדִּ֛יק", gl: "righteous", lem: "H6662", root: true }], lem: "H6662", morph: "HAamsa" }, {});
  assert.equal(adj.sentence, "An adjective, masculine singular: ‘righteous’.");
  const num = describeWord({ seg: [{ k: "A", kind: "c", g: "b", n: "s", st: "c", t: "שְׁלֹ֥שֶׁת", gl: "[the] three", lem: "H7969", root: true }], lem: "H7969", morph: "HAcbsc" }, {});
  assert.equal(num.sentence, "A number: ‘[the] three’.");
  const pron = describeWord({ seg: [{ k: "C", t: "וַ", gl: "and", lem: "H9002" }, { k: "P", kind: "p", p: 1, g: "b", n: "s", t: "אֲנִ֕י", gl: "I", lem: "H0589", root: true }], lem: "H0589", morph: "HC/Pp1bs" }, {});
  assert.equal(pron.sentence, "A pronoun, 1st person singular: ‘I’.");
  const oshb = describeWord({ seg: [{ k: "V", stem: "N", form: "i", p: 3, g: "m", n: "s", t: "יִפָּקֵ֖ד", lem: "H6485", root: true }], lem: "H6485", morph: "HVNi3ms" }, {});
  assert.equal(oshb.sentence, "A verb, future or ongoing. Passive or reflexive (Niphal).", "no gloss from OSHB: no quotation");
  const none = describeWord(null, lemmas);
  assert.equal(none.sentence, "No word analysis for this word."); assert.equal(none.root, null);
  assert.equal(cleanGloss("to <the>"), "to"); assert.equal(cleanGloss("[the] son of"), "[the] son of"); assert.equal(cleanGloss(" and/ "), "and/");
});

test("occurrences, hereLine, allLine, link urls", () => {
  const words = { readings: { haftarah: { verses: { "20:18": [{ i: 0, lem: "H0559", seg: [{ gl: "and" }, { gl: "he said", root: true }] }, { i: 5, lem: "H6485K", seg: [{ gl: "you will be missed", root: true }] }], "20:27": [{ i: 7, lem: "H0559", seg: [{ gl: "he said", root: true }] }] } } } };
  assert.deepEqual(occurrences(words, "haftarah", "H0559"), [{ key: "20:18", i: 0, gloss: "he said" }, { key: "20:27", i: 7, gloss: "he said" }]);
  assert.deepEqual(occurrences(words, "torah", "H0559"), []);
  assert.equal(hereLine(1), "Once in this reading"); assert.equal(hereLine(3), "3 times in this reading");
  assert.equal(allLine(1), "Once in the Hebrew Bible, by dictionary word"); assert.equal(allLine(53), "53 times in the Hebrew Bible, by dictionary word"); assert.equal(allLine(undefined), "");
  assert.equal(stepUrl("H1254A"), "https://www.stepbible.org/?q=version=OHB|strong=H1254A&options=HNVUG");
  assert.equal(bibleHubUrl("H1254A"), "https://biblehub.com/hebrew/1254.htm");
  assert.equal(bibleHubUrl("H3117G"), "https://biblehub.com/hebrew/3117.htm", "Bible Hub has no lettered pages: the suffix is dropped");
  assert.equal(bibleHubUrl("H0559"), "https://biblehub.com/hebrew/559.htm");
  assert.equal(bibleHubUrl("H9023"), null);
});

import { translationOptions } from "../site/app/sheet.js";
test("translationOptions: JPS 2023 first, then the union of what the readings offer, in first-seen order; nothing to pick without a second version", () => {
  assert.deepEqual(translationOptions({ translations: { torah: [{ key: "metsudah", label: "Metsudah" }], haftarah: [{ key: "jps1985", label: "JPS 1985" }, { key: "koren", label: "Koren" }, { key: "metsudah", label: "Metsudah" }] } }), [{ key: "jps2023", label: "JPS 2023" }, { key: "metsudah", label: "Metsudah" }, { key: "jps1985", label: "JPS 1985" }, { key: "koren", label: "Koren" }]);
  assert.deepEqual(translationOptions({ translations: { haftarah: [] } }), [{ key: "jps2023", label: "JPS 2023" }]);
  assert.deepEqual(translationOptions(null), [{ key: "jps2023", label: "JPS 2023" }]);
});

test("the settings card's Translation row and the note are the agreed strings", () => {
  const src = readSite(new URL("../site/app/settings.js", import.meta.url), "utf8");
  assert.ok(src.includes('label.textContent = "Translation"'));
  const sheetSrc = readSite(new URL("../site/app/sheet.js", import.meta.url), "utf8");
  assert.ok(sheetSrc.includes("Notes and glosses refer to the JPS translation."));
});

test("the related panel's strings are the agreed ones", () => {
  const panelSrc = readSite(new URL("../site/app/panel.js", import.meta.url), "utf8");
  for (const s of ["From Sefaria, not edited by CRC", "Show texts with no English", "on this sheet", "Sefaria did not answer for this verse when the sheet was published.", "← Everything on "]) assert.ok(panelSrc.includes(s), s);
  const sheetSrc = readSite(new URL("../site/app/sheet.js", import.meta.url), "utf8");
  assert.ok(sheetSrc.includes('data-act="related">Everything on this verse</button>'));
});

test("the word-analysis and translation credits are in README and the page", () => {
  const readme = readSite(new URL("../README.md", import.meta.url), "utf8");
  for (const s of ["Word analysis: STEPBible TAHOT and TBESH, data created by www.STEPBible.org based on work at Tyndale House Cambridge (CC BY 4.0), trimmed and aligned for this site.", "Word analysis: Open Scriptures Hebrew Bible morphology (CC BY 4.0); Westminster Leningrad Codex (public domain).", "English: Tanakh: The Holy Scriptures (The Jewish Publication Society, 1985), CC BY-NC, via Sefaria.", "English: The Koren Jerusalem Bible (Koren Publishers Jerusalem), CC BY-NC, via Sefaria.", "English: The Metsudah Tanach series (Lakewood, N.J.), CC BY, via Sefaria."]) assert.ok(readme.includes(s), s);
  const sheetSrc = readSite(new URL("../site/app/sheet.js", import.meta.url), "utf8");
  assert.ok(sheetSrc.includes("Word analysis:"), "the page credits the word data while a week has it");
});
