#!/usr/bin/env node
/**
 * make-geodata.mjs — one-time: download Natural Earth's land, rivers and lakes (public domain) and
 * OpenBible's ancient places (CC BY 4.0) at pinned commits into the cache, reduce them, and write
 * data/geo/basemap.json and data/geo/gazetteer.json. Nothing it downloads enters the repo.
 *
 *   node tools/make-geodata.mjs            # writes both files (downloads once; the cache is ~/.haftarah-cache/geo/ or $HAFTARAH_CACHE/geo/)
 */
import { readFile, writeFile, mkdir, rename, access, rm } from "node:fs/promises";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { NE_SHA, OB_SHA, BASEMAP_BUDGET, buildBasemap, buildGazetteer } from "../scripts/geo.mjs";
import { cacheDir } from "../scripts/words.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const NE_RAW = `https://raw.githubusercontent.com/nvkelso/natural-earth-vector/${NE_SHA}/geojson/`;
export const SOURCES = {
  land: { file: "ne_10m_land.geojson", url: `${NE_RAW}ne_10m_land.geojson` },
  rivers: { file: "ne_10m_rivers_lake_centerlines.geojson", url: `${NE_RAW}ne_10m_rivers_lake_centerlines.geojson` },
  lakes: { file: "ne_10m_lakes.geojson", url: `${NE_RAW}ne_10m_lakes.geojson` },
  ancient: { file: "ancient.jsonl", url: `https://raw.githubusercontent.com/openbibleinfo/Bible-Geocoding-Data/${OB_SHA}/data/ancient.jsonl` },
};
const exists = p => access(p).then(() => true, () => false);

async function writeAtomic(path, body) {
  const tmp = `${path}.part`;
  try {
    await writeFile(tmp, body);
    await rename(tmp, path);
  } catch (err) { await rm(tmp, { force: true }); throw err; }
}

/** The cache's copy of a source, downloaded first when the cache lacks it. */
async function cached({ file, url }, { cache, fetchImpl, log }) {
  const path = join(cache, file);
  if (!(await exists(path))) {
    log(`downloading ${file} from ${url}`);
    let res;
    try { res = await fetchImpl(url); } catch (err) { throw new Error(`${file}: network error: ${err.cause?.code || err.message}`); }
    if (!res.ok) throw new Error(`${file}: HTTP ${res.status} from ${url}`);
    await mkdir(cache, { recursive: true });
    await writeAtomic(path, Buffer.from(await res.arrayBuffer()));
  }
  return readFile(path, "utf8");
}

export async function makeGeodata({ fetchImpl = globalThis.fetch, cache = join(cacheDir(), "geo"), out = join(ROOT, "data", "geo"), budget = BASEMAP_BUDGET, log = console.log } = {}) {
  const text = {};
  for (const [key, src] of Object.entries(SOURCES)) text[key] = await cached(src, { cache, fetchImpl, log });
  const basemap = buildBasemap({ land: JSON.parse(text.land), rivers: JSON.parse(text.rivers), lakes: JSON.parse(text.lakes) });
  const gazetteer = buildGazetteer(text.ancient);
  const basemapJson = JSON.stringify(basemap) + "\n", gazetteerJson = JSON.stringify(gazetteer) + "\n";
  const kb = n => Math.round(n / 1024);
  const sizes = { basemap: Buffer.byteLength(basemapJson), gazetteer: Buffer.byteLength(gazetteerJson) };
  if (sizes.basemap > budget) throw new Error(`basemap is ${kb(sizes.basemap)} KB; the budget is ${kb(budget)} KB: raise TOL.outside`);
  await mkdir(out, { recursive: true });
  await writeAtomic(join(out, "basemap.json"), basemapJson);
  await writeAtomic(join(out, "gazetteer.json"), gazetteerJson);
  const places = { ok: 0, candidates: 0, none: 0 };
  for (const p of gazetteer.places) places[p.status]++;
  const counts = { land: basemap.land.length, lakes: basemap.lakes.length, rivers: basemap.rivers.length, places };
  log(`basemap.json: ${kb(sizes.basemap)} KB (${sizes.basemap} bytes); ${counts.land} land rings, ${counts.lakes} lakes, ${counts.rivers} river lines`);
  log(`gazetteer.json: ${kb(sizes.gazetteer)} KB (${sizes.gazetteer} bytes); ${gazetteer.places.length} places: ${places.ok} ok, ${places.candidates} candidates, ${places.none} none`);
  return { counts, sizes };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  makeGeodata().catch(err => { console.error(err.message); process.exit(1); });
}
