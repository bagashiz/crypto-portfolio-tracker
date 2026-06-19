---
phase: 05-pnl-allocation
plan: 01
subsystem: layout-builder (DCA Log sheet)
tags: [formulas, cost-basis, sumifs, dca, single-source-of-truth, data-safety]
dependency_graph:
  requires:
    - "layout-builder/src/dcaLogSheet.js (Phase 2 skeleton band)"
    - "layout-builder/src/config.js (DATA_START_ROW=23, MAX_SUMMARY_ROWS=20)"
  provides:
    - "DCA Log summary block: BUY-only Total Invested / Total Qty / DCA-weighted Avg Cost / Buy Count / Last Buy / Total Fees per asset"
    - "Single source of truth for Avg Cost (Dashboard AvgCost references this cell, D-03)"
  affects:
    - "Plan 02 (Dashboard AvgCost col G references the summary Avg Cost cell)"
tech_stack:
  added: []
  patterns:
    - "formulaCell/formulaRowRequest helpers mirror stringCell/labelRowRequest"
    - "Open-ended A{DATA_START_ROW}:A ranges inside formula strings only (read, never write)"
    - "IFERROR(…, \"—\") em-dash empty state on every leaf"
key_files:
  created: []
  modified:
    - "layout-builder/src/dcaLogSheet.js"
    - "layout-builder/src/dcaLogSheet.test.js"
decisions:
  - "Avg Cost computed only in the DCA Log summary block (single source of truth, D-03)"
  - "BUY-only cost basis; SELL/realized PnL deferred to Phase 6 (D-04)"
  - "dataAnchor derived from imported DATA_START_ROW so formula strings track the constant"
metrics:
  duration: ~6min
  completed: 2026-06-19
  tasks: 2
  files: 2
---

# Phase 5 Plan 01: DCA Log BUY-only Cost-Basis Summary Formulas Summary

BUY-only SUMIFS/COUNTIFS/MAXIFS summary formulas (IFERROR em-dash wrapped) now fill the DCA Log fixed summary band, making it the single source of truth for DCA-weighted Avg Cost — with every request range proven to stay strictly above the protected transaction data region (row 23).

## What Was Built

### Task 1 — Summary formulas + helpers (`dcaLogSheet.js`)
- Added `formulaCell(formula)` helper emitting `userEnteredValue.formulaValue` (mirrors `stringCell`).
- Added `formulaRowRequest(sheetId, row, startCol, formulas)` helper (mirrors `labelRowRequest`), mapping entries through `formulaCell`; the request range spans exactly one summary row.
- In `bandRequests`, after the per-asset label loop, emits one formula row per asset at `FIRST_SUMMARY_ROW + i` starting at column B (2), with six BUY-only metrics:
  - Total Invested (B): `=IFERROR(SUMIFS($H$23:$H,$B$23:$B,$A{row},$C$23:$C,"BUY"),"—")`
  - Total Qty (C): `=IFERROR(SUMIFS($E$23:$E,…,"BUY"),"—")`
  - Avg Cost (D): `=IFERROR(Invested/Qty,"—")` — DCA-weighted, single source of truth
  - Buy Count (E): `=IFERROR(COUNTIFS(…,"BUY"),"—")`
  - Last Buy (F): `=IFERROR(MAXIFS($A$23:$A,…,"BUY"),"—")`
  - Total Fees (G): `=IFERROR(SUMIFS($G$23:$G,…,"BUY"),"—")`
- The `dataAnchor` literal (23) is derived from the imported `DATA_START_ROW` so formula strings track the constant.
- Added a DATE `numberFormatRequest` for the Last Buy column (F) over the reserved block.
- `build == update` preserved (both call `bandRequests`); reserved-but-unused summary rows stay blank.

### Task 2 — Inverted skeleton assertion (`dcaLogSheet.test.js`)
- Replaced the `not.toContain("formulaValue")` skeleton-only test with positive assertions: both build and update now `toContain("formulaValue")` and `toContain("SUMIFS")`.
- Kept the `not.toContain("addConditionalFormatRule")` assertion for both builders (no CF on the DCA Log tab, D-07).
- Added a new test asserting the BUY-only filter (`,"BUY"`), the three aggregate functions, `IFERROR`, and the em-dash empty state.
- Left the critical data-region assertion (every `endRowIndex <= 22`) and the `DATA_START_ROW === 23` literal test unchanged — both still pass against the new formula requests.

## Verification

- `bun test layout-builder/` → 34 pass, 0 fail, 178 expect() calls.
- Confirmed: the critical LAYOUT-02 assertion ("NO dcaLogUpdateRequests range touches a row at or below the data region") passes against the new formula requests — the open-ended `A$23:A` ranges appear only inside formula strings, never as write ranges. The summary formula request ranges sit at rows 2..9 (one per asset, 0-based start 1..7).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] BUY-filter test assertion accounted for JSON escaping**
- **Found during:** Task 2 verification
- **Issue:** The initial new test asserted `toContain('"BUY"')`, but `JSON.stringify` escapes the inner quotes, so the serialized string contains `,\"BUY\"` (escaped), not `"BUY"`. The assertion failed on otherwise-correct formula output.
- **Fix:** Changed the assertion to `toContain(',\\"BUY\\"')` to match the escaped serialized form.
- **Files modified:** layout-builder/src/dcaLogSheet.test.js
- **Commit:** bfecb35

## TDD Gate Compliance

Task 1 was marked `tdd="true"`. This plan splits implementation (Task 1, `feat`) from the test-assertion inversion (Task 2, `test`) per the plan's explicit two-task structure. The pre-existing `dcaLogSheet.test.js` already contained an inverted-skeleton harness (negative `not.toContain("formulaValue")`) that Task 2 flips to positive. Commit sequence: `feat(05-01)` (2113826) then `test(05-01)` (bfecb35). Note: because the test inversion is in a separate task from the implementation, a classic standalone RED commit (failing test before code) was not produced — the plan intentionally orders implementation first, then converts the existing assertion. All assertions are green at plan completion.

## Notes for Downstream Plans

- Plan 02 (Dashboard) must reference this summary block's Avg Cost cell for each asset's `AvgCost` (col G) — do NOT duplicate SUMIF logic (D-03). The Avg Cost cell is at DCA Log column D, summary row = `FIRST_SUMMARY_ROW + assetIndex` (row 2 for the first asset).
- The status-block relocation (D-01) and `Value`-as-formula change (D-02) are NOT in this plan — they belong to the Dashboard/Refresh plans in this wave.

## Self-Check: PASSED

- FOUND: `.planning/phases/05-pnl-allocation/05-01-SUMMARY.md`
- FOUND commit 2113826 (feat — summary formulas)
- FOUND commit bfecb35 (test — inverted skeleton assertion)
- FOUND commit 67963ec (docs — SUMMARY.md)
- Working tree clean
