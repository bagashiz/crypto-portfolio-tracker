---
phase: 06-realized-pnl-and-sell-log
reviewed: 2026-06-21T00:00:00Z
depth: standard
files_reviewed: 6
files_reviewed_list:
  - layout-builder/src/config.js
  - layout-builder/src/dashboardSheet.test.js
  - layout-builder/src/dcaLogSheet.js
  - layout-builder/src/dcaLogSheet.test.js
  - layout-builder/src/index.js
  - layout-builder/src/index.test.js
findings:
  critical: 1
  warning: 3
  info: 2
  total: 6
status: critical_resolved
resolution:
  commit: 5c8430f
  fixed: [CR-01, WR-02, IN-02]
  deferred: [WR-01, WR-03, IN-01]
---

> **Resolution (2026-06-21, commit `5c8430f`).** The two correctness findings are FIXED:
> - **CR-01** — BYROW input corrected to `A22:I` (open rows, bounded cols, anchored at the
>   spill cell's own row). NOTE: the reviewer's suggested `A23:I` was itself off-by-one —
>   the spill anchors at J22 (`TX_HEADER_ROW`; the data-region guard forbids writing row 23+),
>   and BYROW spills downward, so the input's first row must equal the anchor row (22) for
>   each output to land on its source row. Verified by a new regression test.
> - **WR-02** (in practice a hard `--update` failure, not just a warning) — `bandRequests` is
>   now add-only; the duplicate inline conditional-rule deletes are gone. The sole delete path
>   is the isolated, error-tolerant `dcaLogConditionalPreClearRequests` batch. **IN-02** (dead
>   `preClearConditionalRules` param) removed as part of this.
>
> Deferred as non-blocking (UX/cosmetic, no correctness/data-safety impact):
> **WR-01** (col-J "Realized" header overwritten by the spill anchor — design tension: the
> anchor cannot move below row 22 under the data-region guard), **WR-03** (no warning when
> both legacy and new tab titles coexist — resolver is still data-safe, never deletes),
> **IN-01** (stale "9-column"/"A-I" comments after the 10th column was added).

# Phase 6: Code Review Report

**Reviewed:** 2026-06-21
**Depth:** standard
**Files Reviewed:** 6
**Status:** issues_found

## Summary

Phase 6 delivers realized PnL on SELL transactions (plan 06-01) and the in-place
"DCA Log" -> "Transaction Log" tab rename on `--update` (plan 06-02). All 50 unit
tests pass.

**Verdict: BLOCKED.** The critical data-safety invariants hold — the rename is a
field-mask `updateSheetProperties(fields:"title")` write (never deleteSheet+addSheet),
the conditional-format pre-clear runs in its own error-tolerant batch, every emitted
request range stays strictly above `DATA_START_ROW`, and `--update` is idempotent. The
data-loss guard is green.

However, the headline feature itself — per-row realized PnL — is **functionally broken**.
The `BYROW` spill formula is anchored to a single-row input range (`A23:I23`) instead of
the open-ended range (`A23:I`) the design (06-RESEARCH lines 266-277) calls for. As a
result it computes a realized value for **row 23 only** and never spills to any subsequent
SELL transaction. Because the per-asset "Realized $" summary sums `$J$23:$J` (the data
region below the header), and that region is left empty by the truncated spill, **every
Realized $ / Realized % / Total Realized cell resolves to 0 or "—" regardless of actual
SELL activity.** The feature does not deliver PNL-05. This must be fixed before ship.

The existing tests pass because they only assert the spill *exists* at J22 and *contains*
the substring "BYROW" — they never assert the input range is open-ended, so they do not
exercise the actual spill behavior.

## Critical Issues

### CR-01: BYROW realized-PnL spill is anchored to a single data row — realized PnL is computed for row 23 only and never spills down

**File:** `layout-builder/src/dcaLogSheet.js:325-335`

**Issue:**
The per-row realized helper is built as:

```js
const da = dataAnchor;                       // 23
const realizedHeaderFormula =
  `=BYROW(A${da}:I${da}, LAMBDA(r, LET(` +   // -> A23:I23  (SINGLE ROW)
  ...
```

`A${da}:I${da}` interpolates `da` (23) into **both** the start and the end of the row
range, producing `A23:I23` — a one-row input. `BYROW` iterates over the rows of its input
array, so it yields exactly **one** result, written to the anchor cell J22. SELL rows at
row 24, 25, 26, … get no realized value at all.

Downstream, the per-asset summary sums the data region:

```js
const realizedDollars = `SUMIFS($J$${dataAnchor}:$J,${assetFilter},${sellFilter})`;
// -> SUMIFS($J$23:$J, ...)
```

Col J in rows 23+ is empty (the spill never reaches it — its single output lands in J22,
the header row, which is *outside* `$J$23:$J`). Therefore every per-asset **Realized $**,
**Realized %**, and the portfolio **Total Realized** cell evaluates to 0/blank/"—" no
matter what SELL transactions the user enters. The conditional formatting (green/red) also
never triggers because the cells are never positive/negative.

This silently defeats requirement PNL-05 — the core deliverable of Phase 6.

The design source confirms the intended range was open-ended (06-RESEARCH.md lines
266-277): the template uses `A{a}:I{a}` where `{a}` is the *start* anchor only, and the
note explicitly states "`BYROW` needs a bounded-width input (`A:I`), not `A:A`" — i.e. the
**columns** are bounded (A..I) while the **rows** are open-ended. The implementation
mistakenly anchored the end row too.

**Fix:**
Make the row range open-ended — anchor only the start row, leave the end row blank so the
input spans every data row:

```js
const da = dataAnchor;
const realizedHeaderFormula =
  `=BYROW(A${da}:I, LAMBDA(r, LET(` +        // A23:I  (open-ended rows, cols A..I)
  `d, INDEX(r,1,1), ty, INDEX(r,1,3), q, INDEX(r,1,5), tot, INDEX(r,1,6), fee, INDEX(r,1,7), ` +
  `IF(d="","", ` +
  `IF(ty<>"SELL","", ` +
  `IFERROR((tot-fee) - q * ( ` +
  `SUMIFS(H${da}:H, C${da}:C,"BUY", A${da}:A,"<="&d) / ` +
  `SUMIFS(E${da}:E, C${da}:C,"BUY", A${da}:A,"<="&d) ` +
  `),"—"))))))`;
```

Note: this only changes the *contents of the formula string* — the emitted request range
is still row 22 col J only, so the LAYOUT-02 / D-06 data-region guard is unaffected.

Also add a regression test asserting the BYROW input is open-ended (e.g.
`expect(formula).toContain("BYROW(A23:I,")` and `expect(formula).not.toContain("A23:I23")`),
since the current test would pass against the broken single-row form.

## Warnings

### WR-01: Col J "Realized" header is overwritten by the spill formula — the column renders with no visible header

**File:** `layout-builder/src/dcaLogSheet.js:312,335`

**Issue:**
The transaction header label row writes "Realized" into J22 (line 312, via
`labelRowRequest(... TX_HEADERS)`), then the spill write (line 335) overwrites J22 with
the `BYROW` formula in the same atomic batch — last write wins. Confirmed by inspecting the
emitted requests: req#32 writes `{"stringValue":"Realized"}` to J22, req#33 overwrites it
with the formula. On the rendered sheet, J22 shows the spill anchor (a number or "—"), not
the word "Realized". The transaction table's 10th column is therefore unlabeled for the
user. The code comment acknowledges "replacing the col-J 'Realized' header text", so the
collision is intentional, but the UX result (a header-less helper column sitting in the
data table) is a defect, and the "Realized" entry in `TX_HEADERS` is a dead write.

This also weakens the test at `dcaLogSheet.test.js:57-60`, which asserts the header row
contains "Realized" — it reads the (overwritten, never-rendered) label request and so gives
false confidence that the column is labeled.

**Fix:** Decide where the per-row helper lives. Two clean options:
1. Move the `BYROW` spill anchor to a row inside the summary band (e.g. a dedicated helper
   cell above row 22) or to a column the header row does not label, so the "Realized"
   header in J22 survives; or
2. Keep the helper in J22 but drop "Realized" from `TX_HEADERS` and document that col J is
   an internal helper, not a user column — and update the header test accordingly so it
   reflects reality rather than the overwritten label.

### WR-02: `dcaLogConditionalPreClearRequests` and `dcaLogSheet`'s in-band pre-clear duplicate the same deletes — double pre-clear on `--update`

**File:** `layout-builder/src/dcaLogSheet.js:349-353,390-396` and `layout-builder/src/index.js:213-234`

**Issue:**
On `--update`, `index.js` first sends `dcaLogConditionalPreClearRequests(dcaLogId)` in its
own error-tolerant batch (lines 213-221), then sends `dcaLogUpdateRequests(dcaLogId)` in
the structural batch (line 233). But `dcaLogUpdateRequests` calls `bandRequests(..., true)`,
which *also* emits the descending-index deletes inline (lines 349-353) before re-adding the
two rules. So the managed rules are deleted twice per update: once in the isolated batch and
once inside the structural batch.

The second (in-band) delete is the dangerous one: if the live rule count has drifted below
2, the in-band `deleteConditionalFormatRule` at a missing index throws inside the
*structural* batch and rolls the whole thing back — which is precisely the failure mode
WR-01 (the project invariant) was designed to prevent by splitting deletes into their own
tolerant batch. The isolated pre-clear in `index.js` is correct; the duplicate inline
delete in `dcaLogUpdateRequests` undermines it.

Compare the Dashboard path: `dashboardUpdateRequests` is invoked for the structural batch
and the deletes are split out via `dashboardConditionalPreClearRequests`. The DCA log path
should mirror that exactly — `dcaLogUpdateRequests` should NOT emit inline deletes.

**Fix:** Have `--update` go through an add-only band (no inline deletes) and rely solely on
the isolated `dcaLogConditionalPreClearRequests` batch:

```js
export function dcaLogUpdateRequests(sheetId, assetList = assets) {
  // Deletes are split out to dcaLogConditionalPreClearRequests (sent in their own
  // error-tolerant batch by index.js). The structural band is ADD-ONLY so a rule-count
  // drift can never roll it back (WR-01).
  return bandRequests(sheetId, assetList, false);
}
```

(The `preClearConditionalRules` parameter then becomes unused and can be removed.)

### WR-03: `getExistingTabs` rejects a valid duplicate-title spreadsheet by silently collapsing tabs into the Map

**File:** `layout-builder/src/index.js:60-82`

**Issue:**
`getExistingTabs` builds a `Map(title -> sheetId)`. Google Sheets does not enforce unique
tab titles in all historical states, but more relevantly: during the rename transition,
both "DCA Log" (legacy) and "Transaction Log" (new) could coexist if a prior `--update`
partially applied (the rename landed but the operator also hand-created/restored a tab), or
if a user manually duplicated the tab. If two tabs share a title the Map silently keeps only
the last one; if the new and legacy titles both exist, `resolveLogTabRequests` resolves to
"Transaction Log" and silently ignores the still-present legacy "DCA Log", potentially
leaving a stale duplicate the operator is unaware of. There is no detection or warning for
this state.

This is not a data-loss path (the resolver never deletes), but it can leave the spreadsheet
in a confusing dual-tab state with no signal.

**Fix:** When both `DCA_LOG` and `DCA_LOG_LEGACY` resolve in `getExistingTabs`, warn (or
throw) so the operator can manually reconcile, e.g. in `resolveLogTabRequests`:

```js
const currentId = tabs.get(DCA_LOG);
const legacyId = tabs.get(DCA_LOG_LEGACY);
if (currentId !== undefined && legacyId !== undefined) {
  console.warn(
    `Both "${DCA_LOG}" and legacy "${DCA_LOG_LEGACY}" tabs exist; using "${DCA_LOG}". ` +
      "Manually remove the stale legacy tab if it is a leftover duplicate."
  );
}
if (currentId !== undefined) return { logId: currentId, renameRequests: [] };
```

## Info

### IN-01: Stale "9-column" / "cols A-I" comments after the 10th column was added

**File:** `layout-builder/src/dcaLogSheet.js:13` and `layout-builder/src/dcaLogSheet.test.js:57`

**Issue:** Phase 6 added the 10th "Realized" column, but several comments/labels still say
"Date..Notes A-I" or "9-column transaction header" (e.g. `dcaLogSheet.js:13`, the test name
at `dcaLogSheet.test.js:57` "the exact 9-column transaction header row"). `config.js:57` also
still reads "(row 22, Date..Notes A-I)". The `EXPECTED_HEADERS` now has 10 entries, so the
test name is misleading.

**Fix:** Update the comments and the test title to reflect 10 columns (A-J).

### IN-02: `bandRequests` `preClearConditionalRules` parameter becomes dead once WR-02 is fixed

**File:** `layout-builder/src/dcaLogSheet.js:185,349-353`

**Issue:** Once `dcaLogUpdateRequests` no longer requests inline deletes (WR-02 fix), the
`preClearConditionalRules` parameter and the `if (preClearConditionalRules) { ... }` block
are dead code. Leaving an unused safety-relevant branch invites future misuse (a caller
re-enabling the rollback-risky inline delete).

**Fix:** Remove the `preClearConditionalRules` parameter and its delete loop from
`bandRequests` after WR-02 is applied; the only delete path should be
`dcaLogConditionalPreClearRequests`.

---

_Reviewed: 2026-06-21_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
