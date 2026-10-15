# Word tools and translation switching: research for haftarah 2.0

Date 2026-10-15. Items marked VERIFIED were a live call or a downloaded file today. Items marked UNVERIFIED are from memory or search snippets only.

## 0. Bottom line

1. Best morphology source: STEPBible TAHOT (CC BY 4.0), with OSHB morphhb (CC BY 4.0) as the licence-clean fallback. Both can be precomputed at publish time into one small per-haftarah JSON (about 35 KB raw, 8.5 KB gzipped for Isaiah 42:5-43:10, 382 words, with minimal fields).
2. In-reading concordance and frequency need no network at read time. Whole-Tanakh counts come from the same files, computed once.
3. Translation switching is cheap and legal for the public-domain and CC versions. Sefaria's v3 API serves them live with open CORS and no key.
4. "Everything on this verse" is one call (`/api/related/<ref>`, about 70 KB for a prophetic verse), easy to group by category and load lazily.
5. Sefaria's words API gives no binyan, person or tense. Morphology has to come from TAHOT or OSHB.

## 1. Morphology sources

### Verified: what Sefaria's words API returns
Call: `GET https://www.sefaria.org/api/words/וַיֹּאמֶר?lookup_ref=Genesis 1:3`

- Returns 2 entries: "BDB Augmented Strong" and "BDB Dictionary".
- The Strong entry has `content.morphology: "v"` (part of speech only), short senses, `strong_number: 559`, `transliteration`, `pronunciation`.
- BDB senses sometimes tag `grammar.verbal_stem` ("Qal", "Niphal"). That describes the dictionary sense, not this occurrence.
- The BDB Dictionary entry has `root`, `occurrences` (53 for בָּרָא), `GK` and `TWOT` numbers, `prev_hw`, `next_hw`, `quotes`.
- Vocalized forms return BDB only. The bare consonants (e.g. הלך) also return Jastrow, Klein and Ben Yehuda.
- Prefixed forms mostly resolve: וְנוֹטֵיהֶם gives נָטָה; לַהֹלְכִים gives הָלַךְ.
- Ambiguous forms return several homographs (הָאֵל returned 4 Strong entries and 4 BDB).
- `lookup_ref` only seems to affect ordering. It adds no morphology.
- CORS: `access-control-allow-origin: *` on `/api/words`, `/api/v3/texts`, `/api/related`. No key. Sefaria's docs say not to scrape the API for a database copy and point to its GitHub dump.

Conclusion: keep the BDB popup for senses and root. It cannot say "Qal, 3rd masc. sing., perfect".

### Candidates

| Source | Content | Licence | Verdict |
|---|---|---|---|
| STEPBible TAHOT, github.com/STEPBible/STEPBible-Data | Per word: ref, L/Q/K type, pointed Hebrew with `/` between prefix, stem and suffix, transliteration, English gloss per morpheme, disambiguated Strong (H1254A), OSHB-style morph code, extended tag with lexical form and gloss, K/Q variant note | CC BY 4.0. File header: "Data created by www.STEPBible.org based on work at Tyndale House Cambridge (CC BY 4.0)". It asks that others not redistribute it themselves and that changes be noted. | Best. VERIFIED: downloaded the Isa-Mal file (18 MB, 75,051 word rows). Four files: Gen-Deu, Jos-Est, Isa-Mal, Job-Sng (about 70 MB total). |
| STEP TBESH lexicon (same repo, `Lexicons/`) | Short gloss and full definition per extended Strong | CC BY | VERIFIED present (3.3 MB). A gloss per lemma without calling Sefaria. |
| OSHB morphhb, github.com/openscriptures/morphhb, `wlc/*.xml` | WLC text; per word `lemma` (Strong plus letter), `morph` (`HVqp3ms`, `HC/Vqrmsc/Sp3mp`), `id`; maqaf and paseq as `<seg>` | Lemma and morph CC BY 4.0; text public domain (VERIFIED from README and LICENSE.md) | Clean fallback. VERIFIED: Isa.xml 1.5 MB, full morphology since 2018. No glosses. |
| ETCBC BHSA | Richest linguistic features | CC BY-NC 4.0 (VERIFIED on its GitHub page) | Avoid. TAHOT says its morphology is "from ETCBC" yet STEP publishes it as CC BY. See question 1. |
| Westminster Hebrew Morphology | Original WTS database | Restricted (UNVERIFIED, from memory) | Do not use. |

