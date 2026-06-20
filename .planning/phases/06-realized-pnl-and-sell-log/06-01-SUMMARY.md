---
phase: 06-realized-pnl-and-sell-log
plan: 01
subsystem: layout-builder
tags: [google-sheets, googleapis, byrow, conditional-formatting, realized-pnl, sumifs]

# Dependency graph
requires:
  - phase: 05-pnl-allocation
    provides: BUY-only DCA cost-basis summary formulas + formulaRowRequest/numberFormatRequest helpers in dcaLogSheet.js
  - phase: 02-layout-builder
    provides: conditional-format helper pattern (addConditionalFormatRule/deleteConditionalFormatRule, descending-index pre-clear) in dashboardSheet.js
provides:
  - "DCA_LOG constant renamed to 'Transaction Log'; new DCA_LOG_LEGACY = 'DCA Log' for in-place rename discovery (Plan 02)"
  - "Per-row realized-PnL helper: single row-22 BYROW(A:I) spill formula (col J) computing (Total-Fee) - Qty*avgCostAsOf(date) per SELL row"
  - "Per-asset realized summary metrics (Sold Qty / Net Proceeds / Realized $ / Realized %) via a SELL-only SUMIFS loop"
  - "Portfolio Total Realized cell (SUM of per-asset Realized $)"
  - "Green/red conditional formatting on Realized $/Realized % summary cells (2 managed rules; build add-only, update pre-clears)"
  - "dcaLogConditionalPreClearRequests(sheetId) export for Plan 02's error-tolerant pre-clear batch"
affects: [06-02, index.js, tab-rename]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Whole-row BYROW(A:I)+LAMBDA+LET spill anchored at the header cell (row 22) — avoids per-row data-region writes and the duplicate-date MATCH bug"
    - "SELL-only realized summary loop kept strictly separate from the Phase 5 BUY-only loop (independent Type filters, distinct startCol)"
    - "Conditional-format helpers copied per-tab (Option A, no shared module) with build=add-only / update=descending pre-clear gating"

key-files:
  created: []
  modified:
    - layout-builder/src/config.js
    - layout-builder/src/dcaLogSheet.js
    - layout-builder/src/dcaLogSheet.test.js
    - layout-builder/src/dashboardSheet.test.js

key-decisions:
  - "Realized % denominator = NetProceeds − Realized$ (cost basis of sold units), never the current Avg Cost cell (RESEARCH Pitfall 4)"
  - "BYROW spill anchored at row 22 (TX_HEADER_ROW) col J, emitted AFTER the TX header label so the formula wins the J22 cell; the only mechanism that 'touches' rows >= 23 is a formula STRING, never a request range"
  - "Total Realized cell placed in the summary band (row 1, col L), not the Dashboard (D-03)"
  - "Conditional-format helpers copied into dcaLogSheet.js (Option A, lowest churn) rather than extracted into a shared module"

patterns-established:
  - "Header-cell spill: a single updateCells at TX_HEADER_ROW carries an open-ended array formula that spills into the protected data region without any data-region request range"
  - "Per-tab managed conditional-format rule count + descending-index pre-clear export, mirroring dashboardConditionalPreClearRequests"

requirements-completed: [PNL-05]

# Metrics
duration: 18min
completed: 2026-06-20
---

# Phase 6 Plan 01: SELL Semantics & Realized PnL Summary

**Transaction Log builder now books per-row realized PnL via a single row-22 BYROW spill, per-asset realized summary metrics (Sold Qty / Net Proceeds / Realized $ / Realized %), a portfolio Total Realized cell, and green/red conditional formatting — all strictly above the protected data region (row 23).**

## Performance

- **Duration:** ~18 min
- **Started:** 2026-06-20T17:55Z
- **Completed:** 2026-06-20T18:13Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Renamed the `DCA_LOG` tab constant to "Transaction Log" and added `DCA_LOG_LEGACY = "DCA Log"` for Plan 02's in-place rename discovery (D-07).
- Added a per-row realized-PnL helper as a SINGLE row-22 `BYROW(A23:I23, LAMBDA(... LET(...)))` spill (col J): blank/BUY rows spill empty, SELL rows spill `(Total-Fee) - Qty*avgCostAsOf(date)` where avgCostAsOf is the BUY-weighted running average over BUY rows dated `<=` the SELL date.
- Added a SELL-only per-asset realized summary loop (Sold Qty / Net Proceeds / Realized $ / Realized %) plus a portfolio Total Realized cell, leaving the Phase 5 BUY-only loop byte-for-byte unchanged.
- Reused the Dashboard green/red conditional-format pattern on the Realized $/% summary cells (2 managed rules; build adds only, update pre-clears descending then re-adds) and exported `dcaLogConditionalPreClearRequests` for Plan 02.

## Task Commits

Each task was committed atomically:

