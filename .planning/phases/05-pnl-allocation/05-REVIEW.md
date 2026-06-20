---
phase: 05-pnl-allocation
reviewed: 2026-06-20T00:00:00Z
depth: standard
files_reviewed: 6
files_reviewed_list:
  - apps-script/src/Refresh.test.ts
  - apps-script/src/Refresh.ts
  - layout-builder/src/dashboardSheet.js
  - layout-builder/src/dashboardSheet.test.js
  - layout-builder/src/dcaLogSheet.js
  - layout-builder/src/dcaLogSheet.test.js
findings:
  critical: 0
  warning: 3
  info: 3
  total: 6
status: issues_found
---

# Phase 5: Code Review Report (re-review)

**Reviewed:** 2026-06-20
**Depth:** standard
**Files Reviewed:** 6
**Status:** issues_found

## Summary

Re-review of Phase 5 (PnL & Allocation) after the CR-01 fix in commit `4b361d6`.
All 6 source files re-read; the full phase test suite (45 tests) passes.

**CR-01 (prior Critical) is FIXED and holds.** The conditional-format pre-clear is
now gated on the `preClearConditionalRules` flag threaded through
`structuralRequests`. `dashboardBuildRequests` passes `false`
(`dashboardSheet.js:431`) so a fresh `--build` emits ZERO
`deleteConditionalFormatRule` requests (verified by the `dashboardSheet.test.js:118`
test and `conditionalFormatRequests` lines 216-220). `dashboardUpdateRequests`
passes `true` (`dashboardSheet.js:439`) so `--update` emits the 3 deletes in
descending `[2,1,0]` order (verified by `dashboardSheet.test.js:111`). The atomic
build batch in `index.js:runBuild` (lines 108-114) is therefore no longer rolled
back by a delete against a 0-rule sheet. Not re-reported.

The remaining issues are robustness/consistency concerns, none blocking. The PnL,
allocation, and cost-basis formula math is correct; the DCA Log data-region safety
guards remain sound and well tested; the pure `assembleRefreshRows` /
`backfillBlobFromSheet` seams remain robust against non-number injection.

## Narrative Findings (AI reviewer)

## Warnings

### WR-01: `--update` still aborts the whole atomic batch if the live conditional-rule count drifts below 3

**File:** `layout-builder/src/dashboardSheet.js:208-220`, `layout-builder/src/index.js:141-145`

**Issue:** The CR-01 fix solved the `--build` case but did not address the second
sub-case the original CR-01 raised: rule-count drift on `--update`.
`dashboardUpdateRequests` unconditionally emits deletes for fixed indices
`[2, 1, 0]` (`MANAGED_RULE_COUNT - 1 .. 0`). The gating comment
(`dashboardSheet.js:204-207`) assumes `--update` "has exactly MANAGED_RULE_COUNT
(3) managed rules." That assumption is not enforced — a user who deletes one
PnL/Drift rule via the Sheets UI (or a prior partially-applied run) leaves fewer
than 3 rules. The next `--update` then issues `deleteConditionalFormatRule` at
index 2 against a sheet with only 0-2 rules, which returns
`400: No conditional format rule found at index N`. Because `runUpdate` sends
dashboard + DCA Log requests in a SINGLE atomic `batchUpdate`
(`index.js:141-145`), the whole structural re-apply rolls back — the operator's
`--update` silently fails and the Dashboard/DCA Log structure is never refreshed.
The unit test (`dashboardSheet.test.js:102-112`) only asserts the in-memory
request shape (`deletes === adds`, indices `[2,1,0]`); it never simulates the API
rejecting an out-of-range delete, so the suite is green while this path is fragile.

**Fix:** Do not delete by hardcoded positional index on `--update`. Read the live
rule count first and delete only existing indices, e.g. in `index.js:runUpdate`
fetch `conditionalFormats` for the dashboard sheetId via
`spreadsheets.get({ fields: "sheets(properties.sheetId,conditionalFormats)" })`,
then pass that count into the builder so it emits
`[liveCount-1 .. 0]`. Alternatively split the deletes into their own
`batchUpdate` wrapped in a try/catch that swallows only the
"no rule at index" 400 (so DCA Log structure still applies on partial drift). Add
a test that simulates the API rejecting an out-of-range delete.

### WR-02: status block is written from the pre-backfill blob, decoupling the displayed Stale?/LastUpdated from the persisted slice

