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
  d.commentary[1].works = ["McCarter 1980"];
  assert.ok(gate(d, null).some(x => /bibliography\/I Samuel\.md is missing/.test(x)));
});

test("gate names printable items that have no status at all", () => {
  const d = structuredClone(fixture);
  delete d.glossary[0].status;
  delete d.glosses[0].status;
  delete d.commentary[0].status;
  const p = gate(d, biblio);
  assert.ok(p.some(x => /glossary term has no status: Ezel/.test(x)), p.join("\n"));
  assert.ok(p.some(x => /gloss has no status: 18/.test(x)), p.join("\n"));
  assert.ok(p.some(x => /commentary entry has no status: 18 Rashi/.test(x)), p.join("\n"));
});

import { fillTemplate } from "../scripts/build.mjs";

test("fillTemplate leaves dollar patterns in the data alone", () => {
  const data = `{"t":"costs $5 and $' more $& $\`"}`;
  const out = fillTemplate("<s>{{DATA}}</s>{{NOTE}}", { DATA: data, NOTE: "n" });
  assert.equal(out, `<s>${data}</s>n`);
});
