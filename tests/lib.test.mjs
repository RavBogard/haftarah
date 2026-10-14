import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
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

test("divineName leaves sof pasuq, maqaf and paseq outside the Name", () => {
  // silluq/meteg U+05BD is not an accent carried onto the yud; the ׃ must survive
  assert.equal(lib.divineName("אָמַ֥ר יְהֹוָֽה׃").html, "אָמַ֥ר יי׃");
  assert.equal(lib.divineName("יְהוָ֖ה־").html, "יי֖־");
  // the paseq attached to the Name, not after a space, so the pattern itself must stop before it
  assert.equal(lib.divineName("יְהוָ֣ה׀").html, "יי֣׀");
});

test("stripMarks removes vowels and accents", () => {
  assert.equal(lib.stripMarks("וְנִפְקַ֕דְתָּ"), "ונפקדת");
});

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
  assert.equal(out, 'a light of <span class="nb">nations<sup class="fn">c</sup>—</span>');
});

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

test("sigla are one filled family and registers have plain names", () => {
  for (const k of lib.REGISTER_ORDER) {
    assert.match(lib.SIGLA[k], /fill="currentColor"/);
    assert.doesNotMatch(lib.SIGLA[k], /fill="none"/);
  }
  assert.equal(lib.REGISTER_NAMES.critical, "what historians say");
  assert.equal(lib.REGISTER_NAMES.traditional, "classical commentators");
});

test("voicesFor introduces each named source once, in order of first use, skipping drafted titles", () => {
  const voices = { "Rashi": "Rashi (R. Shlomo Yitzchaki), Troyes, 1040–1105", "Talmud": "The Babylonian Talmud, c. 200–500 CE" };
  const commentary = [
    { register: "traditional", source: "Talmud, Megillah 31a", status: "approved" },
    { register: "traditional", source: "Rashi", status: "approved" },
    { register: "traditional", source: "Rashi", status: "approved" },
    { register: "critical", source: "A damaged verse", status: "approved" },
    { register: "traditional", source: "Radak", status: "approved" },
    { register: "traditional", source: "Malbim", status: "rejected" },
  ];
  const r = lib.voicesFor(commentary, voices, e => e.status !== "rejected");
  assert.deepEqual(r.map(v => v.name), ["Talmud", "Rashi", "Radak"]);
  assert.deepEqual(r[0].refs, ["Megillah 31a"]);
  assert.equal(r[1].line, voices.Rashi);
  assert.equal(r[2].line, null);
});

test("fitIncipitSize shrinks to the box and falls back to two lines at 44pt", () => {
  assert.deepEqual(lib.fitIncipitSize(400, 336), { size: 50, lines: 1 });
  assert.deepEqual(lib.fitIncipitSize(480, 336), { size: 42, lines: 1 });
  assert.deepEqual(lib.fitIncipitSize(600, 336), { size: 44, lines: 2 });
  assert.deepEqual(lib.fitIncipitSize(250, 336), { size: 54, lines: 1 });
});

test("nowrapKeys leaves a key that follows a tag alone", () => {
  const html = '<span class="indentAll"><sup class="fn">i</sup>G<small>OD</small> desires his vindication,';
  assert.equal(lib.nowrapKeys(html), html);
});

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
  const v2 = migrate(v1);
  assert.equal(v2.schema, 2);
  assert.deepEqual(v2.series, { name: "Torah from Scratch", year: "5787" });
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

test("analyse flags a text page that overflows and margin notes assigned but never printed", () => {
  const dom = `<html data-pages="2" data-yy="0" data-keys="a,b,c" data-empty-sections="0">
<section class="page front recto" data-kind="front"></section>
<section class="page text verso" data-kind="text" data-rows="3" data-gap="10" data-fill="120" data-split="" data-cont="0" data-offpage="0" data-leftover="-300" data-overflow="true"><div class="margin-col"><p class="note jps" style="top: 2px;"><span class="k">a</span>x</p><p class="note jps" style="top: 40px;"><span class="k">a</span>x</p></div></section>
</html>`;
  const { problems } = analyse(dom);
  assert.ok(problems.some(p => /page 2: content overflows/.test(p)), problems.join("\n"));
  assert.ok(problems.some(p => /margin notes assigned but not printed: b, c/.test(p)), problems.join("\n"));
  assert.ok(problems.some(p => /margin note printed twice: a/.test(p)), problems.join("\n"));
});

