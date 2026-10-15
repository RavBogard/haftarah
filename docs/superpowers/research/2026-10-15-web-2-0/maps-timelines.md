# Map and timeline for the historical setting: research

Read: DESIGN.md, README schema, bibliography/ (Isaiah.md, README), PRODUCT.md (partial), render.js setting code. Date 2026-10-15.
"Verified" = I fetched the page or file this session. "Unverified" = recalled or from a search snippet only.

## 1. Base data and licenses

| Source | License (verified) | Gives | Verdict |
|---|---|---|---|
| Natural Earth | Public domain; "Crediting the authors is unnecessary" (naturalearthdata.com/about/terms-of-use) | 10m coastline, rivers + lake centerlines, lakes. GeoJSON in nvkelso/natural-earth-vector/geojson (HTTP 200: coastline 10.1 MB, rivers 7.3 MB). Modern coast; no Middle East river supplement | USE for coast, Nile, Euphrates, Tigris, Jordan, Dead Sea, Sea of Galilee. No attribution burden |
| OpenBible.info Bible Geocoding Data (github.com/openbibleinfo/Bible-Geocoding-Data; data/ancient.jsonl 11.5 MB, modern.jsonl 3.2 MB) | CC BY 4.0 for the data; OSM-derived geometry is ODbL; images vary. Credit "OpenBible.info" required | 1,342 ancient places, each with lonlat, lonlat_type, vote-based confidence (vote_total >= 500 = high; time_values by decade), verse list, name variants | USE for the gazetteer. One credit line is the only burden. Do not ship the OSM geometry or images |
| STEPBible TIPNR | Repo under CC BY 4.0; credit "STEP Bible" with link; geolocation "based on OpenBible" | Name disambiguation across books | Optional name-matching aid only |
| Pleiades | "cc-by" (version not stated on the page I fetched; the terms-of-use URL 404'd) | Greek/Roman-era gazetteer, weak on Iron Age Israel | SKIP |
| AWMC geodata (github.com/AWMC/geodata) | ODbL-1.0 (verified on repo page); from Barrington Atlas + OSM | Ancient coasts, rivers, roads; Roman-era focus | SKIP: share-alike and Roman bias. The CC BY-NC guess is wrong; the AWMC site page states no license |
| Bible Mapper | Third-party blogs say maps made with it carry no copyright restriction; software needs a $37 key (vendor text unverified) | Hand-made period maps | SKIP: manual |
| Wikimedia Commons SVG maps | Mixed CC BY-SA / CC BY / PD per file (not individually checked) | Finished maps | SKIP: share-alike, fixed content, cannot be generated |
| Digital Atlas of the Roman Empire | Not checked | Roman period | Irrelevant: haftarot are 1000-400 BCE |

OpenBible coverage test: Jerusalem, Nob, Shiloh, Nineveh, Tyre, Damascus, Megiddo, Susa, Hebron resolve to a point. Gibeah, Babylon, Samaria, Hazor, Gilgal missed an exact friendly_id lookup (they are keyed by disambiguated names; match on name variants or url_slug). Ezel has no coordinate. Nob has 7 candidate sites. So the build must report "no coordinate" or "multiple candidates" and never guess.

Best combination: Natural Earth (physical) plus OpenBible (places). Both are clean for print and public web. Natural Earth coastlines are modern; at region scale that is invisible.

## 2. Technique

Static SVG maps generated from data are routine (Natural Earth plus d3-geo is the standard recipe); the projection is small enough to hand-write, so no library.

1. One-time extractor `tools/make-geodata.mjs` (output committed): reads the Natural Earth GeoJSONs and OpenBible ancient.jsonl, clips to roughly lon 8-60E, lat 12-42N, simplifies lines (Douglas-Peucker), writes `data/geo/basemap.json` (target under 150 KB) and `data/geo/gazetteer.json` (about 250 KB; names, aliases, lon/lat, score, verses). Record source commit hashes.
2. `lib/map.mjs` (about 150-200 lines): equirectangular with cos(lat0) x-scale fit to a region box; emits an `<svg viewBox>` string. Layers: land tint, coast, rivers, Dead Sea and Galilee, place dots, labels with greedy collision nudging, scale bar.
3. Same string used in the PDF template (about 2.6 in wide) and on the web (`width:100%`, `role="img"`, `<title>` and `<desc>` listing places). Labels use the sheet's self-hosted fonts.
4. Colors from DESIGN.md: land a light tint of ink-2, water a light lapis tint of #1d4f9c, rivers lapis, the reading's own places rubric #8a0a14, context places ink-2, empire labels ochre #8a5a00. Must survive black-and-white print: use dot shape and label weight, not color alone.
5. No ancient borders. Reconstructed borders are editorial and not license-clean data; label kingdoms and empires as text at an anchor place.

Two canned extents chosen from the places' bounding box: "land" (Dan to Beersheba) and "near-east" (Egypt to Babylon); `region` overrides.

## 3. Timeline

A horizontal SVG band from `lib/timeline.mjs`, span data-driven (padded, snapped to centuries) because 1000-400 BCE is too coarse for most weeks. Lanes: kings (Israel/Judah), empires, prophet and book, composition layers (ochre bars, dashed ends for uncertainty), events of the reading (rubric diamonds).

Chronology: dates must come from a closed reference table `data/chronology.json`, like the bibliography, not drafted weekly. Recommendation: rounded "c." dates for anything before 722 BCE; print without "c." only the consensus Assyrian/Babylonian anchors (Qarqar 853, Samaria 722/721, Sennacherib 701, Jerusalem 587/586, Cyrus 539). The Divided Monarchy dates differ by years between schools (search results: Thiele puts the division at 931/930; Galil accepts most of Thiele's postulates but rejects one; Kitchen's are described by a critic as consistently a year off for late Judah). I did not verify per-king values. Recommended basis for a Reform classroom: Galil (1996) and the Jewish Study Bible (2014), rounded; Thiele noted as the alternative. Verify both works in a publisher catalogue before adding them to the bibliography (bibliography/README rule). The Jewish Virtual Library kings page and Wikipedia "Kings of Judah" show Albright/Thiele/Galil/Kitchen columns and are useful for Claude's cross-check, not for citing.

Page placement: page 1 is already full (mural, incipit, reading line, opening note, legend, voices, provenance). Layout idea: setting paragraphs in the left 60% with the map at right (2.6 in), timeline full width (about 6.9 x 1.1 in) beneath. It only fits if `setting` is held to about two short paragraphs. Add the figures as a measured block; check.mjs fails on page-1 overflow. Fall-back: figures at the top of page 2 above the text. Build a comp from the 2026-10-10 sheets before deciding.

## 4. Visual references (from knowledge; not verified this session)

- The Jewish Study Bible, 2nd ed. (OUP 2014): maps in a back section (search snippets: about 14 pages, Oxford cartography; the first edition had 9). No in-line timeline confirmed.
- New Oxford Annotated Bible: timeline, chronological table of rulers, color maps at back (search snippet).
- NJPS-only and Koren editions: no verifiable map content found.
- Common traits: one region per map, 15-25 labels, one blue for sea and rivers, light or no relief, only the places the text names, scale bar, countries in capitals, water in italics; timelines show overlapping ranges with uncertainty.
Daniel should look at his own JSB or Oxford Bible Atlas for taste; I could not view them.

## 5. Data model (sheet.json, schema 2 addition, all optional)

```jsonc
"setting": {                       // absent = no figures
  "region": "land | near-east | [lonMin, latMin, lonMax, latMax]",   // default: auto from places
  "places": [
    { "key": "Gibeah", "name": "Gibeah", "he": "גבעה", "role": "scene | context | empire",
      "lat": 31.8, "lon": 35.25,   // normally filled by the build from the gazetteer; present = override, needs "approved": true
      "label": "r | l | t | b" }   // optional label side
  ],
  "timeline": {
    "from": -1100, "to": -300,     // BCE negative; default from items
    "items": [
      { "label": "David", "kind": "king | empire | prophet | composition | event",
        "ref": "chronology:david",            // dates come from data/chronology.json
        "start": -1010, "end": -970, "approx": true }   // only for event/composition items, with "works" keys from the bibliography
    ]
  }
}
```

Build gates (like the citation gate): every place resolves in the gazetteer with score >= 500 or carries an approved override; every king/empire/prophet item cites a chronology key; composition items name `works`; refuse and name the item on failure. Lint warnings: more than about 12 labels, map extent much larger than the places' spread.

Weekly run: Claude reads openingNote.setting and the critical entries, lists the places and periods named; `node scripts/geo.mjs lookup "Gibeah" "Ezel"` prints candidates with score and flags no-coordinate or multiple candidates; Claude fills `setting`; the delivery line lists each place with its confidence and each timeline item with its source. Daniel approves by printing, as now. Under the standing-authority rule this is a logged decision unless a place has no coordinate or a low score.

## Recommended approach

- Same two pure functions render print and web. No runtime library, tiles or images.
- Commit reduced data: basemap.json, gazetteer.json, chronology.json.
- Credit line in colophon and web footer: "Map: Natural Earth (public domain) and OpenBible.info Bible Geocoding Data (CC BY 4.0). Chronology after Galil (1996) and The Jewish Study Bible (2014)."
- Tests: node --test SVG snapshots for two fixtures; page-1 fit in check.mjs.

## Effort

About 4-6 working days: extractor and data 1, map module 1.5, timeline module 1, chronology table and bibliography verification 1, template/CSS/web/check/lint integration 1.5, comps and iteration 1. The chronology table is the real editorial work.

## Risks

- Page 1 space (largest risk).
- Chronology disputes; mitigate with "c.", ranges and a named source.
- Contested identifications (Nob 7 candidates, Ezel none); mitigate with score threshold and a per-week listing.
- Modern coastline and no borders: say so in the legend.
- Label collisions; need visual QA the first weeks.
- OpenBible name matching needs an alias layer.
- The CC BY credit is mandatory; do not bundle OSM-derived geometry (ODbL).
- Source files are large and on GitHub; commit only reduced extracts.

## Questions only Daniel can answer

1. Which chronology should students see: one standard rounded table (my recommendation: Galil / JSB with "c.") or footnoted ranges where scholars differ?
2. If page 1 cannot hold setting text, map and timeline, which gives way: shorter setting paragraphs, or figures at the top of page 2?
3. Kingdoms and empires as text labels only (recommended) or shaded territories, accepting that borders are an editorial reconstruction?
4. Hebrew place names on the map in addition to English (clutter versus the sheet's bilingual identity)?
