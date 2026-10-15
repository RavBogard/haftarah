import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { migrate, migrate3 } from "../scripts/migrate.mjs";
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
