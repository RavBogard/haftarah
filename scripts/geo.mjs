#!/usr/bin/env node
/**
 * geo.mjs — the map's data: Natural Earth reduced to a basemap, OpenBible's ancient places reduced
 * to a gazetteer (tools/make-geodata.mjs writes both, once, into data/geo/), name lookup and the
 * resolution of a week's places, and the problem lists build.mjs's gate reports.
 *
 *   node scripts/geo.mjs lookup <name> [<name>…]         # the gazetteer's records for a name, with their sites and votes
 *   node scripts/geo.mjs resolve weeks/<slug> [--dry-run] # fill lat/lon from the gazetteer for every place that lacks them
 *
 * Resolution rule: a record resolves when its best site has 500 votes or more and at least twice the
 * next site's; otherwise the record is "candidates" (listed, never guessed) or "none" (no coordinate).
 */
import { readFile, writeFile, access } from "node:fs/promises";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export const NE_SHA = "ca96624a56bd078437bca8184e78163e5039ad19";
export const OB_SHA = "7eb18a5ee62f27b9b93bd6689ea272d76dd23b8f";
export const BOX = [8, 12, 60, 42];
export const LEVANT = [33.5, 29, 37, 34.5];
export const TOL = { levant: 0.005, outside: 0.02 };
export const BASEMAP_BUDGET = 150 * 1024;
export const ROLES = ["scene", "context", "empire"];
const r3 = n => Math.round(n * 1000) / 1000;
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// ---- geometry: [x, y] points, boxes as [xMin, yMin, xMax, yMax] ----
const same = (a, b) => a[0] === b[0] && a[1] === b[1];
const isRing = pts => pts.length > 2 && same(pts[0], pts[pts.length - 1]);
function distance(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const len = Math.hypot(dx, dy);
  if (len === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  return Math.abs(dx * (a[1] - p[1]) - dy * (a[0] - p[0])) / len;
}

/** Douglas–Peucker. `tol` is a number or a function of the point (a finer tolerance where it matters).
 *  A ring (first point equals last) is simplified as the open line from first to last, so it stays closed. */
export function simplify(points, tol) {
  if (points.length <= 2) return points.map(p => [...p]);
  const tolOf = typeof tol === "function" ? tol : () => tol;
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [i, j] = stack.pop();
    let worst = 1, at = -1;   // the point that exceeds its tolerance by the largest ratio
    for (let k = i + 1; k < j; k++) {
      const ratio = distance(points[k], points[i], points[j]) / tolOf(points[k]);
      if (ratio > worst) { worst = ratio; at = k; }
    }
    if (at > 0) { keep[at] = 1; stack.push([i, at], [at, j]); }
  }
  return points.filter((_, k) => keep[k]).map(p => [...p]);
}

// One segment clipped against one half-plane; the cut point lies exactly on the edge.
const EDGES = [
  { axis: 0, side: 0, inside: (p, b) => p[0] >= b[0] },
  { axis: 1, side: 1, inside: (p, b) => p[1] >= b[1] },
  { axis: 0, side: 2, inside: (p, b) => p[0] <= b[2] },
  { axis: 1, side: 3, inside: (p, b) => p[1] <= b[3] },
];
function cut(a, b, edge, box) {
  const v = box[edge.side], o = 1 - edge.axis;
  const p = [];
  p[edge.axis] = v;
  p[o] = a[o] + (b[o] - a[o]) * (v - a[edge.axis]) / (b[edge.axis] - a[edge.axis]);
  return p;
}
function clipSegment(a, b, box) {
  for (const edge of EDGES) {
    const ia = edge.inside(a, box), ib = edge.inside(b, box);
    if (!ia && !ib) return null;
    if (!ia) a = cut(a, b, edge, box);
    else if (!ib) b = cut(a, b, edge, box);
  }
  return [a, b];
}

