---
phase: 05-pnl-allocation
verified: 2026-06-20T00:00:00Z
status: passed
score: 5/5 must-haves verified
overrides_applied: 0
human_verification_resolved: 2026-06-21
human_verification_resolution: "All three live/visual checks confirmed against the real spreadsheet on 2026-06-21. Live `--update` exercised the conditional-format pre-clear path and surfaced a real bug (the error-tolerance matcher did not match the real Sheets API message `No conditional format on sheet: <id> at index: <n>`), fixed under quick task 260621-m70 (commit 670ac15). After the fix: (1) `--update` reported transaction data untouched and the user confirmed the data row survived byte-for-byte with the summary recomputing; (2) repeated `--update` converged to exactly 3 Dashboard + 2 Transaction Log conditional-format rules with no stacking (verified by live spreadsheets.get); (3) user confirmed green-gain/red-loss rendering and PnL $ = Value − Qty × AvgCost on the live sheet."
---

# Phase 5: PnL & Allocation Verification Report

**Phase Goal:** Users see accurate unrealized PnL and allocation health in the Dashboard, driven by DCA transaction entries in the DCA Log tab
**Verified:** 2026-06-20 (code-level) · **Live checks resolved:** 2026-06-21
**Status:** passed
**Re-verification:** No — initial verification; 3 human/live checks resolved 2026-06-21 (see frontmatter `human_verification_resolution`)

## Goal Achievement

All five ROADMAP success criteria are ACHIEVED at the code level. Every PnL/allocation
formula, the cross-sheet single-source-of-truth reference, the conditional-format
idempotency strategy (CR-01 fixed), and the cross-runtime STATUS column geometry contract
are present and substantively correct in the codebase, and the full test suite passes
69/0. Status is `human_needed` (not `passed`) only because three properties are
runtime/visual — live persistence across `--update`, the atomic `--build` batchUpdate, and
the green/red conditional-format rendering — which cannot be observed from source alone.

### Observable Truths

| # | Truth (Success Criterion) | Status | Evidence |
|---|---------------------------|--------|----------|
| 1 | User can enter a DCA transaction and it persists across `--update` | ✓ VERIFIED (structural) | `index.js:138-145` `--update` appends only `dashboardUpdateRequests`/`dcaLogUpdateRequests`; data-safety test `dcaLogSheet.test.js:65-75` proves NO update request range reaches `endRowIndex > DATA_START_ROW_0BASED (22)` and none starts inside the data region. Live round-trip → human. |
| 2 | DCA Log summary computes invested, qty, DCA-weighted avg cost, buy count, last buy, fees — single source of truth | ✓ VERIFIED | `dcaLogSheet.js:176-192` emits BUY-filtered SUMIFS (Total Invested, Total Qty, Total Fees), Avg Cost = `Invested/Qty` (line 184), COUNTIFS buy count (186), MAXIFS last buy (188); all `IFERROR(…,"—")`. Dashboard AvgCost references this cell, no duplicate SUMIF on Dashboard. |
| 3 | Dashboard shows unrealized PnL $ and % = `Value − Qty × AvgCost` | ✓ VERIFIED | `dashboardSheet.js:323` PnL $ `=IFERROR(D{r}-B{r}*G{r},"—")`; line 326 PnL % `=IFERROR((D{r}-B{r}*G{r})/(B{r}*G{r}),"—")`. Value `=B*C` (312), AvgCost cross-sheet ref `'DCA Log'!$D$row` (320-321). Live arithmetic spot-check → human. |
| 4 | PnL cells green for gains / red for losses via conditional formatting, no manual step | ✓ VERIFIED (structural) | `dashboardSheet.js:230-234` NUMBER_GREATER→GREEN_FILL (idx 0), NUMBER_LESS→RED_FILL (idx 1) over cols H+I. Rendering on a live sheet → human. |
| 5 | Allocation zone: target %, actual %, drift, risk per asset + TOTALS (target sum, blended risk via SUMPRODUCT) | ✓ VERIFIED | `dashboardSheet.js:364` Target, 369 Actual `=Value/total`, 372 Drift `=C-B`, 374 Risk; TOTALS target sum 385; blended risk `=SUMPRODUCT(E:E, IFERROR(C:C,0))` 395-396; drift red flag `=ABS(D{r})>=0.05` 247-249. |

