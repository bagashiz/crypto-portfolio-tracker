---
phase: 05-pnl-allocation
reviewed: 2026-06-19T00:00:00Z
depth: standard
files_reviewed: 6
files_reviewed_list:
  - apps-script/src/Refresh.ts
  - apps-script/src/Refresh.test.ts
  - layout-builder/src/dashboardSheet.js
  - layout-builder/src/dashboardSheet.test.js
  - layout-builder/src/dcaLogSheet.js
  - layout-builder/src/dcaLogSheet.test.js
findings:
  critical: 1
  warning: 4
  info: 3
  total: 8
status: issues_found
---

# Phase 5: Code Review Report

**Reviewed:** 2026-06-19
**Depth:** standard
**Files Reviewed:** 6
**Status:** issues_found

## Summary

Phase 5 adds PnL/allocation formulas and conditional formatting to the layout
builder, plus the `refreshAll()` orchestration seam in Apps Script. The PnL and
allocation formula math is correct, the DCA Log data-region safety guards are
sound and well tested, and the pure `assembleRefreshRows`/`backfillBlobFromSheet`
seams are robust against non-number injection.

The dominant defect is in the conditional-format idempotency strategy: the
delete-then-add pre-clear emits `deleteConditionalFormatRule` requests for
indices that do not exist on a fresh `--build` (and on any drifted `--update`).
The Sheets `batchUpdate` is a single atomic call with no per-request error
tolerance, so the entire structural stamp aborts. This blocks `--build` outright.
The remaining findings are robustness and consistency concerns.

## Critical Issues

### CR-01: Conditional-format pre-clear aborts the atomic batchUpdate on `--build` (and on rule-count drift)

**File:** `layout-builder/src/dashboardSheet.js:188-207`, `layout-builder/src/index.js:77-114`

**Issue:** `conditionalFormatRequests` unconditionally emits three
`deleteConditionalFormatRule` requests (indices 2, 1, 0) before the three
`addConditionalFormatRule` requests. The header comment (lines 195-196) asserts
that "the build/update flow in index.js tolerates 'no rule at index' so the
pre-clear is a safe no-op on first run."

That tolerance does not exist. `index.js:runBuild` builds one `requests` array
and sends it through a single `spreadsheets.batchUpdate` (lines 77-83, 108-114).
Sheets `batchUpdate` is atomic — all requests apply or none do. Deleting a
conditional-format rule at an index with no rule returns
`400: No conditional format rule found at index N`, which fails the whole batch.

Consequences:
- **`--build` on a fresh sheet (zero rules) always fails** — index 2 delete errors
  immediately, so the Dashboard tab is never structured at all (the atomic batch
  rolls back the `addSheet` + all structure).
- **`--update` fails whenever the live rule count is < 3** (e.g. a rule was
  manually deleted, or a prior partial run left fewer than `MANAGED_RULE_COUNT`),
  because the highest-index delete targets a nonexistent rule.

The unit test at `dashboardSheet.test.js:102-109` only asserts `deletes === adds`
on the in-memory request array; it never exercises the API's index-existence
behavior, so the suite passes while the real `--build` path is broken.

**Fix:** Do not pre-clear with positional deletes. Either:

1. Read the existing rules first and delete only indices that exist:
```js
// In index.js, before building dashboard requests:
const res = await sheets.spreadsheets.get({
  spreadsheetId,
  fields: "sheets(properties.sheetId,conditionalFormats)",
});
const existingRuleCount = /* count rules on the dashboard sheetId */;
// Pass existingRuleCount into the builder so it deletes only [existingRuleCount-1 .. 0].
```

2. Or split into two batchUpdate calls and tolerate the delete failure explicitly:
```js
try {
  await batchUpdate(sheets, spreadsheetId, deleteRequests);
} catch (e) {
  // 400 "no rule at index" is expected on a fresh sheet — swallow only that.
}
await batchUpdate(sheets, spreadsheetId, addRequestsAndStructure);
```

3. Or skip the deletes on `--build` entirely (no rules exist) and only pre-clear
   on `--update`, while still guarding against count < MANAGED_RULE_COUNT.

Whichever path is chosen, add a test that simulates the API rejecting an
out-of-range delete index so the regression is caught.

## Warnings

### WR-01: `statusPair` writes a literal `"—"` string into the Stale? boolean column on cold-start failure

**File:** `apps-script/src/Refresh.ts:273-276`, `230-232`

**Issue:** `statusPair` returns `[string, boolean]` and the two rows are written
with `setValues`. On a cold-start failure (venue failed, no cached `lastUpdated`),
the LastUpdated cell becomes the string `"—"`. That is intended for col L
(LastUpdated), but the status range is written as a 2-col block `[stamp, !fresh]`.
The mixed `(string | number-stamp)` first column and `boolean` second column are
fine type-wise, but the LastUpdated column will now contain a non-date string
`"—"` while the layout builder applies no number format there (status cells are
label-only, `dashboardSheet.js:385-393`), so this is acceptable. However, when a
venue later self-heals, `nowStamp()` writes a date-formatted string into the same
cell that previously held `"—"` — there is no number format reconciliation, so
the column may render inconsistently (plain text vs date). Confirm the status
LastUpdated column has no DATE number format applied, or the `"—"` will show as a
format error.

