# Peer scan (revised, second pass): study-group features for haftarah.centralreform.org 2.0

Method: first pass was search summaries. This pass fetched the live pages. "Seen" means WebFetch returned that page's content on 2026-10-15. Several sites are JavaScript-rendered or returned 404 on guessed URLs; those are listed under "Not verified" at the end and are dropped from the scan. Lens: Reform adult ed, no accounts, about $20/month, remote participants on Zoom.

## 1. Peer scan (verified entries)

**AlHaTorah.org: Mikraot Gedolot, Tanakh Lab, concordance** (seen)
- URL: https://mg.alhatorah.org/Full/Isaiah/55.1
- Does well that we lack: a very deep display panel. Pick any commentators from a long checklist (Rashi, Ibn Ezra, Radak, Malbim, Netziv, Targums, midrash collections, Biblical Parallels, Audio). Toggles for nikkud, te'amim (cantillation), Rashi font and dark mode; translation languages side by side; infinite scroll. Selecting text opens a menu: highlight all instances, concordance, dictionary, copy (plain, to Word, or with title), color, personal note, send correction, Compare Lab. Tools menu lists Tanakh Lab, Te'amim Lab, Compare Lab, concordance, dictionaries, a Commentators Map and Timeline.
- Does badly: sheer density, and a beginner has no guided path. Personal notes require an AlHaTorah login. I could not confirm that the commentary texts themselves are in English (only labels and menus are).
- Group study: a teacher's tool; no shared state, no class frame. "Copy with title" and "highlight all instances" are the ideas worth taking. Note it already has trope toggle and a Te'amim Lab, so our trope toggle is not unique among Hebrew study sites.

**Sefaria** (partly verified)
- URLs: https://www.sefaria.org/Isaiah.55.1 (page is JS-rendered; fetch returned only the shell: Source / Translation / bilingual layout options, stacked vs side by side, font size, "Want to change the translation?" link, bookmark, sign-up/log-in); API check https://www.sefaria.org/api/texts/Isaiah.54.1 returned Hebrew plus English and several versions.
- Seen: layout, display and translation controls, bookmark (account feature), bilingual data.
- Not seen live: the connections panel and word lookup (script-rendered). Their description comes only from Sefaria's own educator course sheet (https://www.sefaria.org/sheets/130876, via search summary): a per-passage panel of texts, sheets, topics, audio; "Other Text" second panel; collaborative sheets. Treat as documented, not observed.
- Group study: strong for a teacher with an account; no way to put a room on the same verse and panel except sharing a ref link.

**929.org.il, English** (seen)
- URL: https://929.org.il/pages/aboutEN.html
- Does well: one chapter a day, in sequence, same chapter for everyone; Sunday to Thursday reading, Friday/Shabbat for catch-up and a weekly summary; each chapter has brief explanations, video clips, pictures and audio narration; encourages local study groups and supports facilitators.
- Does badly: the About page describes a cycle that started December 2014 and was scheduled to end summer 2018, and gives no current status, so I cannot confirm it is active in 2026. Discussion is pushed out to social networks, not onto the site.
- Group study: the rhythm (everyone reads the same chapter on the same day, with a catch-up day) is the idea. Study groups are a stated goal but the tools are only the reading.

**TheTorah.com** (seen, home page only; the /parashah URL was a 404)
- URL: https://www.thetorah.com/
- Does well: weekly portion index with verse ranges; peer-edited academic essays by university scholars; browse by topic and category (Biblical Criticism, Archaeology, Psalms, Medieval Interpretation, holidays); no login or paywall; newsletter "before Shabbat" option; Hebrew site at thetorah.co.il. This is the historians register source.
- Does badly: no audio and no search box on the page; essays are the product, there are no text tools.
- Group study: reading material for prep; not a surface to study with.