**Score:** 5/5 truths verified (code-level). 3 routed to human for live/visual confirmation.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `layout-builder/src/dcaLogSheet.js` | BUY-only SUMIFS/COUNTIFS/MAXIFS summary | ✓ VERIFIED | Lines 170-192; `formulaCell`/`formulaRowRequest` helpers; data-region bounded |
| `layout-builder/src/dashboardSheet.js` | PnL + allocation formulas + conditional formatting + cross-sheet AvgCost | ✓ VERIFIED | PnL 311-327, allocation 357-398, conditional-format 210-252, CR-01 gating 416-440 |
| `apps-script/src/Refresh.ts` | STATUS geometry sync + Qty/Price-only write | ✓ VERIFIED | `STATUS_LASTUPDATED_COL = STATUS_START_COL+1 = 12` (162-163); write `getRange(…,QTY_COL=2,…,VALUE_COLS=2)` excludes Value col D (208, 220) |
| `*.test.js` / `Refresh.test.ts` | Inverted (formula-expecting) + safety + CR-01 + geometry assertions | ✓ VERIFIED | 69 pass / 0 fail; CR-01 regression at `dashboardSheet.test.js:102-123`; geometry at `Refresh.test.ts:165-185` |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| Dashboard AvgCost cell (G) | DCA Log summary Avg Cost cell (D) | `'DCA Log'!$D${row}` cross-sheet ref | ✓ WIRED | `dashboardSheet.js:320-321`; single source of truth, no duplicated SUMIF on Dashboard |
| DCA Log summary Avg Cost | Transaction data region (rows 23+) | open-ended `$H$23:$H` / `$E$23:$E` SUMIFS | ✓ WIRED | `dcaLogSheet.js:174-188`; reads but never writes data region |
| Refresh.ts status write | Layout STATUS_START_COL (col K=11) | `STATUS_LASTUPDATED_COL = 11+1 = 12` | ✓ WIRED | Invariant holds: `STATUS_START_COL(dashboard)=11` == `STATUS_LASTUPDATED_COL(Refresh)−1 = 12−1 = 11` ✓ |
| Refresh.ts Qty/Price write | Dashboard cols B,C (not D) | `getRange(row,2,N,2)` | ✓ WIRED | `Refresh.ts:208,220`; col D `=B*C` formula never clobbered |

### CR-01 Fix Verification (Task 3)

| Check | Expected | Actual | Status |
|-------|----------|--------|--------|
| `dashboardBuildRequests` deletes | 0 | `structuralRequests(…, false)` → loop gated off (`dashboardSheet.js:431, 216`) | ✓ PASS |
| `dashboardUpdateRequests` deletes | exactly 3 | `structuralRequests(…, true)` → `for i=2..0` (439, 217-218) | ✓ PASS |
| Delete index order | descending `[2,1,0]` | `for (let i = MANAGED_RULE_COUNT-1; i >= 0; i--)` | ✓ PASS |
| Regression test (build=0) | asserted | `dashboardSheet.test.js:118-121` `expect(deletes.length).toBe(0)` | ✓ PASS |
| Regression test (update=[2,1,0]) | asserted | `dashboardSheet.test.js:102-111` `toEqual([2,1,0])` | ✓ PASS |
| Commit | fix present | `4b361d6 fix(05): CR-01 gate conditional-format pre-clear to --update only` | ✓ PASS |

**Conclusion:** CR-01 is RESOLVED. A fresh `--build` (tab has 0 rules) emits zero positional
deletes, so the atomic `batchUpdate` no longer rolls back on `400 No conditional format rule
found at index`. The `--update` path still pre-clears 3 rules in descending order so re-runs
never stack duplicates.

### Cross-Runtime STATUS Invariant (Task 4)

| Side | Constant | Value | File:line |
|------|----------|-------|-----------|
| Layout builder | `STATUS_START_COL` | 11 (col K) | `dashboardSheet.js:70` |
| Apps Script | `STATUS_START_COL` | 11 (col K) | `Refresh.ts:162` |
| Apps Script | `STATUS_LASTUPDATED_COL` | `11 + 1 = 12` (col L) | `Refresh.ts:163` |

