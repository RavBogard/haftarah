// The addresses every part of the site agrees on: what a week slug looks like and where a week's
// files live. publish.mjs writes these paths, vercel.json routes the slug, the pages read them;
// tests/contract.test.mjs keeps vercel.json in step with SLUG_SOURCE.
export const SLUG_SOURCE = "\\d{4}-\\d{2}-\\d{2}-[a-z0-9-]+";
export const SLUG = new RegExp(`^${SLUG_SOURCE}$`);
export const isSlug = s => SLUG.test(String(s == null ? "" : s));

export const INDEX_PATH = "index.json";
/** A week file's pathname in the Blob store. */
export const weekPath = (slug, file) => `weeks/${slug}/${file}`;
/** The same file, same-origin: vercel.json rewrites /data/ to the store. */
export const dataUrl = (slug, file) => `/data/${weekPath(slug, file)}`;
export const indexUrl = () => `/data/${INDEX_PATH}`;

/** A week's printed sheets in the store, per reading: the haftarah keeps the first release's name. */
export const PDF_FILES = { haftarah: "sheet.pdf", torah: "sheet-torah.pdf" };
/** The side files publish writes beside sheet.json, fetched by the page only when first needed (spec 4.7). */
export const SIDE_FILES = { words: "words.json", translations: "translations.json", links: "links.json" };
/** The map's land and water and the chronology, copied into the site by web-build, fetched only for a week with figures. */
export const GEO_URLS = { basemap: "/geo/basemap.json", chronology: "/geo/chronology.json" };

/** The offline app (spec 5.10): the worker, the manifest and the three caches the worker owns. */
export const SW_URL = "/sw.js";
export const MANIFEST_URL = "/manifest.webmanifest";
export const CACHE_PREFIX = "haftarah-";
/** The precached shell: one cache per build, the old one dropped when the new worker activates. */
export const shellCache = build => `${CACHE_PREFIX}shell-${build}`;
/** Week files and the index (stale while revalidated), and Sefaria's answers (cached on view), both bounded. */
export const DATA_CACHE = `${CACHE_PREFIX}data`;
export const SEFARIA_CACHE = `${CACHE_PREFIX}sefaria`;
export const SEFARIA_ORIGIN = "https://www.sefaria.org";

/** The week slug in a page path, case-folded, one trailing slash allowed; null for any other path. */
export function slugFromPath(pathname) {
  const m = new RegExp(`^/(${SLUG_SOURCE})/?$`, "i").exec(pathname || "");
  return m ? m[1].toLowerCase() : null;
}

/** The rewrite source vercel.json must carry for week pages. */
export const VERCEL_WEEK_SOURCE = `/:slug(${SLUG_SOURCE})`;

/** A verse's address on its week page: <reading>-<chapter>-<verse>, e.g. haftarah-54-3. */
export const verseAnchor = (readingId, chapter, verse) => `${readingId}-${chapter}-${verse}`;

/**
 * "#haftarah-54-3" → { reading: "haftarah", chapter: 54, verse: 3 }. The first release's "#v54-3"
 * → { reading: null, … } (the page maps it to its primary reading). Anything else → null.
 */
export function parseVerseAnchor(hash) {
  const h = String(hash == null ? "" : hash).replace(/^#/, "");
  let m = /^([a-z][a-z0-9]*)-(\d{1,3})-(\d{1,3})$/.exec(h);
  if (m && m[1] !== "v") return { reading: m[1], chapter: Number(m[2]), verse: Number(m[3]) };
  m = /^v(\d{1,3})-(\d{1,3})$/.exec(h);
  return m ? { reading: null, chapter: Number(m[1]), verse: Number(m[2]) } : null;
}

/** A reader's marks in a share link: "#m=haftarah-54-3,haftarah-54-9". A bare "54-9" means the primary reading. */
export const formatMarks = anchors => `m=${anchors.join(",")}`;
export function parseMarks(hash, primaryReading) {
  const h = String(hash == null ? "" : hash).replace(/^#/, "");
  if (!h.startsWith("m=")) return null;
  let list = h.slice(2);
  try { list = decodeURIComponent(list); } catch {}   // a mail client may write the commas as %2C; a malformed escape stays raw
  const out = [];
  for (const item of list.split(",")) {
    const a = parseVerseAnchor(item.startsWith("v") ? item : /^\d/.test(item) ? `v${item}` : item);
    if (!a) continue;
    const anchor = verseAnchor(a.reading == null ? primaryReading : a.reading, a.chapter, a.verse);
    if (!out.includes(anchor)) out.push(anchor);
  }
  return out;
}
