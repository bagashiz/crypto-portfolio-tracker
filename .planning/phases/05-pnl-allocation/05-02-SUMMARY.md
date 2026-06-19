---
phase: 05-pnl-allocation
plan: 02
subsystem: ui
tags: [google-sheets, layout-builder, formulas, conditional-formatting, pnl, allocation]

# Dependency graph
requires:
  - phase: 02-layout-builder
    provides: "dashboardSheet.js skeleton (structuralRequests, labelRowRequest, numberFormatRequest, Zone A/B + status-block constants)"
  - phase: 02-layout-builder
    provides: "dcaLogSheet.js summary block geometry (FIRST_SUMMARY_ROW=2, Avg Cost = summary col D, per-asset rows in assets.json order)"
provides:
  - "Zone A unrealized PnL: Value(D)=B*C, AvgCost(G) cross-sheet ref, PnL $(H), PnL %(I) with IFERROR em-dash (PNL-03)"
  - "Green/red background-fill conditional formatting on PnL $/% (PNL-04)"
  - "Zone B allocation health: Target %, Actual %, Drift, Risk + TOTALS (target sum, blended-risk SUMPRODUCT) (ALLOC-01, ALLOC-02)"
  - "Red Drift flag (|drift| >= 5pp) via CUSTOM_FORMULA conditional format"
  - "Relocated status block at STATUS_START_COL=11 (col K) — the cross-runtime geometry value Plan 03 (Refresh.ts) must match"
