# Sheet v2: state

Spec: `docs/superpowers/specs/2026-10-07-haftarah-sheet-v2-design.md` (approved for planning 2026-10-08).
Plan 1: `docs/superpowers/plans/2026-10-08-sheet-v2-template.md` (template, schema 2, gate, tests).
Plan 2 (to write after plan 1 ships): repo history without `weeks/`, Drive folders and uploads, runbook v2, synced skill, cloud verification.

## Gates

- GATE: plan 1 execution method — proceeded with Native execution (Claude implements every task in this session, `npm test` and `check.mjs` after each, one fresh auditor at the end) because the standing authority (CLAUDE.md 2026-07-25) converts approval checkpoints into logged decisions, the tasks are tightly coupled through `template/render.js`, and nothing in plan 1 is irreversible or leaves the repo. Daniel can read the plan while it runs and redirect at any point.
- GATE: the Isaiah entry "Egypt as ransom" (43:3) is set back to `proposed` during migration because its citation changes from "a common reading" to a named work — proceeded because the gate rule says nothing prints with a changed citation until Daniel has seen it; the Isaiah sheet is a draft kept in the working folder only.
- GATE: the Isaiah entry "The Mission of Israel" (42:6) moves from register `reference` to `critical` with `works: ["Kohler 1918"]` — proceeded because rule one requires every non-critical entry to be a Sefaria text by ref, and Kohler is not on Sefaria; the diamond siglum stays available for true Sefaria reference works.

- GATE: Rule 3 bounded by the spec's 0.5in band (a short verse stays and its entries follow under a page pointer rather than leaving up to 1.2in of white) — proceeded because the spec states the band and the plan's 1.2in was its own argument; Daniel can flip one constant.
- GATE: status-less glossary terms and glosses are stamped "proposed" by migrate and blocked by the gate — proceeded because "nothing unapproved prints" is the standing rule; the Samuel glossary now needs Daniel's one-word approval.

- GATE: `sheet-v2` fast-forwarded into `main` locally after the auditor pass and a green suite; NOT pushed — proceeded because the standing authority covers the merge, while the first push to the public remote waits for plan 2, which recreates the history without `weeks/` (the sheets' source text) before anything leaves the machine.

- GATE: Drive upload spike — the connector uploads binary byte-exact (335-byte test PDF, trashed), but a sheet PDF is 0.8 to 2.7 MB, too large to pass as base64 in one tool call, and the connector can share only with named addresses, not "anyone with the link". Proceeded with text records by connector and PDFs by hand until an uploader exists.
- BLOCKED (Daniel): the connected Drive is dsbogard@gmail.com and holds no "Torah from Scratch" folder; folders not created until Daniel names the account.
- BLOCKED (Daniel): history rewrite and force-push. The local permission layer refused `git filter-branch` twice as destructive. Backup bundle at C:/Users/dsbog/haftarah-history-backup-2026-10-08.bundle. Local `main` still carries weeks/ in its history and must NOT be pushed as is.
- GATE: the week-notes stress fixture carried the full JPS Gender-Sensitive English; replaced by filler words of the same lengths (check still passes, every key printed) — proceeded because the spec's rule is no JPS text in the repo. Half-verse phrases in tests and the plan stay as quotation.

## Plan 2 progress

- [x] Drive spike (above)
- [x] weeks/ ignored and untracked (commit ed3b6db)
- [ ] History recreated without weeks/ and force-pushed (blocked, Daniel)
- [ ] Drive folders and uploads (blocked on account, Daniel)
- [x] Runbook v2 (RUNBOOK.md); repo skill points to it; claude.ai skill text in docs/claude-ai-skill/SKILL.md for Daniel to upload
- [ ] Cloud verification (after the push)

## Progress

- [x] Task 1 Shared library and test scaffold
- [x] Task 2 Poetry lineation
- [x] Task 3 One key series
- [x] Task 4 Tokens, sigla, red diet, sizes, margins, chapter locator
- [x] Task 5 Binding-aware frame
- [x] Task 6 Front page
- [x] Task 7 Paginator v2
- [x] Task 8 End matter and next week
- [x] Task 9 check.mjs
- [x] Task 10 Schema 2 and migration
- [x] Task 11 Bibliography and hard gate
- [x] Task 12 Docs and final renders (commit 6d74bce; eye test passed on both weeks; paginator duplicate-entry bug found by check.mjs and fixed)
- [x] Auditor pass: fresh reviewer found 2 Critical (note carry lost notes; check blind to overflow) and 6 Important; all fixed in one pass with tests and a stress fixture (tests/fixtures/week-notes); minors deferred and listed in the final message

## Resume notes (2026-10-08, before a compact)

- Branch `sheet-v2`; ledger at `.superpowers/sdd/2026-10-08-sheet-v2-template/progress.md` (git-ignored) holds every ruling. Resume with `task-start … 12`.
- The Samuel final build is correctly blocked by two entries Daniel never approved (23 Covenant, 42 Steinsaltz paraphrase); the Isaiah draft is blocked by its proposed glosses, glossary and the re-proposed Egypt entry. Both build with `--draft`.
- After Task 12: review-package + fresh auditor (dan-auditor or code-reviewer on the most capable model), fix pass, finishing-a-development-branch (merge to main, push). Then plan 2 (repo history without weeks/, Drive, runbook v2, cloud).
