// api/_lib/tools.mjs — the fourteen tools: what each takes, what it returns, and how it uses the store and
// the scripts. Pure of process.env and process.argv: everything arrives in ctx. The reading and writing tools
// here; the building and delivering tools (Task 5 of the plan) are added to TOOLS in table order.
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readFile, readdir, rm, mkdir, mkdtemp } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { getJSON, leyningUrl, nextWeekFor, weekSlug, nextShabbat, fetchWeek, fetchTextsFor, withEntryIds } from "../../scripts/fetch.mjs";
import { writeDigest } from "../../scripts/digest.mjs";
import { weekBibliography, buildWeek, BuildRefused } from "../../scripts/build.mjs";
import { checkWeek } from "../../scripts/check.mjs";
import { deliver } from "../../scripts/deliver.mjs";
import { publish } from "../../scripts/publish.mjs";
import { draftUrl } from "./http.mjs";
import { imageResult, textResult } from "./mcp.mjs";
import { upsertEntries, validateEntries, verifyRefs, applyPatch, setStatuses } from "./entries.mjs";
import { leyningOf, aliyotLines, parseRange } from "../../scripts/leyning.mjs";
import { defaultHaftarahFor } from "../../scripts/rites.mjs";
import { lintSheet, entryCounts, loadVoices, loadBasemap } from "../../scripts/lint.mjs";
import { loadCustoms } from "../../scripts/customs.mjs";
import { parashahKeysOf } from "../../site/app/parashot.js";
import { pullWeek, pushWeek, readJson, writeJson, readStatus, writeStatus } from "./store.mjs";
import { sliceTexts } from "./texts.mjs";
import { SLUG, SLUG_SOURCE, PDF_FILES } from "../../site/app/contract.js";
const L = createRequire(import.meta.url)("../../template/lib.js");
export const ROOT = fileURLToPath(new URL("../../", import.meta.url));

export const SLUG_PATTERN = `^${SLUG_SOURCE}$`;
const slugProp = { type: "string", pattern: SLUG_PATTERN, description: "The week, e.g. 2026-10-17-noach" };
const readingProp = { type: "string", enum: ["haftarah", "torah"] };

/** A small JSON-Schema checker for the shapes the tools declare: type, required, enum, pattern, items, additionalProperties false. */
export function validateInput(schema, input, path = "") {
  const problems = [];
  const name = k => (path ? `${path}.${k}` : k);
  for (const k of schema.required || []) if (input[k] === undefined || input[k] === null) problems.push(`${name(k)} is required`);
  for (const [k, v] of Object.entries(input)) {
    const p = (schema.properties || {})[k];
    if (!p) { if (schema.additionalProperties === false) problems.push(`${name(k)} is not an input of this tool`); continue; }
    if (v === null || v === undefined) continue;
    problems.push(...checkValue(p, v, name(k)));
  }
  return problems;
}
function checkValue(p, v, where) {
  const t = p.type;
  if (t === "string" && typeof v !== "string") return [`${where} must be a string`];
  if (t === "integer" && !Number.isInteger(v)) return [`${where} must be an integer`];
  if (t === "number" && typeof v !== "number") return [`${where} must be a number`];
  if (t === "boolean" && typeof v !== "boolean") return [`${where} must be true or false`];
  if (t === "array") { if (!Array.isArray(v)) return [`${where} must be a list`]; return p.items ? v.flatMap((x, i) => checkValue(p.items, x, `${where}[${i}]`)) : []; }
  if (t === "object") { if (!v || typeof v !== "object" || Array.isArray(v)) return [`${where} must be an object`]; return validateInput(p, v, where); }
  if (p.enum && !p.enum.includes(v)) return [`${where} must be one of ${p.enum.join(", ")}`];
  if (p.pattern && typeof v === "string" && !new RegExp(p.pattern).test(v)) return [`${where} does not match ${p.pattern}`];
  if (p.maxLength && typeof v === "string" && v.length > p.maxLength) return [`${where} is longer than ${p.maxLength} characters`];
  return [];
}

/** The scripts the building and delivering tools run; tests pass fakes. */
export const SCRIPTS = { buildWeek, checkWeek, deliver, publish };
/** What every handler receives. `root` is the repo (template, bibliography, customs, data); `workDir` where weeks are
 * materialised; `launcher` an async () => { browser, pages() } (api/_lib/browser.mjs), null for none. */
export function toolCtx({ store, config, fetchImpl = globalThis.fetch, now = () => new Date(), log = () => {}, root = ROOT, workDir = null, browser = null, launcher = null, scripts = SCRIPTS }) {
  return { store, config, fetchImpl, now, log, root: root || ROOT, workDir: workDir || join(tmpdir(), "haftarah-weeks"), browser, launcher, scripts: { ...SCRIPTS, ...(scripts || {}) } };
}
export const defineTool = def => ({ annotations: {}, ...def, inputSchema: { additionalProperties: false, ...def.inputSchema } });