**File:** `apps-script/src/Refresh.ts:226-238`

**Issue:** In `refreshAll`, the status block is written (lines 230-232) using
`blob.hyperliquid?.lastUpdated` / `blob.solana?.lastUpdated` BEFORE
`backfillBlobFromSheet` runs (line 238). For a failed-and-evicted venue,
`blob.hyperliquid` is `undefined` at status-write time, so
`statusPair(false, undefined)` writes LastUpdated `"—"`; then
`backfillBlobFromSheet` creates `blob.hyperliquid = { ..., lastUpdated: "—" }`.
Today the two agree only because both independently produce `"—"`. The ordering is
fragile: the cache-mirror invariant that CR-01's backfill exists to protect ("the
cache never diverges from the sheet") covers the Zone A value cells but NOT the
status cells, which are derived from a snapshot taken before the blob is finalized.
Any future change that backfills a real recovered timestamp would silently desync
the displayed LastUpdated/Stale? from the persisted blob.

**Fix:** Reorder so a single finalized blob drives both writes: assemble rows →
`backfillBlobFromSheet(blob, ASSETS, rows)` → derive `statusRows` from the
post-backfill `blob` → write Zone A and the status block from that one state. This
makes the displayed status and the persisted slice provably consistent rather than
coincidentally equal.

### WR-03: dead computed value `lastAssetRow` and unused `STATUS_SOL_ROW`, both suppressed with `void`

**File:** `apps-script/src/Refresh.ts:207`, `243-244`, `165`

**Issue:** `lastAssetRow` (line 207) is computed but never used to bound any write —
the value range at line 208 uses `ASSETS.length` directly. It is kept alive only by
`void lastAssetRow;` (line 243). Likewise `STATUS_SOL_ROW` (line 165) is declared
and only `void`-ed (line 244); the second status row is implied by the 2-row range
height. A computed-then-`void`-ed value is dead code that reads like an incomplete
refactor and invites a future reader to assume `lastAssetRow` actually constrains
the range (it does not). `noUnusedLocals` is disabled in `tsconfig.json`, so these
`void` guards are not even required to satisfy the type-checker.

**Fix:** Remove `lastAssetRow`, `STATUS_SOL_ROW`, and both `void` statements. If a
geometry sanity check is genuinely wanted, make it an assertion that can fail
(`if (lastAssetRow !== ZONE_A_FIRST_ASSET_ROW + ASSETS.length - 1) throw ...`),
not a discarded expression.

## Info

### IN-01: `VALUE_COLS` is a misleading name for the Qty+Price write width

**File:** `apps-script/src/Refresh.ts:143-149`

**Issue:** `VALUE_COLS = 2` is named as though it counts "Value" columns, yet the
adjacent comment stresses it must NOT include the Value column (col D). The name
invites exactly the col-D clobber it guards against. `QTY_COL` is fine.

**Fix:** Rename to `QTY_PRICE_COL_SPAN` (or `WRITE_COL_WIDTH`) and update the
assertion in `Refresh.test.ts:172`.

### IN-02: request-helper functions duplicated near-verbatim across the two layout files

**File:** `layout-builder/src/dashboardSheet.js:81-156`, `layout-builder/src/dcaLogSheet.js:63-110`

**Issue:** `stringCell`, `formulaCell`, `formulaRowRequest`, `labelRowRequest`, and
`numberFormatRequest` are duplicated across both sheet builders with identical
1-based→0-based conversion logic. A fix to one (e.g. an off-by-one in
`rowIndex: row - 1`) would silently miss the other.

**Fix:** Extract the shared request helpers into a single `requests.js` module both
files import. Low priority given both are covered by tests, but the divergence risk
is real.

### IN-03: stale "(0-based 6)" comment contradicts the widened `ZONE_A_LAST_COL_0BASED = 8`

**File:** `layout-builder/src/dashboardSheet.test.js:195`

**Issue:** The inline comment reads "strictly right of Zone A's last column (0-based
6)" while the assertion uses `ZONE_A_LAST_COL_0BASED = 8` (col I). The "6" is a
leftover from the pre-widening Phase 2 layout. The test passes, but the comment
misstates the current geometry invariant for a future reader. (Note: the prior
review cited line 180 for the same defect; the live occurrence is the `for`-loop
comment at line 195 — the constant at line 171 is correct.)

**Fix:** Update the comment to "0-based 8 (col I)".

---

_Reviewed: 2026-06-20_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
