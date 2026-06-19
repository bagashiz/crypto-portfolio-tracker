# Phase 5: PnL & Allocation - Pattern Map

**Mapped:** 2026-06-19
**Files analyzed:** 6 (4 modified source + 2 modified co-located tests; +1 shared data file vestigial)
**Analogs found:** 6 / 6 (all in-repo; this phase EXTENDS existing files rather than creating new ones)

> Note: this phase modifies files in place. The "analog" for each modified file is the
> file ITSELF — the patterns to copy are the request-builder/helper/test conventions
> already established within these files. Every new formula/format/conditional-format
> request MUST mirror the existing helper + idempotency + offline-test patterns below.

## File Classification

| File (modified) | Role | Data Flow | Closest Analog | Match Quality |
|-----------------|------|-----------|----------------|---------------|
| `layout-builder/src/dashboardSheet.js` | config / request-builder | transform (asset registry -> batchUpdate requests) | self (existing `structuralRequests` + `labelRowRequest`/`numberFormatRequest`); also `dcaLogSheet.js` `bandRequests` | exact |
| `layout-builder/src/dcaLogSheet.js` | config / request-builder | transform (registry -> SUMIFS summary requests) | self (existing `bandRequests`) + `dashboardSheet.js` for formula-cell shape | exact |
| `layout-builder/src/config.js` | config | n/a (constants) | self (existing `DATA_START_ROW`/`MAX_SUMMARY_ROWS`/`DASHBOARD` exports) | exact |
| `apps-script/src/Refresh.ts` | service / orchestration | batch (live fetch -> single setValues write) | self (existing `refreshAll()` status-block geometry constants) | exact |
| `layout-builder/src/dashboardSheet.test.js` | test | n/a (offline assertions) | self + `dcaLogSheet.test.js` (range-bound + no-data-region assertions) | exact |
| `layout-builder/src/dcaLogSheet.test.js` | test | n/a | self (LAYOUT-02 boundary assertion against `DATA_START_ROW_LITERAL`) | exact |

`assets.json` (repo root): NOT modified. The `apy` field is vestigial after D-05 — leave in place (cross-runtime churn avoidance). No code should newly read `apy`.

---

## Pattern Assignments

### `layout-builder/src/dashboardSheet.js` (request-builder, transform)

**Analog:** itself + `dcaLogSheet.js`. Add a `formulaCell`/`formulaRowRequest` helper (mirrors `stringCell`/`labelRowRequest`) and an `addConditionalFormatRule` builder. Widen Zone A headers (D-01), drop APY/Monthly-Yield (D-05), relocate the status block.

**Cell-shape helper to mirror** (`dashboardSheet.js:59-77`) — `stringCell` + `labelRowRequest`. The new formula helper is the same shape with `formulaValue` instead of `stringValue`:
```javascript
function stringCell(value) {
  return { userEnteredValue: { stringValue: value } };
}
// NEW (Phase 5): identical shape, formula payload — the helper the planner adds.
// function formulaCell(formula) {
//   return { userEnteredValue: { formulaValue: formula } };  // formula begins with "="
// }
```

**Number-format helper to reuse as-is** (`dashboardSheet.js:80-94`) — `numberFormatRequest`. New PnL columns need CURRENCY (AvgCost G, PnL $ H) and PERCENT (PnL % I); the existing `CURRENCY_FORMAT`/`PERCENT_FORMAT` constants (lines 54-55) are reused, no new format objects needed.

**Layout-constant pattern to extend** (`dashboardSheet.js:20-32`). Current Zone A header array must change from:
```javascript
const ZONE_A_HEADERS = ["Asset", "Qty", "Price", "Value", "Target %", "Risk", "APY %"];
```
to the D-01 map `Asset · Qty · Price · Value · Target % · Risk · AvgCost · PnL $ · PnL %` (drop APY %, add AvgCost/PnL $/PnL %). Zone B header (line 25) drops `APY %` and `Monthly Yield` -> `["Asset", "Target %", "Actual %", "Drift", "Risk"]` (D-05).