**Invariant:** `STATUS_START_COL (11) == STATUS_LASTUPDATED_COL − 1 (12 − 1 = 11)` → **11 == 11 ✓ HOLDS.**
Asserted in `Refresh.test.ts:165` (`expect(STATUS_LASTUPDATED_COL).toBe(12)`).

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full test suite | `bun test` | 69 pass / 0 fail / 395 expect() | ✓ PASS |
| CR-01 build=0 deletes | `bun test` (dashboardSheet.test.js) | included in pass | ✓ PASS |
| CR-01 update=[2,1,0] | `bun test` | included in pass | ✓ PASS |
| Geometry STATUS_LASTUPDATED_COL=12 | `bun test` (Refresh.test.ts) | included in pass | ✓ PASS |
| Qty/Price write 2-wide | `bun test` | included in pass | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| PNL-01 | 05-01 | Record DCA transactions in DCA Log tab | ✓ SATISFIED | Columns from Phase 2; data region untouched by update (`index.js:138-145`) |
| PNL-02 | 05-01 | Per-asset summary, DCA-weighted avg cost, single source | ✓ SATISFIED | `dcaLogSheet.js:176-192` |
| PNL-03 | 05-02, 05-03 | Dashboard unrealized PnL $ + % | ✓ SATISFIED | `dashboardSheet.js:323,326`; Refresh write excludes Value col |
| PNL-04 | 05-02 | Green/red conditional formatting | ✓ SATISFIED (structural) | `dashboardSheet.js:230-234` (live render → human) |
| ALLOC-01 | 05-02 | Target %, actual %, drift per asset | ✓ SATISFIED | `dashboardSheet.js:364,369,372` |
| ALLOC-02 | 05-02 | Risk per asset + totals (target sum, blended risk SUMPRODUCT) | ✓ SATISFIED | `dashboardSheet.js:374,385,395-396` (APY/yield scratched per CONTEXT) |

No orphaned requirements — all 6 IDs mapped to Phase 5 in REQUIREMENTS.md are claimed by a plan.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (none) | — | No TBD/FIXME/XXX/HACK/PLACEHOLDER in any Phase 5 source file | — | No debt-marker blockers |

### Human Verification — RESOLVED 2026-06-21

All three live/visual checks were executed against the real spreadsheet on 2026-06-21 and PASS. The live `--update` run flushed out a real defect in the conditional-format pre-clear error tolerance (the matcher did not recognize the actual Sheets API message), fixed under quick task `260621-m70` (commit `670ac15`); the checks below were confirmed after that fix.

1. **DCA persistence across `--update`** — ✓ PASS. `--update` reported transaction data untouched; user confirmed the data row survived byte-for-byte and the summary recomputed.
2. **Fresh-state `--build`/repeated `--update`** — ✓ PASS. After the 260621-m70 fix, `--update` no longer aborts on the pre-clear; repeated `--update` converged to exactly **3 Dashboard + 2 Transaction Log** conditional-format rules with no stacking (confirmed via live `spreadsheets.get`). The stuck Phase 6 rename `DCA Log` → `Transaction Log` also landed on this run.
3. **PnL color + arithmetic on a live sheet** — ✓ PASS. User confirmed green-gain / red-loss rendering and `PnL $ = Value − Qty × AvgCost` on the live sheet.

### Gaps Summary

No blocking gaps. CR-01 (the sole Critical REVIEW finding) is RESOLVED and regression-tested.
All 5 success criteria and all 6 requirements are satisfied at the code level with concrete
evidence, and the cross-runtime STATUS invariant holds numerically (11 == 11). The phase is
gated to `human_needed` solely for three live/visual confirmations that source inspection
cannot perform.

**Residual non-Critical REVIEW.md findings (carry-forward, non-blocking):**
- WR-01/WR-02: status-block `"—"` sentinel and status-vs-blob ordering fragility (Refresh.ts) — cosmetic/robustness, not goal-blocking.
- WR-03: dead `lastAssetRow`/`STATUS_SOL_ROW` `void` statements (Refresh.ts).
- WR-04: `DRIFT_TOLERANCE` float inlined into CUSTOM_FORMULA — confirm against pinned locale.
- IN-01: `VALUE_COLS` naming; IN-02: duplicated request helpers; IN-03: stale test comment.
These are quality/robustness improvements with no impact on the Phase 5 goal.

---

_Verified: 2026-06-20_
_Verifier: Claude (gsd-verifier)_