// ---- shared helpers ----
const get = ctx => url => getJSON(url, { fetchImpl: ctx.fetchImpl });
const customsOf = ctx => loadCustoms(ctx.config.customs);
// What each tool pulls from the store: only what its script reads, never every page image of every earlier build.
export const NEEDS = {
  texts: ["sheet.json", "candidates.json", "candidates-torah.json", "texts.json", "texts-torah.json", "prior.json"],
  build: ["sheet.json"],
  deliver: ["sheet.json", "candidates.json", "candidates-torah.json", "texts.json", "texts-torah.json", "prior.json", "digest.md", "briefing.md", PDF_FILES.haftarah, PDF_FILES.torah, "words.json", "translations.json", "links.json"],
};
/** A fresh folder of its own under workDir (two calls in one warm instance never share one), removed when fn ends. */
async function withRoot(ctx, fn) {
  await mkdir(ctx.workDir, { recursive: true });
  const root = await mkdtemp(join(ctx.workDir, "w-"));
  try { return await fn(root); } finally { await rm(root, { recursive: true, force: true }).catch(() => {}); }
}
/** fn(dir) on the week's named files pulled into <fresh root>/<slug> (publish reads the slug from the folder name). */
export const withWeek = (ctx, slug, files, fn) => withRoot(ctx, async root => { const dir = join(root, slug); await pullWeek(ctx.store, slug, dir, files); return fn(dir); });
export async function requireSheet(ctx, slug) { const sheet = await readJson(ctx.store, `weeks/${slug}/sheet.json`); if (!sheet) throw new Error(`no week ${slug} in the store; start_week makes one`); return sheet; }
export async function sheetLint(ctx, sheet, customs) { return lintSheet(sheet, { voices: await loadVoices(), customs, basemap: await loadBasemap(sheet, ctx.root) }); }
export const lintView = r => ({ errors: r.errors.map(x => `${x.where}: ${x.msg}`), warnings: r.warnings.map(x => `${x.where}: ${x.msg}`) });
export const countsView = (sheet, customs) => L.readings(sheet).filter(r => (r.verses || []).length).map(r => ({ reading: r.id, ...entryCounts(r), cap: customs.entryCap, carried: (r.commentary || []).filter(e => e.status === "carried").length, rejected: (r.commentary || []).filter(e => e.status === "rejected").length }));
const overlaps = (a, b) => { const x = parseRange(a), y = parseRange(b); if (!x || !y || x.book !== y.book) return false; const before = (p, q) => p[0] < q[0] || (p[0] === q[0] && p[1] < q[1]); return !before(y.to, x.from) && !before(x.to, y.from); };