affects: [05-03, "Refresh.ts status-block columns", "Phase 6 realized PnL"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "formulaCell/formulaRowRequest/formulaCellRequest helpers mirror stringCell/labelRowRequest, emitting userEnteredValue.formulaValue"
    - "numberCell/numberCellRequest for static registry values (Target %, Risk)"
    - "addConditionalFormatRule + deleteConditionalFormatRule builders (NEW request type, no prior analog)"
    - "delete-then-add idempotency for conditional-format rules (pre-clear managed indices [N-1..0] descending)"

key-files:
  created: []
  modified:
    - "layout-builder/src/dashboardSheet.js"
    - "layout-builder/src/dashboardSheet.test.js"

key-decisions:
  - "STATUS_START_COL = 11 (col K) — one-col gap right of new Zone A last col I; Refresh.ts STATUS_LASTUPDATED_COL must become 12 in Plan 03"
  - "MANAGED_RULE_COUNT = 3 (one green + one red PnL rule spanning H+I, one red Drift rule) — each rule spans its full column range"
  - "Drift tolerance 0.05 (5 percentage points absolute) via CUSTOM_FORMULA =ABS(D{row})>=0.05"
  - "AvgCost references DCA Log via config DCA_LOG (quoted sheet name) rather than hardcoding"

patterns-established:
  - "Pattern 1: formula helpers parallel the label helpers so build==update stays a single shared structuralRequests"
  - "Pattern 2: conditional-format idempotency via delete-then-add, safe-no-op on first --build"

requirements-completed: [PNL-03, PNL-04, ALLOC-01, ALLOC-02]

# Metrics
duration: 18min
completed: 2026-06-19
---

# Phase 5 Plan 02: Dashboard PnL & Allocation Formulas Summary

**Dashboard layout builder now emits per-asset unrealized PnL formulas (Value=B*C, PnL $=Value−Qty*AvgCost) with cross-sheet single-source AvgCost, green/red conditional-format fills, and Zone B allocation health (actual %, drift, blended-risk SUMPRODUCT), with the status block relocated to col K.**

## Performance

- **Duration:** ~18 min
- **Tasks:** 3
- **Files modified:** 2

## Accomplishments
- Zone A widened to cols A..I with Value/AvgCost/PnL formulas; APY % column dropped (D-01/D-02/D-03)
- AvgCost(G) references the DCA Log summary Avg Cost cell cross-sheet — single source of truth, no duplicated SUMIF (D-03)
- All leaf formulas wrapped in IFERROR em-dash; blended-risk SUMPRODUCT guards Actual % text with IFERROR(…,0) (D-06)
- Green PnL>0 / red PnL<0 background fills on cols H+I; red Drift flag (|drift| >= 5pp) on Zone B col D (D-07/PNL-04)
- Conditional-format rules made idempotent via delete-then-add so --update never stacks duplicates (T-05-03)
- Zone B reduced to A..E (Target/Actual/Drift/Risk + TOTALS); APY %/Monthly Yield dropped everywhere (D-05)
- Status block relocated to col K (STATUS_START_COL=11) — the geometry value Plan 03 (Refresh.ts) must match

## Task Commits

Each task was committed atomically:

1. **Task 1: Widen Zone A/B, add PnL + allocation formulas, relocate status block** - `dae5a55` (feat)
2. **Task 2: Add idempotent green/red conditional-format rules for PnL and Drift** - `7b141f8` (feat)
3. **Task 3: Invert dashboard skeleton assertions; bump Zone A last-col + status-col anchors** - `31f9339` (test)

_Note: Task 1 is `tdd="true"`; the plan orders source-first (Tasks 1-2) with the full test inversion in Task 3, so the formula source landed before the inverted assertions. Task 1's positive serialized-output criteria were verified inline before commit._

## Files Created/Modified
- `layout-builder/src/dashboardSheet.js` - Widened Zone A/B headers; formulaCell/formulaRowRequest/formulaCellRequest/numberCell helpers; per-asset Value/AvgCost/PnL $/PnL % formulas; Zone A TOTAL Value; Zone B Actual %/Drift + TOTALS target sum & blended-risk SUMPRODUCT; addConditionalFormatRule/deleteConditionalFormatRule builders + 3 managed rules with delete-then-add idempotency; STATUS_START_COL 9→11; exported ZONE_A_HEADERS/ZONE_B_HEADERS.
- `layout-builder/src/dashboardSheet.test.js` - Inverted the two skeleton-only assertions to assert formulaValue + addConditionalFormatRule present; bumped ZONE_A_LAST_COL_0BASED 6→8; added positive tests for headers, cross-sheet AvgCost ref, SUMPRODUCT, IFERROR em-dash, CF target ranges, and delete-then-add idempotency count.

## Decisions Made
- **STATUS_START_COL = 11 (col K):** one-column gap right of new Zone A last col I (9). Documented inline; Plan 03 sets Refresh.ts STATUS_LASTUPDATED_COL = 12.
- **3 managed conditional-format rules:** a green-PnL>0 and a red-PnL<0 rule each span both H and I (full column range), plus one red Drift rule — so MANAGED_RULE_COUNT=3, matching the delete count for stable idempotent re-runs.
- **Drift tolerance 0.05 absolute** (5 percentage points) via CUSTOM_FORMULA `=ABS(D{firstRow})>=0.05` (Claude's discretion per D-07).
- **AvgCost cross-sheet reference** built from the config `DCA_LOG` constant (quoted sheet name) rather than a hardcoded `'DCA Log'` literal — keeps the sheet name single-sourced.

## Deviations from Plan

None - plan executed exactly as written. The only minor judgment call (also flagged as Claude's discretion in the plan) was setting MANAGED_RULE_COUNT to 3 rather than 5: the plan's Task 2 prose described "green H/I, red H/I, red Drift" but a single rule range can span both H and I, so PnL is one green + one red rule (not per-column), giving 3 managed rules total. The delete count is kept equal to the add count so idempotency holds.

## Issues Encountered
None. All 3 layout-builder test files (39 tests) pass; the full repo suite (64 tests) passes with exit 0.

## User Setup Required
None - no external service configuration required. (This plan only changes the local layout builder's emitted requests; running `node --env-file=.env src/index.js --update` to apply them to the live sheet is the operator's normal workflow, unchanged.)

## Next Phase Readiness
- Plan 03 (Refresh.ts) must set `STATUS_LASTUPDATED_COL = 12` (col L) and `Stale?` = col M to match the relocated status block, and must NOT write Value col D (it is now a formula). The Qty/Price write already spans only B:C.
- The DCA Log summary Avg Cost cell (`'DCA Log'!$D$2..`) is referenced but its SUMIFS formulas are written by the DCA Log plan in this phase — the cross-sheet reference resolves once that summary block is populated.

---
*Phase: 05-pnl-allocation*
*Completed: 2026-06-19*