test("isDeadRef keeps a cross-reference to a verse the reader has", () => {
  const samuel = { chapter: 20, verse: 18, endChapter: 20, endVerse: 42 };
  assert.equal(lib.isDeadRef("See 20.25 and note.", samuel), false);
  assert.equal(lib.isDeadRef("See note at 10.11.", samuel), true);
  assert.equal(lib.isDeadRef("See 20.25 and note.", { chapter: 20, verse: 18, endChapter: 20, endVerse: 20 }), true);
  assert.equal(lib.isDeadRef("Cf. 43.9–12.", { chapter: 42, verse: 5, endChapter: 43, endVerse: 10 }), false);
});

test("assignKeys keeps an in-range cross-reference, normalised, and drops one outside the reading", () => {
  const verses = [
    { chapter: 20, verse: 18, he: "", en: 'x<sup class="fn">a</sup> y<sup class="fn">b</sup>', notes: [{ marker: "a", text: "See 20.25 and note." }, { marker: "b", text: "See 18.11." }] },
    { chapter: 20, verse: 25, he: "", en: "z", notes: [] },
  ];
  const r = lib.assignKeys(verses, [], () => true);
  assert.deepEqual(r.sequence, ["a"]);
  assert.equal(r.verses[0].keys[0].text, "See 20:25 and note.");
  assert.equal(r.verses[0].en, 'x<sup class="fn">a</sup> y');
});

test("migrate stamps a status on legacy glossary terms and glosses so the gate sees them", () => {
  const v1 = { schema: 1, shabbat: { hebrewEn: "29 Tishrei 5787", parashah: { en: "Bereshit" } }, haftarah: { ref: "I Samuel 20:18-42" },
    glossary: [{ term: "Abner" }, { term: "Jesse", status: "approved" }], glosses: [{ verse: 1, lemma: "א" }, { verse: 2, lemma: "ב", status: "approved" }] };
  const v2 = migrate(v1);
  assert.equal(v2.glossary[0].status, "proposed");
  assert.equal(v2.glossary[1].status, "approved");
  assert.equal(v2.glosses[0].status, "proposed");
  assert.equal(v2.glosses[1].status, "approved");
});

test("analyse lets the last verse stand alone when only note pages follow it", () => {
  const dom = `<html data-pages="4" data-yy="0" data-keys="" data-empty-sections="0">
<section class="page front recto" data-kind="front"></section>
<section class="page text verso" data-kind="text" data-rows="4" data-gap="10" data-fill="90" data-split="" data-cont="0" data-offpage="0"></section>
<section class="page text recto" data-kind="text" data-rows="1" data-gap="30" data-fill="90" data-split="" data-cont="0" data-offpage="0"></section>
<section class="page text verso" data-kind="text" data-rows="0" data-gap="-1" data-fill="80" data-split="" data-cont="0" data-offpage="0"></section>
</html>`;
  assert.deepEqual(analyse(dom).problems, []);
});

// ---- tropePhrases ------------------------------------------------------------
const fam = ps => ps.map(p => p.family);
const htmls = ps => ps.map(p => p.html);

test("tropePhrases cuts Isaiah 54:1 at etnachta, zakef, tevir and the verse end", () => {
  const he = "רׇנִּ֥י עֲקָרָ֖ה לֹ֣א יָלָ֑דָה פִּצְחִ֨י רִנָּ֤ה וְצַֽהֲלִי֙ לֹא־חָ֔לָה כִּֽי־רַבִּ֧ים בְּֽנֵי־שׁוֹמֵמָ֛ה מִבְּנֵ֥י בְעוּלָ֖ה אָמַ֥ר יְהֹוָֽה׃";
  const ps = lib.tropePhrases(he);
  assert.deepEqual(fam(ps), ["etnachta", "zakef", "tevir", "sof-pasuk"]);
  assert.deepEqual(htmls(ps), [
    "רׇנִּ֥י עֲקָרָ֖ה לֹ֣א יָלָ֑דָה",
    "פִּצְחִ֨י רִנָּ֤ה וְצַֽהֲלִי֙ לֹא־חָ֔לָה",
    "כִּֽי־רַבִּ֧ים בְּֽנֵי־שׁוֹמֵמָ֛ה",
    "מִבְּנֵ֥י בְעוּלָ֖ה אָמַ֥ר יְהֹוָֽה׃",
  ]);
});

