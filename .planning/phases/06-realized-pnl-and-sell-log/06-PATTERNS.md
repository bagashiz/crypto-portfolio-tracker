# Phase 6: Realized PnL & Sell Log - Pattern Map

**Mapped:** 2026-06-20
**Files analyzed:** 5 (4 modified in layout-builder + 1 Apps Script verification target)
**Analogs found:** 5 / 5 (every changed file is an in-place extension of itself — strongest possible "analog")

> Key framing: this phase has **no new files**. Every target is an existing layout-builder
> request-builder (or its co-located test) being extended with the SAME patterns it already
> contains. The "closest analog" for each file is therefore the file's own Phase 5 code plus,
> for two of them, a sibling file (`dashboardSheet.js` for the conditional-format helpers,
> `dashboardSheet.js` for the cross-sheet/`updateSheetProperties` field-mask idiom).

## File Classification

| Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---------------|------|-----------|----------------|---------------|
| `layout-builder/src/dcaLogSheet.js` | config / request-builder | transform (data → batchUpdate requests) | itself (Phase 5 BUY-only `bandRequests`) + `dashboardSheet.js` conditional-format helpers | exact (self-extension) |
| `layout-builder/src/config.js` | config | n/a (constants) | itself (`DCA_LOG`, `DATA_START_ROW`) + `dashboardSheet.js` `DASHBOARD`/`DCA_LOG` constant style | exact (self-extension) |
| `layout-builder/src/index.js` | route / orchestration | request-response (Sheets API batchUpdate) | itself (`runUpdate` tab discovery + `freezeRowsRequest` field-mask idiom in `dcaLogSheet.js`) | exact (self-extension) |
| `layout-builder/src/dcaLogSheet.test.js` | test | n/a (assertion) | itself (data-region guard + formula-presence assertions) | exact (self-extension) |
| `apps-script/src/Config.ts` / `Refresh.ts` | config | n/a (verify-only) | `Refresh.ts` `DASHBOARD_SHEET` constant | role-match (verification, likely no-op) |

## Pattern Assignments

### `layout-builder/src/dcaLogSheet.js` (config / request-builder, transform)

**Analog:** itself (Phase 5 `bandRequests`) — extend, do not rewrite. Borrow the
conditional-format helper trio from `dashboardSheet.js`.

This file gets four additions: (1) extend `SUMMARY_HEADERS` + add the 4 realized summary
metric formulas via the EXISTING `formulaRowRequest` + `SUMIFS` pattern; (2) extend
`TX_HEADERS` with the "Realized" helper column and emit its single row-22 `BYROW` spill
formula via the EXISTING `formulaRowRequest`; (3) widen number formats to the new columns
(EXISTING `numberFormatRequest`, end strictly above row 23); (4) add conditional-format
rules on the Realized $/% cells (helper trio copied from `dashboardSheet.js`).

**Pattern 1 — per-asset summary formula emission** (existing, lines 171-193). COPY this loop shape exactly for the 4 new realized metrics; only the filter (`"SELL"` not `"BUY"`) and the summed columns change:
```javascript
const dataAnchor = DATA_START_ROW;
assetList.forEach((asset, i) => {
  const row = FIRST_SUMMARY_ROW + i;
  const a = `$A${row}`; // this summary row's asset id (SUMIFS criterion)
  const buyFilter = `$C$${dataAnchor}:$C,"BUY"`;
  const assetFilter = `$B$${dataAnchor}:$B,${a}`;
  const totalInvested = `SUMIFS($H$${dataAnchor}:$H,${assetFilter},${buyFilter})`;
  // ...
  const formulas = [ `=IFERROR(${totalInvested},"—")`, /* ... */ ];
  requests.push(formulaRowRequest(sheetId, row, 2, formulas));   // startCol=2 (col B)
});
```
The Phase 6 realized block reuses `assetFilter`, swaps `buyFilter` → `sellFilter =
\`$C$${dataAnchor}:$C,"SELL"\``, and emits at a NEW `startCol` to the right of the BUY
metrics (researcher recommends summary cols H..K — see Pitfall 5 / Open Question 2). Realized
$ = `SUMIFS($J$${a}:$J,${assetFilter},${sellFilter})` over the new helper column J. Realized %
denominator = `NetProceeds − Realized$` (Pitfall 4 — do NOT use the current Avg Cost cell).

