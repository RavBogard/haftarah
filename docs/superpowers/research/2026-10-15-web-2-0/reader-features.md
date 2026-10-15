# Reader features for haftarah.centralreform.org 2.0 (research, 2026-10-15)

Confidence tags: [V] verified on a primary doc this session, [S] search snippet or secondary, [K] general knowledge or design judgment, not re-verified.

## What the code gives us today (read from repo)
- Each verse row already has a stable id `v{chapter}-{verse}` and `data-ref`/`data-verse` (site/app/sheet.js). Share-a-verse links (`/slug#v1-3`) and "my marks" can key off these with no data-model change.
- site/app/settings.js persists size/theme/trope in localStorage inside try/catch, and `applyStored()` runs early. New per-device prefs (view mode, marks) can reuse that pattern.
- vercel.json: `/:slug` rewrites to `/sheet.html`; `/data/*` rewrites to the public Blob store. So `/slug?present` needs no routing change; `/slug/present` would need a new rewrite. Recommend the query param (`?present=1`, optionally `&v=1-3`).
- Text sizes are 5 steps (15-24px); the largest is far below presenter-view scale.

## 1. Presenter view for Zoom share
- Entry: a "Present" button in the Aa card and `?present`. Full-viewport view: current verse Hebrew (large, RTL) above English, 16:9 friendly (`100dvh`, type sized from viewport height with `clamp()`, plus a fit loop so a long verse shrinks rather than scrolls). [K]
- Keys: Right/Down/Space/PageDown/Enter = next; Left/Up/PageUp/Backspace = previous; Home/End = first/last; `b` or `.` = blank; `c` = commentary for this verse; `t` = trope colors; `+`/`-` = size; Esc = exit. Clickers: a Logitech presenter sends Page Down/Page Up, and "." for blank on the R400 [S; https://bugs.kde.org/show_bug.cgi?id=228779 for the Page Up/Down convention]. Must `preventDefault` PageUp/PageDown or the page scrolls. Add tap/swipe zones for an iPad presenter, always with button equivalents.
- Next-verse preview: small dimmed English line at the bottom. It appears in the shared screen, so make it a toggle.
- "Laser": leader taps a Hebrew word or drags a phrase; high-contrast highlight on the leader's screen, which Zoom shares. Cheap version: reuse existing `.w` word spans with a persistent pointer class. Zoom annotation is host-side and vanishes on slide change, so do not depend on it. Zoom immersive view is irrelevant to this page.
- Commentary on demand: `c` slides up that verse's rail entries; Sefaria panel off by default (small text is unreadable once compressed).
- Constant big verse label ("Isaiah 54:3", progress "3 / 17") top-left: this is the "where we are" cue that replaces sync (decision 12).
- Share-safe contrast: force a presenter palette independent of the system theme, ink/paper at 7:1 or more, no pastel trope backgrounds by default (compress badly), no hairlines, no animation. Zoom's "Optimize for video clip" makes small text blurry, so the leader should leave it OFF for text; share a single browser window and move Zoom's own windows out of the way [S; https://services.mnsu.edu/TDClient/30/Portal/KB/ArticleDet?ID=221]. I found no Zoom doc on text sizing; Hebrew nikud and trope marks are the thing to test at a 720p share.
- Wake lock (`navigator.wakeLock.request('screen')`, re-request on visibilitychange) keeps the leader's iPad awake; HTTPS only; confirm Safari support before relying on it [S; https://developer.mozilla.org/en-US/docs/Web/API/Screen_Wake_Lock_API, Baseline 2025].

## 2. Remote participant usability
- "Jump to verse" (type a number, or `g` then number) so someone who hears "verse 9" lands there. Verse numbers already sit in the gutter.
- Explicit one-column reading mode (today only under 1100px) with the rail collapsed: a narrow window beside Zoom already gets this.
- Hebrew-only / English-only / both toggle, persisted.
- WCAG 2.2 baseline [S; https://www.w3.org/WAI/standards-guidelines/wcag/new-in-22]: resize text to 200% (1.4.4, AA); reflow at 320 CSS px (1.4.10, AA); contrast 4.5:1 normal and 3:1 large (1.4.3); target size at least 24x24 CSS px (2.5.8, AA). Masthead targets (2.75rem) pass; audit the `.w` word spans and the verse gutter buttons (use 44px on touch). `lang="he"` is already set. Reduced motion is already honored (2.3.3 is AAA).
- Older adults [K]: add sizes 28 and 32px and a visible size readout; no hover-only controls; every gesture has a button; `touch-action: manipulation` on buttons; keep the focus ring.
- Audio later: reserve a slot in the layout; do not ship a dead "Listen" button.

## 3. Device-local highlights and bookmarks
- Storage: localStorage is enough (tiny data, matches settings.js). Key `marks:<slug>` -> `{v:["1-3","1-9"]}` plus a schema version. IndexedDB only if offline audio blobs need it (Cache API handles those anyway).
- Safari ITP 7-day cap: STILL IN FORCE per WebKit [V; https://webkit.org/tracking-prevention/]. It "deletes all cookies created in JavaScript and all other script-writeable storage after 7 days" without user interaction with the site, covering IndexedDB, LocalStorage, media keys, SessionStorage, and Service Worker registrations and cache. The same page says a Home Screen web app's first-party domain "is exempt from ITP's 7-day cap on all script-writeable storage" and is isolated from Safari [V]. Caveats: the clock counts days of Safari use, so a weekly visitor often resets it, but a class that skips weeks is exposed; a WebKit Bugzilla report claims a Home Screen app lost state after 7 days on iOS 15.3 [S; https://bugs.webkit.org/show_bug.cgi?id=237350], so treat the exemption as strong but not guaranteed. Quota: Safari 17+/iOS 17+ gives up to 60% of disk per origin to browser and Home Screen apps; eviction is LRU per origin under pressure; `navigator.storage.persist()` requests persistence, which WebKit grants by heuristics such as Home Screen install [V; https://webkit.org/blog/14403/updates-to-storage-policy/].
- Consequences: call `persist()`, nudge iPad readers to Add to Home Screen, and always offer export so marks are never the only copy.
- Interaction: tap or long-press the verse number in the gutter to cycle none -> highlight (-> star). Do not use taps on text (words and key buttons already use them). "My marks" drawer lists marked verses in order with jump links. Two or three colors max, plus a non-color cue (left bar).
- Share/export without accounts: put refs in the URL fragment, `/slug#m=1-3,1-9` (fragments never reach the server or analytics), plus "Copy my marks as text" (ref + English) and print. A recipient sees the highlights with an "Add to my marks" button. Keep any notes local only.

## 4. Offline and installable PWA
- Manifest: `manifest.webmanifest` (name, `display: standalone`, `start_url: /`, `scope: /`, 192/512 and maskable icons from the mural, theme/background colors) plus `apple-touch-icon` and iOS meta fallbacks. [K]
- iPad install: Share -> Add to Home Screen; iOS has no install prompt event (`beforeinstallprompt` is Chromium only). Show a small two-step help card only on iOS Safari when not standalone. Desktop Chrome/Edge: custom install button. [K]
- Service worker (hand-written, about 80 lines, no Workbox):
  - Precache: `/`, `/sheet.html`, `/web.css`, `/trope.css`, `/lib.js`, `/app/*.js`, fonts, `/mural.png`, manifest, 404 page. Cache name carries the build hash (web-build.mjs injects it).
  - Navigations to `/<slug>`: network-first with fallback to cached `/sheet.html` (the rewrite means one shell serves every week).
  - `/data/<slug>.json`: stale-while-revalidate; the landing page prefetches the current week and a few previous weeks. Week index JSON: network-first with a short timeout, cached fallback.
  - Sefaria API panels: cache on view, bounded (about 100 entries); offline shows "not available offline".
  - Updates: show "Update available" and apply on next launch; never reload mid-session or mid-presentation.
  - Audio (later): user-initiated "Save for offline" into the Cache API only; range requests need special handling.
- iOS limits: generous quota in Safari 17+ [V]; the 7-day cap covers SW registrations and caches in Safari but not in the installed app [V]. Web push on iOS exists only for Home Screen web apps (iOS 16.4+) [S]; not needed here, skip it.
- Cost: $0 (static files; the SW reduces Blob/CDN requests). No Function needed.
- Test: Lighthouse installability audit; ITP behavior needs a real iPad.

## 5. Analytics
Verified facts [V; https://vercel.com/docs/analytics/limits-and-pricing (updated 2026-08-25), https://vercel.com/docs/analytics/custom-events, https://vercel.com/docs/plans/pro-plan (2026-09-15)]:
- Hobby: 50,000 events/month, page views only (no custom events), 1-month reporting; collection pauses at the limit, never charged.
- Pro: no included events; $0.03 per 1K events; custom events included, 2 properties per event; 12-month reporting. Pro platform fee is $20/month and includes 1 deploying seat and $20 monthly usage credit that applies "from the first unit you use", so analytics at this volume is effectively free on a Pro team. Extra deploying seats are $20 each; viewer seats are free. Web Analytics Plus is +$10/month (not needed).
- Plain-HTML custom events: define `window.va` stub, load the Vercel script, call `va('event', {name, data})`. Values must be string/number/boolean/null, no nesting, 255 chars max.
- Cookieless and no banner: Vercel describes its analytics as not using cookies; I did not re-verify the legal wording [K].
- Daniel's actual plan: NOT determinable. The Vercel MCP shows one team, "RavBogard's projects" (slug ravbogards-projects); `get_team` does not return the plan and the billing-charges call exceeded the tool's size limit. Do not assume Pro. The personal-style slug may mean a Hobby team.
- Alternatives [V pricing pages]: Plausible Starter $9/month (10K pageviews, custom events included; https://plausible.io); Fathom from $15/month (100K pageviews, events count toward it; https://usefathom.com/pricing); Umami Cloud Hobby $0 (100K events/month, 1 site, 6-month retention, custom events included, each event property counts as an event) and Pro $20/month; Umami is also self-hostable but needs a database (https://umami.is/pricing).
- Self-logged counts in Blob: poor fit. Blob has no atomic increment, and a static site needs a Function to write at all (read-modify-write races, many tiny billed operations). Skip.
- Volume: roughly 40 learners x 150 taps x 4.3 weeks is about 26K events/month if every tap is an event; batching cuts that ~10x.

Recommendation:
1. If the team is on Pro: Vercel Web Analytics with custom events. Incremental cost $0 (inside the $20 credit; worst case about $1/month). Same dashboard, and the Vercel MCP exposes event aggregation, so Claude can write Daniel a weekly readership summary.
2. If the team is Hobby: Umami Cloud Hobby, $0. Do not upgrade to Pro just for analytics; $20 for a seat consumes the entire budget.
3. Event design (privacy): `verse_view` (once per session per verse, `{week, verse}`), `source_open` `{week, source}`, `word_lookup` `{week}` (no word unless Daniel wants it), `present_start`, `install`, `export_marks` `{n}`. Never send marks or notes; no IDs. Honor Do Not Track/GPC. Batch and send with `sendBeacon` on `pagehide`. Add a one-line footer note: "We count visits and which sources are opened; nothing identifies you."

## Ranked feature list
Effort: S up to 1 day, M 2-4 days, L a week or more.

| # | Feature | Effort | Value to remote learners | Notes |
|---|---------|--------|--------------------------|-------|
| 1 | Presenter view (`?present`, arrows/PageDown/clicker, big Hebrew+English, verse label, blank, commentary on `c`) | M | Very high | Decision 13; the core Zoom feature |
| 2 | Share link to a verse (ids exist; add per-verse "copy link" and highlight the target on load) | S | High | $0 |
| 3 | Copy a verse with citation (Hebrew / English / both, "Isaiah 54:3 (JPS)", URL) | S | High | Clipboard API |
| 4 | Hebrew-only / English-only / both toggle | S | High | Root class, persisted |
| 5 | Installable offline PWA (manifest, SW, iOS install card) | M | High (iPad) | Decision 15; $0 |
| 6 | Verse highlights, My marks, export as link/text | M | High | Decision 14; ITP risk |
| 7 | Sizes 28/32px, size readout, 24px target audit | S | High (older adults) | Also prepares presenter |
| 8 | Batched analytics events | S-M | Indirect (for Daniel) | Decision 18 |
| 9 | Jump to verse, next/last week nav | S | Medium-high | Week index exists |
| 10 | Keyboard shortcuts overlay (`?`) | S | Medium | Doubles as presenter help |
| 11 | Print-this-week button surfaced in masthead/end | S | Medium | PDF exists |
| 12 | Reading progress / remember position | S | Medium | localStorage |
| 13 | Line-by-line vs paragraph view | S-M | Medium | Poetry already has `.ln` |
| 14 | Wake lock in presenter view | S | Medium | Verify Safari support |
| 15 | Translation switcher | L | Low-medium | Needs another licensed text; JPS only today |
| 16 | Listen (audio) | L | High later | Needs recordings and offline policy; no placeholder button |

Suggested order: 2, 3, 4, 7 (quick wins), then 1, 5, 6, then 8 alongside 1.

## Risks
- ITP: marks and caches in a Safari tab can be wiped after 7 days of Safari use [V]; the installed app is exempt [V] with contrary field reports [S]. Mitigate with persist(), install nudge, export.
- Stale service worker: new week JSON with an old shell. Version caches by build hash, keep JSON backward compatible, "Update available" prompt.
- Blob caching: weekly overwrite may serve stale JSON from CDN/SW; use stale-while-revalidate plus a visible revalidate, or versioned query strings.
- Zoom compression blurs thin Hebrew marks; test at 720p; heavy weight, big size, trope colors off by default in presenter.
- Clickers: PageDown must be intercepted; some clickers send arrows or F5/Esc (F5 reloads the page).
- Analytics: custom events need Vercel Pro; looked-up words can be sensitive in a congregation, so keep aggregates only.
- Budget: a Vercel Pro seat alone is $20; choose $0 analytics.
- Code coupling: presenter view, marks, and SW all touch sheet.js; do them in that order so the SW cache list stabilizes.

## Questions only Daniel can answer
1. What plan is the Vercel team on (Hobby or Pro) and what does it cost today? It decides Vercel Analytics vs Umami free (Billing page in the dashboard).
2. Who runs the Zoom share, and from what device (laptop or iPad)? It decides tap zones, wake lock, and whether the next-verse preview shows on the shared screen.
3. Is it acceptable to record which verses and sources are opened in aggregate (never who), and should looked-up Hebrew words be recorded or only counted?
4. Do you want an "Add to Home Screen" help card shown to iPad users, knowing it is the only way to protect saved marks from Safari's 7-day clearing?
5. Should marks stay personal (device-local, exportable by link), or do you also want teacher highlights you publish with each week (no accounts, ships in the week JSON)?

## Sources
- https://vercel.com/docs/analytics/limits-and-pricing (verified)
- https://vercel.com/docs/analytics/custom-events (verified)
- https://vercel.com/docs/plans/pro-plan (verified)
- https://webkit.org/tracking-prevention/ (verified)
- https://webkit.org/blog/14403/updates-to-storage-policy/ (verified)
- https://bugs.webkit.org/show_bug.cgi?id=237350 (snippet)
- https://umami.is/pricing, https://plausible.io, https://usefathom.com/pricing (verified)
- https://www.w3.org/WAI/standards-guidelines/wcag/new-in-22 (snippet)
- https://services.mnsu.edu/TDClient/30/Portal/KB/ArticleDet?ID=221 (snippet)
- https://developer.mozilla.org/en-US/docs/Web/API/Screen_Wake_Lock_API (partial)
- https://bugs.kde.org/show_bug.cgi?id=228779 (snippet, clicker keys)