test("tropePhrases treats munach before a paseq as legarmeh (a revia block)", () => {
  const he = "הַרְחִ֣יבִי <b>׀</b> מְק֣וֹם אׇהֳלֵ֗ךְ וִירִיע֧וֹת מִשְׁכְּנוֹתַ֛יִךְ יַטּ֖וּ אַל־תַּחְשֹׂ֑כִי הַאֲרִ֙יכִי֙ מֵיתָרַ֔יִךְ וִיתֵדֹתַ֖יִךְ חַזֵּֽקִי׃";
  const ps = lib.tropePhrases(he);
  assert.deepEqual(fam(ps), ["revia", "revia", "tevir", "etnachta", "zakef", "sof-pasuk"]);
  assert.deepEqual(htmls(ps), [
    "הַרְחִ֣יבִי <b>׀</b>",
    "מְק֣וֹם אׇהֳלֵ֗ךְ",
    "וִירִיע֧וֹת מִשְׁכְּנוֹתַ֛יִךְ",
    "יַטּ֖וּ אַל־תַּחְשֹׂ֑כִי",
    "הַאֲרִ֙יכִי֙ מֵיתָרַ֔יִךְ",
    "וִיתֵדֹתַ֖יִךְ חַזֵּֽקִי׃",
  ]);
});

test("tropePhrases: a word with two accents ends a block if either one does", () => {
  const a = lib.tropePhrases("עַל־מ֨וֹשָׁב֜וֹ יִפָּקֵ֖ד מוֹשָׁבֶֽךָ׃");
  assert.deepEqual(fam(a), ["azla", "sof-pasuk"]);
  assert.equal(a[0].html, "עַל־מ֨וֹשָׁב֜וֹ");
  const z = lib.tropePhrases("וּמִ֨מְּחִתָּ֔ה יִפָּקֵ֖ד מוֹשָׁבֶֽךָ׃");
  assert.deepEqual(fam(z), ["zakef", "sof-pasuk"]);
  assert.equal(z[0].html, "וּמִ֨מְּחִתָּ֔ה");
});

test("tropePhrases names the haftarah's last block sof-haftarah when final", () => {
  const he = "כִּ֥י יִפָּקֵ֖ד מוֹשָׁבֶֽךָ׃";
  assert.deepEqual(fam(lib.tropePhrases(he, { final: true })), ["sof-haftarah"]);
  assert.deepEqual(fam(lib.tropePhrases(he)), ["sof-pasuk"]);
});

test("tropePhrases folds zarka in both encodings into the segol block", () => {
  for (const zarka of ["֮", "֘"]) {
    const he = `וַיֹּ֥אמֶר הַנַּעַר${zarka} אָמַר֒ יִפָּקֵ֖ד מוֹשָׁבֶֽךָ׃`;
    const ps = lib.tropePhrases(he);
    assert.deepEqual(fam(ps), ["segol", "sof-pasuk"], `zarka U+${zarka.codePointAt(0).toString(16)}`);
    assert.equal(ps[0].html, `וַיֹּ֥אמֶר הַנַּעַר${zarka} אָמַר֒`);
  }
});

test("tropePhrases keeps a ketiv/qere element as one token", () => {
  const kq = '<span class="mam-kq"><span class="mam-kq-q">[הַ֣חִצִּ֔ים]</span> <span class="mam-kq-k">(החצי)</span></span>';
  const he = `וַיֹּ֤אמֶר הַנַּ֙עַר֙ אֶת־${kq} וְאֶת־קְשַׁתּ֖וֹ`;
  const ps = lib.tropePhrases(he);
  assert.deepEqual(fam(ps), ["zakef", "sof-pasuk"]);
  assert.equal(ps[0].html, `וַיֹּ֤אמֶר הַנַּ֙עַר֙ אֶת־${kq}`);
  assert.ok(ps[0].html.includes(kq));
  assert.equal(ps[1].html, "וְאֶת־קְשַׁתּ֖וֹ");
});