/** The runs of `line` inside `box`; a segment crossing the edge is cut at the edge, and a gap starts a new run. */
export function clipLine(line, box) {
  const runs = [];
  let run = null;
  for (let i = 1; i < line.length; i++) {
    const seg = clipSegment(line[i - 1], line[i], box);
    if (!seg) { run = null; continue; }
    const [a, b] = seg;
    if (run && same(run[run.length - 1], a)) run.push(b);
    else { run = [a, b]; runs.push(run); }
  }
  return runs.map(r => r.filter((p, k) => k === 0 || !same(p, r[k - 1]))).filter(r => r.length >= 2);
}

/** Sutherland–Hodgman against the box's four edges; the result is closed, or null when nothing is inside. */
export function clipPolygon(ring, box) {
  let pts = isRing(ring) ? ring.slice(0, -1) : ring.slice();
  for (const edge of EDGES) {
    const out = [];
    for (let i = 0; i < pts.length; i++) {
      const cur = pts[i], prev = pts[(i + pts.length - 1) % pts.length];
      const ic = edge.inside(cur, box), ip = edge.inside(prev, box);
      if (ic) { if (!ip) out.push(cut(prev, cur, edge, box)); out.push(cur); }
      else if (ip) out.push(cut(prev, cur, edge, box));
    }
    pts = out;
    if (!pts.length) return null;
  }
  pts = pts.filter((p, k) => k === 0 || !same(p, pts[k - 1]));
  if (pts.length > 1 && same(pts[0], pts[pts.length - 1])) pts.pop();
  if (pts.length < 3) return null;
  return [...pts.map(p => [...p]), [...pts[0]]];
}

const area = ring => Math.abs(ring.reduce((s, p, k) => k ? s + ring[k - 1][0] * p[1] - p[0] * ring[k - 1][1] : 0, 0)) / 2;
const round = pts => pts.map(([x, y]) => [r3(x), r3(y)]).filter((p, k, all) => k === 0 || !same(p, all[k - 1]));
const inBox = ([x, y], b) => x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3];
const polygonsOf = g => g?.type === "Polygon" ? [g.coordinates] : g?.type === "MultiPolygon" ? g.coordinates : [];
const linesOf = g => g?.type === "LineString" ? [g.coordinates] : g?.type === "MultiLineString" ? g.coordinates : [];

/** Natural Earth's land, lakes and rivers clipped to `box` and simplified (finer inside `levant`), to three decimals. */
export function buildBasemap({ land, rivers, lakes }, { box = BOX, levant = LEVANT, tol = TOL } = {}) {
  const tolOf = p => inBox(p, levant) ? tol.levant : tol.outside;
  const ringOf = raw => {
    const clipped = clipPolygon(raw, box);
    if (!clipped) return null;
    const ring = round(simplify(clipped, tolOf));
    return ring.length >= 4 && area(ring) > 0.0005 ? ring : null;
  };
  const out = { source: { naturalEarth: { commit: NE_SHA, files: ["ne_10m_land", "ne_10m_rivers_lake_centerlines", "ne_10m_lakes"], license: "public domain", url: "https://www.naturalearthdata.com/" } },
    box, land: [], lakes: [], rivers: [] };
  for (const f of land?.features || []) for (const poly of polygonsOf(f.geometry)) for (const raw of poly) {
    const ring = ringOf(raw);
    if (ring) out.land.push(ring);
  }
  for (const f of lakes?.features || []) {
    const { featurecla, name } = f.properties || {};
    if (featurecla === "Reservoir" || !name) continue;
    for (const poly of polygonsOf(f.geometry)) for (const raw of poly) {
      const ring = ringOf(raw);
      if (ring) out.lakes.push({ name, ring });
    }
  }
  for (const f of rivers?.features || []) {
    const { featurecla, name, scalerank } = f.properties || {};
    if (!(featurecla === "River" || featurecla === "Lake Centerline") || !(scalerank <= 6) || !name || /canal|branch|channel/i.test(name)) continue;
    for (const raw of linesOf(f.geometry)) for (const run of clipLine(raw, box)) {
      const line = round(simplify(run, tolOf));
      if (line.length >= 2) out.rivers.push({ name, line });
    }
  }
  return out;
}