**Fix:** Ensure the status block LastUpdated column is explicitly left as plain
text format by the layout builder, or document that `"—"` is intentional plain
text. If a date format is ever added to col L, the `"—"` sentinel will display as
`#VALUE`-style garbage.

### WR-02: `backfillBlobFromSheet` recovers a slice with `lastUpdated: "—"` but `statusPair` already wrote a frozen status independently — the two can disagree

**File:** `apps-script/src/Refresh.ts:226-238`, `113-128`

**Issue:** The status block is written (lines 230-232) using
`blob.hyperliquid?.lastUpdated` BEFORE `backfillBlobFromSheet` runs (line 238).
For a failed+evicted venue, `blob.hyperliquid` is `undefined` at status-write
time, so `statusPair(false, undefined)` writes LastUpdated `"—"`, Stale?=TRUE.
Then `backfillBlobFromSheet` creates `blob.hyperliquid = { data, lastUpdated: "—" }`.
The displayed status and the persisted blob agree here by coincidence (both `"—"`).
But the ordering is fragile: the status write depends on blob state that is then
mutated. A future edit that backfills a real timestamp would silently desync the
displayed Stale? cell from the persisted blob. The cache-mirror invariant CR-01
claims to protect ("cache never diverges from the sheet") is only true for the
value cells, not the status cells.

**Fix:** Compute the backfill (or at least the recovered `lastUpdated`) before
writing the status block, so the status pair and the persisted blob are derived
from one consistent snapshot. Reorder: assemble rows → backfill blob → derive
status from the final blob → write both Zone A and status from that single state.

### WR-03: `lastAssetRow` is computed then discarded via `void` — dead computation masking intent

**File:** `apps-script/src/Refresh.ts:207`, `243-244`

**Issue:** `lastAssetRow` (line 207) is computed but never used; line 243
`void lastAssetRow;` and line 244 `void STATUS_SOL_ROW;` exist only to silence
unused-variable complaints. These are documented as "geometry sanity reference,"
but a computed-then-voided value is dead code that suggests an incomplete
refactor: either the value was meant to bound the write range (it isn't — the
range uses `ASSETS.length` directly at line 208) or it should be removed.
`STATUS_SOL_ROW` (line 165) is likewise declared and only `void`-ed — the second
status row is implied by the range height, so the constant is unused.

**Fix:** Remove `lastAssetRow`, `STATUS_SOL_ROW`, and both `void` statements.
If you want a runtime geometry assertion, assert it (`if (lastAssetRow !== ...)
throw`), don't `void` it.

### WR-04: Drift CUSTOM_FORMULA hardcodes the first-row reference but the range may not start where Sheets anchors relative formulas

**File:** `layout-builder/src/dashboardSheet.js:226-236`

**Issue:** The drift conditional rule uses
`=ABS(D${zoneBFirstAssetRow})>=${DRIFT_TOLERANCE}` with a relative `D` reference,
relying on Sheets applying it relatively down the `driftRange` (which starts at
`startRowIndex: zoneBFirstAssetRow - 1`). This is correct only if the range's
top-left exactly matches the formula's anchor row. It does here. But
`DRIFT_TOLERANCE` (0.05) is interpolated directly into the formula string with no
locale guard: in a spreadsheet whose locale uses comma as the decimal separator,
`0.05` in a CUSTOM_FORMULA string may be misparsed. Apps Script/Sheets generally
accept `.` in API-supplied formulas, but this is worth confirming against the
pinned `appsscript.json` locale rather than assuming.

**Fix:** Confirm the spreadsheet locale parses `0.05` in CUSTOM_FORMULA strings;
if locale is non-US, format the threshold accordingly or use a value-cell
reference instead of inlining the float.

## Info

### IN-01: `QTY_COL`/`VALUE_COLS` naming is misleading

**File:** `apps-script/src/Refresh.ts:143-149`

**Issue:** `VALUE_COLS = 2` is named as if it counts "Value" columns, but it is
the width of the Qty+Price write block (and the comment explicitly says it must
NOT include the Value column). The name invites exactly the col-D clobber it
guards against.

**Fix:** Rename to `QTY_PRICE_COL_SPAN` or `WRITE_COL_WIDTH`.

### IN-02: Duplicated request-helper module between the two layout files

**File:** `layout-builder/src/dashboardSheet.js:81-139`, `layout-builder/src/dcaLogSheet.js:63-94`

**Issue:** `stringCell`, `formulaCell`, `labelRowRequest`, `formulaRowRequest`,
and `numberFormatRequest` are duplicated near-verbatim across both sheet files.
Divergence risk: a fix to one (e.g. 1-based→0-based conversion) silently misses
the other.

**Fix:** Extract the shared request helpers into a `requests.js` module both files
import.

### IN-03: Comment/code drift — stale "(0-based 6)" reference

**File:** `layout-builder/src/dashboardSheet.test.js:180`

**Issue:** Comment says "strictly right of Zone A's last column (0-based 6)" but
the assertion uses `ZONE_A_LAST_COL_0BASED = 8` (col I). The "6" is a leftover
from the pre-widening (Phase 2) layout. The test passes, but the comment misleads
a future reader about the geometry invariant.

**Fix:** Update the comment to "0-based 8 (col I)".

---

_Reviewed: 2026-06-19_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
