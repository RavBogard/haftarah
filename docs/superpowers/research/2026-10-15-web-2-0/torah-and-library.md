# Torah portion + multi-year library: research for v2

Researched 2026-10-15. Read-only. API probes were live calls to Sefaria and Hebcal; no JPS text is quoted here.

## 1. Torah data: what exists and what to use

**Texts (confirmed live).** `https://www.sefaria.org/api/texts/versions/Genesis` lists 55 versions, including both pinned ones:
- `Miqra according to the Masorah`, Hebrew, CC BY-SA.
- `THE JPS TANAKH: Gender-Sensitive Edition`, English, CC-BY-NC.

The same v3 call fetch.mjs already makes (`/api/v3/texts/Genesis 6:9-11?version=hebrew|Miqra...&version=english|THE JPS...`) returned both for Torah with no code change. Expect `cleanHebrew`/`cleanEnglish` to work, but run a fixture on one Torah passage; poetry (Shirat HaYam, Haazinu, Vezot Haberakhah) will stress the poetry handling. The JPS licence is NC; fine for a free public congregational site.

**Aliyah divisions, two sources.**
- **Sefaria calendar:** `https://www.sefaria.org/api/calendars?diaspora=1&year=2026&month=10&day=17` returns "Parashat Hashavua" with `ref` (Genesis 6:9-11:32) and `extraDetails.aliyot` (8 refs: seven aliyot plus maftir, the maftir repeating the end of the 7th). Whole portion only: no special-Shabbat maftir, no triennial.
- **Hebcal leyning:** `https://www.hebcal.com/leyning?cfg=json&start=D&end=D` (docs https://www.hebcal.com/home/195/jewish-calendar-rest-api; CC BY 4.0, credit required; Israel via `i=on`). This is what fetch.mjs already calls, and the same item already holds `fullkriyah` (keys 1-7 and M, each `{k, b, e, v}` book/begin/end/verse count), `triennial` (same shape, plus `triYear`, 5787 = year 2) and `triHaftara`, `seph`/`sephardic`.

**Recommendation: Hebcal as the one source for the week's Torah calendar.** It already drives the week and is special-Shabbat aware:
- Chanukah Shabbatot (2026-12-05, 12-12) return `reason.M: "Chanukah Day N (on Shabbat)"` with a different maftir; Rosh Chodesh Shabbat (2027-01-09) too.
- Machar Chodesh (2026-10-10) is haftarah-only (`reason.haftara`).
- Festivals and fast days arrive as `type: "holiday"` items with their own `fullkriyah`, the same shape as a Shabbat.
- Keep Sefaria's `aliyot` as a cross-check (Hebcal ranges unioned == Sefaria `ref`) and as the fallback.

Hebcal does not document `triYear` and its triennial is the Conservative-style "American" cycle; name the cycle if the sheet uses it.

## 2. What Reform congregations read, and what it means here

- URJ's explainer: it is common in Reform congregations to read a selection of verses from the parashah, usually chosen by the spiritual leader and possibly different each year; the Movement does not suggest particular aliyot or verses: https://reformjudaism.org/learning/answers-jewish-questions/which-part-torah-portion-chanted-shabbat-each-week
- A URJ blog says even a third of most portions is often too long, so leaders pick meaningful passages: https://reformjudaism.org/blog/how-show-torah-some-love
- Triennial background: https://en.wikipedia.org/wiki/Triennial_cycle (1988 Conservative responsum, thirds of each of the 54 portions, widely adopted by Reform and Conservative congregations). One Reform congregation reportedly reads aliyah n in year n of a seven-year cycle.
- **Implication.** A full-parashah sheet is unprintable (Noach alone is 153 verses). The sheet should carry a **selection**: one or more verse ranges, with "an aliyah", "the triennial third", "the congregation's reading" and "custom" as named options. The selection is Daniel's, so it belongs in the briefing.
- **The question for Daniel:** what does CRC read on Shabbat morning, and should the sheet follow what is chanted or what the class wants to study?

## 3. Commentary volume: Torah is 5 to 7 times denser

Measured live against the Sefaria links API:

| Passage | Links | "Commentary" links | Distinct commentary works |
|---|---|---|---|
| Isaiah 54:1-55:5 (this week's haftarah) | 2,330 | 510 | 17 |
| Genesis 6:9-6:22 (aliyah 1 of Noach) | 2,603 | 968 | 67 |
| Genesis 6:9-11:32 (all of Noach) | 15,689 | 5,144 | 72 |

- One commentator on Genesis 6 alone, Hebrew plus every English version: Rashi 53 KB, Ibn Ezra 69 KB, Ramban 95 KB, Or HaChaim 118 KB, Kli Yakar 79 KB, Sforno 28 KB, Rashbam 7 KB (Rashi on Isaiah 54 is 20 KB). Seven commentators on one chapter is about 450 KB.
- `texts.json` is capped at 1.9 MB, and this week's Isaiah file is already 1.81 MB. A Torah range of several chapters would blow the cap on commentary alone. One probe (Bereshit Rabbah 30) returned a 504; fetch retries once, then silently drops, so more big calls means more silent gaps.
- Noise grows too: "Quoting Commentary" is 3,185 of 15,689 links on Noach, plus 1,277 Chasidut/Musar.

**How the pipeline should scale:**
1. **Fetch by selection, never by parashah.** `buildTexts` already loops over the chapters of the chosen verses; make the selection a required input.
2. **A Torah core list** beside `CORE_COMMENTATORS`: Rashi, Ramban, Ibn Ezra, Sforno, Rashbam, Onkelos, Or HaChaim, Kli Yakar, Chizkuni, Shadal, Steinsaltz, Bekhor Shor, Rabbeinu Bahya, Haamek Davar. `REGISTERS` already matches Ramban, Sforno, Chizkuni, Kli Yakar, Or HaChaim, Gur Aryeh and Hirsch, but not Rashbam, Bekhor Shor, Rabbeinu Bahya, Haamek Davar or Cassuto (149 links; modern/critical), which would print as "unclassified".
3. **Midrash Rabbah moves to the core** for Torah. `CLASSIC_MIDRASH` already tiers it (cap 200); fetch only the Rabbah chapter anchored to the selection, and Tanchuma/Sifra/Sifrei ahead of Yalkut and the tail.
4. **Candidates step.** candidates.json sorts by link count, which for Torah puts super-commentaries first (the top group is "Mechokekei Yehudah; Yahel Ohr", 646 links, a gloss on Rashi). Add a skip list for super-commentaries and quoting commentary, and a per-aliyah view.
5. **Digest and briefing.** One digest page per aliyah. The 500 to 700 word briefing cannot cover Torah plus haftarah; budget about 350 words per reading.
6. **Registers and template:** unchanged. Midrash and Talmud entries stay filed as classical, as now.
7. **Budget:** per-reading files (`texts-torah.json`, `texts-haftarah.json`), each about 2 MB, ordered by commentator. The file stays in Drive, not the web, so its cost is subagent context, not site weight.
8. **Cap entries per reading** (suggest 20 to 28) with a lint warning, or Torah will crowd out the haftarah.

## 4. Data model and URL design

### 4.1 One sheet.json, two readings (schema 3)

Do not fork a Torah file. Wrap what is `haftarah` today as one of a `readings` array; migrate.mjs gets a 2-to-3 step.

```jsonc
{
  "schema": 3,
  "slug": "2026-10-17-noach",
  "shabbat": { "civil": "...", "parashah": {...}, "special": null, "parashahKey": "noach", "triYear": 2 },
  "readings": [
    { "kind": "torah", "ref": "Genesis 6:9-7:16", "book": "Genesis", "selection": "aliyot 1-2",
      "aliyot": [{ "n": 1, "ref": "Genesis 6:9-6:22" }],   // the full kriyah, so the class sees where the selection sits
      "incipit": {}, "verses": [], "glosses": [], "commentary": [] },
    { "kind": "haftarah", "ref": "Isaiah 54:1-55:5", "book": "Isaiah", "incipit": {}, "defaultHaftarah": null, "verses": [], "glosses": [], "commentary": [] }
  ],
  "openingNote": {}, "glossary": [], "nextWeek": {}, "credits": {}
}
```

- Per-reading blocks, because verse numbers repeat across books and commentary keys on `verse`. `sheetModel`, key series and `lint` take one reading at a time, so the cheapest change is to loop the same code twice.
- A `readings(data)` accessor in `lib.js` turns a schema-2 file into a one-reading list, so old weeks and the published Blob copies keep rendering without migration. A Torah-less week stays valid.
- fetch: `--torah "Genesis 6:9-7:16"`, `--torah-pick aliyah:1-2|triennial|full`, `--no-torah`; always write the full Hebcal aliyot list, and take the maftir from the Hebcal week item.

### 4.2 URLs

Today the only route is `/2026-10-17-noach` (the `vercel.json` rewrite matches date-first slugs only). Keep it as the permanent canonical page, so every existing link and QR code survives; add aliases as extra rewrites onto static shells, no server code.

| URL | Meaning | Source |
|---|---|---|
| `/2026-10-17-noach` | permanent week page (unchanged) | `weeks/<slug>/sheet.json` |
| `/noach` | latest sheet for that parashah | index lookup |
| `/5787/noach` | that Hebrew year's sheet | index lookup |
| `/torah/genesis`, `/torah/genesis/noach` | library by Torah book, then parashah | index |
| `/prophets/isaiah` | library by haftarah book | index |
| `/special/shuvah` | special Shabbatot and festivals | index tags |

- Resolve aliases client-side (a `library.html` shell reads `index.json`, then `history.replaceState` to the canonical slug). The index already ships to the browser and "latest" needs it.
- Parashah keys come from `slugify` on Hebcal's name. Double parashiyot get a combined key (`vayakhel-pekudei`) plus `parashahKeys: ["vayakhel","pekudei"]`, so `/vayakhel` finds the combined week.
- Add the new patterns to `vercel.json` as an explicit allow-list; the date-first regex is the only slug guard today.
- Do not put the reading kind in the slug. `/isaiah/54` chapter URLs are a stretch goal.

### 4.3 index.json v2

Keep the v1 fields so today's landing.js keeps working during rollout; write `schema: 2` (`upsertIndex` writes 1 now).

```jsonc
{ "schema": 2, "updated": "...",
  "weeks": [{
    "slug": "2026-10-17-noach", "civil": "2026-10-17", "hebrewEn": "6 Cheshvan 5787",
    "cycle": "5787",
    "parashahKey": "noach", "parashahKeys": ["noach"], "parashah": "Noach", "parashahHe": "נֹחַ",
    "special": null, "tags": [],
    "readings": [
      { "kind": "torah", "ref": "Genesis 6:9-7:16", "book": "Genesis", "incipit": {} },
      { "kind": "haftarah", "ref": "Isaiah 54:1-55:5", "book": "Isaiah", "incipit": {}, "default": null }
    ],
    "ref": "...", "book": "...", "incipit": {},
    "pdf": "weeks/<slug>/sheet.pdf", "published": "..." }] }
```

- Ten years is well under 200 KB, so no sharding.
- Derive a `library` block at publish time: `{ "noach": { "book": "Genesis", "order": 2, "years": { "5787": "2026-10-17-noach" } } }`. Every browse view is then a pure function of one file.
- Ship a static 54-row `site/app/parashot.js` (key, English, Hebrew, book, order) so unvisited portions show as empty cells.
- publish.mjs upserts one week into the fetched index, so a one-off rebuild-from-weeks command is needed to backfill `cycle` and `parashahKey` (computable from `shabbat.parashah.en` and `series.year`) and for repair.

### 4.4 "Last year's sheet" at fetch time

RUNBOOK step 1 says to load an earlier year's record from Drive, but only if someone notices. Make it mechanical:
1. fetch.mjs computes `parashahKey`, Hebrew year and refs, then reads the public `https://haftarah.centralreform.org/data/index.json` for earlier-`cycle` weeks with the same key. No Drive access needed, which suits a cloud session.
2. It downloads `/data/weeks/<slug>/sheet.json` and writes `weeks/<slug>/prior.json`: a pointer plus a compact summary (sourceRefs used, glosses, historian works, `overlap: full|partial|none` against this year's refs). Nothing is copied into the new sheet.
3. The web copy has rejected entries stripped (`cleanSheet`), so "what Daniel turned down" lives only in the Drive working copy. Use the web copy for what printed and Drive only when rejections matter.
4. The briefing gains a "Last time" section; the drafting brief gets `prior.json` and prefers new voices unless Daniel carries one forward.
5. Match on `parashahKey` plus `kind`, because haftarot differ by year on special Shabbatot. Special weeks match by `tags` (a Shabbat Shuvah sheet looks up `shuvah`), and leap-year combined parashiyot look up either half's key.

### 4.5 Landing page and library

Four doors over one card list (no framework; extend `rowHtml` and the hero):
1. **By week** (default): newest first, two lines per row (Torah ref, haftarah ref); the hero shows both incipits.
2. **By parashah:** a 54-cell grid in Torah order in five book bands, with a dot per year held and empty cells muted. A parashah page shows all years side by side and what is new since last year.
3. **By book:** haftarah books Joshua to Malachi with chapters covered (the same haftarah recurs: Isaiah 54 serves Noach, Ki Teitzei and Re'eh), and Torah books.
4. **Special Shabbatot and festivals:** tags such as Shekalim, Zachor, Parah, HaChodesh, Shuvah, Nachamu, Chanukah, Rosh Chodesh, Machar Chodesh; `defaultHaftarah` already marks them.

Plus one client-side search box over parashah, book, incipit and ref (about 30 lines). Dark mode, text size and Sefaria panels carry over.

## 5. Print: Torah plus haftarah

Scale from the data: this Isaiah haftarah is 22 verses; Noach in full is 153 verses, with apparatus growing faster (section 3). Rough guess, not measured: a full parashah is 30-plus pages on the current template, a triennial third 8 to 12, one aliyah about the length of a haftarah.

- **A. Two PDFs per week (recommended default).** `sheet-torah.pdf` and `sheet-haftarah.pdf` from one `sheet.json` via `--reading torah|haftarah`. Each has its own front page. `render.js` and `check.mjs` already assume one reading, so this is the least layout work. Publish both under `weeks/<slug>/`.
- **B. One combined packet.** One front page, Torah, then haftarah, shared glossary and colophon. Best object, but needs a paginator section break, running heads per reading and a decision on letter-key series; a few days of work.
- **C. Torah selection on paper, full parashah on the web.** Paper stays small; the web can show every aliyah, with commentary only on the selection.

Recommended: A now, with C as the selection rule; B only if the class asks for a packet. The printed sheet keeps one template, per PRODUCT.md. The real bottleneck is Daniel's triage time, not layout.

## 6. Ranked feature list

| # | Feature | Why | Effort |
|---|---|---|---|
| 1 | Schema 3 `readings[]` plus back-compatible accessor; Torah as a second reading | the ask | M-L: fetch refactor, lib, sheetModel, build, lint |
| 2 | Index v2 fields and backfill command | unlocks the rest | S |
| 3 | Selection control (`--torah` picks) plus the briefing question | needed before any Torah sheet | S-M |
| 4 | Fetch-time last-year lookup, `prior.json`, "Last time" briefing section | the "builds on last year" ask | M |
| 5 | By-parashah grid with year dots; `/noach` and `/5787/noach` aliases | the library proper | M |
| 6 | Two PDFs per week, both published | print path | M |
| 7 | By-book and special-Shabbat views | cross-cutting browse | S-M |
| 8 | Search box | convenience | S |
| 9 | Web view of the full parashah by aliyah | read what was not printed | M-L |
| 10 | Combined single PDF | polish | L |

## 7. Risks

- **Torah triage is the real cost.** Without an entry cap per reading the sheet balloons and the haftarah gets crowded out.
- **texts.json size and flaky Sefaria calls** (section 3): per-reading files and a patient retry (3 tries, backoff).
- **Slug compatibility:** keep the date-first slug in `publish.mjs` (`SLUG`) and `vercel.json`; a second sheet in one week already uses a `-special` suffix.
- **Special Shabbatot change the Torah** (maftir on Chanukah, Rosh Chodesh, the four parshiyot; festival readings). Take the maftir from the Hebcal week item or the sheet prints the wrong one.
- **Triennial cycles differ** (Conservative-style versus Roth); name the cycle used.
- **Licence:** JPS is CC-BY-NC; revisit if the library is ever sold or sponsored. Hebcal needs CC BY 4.0 credit; check the colophon already credits it.
- **Combined parashiyot and leap years** break one-parashah-per-week lookups; `DEFAULT_HAFTAROT` already has combined keys.
- **Blob versus Drive:** `weeks/` is git-ignored and Drive is the record. Library lookups hit the Blob copy, which lacks rejected entries and `briefing.md`; keep Drive as the backup of record.

## 8. Questions only Daniel can answer

1. What does CRC chant on Shabbat morning (whole parashah, a triennial third, one aliyah, a selection you choose), and should the sheet follow what is chanted or what the class wants to study?
2. Do you choose the Torah selection weekly in the briefing, or should a standing rule set it (e.g. a fixed aliyah per parashah, or aliyah n in year n)?
3. Print form: two PDFs per week, one combined packet, or Torah on the web only with the printed sheet staying haftarah-only?
4. How much commentary should Torah carry, and in which registers: the same three as the haftarah, or lighter (classical only)?
5. For "builds on last year": should a fitting prior entry carry forward by default (you cut) or start fresh with last year's offered as an option? Should the printed sheet say "see also last year's sheet"?
6. Should festival and special-Shabbat weeks carry a Torah reading (maftir and festival readings differ), or only the haftarah, as now?