test("tropePhrases returns a letterless token between blocks, unwrapped", () => {
  const pisqa = '<span class="pisqa"></span>';
  const he = `לֹ֣א יָלָ֑דָה ${pisqa} כִּ֥י יִפָּקֵ֖ד מוֹשָׁבֶֽךָ׃`;
  const ps = lib.tropePhrases(he);
  assert.deepEqual(ps, [
    { family: "etnachta", html: "לֹ֣א יָלָ֑דָה" },
    { family: null, html: pisqa },
    { family: "sof-pasuk", html: "כִּ֥י יִפָּקֵ֖ד מוֹשָׁבֶֽךָ׃" },
  ]);
});

test("tropePhrases splits a block around a letterless token inside it", () => {
  const pisqa = '<span class="pisqa"></span>';
  const he = `לֹ֣א ${pisqa} יָלָ֑דָה כִּ֥י יִפָּקֵ֖ד מוֹשָׁבֶֽךָ׃`;
  const ps = lib.tropePhrases(he);
  assert.deepEqual(fam(ps), ["etnachta", null, "etnachta", "sof-pasuk"]);
  assert.equal(ps[1].html, pisqa);
  assert.equal(ps.map(p => p.html).join(" "), he);
});

test("tropePhrases round-trips every fixture verse", () => {
  for (const f of ["week-notes", "week-min"]) {
    const sheet = JSON.parse(readFileSync(new URL(`./fixtures/${f}/sheet.json`, import.meta.url), "utf8"));
    for (const v of sheet.verses) {
      const he = v.he.replace(/&thinsp;/g, " ");
      const ps = lib.tropePhrases(he);
      assert.equal(ps.map(p => p.html).join(" "), he, `${f} ${v.chapter}:${v.verse}`);
      for (const p of ps) assert.ok(p.html.length > 0, `${f} ${v.chapter}:${v.verse} empty block`);
    }
  }
});

test("TROPE_FAMILIES is the legend order", () => {
  assert.deepEqual(lib.TROPE_FAMILIES.map(([k]) => k), ["zakef", "etnachta", "sof-pasuk", "revia", "tevir", "segol", "azla", "telisha-ketana", "pazer", "zakef-gadol", "sof-haftarah"]);
  assert.equal(lib.TROPE_FAMILIES[6][1], "kadma v’azla");
});

// ---- tropeHtml / tropeFamiliesUsed -------------------------------------------
const is547 = "בְּרֶ֥גַע קָטֹ֖ן עֲזַבְתִּ֑יךְ וּבְרַחֲמִ֥ים גְּדֹלִ֖ים אֲקַבְּצֵֽךְ׃";

test("tropeHtml wraps each phrase of Isaiah 54:7 in its family's span", () => {
  assert.equal(lib.tropeHtml(is547),
    '<span class="tr tr-etnachta">בְּרֶ֥גַע קָטֹ֖ן עֲזַבְתִּ֑יךְ</span> <span class="tr tr-sof-pasuk">וּבְרַחֲמִ֥ים גְּדֹלִ֖ים אֲקַבְּצֵֽךְ׃</span>');
  assert.match(lib.tropeHtml(is547, { final: true }), /<span class="tr tr-sof-haftarah">וּבְרַחֲמִ֥ים גְּדֹלִ֖ים אֲקַבְּצֵֽךְ׃<\/span>$/);
});

test("tropeHtml leaves a separator bare", () => {
  const pisqa = '<span class="pisqa"></span>';
  const out = lib.tropeHtml(`לֹ֣א ${pisqa} יָלָ֑דָה כִּ֥י יִפָּקֵ֖ד מוֹשָׁבֶֽךָ׃`);
  assert.equal(out, `<span class="tr tr-etnachta">לֹ֣א</span> ${pisqa} <span class="tr tr-etnachta">יָלָ֑דָה</span> <span class="tr tr-sof-pasuk">כִּ֥י יִפָּקֵ֖ד מוֹשָׁבֶֽךָ׃</span>`);
});

