# Skill, MCP, or both? The haftarah pipeline in v2

Research for Daniel's question: "we should think about getting rid of the skill, perhaps, and instead having an mcp? or both?" and "all work in claude. I think maybe this whole thing should move to MCP?"

Date: 2026-10-15. Read-only research. Nothing in the repo was changed.

## Bottom line

**Move the machinery to an MCP server, but keep a short skill (option C, hybrid).** A "haftarah" MCP server on the existing Vercel project would hold the credentials, the weekly data and the headless browser. Claude would drive it through about a dozen tools from any surface: a Cowork cloud session, the claude.ai web app, the phone, or Claude Code. That fixes all four current pain points:

- the cloud session can't build a PDF;
- the cloud session can't push or deliver without the credential files on Daniel's machine;
- the skill re-clones the repo every week;
- `weeks/` has to be kept out of the public repo.

Daniel already runs the hard part in production: CRC Overlays launches `@sparticuz/chromium` with `playwright-core` from its MCP route on Vercel for fit checks.

The skill does not go away. It shrinks to the part that is about judgment, not machinery: the briefing, the standing rules, translation style, and "approve by printing." Ideally it ships with the connector in one plugin, so nothing gets cloned. Pure MCP (option B) is possible, because server `instructions` can carry the rules the way CRC Music's do. But it is a worse home for a 500–700-word briefing protocol, and it can be truncated.

Expected marginal cost: **under $1/month** on the existing Vercel Pro team, well inside the $20 ceiling.

---

## 1. What the pipeline needs today (from the repo)

| Step | Script | Needs |
|---|---|---|
| Calendar | `fetch.mjs` | Network (Hebcal leyning and converter). Drive folder listing via the connector (`--known`). |
| Fetch | `fetch.mjs` | Network (Sefaria v3 texts and links APIs, a concurrency pool). Writes `sheet.json`, `candidates.json` (~100–235 KB) and `texts.json` (~1.8 MB, capped near 2 MB). |
| Digest | `digest.mjs` | Filesystem only. Writes `digest.md` (~19 KB). |
| Draft | (Claude and a subagent) | `texts.json`, `docs/prompts/draft-entries.md`, `bibliography/<book>.md`. |
| Lint and gate | `lint.mjs`, `build.mjs` gate | Filesystem only (`template/voices.json`, bibliography). |
| Build | `build.mjs` | **Chrome or Edge** spawned headless (`findBrowser`, `chromeFlags`), template, fonts (2.3 MB), mural (2.4 MB). Optional `pdftoppm` and `qpdf`. |
| Check | `check.mjs` | Chrome again (renders twice, `--dump-dom`). |
| Deliver | `deliver.mjs` | Drive drop-box URL and token (env `HAFTARAH_DROPBOX_URL`/`_TOKEN` or `~/.haftarah-dropbox.json`), network. |
| Publish | `publish.mjs` | Blob read-write token pinned to store `wOGdAqvPmTFjKrmY` (env `HAFTARAH_BLOB_TOKEN` or `~/.haftarah-web.json`). |

Observations that matter for the design:

- **The scripts are dependency-free, and `deliver` and `publish` already read their credentials from environment variables.** Moving them server-side is mostly a matter of passing paths and env, not a rewrite.
- **`texts.json` (1.8 MB) is about 12 times claude.ai's tool-result limit (~150,000 characters).** A server would have to expose it as sliced queries (by verse, commentator or kind). That is better than today, where Claude reads a 1.8 MB file from disk.
- **The only things that tie the run to Daniel's machine are the two credential files and Chrome.** The 2026-10-08 handoff confirms both failures in a cloud session: no browser, so no build, and no push.
- **The record already lives outside the repo.** The working files go to the private Drive folder `Haftarah working`. The cleaned `sheet.json` and PDF go to the public Blob store.

## 2. Findings: MCP in Claude today

All of these are from Anthropic's connector docs unless noted.

