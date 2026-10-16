// api/_lib/texts.mjs — texts.json as a flat list a client can page through: every commentary segment, then
// every linked text, each with its source, kind and verse; filters by source, kind, chapter and verse; a
// cursor is the index of the next item, so pages never overlap and never skip.
const KIND = c => (c.kind || c.category || "").toLowerCase();
const verseNo = ref => { const m = /(\d+):(\d+)$/.exec(ref || ""); return m ? { chapter: +m[1], verse: +m[2] } : null; };
export function flattenTexts(texts) {
  const out = [];
  for (const [source, c] of Object.entries(texts.commentaries || {})) for (const [ref, seg] of Object.entries(c.segments || {})) out.push({ ref, source, kind: "commentary", verse: seg.verse || null, ...(seg.sectionFiled ? { sectionFiled: true } : {}), he: seg.he, ...(seg.en ? { en: seg.en } : {}) });
  for (const [ref, l] of Object.entries(texts.linked || {})) out.push({ ref, source: l.source || "", kind: KIND(l), anchors: l.anchors || [], he: l.he, ...(l.en ? { en: l.en } : {}) });
  return out;
}
/** What one item adds to the page as the transport prints it (indent 1): the item sits two levels deep
 * ({ "items": [ item ] }), so each of its lines gains two spaces, plus the comma and newline after it. */
const prettySize = item => { const s = JSON.stringify(item, null, 1); return s.length + 2 * (s.split("\n").length) + 2; };
const PAGE_OVERHEAD = 80;   // { "items": [ ], "cursor": "…", "total": … } around the items
export function sliceTexts(texts, { source = null, kind = null, chapter = null, verse = null } = {}, cursor = null, cap = 120_000) {
  const hits = v => { const n = verseNo(v); return n && (chapter == null || n.chapter === chapter) && (verse == null || n.verse === verse); };
  const items = flattenTexts(texts).filter(i => (!source || (i.source || "").toLowerCase().includes(source.toLowerCase())) && (!kind || i.kind === kind.toLowerCase()) && (chapter == null && verse == null || (i.verse ? hits(i.verse) : (i.anchors || []).some(hits))));
  const start = Math.min(items.length, Math.max(0, Math.floor(Number(cursor)) || 0));
  let size = PAGE_OVERHEAD, end = start;
  while (end < items.length) { const n = prettySize(items[end]); if (end > start && size + n > cap) break; size += n; end++; }
  return { items: items.slice(start, end), cursor: end < items.length ? String(end) : null, total: items.length };
}