test("tropeHtml keeps the text of every fixture verse", () => {
  const strip = s => s.replace(/<[^>]*>/g, "");
  for (const f of ["week-notes", "week-min"]) {
    const sheet = JSON.parse(readFileSync(new URL(`./fixtures/${f}/sheet.json`, import.meta.url), "utf8"));
    for (const v of sheet.verses) {
      const he = v.he.replace(/&thinsp;/g, " ");
      assert.equal(strip(lib.tropeHtml(he)), strip(he), `${f} ${v.chapter}:${v.verse}`);
    }
  }
});

test("tropeFamiliesUsed names the families a haftarah uses, the last verse final", () => {
  assert.deepEqual(lib.tropeFamiliesUsed([{ he: is547 }]), new Set(["etnachta", "sof-haftarah"]));
  assert.deepEqual(lib.tropeFamiliesUsed([{ he: is547 }, { he: "כִּ֥י יִפָּקֵ֖ד מוֹשָׁבֶֽךָ׃" }]), new Set(["etnachta", "sof-pasuk", "sof-haftarah"]));
});

const notes = JSON.parse(readFileSync(new URL("./fixtures/week-notes/sheet.json", import.meta.url), "utf8"));
const min = JSON.parse(readFileSync(new URL("./fixtures/week-min/sheet.json", import.meta.url), "utf8"));
const visible = i => i.status !== "rejected";

test("escapeHtml, enDash, shabbatName", () => {
  assert.equal(lib.escapeHtml('a<b>&"'), "a&lt;b&gt;&amp;&quot;");
  assert.equal(lib.enDash("Isaiah 54:1-55:5"), "Isaiah 54:1–55:5");
  assert.equal(lib.shabbatName(notes), "Shabbat Bereshit, Machar Chodesh");
  assert.equal(lib.shabbatName({ shabbat: { parashah: { en: "Noach" } } }), "Shabbat Noach");
});

test("sheetModel: verses, keys and entries match the paginator's rules", () => {
  for (const data of [notes, min]) {
    const before = structuredClone(data);
    const m = lib.sheetModel(data, { voices: {} });
    assert.deepEqual(data, before, "input is not mutated");
    assert.equal(m.verses.length, data.verses.length);
    const keyed = lib.assignKeys(data.verses, data.glosses || [], visible);
    assert.deepEqual(m.sequence, keyed.sequence);
    m.verses.forEach((v, i) => assert.deepEqual(v.keys.map(k => k.key), keyed.verses[i].keys.map(k => k.key)));
    const shown = data.commentary.filter(visible).length;
    assert.equal(m.entries.length, shown);
    assert.equal(m.verses.reduce((n, v) => n + v.entries.length, 0), shown);
    for (const v of m.verses) {
      const orders = v.entries.map(e => e.order);
      assert.deepEqual(orders, [...orders].sort((a, b) => a - b), `entries of ${v.ref} sorted by order`);
      assert.ok(v.heHtml.includes('class="tr tr-'), "trope spans present");
      assert.ok(v.enLines.length >= 1);
    }
    assert.equal(m.verses[0].showChapter, true);
    assert.equal(m.verses.at(-1).final, true);
    assert.ok(m.verses.at(-1).heHtml.includes("tr-sof-haftarah"));
  }
});

test("sheetModel: rejected items are absent; statuses never matter otherwise", () => {
  const d = structuredClone(notes);
  d.commentary[0].status = "rejected";
  d.glosses[0].status = "rejected";
  d.glossary[0].status = "rejected";
  d.nextWeek = { shabbat: "Noach", ref: "Isaiah 54:1-55:5", civilDisplay: "October 17, 2026", status: "rejected" };
  const m = lib.sheetModel(d);
  assert.equal(m.entries.length, notes.commentary.length - 1);
  assert.equal(m.sequence.length, lib.assignKeys(notes.verses, notes.glosses, visible).sequence.length - 1);
  assert.equal(m.glossary.length, notes.glossary.length - 1);
  assert.equal(m.nextWeek, null);
  d.nextWeek.status = "proposed";
  assert.equal(lib.sheetModel(d).nextWeek.line, "Next week: Noach · Isaiah 54:1–55:5 · October 17, 2026");
});

