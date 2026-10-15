import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { isolatedEnv } from "./helpers/isolatedEnv.mjs";
import { createRequire } from "node:module";
import { migrate, migrate3 } from "../scripts/migrate.mjs";
import { makeWeekTorah } from "./helpers/makeWeekTorah.mjs";
const L = createRequire(import.meta.url)("../template/lib.js");
const fixture = name => JSON.parse(readFileSync(new URL(`./fixtures/${name}/sheet.json`, import.meta.url), "utf8"));

test("readings: a schema-2 file is one haftarah reading over its own arrays", () => {
  const d = fixture("week-notes");
  const [r, ...rest] = L.readings(d);
  assert.equal(rest.length, 0);
  assert.equal(r.id, "haftarah");
  assert.equal(r.kind, "haftarah");
  assert.equal(r.ref, "I Samuel 20:18-42");
  assert.equal(r.book, "I Samuel");
  assert.equal(r.verses, d.verses);
  assert.equal(r.glosses, d.glosses);
  assert.equal(r.commentary, d.commentary);
  assert.equal(L.primaryReading(d).id, "haftarah");
  assert.deepEqual(L.readings(null), []);
  assert.deepEqual(L.readings({ schema: 3 }), []);
  assert.equal(L.primaryReading({ schema: 3, readings: [] }), null);
});

test("primaryReading prefers the haftarah over an earlier Torah reading", () => {
  assert.equal(L.primaryReading({ schema: 3, readings: [{ id: "torah", kind: "torah" }, { id: "haftarah", kind: "haftarah" }] }).id, "haftarah");
  assert.equal(L.primaryReading({ schema: 3, readings: [{ id: "torah", kind: "torah" }] }).id, "torah");
});

test("readingView of a schema-2 file is the file itself", () => {
  const d = fixture("week-min");
  assert.equal(L.readingView(d), d);
  assert.equal(L.readingView(d, "haftarah"), d);
});

test("migrate3: readings[0] holds the haftarah, verses name their book, entries get ids; the input is not changed", () => {
  for (const name of ["week-min", "week-notes"]) {
    const d = fixture(name), before = structuredClone(d);
    const m = migrate3(d);
    assert.deepEqual(d, before, "input unchanged");
    assert.equal(m.schema, 3);
    for (const k of ["haftarah", "verses", "glosses", "commentary"]) assert.ok(!(k in m), `${k} moved into the reading`);
    assert.equal(m.readings.length, 1);
    const r = m.readings[0];
    assert.equal(r.id, "haftarah");
    assert.equal(r.kind, "haftarah");
    assert.equal(r.ref, d.haftarah.ref);
    assert.ok(r.verses.every(v => v.book === d.haftarah.book));
    assert.ok(r.commentary.every(e => /^e-[0-9a-f]{8}(-\d+)?$/.test(e.id)));
    assert.equal(new Set(r.commentary.map(e => e.id)).size, r.commentary.length);
    assert.deepEqual(m.shabbat, d.shabbat);
    assert.deepEqual(m.openingNote, d.openingNote);
    assert.deepEqual(migrate3(m), m, "idempotent");
  }
});

test("readingView of a migrated file is the schema-2 file again; its glosses are the file's own", () => {
  for (const name of ["week-min", "week-notes"]) {
    const d = fixture(name), m = migrate3(d);
    assert.deepEqual(L.readingView(m), d);
    assert.deepEqual(L.readingView(m, "haftarah"), d);
    assert.equal(L.readingView(m).glosses, m.readings[0].glosses);
    assert.throws(() => L.readingView(m, "torah"), /no reading "torah" in this sheet/);
  }
});

test("sheetModel reads a migrated file exactly as the schema-2 file", () => {
  for (const name of ["week-min", "week-notes"]) {
    const d = fixture(name);
    assert.deepEqual(L.sheetModel(L.readingView(migrate3(d))), L.sheetModel(d));
  }
});

test("entryId is short and stable; assignEntryIds keeps given ids and splits collisions", () => {
  assert.equal(L.entryId({ verse: 1, source: "Rashi", sourceRef: "Rashi on Isaiah 54:1" }, "haftarah"), "e-3d5f2921");
  assert.equal(L.entryId({ chapter: 54, verse: 1, source: "Rashi", sourceRef: "Rashi on Isaiah 54:1" }, "haftarah"), "e-6e6678d8");
  const list = [
    { verse: 1, source: "Rashi", sourceRef: "Rashi on Isaiah 54:1" },
    { verse: 1, source: "Rashi", sourceRef: "Rashi on Isaiah 54:1" },
    { id: "e-kept", verse: 2 },
  ];
  assert.equal(L.assignEntryIds(list, "haftarah"), list);
  assert.deepEqual(list.map(e => e.id), ["e-3d5f2921", "e-3d5f2921-2", "e-kept"]);
});

test("parashahKey slugs a parashah name the way fetch slugs the week", () => {
  assert.equal(L.parashahKey("Noach"), "noach");
  assert.equal(L.parashahKey("Ha'azinu"), "haazinu");
  assert.equal(L.parashahKey("Lech-Lecha"), "lech-lecha");
  assert.equal(L.parashahKey("Achrei Mot-Kedoshim"), "achrei-mot-kedoshim");
  assert.equal(L.parashahKey(""), "");
  assert.equal(L.parashahKey(null), "");
});

test("schema 3 is opt-in: migrate still writes schema 2", () => {
  assert.equal(migrate(fixture("week-min")).schema, 2);
});

