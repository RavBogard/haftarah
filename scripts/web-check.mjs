#!/usr/bin/env node
/**
 * web-check.mjs — build the site, serve it with one week's data, open it in headless Chrome at a
 * desktop and a phone size, and assert what the pages report in their data-check-* attributes
 * (sheet.js and landing.js write them when the URL has ?check=1).
 *
 *   node scripts/web-check.mjs [weeks/<slug>]              # default: tests/fixtures/week-notes
 *   node scripts/web-check.mjs weeks/<slug> --serve        # just serve, for a look in a browser
 *   node scripts/web-check.mjs [weeks/<slug>] --out DIR    # build into DIR instead of site/dist (npm test does)
 */
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { join, resolve, basename, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildSite } from "./web-build.mjs";
import { indexEntry, cleanSheet, sideManifestFrom } from "./publish.mjs";
import { findBrowser } from "./build.mjs";
import { dumpDom } from "./chrome.mjs";
import { isSlug, slugFromPath, dataUrl, indexUrl } from "../site/app/contract.js";
import { isAliasPath, PARASHOT, keyOf } from "../site/app/parashot.js";
import { createRequire } from "node:module";
const L = createRequire(import.meta.url)("../template/lib.js");

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const MIME = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".json": "application/json", ".png": "image/png", ".ttf": "font/ttf", ".pdf": "application/pdf", ".txt": "text/plain" };

/** The Content-Security-Policy vercel.json sends with the pages, or null. */
export async function sitePolicy() {
  const v = JSON.parse(await readFile(join(ROOT, "vercel.json"), "utf8"));
  const h = (v.headers || []).flatMap(x => x.headers).find(x => x.key === "Content-Security-Policy");
  return h ? h.value : null;
}

export async function serveSite({ dist, week, port = 0, extra = {} }) {
  // The page only routes dated slugs; an undated folder (the fixture) is served under a made-up dated one.
  const name = basename(resolve(week));
  const slug = isSlug(name) ? name : `2026-01-01-${name}`;
  const sheet = { ...cleanSheet(JSON.parse(await readFile(join(week, "sheet.json"), "utf8"))), ...extra };
  const index = { schema: 2, updated: new Date().toISOString(), weeks: [indexEntry(sheet, slug, new Date().toISOString())] };
  const csp = await sitePolicy();   // pages are served under the real policy
  const server = createServer(async (req, res) => {
    const p = new URL(req.url, "http://x").pathname;
    const send = (code, type, body, headers = {}) => { res.writeHead(code, { "content-type": type, ...headers }); res.end(body); };
    if (p === indexUrl()) return send(200, MIME[".json"], JSON.stringify(index));
    if (p === dataUrl(slug, "sheet.json")) return send(200, MIME[".json"], JSON.stringify(sheet));
    if (p.startsWith("/data/")) {
      // Read first, write headers after: a missing file (the fixture has no sheet.pdf) must be a 404, not a crash.
      try { return send(200, MIME[extname(p)] || "application/octet-stream", await readFile(join(week, basename(p)))); } catch { return send(404, "text/plain", "Not found"); }
    }
    let file = slugFromPath(p) ? join(dist, "sheet.html") : isAliasPath(p) ? join(dist, "library.html") : join(dist, p === "/" ? "index.html" : p);
    const page = csp ? { "content-security-policy": csp } : {};
    try { send(200, MIME[extname(file)] || "application/octet-stream", await readFile(file), page); }
    catch { send(404, MIME[".html"], await readFile(join(dist, "404.html")).catch(() => "Not found"), page); }
  });
  await new Promise(r => server.listen(port, "127.0.0.1", r));
  return { server, slug, base: `http://127.0.0.1:${server.address().port}` };
}