**STEP Bible, Isaiah 55** (partly seen)
- URL: https://www.stepbible.org/?q=version=ESV|reference=Isa.55&options=NVHUG
- Seen in the fetched markup: sidebar tools (Analysis, Bookmarks and recent texts, Font, Grammar color view), lettered cross-reference markers with verse tooltips, links to Places, People, Chronology, Reading Plans. The page is script-driven.
- I could not observe the morphology popup. The word-hover and interlinear claims from the first pass are therefore dropped; only the tools above are confirmed.
- Group study: no group features; useful as a UI model only for the sidebar-of-tools pattern.

**Bible Hub interlinear, Isaiah 55:1** (seen)
- URL: https://biblehub.com/interlinear/isaiah/55-1.htm
- Does well: per-word cell with Strong's number, transliteration, Hebrew, English gloss and parsing code (for example V-Qal-Imp-mp); prior/next verse arrows; Strong's links on each word of several English translations; very clear and light.
- Does badly: the fetched page showed no commentaries and no ads (contradicting my first-pass note); some links were malformed and some Strong's numbers mismatched their words, a data-trust problem. Christian site; no cantillation.
- Group study: none; but proves that a plain per-word grid (gloss + parse) is enough for most learners.

**YouVersion web reader, Isaiah 55** (seen)
- URL: https://www.bible.com/bible/111/ISA.55.NIV
- Does well: reading needs no account; Highlight, Copy, Compare (parallel versions) and Share buttons under the chapter; Plans link; Verse of the Day; an audio icon for the chapter; related videos.
- Does badly: highlights persist across devices only with sign-in; audio showed an icon only, no visible player or synced highlight on the web page I fetched (so I could not verify audio-with-highlight there).
- Group study: the nice point is that reading and highlighting work with no account. Shared plans exist but I could not verify them on the web.

**PocketTorah** (partly seen)
- URL: https://pockettorah.com (page seen: helps people learn the weekly Torah and Haftarah to chant; free; iOS, Android, any browser; by Russel Neiss and Charlie Schwartz). Features beyond that page: https://www.jta.org/2012/04/17/ny/an-app-thatll-chant-your-haftarah-portion and https://digitalreligion.tamu.edu/pockettorah/ (search-result summaries, not fetched).
- Reported: tap a verse number to hear it with trope while matching words highlight; Tikkun view toggles vocalized text and the scroll look; Hebrew with English; later versions removed commentaries and changed audio to play a whole aliyah. A 2020 review says its Haftarah content covers only aliyah breakdowns.
- Group study: strong chant model; no commentary, so it complements a study page rather than competing.

**Rabbi Sacks, Covenant & Conversation** (seen)
- URL: https://rabbisacks.org/covenant-conversation/
- Does well: weekly essay by parsha and by year cycle, also by theme; a Family Edition each week; Teaching Resources; podcasts, broadcasts, audiobooks; English, French, Hebrew.
- Does badly: the page shows no discussion questions or search (the Family Edition and Sefaria version are where I earlier found reflection questions; that comes from search results, not this fetch).
- Group study: a good source to point groups to; one voice.

**Aleph Beta** (seen, home page; /parsha was a 404)
- URL: https://www.alephbeta.org/
- Does well: animated parsha videos (Noach set listed, 11 to 15 minutes each), printable learning guides, a "Parsha Companion" product, mobile apps, "My List".
- Does badly: membership/free-trial model with prices not shown; the page does not mention discussion questions.
- Group study: video for individuals; printable guides are the group tie-in.

**Chabad.org Parshah (Noach)** (seen)
- URL: https://www.chabad.org/parshah/default_cdo/jewish/Parshah.htm
- Does well: one hub per portion (this week: Noach, Genesis 6:9 to 11:32, Haftarah Isaiah 54:1-10); a "Parshah Themes" keyword tag list with counts; about 37 audio classes plus separate audio for the Torah reading and Haftarah; about 10 videos; family materials (quiz, crossword, bingo, Q&A); an "Interactive Torah Trainer" link; eight interface languages; a PDF.
- Does badly: a hub of links rather than one page; one theological voice; no Rashi panel on the hub, so Rashi sits in separate "Studies" pages; login and profile prompts.
- Group study: the family and game materials are a reminder that a table sometimes wants an activity, but it fits a Chabad audience more than Reform adults.