**Pattern 2 — formula row helper** (existing, lines 86-94). The row-22 `BYROW` spill formula and every summary metric is emitted through THIS helper — the open-ended `A23:A`/`A23:I` ranges live ONLY inside the formula STRING; the request range is one row above the data region:
```javascript
function formulaRowRequest(sheetId, row, startCol, formulas) {
  return {
    updateCells: {
      fields: "userEnteredValue",
      start: { sheetId, rowIndex: row - 1, columnIndex: startCol - 1 },
      rows: [{ values: formulas.map(formulaCell) }],
    },
  };
}
```
For the D-02 helper: `formulaRowRequest(sheetId, TX_HEADER_ROW, <colJ=10>, [realizedHeaderFormula])`. `TX_HEADER_ROW` is `DATA_START_ROW - 1` = 22, strictly above the data region. The `BYROW(A23:I23, LAMBDA(r, ...))` whole-row construction from RESEARCH.md §"Code Examples" (lines 266-277) is the recommended formula string (avoids the duplicate-date `MATCH` bug).

**Pattern 3 — header arrays + number-format ranges** (existing, lines 44-59, 195-214). Extend `TX_HEADERS` and `SUMMARY_HEADERS`; widen formats. Every format range end stays `≤ TX_HEADER_ROW`:
```javascript
const TX_HEADERS = ["Date", "Asset", "Type", "Price", "Qty", "Total", "Fee", "Net Cost", "Notes"]; // + "Realized"
// reservedEnd = LAST_RESERVED_SUMMARY_ROW (1-based 21); endRowIndex 21 < boundary 22.
requests.push(numberFormatRequest(sheetId, FIRST_SUMMARY_ROW, reservedEnd, 2, 2, CURRENCY_FORMAT));
```
New: a PERCENT format for the Realized % summary column and CURRENCY for Sold Qty/Net Proceeds/Realized $ — `dcaLogSheet.js` currently has no `PERCENT_FORMAT` constant; copy it from `dashboardSheet.js` line 76 (`{ type: "PERCENT", pattern: "0.00%" }`).

**Error handling / empty-state pattern** (existing, lines 178-191). Every new leaf cell wraps `IFERROR(…,"—")`, same as Phase 5. The em-dash literal is the project empty-state convention.

**Conditional-format helpers — copy from `dashboardSheet.js`** (Research Option A, lowest churn). `dcaLogSheet.js` currently has NO conditional formatting (the test at lines 138-149 even asserts its absence — that assertion MUST be inverted in Phase 6). Copy these three helpers + `MANAGED_RULE_COUNT` from `dashboardSheet.js`:

`addConditionalFormatRuleRequest` (dashboardSheet.js lines 171-181):
```javascript
function addConditionalFormatRuleRequest(sheetId, range, condition, fill, index) {
  return {
    addConditionalFormatRule: {
      rule: { ranges: [{ sheetId, ...range }], booleanRule: { condition, format: { backgroundColor: fill } } },
      index,
    },
  };
}
```
`deleteConditionalFormatRuleRequest` (dashboardSheet.js lines 184-186) + the green/red fills (lines 161-162) + the descending-index pre-clear loop (lines 216-220). The Realized $/% cells use the SAME `NUMBER_GREATER`/`NUMBER_LESS` 0 conditions as Zone A PnL (lines 230-234). The realized cells live in the summary band (rows 2..1+N) so their conditional-format range ends well above row 22 — no data-region concern.

---

### `layout-builder/src/config.js` (config)

**Analog:** itself — the `DCA_LOG` constant (line 41) and the `DASHBOARD`/`DCA_LOG`
UPPER_SNAKE_CASE constant style (lines 40-41).