**Status-block relocation pattern** (`dashboardSheet.js:48-51`). Zone A now extends to col I (1-based 9). `STATUS_START_COL` MUST move right of new col I with a >=1-col gap (e.g. col K = 11). Current value:
```javascript
const STATUS_START_COL = 9; // 1-based col I — right of Zone A's last col G (=7)
```
This constant is the ONLY place to change for the column move; `MAX_ZONE_A_ASSET_ROWS` (line 32) and the column-anchoring tests then follow. NOTE the coupling: `Refresh.ts` `STATUS_LASTUPDATED_COL` (currently 10/J) must move in lockstep (see Refresh.ts assignment + Shared Patterns "Cross-runtime status-block coupling").

**Build == update idempotency pattern to preserve** (`dashboardSheet.js:174-182`):
```javascript
export function dashboardBuildRequests(sheetId, assetList = assets) {
  return structuralRequests(sheetId, assetList);
}
export function dashboardUpdateRequests(sheetId, assetList = assets) {
  return structuralRequests(sheetId, assetList);
}
```
Formulas follow this same shared-set pattern (Dashboard has no protected data region). **EXCEPTION (D-07):** conditional-format rules are NOT idempotent under naive re-add — re-running `--update` stacks duplicate `addConditionalFormatRule` requests. The planner must either (a) emit `deleteConditionalFormatRule` for the managed index range before re-adding, or (b) guard. See Shared Patterns "Conditional-format idempotency".

**Conditional-format request shape (NEW — no existing analog in repo).** No `addConditionalFormatRule`/`booleanRule` currently exists anywhere (grep confirmed: only negative test assertions reference it). Use the Sheets v4 `addConditionalFormatRule` request with a `booleanRule` + `BackgroundColor` style (D-07: background fill, green PnL>0 / red PnL<0, applied to cols H and I per asset row; plus Drift col D Zone B threshold). This is the one genuinely new request type — assert it offline the same way other requests are asserted (range bounds + rule presence), per RESEARCH-disabled note rely on Sheets API `BooleanRule`/`BooleanCondition` (`NUMBER_GREATER`/`NUMBER_LESS`) shape.

---

### `layout-builder/src/dcaLogSheet.js` (request-builder, transform)

**Analog:** itself (`bandRequests`, `dcaLogSheet.js:102-149`) for the band-and-guard pattern; `dashboardSheet.js` for the `formulaCell` shape. Add BUY-only SUMIFS/COUNTIFS/MAXIFS summary formulas (D-04) into the FIXED summary band only.

**Critical boundary pattern to preserve** (`dcaLogSheet.js:93-112` + `config.js:43-74`). All new summary formulas write ONLY to rows `FIRST_SUMMARY_ROW`..`LAST_RESERVED_SUMMARY_ROW` (1-based 2..21, 0-based exclusive end 21 < boundary 22). The open-ended `A{DATA_START_ROW}:A` ranges D-04 references appear ONLY inside formula STRINGS (they read the data region) — never as a request range that writes it:
```javascript
const FIRST_SUMMARY_ROW = 2;
const LAST_RESERVED_SUMMARY_ROW = 1 + MAX_SUMMARY_ROWS; // 21
```
A formula like `=SUMIFS($H$23:$H, $B$23:$B, $A2, $C$23:$C, "BUY")` is a string in a cell at row 2 — the request range is row 2, NOT row 23. The existing LAYOUT-02 test (`dcaLogSheet.test.js:65-79`) asserts EVERY request range `endRowIndex <= DATA_START_ROW_0BASED (22)`; new formula requests MUST keep passing it.

**Summary-header / metric mapping to drive formulas** (`dcaLogSheet.js:35-47`). The summary columns already exist as labels — formulas fill the cells beneath per the existing header order:
```javascript
const SUMMARY_HEADERS = ["Summary", "Total Invested", "Total Qty", "Avg Cost (DCA)", "Buy Count", "Last Buy", "Total Fees"];
const TX_HEADERS = ["Date", "Asset", "Type", "Price", "Qty", "Total", "Fee", "Net Cost", "Notes"];
```
Maps D-04 formulas to TX columns: Net Cost=col H, Asset=col B, Type=col C, Qty=col E, Date=col A, Fee=col G. BUY-only filter is `Type, "BUY"`. Avg Cost = Invested/Qty wrapped in `IFERROR(…, "—")` (D-06).