// The values of --port and --out, and the week folder: the one argument that is neither a flag nor a flag's value.
export function parseArgs(args) {
  const valueAt = new Set();
  const opt = name => { const i = args.indexOf(name); if (i < 0) return null; valueAt.add(i + 1); return args[i + 1]; };
  const port = opt("--port"), out = opt("--out");
  const week = args.find((a, i) => !a.startsWith("--") && !valueAt.has(i)) || null;
  return { week, port: port == null ? null : Number(port), out, serve: args.includes("--serve") };
}

const attrs = dom => Object.fromEntries([...((dom.match(/<html[^>]*>/) || [""])[0]).matchAll(/\sdata-check-([a-z-]+)="([^"]*)"/g)].map(m => [m[1], m[2].replace(/&quot;/g, '"').replace(/&amp;/g, "&")]));

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const week = resolve(args.week || join(ROOT, "tests", "fixtures", "week-notes"));
  const port = args.port ?? (args.serve ? 8767 : 0);
  const { out: dist } = await buildSite(args.out ? { out: args.out } : {});
  // The primary reading in the schema-2 shape, whatever the week's schema. For the check (not for
  // --serve) a week without highlights gets one, so the page's highlight path is exercised.
  const raw = JSON.parse(await readFile(join(week, "sheet.json"), "utf8"));
  const sheet = L.readingView(raw);   // the primary reading (the haftarah), in the schema-2 shape
  // Every verse on the page in page order (a Torah selection first), each with its reading and book.
  const order = L.readings(raw).filter(r => (r.verses || []).length);
  const flat = order.flatMap(r => L.readingView(raw, r.id).verses.map(v => ({ ...v, reading: r.id, book: r.book })));
  // The page's Hebrew words, counted DOM-free from the same models the page builds (spec 4.3).
  const wordsExpected = order.reduce((n, r) => n + L.readingModel(raw, r.id).verses.reduce((m, v) => m + L.verseWords(v.heHtml).length, 0), 0);
  const hv = sheet.verses[Math.min(3, sheet.verses.length - 1)];
  const extra = raw.highlights || args.serve ? {} : { highlights: [{ reading: L.primaryReading(raw).id, chapter: hv.chapter, verse: hv.verse, words: [0, 1], note: "A highlight for the check." }] };
  // The side files the folder has (the fixture has all three; a bare copy none): the page sees the manifest publish would write.
  const side = await sideManifestFrom(week);
  if (side) extra.side = side;
  const { server, slug, base } = await serveSite({ dist, week, port, extra });
  if (args.serve) { console.log(`Serving ${slug}:\n  ${base}/\n  ${base}/${slug}\n  ${base}/${slug}?trope=1\nCtrl-C to stop.`); return; }
  const browser = findBrowser();
  if (!browser) { server.close(); console.error("No Chrome or Edge found (set HAFTARAH_BROWSER)."); process.exit(1); }
  const failures = [];
  const expect = (name, ok, got) => { console.log(`${ok ? "ok  " : "FAIL"}  ${name}${ok ? "" : `  (got ${JSON.stringify(got)})`}`); if (!ok) failures.push(name); };
  try {
    for (const [label, size, wide] of [["desktop 1440x900", "1440,900", true], ["phone 390x844", "390,844", false]]) {
      const a = attrs(await dumpDom(browser, `${base}/${slug}?check=1`, { size }));
      // Headless Chrome enforces a minimum window width, so say what was actually measured.
      console.log(`\n${label} (measured viewport ${a.width || "?"}px): /${slug}`);
      expect("page finished", a.done === "1", a.done);
      expect("no script errors", a.errors === "0", a.errors);
      expect("verse count", Number(a.verses) === flat.length, a.verses);
      expect("key series present", (a.keys || "").length > 0 && /^a,b/.test(a.keys), a.keys);
      expect("the page counts words as lib does", Number(a.words) === wordsExpected, `${a.words} (lib: ${wordsExpected})`);
      expect("wide layout detected", a.wide === String(wide), a.wide);
      if (wide) { expect("rail holds every verse", Number(a.rail) === flat.length, a.rail); expect("no inline details", Number(a.details) === 0, a.details); }
      else { expect("rail empty", Number(a.rail) === 0, a.rail); expect("inline details for verses with commentary", Number(a.details) > 0, a.details); }
      expect("rail holds the current verse", a["rail-current"] === (wide ? "true" : "n/a"), a["rail-current"]);
      if (wide) expect("rail scrolled to the current verse", Math.abs(Number(a["rail-offset"])) < 3, a["rail-offset"]);
      expect("empty verses show no summary", a["empty-summaries"] === "0", a["empty-summaries"]);
      const v = flat[Math.floor(flat.length * 2 / 3)];   // the row sheet.js runCheck scrolls to
      expect("masthead range after scrolling", (a.range || "").startsWith(`${v.book} ${v.chapter}:${v.verse}`), a.range);
      expect("current verse marked", a.current === v.ref, a.current);
      expect("dark paper", a.paper === "rgb(18, 17, 16)", a.paper);
      expect("title", /·/.test(a.title || ""), a.title);
      expect("rows carry the reading in their id", a.anchor === `${flat[0].reading}-${flat[0].chapter}-${flat[0].verse}`, a.anchor);
      if (extra.highlights) {
        expect("a teacher highlight marks one verse", a.highlights === "1", a.highlights);
        expect("a teacher highlight tints two words", a["hl-words"] === "2", a["hl-words"]);
        expect("a teacher highlight's note is in the apparatus", a["hl-notes"] === "1", a["hl-notes"]);
        expect("the verse number's name says Highlighted.", a["hl-name"] === "true", a["hl-name"]);
      }
      expect("one polite live region for copy status", a.live === "1", a.live);
      expect("Copy link, Copy verse and on Sefaria are 44px targets", Number(a["act-height"]) >= 44, a["act-height"]);
      expect("Show Hebrew hides the English", a["lang-he"] === "none", a["lang-he"]);
      expect("Show English hides the Hebrew", a["lang-en"] === "none", a["lang-en"]);
      expect("one tab stop per verse for the Hebrew words", Number(a["word-stops"]) === flat.length, a["word-stops"]);
      expect("the closed panel is inert", a["panel-inert"] === "true", a["panel-inert"]);
      expect("every source button names the panel", a["src-uncontrolled"] === "0", a["src-uncontrolled"]);
      expect("a note popover is named while open and gone after", a.pop === "ok", a.pop);
      expect("the settings card keeps Tab inside", a.trap === "ok", a.trap);
      expect("every control in the settings card is a 44px target", Number(a["settings-min"]) >= 44, a["settings-min"]);
      expect("the verse number has a 44px hit area", Number(a["verse-hit"]) >= 44, a["verse-hit"]);
      expect(order.length > 1 ? "a heading per reading" : "no reading heading on a one-reading week", a.heads === String(order.length > 1 ? order.length : 0), a.heads);
      expect("a PDF link per reading", Number(a.pdfs) === order.length, a.pdfs);
      expect(raw.prior ? "the Last time link goes to last year's sheet" : "no Last time link without a prior", (a.prior || "") === (raw.prior ? `/${raw.prior.slug}` : ""), a.prior);
      expect("the page saw the side manifest", a.side === JSON.stringify(side ? Object.keys(side).sort() : []), a.side);
      if (side && side.words) {
        expect("the word panel analyses the first word from words.json", a["word-analysed"] === "true", a["word-analysed"]);
        expect("the word panel leads with a plain-English sentence", /^(A|An|The) /.test(a["word-sentence"] || ""), a["word-sentence"]);
        expect("the word panel never shows a raw code by default", a["word-code"] === "true", a["word-code"]);
        expect("This word here lists the occurrences", Number(a["word-here"]) >= 1, a["word-here"]);
        expect("the whole-Tanakh count is shown", /in the Hebrew Bible/.test(a["word-freq"] || ""), a["word-freq"]);
        expect("STEPBible and Bible Hub links", Number(a["word-links"]) === 2, a["word-links"]);
        expect("an occurrence goes to its verse", a["word-go"] === "ok", a["word-go"]);
        expect("an occurrence closes the panel on a phone and keeps it on a desktop", a["word-go-panel"] === String(wide), a["word-go-panel"]);
        expect("every control in the word panel is a 44px target", Number(a["word-min"]) >= 44, a["word-min"]);
      } else expect("a week with no words.json falls back to the dictionary alone", a["word-analysed"] === "false" && a["word-sentence"] === "No word analysis for this word." && a["word-bdb-open"] === "true", `${a["word-analysed"]} / ${a["word-sentence"]} / bdb open ${a["word-bdb-open"]}`);
      if (side && side.translations) {
        expect("the Translation row offers what the week has", a["tr-offered"] === ["jps2023", ...new Set(Object.values(side.translations).flat().map(v => v.key))].join(","), a["tr-offered"]);
        expect("switching shows that edition's verse", /^A fixture rendering \(1985\) of verse \d+\.$/.test(a["tr-en"] || ""), a["tr-en"]);
        expect("the note says the notes are JPS's", a["tr-note"] === "true", a["tr-note"]);
        expect("the footer credits the edition shown", /Jewish Publication Society, 1985/.test(a["tr-credit"] || ""), a["tr-credit"]);
        expect("Copy verse would name the edition", a["tr-label"] === "JPS 1985", a["tr-label"]);
        expect("JPS 2023 comes back exactly", a["tr-restored"] === "true", a["tr-restored"]);
      } else expect("no Translation row without versions", a["tr-offered"] === "", a["tr-offered"]);
      if (side && side.links) {
        expect("a control on every verse for everything on this verse", Number(a["rel-buttons"]) === flat.length, a["rel-buttons"]);
        expect("the related panel has groups", Number(a["rel-groups"]) > 0, a["rel-groups"]);
        expect("the related panel says it is from Sefaria", a["rel-banner"] === "From Sefaria, not edited by CRC", a["rel-banner"]);
        expect("the related panel is visibly not the sheet", a["rel-alt"] === "true" && a["rel-alt-gone"] === "true", `${a["rel-alt"]} ${a["rel-alt-gone"]}`);
        expect("groups start collapsed", a["rel-closed"] === "true", a["rel-closed"]);
        expect("a work the sheet cites is marked", Number(a["rel-used"]) >= 1, a["rel-used"]);
        expect("Hebrew-only texts hide until asked for", a["rel-he-hidden"] === "true" && (a["rel-he-shown"] === undefined || a["rel-he-shown"] === "true"), `${a["rel-he-hidden"]} ${a["rel-he-shown"]}`);
        expect("Quoting Commentary comes last when present", a["rel-has-qc"] !== "true" || /^Quoting Commentary/.test(a["rel-last"] || ""), `${a["rel-has-qc"]} ${a["rel-last"]}`);
        expect("the panel kind is On this verse", a["rel-kind"] === "On this verse", a["rel-kind"]);
      } else expect("no related control without links.json", a["rel-buttons"] === "0", a["rel-buttons"]);
    }
    const lv = sheet.verses[Math.min(5, sheet.verses.length - 1)];
    const t = attrs(await dumpDom(browser, `${base}/${slug}?check=1#v${lv.chapter}-${lv.verse}`, { size: "1440,900" }));
    console.log(`\nan old verse link: /${slug}#v${lv.chapter}-${lv.verse}`);
    expect("old link: page finished without errors", t.done === "1" && t.errors === "0", `${t.done} ${t.errors}`);
    expect("old link marks its verse", t.target === `haftarah-${lv.chapter}-${lv.verse}`, t.target);
    expect("old link becomes the new address", t.hash === `#haftarah-${lv.chapter}-${lv.verse}`, t.hash);
    expect("a link to a verse not in the reading is ignored and clears the old mark", t["bogus-hash"] === "true", t["bogus-hash"]);
    const p = attrs(await dumpDom(browser, `${base}/${slug}?present&check=1`, { size: "1280,720" }));
    const [v1, v2] = flat;
    console.log(`\npresenter 1280x720: /${slug}?present`);
    expect("presenter: page finished without errors", p.done === "1" && p.errors === "0", `${p.done} ${p.errors}`);
    expect("presenter on", p.present === "1", p.present);
    expect("presenter starts at the first verse", p["present-label"] === L.enDash(v1.ref), p["present-label"]);
    expect("presenter counts the verses", p["present-count"] === `1 / ${flat.length}`, p["present-count"]);
    expect("the web fonts are in before the fit is measured", p["present-fonts"] === "loaded", p["present-fonts"]);
    expect("the verse fits the screen", p["present-fits"] === "true", p["present-fits"]);
    expect("PageDown steps to the next verse", p["present-next"] === L.enDash(v2.ref), p["present-next"]);
    expect("the address follows the verse", p["present-hash"] === `#${v2.reading}-${v2.chapter}-${v2.verse}`, p["present-hash"]);
    expect("B blanks the screen", p["present-blank"] === "true", p["present-blank"]);
    expect("Escape leaves the presenter", p["present-exit"] === "true", p["present-exit"]);
    expect("focus lands on the verse's number after Escape", p["present-focus"] === `${v2.reading}-${v2.chapter}-${v2.verse}`, p["present-focus"]);
    const l = attrs(await dumpDom(browser, `${base}/?check=1`, { size: "1440,900" }));
    console.log("\nlanding: /");
    expect("landing finished", l.done === "1", l.done);
    expect("landing errors", l.errors === "0", l.errors);
    expect("one week listed", l.weeks === "1", l.weeks);
    expect("hero is the week", l.hero === slug, l.hero);
    expect("four doors", l.doors === "4", l.doors);
    expect("the grid has a cell for every parashah", l.cells === "54", l.cells);
    expect("the week's parashah holds a sheet", l.held === "1", l.held);
    expect("a door shows its view and hides the others", l["door-switch"] === "ok", l["door-switch"]);
    // The library's short addresses: the fixture week is filed under its parashah and year.
    const key = L.parashahKey(raw.shabbat.parashah.en), cycle = String(raw.series.year);
    const book = (PARASHOT.find(x => x.key === key) || { book: "Genesis" }).book;
    console.log(`\nlibrary: /${key}, /${cycle}/${key}, /5790/${key}, /torah/${keyOf(book)}, /not-a-parashah`);
    const al = attrs(await dumpDom(browser, `${base}/${key}?check=1`, { size: "1440,900" }));
    expect("a parashah alias finds the week", al.resolved === slug && al.errors === "0", `${al.resolved} ${al.errors}`);
    const ay = attrs(await dumpDom(browser, `${base}/${cycle}/${key}?check=1`, { size: "1440,900" }));
    expect("a year alias finds the week", ay.resolved === slug, ay.resolved);
    const am = attrs(await dumpDom(browser, `${base}/5790/${key}?check=1`, { size: "1440,900" }));
    expect("an alias with no sheet says so", am.missing === key && am.errors === "0", `${am.missing} ${am.errors}`);
    const at = attrs(await dumpDom(browser, `${base}/torah/${keyOf(book)}?check=1`, { size: "1440,900" }));
    expect("a Torah book lists its weeks", at.listed === "1" && at.errors === "0", `${at.listed} ${at.errors}`);
    const unknown = await fetch(`${base}/not-a-parashah`);
    expect("an unknown alias is a 404", unknown.status === 404, unknown.status);
  } finally { server.close(); }
  if (failures.length) { console.error(`\n${failures.length} check${failures.length === 1 ? "" : "s"} failed.`); process.exit(1); }
  console.log("\nAll web checks passed.");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch(err => { console.error(`web-check: ${err.message}`); process.exit(1); });
}
