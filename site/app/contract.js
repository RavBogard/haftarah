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

/** The week slug in a page path, case-folded, one trailing slash allowed; null for any other path. */
export function slugFromPath(pathname) {
  const m = new RegExp(`^/(${SLUG_SOURCE})/?$`, "i").exec(pathname || "");
  return m ? m[1].toLowerCase() : null;
}

/** The rewrite source vercel.json must carry for week pages. */
export const VERCEL_WEEK_SOURCE = `/:slug(${SLUG_SOURCE})`;
