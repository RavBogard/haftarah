import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const table = JSON.parse(await readFile(new URL("../data/chronology.json", import.meta.url), "utf8"));
const entries = Object.entries(table.entries);

test("every entry has a label, a known kind, start <= end, years BCE as negatives, and a boolean approx", () => {
  for (const [id, e] of entries) {
    assert.match(id, /^[a-z0-9-]+$/, id);
    assert.ok(e.label && typeof e.label === "string", id);
    assert.ok(["king", "empire", "prophet", "event"].includes(e.kind), `${id}: ${e.kind}`);
    assert.ok(Number.isInteger(e.start) && Number.isInteger(e.end) && e.start <= e.end && e.end < 0, id);
    assert.equal(typeof e.approx, "boolean", id);
    if (e.kind === "event") assert.equal(e.start, e.end, `${id}: an event is a point`);
    if (e.kind === "king") assert.ok(["united", "israel", "judah"].includes(e.realm), id);
  }
});

test("a reign or ministry that begins before 722 is approx; the anchors are exact", () => {
  for (const [id, e] of entries) if (e.kind !== "event" && e.kind !== "empire" && e.start < -722) assert.equal(e.approx, true, id);
  for (const id of ["qarqar", "jehu-tribute", "samaria-falls", "sennacherib", "jerusalem-falls", "cyrus"]) assert.equal(table.entries[id].approx, false, id);
});

test("the kings of each realm run in order with no gap over a year (co-regencies may overlap)", () => {
  for (const realm of ["united", "israel", "judah"]) {
    const kings = entries.filter(([, e]) => e.kind === "king" && e.realm === realm).map(([id, e]) => ({ id, ...e })).sort((a, b) => a.start - b.start);
    for (let i = 1; i < kings.length; i++) assert.ok(kings[i].start <= kings[i - 1].end + 1, `${kings[i - 1].id} → ${kings[i].id}`);
  }
  assert.equal(table.entries.hoshea.end, -722);
  assert.equal(table.entries.zedekiah.end, -586);
});
