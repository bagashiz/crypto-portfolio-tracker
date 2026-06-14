---
phase: 02-layout-builder
plan: 01
subsystem: infra
tags: [googleapis, sheets-api, esm, node, bun-test, service-account-jwt, batchupdate]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: layout-builder/ package (isolated googleapis dep), shared assets.json registry, config.js scaffold (DASHBOARD/DCA_LOG constants + assets re-export)
provides:
  - "config.js: SPREADSHEET_ID env-sourced with fail-fast + DATA_START_ROW data-region boundary"
  - "auth.js: getSheetsClient() authenticated Sheets v4 client via service-account JWT"
  - "dashboardSheet.js: dashboardBuildRequests/dashboardUpdateRequests (Zone A + Zone B skeleton)"
  - "dcaLogSheet.js: dcaLogBuildRequests/dcaLogUpdateRequests with provable data-region safety"
  - "testEnv.js: test-only env primer so config.js fail-fast does not block bun test"
affects: [02-02 (CLI orchestrator wiring), 05 (Phase 5 formulas + conditional formatting extend these builders)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pure request-builders: functions return Sheets API batchUpdate request arrays (no network, no Google globals) -> unit-testable offline"
    - "Data-region safety by omission: --update never addresses rows >= DATA_START_ROW (provably-correct, not read-detect-write)"
    - "Skeleton-only layout (D-08): labels + formats + frozen rows; no formulas, no conditional formatting"

key-files:
  created:
    - layout-builder/src/auth.js
    - layout-builder/src/dashboardSheet.js
    - layout-builder/src/dcaLogSheet.js
    - layout-builder/src/dashboardSheet.test.js
    - layout-builder/src/dcaLogSheet.test.js
    - layout-builder/src/testEnv.js
  modified:
    - layout-builder/src/config.js

key-decisions:
  - "DATA_START_ROW = assets.length + 3 (computed from registry, stays consistent as assets grow); currently row 10"
  - "auth.js uses google.auth.GoogleAuth with keyFile (resolved relative to module, cwd-independent), single auth/spreadsheets scope"
  - "build and update share the same structural request set per sheet (no separate clear step that could mis-address data)"
  - "testEnv.js dedicated import primes SPREADSHEET_ID before config.js evaluates (ES import-order workaround)"

patterns-established:
  - "Pure request-builder modules importing the registry only via config.js (single source of truth)"
  - "Structural ranges bounded strictly above DATA_START_ROW, asserted structurally in tests"

requirements-completed: [LAYOUT-01, LAYOUT-02]

# Metrics
duration: 8min
completed: 2026-06-14
---

# Phase 2 Plan 01: Layout Builder Foundation Summary

**Env-sourced config + service-account Sheets client + two pure skeleton request-builder modules (Dashboard Zone A/B and DCA Log top-of-data band), with the DCA Log `--update` set proven by unit test to never touch the transaction data region.**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-06-14T14:20:55Z
- **Completed:** 2026-06-14T14:28:36Z
- **Tasks:** 3
- **Files modified:** 7 (6 created, 1 modified)

## Accomplishments
- `config.js` now sources `SPREADSHEET_ID` from `process.env` with fail-fast on missing/placeholder, and exposes `DATA_START_ROW` (the irreversible-data-loss boundary).
- `auth.js` returns an authenticated Sheets v4 client via service-account JWT (single `auth/spreadsheets` scope, key resolved relative to module so cwd does not matter).
- `dashboardSheet.js` + `dcaLogSheet.js` emit skeleton-only structural request sets (headers, per-asset label rows, frozen rows, number formats) — no formulas, no conditional formatting (D-08).
- The DCA Log data-region safety guard (LAYOUT-02) is proven structurally: a unit test iterates every `dcaLogUpdateRequests` range and asserts none reaches a row at or below `DATA_START_ROW`, plus a deep-equal idempotency check.

## Task Commits

Each task was committed atomically (TDD tasks use test -> feat):

1. **Task 1: Rewire config.js to .env + add auth.js** - `865df52` (feat)
2. **Task 2 (RED): failing Dashboard tests** - `c2b56ef` (test)
3. **Task 2 (GREEN): Dashboard skeleton builders** - `1e42dfa` (feat)
4. **Task 3 (RED): failing DCA Log data-safety tests** - `71116dd` (test)
5. **Task 3 (GREEN): DCA Log skeleton + data-region safety** - `75aaeb2` (feat)

## Files Created/Modified
- `layout-builder/src/config.js` - SPREADSHEET_ID from env with fail-fast; new DATA_START_ROW boundary constant
- `layout-builder/src/auth.js` - getSheetsClient() service-account JWT -> Sheets v4 client
- `layout-builder/src/dashboardSheet.js` - Zone A (rows 1-10) + Zone B (rows 12-21) skeleton request-builders
- `layout-builder/src/dcaLogSheet.js` - top-of-data band builders; update set never addresses the data region
- `layout-builder/src/dashboardSheet.test.js` - non-empty/asset-row/skeleton-only assertions
- `layout-builder/src/dcaLogSheet.test.js` - exact header row, per-asset summary, CRITICAL data-region-safety, idempotency, skeleton-only
- `layout-builder/src/testEnv.js` - test-only env primer (sets SPREADSHEET_ID before config.js loads)

## Decisions Made
- `DATA_START_ROW = assets.length + 3` keeps the band boundary in lockstep with the registry (currently row 10: row 1 summary header, rows 2-8 per-asset, row 9 transaction header, row 10+ data).
- Build and update return the same structural set per sheet — for the DCA Log this is the simplest provably-correct mechanism (no clear step to mis-aim at the data region).
- Number formatting on the DCA Log is applied only to the header/summary band, never to the data region, to avoid addressing protected rows.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added testEnv.js to prime SPREADSHEET_ID before config.js evaluates**
- **Found during:** Task 2 (Dashboard tests, GREEN step)
- **Issue:** The plan's prescribed in-test `process.env.SPREADSHEET_ID ??= "..."` statement runs AFTER the file's own ES imports are evaluated. Because the test statically imports a module that transitively imports `config.js` (which fails fast on a missing ID), config threw before the env assignment could run.
- **Fix:** Created `layout-builder/src/testEnv.js`, a side-effect module that sets `SPREADSHEET_ID` and is imported as the FIRST import in both test files (import order is deterministic, so the env var exists before `config.js` is evaluated).
- **Files modified:** layout-builder/src/testEnv.js (new), layout-builder/src/dashboardSheet.test.js, layout-builder/src/dcaLogSheet.test.js
- **Verification:** `bun test` -> 12 pass / 0 fail across both files.
- **Committed in:** `1e42dfa` (Task 2 GREEN commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Necessary to satisfy the plan's own fail-fast requirement (D-02) while keeping tests credential-free. No scope creep; the fix is test-infrastructure only and adds no runtime behavior.

## Issues Encountered
- The phase `02-PATTERNS.md` is untracked in the main repo and therefore absent from this worktree; it was read from the main checkout path for context. No impact on deliverables.

## Verification Results
- `cd layout-builder && bun test` -> 12 pass, 0 fail, 72 expect() calls (config indirectly, Dashboard, DCA Log).
- DCA Log `--update` provably bounded above `DATA_START_ROW` (data-region-safety test green) and deterministic (deep-equal idempotency test green).
- `grep -rn "formulaValue\|addConditionalFormatRule"` in the two builder sources matches ONLY explanatory comments; emitted requests are formula-free (proven by `JSON.stringify(...).not.toContain(...)` assertions).
- `grep -rn "apps-script" layout-builder/src/` -> nothing (two-runtime isolation intact).
- config.js exports correct shapes with env set, and throws when unset (fail-fast verified).

## Known Stubs
None that block the plan's goal. The per-asset summary rows and Zone A/B body cells are intentionally label-only with empty value cells — formulas (SUMIF cost basis, PnL, allocation) and conditional formatting are deliberately deferred to Phase 5 per D-08 (a documented phase boundary, not an accidental stub). The Phase 5 SUMIF ranges have room below `DATA_START_ROW` by design (D-07).

## Next Phase Readiness
- Builders are the contracts Plan 02-02 (CLI orchestrator) wires together: `getSheetsClient()` + `dashboardBuildRequests`/`dashboardUpdateRequests` + `dcaLogBuildRequests`/`dcaLogUpdateRequests` -> single `batchUpdate` per `--build`/`--update`.
- Plan 02-02 still owns: `index.js` CLI dispatch, the `--build` tab-existence guard (D-04), and the `package.json` script migration to `node --env-file=.env`.
- No blockers for Plan 02-02. (Pre-existing Phase 3 blockers — Solana mint addresses + XAUt ticker — do not affect layout.)

---
*Phase: 02-layout-builder*
*Completed: 2026-06-14*