### Code decoding (VERIFIED against hb.openscriptures.org/parsing/HebrewMorphologyCodes.html)
- Leading H or A (Hebrew or Aramaic), then segments separated by `/`: prefix, stem, suffix.
- Parts of speech: A adjective, C conjunction, D adverb, N noun, P pronoun, R preposition, S suffix, T particle, V verb.
- Hebrew stems: q Qal, N Niphal, p Piel, h Hiphil, t Hithpael (others for Pual, Hophal).
- Verb forms: p perfect, q sequential perfect (weqatal), i imperfect, w sequential imperfect (wayyiqtol), h cohortative, j jussive, v imperative, r active participle, s passive participle, a infinitive absolute, c infinitive construct.
- Person 1/2/3; gender b/c/f/m; number s/p/d; state a absolute, c construct, d determined.
- Example, VERIFIED in TAHOT: Isa 42:5 וְ/נ֣וֹטֵי/הֶ֔ם is `HC/Vqrmsc/Sp3mp`: "and" / Qal active participle, masc. sing., construct (stretched out) / "their". Lemma H5186. TAHOT gloss: "and/ [who] stretched out/ them".

### Recommended pipeline (precompute at publish)
1. One-time, cached outside the repo (e.g. `~/.haftarah-cache/`): download the four TAHOT files and TBESH.
2. A new `scripts/words.mjs`, called from `publish.mjs`:
   - Read the week's `sheet.json` verses (Sefaria's Hebrew, Miqra according to the Masorah).
   - Take the matching TAHOT rows. Use the Qere (type Q) as the reading; keep the Ketiv in a `k` field.
   - Align TAHOT words to the sheet's `.w` tokens (rules below).
   - Decode each morph code into a lay record (section 5) and attach lemma, gloss, in-reading count and whole-Tanakh count.
   - Write `weeks/<slug>/words.json` to Blob next to `sheet.json`. The page fetches it on the first word tap, not at load.
3. Per word, something like: `{ v, i, h:"וְנוֹטֵיהֶם", seg:[{t:"ו",k:"conj"},{t:"נוֹטֵי",k:"v",stem:"qal",form:"ptc-act",g:"m",n:"s",st:"c",gl:"stretch out"},{t:"הֶם",k:"suf",p:3,g:"m",n:"p"}], lem:"H5186", here:3, all:208 }`. Store the fields; let the page compose the sentence.
4. Frequency table: compute once from all four files as lemma to {total, per book}. Ship only the lemmas that appear in the week (a few KB).

Size, VERIFIED: Isa 42:5-43:10 is 382 words. With minimal fields (index, Hebrew, gloss, morph, lemma) it came to 35,445 bytes, 8,540 gzipped. Full segment records will be perhaps 2 to 3 times that, still under 100 KB per week.

### Mapping to Sefaria's word tokens (VERIFIED by experiment)
I compared consonant skeletons of Miqra according to the Masorah (v3 API) with OSHB for 46 verses (Isa 42:5-16, 1 Sam 20:18-42, Hos 14:2-10; 650 words).
- 44 of 46 verses aligned one to one after (a) removing the `{ס}` and `{פ}` paragraph markers that MAM puts in the text, (b) splitting on maqaf U+05BE and paseq U+05C0, and (c) dropping vowels and accents.
- Two failures:
  - 1 Sam 20:38: ketiv and qere order differs (MAM החצים then החצי; WLC the reverse).
  - 1 Sam 20:27: MAM has no space around a paseq (דוד׀ויאמר).
- Rule: align per verse by LCS on consonant skeletons. A word that does not align is published with no morphology and logged. Never guess.
- TAHOT, like the site, treats the maqaf as punctuation attached to the word before it (`כֹּֽה\־`). It follows the Qere; when MAM differs, show the Qere record with a "written as" note from the K field.
- STEP numbers verses by English versification, with Hebrew numbers in brackets in the ref field. Publish must fail loudly if a verse comes back empty (watch Isa 64:1, 1 Sam 21:1 style cases).

## 2. Concordance and frequency