**Constant pattern** (existing, lines 39-41):
```javascript
// Sheet (tab) name constants — UPPER_SNAKE_CASE per CONVENTIONS.md.
export const DASHBOARD = "Dashboard";
export const DCA_LOG = "DCA Log";
```
Phase 6 change (D-07): `DCA_LOG` VALUE becomes `"Transaction Log"`. The internal symbol name
may stay `DCA_LOG` (planner discretion — keeps `dcaLogSheet.js`/`dashboardSheet.js` imports
and the cross-sheet `'${DCA_LOG}'!...` ref in `dashboardSheet.js` line 320 unchanged with zero
churn). ADD a legacy-title constant for rename discovery (RESEARCH.md §"In-place tab rename",
line 319): `export const DCA_LOG_LEGACY = "DCA Log";`.

**Boundary constants are UNTOUCHED** (lines 70, 74): `MAX_SUMMARY_ROWS = 20`,
`DATA_START_ROW = MAX_SUMMARY_ROWS + 3 = 23`. Phase 6 adds columns, not rows — the data-region
boundary does not move.

---

### `layout-builder/src/index.js` (route / orchestration, request-response)

**Analog:** itself (`runUpdate`, lines 137-183) for tab discovery + batched-write structure;
`dcaLogSheet.js` `freezeRowsRequest` (lines 112-119) for the `updateSheetProperties` field-mask
idiom the rename reuses.

**Tab discovery pattern** (existing, lines 137-150). The rename must extend THIS block — resolve by new title, fall back to legacy title:
```javascript
const tabs = await getExistingTabs(sheets, spreadsheetId);
const dashboardId = tabs.get(DASHBOARD);
const dcaLogId = tabs.get(DCA_LOG);
const missing = [];
if (dashboardId === undefined) missing.push(DASHBOARD);
if (dcaLogId === undefined) missing.push(DCA_LOG);
if (missing.length > 0) { throw new Error(`--update requires existing tab(s): ...`); }
```
Phase 6 (Pitfall 2): for the log tab, `let logId = tabs.get(DCA_LOG); if (logId === undefined) { logId = tabs.get(DCA_LOG_LEGACY); ... emit rename request ... }`. The rename must run BEFORE/with the structural batch and be idempotent (skip if already renamed).

**`updateSheetProperties` field-mask idiom** (existing analog — `freezeRowsRequest`, dcaLogSheet.js lines 112-119). The rename request is THE SAME request type with `fields: "title"`:
```javascript
// EXISTING field-mask request (freeze rows) — the rename mirrors this exact shape:
function freezeRowsRequest(sheetId, count) {
  return {
    updateSheetProperties: {
      properties: { sheetId, gridProperties: { frozenRowCount: count } },
      fields: "gridProperties.frozenRowCount",
    },
  };
}
```
Rename request (RESEARCH.md lines 330-336): `{ updateSheetProperties: { properties: { sheetId: legacyId, title: DCA_LOG }, fields: "title" } }`. Field-mask semantics preserve all cell data — NEVER `deleteSheet`+`addSheet` (irreversible-data-loss guard, D-07 / Phase 2 D-06).

**Batched-write pattern** (existing, lines 81-87, 173-177). The rename request goes in the same/preceding batch as `dcaLogUpdateRequests(logId)`. Note the EXISTING WR-01 split: conditional pre-clear deletes go in their OWN error-tolerant batch (lines 158-166) via `isNoConditionalRuleAtIndexError`. If Phase 6 adds conditional formatting to the LOG tab, a parallel `dcaLogConditionalPreClearRequests` + its own error-tolerant batch is required (mirror `dashboardConditionalPreClearRequests`, dashboardSheet.js lines 455-461).

---

### `layout-builder/src/dcaLogSheet.test.js` (test)

**Analog:** itself — the data-region guard (lines 64-79), the formula-presence assertions
(lines 138-163), the determinism check (lines 165-167), and the `extractRanges`/header-finder
helpers (lines 174-269).

