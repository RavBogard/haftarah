import { test } from "node:test";
import assert from "node:assert/strict";
import { BOOKS, skeleton, parseTahot, parseTbesh, parseOshb, decodeMorph, segmentsOf, rootOf, alignVerse, STEMS, FORMS } from "../scripts/words.mjs";

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