test("migrate.mjs --to 2 refuses a schema-3 file, names it, and writes nothing", async () => {
  const iso = await isolatedEnv();
  const dir = mkdtempSync(join(tmpdir(), "mig-"));
  try {
    const body = JSON.stringify(migrate3(fixture("week-notes")), null, 2);
    writeFileSync(join(dir, "sheet.json"), body);
    const r = spawnSync(process.execPath, [fileURLToPath(new URL("../scripts/migrate.mjs", import.meta.url)), dir], { env: iso.env, encoding: "utf8" });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /sheet\.json is schema 3/);
    assert.equal(readFileSync(join(dir, "sheet.json"), "utf8"), body);
  } finally { rmSync(dir, { recursive: true, force: true }); await iso.cleanup(); }
});

test("migrate3 warns on stderr when a schema-2 file has no haftarah.book, and still migrates", () => {
  const d = fixture("week-notes"); delete d.haftarah.book;
  const m = mock.method(console, "error", () => {});
  let out;
  try { out = migrate3(d); } finally { m.mock.restore(); }
  assert.equal(m.mock.calls.length, 1);
  assert.match(String(m.mock.calls[0].arguments[0]), /no haftarah\.book; verses get no book/);
  assert.ok(out.readings[0].verses.every(v => !("book" in v)));
});

test("readingView returns a file with no schema key as the same object, like readings()", () => {
  const d = { slug: "x", haftarah: { ref: "A 1:1", book: "A" }, verses: [] };
  assert.equal(L.readingView(d), d);
  assert.equal(L.readingView(d, "haftarah"), d);
  assert.equal(L.readingView({ schema: "garbage", verses: [] }).schema, "garbage");
});

test("readingModel: a haftarah's is sheetModel's; a Torah reading ends on sof pasuk and its legend says so", () => {
  const min = JSON.parse(readFileSync(new URL("./fixtures/week-min/sheet.json", import.meta.url), "utf8"));
  const wt = makeWeekTorah(min);
  const h = L.readingModel(wt, "haftarah");
  assert.deepEqual({ ...h, reading: undefined }, { ...L.sheetModel(L.readingView(wt, "haftarah")), reading: undefined });
  assert.deepEqual(h.reading, { id: "haftarah", kind: "haftarah", selection: null });
  assert.ok(h.verses.at(-1).heHtml.includes("tr-sof-haftarah"), "the haftarah still closes with its own cadence");
  const t = L.readingModel(wt, "torah");
  assert.equal(t.book, "Genesis");
  assert.ok(!t.verses.at(-1).heHtml.includes("tr-sof-haftarah") && t.verses.at(-1).heHtml.includes("tr-sof-pasuk"));
  assert.equal(t.verses.at(-1).final, false);
  assert.ok(!t.front.families.some(x => x.key === "sof-haftarah") && t.front.families.some(x => x.key === "sof-pasuk"));
  assert.deepEqual(t.reading, { id: "torah", kind: "torah", selection: "aliyah 1, its first verses" });
  assert.deepEqual(L.readingModel(min, "haftarah").verses, L.sheetModel(min).verses, "a schema-2 week is unchanged");
});

test("verseWords: the page's Hebrew words, DOM-free; the ketiv, keyed letters and a MAM footnote are not words", () => {
  const he = 'וַיֵּ֧שֶׁב הַמֶּ֛לֶךְ <span class="mam-kq"><span class="mam-kq-k">(על)</span> <span class="mam-kq-q">[אֶל־]</span></span>הַלֶּ֖חֶם<sup class="fn he">a</sup> לֶאֱכֽוֹל׃';
  assert.deepEqual(L.verseWords(he).map(w => w.text), ["וַיֵּ֧שֶׁב", "הַמֶּ֛לֶךְ", "אֶל", "הַלֶּ֖חֶם", "לֶאֱכֽוֹל"]);
  const note = 'נִבְקְעוּ֙ כׇּֽל־מַעְיְנֹת֙<sup class="footnote-marker">*</sup><i class="footnote">(בספרי ספרד ואשכנז מַעְיְנוֹת֙)</i> תְּה֣וֹם';
  assert.deepEqual(L.verseWords(note).map(w => w.text), ["נִבְקְעוּ֙", "כׇּֽל", "מַעְיְנֹת֙", "תְּה֣וֹם"]);
  const trope = '<span class="tr tr-a">כְּפַ֣עַם&thinsp;<b>׀</b> בְּפַ֗עַם</span> <span class="pisqa"></span> אֶל־מוֹשַׁב֙';
  assert.deepEqual(L.verseWords(trope).map(w => w.text), ["כְּפַ֣עַם", "בְּפַ֗עַם", "אֶל", "מוֹשַׁב֙"]);
  assert.deepEqual(L.verseWords(""), []);
  assert.deepEqual(L.verseWords(null), []);
  // A footnote holding its own <i> is removed whole, and a ketiv span with another class is still not a word.
  const nested = 'אֹ֖רֶן<sup class="footnote-marker">*</sup><i class="footnote">(<i>כתיב</i> אֹרֶן נוּן זְעִירָא)</i> נָטַ֑ע';
  assert.deepEqual(L.verseWords(nested).map(w => w.text), ["אֹ֖רֶן", "נָטַ֑ע"]);
  assert.deepEqual(L.verseWords('<span class="x mam-kq-k">(על)</span> <span class="mam-kq-q">[אֶל]</span>').map(w => w.text), ["אֶל"]);
  // The model's verses count the same whether or not trope spans and gloss keys were added.
  const d = fixture("week-notes");
  const m = L.sheetModel(d);
  for (const [i, v] of m.verses.entries()) assert.equal(L.verseWords(v.heHtml).length, L.verseWords(d.verses[i].he.replace(/&thinsp;| | /g, " ")).length, v.ref);
});