1. **Task 1: Rename constant, extend headers/formats, emit realized summary metrics + spill helper** - `f336924` (feat)
2. **Task 2: Add conditional formatting to the log tab + update the test suite** - `62f59e8` (feat)

_Note: this is a `tdd="true"` plan; both tasks bundled their implementation and test updates per the plan's task decomposition (Task 2 owns all test assertions for the realized/conditional features)._

## Files Created/Modified
- `layout-builder/src/config.js` - `DCA_LOG` value changed to "Transaction Log"; added `DCA_LOG_LEGACY = "DCA Log"` rename-discovery constant.
- `layout-builder/src/dcaLogSheet.js` - Extended `TX_HEADERS` (+"Realized"), `SUMMARY_HEADERS` (+5 realized labels), added `PERCENT_FORMAT`; SELL-only realized summary loop; row-22 BYROW spill; Total Realized cell; widened currency/percent formats; copied conditional-format helpers + `DCA_LOG_MANAGED_RULE_COUNT`; `preClearConditionalRules` param threaded through `bandRequests`; exported `dcaLogConditionalPreClearRequests`.
- `layout-builder/src/dcaLogSheet.test.js` - `EXPECTED_HEADERS` now 10 cols; inverted the "no conditional formatting" assertion; added realized-formula/spill/range assertions, SELL-summary assertion, and the pre-clear-export assertion; extended `extractRanges` to cover `addConditionalFormatRule` ranges so the critical data-region guard sees them.
- `layout-builder/src/dashboardSheet.test.js` - Updated the cross-sheet AvgCost reference assertion from `'DCA Log'!$D` to `'Transaction Log'!$D` (propagated by the tab rename).

## Decisions Made
- **Realized % denominator** = `NetProceeds − Realized$` (Pitfall 4), avoiding a second helper column and never using the current Avg Cost cell.
- **Spill placement**: emitted after the TX header label so the BYROW formula wins J22; the open-ended `A23:I` ranges live only inside the formula string, so no request range ever addresses the data region (T-06-01 mitigation).
- **Conditional-format helpers** copied per-tab (Option A) rather than extracted to a shared module — lowest churn, matches the existing dashboardSheet.js pattern.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Updated dashboardSheet.test.js cross-sheet reference to the renamed tab**
- **Found during:** Task 2 (full-suite verification)
- **Issue:** Renaming `DCA_LOG` to "Transaction Log" propagated through `dashboardSheet.js` (which builds the AvgCost cross-sheet ref from the `DCA_LOG` config import), so a pre-existing dashboard test asserting `'DCA Log'!$D` failed. This failure was directly caused by this plan's config rename and blocked the `bun test` (no regression) verification gate.
- **Fix:** Updated the assertion to expect `'Transaction Log'!$D` (the new, correct reference). The production code was already correct; only the stale test literal needed updating.
- **Files modified:** layout-builder/src/dashboardSheet.test.js
- **Verification:** Full `bun test` exits 0 (44 pass, 0 fail).
- **Committed in:** `62f59e8` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** The fix was a stale test literal made wrong by the in-scope D-07 rename; correcting it was required for the plan's "no regression in other suites" verification gate. No scope creep.

## Issues Encountered
None — both tasks executed as planned. The PATTERNS.md `@`-reference in the plan's `<read_first>` was absent from the worktree (untracked in the base commit), but all needed templates were available in 06-RESEARCH.md and dashboardSheet.js, so no information was lost.

## TDD Gate Compliance
This is a `tdd="true"` plan. The plan's task decomposition intentionally bundles each task's implementation and test updates into a single feat commit (rather than separate RED/GREEN commits) — Task 1 implements config + realized logic with the existing suite kept green, and Task 2 inverts/adds all realized + conditional-format assertions alongside the conditional-format implementation. Both task commits are `feat(...)`; the final state has the full 16-test dcaLogSheet suite plus the dashboard suite passing (44 total).

## User Setup Required
None - no external service configuration required. (The tab rename is applied programmatically by `index.js` in Plan 02; no manual sheet editing.)

## Next Phase Readiness
- Plan 02 (index.js wiring) can consume `DCA_LOG_LEGACY` for old-title discovery, the in-place `updateSheetProperties` rename, and `dcaLogConditionalPreClearRequests(sheetId)` for its error-tolerant pre-clear batch.
- The never-write-the-data-region guard and the BUY-only summary are provably intact (critical data-region test green; BUY-only filter test green).
- No blockers.

## Self-Check: PASSED

All claimed files exist and all task/summary commits are present in git history:
- Files: config.js, dcaLogSheet.js, dcaLogSheet.test.js, dashboardSheet.test.js, 06-01-SUMMARY.md — FOUND
- Commits: f336924 (Task 1), 62f59e8 (Task 2), a73d095 (SUMMARY) — FOUND
- Verification: full `bun test` exits 0 (44 pass, 0 fail).

---
*Phase: 06-realized-pnl-and-sell-log*
*Completed: 2026-06-20*
