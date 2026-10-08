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

test("gate no longer asks about approval: proposed and status-less items pass", () => {
  const d = structuredClone(fixture);
  d.commentary[0].status = "proposed";
  d.glosses[0].status = "proposed";
  d.glossary[0].status = "proposed";
  d.openingNote.status = "proposed";
  d.nextWeek.status = "proposed";
  delete d.commentary[1].status;
  delete d.glossary[0].status;
  assert.deepEqual(gate(d, biblio), []);
});

test("gate ignores rejected items, even with a broken citation", () => {
  const d = structuredClone(fixture);
  d.commentary[0].status = "rejected";
  delete d.commentary[0].sourceRef;
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
  d.commentary[1].works = ["McCarter 1980"];
  assert.ok(gate(d, null).some(x => /bibliography\/I Samuel\.md is missing/.test(x)));
});

test("gate checks citations on entries with no status", () => {
  const d = structuredClone(fixture);
  delete d.commentary[0].status;
  delete d.commentary[0].sourceRef;
  assert.ok(gate(d, biblio).some(x => /no Sefaria ref.*18 Rashi/.test(x)));
});

import { fillTemplate } from "../scripts/build.mjs";

test("fillTemplate leaves dollar patterns in the data alone", () => {
  const data = `{"t":"costs $5 and $' more $& $\`"}`;
  const out = fillTemplate("<s>{{DATA}}</s>{{NOTE}}", { DATA: data, NOTE: "n" });
  assert.equal(out, `<s>${data}</s>n`);
});

import { cleanEnglish, incipitHe, incipitEn } from "../scripts/fetch.mjs";

test("cleanEnglish keeps a footnote whole when it has italics inside", () => {
  const html = 'I will lay carbuncles<sup class="footnote-marker">f</sup><i class="footnote"><b>carbuncles </b>Taking <i>pukh</i> as a byform of <i>nophekh</i>; so already Rashi.</i> as your building stones';
  const r = cleanEnglish(html);
  assert.equal(r.en, 'I will lay carbuncles<sup class="fn">f</sup> as your building stones');
  assert.deepEqual(r.notes, [{ marker: "f", lemma: "carbuncles", text: "Taking <i>pukh</i> as a byform of <i>nophekh</i>; so already Rashi." }]);
});

test("cleanEnglish still reads a plain footnote", () => {
  const r = cleanEnglish('the new moon<sup class="footnote-marker">a</sup><i class="footnote">Lit. “month.”</i>, and');
  assert.equal(r.en, 'the new moon<sup class="fn">a</sup>, and');
  assert.equal(r.notes[0].text, "Lit. “month.”");
});

test("incipitHe stops at the first strong pause and before a function word", () => {
  // Isaiah 54:1: tipcha on the second word, then לֹא
  assert.equal(incipitHe("רׇנִּ֥י עֲקָרָ֖ה לֹ֣א יָלָ֑דָה"), "רׇנִּ֥י עֲקָרָ֖ה");
  assert.equal(incipitHe("רׇנִּ֥י עֲקָרָ֥ה לֹ֣א יָלָ֑דָה"), "רׇנִּ֥י עֲקָרָ֥ה");
  // Isaiah 40:1: zaqef on the second word
  assert.equal(incipitHe("נַחֲמ֥וּ נַחֲמ֖וּ עַמִּ֑י יֹאמַ֖ר אֱלֹהֵיכֶֽם׃"), "נַחֲמ֥וּ נַחֲמ֖וּ");
  // never more than four words
  assert.equal(incipitHe("א֥ ב֥ ג֥ ד֥ ה֥ ו֥").split(" ").length, 4);
});

test("incipitEn takes the first poetry line, or a prose clause, without keys", () => {
  assert.equal(incipitEn('<span class="poetry indentAll">Shout, O infertile one,</span><br><span class="poetry indentAll">You who bore no child!</span>'), "Shout, O infertile one");
  assert.equal(incipitEn('Jonathan said to him, “Tomorrow will be the new moon<sup class="fn">a</sup>; and you will be missed.”'), "Jonathan said to him");
  assert.equal(incipitEn("Comfort, oh comfort My people,<br>Says your God."), "Comfort, oh comfort My people");
});