**Skeleton-only test that MUST be updated** (`dcaLogSheet.test.js:138-145`). The current test asserts `not.toContain("formulaValue")`. Phase 5 INVERTS this for the summary band — the planner must replace the "no formulaValue" assertion with positive assertions that summary formula cells exist AND still never address >= row 23. Keep the `addConditionalFormatRule` negative assertion for DCA Log (no conditional formatting lands on the DCA Log tab — only Dashboard, D-07).

---

### `layout-builder/src/config.js` (config)

**Analog:** itself. Likely NO change needed unless a new shared geometry constant is introduced. The existing exports (`DASHBOARD`, `DCA_LOG`, `DATA_START_ROW=23`, `MAX_SUMMARY_ROWS=20`) are consumed by both sheet builders and the tests. Pattern to follow if adding a constant: UPPER_SNAKE_CASE, banner-comment grouping (`config.js:43-74` style), and re-export so tests can assert against it without re-deriving literals.

**Do NOT** add a Dashboard-zone column constant here that duplicates `dashboardSheet.js` zone literals — those zone constants live in `dashboardSheet.js` (single-location rule). `config.js` holds only shared/cross-file constants.

---

### `apps-script/src/Refresh.ts` (service, batch)

**Analog:** itself. Two coupled changes from D-01/D-02 — both are constant edits in the existing geometry block (`Refresh.ts:130-147`).

**(D-02) `refreshAll()` must NOT write col D (Value is now a formula).** Existing write already spans only Qty(B)+Price(C) — confirm it stays 2 cols and never widens to D:
```typescript
const QTY_COL = 2;
const VALUE_COLS = 2;            // Qty(B), Price(C) — MUST stay 2, never include Value(D)
...
const valueRange = sheet.getRange(ZONE_A_FIRST_ASSET_ROW, QTY_COL, ASSETS.length, VALUE_COLS);
valueRange.setValues(rows);      // SINGLE batched Qty/Price write (REFRESH-02)
```
Good news: the current code already writes only B:C, so D-02 is largely a no-regression guard. Verify Value(D) is never added to this range.

**(D-01) Status-block write column MUST move when the layout builder relocates the status block** (`Refresh.ts:141-147`):
```typescript
const STATUS_LASTUPDATED_COL = 10; // J  <-- MUST move to match new STATUS_START_COL+1 in dashboardSheet.js
const STATUS_HL_ROW = 2;
const STATUS_SOL_ROW = 3;
```
If `dashboardSheet.js` `STATUS_START_COL` moves to col K (11), then LastUpdated=col L (12), Stale?=col M (13), so `STATUS_LASTUPDATED_COL = 12`. The status setValues (`Refresh.ts:212-214`) spans LastUpdated+Stale? (2 cols) starting at this col — keep the 2-col width, just shift the start. This is the cross-runtime coupling point (see Shared Patterns).

**Single-batched-write pattern to preserve** (`Refresh.ts:202`, `212-214`): one `setValues` for the Qty/Price block, one for the status block. Do not introduce cell-by-cell writes.

---

## Shared Patterns

### Pure offline request-builder + bun:test
**Source:** `dashboardSheet.js:57-104`, `dcaLogSheet.js:52-91`, asserted by `*.test.js`
**Apply to:** all new formula / conditional-format / number-format requests.
Builders take a `sheetId` (and optional `assetList = assets` for guard-testing without mutating the import) and return plain request objects — no `googleapis`, no network. Tests serialize with `JSON.stringify` and assert substrings / range bounds. New formula builders MUST be assertable the same way.
```javascript
function structuralRequests(sheetId, assetList = assets) { ... return requests; }
```
Test fixture for oversized registry (`dashboardSheet.test.js:67-72`):
```javascript
const oversized = Array.from({ length: MAX_ZONE_A_ASSET_ROWS + 1 }, (_, i) => ({ id: `FAKE${i}` }));
expect(() => dashboardBuildRequests(GRID_ID, oversized)).toThrow(/MAX_ZONE_A_ASSET_ROWS/);
```