**THE CRITICAL data-region assertion** (existing, lines 64-79) — applies UNCHANGED to all new realized formulas/formats; the new "Realized" helper column header at row 22 and all summary metrics must satisfy it:
```javascript
test("NO dcaLogUpdateRequests range touches a row at or below the data region", () => {
  const reqs = dcaLogUpdateRequests(GRID_ID);
  for (const req of reqs) {
    for (const range of extractRanges(req)) {
      expect(range.endRowIndex).toBeDefined();
      expect(range.endRowIndex).toBeLessThanOrEqual(DATA_START_ROW_0BASED); // ≤ 22
      if (range.startRowIndex !== undefined) {
        expect(range.startRowIndex).toBeLessThan(DATA_START_ROW_0BASED);
      }
    }
  }
});
```

**Assertions REQUIRING change in Phase 6:**
- `EXPECTED_HEADERS` (lines 23-33) — add `"Realized"` (10-column header now). The header-finder helpers (`findHeaderRow`, `findHeaderRowIndex`, lines 199-215, 252-269) key off `EXPECTED_HEADERS.length`, so updating the array propagates correctly.
- The "STILL no conditional formatting" assertion (lines 146-148) — MUST be INVERTED: Phase 6 ADDS conditional formatting to the log tab, so `expect(build).toContain("addConditionalFormatRule")` (and the descending-index pre-clear / no-stacking idempotency, mirroring how the Dashboard test asserts it).

**New assertions to ADD (mirror existing shapes):**
- Realized formulas present: `expect(build).toContain('SUMIFS')` with `,\\"SELL\\"` (mirror the BUY assertion at line 159).
- Helper `BYROW` spill present and anchored at row 22 (0-based 21): assert a `formulaValue` containing `BYROW` whose `updateCells.start.rowIndex === 21`.
- Realized % uses `IFERROR(…,"—")` (mirror lines 160-162).

**Test bootstrap pattern** (existing, line 9): `import "./testEnv.js";` FIRST so `SPREADSHEET_ID` exists before `config.js` evaluates. (Note: WR-03 made config validation lazy, but the convention persists.)

---

### `apps-script/src/Config.ts` / `Refresh.ts` (config — VERIFY-ONLY, likely no-op)

**Analog:** `Refresh.ts` `DASHBOARD_SHEET` constant (line 133).

**VERIFIED during pattern mapping (resolves RESEARCH.md Assumption A2 / Pitfall 3):** a grep of
`apps-script/src/` for `getSheetByName` / `"DCA Log"` / `"Transaction Log"` found **exactly one**
sheet-name reference, and it targets the DASHBOARD tab, not the log tab:
```typescript
// apps-script/src/Refresh.ts:133
const DASHBOARD_SHEET = "Dashboard";
// apps-script/src/Refresh.ts:202
const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(DASHBOARD_SHEET);
```
`Config.ts` defines the asset registry + refresh/cache constants and has **no** log-tab name
reference. `refreshAll()` writes Qty/Price/status to the Dashboard ONLY — it never reads or
writes the (renamed) log tab.

**Conclusion for the planner:** the D-07 "Apps Script lockstep" change is a **no-op**. No
`Config.ts`/`Refresh.ts` string to change, and therefore **no `bun build` + `clasp push --force`
is required for the rename** (avoiding the manifest-prompt risk noted in STATE.md 04-03). The
plan should record this verification rather than scheduling a phantom edit.

---

## Shared Patterns

### IFERROR em-dash empty state (D-06, carry-forward)
**Source:** `dcaLogSheet.js` lines 178-191 (BUY metrics); `dashboardSheet.js` line 42 (`EMPTY_STATE = '"—"'`).
**Apply to:** Every new realized leaf/aggregate cell — Sold Qty, Net Proceeds, Realized $, Realized %, portfolio Total, and the `IF(d="","")` blank-row guard inside the `BYROW` spill.
```javascript
`=IFERROR(${expr},"—")`
```