export const getCalendar = defineTool({
  name: "get_calendar",
  description: "The coming Shabbat (or the date given): parashah, the haftarah with its reason when a special Shabbat replaces the usual one, the Torah aliyot as Hebcal lists them, next week's line, and the weeks the working store already holds for this and the following Shabbat.",
  inputSchema: { type: "object", properties: { date: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$", description: "A Shabbat, YYYY-MM-DD; default the next one" } } },
  annotations: { readOnlyHint: true },
  async handler({ date = null }, ctx) {
    const customs = await customsOf(ctx);
    const d = date || nextShabbat(new Date(ctx.now()));   // now() may return a Date or milliseconds
    if (Number.isNaN(Date.parse(d + "T12:00:00Z")) || new Date(d + "T12:00:00Z").toISOString().slice(0, 10) !== d) throw new Error(`${d} is not a date`);
    const g = get(ctx);
    const item = ((await g(leyningUrl(d, customs))).items || [])[0];
    if (!item) throw new Error(`Hebcal has no reading for ${d}; is it a Shabbat?`);
    const conv = await g(`https://www.hebcal.com/converter?cfg=json&gy=${d.slice(0, 4)}&gm=${+d.slice(5, 7)}&gd=${+d.slice(8, 10)}&g2h=1`);
    const name = item.name?.en || "", special = item.reason?.haftara || null;
    const dflt = defaultHaftarahFor(name, customs.haftarahRite);
    const after = new Date(d + "T12:00:00Z"); after.setUTCDate(after.getUTCDate() + 7);
    const next = after.toISOString().slice(0, 10);
    // One listing; status.json read only for this Shabbat's and next Shabbat's weeks.
    const slugs = [...new Set((await ctx.store.list("weeks/")).map(b => b.pathname.split("/")[1]).filter(s => SLUG.test(s || "") && (s.startsWith(d) || s.startsWith(next))))].sort().reverse();
    const weeks = [];
    for (const slug of slugs) { const st = await readStatus(ctx.store, slug); weeks.push({ slug, status: st?.status || null, version: st?.version || null }); }
    return { shabbat: { civil: d, hebrewEn: `${conv.hd} ${conv.hm} ${conv.hy}` }, parashah: { en: name, he: item.name?.he || "", ref: item.summary || "" }, haftarah: { ref: item.haftara || null, special, defaultHaftarah: special && dflt !== item.haftara ? dflt : null }, aliyot: aliyotLines(leyningOf(item)), nextWeek: await nextWeekFor(d, customs, g), slug: weekSlug(d, name, special), weeks, customsToConfirm: customs.toConfirm || [] };
  },
});

export const findPastSheets = defineTool({
  name: "find_past_sheets",
  description: "Earlier weeks in the public library for a parashah, a book or a passage that overlaps the ref given, newest first, each with its page and PDFs, joined with the working store's status when the week is there too. Replaces listing the Drive folder.",
  inputSchema: { type: "object", properties: { parashah: { type: "string" }, book: { type: "string" }, ref: { type: "string", description: "e.g. Isaiah 54:1-55:5; weeks whose reading overlaps it" }, limit: { type: "integer" } } },
  annotations: { readOnlyHint: true },
  async handler({ parashah = null, book = null, ref = null, limit = 10 }, ctx) {
    const idx = await get(ctx)(`${ctx.config.site}/data/index.json`);
    const keys = parashah ? parashahKeysOf(parashah) : null;
    const want = ref ? ref.replace(/–/g, "-") : null;
    const n = Math.min(100, Math.max(1, Number.isFinite(Number(limit)) ? Math.floor(Number(limit)) : 10));   // 0 or less is one row
    const rows = (idx.weeks || []).filter(r => (!keys || (r.parashahKeys || []).some(k => keys.includes(k))) && (!book || (r.readings || [{ book: r.book }]).some(x => (x.book || "").toLowerCase() === book.toLowerCase())) && (!ref || (r.readings || [{ ref: r.ref }]).some(x => overlaps(String(x.ref || "").replace(/–/g, "-"), want)))).slice(0, n);
    // status.json read only for the rows returned; a row whose slug is not a week slug has none.
    const statusOf = async slug => { try { return (await readStatus(ctx.store, slug))?.status || null; } catch { return null; } };
    const out = [];
    for (const r of rows) out.push({ slug: r.slug, civil: r.civil, hebrewEn: r.hebrewEn, parashah: r.parashah, special: r.special || null, readings: r.readings || [{ id: "haftarah", kind: "haftarah", ref: r.ref, book: r.book }], page: `${ctx.config.site}/${r.slug}`, pdf: `${ctx.config.site}/data/${r.pdf}`, pdfTorah: r.pdfTorah ? `${ctx.config.site}/data/${r.pdfTorah}` : null, status: await statusOf(r.slug) });
    return out;
  },
});

const PARTS = ["meta", "verses", "commentary", "glosses", "glossary", "openingNote", "nextWeek", "figures", "briefing"];
export const getSheet = defineTool({
  name: "get_sheet",
  description: "A week's working sheet, by parts (default meta, openingNote and nextWeek), with its version for the next save, its status, the entry counts by reading and register against the cap, and the current lint errors and warnings.",
  inputSchema: { type: "object", properties: { slug: slugProp, parts: { type: "array", items: { type: "string", enum: PARTS } } }, required: ["slug"] },
  annotations: { readOnlyHint: true },
  async handler({ slug, parts = ["meta", "openingNote", "nextWeek"] }, ctx) {
    const sheet = await requireSheet(ctx, slug);
    const customs = await customsOf(ctx);
    const status = await readStatus(ctx.store, slug);
    const out = { slug, version: status?.version || 0, status: status?.status || "drafting", counts: countsView(sheet, customs), lint: lintView(await sheetLint(ctx, sheet, customs)) };
    const per = f => L.readings(sheet).filter(r => (r.verses || []).length).map(r => ({ id: r.id, kind: r.kind, ...f(r) }));
    if (parts.includes("meta")) out.meta = { shabbat: sheet.shabbat, series: sheet.series, prior: sheet.prior || null, credits: sheet.credits, readings: per(r => ({ ref: r.ref, book: r.book, verses: (r.verses || []).length, incipit: r.incipit || null, selection: r.selection || null, maftir: r.maftir || null, defaultHaftarah: r.defaultHaftarah || null })) };
    if (parts.includes("verses")) out.verses = per(r => ({ verses: (r.verses || []).map(v => ({ chapter: v.chapter, verse: v.verse, he: v.he, en: v.en, notes: v.notes || [] })) }));
    if (parts.includes("commentary")) out.commentary = per(r => ({ commentary: r.commentary || [] }));
    if (parts.includes("glosses")) out.glosses = per(r => ({ glosses: r.glosses || [] }));
    if (parts.includes("glossary")) out.glossary = sheet.glossary || [];
    if (parts.includes("openingNote")) out.openingNote = sheet.openingNote || null;
    if (parts.includes("nextWeek")) out.nextWeek = sheet.nextWeek || null;
    if (parts.includes("figures")) out.figures = { places: sheet.places || [], mapRegion: sheet.mapRegion || null, timeline: sheet.timeline || [], highlights: sheet.highlights || [] };
    if (parts.includes("briefing")) out.briefing = (await ctx.store.get(`weeks/${slug}/briefing.md`))?.toString("utf8") || null;
    return out;
  },
});

export const getTexts = defineTool({
  name: "get_texts",
  description: "A slice of the texts fetch_texts gathered for a reading: commentary segments and linked Talmud, midrash, liturgy, Targum and Zohar, filtered by source, kind, chapter or verse, paged with a cursor. Draft from this instead of calling Sefaria verse by verse.",
  inputSchema: { type: "object", properties: { slug: slugProp, reading: readingProp, source: { type: "string", description: "Part of a source name, e.g. Rashi or Abarbanel" }, kind: { type: "string", enum: ["commentary", "talmud", "midrash", "liturgy", "targum", "zohar", "halakhah", "kabbalah"] }, chapter: { type: "integer" }, verse: { type: "integer" }, cursor: { type: "string" } }, required: ["slug"] },
  annotations: { readOnlyHint: true },
  async handler({ slug, reading = "haftarah", source, kind, chapter, verse, cursor = null }, ctx) {
    const file = reading === "torah" ? "texts-torah.json" : "texts.json";
    const texts = await readJson(ctx.store, `weeks/${slug}/${file}`);
    if (!texts) throw new Error(`no ${file} for ${slug}; run fetch_texts for the ${reading} first`);
    return sliceTexts(texts, { source, kind, chapter, verse }, cursor, 90_000);   // under MAX_RESULT_CHARS, measured as the transport prints it
  },
});

export const saveBriefing = defineTool({
  name: "save_briefing",
  description: "Store the briefing as given to Daniel, with the numbered issues it raised and his picks, as the week's briefing.md (delivered with the week).",
  inputSchema: { type: "object", properties: { slug: slugProp, markdown: { type: "string" }, issues: { type: "array", items: { type: "string" } }, picks: { type: "array", items: { type: "string" } } }, required: ["slug", "markdown"] },
  annotations: { idempotentHint: true },
  async handler({ slug, markdown, issues = [], picks = [] }, ctx) {
    await requireSheet(ctx, slug);
    const md = [markdown.trimEnd(), issues.length ? `## Issues\n\n${issues.map((x, i) => `${i + 1}. ${x}`).join("\n")}` : null, picks.length ? `## Picks\n\n${picks.map(x => `- ${x}`).join("\n")}` : null].filter(Boolean).join("\n\n") + "\n";
    await ctx.store.put(`weeks/${slug}/briefing.md`, Buffer.from(md, "utf8"), "text/markdown; charset=utf-8");
    const status = await writeStatus(ctx.store, slug, {}, ctx.now);
    return { slug, version: status.version, bytes: Buffer.byteLength(md) };
  },
});

// ---- the writing tools ----
const conflict = (status, expected) => status.version !== expected ? { error: "version_conflict", version: status.version, message: `the week changed since you read it (version ${status.version}); read it again and retry with expectedVersion ${status.version}` } : null;
const readingIn = (sheet, id) => L.readings(sheet).find(r => r.id === id) || {};
/** The repo's bibliography for a week's books, with the store's overlay (bibliography/<book lower-cased>.md) merged over it. */
export async function biblioFor(ctx, sheet) {
  const overlay = {};
  // weekBibliography looks a book up by its own case (Isaiah), so the overlay is keyed that way.
  for (const book of new Set(L.readings(sheet).map(r => r.book).filter(Boolean))) { const md = await ctx.store.get(`bibliography/${book.toLowerCase()}.md`); if (md) overlay[book] = md.toString("utf8"); }
  return { union: await weekBibliography(sheet, ctx.root, overlay), overlay };
}
/** Write the sheet and bump the version; a week that was built or delivered goes back to drafting. */
async function saveSheet(ctx, slug, sheet, statusPatch = {}) {
  await writeJson(ctx.store, `weeks/${slug}/sheet.json`, sheet);
  const cur = await readStatus(ctx.store, slug);
  return writeStatus(ctx.store, slug, { ...(cur && cur.status !== "drafting" ? { status: "drafting" } : {}), ...statusPatch }, ctx.now);
}

export const startWeek = defineTool({
  name: "start_week",
  description: "Start a week in the working store for a Shabbat: the haftarah (Hebcal's, or the ref given) verse-aligned in Hebrew and English, the Torah selection when a pick is given, last year's sheet and its carried entries, the candidates Sefaria links to. Refuses a week already in the store unless force (start over) or a Torah pick (add the Torah reading to the kept week).",
  inputSchema: { type: "object", properties: { date: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" }, haftarahRef: { type: "string" }, torahPick: { type: "string", pattern: "^(aliyah:(\\d(-\\d)?|M)|triennial|full)$" }, torahRef: { type: "string" }, noTorah: { type: "boolean" }, carry: { type: "boolean" }, force: { type: "boolean" } }, required: ["date"] },
  annotations: {},
  async handler({ date, haftarahRef = null, torahPick = null, torahRef = null, noTorah = false, carry = true, force = false }, ctx) {
    const customs = await customsOf(ctx);
    const item = ((await get(ctx)(leyningUrl(date, customs))).items || [])[0];
    if (!item) throw new Error(`Hebcal has no reading for ${date}; is it a Shabbat?`);
    const slug = weekSlug(date, item.name?.en || "", item.reason?.haftara || null);
    const existing = await readStatus(ctx.store, slug);
    if (existing && !force && !torahPick && !torahRef) throw new Error(`${slug} is already in the store (version ${existing.version}); pass force to start over, or torahPick/torahRef to add the Torah reading`);
    const lines = [];
    // The store is the week: a fresh folder, nothing left over from an earlier call in this instance, removed after.
    const r = await withRoot(ctx, async root => {
      const dir = join(root, slug);
      if (existing && !force) await pullWeek(ctx.store, slug, dir, ["sheet.json"]);   // fetchWeek merges the Torah reading into the kept sheet
      const out = await fetchWeek({ date, outRoot: root, force, haftarahRef, wantTexts: false, carry, noTorah, torahRef, torahPick, customs, fetchImpl: ctx.fetchImpl, log: m => lines.push(m), site: ctx.config.site });
      await pushWeek(ctx.store, slug, dir, ["sheet.json", "candidates.json", "candidates-torah.json", "prior.json"]);
      return out;
    });
    // A kept week whose sheet gained the Torah reading: a new version, and back to drafting if it was built or delivered.
    const status = force || !existing ? await writeStatus(ctx.store, slug, { status: "drafting", built: null, delivered: null }, ctx.now) : await writeStatus(ctx.store, slug, existing.status !== "drafting" ? { status: "drafting" } : {}, ctx.now);
    return { slug, status: status.status, version: status.version, readings: r.readings, aliyot: r.leyning ? aliyotLines(r.leyning) : [], lastTime: r.prior?.slug ? { slug: r.prior.slug, hebrewEn: r.prior.hebrewEn, source: r.prior.source } : null, carried: r.carried, nextWeek: r.nextWeek, notes: lines.filter(l => l.startsWith("  ") || l.startsWith("customs/") || l.startsWith("Torah")) };
  },
});

export const fetchTexts = defineTool({
  name: "fetch_texts",
  description: "Gather one reading's texts from Sefaria (the core commentators on the range and the linked Talmud, midrash, liturgy, Targum and Zohar) into the store and refresh digest.md. One reading per call, so each call ends well inside the client's time limit. A texts file already present is kept unless force. Returns the whole digest.",
  inputSchema: { type: "object", properties: { slug: slugProp, reading: readingProp, force: { type: "boolean" } }, required: ["slug", "reading"] },
  annotations: { idempotentHint: true },
  async handler({ slug, reading, force = false }, ctx) {
    await requireSheet(ctx, slug);
    const lines = [];
    const { t, digest } = await withWeek(ctx, slug, NEEDS.texts, async dir => {
      const t = await fetchTextsFor(dir, reading, { fetchImpl: ctx.fetchImpl, log: m => lines.push(m), force });
      const digest = await writeDigest(dir);
      await pushWeek(ctx.store, slug, dir, [t.file, "digest.md"]);
      return { t, digest };
    });
    return { slug, reading, file: t.file, kept: !!t.kept, counts: t.counts || null, sectionFiled: t.sectionFiled || [], notFetched: t.notFetched || null, digest };
  },
});

export const saveEntries = defineTool({
  name: "save_entries",
  description: "Add or update commentary entries and margin glosses in one reading (upsert by id; a new entry gets its id), add glossary items, remove entries by id. An entry sent without an id is always added (sending the same entry again adds a second one with a -2 id); send the id to update. Each entry passes the citation gate (a Sefaria ref outside the critical register, works from the bibliography for historians) and its ref is checked against Sefaria; the valid are saved, the rest refused and named. Lint runs on the result. Needs the week's current version.",
  inputSchema: { type: "object", properties: { slug: slugProp, expectedVersion: { type: "integer" }, reading: readingProp, entries: { type: "array", items: { type: "object" } }, glossary: { type: "array", items: { type: "object" } }, remove: { type: "array", items: { type: "string" } } }, required: ["slug", "expectedVersion", "reading"] },
  annotations: {},
  async handler({ slug, expectedVersion, reading, entries = [], glossary = [], remove = [] }, ctx) {
    const sheet = await requireSheet(ctx, slug);
    const status = (await readStatus(ctx.store, slug)) || { version: 0 };
    const c = conflict(status, expectedVersion); if (c) return c;
    const customs = await customsOf(ctx);
    const up = upsertEntries(sheet, reading, { entries, glossary, remove });
    const { union } = await biblioFor(ctx, up.sheet);
    const gateProblems = validateEntries(up.sheet, reading, up.touched, { biblio: union });
    const r = readingIn(up.sheet, reading);
    const itemOf = id => [...(r.commentary || []), ...(r.glosses || [])].find(x => x.id === id);
    // Sefaria is asked only about the refs of entries the gate passed.
    const refs = await verifyRefs(up.touched.filter(id => !(gateProblems.get(id) || []).length).map(id => (r.commentary || []).find(e => e.id === id)?.sourceRef).filter(Boolean), { fetchImpl: ctx.fetchImpl });
    const results = [], refused = new Set();
    for (const id of up.touched) {
      const e = itemOf(id);
      const errors = [...(gateProblems.get(id) || [])], warnings = [];
      if (e?.sourceRef && refs.get(e.sourceRef) === "missing") errors.push(`${e.sourceRef} does not resolve on Sefaria`);
      if (e?.sourceRef && refs.get(e.sourceRef) === "unknown") warnings.push(`refUnverified: Sefaria could not be reached for ${e.sourceRef}; check it before the build`);
      results.push({ id, saved: !errors.length, errors, warnings });
      if (errors.length) refused.add(id);
    }
    // Only the valid stay: a refused new entry is dropped, a refused update put back as it was, so every saved id is the one reported.
    const before = readingIn(sheet, reading);
    for (const list of ["commentary", "glosses"]) {
      r[list] = (r[list] || []).flatMap(x => { if (!refused.has(x.id)) return [x]; const old = (before[list] || []).find(o => o.id === x.id); return old ? [structuredClone(old)] : []; });
    }
    const withIds = withEntryIds(up.sheet).sheet;
    const lint = lintView(await sheetLint(ctx, withIds, customs));
    const st = await saveSheet(ctx, slug, withIds);
    return { slug, version: st.version, status: st.status, results, counts: countsView(withIds, customs), lint };
  },
});

export const updateSheet = defineTool({
  name: "update_sheet",
  description: "Change the week's own fields: openingNote (merged), glossary, nextWeek (null to drop it), credits, highlights, places, mapRegion, timeline, and a reading's incipit (patch.readings.<id>.incipit). Lists replace, objects merge. Lint runs on the result. Needs the week's current version.",
  inputSchema: { type: "object", properties: { slug: slugProp, expectedVersion: { type: "integer" }, patch: { type: "object" } }, required: ["slug", "expectedVersion", "patch"] },
  annotations: { idempotentHint: true },
  async handler({ slug, expectedVersion, patch }, ctx) {
    const sheet = await requireSheet(ctx, slug);
    const status = (await readStatus(ctx.store, slug)) || { version: 0 };
    const c = conflict(status, expectedVersion); if (c) return c;
    const p = applyPatch(sheet, patch);
    const customs = await customsOf(ctx);
    const lint = lintView(await sheetLint(ctx, p.sheet, customs));
    const st = await saveSheet(ctx, slug, p.sheet);
    return { slug, version: st.version, status: st.status, changed: p.changed, lint };
  },
});

export const setStatus = defineTool({
  name: "set_status",
  description: "Mark entries or glosses rejected (they stay in the working sheet and never print or publish), or clear the mark with null. Reject, don't delete. Needs the week's current version.",
  inputSchema: { type: "object", properties: { slug: slugProp, expectedVersion: { type: "integer" }, ids: { type: "array", items: { type: "string" } }, status: { type: "string", enum: ["rejected"] } }, required: ["slug", "expectedVersion", "ids"] },
  annotations: { idempotentHint: true },
  async handler({ slug, expectedVersion, ids, status = null }, ctx) {
    const sheet = await requireSheet(ctx, slug);
    const cur = (await readStatus(ctx.store, slug)) || { version: 0 };
    const c = conflict(cur, expectedVersion); if (c) return c;
    const r = setStatuses(sheet, ids, status);
    const st = await saveSheet(ctx, slug, r.sheet);
    return { slug, version: st.version, status: st.status, changed: r.changed, counts: countsView(r.sheet, await customsOf(ctx)) };
  },
});

/**
 * The books a bibliography line can belong to, lower-cased name → { name, file }: the repo's bibliography
 * files (named in the book's own case, e.g. "I Samuel.md"; file is that name), then the books of the store's weeks (file null).
 */
async function knownBooks(ctx) {
  const known = new Map();
  for (const f of await readdir(join(ctx.root, "bibliography")).catch(() => [])) if (f.endsWith(".md") && f.toLowerCase() !== "readme.md") known.set(f.slice(0, -3).toLowerCase(), { name: f.slice(0, -3), file: f });
  const sheets = (await ctx.store.list("weeks/")).map(b => b.pathname).filter(p => /^weeks\/[^/]+\/sheet\.json$/.test(p));
  for (const p of sheets) { try { const s = await readJson(ctx.store, p); for (const r of L.readings(s || {})) if (r.book && !known.has(r.book.toLowerCase())) known.set(r.book.toLowerCase(), { name: r.book, file: null }); } catch {} }
  return known;
}

export const addBibliographyWork = defineTool({
  name: "add_bibliography_work",
  description: "Add a work to the bibliography a historians entry may cite, as an overlay line in the store (bibliography/<book>.md there; merged into the repo's file by hand later). The citation is verified by a publisher or WorldCat URL. The same key again replaces the line.",
  inputSchema: { type: "object", properties: { book: { type: "string" }, key: { type: "string" }, citation: { type: "string" }, verifiedBy: { type: "string", pattern: "^https://" } }, required: ["book", "key", "citation", "verifiedBy"] },
  annotations: {},
  async handler({ book, key, citation, verifiedBy }, ctx) {
    if (/[|\n]/.test(key) || /\n/.test(citation)) throw new Error("key cannot contain | or a line break; citation cannot contain a line break");
    if (/^[\s-]/.test(key)) throw new Error("key cannot start with a space or -");
    const known = await knownBooks(ctx);
    const kb = known.get(book.toLowerCase());
    if (!kb) throw new Error(`no bibliography for ${book}; the known books are ${[...known.values()].map(x => x.name).sort().join(", ") || "none"}`);
    const path = `bibliography/${book.toLowerCase()}.md`;
    const cur = (await ctx.store.get(path))?.toString("utf8") || `# ${book} (overlay)\n\n`;
    const line = `- key: ${key.trim()} | ${citation.trim()} | verified: ${verifiedBy.trim()}`;
    const lines = cur.split("\n");
    const i = lines.findIndex(l => l.startsWith(`- key: ${key.trim()} |`));
    const replaced = i >= 0;
    if (replaced) lines[i] = line; else lines.push(line);
    const md = lines.join("\n").replace(/\n*$/, "\n");
    await ctx.store.put(path, Buffer.from(md, "utf8"), "text/markdown; charset=utf-8");
    let repo = ""; if (kb.file) try { repo = await readFile(join(ctx.root, "bibliography", kb.file), "utf8"); } catch {}   // by its real name: a case-sensitive filesystem has no isaiah.md
    const merged = new Map([...L.parseBibliography(repo), ...L.parseBibliography(md)]);
    return { book, key: key.trim(), line, replaced, merged: merged.size };
  },
});

// ---- building and delivering ----
const stamp = ctx => { const v = ctx.now(); return new Date(typeof v === "number" ? v : v.getTime()).toISOString().replace(/\.\d{3}Z$/, "Z"); };
const errText = err => (err && err.message) || String(err);
const notChecked = why => ({ ok: false, problems: [`not checked: ${why}`], diagnostics: [], table: [] });
const checkView = c => ({ ok: !c.problems.length, problems: c.problems, diagnostics: c.diagnostics, table: c.page });
/** The base64 an image result may carry: the transport's size guard counts text only, and a Vercel response is at most 4.5 MB. */
export const MAX_IMAGE_BASE64 = 1_500_000;

export const buildSheet = defineTool({
  name: "build_sheet",
  description: "Build the week's printed sheets: the citation gate and lint, then every reading's HTML and PDF with the pinned browser, the layout check (two renders, the gap and divine-name invariants), and page images. Returns the report, a 24-hour link to each PDF for Daniel to open and print, and the page image names for get_page_image. Status becomes built when every reading's sheet built and passed its check in this call (a build of one reading of a two-reading week leaves it drafting). Daniel approves by printing; show him in full everything Claude wrote before this.",
  inputSchema: { type: "object", properties: { slug: slugProp, reading: readingProp, trope: { type: "boolean", description: "Also the haftarah's chanter's copy (sheet-trope.pdf)" } }, required: ["slug"] },
  annotations: {},
  async handler({ slug, reading = null, trope = false }, ctx) {
    // The version before anything is read: an edit that lands during the minutes-long build must not be marked built.
    const v0 = (await readStatus(ctx.store, slug))?.version || 0;
    const sheet = await requireSheet(ctx, slug);
    return withWeek(ctx, slug, NEEDS.build, async dir => {
      // A browser that cannot start is reported, not thrown: the gate, the lint and the HTML still run.
      let launcher = null, browserFailure = null;
      try { launcher = ctx.launcher ? await ctx.launcher() : null; if (!launcher) browserFailure = "no browser launcher on this server"; }
      catch (err) { browserFailure = errText(err); }
      try { return await buildIn(dir, { slug, reading, trope, sheet, v0, launcher, browserFailure }, ctx); }
      finally { await launcher?.close?.(); }   // one browser for the whole build, closed whatever happened
    });
  },
});

async function buildIn(dir, { slug, reading, trope, sheet, v0, launcher, browserFailure }, ctx) {
    const { overlay } = await biblioFor(ctx, sheet);
    const browser = browserFailure ? { ok: false, error: browserFailure } : { ok: true };
    const log = m => ctx.log(m);
    // A launcher that drives its browser itself (Vercel's) prints and dumps the DOM in place of the scripts' spawns.
    const printImpl = launcher?.print ? { printImpl: launcher.print } : {};
    const dumpDomImpl = launcher?.dumpDom ? { dumpDomImpl: launcher.dumpDom } : {};
    let built;
    try { built = await ctx.scripts.buildWeek(dir, { pdf: !!launcher, png: false, trope, reading, customs: ctx.config.customs, browser: launcher ? launcher.browser : null, root: ctx.root, biblioOverlay: overlay, log, warn: log, ...printImpl }); }
    catch (err) {
      if (!(err instanceof BuildRefused)) throw err;
      const st = await readStatus(ctx.store, slug);
      return { slug, version: st?.version || 0, status: st?.status || "drafting", gate: err.problems, lint: { errors: [], warnings: [] }, browser, readings: [] };
    }
    const builds = built.builds.filter(b => !reading || b.kind === reading);
    // The study sheets are checked as such; the chanter's copy (checkWeek's trope target) separately.
    const runCheck = async opts => { try { return { result: await ctx.scripts.checkWeek(dir, { ...opts, browser: launcher.browser, log, ...dumpDomImpl }) }; } catch (err) { return { failure: errText(err) }; } };
    const check = launcher && builds.some(b => b.pdf) ? await runCheck({ only: reading }) : null;
    const push = ["sheet.html", "sheet-torah.html", "sheet-trope.html", PDF_FILES.haftarah, PDF_FILES.torah, "sheet-trope.pdf"];
    const readings = [], pages = {};
    for (const b of builds) {
      const c = check?.result?.readings.find(x => x.id === b.id) || null;
      let images = [], imageError = null;
      if (launcher && b.pdf && b.pages) {
        try { images = await launcher.pages(pathToFileURL(b.html).href, join(dir, "pages"), b.pages, b.kind); push.push(...images.map(n => `pages/${n}`)); }
        catch (err) { imageError = errText(err); }
      }
      pages[b.kind] = images;   // a rebuilt reading's earlier images no longer show this sheet
      const view = L.readingView(sheet, b.id);
      readings.push({ id: b.id, kind: b.kind, ref: view.haftarah.ref, pages: b.pages, bytes: b.bytes, pdfUrl: b.pdf ? draftUrl(ctx.config.site, ctx.config.authSecret, slug, PDF_FILES[b.kind], ctx.now) : null, check: c ? checkView(c) : notChecked(!launcher ? "no browser" : check?.failure || "no PDF"), images, ...(imageError ? { imageError } : {}), entries: entryCounts(L.readings(sheet).find(r => r.id === b.id) || {}) });
    }
    let tropeOut = null;   // the chanter's copy: its own check, and it gates built when asked for
    if (built.trope) {
      const tc = built.trope.pdf ? await runCheck({ trope: true }) : null;
      const c = tc?.result?.readings[0] || null;
      tropeOut = { pages: built.trope.pages, bytes: built.trope.bytes, pdfUrl: built.trope.pdf ? draftUrl(ctx.config.site, ctx.config.authSecret, slug, "sheet-trope.pdf", ctx.now) : null, check: c ? checkView(c) : notChecked(!launcher ? "no browser" : tc?.failure || "no PDF") };
    }
    await pushWeek(ctx.store, slug, dir, push);
    const every = L.readings(sheet).filter(r => (r.verses || []).length).every(r => readings.some(x => x.id === r.id));
    const allGood = !!launcher && every && readings.length > 0 && readings.every(r => r.pdfUrl && r.check.ok) && (!tropeOut || (tropeOut.pdfUrl && tropeOut.check.ok));
    const report = { gate: [], lint: { errors: [], warnings: built.warnings.map(w => `${w.where}: ${w.msg}`) }, browser, readings, ...(tropeOut ? { trope: tropeOut } : {}) };
    const cur = await readStatus(ctx.store, slug);
    // Changed while building: the status the edit left stands, and these PDFs are of the older sheet.
    if ((cur?.version || 0) !== v0) return { slug, version: cur?.version || 0, status: cur?.status || "drafting", note: `the sheet changed during the build (version ${v0} became ${cur?.version || 0}); build again`, ...report };
    // The page list rides in status.json, so get_page_image never serves a page left from a longer earlier build.
    const st = await writeStatus(ctx.store, slug, { ...(allGood ? { status: "built", built: stamp(ctx) } : { status: "drafting" }), pages: { ...(cur?.pages || {}), ...pages } }, ctx.now);
    return { slug, version: st.version, status: st.status, ...report };
}

export const getPageImage = defineTool({
  name: "get_page_image",
  description: "One page of a built sheet as an image (816×1056, JPEG), to look at the layout the way Daniel will see it printed. Pages are numbered from 1; build_sheet lists them.",
  inputSchema: { type: "object", properties: { slug: slugProp, reading: readingProp, page: { type: "integer" } }, required: ["slug", "reading", "page"] },
  annotations: { readOnlyHint: true },
  async handler({ slug, reading, page }, ctx) {
    const st = await readStatus(ctx.store, slug);
    const list = st?.pages?.[reading] || (await ctx.store.list(`weeks/${slug}/pages/${reading}-`)).map(b => b.pathname.split("/").pop()).sort();
    const name = list.find(n => n.startsWith(`${reading}-${String(page).padStart(2, "0")}.`));
    const bytes = name ? await ctx.store.get(`weeks/${slug}/pages/${name}`) : null;
    if (!bytes) throw new Error(`no page ${page} of the ${reading} for ${slug} (${list.length} built); run build_sheet first`);
    const data = bytes.toString("base64");
    if (data.length > MAX_IMAGE_BASE64) throw new Error(`${slug} ${reading} page ${page} is ${Math.round(bytes.length / 1024)} KB, too large to send (at most ${Math.floor(MAX_IMAGE_BASE64 * 3 / 4 / 1024)} KB); open the PDF from build_sheet's link instead`);
    return imageResult(data, name.endsWith(".png") ? "image/png" : "image/jpeg", `${slug} ${reading} page ${page} of ${list.length}`);
  },
});

export const deliverWeek = defineTool({
  name: "deliver_week",
  description: "DELIVER THE WEEK. Only on Daniel's explicit go-ahead (\"ship it\", \"deliver\", \"send it\") after he has printed the sheet; never on your own judgment. Sends the PDFs and the working files to Drive through the drop box, then publishes the week to the public site (sheet.json, PDFs, the side files, the index). dryRun lists what would go where and changes nothing. Refuses a week that is not built.",
  inputSchema: { type: "object", properties: { slug: slugProp, dryRun: { type: "boolean" }, only: { type: "string", enum: ["public", "working"] }, web: { type: "boolean", description: "Also publish to the site (default true)" } }, required: ["slug"] },
  annotations: { destructiveHint: true },
  async handler({ slug, dryRun = false, only = undefined, web = true }, ctx) {
    await requireSheet(ctx, slug);
    const st = await readStatus(ctx.store, slug);
    if (!dryRun && st?.status !== "built") throw new Error(`${slug} is ${st?.status || "unstarted"}; build_sheet first (a sheet edited after its build must be built again)`);
    if (!ctx.config.dropbox) throw new Error("the drop box is not configured on the server (HAFTARAH_DROPBOX_URL and HAFTARAH_DROPBOX_TOKEN); deliver from Claude Code with scripts/deliver.mjs");
    if (web && !ctx.config.publicToken) throw new Error("the public store token is not configured on the server (BLOB_READ_WRITE_TOKEN)");
    const lines = [], log = m => lines.push(String(m));
    const customs = await customsOf(ctx);
    const webConfig = web ? { token: ctx.config.publicToken } : null;
    try {
      await withWeek(ctx, slug, NEEDS.deliver, async dir => {
        await ctx.scripts.deliver(dir, { only, dryRun, config: ctx.config.dropbox, log, fetchImpl: ctx.fetchImpl, webConfig, publishImpl: ctx.scripts.publish, side: true, cache: ctx.config.cacheDir, customs });
        if (dryRun && web) await ctx.scripts.publish(dir, { dryRun: true, log, side: true, customs });
      });
    } catch (err) {
      // Part of it may already be done (Drive, say, and not the site): the lines say which, so nothing is hidden or sent twice blind.
      const out = textResult({ slug, status: st?.status || "drafting", delivered: false, error: errText(err), lines, note: "the lines above the error went through; the week stays as it was" });
      return { ...out, isError: true };
    }
    if (dryRun) return { slug, dryRun: true, status: st?.status || "drafting", lines };
    const done = await writeStatus(ctx.store, slug, { status: "delivered", delivered: stamp(ctx) }, ctx.now);
    return { slug, status: done.status, version: done.version, lines, page: web ? `${ctx.config.site}/${slug}` : null };
  },
});

export const TOOLS = [getCalendar, findPastSheets, startWeek, fetchTexts, getTexts, getSheet, saveBriefing, saveEntries, updateSheet, setStatus, buildSheet, getPageImage, deliverWeek, addBibliographyWork];