test("sheetModel: entry tails follow buildEntry's rules for the four registers", () => {
  const base = { verses: [{ ref: "Isaiah 54:1", chapter: 54, verse: 1, he: "רׇנִּ֥י עֲקָרָ֖ה", en: "Shout" }], shabbat: { parashah: { en: "Noach" } }, haftarah: { ref: "Isaiah 54:1-55:5", book: "Isaiah", incipit: { he: "רׇנִּ֥י", en: "Shout" }, versions: { he: "M", en: "J" } } };
  const d = { ...base, commentary: [
    { verse: 1, register: "traditional", source: "Radak", sourceRef: "Radak on Isaiah 54:1", translation: "claude", text: "t", order: 2 },
    { verse: 1, register: "modern", source: "Hertz", sourceRef: "Hertz on Isaiah 54:1", translation: "Hertz, adapted", text: "t", order: 1 },
    { verse: 1, register: "critical", source: "Date and setting", works: ["Blenkinsopp 2002"], cites: "see Blenkinsopp", text: "t", order: 3 },
    { verse: 1, register: "critical", kind: "quotation", source: "Blenkinsopp", cites: "Blenkinsopp 2002, 361", text: "t", order: 4 },
    { verse: 1, verseEnd: 3, register: "reference", source: "Jewish Encyclopedia", sourceRef: "Jewish Encyclopedia, Isaiah", text: "t", order: 5 },
  ] };
  const [hertz, radak, crit, quote, ref] = lib.sheetModel(d).verses[0].entries;
  assert.deepEqual(radak.tail, ["Radak on Isaiah 54:1", "translated for this sheet"]);
  assert.equal(radak.drafted, false);
  assert.deepEqual(hertz.tail, ["Hertz on Isaiah 54:1", "Hertz, adapted"]);
  assert.deepEqual(crit.tail, ["summary drafted for this sheet", "see Blenkinsopp"]);
  assert.equal(crit.drafted, true);
  assert.deepEqual(quote.tail, ["Blenkinsopp 2002, 361"]);
  assert.deepEqual(ref.tail, ["Jewish Encyclopedia, Isaiah"]);
  assert.equal(ref.verseLabel, "1–3");
  assert.equal(ref.drafted, true);
});

