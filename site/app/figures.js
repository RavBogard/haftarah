// The map and the timeline on the week page (spec 5.8): the same SVG the printed sheet draws, from
// lib.js, with the basemap and the chronology fetched only for a week that has figures.
import { GEO_URLS } from "./contract.js";

const CREDIT_MAP = "Map: Natural Earth (public domain); places: OpenBible.info Bible Geocoding Data (CC BY 4.0).";
const CREDIT_DATES = "Dates rounded, after Galil (1996) and The Jewish Study Bible (2014).";

export function hasFigures(data) {
  return (Array.isArray(data.places) && data.places.length > 0) || (Array.isArray(data.timeline) && data.timeline.length > 0);
}

/** The footer's credit for what is on the page: the map's, the dates', both, or "". */
export function figureCredit(data) {
  const parts = [];
  if (Array.isArray(data.places) && data.places.length) parts.push(CREDIT_MAP);
  if (Array.isArray(data.timeline) && data.timeline.length) parts.push(CREDIT_DATES);
  return parts.join(" ");
}

/**
 * The week's figures as <figure> elements, or null for a figure with nothing to draw (no place inside
 * the map's box, no datable item): an empty SVG is never wrapped. A failed fetch rejects; the caller
 * shows no figure.
 */
export async function renderFigures({ data, L, fetchImpl = fetch, doc = document }) {
  const places = Array.isArray(data.places) ? data.places : [], items = Array.isArray(data.timeline) ? data.timeline : [];
  const need = { basemap: places.length > 0, chronology: items.length > 0 };
  const get = async url => { const r = await fetchImpl(url); if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`); return r.json(); };
  const [basemap, chronology] = await Promise.all([need.basemap ? get(GEO_URLS.basemap) : null, need.chronology ? get(GEO_URLS.chronology) : null]);
  const region = data.mapRegion || null;
  const text = L.figureText(places, items, chronology, region);
  const figure = (cls, svg, t) => {
    if (!t || !svg) return null;
    const f = doc.createElement("figure"); f.className = `fig ${cls}`;
    f.innerHTML = svg + `<figcaption>${L.escapeHtml(t.caption)}</figcaption>`;
    return f;
  };
  const map = places.length && text.map ? figure("fig-map", L.mapSvg(places, region, basemap, { id: "map", title: text.map.title, desc: text.map.desc }), text.map) : null;
  const timeline = items.length && text.timeline ? figure("fig-timeline", L.timelineSvg(items, chronology, { id: "timeline", title: text.timeline.title, desc: text.timeline.desc }), text.timeline) : null;
  // The footer credits what is drawn: a map with no place inside its box draws nothing and credits nothing.
  return { map, timeline, text, credit: figureCredit({ places: map ? places : [], timeline: timeline ? items : [] }) };
}
