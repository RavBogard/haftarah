import { test } from "node:test";
import assert from "node:assert/strict";
import { MARKS_KEY, readMarks, writeMarks, toggleMark, orderMarks, marksLink, marksText, sharedText, MARKS_EMPTY } from "../site/app/marks.js";
import { key } from "../site/app/storage.js";

const mem = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), m }; };
const broken = () => ({ getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); }, removeItem() { throw new Error("blocked"); } });

test("marks live under the prefix, per week, as a versioned list", () => {
  const s = mem();
  assert.equal(writeMarks("2026-10-17-noach", ["haftarah-54-3", "haftarah-54-9"], s), true);
  assert.equal(s.m.get(key(MARKS_KEY("2026-10-17-noach"))), JSON.stringify({ v: 1, marks: ["haftarah-54-3", "haftarah-54-9"] }));
  assert.deepEqual(readMarks("2026-10-17-noach", s), ["haftarah-54-3", "haftarah-54-9"]);
  assert.deepEqual(readMarks("2026-10-24-lech-lecha", s), []);
  assert.equal(writeMarks("2026-10-17-noach", [], s), true);
  assert.equal(s.m.has(key(MARKS_KEY("2026-10-17-noach"))), false, "an empty list removes the key");
});

test("a throwing storage reads as no marks and reports unsaved", () => {
  assert.deepEqual(readMarks("2026-10-17-noach", broken()), []);
  assert.equal(writeMarks("2026-10-17-noach", ["haftarah-54-3"], broken()), false);
});

test("anything odd in storage reads as no marks", () => {
  const s = mem();
  for (const bad of ["x", "[]", '{"v":2,"marks":["a"]}', '{"v":1,"marks":"a"}', '{"v":1,"marks":[1,"haftarah-54-3"]}']) {
    s.setItem(key(MARKS_KEY("w")), bad);
    assert.deepEqual(readMarks("w", s), bad.includes('"haftarah-54-3"') ? ["haftarah-54-3"] : [], bad);
  }
});

test("toggleMark adds or removes; orderMarks follows the page and drops unknown anchors", () => {
  assert.deepEqual(toggleMark([], "a"), ["a"]);
  assert.deepEqual(toggleMark(["a", "b"], "a"), ["b"]);
  assert.deepEqual(orderMarks(["haftarah-54-9", "gone", "haftarah-54-3"], ["haftarah-54-1", "haftarah-54-3", "haftarah-54-9"]), ["haftarah-54-3", "haftarah-54-9"]);
});

test("the link carries the marks in the fragment; the text lists each verse then the translation and the link", () => {
  assert.equal(marksLink("https://haftarah.centralreform.org", "2026-10-17-noach", ["haftarah-54-3", "haftarah-54-9"]), "https://haftarah.centralreform.org/2026-10-17-noach#m=haftarah-54-3,haftarah-54-9");
  const t = marksText([{ ref: "Isaiah 54:3", en: "For you shall spread out." }, { ref: "Isaiah 54:9", en: "For this to Me is like the waters of Noah." }], { translation: "JPS 2023", link: "https://x/y#m=a,b" });
  assert.equal(t, "Isaiah 54:3  For you shall spread out.\n\nIsaiah 54:9  For this to Me is like the waters of Noah.\n\n— JPS 2023\nhttps://x/y#m=a,b");
  assert.equal(sharedText(1), "1 marked verse shared with you.");
  assert.equal(sharedText(3), "3 marked verses shared with you.");
  assert.match(MARKS_EMPTY, /^No marks yet\./);
});
