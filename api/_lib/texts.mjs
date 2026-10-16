// api/_lib/texts.mjs — texts.json as a flat list a client can page through: every commentary segment, then
// every linked text, each with its source, kind and verse; filters by source, kind, chapter and verse; a
// cursor is the index of the next item, so pages never overlap and never skip.
const KIND = c => (c.kind || c.category || "").toLowerCase();
const verseNo = ref => { const m = /(\d+):(\d+)$/.exec(ref || ""); return m ? { chapter: +m[1], verse: +m[2] } : null; };
export function flattenTexts(texts) {
  const out = [];
  for (const [source, c] of Object.entries(texts.commentaries || {})) for (const [ref, seg] of Object.entries(c.segments || {})) out.push({ ref, source, kind: "commentary", verse: seg.verse || null, ...(seg.sectionFiled ? { sectionFiled: true } : {}), he: seg.he, ...(seg.en ? { en: seg.en } : {}) });
  for (const [ref, l] of Object.entries(texts.linked || {})) out.push({ ref, source: l.source, kind: KIND(l), anchors: l.anchors || [], he: l.he, ...(l.en ? { en: l.en } : {}) });
  return out;
}
export function sliceTexts(texts, { source = null, kind = null, chapter = null, verse = null } = {}, cursor = null, cap = 120_000) {
  const hits = v => { const n = verseNo(v); return n && (chapter == null || n.chapter === chapter) && (verse == null || n.verse === verse); };
  const items = flattenTexts(texts).filter(i => (!source || i.source.toLowerCase().includes(source.toLowerCase())) && (!kind || i.kind === kind.toLowerCase()) && (chapter == null && verse == null || (i.verse ? hits(i.verse) : (i.anchors || []).some(hits))));
  let start = Number(cursor) || 0, size = 2, end = start;
  while (end < items.length) { const n = JSON.stringify(items[end]).length + 1; if (end > start && size + n > cap) break; size += n; end++; }
  return { items: items.slice(start, end), cursor: end < items.length ? String(end) : null, total: items.length };
}