- In this haftarah: once words.json has lemmas, "this word appears N times here" is a group-by. List each occurrence with verse number and gloss; tap jumps to the verse. No network.
- Whole Tanakh: from the TAHOT frequency table. VERIFIED samples, counted in the Isaiah-to-Malachi file only: H1254A (create) 19, H0559 (say) 881, H5414G (give) 216, H3068G (YHWH) 1,323. For comparison, BDB via Sefaria says 53 for בָּרָא, and Bible Hub says 55 occurrences of Strong's 1254. Counts differ by method, so label ours "in the Hebrew Bible, by dictionary word".
- Link-out targets:
  - Bible Hub, VERIFIED: `https://biblehub.com/hebrew/strongs_1254.htm` lists occurrences; entry pages look like `https://biblehub.com/hebrew/1254a.htm`; interlinear per verse is `https://biblehub.com/interlinear/<book>/<ch>-<v>.htm`. Christian-oriented, with ads.
  - STEPBible: `https://www.stepbible.org/?q=version=OSHB|strong=H1254A&options=VNHUG`. The fetch returned a results page for ba.ra with 45 verses, but the page did not show the Strong number itself. The documented syntax is `q=version=X|strong=Hnnnn` (stepweb.atlassian.net, "Integration via the URL"). UNVERIFIED that OSHB is accepted as a version id; open it in a real browser before shipping.
  - Sefaria: full-text search only, not lemma search (`https://www.sefaria.org/search?q=<hebrew>&tab=text`). Usable as "this form on Sefaria"; it does not group by root.
  - AlHaTorah: has a concordance with root and form modes (UNVERIFIED, from a search snippet). I found no documented deep link. Skip.
- Recommendation: link out to STEP first (lemma-accurate) and Bible Hub second. Do not build a whole-Tanakh verse list in v2.

## 3. Translation switching

### English versions on Sefaria (VERIFIED from `/api/texts/versions/<book>`)

| Version title (exact, for the API) | Licence | Where | Cache in Blob? |
|---|---|---|---|
| THE JPS TANAKH: Gender-Sensitive Edition (the current default) | CC-BY-NC | Whole Tanakh | Already cached inside sheet.json |
| Tanakh: The Holy Scriptures, published by JPS (1985) | CC-BY-NC | Whole Tanakh | Yes (non-commercial, attributed) |
| The Holy Scriptures: A New Translation (JPS 1917) | Public Domain | Whole Tanakh | Yes. Archaic English ("thou") |
| The Koren Jerusalem Bible | CC-BY-NC | Whole Tanakh | Yes (non-commercial) |
| Rabbi Mike Feuer, Jerusalem Anthology | CC-BY | Isaiah and Hosea checked; same wording as 1917 | Yes, but duplicates 1917 |
| Sefaria Community Translation | CC0 | Patchy: returned nothing at Isaiah 42:5 | Yes where present |
| The Metsudah Tanach series, Lakewood, N.J | CC-BY | In 1 Samuel (VERIFIED at 20:18); NOT listed for Isaiah or Hosea | Yes where present |
| The Early Prophets, by Everett Fox (Schocken, 2014) | "Copyright: Schocken" | Joshua to Kings | No |
| The Five Books of Moses, by Everett Fox (1995) | "Copyright: Schocken" | Torah | No |
| Torah only: The Contemporary Torah (JPS 2006, CC-BY-NC), Metsudah Chumash (CC-BY), Rashi chumash (Silverstein, CC-BY), Jewish English Torah (CC-BY-SA), Modernized Tanakh (CC-BY), Kehot Chumash (copyright) | mixed | Torah | Only the CC ones |