### Formula range lives in the STRING, request range stays above row 23 (LAYOUT-02 / D-06)
**Source:** `dcaLogSheet.js` lines 82-94 (`formulaRowRequest` doc + impl), 170-176.
**Apply to:** The row-22 `BYROW` helper formula and all summary `SUMIFS`. Open-ended `A23:A`/`A23:I`/`$J$23:$J` appear ONLY inside `formulaValue` strings; every emitted request `start.rowIndex`/`endRowIndex` stays `≤ 22` (0-based ≤ 21 / endRowIndex ≤ 22). This is the entire data-loss safety mechanism.

### Conditional-format idempotency: descending-index pre-clear in a SEPARATE error-tolerant batch (D-07 / WR-01)
**Source:** `dashboardSheet.js` lines 208-252 (helpers + `MANAGED_RULE_COUNT`), 455-461 (`dashboardConditionalPreClearRequests`); `index.js` lines 132-166 (`isNoConditionalRuleAtIndexError` + try/catch batch).
**Apply to:** The new Realized $/% conditional-format rules on the log tab. ADD rules in both `--build` and `--update`; pre-clear (descending index `[N-1..0]`) only on `--update`, in its own batch that swallows the "No conditional format rule found at index" 400. Build passes pre-clear=false (fresh atomic tab has 0 rules; an out-of-range delete rolls back the whole build batch).

### `updateSheetProperties` field-mask (data-preserving) (D-07)
**Source:** `dcaLogSheet.js` lines 112-119 (`freezeRowsRequest`), `dashboardSheet.js` lines 255-262 (`freezeHeaderRequest`).
**Apply to:** The in-place tab rename in `index.js` — `fields: "title"`. Never delete+recreate.

### Overflow guard (fail loud, never shift the boundary) (LAYOUT-02)
**Source:** `dcaLogSheet.js` lines 134-140; `dashboardSheet.js` lines 280-286.
**Apply to:** Unchanged — Phase 6 adds no per-asset ROWS, but the existing `assets.length > MAX_SUMMARY_ROWS` guard must remain intact ahead of the new column emissions.

## No Analog Found

| Construct | Role | Reason | Source instead |
|-----------|------|--------|----------------|
| `BYROW(...LAMBDA(...))` whole-row spill formula | helper-column formula string | No existing formula in the codebase uses `BYROW`/`LAMBDA` or a per-row spill — Phase 5 used only scalar `SUMIFS`/`COUNTIFS`/`MAXIFS` | RESEARCH.md §"Code Examples" lines 230-277 (recommended whole-row `BYROW(A23:I23, LAMBDA(r, LET(...)))` form) + Pitfall 1 (avoid `ARRAYFORMULA(SUMIFS)` scalar-collapse trap) |
| `PERCENT_FORMAT` constant in `dcaLogSheet.js` | number-format constant | `dcaLogSheet.js` only declares CURRENCY/DATE; the Realized % column needs PERCENT | Copy `dashboardSheet.js` line 76: `{ type: "PERCENT", pattern: "0.00%" }` |
| `DCA_LOG_LEGACY` rename-discovery constant | config constant | New transition concept; no prior "old title" constant exists | RESEARCH.md line 319 + Pitfall 2 |

> All other Phase 6 work has an exact in-codebase analog (the file's own Phase 5 code or a
> sibling builder). The planner should EXTEND these patterns, not invent new structure.

## Metadata

**Analog search scope:** `layout-builder/src/` (all 4 builders + tests), `apps-script/src/` (grep for sheet-name references)
**Files scanned:** 6 (dcaLogSheet.js, config.js, index.js, dcaLogSheet.test.js, dashboardSheet.js; apps-script/src grep)
**Verifications performed:** Apps Script log-tab reference grep (RESEARCH A2/Pitfall 3) — CONFIRMED no log-tab reference; D-07 Apps Script lockstep is a no-op
**Pattern extraction date:** 2026-06-20