// ---- the gazetteer: OpenBible's ancient places, one record per place with its sites by votes ----
const plain = s => String(s ?? "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
const votesOf = identification => identification.score?.vote_total ?? 0;

/** The sites an identification offers: its first resolution's coordinate, or none. */
export function sitesOf(identification) {
  const lonlat = identification.resolutions?.[0]?.lonlat;
  if (typeof lonlat !== "string") return [];
  const [lon, lat] = lonlat.split(",").map(Number);
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return [];
  return [{ lon: r3(lon), lat: r3(lat), votes: votesOf(identification), where: plain(identification.description) }];
}

/** A gazetteer record's top-voted site, or null. */
export const bestSite = record => record.sites?.[0] ?? null;

/** OpenBible's data/ancient.jsonl → { source, places }. A record is "none" when no identification has a
 *  coordinate or its top-voted identification has none (a "not a proper name" reading outvotes any site). */
export function buildGazetteer(jsonlText) {
  const places = [];
  for (const line of jsonlText.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const r = JSON.parse(line);
    const idents = [...(r.identifications || [])].sort((a, b) => votesOf(b) - votesOf(a));
    const sites = idents.flatMap(sitesOf).sort((a, b) => b.votes - a.votes).slice(0, 5);
    let status = "candidates";
    if (!sites.length || !sitesOf(idents[0]).length) status = "none";
    else if (sites[0].votes >= 500 && (sites.length === 1 || sites[0].votes >= 2 * sites[1].votes)) status = "ok";
    places.push({ slug: r.url_slug, name: r.friendly_id, aliases: Object.keys(r.translation_name_counts || {}).sort(), types: r.types || [],
      verses: (r.verses || []).length, sites, status });
  }
  return { source: { openbible: { commit: OB_SHA, file: "data/ancient.jsonl", license: "CC BY 4.0", credit: "OpenBible.info Bible Geocoding Data", url: "https://www.openbible.info/geo/" } }, places };
}

/** Lowercase, accents dropped, apostrophes, hyphens and spaces collapsed to one space. */
export const normalizeName = s => String(s).toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").replace(/['’\-\s]+/g, " ").trim();

/** Records named `name`: exact slug or name first, then alias matches, each group by verse count. */
export function lookupPlaces(gazetteer, name) {
  const n = normalizeName(name);
  const order = (a, b) => b.verses - a.verses || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0);
  const exact = gazetteer.places.filter(p => normalizeName(p.slug.replace(/-/g, " ")) === n || normalizeName(p.name) === n);
  const alias = gazetteer.places.filter(p => !exact.includes(p) && (p.aliases || []).some(a => normalizeName(a) === n));
  return [...exact.sort(order), ...alias.sort(order)];
}

const SOURCE = /^openbible:([a-z0-9-]+)$/;
const refuse = (reason, candidates) => candidates ? { ok: false, reason, candidates } : { ok: false, reason };
function fromRecord(place, record) {
  const src = `openbible:${record.slug}`;
  if (record.status === "none") return refuse(`${place.name}: no coordinate in OpenBible for ${src}; enter lat and lon with approved: true`);
  if (record.status !== "ok") {
    const n = record.sites.length;
    return refuse(`${place.name}: ${n} candidate site${n === 1 ? "" : "s"} for ${src} (${record.sites.map(s => `${s.where} ${s.votes}`).join(", ")}); pick one and enter lat and lon with approved: true`, record.sites);
  }
  const { lat, lon } = bestSite(record);
  return { ok: true, place: { ...place, lat, lon } };
}