### Data-region safety (LAYOUT-02 / D-06) — NON-NEGOTIABLE
**Source:** `dcaLogSheet.test.js:65-79` (the critical assertion), `config.js:53-74`
**Apply to:** every DCA Log summary-formula request added this phase.
```javascript
// THE CRITICAL ASSERTION — every request range must stop at/before the data region.
expect(range.endRowIndex).toBeDefined();
expect(range.endRowIndex).toBeLessThanOrEqual(DATA_START_ROW_0BASED); // 22
```
Open-ended `A{DATA_START_ROW}:A` SUMIFS ranges are allowed ONLY inside formula strings (read), never as write ranges. The summary cells sit at rows 2..21.

### Em-dash empty state (D-06)
**Source:** convention from CONTEXT D-06; matches `Refresh.ts:126,256` which already uses `"—"`.
**Apply to:** every formula LEAF cell (summary block, Dashboard AvgCost/PnL $/PnL %, allocation Actual %/Drift) and aggregate/TOTAL(S) cells.
```
=IFERROR(<expr>, "—")
```
Blended-risk guard (D-06): `=SUMPRODUCT(Risk_range, IFERROR(ActualPct_range, 0))` so text `"—"` in Actual % is treated as 0, not propagated.

### Conditional-format idempotency (D-07) — NEW, no existing analog
**Source:** none in repo (grep: zero `addConditionalFormatRule` usages outside negative tests).
**Apply to:** Dashboard PnL $ (H), PnL % (I), Drift (D, Zone B) only.
Re-adding rules in `--update` STACKS duplicates (unlike label/format requests which overwrite in place). The planner MUST make rule emission idempotent — preferred: emit `deleteConditionalFormatRule` for the managed rule indices before the `addConditionalFormatRule` batch, OR re-create rules only for a known managed range. This is the single deviation from the existing "build == update is automatically safe" property and must be explicitly handled + tested (assert re-running update does not grow the rule count).

### Cross-runtime status-block coupling (D-01)
**Source:** `dashboardSheet.js:48` (`STATUS_START_COL=9`) <-> `Refresh.ts:145` (`STATUS_LASTUPDATED_COL=10`)
**Apply to:** the status-block move MUST update BOTH files in the same phase.
The Google Sheet is the only integration surface; these two constants encode the same geometry in two runtimes. After Zone A widens to col I, choose a new `STATUS_START_COL` (Claude's discretion, e.g. K=11) in `dashboardSheet.js`, then set `Refresh.ts` `STATUS_LASTUPDATED_COL = STATUS_START_COL + 1`. The column-anchoring tests (`dashboardSheet.test.js:127-137`) reference `ZONE_A_LAST_COL_0BASED` (currently 6/col G) — that constant must bump to reflect Zone A now ending at col I (0-based 8).

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| (conditional-format request shape) | request fragment | n/a | No `addConditionalFormatRule`/`booleanRule` exists anywhere in the codebase. Use Sheets v4 API shape (`booleanRule` + `BooleanCondition` `NUMBER_GREATER`/`NUMBER_LESS` + `backgroundColor`). This is the only genuinely new construct — everything else extends an existing in-file pattern. |

---

## Metadata

**Analog search scope:** `layout-builder/src/`, `apps-script/src/`, repo-root `assets.json`
**Files scanned:** dashboardSheet.js, dcaLogSheet.js, config.js, index.js, Refresh.ts, Refresh.test.ts, dashboardSheet.test.js, dcaLogSheet.test.js, assets.json (+ grep across both src trees for conditionalFormat/formulaValue/setValues/getRange)
**Pattern extraction date:** 2026-06-19