test("sheetModel: divine name, gloss keys in the Hebrew, title and front matter", () => {
  const d = {
    shabbat: { civil: "2026-10-17", civilDisplay: "October 17, 2026", hebrew: "ו׳ בְּחֶשְׁוָן תשפ״ז", hebrewEn: "6 Cheshvan 5787", parashah: { en: "Noach" } },
    haftarah: { ref: "Isaiah 54:1-55:5", heRef: "ישעיהו נ״ד:א׳-נ״ה:ה׳", book: "Isaiah", title: { en: "Noach" }, incipit: { he: "רׇנִּ֥י עֲקָרָ֖ה", en: "Shout, O infertile one" }, versions: { he: "Miqra", en: "JPS" } },
    verses: [
      { ref: "Isaiah 54:1", chapter: 54, verse: 1, he: "אָמַ֥ר יְהֹוָֽה׃", en: "said G<small>OD</small>." },
      { ref: "Isaiah 55:1", chapter: 55, verse: 1, he: "ה֤וֹי כׇּל־צָמֵא֙ לְכ֣וּ לַמַּ֔יִם", en: "Ho, all who are thirsty,<br>Come for water" },
    ],
    glosses: [{ verse: 1, chapter: 55, lemma: "צָמֵא֙", en: "thirsty", text: "<i>tsame</i>, thirsty." }],
    commentary: [{ verse: 1, register: "traditional", source: "Rashi", sourceRef: "Rashi on Isaiah 54:1", text: "a", order: 1 }],
    openingNote: { calendar: "Cal.", setting: ["S1", "S2"] },
    credits: { signoff: "I chose every entry.", editor: "Rabbi Daniel Bogard" },
    series: { name: "Torah from Scratch", year: "5787" },
  };
  const m = lib.sheetModel(d, { voices: { Rashi: "R. Shlomo Yitzchaki" } });
  assert.equal(m.title, "Haftarat Noach · Isaiah 54:1–55:5");
  // A title that already says "Haftarat" (as the real weeks' sheet.json does) is not prefixed twice.
  assert.equal(lib.sheetModel({ ...d, haftarah: { ...d.haftarah, title: { en: "Haftarat Noach" } } }).title, "Haftarat Noach · Isaiah 54:1–55:5");
  assert.equal(m.shabbatName, "Shabbat Noach");
  assert.equal(m.seriesLabel, "6 Cheshvan 5787");
  assert.equal(m.ref, "Isaiah 54:1–55:5");
  assert.ok(m.verses[0].heHtml.includes("יי"));
  assert.equal(m.yyCount, 1);
  assert.equal(m.verses[1].showChapter, true);
  assert.equal(m.verses[1].poetry, true);
  assert.equal(m.verses[1].enLines.length, 2);
  assert.match(m.verses[1].heHtml, /צָמֵא֙<sup class="fn he">a<\/sup>/);
  assert.match(m.verses[1].enLines[0], /thirsty<sup class="fn">a<\/sup>/);
  assert.deepEqual(m.verses[1].keys.map(k => [k.key, k.kind, k.lemma]), [["a", "gloss", "thirsty"]]);
  assert.equal(m.verses[1].keys[0].tail, "");
  assert.deepEqual(m.front.legend, { used: ["traditional"], hasKeys: true, hasKetiv: false });
  assert.deepEqual(m.front.openingNote, { calendar: ["Cal."], setting: ["S1", "S2"] });
  assert.deepEqual(m.front.voices, [{ name: "Rashi", refs: [], line: "R. Shlomo Yitzchaki" }]);
  assert.equal(m.front.provenance.signed, true);
  assert.equal(m.front.provenance.editor, "Rabbi Daniel Bogard");
  assert.ok(m.front.families.every(f => f.key && f.name));
  assert.ok(m.front.families.some(f => f.key === "sof-haftarah"));
  // no title.en: the Shabbat name carries the <title>
  delete d.haftarah.title;
  assert.equal(lib.sheetModel(d).title, "Shabbat Noach · Isaiah 54:1–55:5");
});

test("sheetModel keys a gloss whose lemma is not found by appending", () => {
  const d = { shabbat: { parashah: { en: "X" } }, haftarah: { ref: "Isaiah 54:1", book: "Isaiah", incipit: { he: "א", en: "a" }, versions: {} },
    verses: [{ ref: "Isaiah 54:1", chapter: 54, verse: 1, he: "רׇנִּ֥י עֲקָרָ֖ה", en: "Shout, O infertile one" }],
    glosses: [{ verse: 1, lemma: "שָׁלוֹם", en: "infertile", text: "nowhere" }], commentary: [] };
  const v = lib.sheetModel(d).verses[0];
  assert.ok(v.heHtml.includes('<sup class="fn he">a</sup>'), "the key is still there");
  assert.equal((v.heHtml.match(/<sup/g) || []).length, 1);
  assert.deepEqual(v.keys.map(k => k.key), ["a"]);
});

test("sheetModel attaches a chapter-less entry to the first verse with that number", () => {
  const d = { shabbat: { parashah: { en: "X" } }, haftarah: { ref: "Isaiah 54:1-55:1", book: "Isaiah", incipit: { he: "א", en: "a" }, versions: {} },
    verses: [{ ref: "Isaiah 54:1", chapter: 54, verse: 1, he: "א", en: "a" }, { ref: "Isaiah 55:1", chapter: 55, verse: 1, he: "ב", en: "b" }],
    glosses: [], commentary: [{ verse: 1, register: "traditional", source: "Rashi", sourceRef: "Rashi on Isaiah 54:1", text: "t", order: 1 }] };
  const m = lib.sheetModel(d);
  assert.equal(m.verses[0].entries.length, 1);
  assert.equal(m.verses[1].entries.length, 0);
});
