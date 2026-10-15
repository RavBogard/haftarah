import { test } from "node:test";
import assert from "node:assert/strict";
import { BOOKS, skeleton, parseTahot, parseTbesh, parseOshb, decodeMorph, segmentsOf, rootOf, alignVerse, STEMS, FORMS, cacheDir, STEP_FILES, oshbFile, ensureFiles, frequencyTable, wordsFor, buildWords } from "../scripts/words.mjs";
import { mkdtemp, writeFile, readFile, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const L = createRequire(import.meta.url)("../template/lib.js");
const fixture = name => JSON.parse(readFileSync(new URL(`./fixtures/${name}/sheet.json`, import.meta.url), "utf8"));

// Eleven rows of STEP's TAHOT (CC BY 4.0, www.STEPBible.org / Tyndale House Cambridge): I Samuel 20:18,
// a Q(K) row from 20:38, and the two halves of Isaiah 63:19 as STEP numbers them (English 63:19 and 64:1).
const TAHOT = [
  "Eng (Heb) Ref & Type\tHebrew\tTransliteration\tTranslation\tdStrongs\tGrammar\tMeaning Variants\tSpelling Variants\tRoot dStrong+Instance\tAlternative Strongs+Instance\tConjoin word\tExpanded Strong tags",
  "1Sa.20.18#01=L\tוַ/יֹּֽאמֶר\\־\tva/i.yo.mer-\tand/ he said\tH9001/{H0559}\\H9014\tHc/Vqw3ms\t\t\tH0559\t\t\tH9001=ו=/{H0559=אָמַר=to say}\\H9014=־=link",
  "1Sa.20.18#02=L\tל֥/וֹ\tl/o\tto <the>/ him\tH9005/{H9033}\tHRd/Sp3ms\t\t\tH9033\t\t\tH9005=ל=to/{H9033=Os3m=him}",
  "1Sa.20.18#03=L\tיְהוֹנָתָ֖ן\tye.ho.na.Tan\tJonathan\t{H3083H}\tHNpm\t\t\tH3083H\t\t\t{H3083H=יְהוֹנָתָן=Jonathan»Jonathan@1Sa.13.2-1Sa}",
  "1Sa.20.18#04=L\tמָחָ֣ר\tma.Char\t[will be] tomorrow\t{H4279}\tHNcmsa\t\t\tH4279\t\t\t{H4279=מָחָר=tomorrow}",
  "1Sa.20.18#05=L\tחֹ֑דֶשׁ\tCho.desh\ta new moon\t{H2320H}\tHNcmsa\t\t\tH2320H\t\t\t{H2320H=חֹ֫דֶשׁ=: new_moon»month:2_new_moon}",
  "1Sa.20.18#06=L\tוְ/נִפְקַ֕דְתָּ\tve./nif.Kad.ta\tand/ you will be missed\tH9001/{H6485K}\tHc/VNq2ms\t\t\tH6485K\t\t\tH9001=ו=/{H6485K=פָּקַד=: missing»to reckon:6_missing;_empty}",
  "1Sa.20.18#07=L\tכִּ֥י\tki\tif\t{H3588A}\tHTc\t\t\tH3588A\t\t\t{H3588A=כִּי=for}",
  "1Sa.20.18#08=L\tיִפָּקֵ֖ד\tyi.pa.Ked\tit will be empty\t{H6485K}\tHVNi3ms\t\t\tH6485K\t\t\t{H6485K=פָּקַד=: missing»to reckon:6_missing;_empty}",
  "1Sa.20.18#09=L\tמוֹשָׁבֶֽ/ךָ\\׃\tmo.sha.Ve./kha\tseat/ your\t{H4186}/H9021\\H9016\tHNcmsc/Sp2ms\t\t\tH4186\t\t\t{H4186=מוֹשָׁב=seat}/H9021=Ps2m=your\\H9016=׃=verseEnd",
  "1Sa.20.38#13=Q(K)\tהַ֣/חִצִּ֔ים\tha./che.tzi\tthe/ arrows\tH9009/{H2671}\tHTd/Ncmpa\tK= ha./che.tzi (הַ/חֵצִי) \"the/ arrow\" (H9009/H2678=HTd/Ncmsa)\tL= הַ֣/חִצִּ֔י ¦ ;\tH2671\tH2678\t\tH9009=ה=the/{H2671=חֵץ=arrow}",
  "Isa.63.19#01=L\tהָיִ֗ינוּ\tha.Yi.nu\twe have been\t{H1961}\tHVqp1cp\t\t\tH1961\t\t\t{H1961=הָיָה=to be}",
  "Isa.64.1(63.19)#10=L\tלוּא\\־\tlu'-\tif\t{H3863}\\H9014\tHTc\t\t\tH3863\t\t\t{H3863=לוּא=if only}\\H9014=־=link",
  "Isa.64.1(63.19)#11=L\tקָרַ֤עְתָּ\tka.Ra'.ta\tyou tore\t{H7167}\tHVqp2ms\t\t\tH7167\t\t\t{H7167=קָרַע=to tear}",
  "1Sa.13.1#02=X\tשְׁלֹשִׁים\tshe.lo.Shim\tthirty\t{H7970}\tHAcmpa\t\t\tH7970\t\t\t{H7970=שְׁלֹשִׁים=thirty}",
].join("\n");

const TBESH = [
  "eStrong#\tdStrong\tuStrong\tHebrew\tTransliteration\tMorph\tGloss\tMeaning",
  "H0559\tH0559 =\tH0559\tאָמַר\ta.mar\tH:V\tto say\t1) to say, speak, utter",
  "H1254a\tH1254A =\tH1254A\tבָּרָא\tba.ra\tH:V\tto create\t1) to create, shape, form",
  "H6485a\tH6485K = a Meaning of\tH6485A\tפָּקַד\tpa.qad\tH:V\tto reckon: missing\t: missing/empty",
  "H9001\tH9001 =\tH9001\t/וַ\tv\tH:Conj\t&\tVerbal vav",
  "H9021\tH9021 =\tH9021\tךָ\tkha\tPs2m\tyour\tPersonal possessive pronoun",
].join("\n");

test("BOOKS names the 26 books with STEP's codes and files and OSHB's codes", () => {
  assert.deepEqual(BOOKS["I Samuel"], { step: "1Sa", group: "Jos-Est", osis: "1Sam" });
  assert.deepEqual(BOOKS.Genesis, { step: "Gen", group: "Gen-Deu", osis: "Gen" });
  assert.deepEqual(BOOKS.Hosea, { step: "Hos", group: "Isa-Mal", osis: "Hos" });
  assert.deepEqual(BOOKS.Ezekiel, { step: "Ezk", group: "Isa-Mal", osis: "Ezek" });
  assert.deepEqual(BOOKS.Joel, { step: "Jol", group: "Isa-Mal", osis: "Joel" });
  assert.deepEqual(BOOKS.Nahum, { step: "Nam", group: "Isa-Mal", osis: "Nah" });
  assert.equal(Object.keys(BOOKS).length, 26);
  assert.equal(BOOKS.Psalms, undefined);
});

test("skeleton: consonants only, the divine name as יי on both sides", () => {
  assert.equal(skeleton("וַ/יֹּֽאמֶר\\־"), "ויאמר");
  assert.equal(skeleton("יְהוָ֖ה"), "יי");
  assert.equal(skeleton("יְהֹוָֽה"), "יי");
  assert.equal(skeleton("לַֽיהוָ֖ה"), "ליי");
  assert.equal(skeleton("יְהוֹנָתָ֖ן"), "יהונתן");
  assert.equal(skeleton("מוֹשָׁבֶֽךָ׃"), "מושבך");
});

test("parseTahot keys rows by the Hebrew chapter and verse, in word order, without LXX rows; a Q(K) row keeps the ketiv", () => {
  const sam = parseTahot(TAHOT, "1Sa");
  const v18 = sam.get("20:18");
  assert.equal(v18.length, 9);
  assert.deepEqual(v18[0], { n: 1, type: "L", he: "וַ/יֹּֽאמֶר", gloss: "and/ he said", strongs: "H9001/{H0559}", morph: "Hc/Vqw3ms", ketiv: null });
  assert.equal(v18[8].he, "מוֹשָׁבֶֽ/ךָ");
  assert.equal(v18[8].strongs, "{H4186}/H9021");
  const q = sam.get("20:38")[0];
  assert.equal(q.type, "Q(K)");
  assert.equal(q.he, "הַ֣/חִצִּ֔ים");
  assert.equal(q.n, 13);
  assert.equal(q.ketiv, "הַ/חֵצִי", "the ketiv, not the qere");
  assert.equal(sam.get("13:1"), undefined, "an X row is not Masoretic text");
  const isa = parseTahot(TAHOT, "Isa");
  assert.deepEqual(isa.get("63:19").map(r => r.n), [1, 10, 11], "English 64:1 is Hebrew 63:19, after its first half");
  assert.equal(isa.get("64:1"), undefined);
  assert.equal(parseTahot(TAHOT, "Gen").size, 0);
});

// Four more real TAHOT rows (CC BY 4.0, as above): a Q(K) ketiv with punctuation, a ketiv-only row and
// the word before it, and a Q(k) row whose ketiv sits in the spelling variants.
const TAHOT_KETIV = [
  "Gen.9.21#07=Q(K)\tאָהֳלֽ/וֹ\\׃\t'o.ho.L/o\ttent/ his\t{H0168G}/H9023\\H9016\tHNcmsc/Sp3ms\tK= 'o.ho.Lo/h (אָהֳלֹ/ה\\׃) \"tent/ his\" (H0168G/H9023\\H9016=HNcbsc/Sp3ms)\tL= אָהֳלֹֽ/ה\\׃ ¦ ;\tH0168G\t\t\t{H0168G=אֹ֫הֶל=: tent»tent:1_tent}/H9023=Ps3m=his\\H9016=׃=verseEnd",
  "Jdg.16.25#01=L\tוַֽ/יְהִי֙\tva/y.Hi\tand/ it was\tH9001/{H1961}\tHc/Vqw3ms\t\t\tH1961\t\t\tH9001=ו=&/{H1961=הָיָה=to be}",
  "Jdg.16.25#02=Q(K)\t\t[ ]\t[ ]\t\t\tK= ki (כִּי) \"for\" (H3588A=HR)\tL= כְּי ¦ ;\t\tH3588A\t\t",
  "Isa.10.6#12=Q(k)\tוּ/לְ/שׂוּמ֥/וֹ\tu./le./si.mo/v\tand/ to/ make/ it\tH9002/H9005/{H7760A}/H9033\tHC/R/Vqcc/Sp3ms\t\tL= וּ/לְ/שׂיּמ֥/וֹ ¦ ;K= וּ/לְ/שִׂימ/וֹ\tH7760A\t\t\tH9002=ו=and/H9005=ל=to/{H7760A=שׂוּם=: make»to set:1_make;_establish}/H9033=Os3m=him",
].join("\n");

test("parseTahot: a Q(k) ketiv from the spelling variants, the ketiv without punctuation, a ketiv-only row skipped", () => {
  assert.equal(parseTahot(TAHOT_KETIV, "Isa").get("10:6")[0].ketiv, "וּ/לְ/שִׂימ/וֹ");
  assert.equal(parseTahot(TAHOT_KETIV, "Gen").get("9:21")[0].ketiv, "אָהֳלֹ/ה");
  assert.deepEqual(parseTahot(TAHOT_KETIV, "Jdg").get("16:25").map(r => r.n), [1], "a row with no Hebrew is not a word on the page");
});

test("parseTbesh keys entries by dStrong with its letter", () => {
  const lex = parseTbesh(TBESH);
  assert.deepEqual(lex.get("H1254A"), { he: "בָּרָא", gloss: "to create", morph: "H:V" });
  assert.deepEqual(lex.get("H6485K"), { he: "פָּקַד", gloss: "to reckon: missing", morph: "H:V" });
  assert.deepEqual(lex.get("H9021"), { he: "ךָ", gloss: "your", morph: "Ps2m" });
  assert.equal(lex.get("H0559").gloss, "to say");
  assert.equal(lex.get("eStrong#"), undefined);
});

test("parseOshb gives the same row shape, prefixes as STEP numbers, the qere in place of the ketiv", () => {
  const xml = `<osis><osisText><div type="book" osisID="1Sam"><chapter osisID="1Sam.20"><verse osisID="1Sam.20.38">
          <w lemma="c/7121" morph="HC/Vqw3ms" id="09hFJ">וַ/יִּקְרָ֤א</w>
          <w lemma="853" morph="HTo" id="09xTn">אֶת</w><seg type="x-maqqef">־</seg><w type="x-ketiv" lemma="d/2678" morph="HTd/Ncmsa" id="09XYy">ה/חצי</w><note type="variant"><catchWord>ה/חצי</catchWord><rdg type="x-qere"><w lemma="d/2678" n="0.1" morph="HTd/Ncmpa" id="09nbe">הַ֣/חִצִּ֔ים</w></rdg></note>
          <w lemma="113" n="0" morph="HNcmpc/Sp3ms" id="09edi">אֲדֹנָֽי/ו</w><seg type="x-sof-pasuq">׃</seg>
        </verse><verse osisID="1Sam.20.39"><w lemma="1254 a" morph="HVqp3ms">בָּרָ֣א</w></verse></chapter></div></osisText></osis>`;
  const m = parseOshb(xml, "1Sam");
  const v = m.get("20:38");
  assert.deepEqual(v.map(r => r.he), ["וַ/יִּקְרָ֤א", "אֶת", "הַ֣/חִצִּ֔ים", "אֲדֹנָֽי/ו"]);
  assert.deepEqual(v[0], { n: 1, type: "L", he: "וַ/יִּקְרָ֤א", gloss: "", strongs: "H9002/{H7121}", morph: "HC/Vqw3ms", ketiv: null });
  assert.equal(v[2].ketiv, "ה/חצי");
  assert.equal(v[2].strongs, "H9009/{H2678}");
  assert.equal(v[3].strongs, "{H0113}/H9023");
  assert.equal(m.get("20:39")[0].strongs, "{H1254A}");
  assert.equal(parseOshb(xml, "Isa").size, 0);
});

test("parseOshb: a ketiv of two words joined by a ketiv maqqef gives way to its qere, one word or two (real 1 Samuel markup)", () => {
  // OSHB morphhb (CC BY 4.0) 1 Samuel 20:2 (two ketiv words, two qere words) and 24:9 (two ketiv words, one qere word), trimmed.
  const xml = `<verse osisID="1Sam.20.2"><w lemma="2009" n="1.1.1.1" morph="HTm" id="091nK">הִנֵּ֡ה</w>
          <w type="x-ketiv" lemma="l" morph="HR/Sp3ms" id="09UFD">ל/ו</w><seg type="x-maqqef" subType="x-ketiv">־</seg><w type="x-ketiv" lemma="6213 a" morph="HVqp3ms" id="09atM">עשה</w><note type="variant"><catchWord>ל/ו־עשה</catchWord><rdg type="x-qere"><w lemma="3808" morph="HTn" id="09uGu">לֹֽא</w><seg type="x-maqqef">־</seg><w lemma="6213 a" morph="HVqi3ms" id="09dRu">יַעֲשֶׂ֨ה</w></rdg></note>
          <w lemma="1" n="1.1.1.0" morph="HNcmsc/Sp1cs" id="09QWF">אָבִ֜/י</w></verse>
<verse osisID="1Sam.24.9"><w lemma="c/3318" n="1.1.0" morph="HC/Vqw3ms" id="09wRN">וַ/יֵּצֵא֙</w>
          <w type="x-ketiv" lemma="4480 a" morph="HR" id="0984p">מן</w><seg type="x-maqqef" subType="x-ketiv">־</seg><w type="x-ketiv" lemma="d/4631" morph="HTd/Ncfsa" id="09Mw5">ה/מערה</w><note type="variant"><catchWord>מן־ה/מערה</catchWord><rdg type="x-qere"><w lemma="m/d/4631" n="1.1" morph="HR/Td/Ncfsa" id="098Qr">מֵֽ/הַ/מְּעָרָ֔ה</w></rdg></note>
          <w lemma="c/7121" morph="HC/Vqw3ms" id="09mR9">וַ/יִּקְרָ֧א</w></verse>`;
  const m = parseOshb(xml, "1Sam");
  assert.deepEqual(m.get("20:2").map(r => [r.he, r.ketiv]), [["הִנֵּ֡ה", null], ["לֹֽא", "ל/ו"], ["יַעֲשֶׂ֨ה", "עשה"], ["אָבִ֜/י", null]]);
  assert.deepEqual(m.get("24:9").map(r => [r.he, r.ketiv]), [["וַ/יֵּצֵא֙", null], ["מֵֽ/הַ/מְּעָרָ֔ה", "מן־ה/מערה"], ["וַ/יִּקְרָ֧א", null]]);
});

test("decodeMorph: verbs, nouns, prefixes, suffixes, particles; unknown letters never throw", () => {
  assert.deepEqual(decodeMorph("Hc/Vqw3ms"), [{ k: "c" }, { k: "V", stem: "q", form: "w", p: 3, g: "m", n: "s" }]);
  assert.deepEqual(decodeMorph("HRd/Sp3ms"), [{ k: "R", def: true }, { k: "S", kind: "p", p: 3, g: "m", n: "s" }]);
  assert.deepEqual(decodeMorph("HNpm"), [{ k: "N", kind: "p", pk: "m" }]);
  assert.deepEqual(decodeMorph("HNcmsa"), [{ k: "N", kind: "c", g: "m", n: "s", st: "a" }]);
  assert.deepEqual(decodeMorph("HNcmsc/Sp2ms"), [{ k: "N", kind: "c", g: "m", n: "s", st: "c" }, { k: "S", kind: "p", p: 2, g: "m", n: "s" }]);
  assert.deepEqual(decodeMorph("HTd/Ncmpa"), [{ k: "T", kind: "d" }, { k: "N", kind: "c", g: "m", n: "p", st: "a" }]);
  assert.deepEqual(decodeMorph("HC/Vhv2fs"), [{ k: "C" }, { k: "V", stem: "h", form: "v", p: 2, g: "f", n: "s" }]);
  assert.deepEqual(decodeMorph("HVqrmsc/Sp3mp"), [{ k: "V", stem: "q", form: "r", g: "m", n: "s", st: "c" }, { k: "S", kind: "p", p: 3, g: "m", n: "p" }]);
  assert.deepEqual(decodeMorph("HVqcc"), [{ k: "V", stem: "q", form: "c" }]);
  assert.deepEqual(decodeMorph("HVqaa"), [{ k: "V", stem: "q", form: "a" }]);
  assert.deepEqual(decodeMorph("HVqc1cs"), [{ k: "V", stem: "q", form: "h", p: 1, g: "c", n: "s" }], "TAHOT's cohortative: c with a person");
  assert.deepEqual(decodeMorph("HVqc1cp"), [{ k: "V", stem: "q", form: "h", p: 1, g: "c", n: "p" }]);
  assert.deepEqual(decodeMorph("HC/Vqu1cs"), [{ k: "C" }, { k: "V", stem: "q", form: "u", p: 1, g: "c", n: "s" }]);
  assert.deepEqual(decodeMorph("HAomsa"), [{ k: "A", kind: "o", g: "m", n: "s", st: "a" }]);
  assert.deepEqual(decodeMorph("HPp1bs"), [{ k: "P", kind: "p", p: 1, g: "b", n: "s" }]);
  assert.deepEqual(decodeMorph("HTn"), [{ k: "T", kind: "n" }]);
  assert.deepEqual(decodeMorph("HD"), [{ k: "D" }]);
  assert.deepEqual(decodeMorph("HR/Sd"), [{ k: "R" }, { k: "S", kind: "d" }]);
  assert.deepEqual(decodeMorph("ANcmsa"), [{ k: "N", kind: "c", g: "m", n: "s", st: "a" }], "Aramaic codes decode the same");
  assert.deepEqual(decodeMorph("HZz9"), [{ k: "Z", raw: "Zz9" }]);
  assert.deepEqual(decodeMorph(""), []);
  assert.equal(STEMS.q, "Qal"); assert.equal(STEMS.N, "Niphal"); assert.equal(STEMS.h, "Hiphil"); assert.equal(STEMS.t, "Hithpael");
  assert.deepEqual(FORMS.w, ["narrative past (wayyiqtol)", "the usual past tense of a story"]);
  assert.deepEqual(FORMS.u, ["conjunctive imperfect (weyiqtol)", "so that …, may …"]);
});

test("segmentsOf zips the morph parts with the Hebrew pieces, glosses and dStrongs; rootOf names the root", () => {
  const rows = parseTahot(TAHOT, "1Sa").get("20:18");
  assert.deepEqual(segmentsOf(rows[0]), [
    { k: "c", t: "וַ", gl: "and", lem: "H9001" },
    { k: "V", stem: "q", form: "w", p: 3, g: "m", n: "s", t: "יֹּֽאמֶר", gl: "he said", lem: "H0559", root: true },
  ]);
  assert.equal(rootOf(rows[0]), "H0559");
  assert.deepEqual(segmentsOf(rows[8]), [
    { k: "N", kind: "c", g: "m", n: "s", st: "c", t: "מוֹשָׁבֶֽ", gl: "seat", lem: "H4186", root: true },
    { k: "S", kind: "p", p: 2, g: "m", n: "s", t: "ךָ", gl: "your", lem: "H9021" },
  ]);
  assert.equal(rootOf(rows[8]), "H4186");
  assert.deepEqual(segmentsOf(rows[1]), [{ k: "R", def: true, t: "ל֥", gl: "to <the>", lem: "H9005" }, { k: "S", kind: "p", p: 3, g: "m", n: "s", t: "וֹ", gl: "him", lem: "H9033", root: true }]);
  // A row whose pieces do not line up keeps the Hebrew pieces and leaves the rest off.
  assert.deepEqual(segmentsOf({ he: "א/ב/ג", gloss: "x", strongs: "{H0001}", morph: "HTd" }), [{ k: "T", kind: "d", t: "א", gl: "x", lem: "H0001", root: true }, { t: "ב" }, { t: "ג" }]);
});

test("alignVerse pairs words by skeleton and lists the page words it cannot place", () => {
  const rows = parseTahot(TAHOT, "1Sa").get("20:18");
  const page = ["וַיֹּאמֶר", "ל֥וֹ", "יְהוֹנָתָ֖ן", "מָחָ֣ר", "חֹ֑דֶשׁ", "וְנִפְקַ֕דְתָּ", "כִּ֥י", "יִפָּקֵ֖ד", "מוֹשָׁבֶֽךָ"];
  assert.deepEqual(alignVerse(page, rows), { pairs: page.map((_, i) => [i, i]), missing: [] });
  const variant = [...page]; variant[3] = "מָחֳרָת";   // a spelling Leningrad lacks
  const a = alignVerse(variant, rows);
  assert.deepEqual(a.missing, [3]);
  assert.equal(a.pairs.length, 8);
  assert.deepEqual(alignVerse(["יְהֹוָֽה"], [{ he: "יְהוָ֖ה", morph: "HNpt" }]).pairs, [[0, 0]]);
  assert.deepEqual(alignVerse([], rows), { pairs: [], missing: [] });
  assert.deepEqual(alignVerse(page, []), { pairs: [], missing: page.map((_, i) => i) });
});

test("cacheDir: HAFTARAH_CACHE, else ~/.haftarah-cache", () => {
  assert.equal(cacheDir({ HAFTARAH_CACHE: "/c/cache" }, "/h"), "/c/cache");
  assert.equal(cacheDir({}, "/h").replace(/\\/g, "/"), "/h/.haftarah-cache");
});

test("STEP_FILES and oshbFile name the files and their sources", () => {
  assert.equal(STEP_FILES["Jos-Est"].file, "step/TAHOT-Jos-Est.txt");
  assert.match(STEP_FILES["Jos-Est"].url, /^https:\/\/raw\.githubusercontent\.com\/STEPBible\/STEPBible-Data\/master\/Translators%20Amalgamated%20OT%2BNT\/TAHOT%20Jos-Est%20-%20Translators%20Amalgamated%20Hebrew%20OT%20-%20STEPBible\.org%20CC%20BY\.txt$/);
  assert.equal(STEP_FILES.TBESH.file, "step/TBESH.txt");
  assert.match(STEP_FILES.TBESH.url, /Lexicons\/TBESH%20-%20Translators%20Brief%20lexicon%20of%20Extended%20Strongs%20for%20Hebrew%20-%20STEPBible\.org%20CC%20BY\.txt$/);
  assert.deepEqual(oshbFile("1Sam"), { file: "oshb/1Sam.xml", url: "https://raw.githubusercontent.com/openscriptures/morphhb/master/wlc/1Sam.xml" });
});

test("ensureFiles downloads only what the cache lacks, writes whole files, and names a failed download", async () => {
  const dir = await mkdtemp(join(tmpdir(), "words-cache-"));
  try {
    await mkdir(join(dir, "step"));
    await writeFile(join(dir, "step", "TBESH.txt"), "cached");
    const calls = [];
    const fetchImpl = async url => { calls.push(url); return new Response(url.includes("Jos-Est") ? "fresh rows" : "nope", { status: url.includes("Jos-Est") ? 200 : 503 }); };
    const lines = [];
    const got = await ensureFiles(["step/TBESH.txt", "step/TAHOT-Jos-Est.txt"], { dir, fetchImpl, log: l => lines.push(l) });
    assert.deepEqual(got.map(p => p.replace(/\\/g, "/").split("/").slice(-2).join("/")), ["step/TBESH.txt", "step/TAHOT-Jos-Est.txt"]);
    assert.equal(calls.length, 1);
    assert.equal(await readFile(join(dir, "step", "TAHOT-Jos-Est.txt"), "utf8"), "fresh rows");
    assert.match(lines.join("\n"), /downloading step\/TAHOT-Jos-Est\.txt/);
    await assert.rejects(ensureFiles(["oshb/Isa.xml"], { dir, fetchImpl, log: () => {} }), /oshb\/Isa\.xml: HTTP 503/);
    await assert.rejects(readFile(join(dir, "oshb", "Isa.xml")), "a failed download leaves no file");
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("frequencyTable counts rows per dictionary word across the files, without LXX rows", () => {
  const f = frequencyTable([TAHOT]);
  assert.equal(f.H6485K, 2);
  assert.equal(f.H0559, 1);
  assert.equal(f.H9033, 1, "a suffix that is the braced root counts too");
  assert.equal(f.H7970, undefined, "an X row does not count");
  assert.equal(f.H9001, undefined, "a prefix that is not the root does not count");
});

test("wordsFor: every page word of week-min's first verse aligned, segments and lemmas filled, the credit set", () => {
  const sheet = fixture("week-min");
  sheet.verses = sheet.verses.slice(0, 1);   // the eleven-row sample holds 20:18 only
  const rows = parseTahot(TAHOT, "1Sa");
  const lexicon = parseTbesh(TBESH);
  const { words, report } = wordsFor(sheet, { source: "tahot", rows: { haftarah: rows }, lexicon, frequency: { H0559: 5308, H6485K: 7 } });
  assert.equal(words.schema, 1);
  assert.equal(words.source, "tahot");
  assert.match(words.credit, /STEPBible TAHOT and TBESH.*CC BY 4\.0/);
  const v18 = words.readings.haftarah.verses["20:18"];
  assert.equal(v18.length, 9);
  assert.deepEqual(v18[0], { i: 0, seg: [{ k: "c", t: "וַ", gl: "and", lem: "H9001" }, { k: "V", stem: "q", form: "w", p: 3, g: "m", n: "s", t: "יֹּֽאמֶר", gl: "he said", lem: "H0559", root: true }], lem: "H0559", morph: "Hc/Vqw3ms", ketiv: null });
  assert.deepEqual(words.lemmas.H0559, { he: "אָמַר", gloss: "to say", all: 5308 });
  assert.deepEqual(words.lemmas.H4186, { he: "", gloss: "" }, "a lemma TBESH lacks still has an entry");
  assert.deepEqual(words.lemmas.H6485K, { he: "פָּקַד", gloss: "to reckon: missing", all: 7 });
  assert.equal(words.readings.haftarah.book, "I Samuel");
  assert.deepEqual(report.readings.haftarah.missing, []);
  assert.equal(report.readings.haftarah.words, 9);
});

test("wordsFor refuses a verse with words and no rows, and lists an unaligned word", () => {
  const sheet = fixture("week-min");
  sheet.verses = sheet.verses.slice(0, 1);
  const rows = parseTahot(TAHOT, "1Sa");
  assert.throws(() => wordsFor(sheet, { source: "tahot", rows: { haftarah: new Map() }, lexicon: new Map(), frequency: {} }), /I Samuel 20:18 has no rows in tahot/);
  const one = structuredClone(sheet);
  one.verses[0].he = one.verses[0].he.replace("מָחָ֣ר", "מָחֳרָ֣ת");
  const { words, report } = wordsFor(one, { source: "tahot", rows: { haftarah: rows }, lexicon: new Map(), frequency: {} });
  assert.deepEqual(report.readings.haftarah.missing, ["20:18/3 מָחֳרָ֣ת"]);
  assert.deepEqual(words.readings.haftarah.missing, ["20:18/3"]);
  assert.deepEqual(words.readings.haftarah.verses["20:18"].map(w => w.i), [0, 1, 2, 4, 5, 6, 7, 8]);
});

test("wordsFor covers both readings of a two-reading week and marks a ketiv", async () => {
  const { makeWeekTorah } = await import("./helpers/makeWeekTorah.mjs");
  const two = makeWeekTorah(fixture("week-min"));
  two.readings[1].verses = two.readings[1].verses.slice(0, 1);
  two.readings[0].verses = two.readings[0].verses.slice(0, 1);   // Genesis 6:9 in the fixture carries 20:18's words
  const sam = parseTahot(TAHOT, "1Sa");
  const gen = new Map([["6:9", sam.get("20:18")]]);
  const { words } = wordsFor(two, { source: "tahot", rows: { torah: gen, haftarah: sam }, lexicon: new Map(), frequency: {} });
  assert.deepEqual(Object.keys(words.readings), ["torah", "haftarah"]);
  assert.equal(words.readings.torah.verses["6:9"].length, 9);
  const q = { ...sam.get("20:38")[0] };
  const k = wordsFor({ ...fixture("week-min"), glosses: [], commentary: [], verses: [{ chapter: 20, verse: 38, ref: "I Samuel 20:38", he: '<span class="mam-kq"><span class="mam-kq-q">[הַ֣חִצִּ֔ים]</span> <span class="mam-kq-k">(החצי)</span></span>', en: "", notes: [] }] }, { source: "tahot", rows: { haftarah: new Map([["20:38", [q]]]) }, lexicon: new Map(), frequency: {} });
  assert.equal(k.words.readings.haftarah.verses["20:38"][0].ketiv, "הַ/חֵצִי", "the row's ketiv, as parseTahot reads it");
});

test("buildWords writes words.json from the cache and reports; --source oshb reads the OSHB file", async () => {
  const cache = await mkdtemp(join(tmpdir(), "words-cache-"));
  const week = await mkdtemp(join(tmpdir(), "words-week-"));
  try {
    await mkdir(join(cache, "step")); await mkdir(join(cache, "oshb"));
    await writeFile(join(cache, "step", "TAHOT-Jos-Est.txt"), TAHOT);
    await writeFile(join(cache, "step", "TBESH.txt"), TBESH);
    const sheet = fixture("week-min"); sheet.verses = sheet.verses.slice(0, 1);
    await writeFile(join(week, "sheet.json"), JSON.stringify(sheet));
    const lines = [];
    const r = await buildWords(week, { cache, fetchImpl: () => { throw new Error("no network"); }, log: l => lines.push(l), frequency: { H0559: 5308 } });
    const words = JSON.parse(await readFile(join(week, "words.json"), "utf8"));
    assert.equal(words.readings.haftarah.verses["20:18"].length, 9);
    assert.equal(words.lemmas.H0559.all, 5308);
    assert.match(lines.join("\n"), /words    haftarah  9 words, 9 with analysis, 0 missing/);
    assert.equal(r.report.readings.haftarah.aligned, 9);
    await writeFile(join(cache, "oshb", "1Sam.xml"), `<verse osisID="1Sam.20.18"><w lemma="c/559" morph="HC/Vqw3ms">וַ/יֹּֽאמֶר</w><w lemma="l" morph="HR/Sp3ms">ל֥/וֹ</w><w lemma="3083" morph="HNp">יְהוֹנָתָ֖ן</w><w lemma="4279" morph="HNcmsa">מָחָ֣ר</w><w lemma="2320" morph="HNcmsa">חֹ֑דֶשׁ</w><w lemma="c/6485" morph="HC/VNq2ms">וְ/נִפְקַ֕דְתָּ</w><w lemma="3588 a" morph="HC">כִּ֥י</w><w lemma="6485" morph="HVNi3ms">יִפָּקֵ֖ד</w><w lemma="4186" morph="HNcmsc/Sp2ms">מוֹשָׁבֶֽ/ךָ</w></verse>`);
    const o = await buildWords(week, { cache, source: "oshb", fetchImpl: () => { throw new Error("no network"); }, log: () => {}, frequency: {} });
    const ow = JSON.parse(await readFile(join(week, "words.json"), "utf8"));
    assert.equal(ow.source, "oshb");
    assert.match(ow.credit, /Open Scriptures Hebrew Bible/);
    assert.equal(ow.readings.haftarah.verses["20:18"][0].lem, "H0559");
    assert.equal(ow.readings.haftarah.verses["20:18"][0].seg[1].gl, undefined, "OSHB has no glosses");
    assert.equal(o.report.readings.haftarah.aligned, 9);
  } finally { await rm(cache, { recursive: true, force: true }); await rm(week, { recursive: true, force: true }); }
});

test("the committed fixture words.json is what words.mjs makes of week-notes from the real cache (skipped without the cache)", async () => {
  const cache = cacheDir(process.env);
  let have = true;
  try { await readFile(join(cache, "step", "TAHOT-Jos-Est.txt")); await readFile(join(cache, "step", "TBESH.txt")); } catch { have = false; }
  if (!have) { console.log("skip: no STEP cache (node scripts/words.mjs --download)"); return; }
  const week = await mkdtemp(join(tmpdir(), "words-week-"));
  try {
    await writeFile(join(week, "sheet.json"), JSON.stringify(fixture("week-notes")));
    await buildWords(week, { cache, log: () => {} });
    const fresh = JSON.parse(await readFile(join(week, "words.json"), "utf8"));
    const committed = JSON.parse(readFileSync(new URL("./fixtures/week-notes/words.json", import.meta.url), "utf8"));
    assert.deepEqual(fresh, committed);
    assert.deepEqual(committed.readings.haftarah.missing, []);
  } finally { await rm(week, { recursive: true, force: true }); }
});

test("data/words/frequency.json is a count per dictionary word, with the words the fixtures use", () => {
  const f = JSON.parse(readFileSync(new URL("../data/words/frequency.json", import.meta.url), "utf8"));
  assert.ok(Object.keys(f).length > 10000);
  for (const [k, v] of Object.entries(f).slice(0, 50)) { assert.match(k, /^H\d{4}[A-Za-z]?$/); assert.ok(Number.isInteger(v) && v > 0); }
  assert.equal(f.H1254A, 53);
  assert.ok(f.H0559 > 5000);
});
