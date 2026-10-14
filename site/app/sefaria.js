// Sefaria's open APIs, called from the browser (CORS open, no key). Pure helpers first, so they
// are testable in node; the two fetchers take an injectable fetch.
const SEFARIA = "https://www.sefaria.org";

export function wordForms(word, L) {
  return { vocal: L.hebrewKey(word).normalize("NFC"), consonants: L.stripMarks(word) };
}

export const joinText = t => Array.isArray(t) ? t.flat(Infinity).map(s => `<p>${s}</p>`).join("") : `<p>${t == null ? "" : t}</p>`;

export function parseText(json) {
  if (!json || json.error) throw new Error((json && json.error) || "empty answer");
  const pick = lang => { const v = (json.versions || []).find(v => v.language === lang); return v ? { html: joinText(v.text), versionTitle: v.versionTitle || "" } : null; };
  return { ref: json.ref || "", heRef: json.heRef || "", he: pick("he"), en: pick("en") };
}

export async function fetchText(ref, fetchImpl = fetch) {
  const res = await fetchImpl(`${SEFARIA}/api/v3/texts/${encodeURIComponent(ref)}?version=primary&version=translation`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return parseText(await res.json());
}

// The lexicon answer, sorted for the panel: BDB Augmented Strong (short glosses) leads, the full BDB
// article folds, anything else is shown in full. Any headword counts toward the root; an entry is
// shown only when it names both its headword and its lexicon (content may be missing: kept with what it has).
export function pickEntries(json) {
  const list = Array.isArray(json) ? json.filter(x => x && typeof x === "object") : [];
  const entry = x => ({ headword: x.headword || "", lexicon: x.parent_lexicon || "", morphology: (x.content && x.content.morphology) || "", senses: (x.content && Array.isArray(x.content.senses)) ? x.content.senses : [] });
  const roots = [...new Set(list.map(x => x.headword).filter(Boolean))];
  const shown = list.filter(x => x.headword && x.parent_lexicon);
  const short = shown.filter(x => x.parent_lexicon === "BDB Augmented Strong").map(entry);
  const full = shown.filter(x => x.parent_lexicon !== "BDB Augmented Strong").map(entry);
  return { roots, short, full };
}

export async function lookupWord(word, ref, L, fetchImpl = fetch) {
  const { vocal, consonants } = wordForms(word, L);
  const ask = async form => {
    const res = await fetchImpl(`${SEFARIA}/api/words/${encodeURIComponent(form)}?lookup_ref=${encodeURIComponent(ref)}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  };
  let json = await ask(vocal);
  if (!Array.isArray(json) || !json.length) json = await ask(consonants);
  return { word, vocal, consonants, ...pickEntries(json) };
}
