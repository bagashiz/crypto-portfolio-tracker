---
phase: 06-realized-pnl-and-sell-log
plan: 02
subsystem: infra
tags: [googleapis, google-sheets, layout-builder, rename, idempotency]

# Dependency graph
requires:
  - phase: 06-01
    provides: "config.js DCA_LOG='Transaction Log' + DCA_LOG_LEGACY='DCA Log'; dcaLogSheet.js dcaLogConditionalPreClearRequests export"
provides:
  - "index.js runUpdate: old-title-aware log-tab discovery (new title, fall back to legacy) with in-place updateSheetProperties(fields:'title') rename — never delete+recreate"
  - "Exported pure resolveLogTabRequests(tabs) helper (offline-testable rename/discovery decision)"
  - "Log-tab conditional-format pre-clear routed through its own error-tolerant batch (mirrors Dashboard WR-01)"
  - "Import-safe index.js entry guard (CLI runs only on direct invocation)"
affects: [layout-builder, apps-script, transaction-log]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pure request-builder helper over a title->sheetId Map for offline unit testing of Sheets request assembly"
    - "import.meta.main ?? pathToFileURL(argv[1]) entry guard so an ESM CLI is import-safe"

key-files:
  created:
    - layout-builder/src/index.test.js
  modified:
    - layout-builder/src/index.js

key-decisions:
  - "In-place rename via updateSheetProperties(fields:'title') — sheetId is stable across rename, so pre-clears target the correct id regardless of title state"
  - "Log-tab conditional pre-clear sent in its OWN error-tolerant batch (separate from Dashboard's) so a rule-count drift on either tab can't roll back the structural re-apply"
  - "Extracted resolveLogTabRequests as an exported pure function so the rename/idempotency/never-delete invariants are tested with no live Sheets client"

patterns-established:
  - "Pure decision helper + entry guard: side-effect-free exports from a CLI module, main() gated behind invokedDirectly"

requirements-completed: [PNL-05]

# Metrics
duration: ~12min
completed: 2026-06-20
---

# Phase 6 (Plan 02): In-place Transaction Log rename Summary

**`--update` upgrades an existing "DCA Log" tab to "Transaction Log" in place via a field-mask `updateSheetProperties` rename (never delete+recreate), idempotent on reruns, with the log-tab conditional pre-clear isolated in an error-tolerant batch — Apps Script confirmed a no-op.**

## Performance

- **Duration:** ~12 min
- **Completed:** 2026-06-20
- **Tasks:** 2
- **Files modified:** 2 (1 created, 1 modified)

## Accomplishments
- `runUpdate` now resolves the log tab by the new title first, falls back to the legacy "DCA Log" title, and renames it in place with a single `updateSheetProperties(fields: "title")` request prepended to the structural batch — preserving every transaction data row.
- Idempotent: when the tab is already "Transaction Log", no rename request is emitted.
- Log-tab conditional-format pre-clear added in its own `isNoConditionalRuleAtIndexError`-guarded batch, mirroring the Dashboard WR-01 pattern.
- New offline test suite (`index.test.js`, 6 tests) proves the rename request shape, idempotent skip, never-delete invariant, the data-preserving field mask, and the both-titles-absent error.
- Apps Script verified as a **no-op**: the only `getSheetByName` reference in `apps-script/src/` is `DASHBOARD_SHEET = "Dashboard"` (Refresh.ts:202) — no log-tab reference, so no Apps Script edit, no `bun build`, no `clasp push`.

## Task Commits

Each task was committed atomically:

1. **Task 1: in-place rename + log pre-clear in runUpdate** - `9da415d` (feat)
2. **Task 2: offline rename/idempotency/never-delete tests + CLI entry guard** - `428bc15` (test)

## Files Created/Modified
- `layout-builder/src/index.js` - Imports `DCA_LOG_LEGACY` + `dcaLogConditionalPreClearRequests`; new exported pure `resolveLogTabRequests(tabs)` (new-title → legacy fallback → field-mask rename / idempotent skip / throws on neither); `runUpdate` prepends the rename to the structural batch and adds the log-tab pre-clear in its own error-tolerant batch; `main()` gated behind an `invokedDirectly` entry guard so the module is import-safe.
- `layout-builder/src/index.test.js` - New offline suite (6 tests) over `resolveLogTabRequests`.

## Decisions Made
- See key-decisions frontmatter. The pre-clears use the legacy/current sheetId directly because a rename changes only the title, never the sheetId.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Import-safe entry guard for index.js**
- **Found during:** Task 2 (offline test setup)
- **Issue:** `index.js` called `main().catch(...)` at the top level unconditionally. Importing `resolveLogTabRequests` from the test would execute the CLI, which (with no `--build`/`--update` in test argv) throws USAGE and calls `process.exit(1)` — killing the bun test runner. The plan required a pure offline-testable helper exported from `index.js` but did not call out that the module's top-level `main()` made it import-unsafe.
- **Fix:** Wrapped `main().catch(...)` in an `invokedDirectly` guard (`import.meta.main ?? import.meta.url === pathToFileURL(process.argv[1]).href`) and added the `node:url` import. CLI behavior on direct invocation is unchanged (verified: no-flags run still prints usage and exits 1).
- **Files modified:** layout-builder/src/index.js
- **Verification:** `bun test` full suite 50 pass / 0 fail; `node src/index.js` (no flags) still exits 1 with usage.
- **Committed in:** `428bc15` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 missing critical)
**Impact on plan:** Necessary to enable the plan's mandated offline test of the exported helper. No behavioral change to the CLI; no scope creep.

## Issues Encountered
- The plan's automated grep for the Apps Script no-op (`grep -v "Dashboard"`) returns 1, not 0, because the Dashboard's `getSheetByName(DASHBOARD_SHEET)` uses the uppercase constant name `DASHBOARD_SHEET`, which the case-sensitive filter doesn't strip. That single line is unambiguously a Dashboard reference (`DASHBOARD_SHEET = "Dashboard"`), not a log-tab one — so the no-op holds. No log-tab (`"DCA Log"` / `"Transaction Log"`) reference exists in `apps-script/src/`.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- D-07 cross-runtime rename complete: an existing "DCA Log" spreadsheet upgrades to "Transaction Log" on `--update` with zero data loss; Phase 6 realized-PnL conditional formatting applies idempotently.
- PNL-05 fully delivered across plans 06-01 + 06-02.

---
*Phase: 06-realized-pnl-and-sell-log*
*Completed: 2026-06-20*