**Reform Voices of Torah / ReformJudaism.org** (search-level only; the page URLs I tried were 404)
- URLs: https://reformjudaism.org/learning/torah-study/torah-study-tips-leading-weekly-family-discussion , https://reformjudaism.org/reform-voices-torah-author-biographies
- Reported by search: Reform Voices of Torah is emailed each Monday to over 43,000 subscribers; one Reform leader writes for a whole book of Torah; a companion davar acher; Torah for Tots/Tweens/Teens family pieces with discussion tips; no consolidated list of discussion questions per parashah found.
- Group study: the home-ground competitor for "what Reform people read." Link to it; do not duplicate.

**CCAR Press** (search-level; the one product page I fetched was a Russian Plaut edition, not a study site)
- URL: https://ccarpress.org/shopping_product_detail.asp?pid=50137 (Voices of Torah, from search result)
- Reported: collections of short rabbinic commentaries per parashah (Voices of Torah vols. 1 and 2, d'vrei Torah capped at 250 words), The Social Justice Torah Commentary, The Mussar Torah Commentary. I found no current weekly online study guide from CCAR Press. These are books, so they are source reading, not a competing web tool.

## 2. Candidate features for 2.0 (revised)

Effort: S under a week, M one to three weeks, L longer. Value is my judgment. Changes from the first pass are marked.

| # | Feature | Idea from | Remote participant | The table | Effort | Comparable exists? |
|---|---|---|---|---|---|---|
| 1 | Presenter view (one verse or commentary, large; keyboard advance) | Daniel's plan | Low, but a readable shared screen | High | S-M | None found |
| 2 | Deep link to verse + panel + word state | Sefaria ref links | High: one link in Zoom chat | High | S | Sefaria and AlHaTorah link to a ref/passage; I saw no panel/word state links |
| 3 | Follow-the-leader read-only sync (no accounts) | Slide tools | High | High | M-L | None found |
| 4 | Verse-tap chant audio with verse highlight | PocketTorah | High | Medium | M-L (audio production) | PocketTorah (free app, no commentary) |
| 5 | Trope trainer (tap a sign, hear its motif) | PocketTorah Trope, AlHaTorah Te'amim Lab | Medium-high | Medium | L | **Changed:** AlHaTorah has a Te'amim Lab and Chabad an Interactive Torah Trainer; PocketTorah Trope is free. Weaker "nobody does this" |
| 6 | Print/PDF parity with a QR back to the live page | Our PDF | High | High | S | Rare |
| 7 | 3 to 5 discussion questions per portion, tied to verses | Sacks Family Edition, Reform family pieces | High | High | S/week authoring | Family-oriented only; I found none per verse for adults (Aleph Beta page does not mention them) |
| 8 | "Everything on this verse" | Sefaria connections | Medium | High | M | Sefaria (documented, not observed live) |
| 9 | Same-root highlight in the passage | AlHaTorah "highlight all instances" (text, not root) | Medium-high | High | M | **Changed:** AlHaTorah highlights all instances of a selected word; root-level highlight not seen anywhere |
| 10 | Translation switching / side by side | AlHaTorah, YouVersion Compare, Sefaria | Medium | Medium | M (rights) | Common, so lower differentiation |
| 11 | Device-local highlights/notes with export | YouVersion highlight (sign-in to sync), AlHaTorah notes (login) | High | Low | S-M | **Changed:** both rivals gate saving behind login; local-only is the contrast |
| 12 | Large-print/low-vision spacing | Our Aa | Medium | Medium | S | Common |
| 13 | Offline / PWA | General | Medium | Low | M | Not checked in any peer |
| 14 | Multi-year library with calendar index | Hebcal (search-level), Chabad hub | Medium | Medium | M | Chabad has the current portion hub |
| 15 | "Why this haftarah goes with this portion" note | Chabad hub shows both readings | Medium | High | S authoring | Hub shows readings, not why (not seen on the page) |
| 16 | Commentary filter by register, remembered per device | AlHaTorah commentator checklist | High | Medium | S | AlHaTorah filters by commentator, not register |
| 17 | Static maps/timelines tied to verses | AlHaTorah Commentators Map and Timeline; STEP Places/Chronology links | Medium | Medium-high | M-L | **Changed:** commentator timeline exists on AlHaTorah, places/chronology on STEP |
| 18 | Copy with citation (Zoom-chat sized) | AlHaTorah "copy with title" | High | Medium | S | AlHaTorah (seen) |
| 19 | Hebrew-only / English-only / bilingual and Tikkun view | AlHaTorah toggles, PocketTorah tikkun | Medium | Medium | S | Common |
| 20 | Weekly plain email/WhatsApp snippet (3 verses, 3 questions, one link) | Reform Voices (Monday email), TheTorah "before Shabbat" newsletter | High | High | S | **Changed:** newsletters are common; ours would be a study nudge, not an essay |
| 21 | Morphology panel beyond root + BDB | Bible Hub per-word parsing (seen) | Low-medium | Medium | M-L | Bible Hub (seen, with data errors) |
| 22 | "Where I left off" per device | General | Medium | Low | S | Common |
| 23 | Teacher source-sheet builder | Sefaria Sheets | Low | High | M-L | Sefaria (needs account) |
| 24 (new) | Catch-up cadence ("missed last week? start here" and a weekly summary) | 929 Friday/Shabbat catch-up | High: remote people miss weeks | Medium | S | 929 only |

Suggested first wave: 2, 6, 7, 15, 16, 18, 20, 11, 1, 24.

## 3. Things no one does well, revised honestly

After seeing the live sites, I withdraw or soften some first-pass claims.

Still holds, based on what I saw:
1. A link that puts a room on the same verse, commentator and word, plus an optional follow-the-leader. None of the sites fetched offered it. Caveat: Sefaria's panel states are script-rendered and I could not test their share links, so confirm by hand before claiming novelty.
2. One calm, finite page per portion for a mixed-level class. AlHaTorah is an expert console, Chabad a link hub, Sefaria a library, TheTorah essays, 929 a daily feed. Nothing seen was a single guided class page.
3. Commentary grouped by register. AlHaTorah lets you tick commentators; nothing seen organizes by classical / modern / historians for a beginner.
4. No-account local notes. AlHaTorah and YouVersion both tie saving to login.
5. Class rhythm with catch-up. 929 had it, but its English status in 2026 is unconfirmed.

Withdrawn or weakened:
- "Trope inside a study page": AlHaTorah already shows te'amim toggles with a Te'amim Lab, and Chabad links an interactive trainer. Our edge is only that it sits next to Reform-oriented commentary and JPS English.
- "Nobody ties audio to the commentary text": not verified either way; PocketTorah removed commentaries, which suggests the combination is hard, not absent.
- Word-level sync claims from audio Bibles are not re-verified (YouVersion web showed only an audio icon).

## 4. Traps (unchanged in substance, with new evidence)

- Accounts: AlHaTorah requires login for notes; YouVersion requires sign-in to sync highlights. Keep local-only.
- Comments and feeds: 929 pushes discussion to social media rather than hosting it; follow that.
- Gamification, push notifications, word-level audio sync, full morphology for everything, too many translations, a teacher sheet builder, shared editing: unchanged from first pass.
- Data errors: Bible Hub's interlinear showed malformed links and mismatched Strong's numbers. Any per-word feature lives or dies on data accuracy.
- Copying Reform Voices of Torah, Sacks, or Aleph Beta: rights and duplication; link instead.
- Maps without a content budget: still true, now with AlHaTorah and STEP as existing baselines.

## 5. Not verified (dropped from the scan)

Blue Letter Bible, Logos Verse of the Day, Tikkun Simanim, Hebrew Audio Bible, Shema app, Bible.is, TorahMusings, TropeTrainer (only a search result), Sefaria connections panel and word lookup (script-rendered, not seen), STEP morphology popup (not seen), YouVersion synced audio highlight (not seen on the web), the ReformJudaism.org weekly commentary page itself (404 on three guessed URLs; search-level only), a CCAR Press weekly study resource (none found), Hebcal and Scaife Viewer (search-level, not re-fetched this pass).