- **Surfaces.** A remote MCP server reaches claude.ai web, Desktop, mobile, Cowork and Claude Code through the same connector infrastructure. A local server works only in Claude Code and in a Cowork session on the user's computer, not in a cloud session. Remote is therefore the only option that serves Daniel's cloud Cowork. ([Build an MCP server](https://claude.com/docs/connectors/building); [What to build](https://claude.com/docs/connectors/building/what-to-build))
- **Features Claude supports:**
  - tools, prompts and resources;
  - text and image tool results;
  - text and binary resources;
  - MCP Apps (interactive UI rendered in the conversation).

  **Not supported:** sampling, resource subscriptions, and "advanced or draft capabilities". Elicitation is not listed as supported, so don't build on it; questions to Daniel stay in Claude's chat and pop-ups. ([Build an MCP server](https://claude.com/docs/connectors/building); [MCP Apps](https://claude.com/docs/connectors/building/mcp-apps/getting-started))
- **Limits:**

  | | claude.ai and Desktop (and Cowork) | Claude Code |
  |---|---|---|
  | Tool result size | ~150,000 characters | 25,000 tokens (`MAX_MCP_OUTPUT_TOKENS`) |
  | Tool call timeout | 240 seconds | `MCP_TOOL_TIMEOUT` |

  A bug report describes the 4-minute wall clock as hard and not user-configurable. ([Build an MCP server](https://claude.com/docs/connectors/building); [anthropics/claude-code#64614](https://github.com/anthropics/claude-code/issues/64614))
- **Files: no reliable "here is the PDF" path.** Community reports say `resource_link` items and embedded PDF blobs in tool results were ignored or not rendered, and Claude Code saves binary blobs to disk as placeholders. There is no official list of supported content types. ([report 1](https://claudeissues.com/issue/53453-bug-mcp-resource-link-silently-ignored-pdf-blobs-not-processed-and-no-docs-on-su); [report 2](https://claudeissues.com/issue/72271-feature-forward-mcp-embeddedresource-blob-to-anthropic-api-content-blocks))
  - **Design rule:** the server returns a URL for the PDF (Daniel opens it and prints), plus **page images as image content**, so Claude can look at the pages itself.
  - This is what CRC Overlays already does: `ship_draft` returns the frame.
- **Auth options:**
  - OAuth 2.0 (DCR or CIMD; callback `https://claude.ai/api/mcp/auth_callback`, plus a loopback callback for Claude Code);
  - static header credentials (beta, limited organizations, Owner-entered);
  - none (authless).

  Client-credentials machine-to-machine OAuth is not supported. Anthropic's egress range is `160.79.104.0/21`. ([Authentication](https://claude.com/docs/connectors/building/authentication))
  - Correction to the brief: CRC Overlays is not authless. Its `/api/mcp` route uses `requireBearerAuth` with its own OAuth store (`crc-overlays/app/api/mcp/route.ts`), so there is in-house OAuth code to reuse.
- **Skills and connectors together.** Anthropic's own guidance: "Most plugins for a product include both an MCP connector and skills: the connector so Claude can reach the product, and the skills so Claude uses it the way you intend." Also: "A connector on its own leaves Claude to work out your workflow from tool names." A plugin can carry the connector URL and the skill together and installs on Chat, Cowork and Claude Code. On Team and Enterprise, an Owner adds a custom connector for the organization. ([What to build](https://claude.com/docs/connectors/building/what-to-build))

## 3. Findings: hosting the pipeline on Vercel

- **Duration.** Fluid compute defaults to 300 s on every plan. Pro and Enterprise can raise it to 800 s, with an 1800 s beta. ([changelog](https://vercel.com/changelog/higher-defaults-and-limits-for-vercel-functions-running-fluid-compute)) The binding limit is Claude's 240 s per tool call, not Vercel's.
- **Package size.** The standard limit is 250 MB uncompressed. Large Functions (public beta, Fluid only) allow up to 5 GB and name browser automation as a target. Existing projects opt in with `VERCEL_SUPPORT_LARGE_FUNCTIONS=1`. ([changelog](https://vercel.com/changelog/vercel-functions-can-now-be-up-to-5-gb-in-package-size))
  - CRC Overlays fits `@sparticuz/chromium@153` and `playwright-core@1.63` under the standard limit with explicit `outputFileTracingIncludes`.
  - Its `next.config.ts` records the traps: the `.br` pack must be included explicitly, and `tar-fs` and the pack's 17 dependencies must be traced.
- **Fluid pricing** (iad1/cle1/pdx1): $0.128 per active-CPU hour, $0.0106 per GB-hour of provisioned memory, $0.60 per million invocations. On Pro, all of this draws down the $20 monthly usage credit. ([pricing](https://vercel.com/docs/functions/usage-and-pricing))
- **Vercel Sandbox** (Firecracker microVM):
  - Pro rates: $0.128 per CPU hour, $0.0212 per GB-hour, $0.60 per million creations.
  - Session limits: 5 min default timeout, extendable to 24 h.
  - Snapshots are kept 30 days after last use by default; inbound downloads are free.
  - It could run the repo unchanged (`git clone`, Node, a Chromium installed into a snapshot). ([pricing](https://vercel.com/docs/vercel-sandbox/pricing))

  It is a good fallback, but costs a cold VM plus snapshot upkeep and more moving parts than a function for a ~20 s render.
- **mcp-handler.** A framework-agnostic Fetch-style handler; v2 targets `@modelcontextprotocol/server@^2` with Node 20+ and the stateless Streamable HTTP transport, which fits serverless. CRC Overlays already uses `@modelcontextprotocol/server@^2`. ([vercel/mcp-handler](https://github.com/vercel/mcp-handler))
  - The `haftarah` project is static (`framework: null`, `outputDirectory: site/dist`). A root `api/mcp.mjs` Vercel Function can sit beside it with no framework change.
- **Blob.** $0.023 per GB-month beyond 5 GB included on Pro; private stores require auth on every read. ([Blob pricing](https://vercel.com/docs/storage/vercel-blob/usage-and-pricing))
  - Ten years of weekly working files (~3–4 MB each without previews) is under 2 GB, so storage is effectively free.

## 4. Findings: what Sefaria's MCP already covers (do not duplicate)

The Sefaria connector Daniel has exposes:

- `get_text`, `get_english_translations`, `get_links_between_texts`;
- `text_search`, `search_in_book`, `search_in_dictionaries`;
- `get_topic_details`, `get_text_catalogue_info`, `get_text_or_category_shape`;
- `get_current_calendar`;
- manuscripts, plus `clarify_*` helpers.

(See also the [Glama listing](https://glama.ai/mcp/servers/blqog8k3ky).)

**Don't rebuild:**

- ad-hoc lookups during the briefing and drafting: "show me Radak on 54:9", "is there a midrash on this phrase", a lexicon entry, a topic page;
- general search.

Claude should keep using the Sefaria connector for these.

**What the haftarah server still does with Sefaria's REST API, because the Sefaria MCP can't:**

1. **Bulk, version-pinned, verse-aligned fetch.** Miqra according to the Masorah plus JPS Gender-Sensitive, footnotes parsed, divine name left for the renderer. Through Claude this would mean dozens of tool calls and megabytes of context.
2. **`texts.json` assembly.** Every core commentator per chapter, section-filed detection, linked Talmud, midrash and liturgy segments, capped near 2 MB.
3. **Ref validation at save time.** Confirm each `sourceRef` resolves before the entry is accepted, which strengthens "never invent a citation."

The calendar stays on Hebcal server-side. Its leyning API answers for any date with the special-haftarah logic `fetch.mjs` already relies on. Sefaria's `get_current_calendar` is "current" only.

## 5. The three architectures

**(A) Keep the skill as is.** Clone the repo, run the scripts in a session sandbox; credentials come from files written by the skill.

**(B) MCP does everything.** All steps are tools, data lives in Blob or a DB, and the server's `instructions` (and an MCP prompt) carry the runbook. The skill is deleted or becomes one line: "use the haftarah connector."

**(C) Hybrid.** The MCP holds everything stateful, credentialed or browser-bound: calendar, fetch, digest, text slices, library, save with validation, build, check, deliver, publish. A short skill (or plugin skill) holds the conversation: briefing format, issue pop-ups, standing rules, translation style, approve-by-printing, subagent drafting.

| | A: skill only (today) | B: MCP only | C: hybrid (recommended) |
|---|---|---|---|
| Can a Cowork cloud session finish a whole week? | **No.** No browser, so no PDF; credentials only if the skill writes them into the sandbox. | Yes | Yes |
| Who holds credentials | Files on Daniel's PC; tokens pasted into the skill text | Vercel env vars on the server; never in chat or skill | Same as B |
| Weekly data location | Session scratch, then Drive (and Blob for the public copy); lost if the session dies before delivery | Private Blob (working) and public Blob (published), Drive as a mirror | Same as B |
| Re-clone each week | Yes | No | No |
| PDF fidelity | Whatever Chrome the session has (Windows locally; Linux Chromium in the cloud, with the screenshot bug) | One pinned Chromium for every build: same output wherever Claude runs | Same as B |
| Approval conversation | Lives in RUNBOOK and skill; works well | Squeezed into server `instructions` (visibly truncated in CRC Music's case) and tool descriptions; the briefing protocol is easy to lose | Lives in the skill, where it is today; tools stay small and mechanical |
| Context use | Claude reads a 1.8 MB `texts.json` from disk | Sliced queries under 150 k characters | Same as B |
| Validation feedback | At build time only | At save time (gate and lint per entry) | Same as B |
| Torah-portion expansion | Another script set and another skill | New tools on one server; data model by reading | Same as B, plus a Torah section in the skill |
| Multi-year library ("last year's sheet") | Drive folder listing and manual load | `find_past_sheets` over an index | Same as B |
| Testability | `npm test` plus manual runs; a past test delivered a fixture to real Drive and Blob (HOME ignored on Windows) | Tools tested against injected in-memory stores; no home-dir config to leak | Same as B; the skill still needs one live dry run per change |
| Template and script changes | Edit repo, push; every session clones latest | Edit repo, Vercel redeploys | Same as B |
| Failure modes | Cloud: no PDF, no push. Local: depends on Daniel's PC. | Vercel outage, 240 s tool cap, Chromium cold start, connector auth expiry, Linux-versus-Windows pagination drift | Same as B; the A path stays runnable from Claude Code as a fallback |
| Marginal cost | $0 | <$1/month | <$1/month |
| Build effort | None | Medium (server, auth, storage, port of scripts) plus the work of moving the protocol into instructions | Medium (same server; the skill shrinks rather than moving) |

**Why C over B.**

- The weekly run is two kinds of work:
  - **machinery:** deterministic, credentialed, browser-bound;
  - **editorial conversation:** a cold-read briefing, pop-ups only after the briefing, "Needs you:" lists, subagent drafting, rulings like God-language.
- MCP is the right home for the first. A skill is the right home for the second.
- Anthropic's guidance says the same: a connector alone leaves Claude to infer the workflow from tool names.
- B could work by stuffing RUNBOOK into the server `instructions` and an MCP prompt. But instructions are long-lived system text for every conversation that has the connector on, prompts aren't reliably surfaced in Cowork, and a long instructions field already shows up truncated for CRC Music.
- Keep a short MCP `instructions` block anyway: the 5–6 rules that must hold even if the skill isn't loaded. Examples: never deliver without Daniel's go-ahead; never invent a citation.

**Why not keep A.** It cannot produce the one artifact that matters (the PDF) in the environment Daniel wants to work in.

## 6. Recommended architecture (C)

```
Claude (Cowork cloud / web / phone / Claude Code)
  ├─ skill "haftarah-sheet" (short; in a plugin with the connector URL) ── the conversation
  ├─ Sefaria connector ── ad-hoc lookups, search, lexicon
  └─ haftarah connector ── https://haftarah.centralreform.org/api/mcp  (OAuth, single user)
        Vercel Function (Node, Fluid, maxDuration 300)
          ├─ ported scripts: fetch / digest / lint+gate / build / check / deliver / publish
          ├─ @sparticuz/chromium + playwright-core (only in the build/check path)
          ├─ private Blob store  ── weeks/<slug>/{sheet.json, candidates.json, texts.json, digest.md, briefing.md, sheet.pdf, pages/*.png}, library index
          ├─ public Blob store (existing wOGdAqvPmTFjKrmY) ── published sheet.json + PDF + index.json
          └─ Drive drop-box (existing Apps Script) ── mirror into Haftarah / Haftarah working
  Vercel Cron (optional, Wed night): pre-fetch next Shabbat so the digest is waiting
```

- **Same Vercel project.** It already holds the domain, the Blob binding and the site. Add `api/mcp.mjs` and its Chromium include, then add the private store.
- **Authentication.** Lift CRC Overlays' OAuth store and `requireBearerAuth` pattern, restricted to Daniel's Google account. Do not run authless: the tools publish to a public site and write to Drive.
- **Working data goes in a private Blob store.** It holds JPS and other copyrighted text and must not sit on a public URL.
  - JSON files plus one `library.json` index are enough at this scale: about 50 haftarot a year, plus Torah sheets later.
  - Move to Postgres (Neon free tier) only if the library needs full-text search across years.
- **Drive becomes a mirror and the human-browsable archive**, not the system of record. The system of record is the private Blob store, which the server can read without a connector.
- **The PDF before approval** is served from the private store through a short-lived signed URL (e.g. `/api/draft/<slug>?sig=…`, 24 h). The public copy appears only on `deliver_week`.
- **Page images:** render each page with Playwright at an exact letter viewport (avoids the Linux `--screenshot` bottom-cut bug).
  - Store them in the private store.
  - Return downscaled images (~1000 px tall) as image content, a few pages per call, to stay under 150 k characters.
- **No `pdftoppm` or `qpdf` on Vercel.** The PDF is about 1.0 MB instead of 0.8 MB, which is acceptable.
- **The 240 s cap.**
  - Build plus check: one Chromium launch, three renders (build, then the check's two), typically 20–60 s including a cold start. Fine.
  - Fetch with the full `texts.json`: dozens of Sefaria calls. Split it so each call stays well under 240 s: `start_week` fetches the reading and links, and `fetch_texts` assembles `texts.json`.
  - If either still runs long, start the job and poll it (`job_status`), with the work done in a Vercel Function, Queue or Sandbox.

### Tool list

| Tool | Inputs | Returns |
|---|---|---|
| `get_calendar` | `date?` (default next Shabbat), `diaspora=true` | Shabbat date (civil and Hebrew), parashah, haftarah ref, special reason, the parashah's own haftarah when different, Ashkenazi/Sephardi range choices, and any existing week slug with its status (`drafting`/`built`/`delivered`) for this and the following Shabbat |
| `find_past_sheets` | `ref?`, `parashah?`, `book?`, `query?` | Earlier weeks of the same or overlapping reading: slug, date, entry counts by register, briefing issues and picks, delivered links. Replaces "list the Drive folder" |
| `start_week` | `date`, `ref?` (Daniel's override), `slug?`, `force?` | Creates `weeks/<slug>` in the private store: Hebrew and JPS verse-aligned `sheet.json`, `candidates.json`. Returns slug, verse count, proposed incipit (he and en) and `nextWeek`. Refuses to overwrite without `force` |
| `fetch_texts` | `slug` | Builds `texts.json` and `digest.md`. Returns `digest.md` in full (~19 KB) plus counts and `notFetched` |
| `get_texts` | `slug`, `verse?`/`chapter?`, `source?` (e.g. "Abarbanel"), `kind?` (commentary/talmud/midrash/liturgy/targum/zohar), `lang?`, `cursor?` | A slice of `texts.json` under ~120 k characters, with section-filed coverage resolved, and a `cursor` for more. Drafting subagents use this instead of reading the file |
| `get_sheet` | `slug`, `parts?` (verses/commentary/glosses/glossary/openingNote/nextWeek/meta) | The requested parts of `sheet.json` plus `version` (for optimistic concurrency) |
| `save_briefing` | `slug`, `markdown`, `issues[]`, `picks[]` | Stored; returns `version` |
| `save_entries` | `slug`, `expectedVersion`, `entries[]` (commentary/glosses/glossary items, upsert by id), `remove?[]` | Per-entry results: gate errors (no `sourceRef`, work not in bibliography, `sourceRef` that doesn't resolve on Sefaria), lint errors and warnings (God-language, word counts, lemma not in verse), and fixes applied. Saves the valid entries; returns the new `version` |
| `update_sheet` | `slug`, `expectedVersion`, `patch` (openingNote, incipit, nextWeek, credits; JSON-merge) | Validation results and the new `version` |
| `set_status` | `slug`, `ids[]`, `status: "rejected" \| null` | Updated counts. Keeps the "reject, don't delete" rule |
| `build_sheet` | `slug`, `trope?=false`, `pages?="all"\|[n…]` | Gate and lint report, page count, `check` results (gap failures with the entry to trim and by how many words), entries by register, a signed private PDF URL (24 h), and page images as image content |
| `deliver_week` | `slug`, `dryRun?`, `only?: "public"\|"working"`, `web?=true` | Drive uploads with sha256 checks and both folder links, then the Blob publish and the live page URL. Destructive annotation; instructions say call only on Daniel's go-ahead |
| `add_bibliography_work` | `book`, `key`, `citation`, `verifiedBy` (catalogue or WorldCat URL) | Adds to a server-side bibliography overlay (cloud sessions can't push to the repo); listed in the delivery line, merged into `bibliography/<book>.md` later |
| `job_status` (only if needed) | `jobId` | Progress or result for a long fetch or build |

Possible later additions, not v1:

- **Resources:** `haftarah://weeks/{slug}/digest`, `haftarah://runbook`.
- **An MCP App** that shows the draft PDF with a print button inline. Nice, not needed: a URL works on every surface.

### What the skill becomes

About one page:

- "Use the haftarah connector for all files, builds and delivery; use the Sefaria connector for look-ups."
- The briefing (five sections, 500–700 words, cold read, no questions inside).
- The issue pop-ups.
- The drafting subagent brief (now pointing at `get_texts`).
- Translation and God-language style.
- The "Needs you:" rule.
- **Approve by printing:** `build_sheet` → show the Claude-written texts in full plus the PDF link → Daniel prints → `deliver_week`.

RUNBOOK.md remains the source for local and Claude Code use. The skill no longer clones anything. Ship skill and connector together as a personal or organization plugin, so one install covers Chat, Cowork and Claude Code.

## 7. Estimated monthly cost

On the existing Vercel Pro team, where usage draws down the included $20 credit:

| Item | Assumption | Cost per month |
|---|---|---|
| Builds | ~10 builds plus checks per week, ~30 s active CPU and ~45 s at 2 GB each, ~43/month | CPU 0.36 h × $0.128 ≈ $0.05; memory ≈ 1.1 GB-h × $0.0106 ≈ $0.01 |
| Fetch and MCP calls | a few hundred invocations, mostly I/O wait | < $0.01 |
| Blob (private and public) | < 1 GB over several years, a few thousand operations | $0 (inside the 5 GB included) |
| Cron pre-fetch | 4–5 runs | ~$0 |
| Sandbox (only if used as fallback) | 2 min × 2 vCPU per build | ~$0.05–0.20 |
| **Total marginal** | | **≈ $0.10–$1** |

The ceiling risk is a runaway loop: Claude rebuilding repeatedly, or a stuck Chromium. Set Vercel Spend Management alerts at $5. No new subscriptions are needed. A Neon Postgres free tier is optional and later.

## 8. Migration path

1. **Refactor in place (local, no behavior change).**
   - Make each script's `main` a function that takes a working directory and an injected config: browser launcher, store, drop-box, Blob.
   - The CLIs stay as thin wrappers, so A keeps working from Claude Code.
   - Abstract `findBrowser` into "spawn local Chrome" or "Playwright + `@sparticuz/chromium`".
   - Tests run against an in-memory store. This retires the HOME-file delivery hazard for good.
2. **Pagination parity spike.**
   - Build the Noach and both Bereshit sheets with `@sparticuz/chromium` on Linux.
   - Diff page counts and `check.mjs` results against the Windows Chrome builds.
   - This is the one technical unknown. Fonts are self-hosted, so parity should be close; Overlays' fit-check experience is the precedent.
3. **Server skeleton.**
   - Add `api/mcp.mjs` (`mcp-handler` v2) to the `haftarah` project, with Overlays' OAuth and the private Blob store.
   - Implement the read-only tools first: `get_calendar`, `find_past_sheets`, `get_sheet`, `get_texts`.
   - Seed the library index from the existing Drive weeks.
4. **Write and build tools.**
   - `start_week`, `fetch_texts`, `save_*`, `update_sheet`, `set_status`, `build_sheet` (Chromium in this route only).
   - Move the drop-box URL and token and the Blob token into Vercel env (or use the project's native `BLOB_READ_WRITE_TOKEN` binding).
   - Delete the tokens from the claude.ai skill text, and rotate the drop-box token, since it was pasted into skill text.
5. **`deliver_week`**, with `dryRun` exercised first against a test folder.
6. **New short skill plus plugin.** Run one real week in a Cowork cloud session end to end (the "cloud verification" still owed in `docs/planning/2026-10-08-sheet-v2/STATE.md`). Keep the old skill as `haftarah-sheet-local` for one month, then retire it.
7. **Later:** Torah-portion sheets as a `kind` on the same week records (`start_week({kind:"torah"})`), plus a Wednesday cron pre-fetch.

## 9. Risks

- **Linux Chromium pagination differs from Windows Chrome.** Mitigate with the step-2 parity spike. After the switch every build uses one renderer, which removes today's per-machine variance.
- **240 s per-call cap.** Keep each tool well under it: split fetch, one Chromium launch per build. Async jobs if needed.
- **Chromium packaging on Vercel is fiddly.** The `.br` pack and trace includes must be right. Overlays hit `ERR_MODULE_NOT_FOUND tar-fs` in production on 2026-09-16; copy its `next.config.ts` lessons (or the equivalent `includeFiles` in `vercel.json`).
- **Copyright.** Working data (JPS, full commentaries) must live in the **private** store and behind signed URLs. Never put it in the public store or the repo. Tool results go only to Daniel's authenticated session.
- **Auth and connector expiry.** If the OAuth token lapses mid-week, Claude says so and Daniel reconnects. Keep A runnable from Claude Code as a fallback.
- **Tool-surface bloat.** Daniel's account already has hundreds of connector tools. Keep this server at ~13 tools, under 64-character names. (A 256-tool aggregate cap was reported mid-2026 and appears resolved: [#77704](https://github.com/anthropics/claude-code/issues/77704).)
- **Safety of delivery.** `deliver_week` publishes publicly. Annotate it destructive, require Daniel's explicit go-ahead in the skill and the instructions, and support `dryRun`.
- **Bibliography edits can't be pushed from the cloud.** The server-side overlay plus a periodic merge handles it. Otherwise it stays a manual step.

## 10. Questions only Daniel can answer

1. **Which Claude account and plan owns the connector?** If it is a Team organization, an Owner adds custom connectors and can ship an organization plugin. Will anyone besides you (a cantor, a colleague) ever run the sheet?
2. **Should the private Blob store become the system of record, with Drive as a mirror?** The alternative is Drive staying the record and the server writing there first. (Recommendation: Blob as record, Drive as the browsable mirror.)
3. **Should delivery wait for your "printed, ship it," or follow automatically after the last build as now?** Approving by printing currently happens before step 7 only by convention. (Recommendation: an explicit go-ahead.)
4. **Is signing in once with your Google account (OAuth, as on Overlays) acceptable?** The alternative is authless with an unguessable URL, which I advise against because the tools publish publicly.
5. **Should Torah-portion sheets live on the same server, site and domain as the haftarah sheets?** That decides the data model now: one `weeks/<slug>` with a `kind`, or separate trees.
6. **Do you want the coming Shabbat pre-fetched automatically (say, Wednesday night)?** Then the digest is ready when you open Claude. Or should nothing happen until you ask?