/** A week's place → { ok: true, place } with lat and lon, or { ok: false, reason, candidates? }; never a guess. */
export function resolvePlace(place, gazetteer) {
  const bySlug = slug => gazetteer.places.find(p => p.slug === slug);
  if (typeof place.lat === "number" && typeof place.lon === "number") {
    if (place.approved === true) return { ok: true, place };
    const m = SOURCE.exec(place.source || "");
    const record = m && bySlug(m[1]);
    const best = record && record.status === "ok" && bestSite(record);
    if (best && Math.abs(best.lat - place.lat) <= 0.002 && Math.abs(best.lon - place.lon) <= 0.002) return { ok: true, place };
    return refuse(`${place.name}: a hand-entered coordinate needs approved: true`);
  }
  if (place.source) {
    const m = SOURCE.exec(place.source);
    const record = m && bySlug(m[1]);
    if (!record) return refuse(`${place.name}: ${place.source} is not in the gazetteer`);
    return fromRecord(place, record);
  }
  const found = lookupPlaces(gazetteer, place.name);
  if (!found.length) return refuse(`${place.name}: not found in the gazetteer; try node scripts/geo.mjs lookup "${place.name}"`);
  if (found.length > 1) return refuse(`${place.name}: ${found.length} records match; set source to one of ${found.map(p => `openbible:${p.slug}`).join(", ")}`);
  return fromRecord({ ...place, source: `openbible:${found[0].slug}` }, found[0]);
}

const exists = p => access(p).then(() => true, () => false);
/** The committed basemap and gazetteer, and the chronology table when it exists (else null). */
export async function loadGeo({ root = ROOT } = {}) {
  const json = async p => JSON.parse(await readFile(p, "utf8"));
  const chronologyFile = join(root, "data", "chronology.json");
  const [basemap, gazetteer, chronology] = await Promise.all([
    json(join(root, "data", "geo", "basemap.json")),
    json(join(root, "data", "geo", "gazetteer.json")),
    exists(chronologyFile).then(has => has ? json(chronologyFile) : null),
  ]);
  return { basemap, gazetteer, chronology };
}

// ---- the CLI ----
async function lookupCli(names) {
  const { gazetteer } = await loadGeo();
  for (const name of names) {
    const found = lookupPlaces(gazetteer, name);
    console.log(`== ${name}: ${found.length} record(s)`);
    for (const p of found) {
      console.log(`  openbible:${p.slug}  ${p.name}  ${p.verses} verses  ${p.status}  ${p.aliases.join(", ")}`);
      for (const s of p.sites) console.log(`      ${s.lon}, ${s.lat}  ${s.votes} votes  ${s.where}`);
    }
  }
  return 0;
}

async function resolveCli(dir, dryRun) {
  const { gazetteer } = await loadGeo();
  const file = join(resolve(dir), "sheet.json");
  const data = JSON.parse(await readFile(file, "utf8"));
  const places = data.places || [];
  let refused = 0;
  const out = places.map(place => {
    const r = resolvePlace(place, gazetteer);
    if (!r.ok) { refused++; console.log(r.reason); return place; }
    if (r.place.approved === true) console.log(`kept ${r.place.name} (approved)`);
    else console.log(`ok ${r.place.name} → ${r.place.lat}, ${r.place.lon} (${r.place.source})`);
    return r.place;
  });
  if (refused) { console.log(`${refused} place(s) unresolved; nothing written`); return 1; }
  if (!dryRun && places.length) {
    data.places = out;
    await writeFile(file, JSON.stringify(data, null, 2) + "\n");
  }
  return 0;
}

async function main(args) {
  const [cmd, ...rest] = args;
  if (cmd === "lookup" && rest.length) return lookupCli(rest);
  if (cmd === "resolve" && rest.some(a => !a.startsWith("--"))) return resolveCli(rest.find(a => !a.startsWith("--")), rest.includes("--dry-run"));
  console.error("usage: node scripts/geo.mjs lookup <name> [<name>…] | resolve weeks/<slug> [--dry-run]");
  return 2;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main(process.argv.slice(2)).then(code => process.exit(code), err => { console.error(err.message); process.exit(1); });
}