- Robert Alter is not on Sefaria (absent from every version list I pulled).
- Foreign-language versions are listed with language "en" and titles that often end in `[fr]`, `[de]` and so on, but some do not (the German Bernfeld, Zunz and Polish ones). Use a whitelist of titles, not a filter.
- Hebrew alternates (VERIFIED): Miqra according to the Masorah (CC-BY-SA, the site's text), Tanach with Ta'amei Hamikra, with Nikkud, and Text Only (all public domain).
- Availability varies by book and by verse, so build the picker from what the week's book actually has.

### API pattern (VERIFIED)
- Works: `GET /api/v3/texts/<ref>?version=english|<exact versionTitle>`. The language part is the word `english`.
- Does not work: `en|<title>`. It returns an empty versions list with warning 101, "We do not have version named...".
- Repeat `version=` for several; `version=english|all` returns every English version that has that verse (5 at Isaiah 54:1, 4 at Isaiah 42:5).
- Ranges work in one call (the existing `fetchText` already sends ranges).
- Each version in the reply has `versionTitle`, `license`, `language`, `text`. Text is HTML (`<small>`, `<br>`, poetry spans), so reuse `clean()` from panel.js.
- JPS 1985 live without a key: yes. VERIFIED: it returned Isaiah 42:5 as CC-BY-NC.
- Fox is also returned by the API (VERIFIED), even though it is copyrighted. That is Sefaria's arrangement, not ours.

### Cache or live
- Cache at publish (a `translations.json` per week, about 40 to 80 KB per version): public-domain and CC versions. The reader gets an instant, offline-safe switch, and licence and title travel with the text for the credit line.
- Live in the browser: nothing, in v2. Fox is the only candidate and I would not offer it; link to Sefaria instead.
- Sefaria's developer docs (from search): CC BY needs attribution to the publisher; an NC clause bars commercial use. CRC's free, non-profit site fits, as it already does for JPS 2023.
- Design risk, the main one: the sheet's footnote letters, glosses and English highlighting are keyed to JPS Gender-Sensitive. Under another translation they point at words that may not exist. Either hide them or label them as belonging to JPS 2023 (question 2).

## 4. "Everything on this verse"

### VERIFIED API behaviour
- `GET https://www.sefaria.org/api/related/Isaiah 42:5` returns `{links, sheets, notes, topics, manuscripts, media, guides}`: 133 links, 65 sheets, 3 topics, 1 manuscript. About 70 KB. `GET /api/links/<ref>?with_text=0` returns the same links (73 KB).
- Link fields: `index_title`, `category`, `type`, `ref`, `anchorRef`, `sourceHasEn`, `sourceHeRef`, `collectiveTitle {en,he}`, `compDate`, `commentaryNum`. No text.
- Categories at Isaiah 42:5: Commentary 35, Quoting Commentary 28, Midrash 18, Reference 17, Jewish Thought 12, Kabbalah 7, Chasidut 5, Talmud 4, Essay 2, Musar 2, Targum 1, Second Temple 1, Halakhah 1.
- Other verses: Isaiah 54:1 has 148 links (Commentary 43, Quoting Commentary 26, Reference 24, Chasidut 21, Midrash 15). 1 Sam 20:18 has 65. Hosea 14:2 has 259 (Quoting Commentary 61, Chasidut 54, Midrash 33, Musar 30, Jewish Thought 23). Ezekiel 37:1 has 106. Expect 60 to 260 per verse across 10 to 15 categories.
- Topics carry en and he titles and descriptions (e.g. "Mashiach", with a paragraph): cheap context chips.
- Sheets are other people's source sheets (55 to 110 per verse). Unvetted, so off by default; link to Sefaria.

### UI pattern (Sefaria's related-texts sidebar)
- One `related` call when the second tap happens. Group by `category`. Suggested order: Commentary, Targum, Midrash, Talmud, Halakhah, Kabbalah, Chasidut, Jewish Thought, Musar, Second Temple, Reference, Essay, then Quoting Commentary last.
- Group headers show counts and start collapsed. Inside Commentary, group by `collectiveTitle` (Rashi, Radak, ...) and mark the ones the curated sheet already used.
- Tapping an item fetches only that item, using the existing `fetchText(ref)`. Never fetch a whole group.
- Hide `sourceHasEn: false` behind a "Hebrew only" toggle.
- Make the panel visibly not the sheet: different background, a banner "From Sefaria, not edited by CRC", no register colour marks. That is Daniel's answer 9.
- Nothing to precompute and nothing to cache in Blob (volume, mixed licences).

## 5. UI references and lay labels

UNVERIFIED (from memory; look at the live sites before copying):
- STEP Bible's word popup: lemma, transliteration, short gloss, then a line like "Verb, Qal, perfect, 3rd masculine singular", the Strong number, and a "search this word" action.
- Bible Hub interlinear: columns for Hebrew, transliteration, English, and a Parse column ("Verb - Qal - Participle active - masculine singular construct").
- Sefaria's word popup: dictionary entries only (VERIFIED above).
- The usual pattern: raw codes are hidden or tucked in a tooltip.

Suggested labels for a lay reader (a plain sentence, then a detail line):
- Sentence: "A verb, past tense: 'he said'. Root אמר, 'say'." Detail, collapsed: "Qal · perfect · 3rd masc. sing."
- Stems with a hint: Qal "simple action", Niphal "passive or reflexive", Piel "intensive", Hiphil "causing", Hithpael "reflexive".
- Verb forms: perfect "completed (usually past)", imperfect "ongoing or future", wayyiqtol "narrative past (vav-consecutive)", weqatal "sequential", participle "-ing, one who ...", infinitive construct "to ...". Say "usually", never "always".
- Prefix chips: ו "and", ה "the", ב "in", ל "to", מ "from", כ "like", ש "that". Suffix chips: "his", "her", "their", ... TAHOT's morpheme split yields this breakdown for free.
- Hide raw codes like HVqp3ms in the normal view; offer "show code".
- Divine name: render as the site does (יי) and strip TAHOT's "Yahweh" and "LORD" glosses before display.

## 6. Ranked feature list

| Rank | Feature | Source | Effort | Risk |
|---|---|---|---|---|
| 1 | Lay-readable parse line plus prefix and suffix breakdown in the word panel | words.json from TAHOT | About 4 to 6 days first time (downloader, aligner, decoder, tests); small afterwards | Alignment gaps (2 of 46 verses in my sample); licence of ETCBC-derived morphology |
| 2 | "This root in this reading", with gloss and jump-to-verse | words.json | 1 to 2 days after #1 | Low. Lemma letters (A, B, C) separate homographs |
| 3 | Frequency line plus link-out to STEP and Bible Hub | words.json and the frequency table | About 1 day | Counts differ from BDB (53) and Bible Hub (55); label them |
| 4 | Translation picker (JPS 2023, JPS 1985, JPS 1917, Koren, Metsudah where present) | Sefaria v3, cached at publish | 3 to 4 days | Footnote keys and highlights break; availability varies by book |
| 5 | "Everything Sefaria has on this verse", behind a second tap | `/api/related` live | 3 to 4 days | 60 to 260 items per verse; unvetted content shown from our domain |
| 6 | TBESH gloss beside the BDB entry | TBESH | About 1 day | Duplicates BDB; low value |
| 7 | Ketiv and qere note | TAHOT K field | About 1 day | Rare (480 Qere rows in Isaiah to Malachi) |

Build #1 to #3 together (same data). #4 and #5 are independent and can run in parallel. Effort figures are my estimates, not measured.

## 7. Risks

- STEP asks that others not redistribute its data. We would publish a trimmed, derived JSON. CC BY allows that with attribution and a note of changes. Emailing STEP is cheap (address in the file header).
- TAHOT's morphology comes from ETCBC (BHSA is CC BY-NC) but STEP states CC BY. For zero doubt, OSHB morphology is the independent CC BY source.
- OSHB and TAHOT follow the Leningrad Codex; the site's Hebrew is MAM. Spelling differences are handled by consonant alignment, true textual variants are not.
- Sefaria's API is under-documented (the `en|` versus `english|` trap). Wrap every call and fall back to "Open on Sefaria". Live calls depend on Sefaria staying open: CORS `*` today, no key, no published rate limit found.
- Attribution: add STEP Bible (Tyndale House), Open Scriptures Hebrew Bible, and each translation's title and licence to the page footer and the README sources section.

## 8. Questions only Daniel can answer

1. Is morphology from STEP TAHOT acceptable (CC BY, derived from ETCBC's NC-licensed work), or should we use OSHB only and give up its glosses?
2. When a reader switches translation, should footnote letters and glosses (written for JPS 2023) disappear, or stay with a note "refers to JPS 2023"?
3. Which versions go in the picker: all licensed ones including archaic JPS 1917, or a short list (JPS 2023, JPS 1985, Koren, plus Metsudah when present)? Is Fox offered at all, given it is copyrighted?
4. Should "everything on this verse" include Sefaria's user sheets and Quoting Commentary (which covers Chasidut and Musar of any stripe), or only the textual categories?
5. May the word panel use Hebrew grammar terms (Qal, Hiphil, wayyiqtol), or only plain English ("causing someone to", "narrative past")?
