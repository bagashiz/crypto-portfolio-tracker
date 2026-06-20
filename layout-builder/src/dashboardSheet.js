// layout-builder Dashboard sheet definition (local-only Node / ESM runtime).
//
// Pure request-builders: each function takes a sheet gridId and returns an array of
// Google Sheets API `batchUpdate` request objects describing the Dashboard STRUCTURE
// only. No network calls, no Google globals — so the layout is unit-testable offline.
//
// Layout (STRUCTURE.md "Spreadsheet Structure"):
//   Zone A — Live Holdings:     rows 1-10  (header row 1, per-asset rows, TOTAL row 10)
//   Zone B — Allocation Health: rows 12-21 (header row 12, per-asset rows, TOTALS row 21)
//
// PHASE 5 (PnL & Allocation): this file now emits formula cells
// (`userEnteredValue.formulaValue`) and conditional-format rules
// (`addConditionalFormatRule`) on top of the Phase 2 skeleton — Zone A unrealized
// PnL (PNL-03) with green/red background fills (PNL-04), and Zone B allocation
// health (target/actual/drift/risk + blended-risk totals, ALLOC-01/ALLOC-02).
// The Dashboard has no protected data region, so build == update for formulas;
// conditional-format rules are made idempotent via delete-then-add (D-07).

import { assets, DASHBOARD, DCA_LOG } from "./config.js";

// DCA Log summary geometry (single source of truth for Avg Cost, D-03). The DCA Log
// summary block (see dcaLogSheet.js) places one per-asset summary row at
// FIRST_SUMMARY_ROW + i (1-based 2 + i), in assets.json order, and Avg Cost (DCA) is
// summary column D. The Dashboard AvgCost cell references that cell cross-sheet rather
// than re-deriving the SUMIF (PROJECT.md Key Decision: single source of truth).
const DCA_LOG_FIRST_SUMMARY_ROW = 2; // mirrors dcaLogSheet.js FIRST_SUMMARY_ROW
const DCA_LOG_AVGCOST_COL = "D"; // Avg Cost (DCA) is summary col D in dcaLogSheet.js

// --- Layout constants (Claude's discretion, derived from STRUCTURE.md, D-41) ---

// Zone A — Live Holdings (D-01: APY % dropped; AvgCost/PnL $/PnL % added → cols A..I).
const ZONE_A_HEADER_ROW = 1; // 1-based
const ZONE_A_HEADERS = ["Asset", "Qty", "Price", "Value", "Target %", "Risk", "AvgCost", "PnL $", "PnL %"];

// Zone B — Allocation Health (blank row 11 separates the zones).
// D-05: APY % and Monthly Yield dropped everywhere → cols A..E.
const ZONE_B_HEADER_ROW = 12; // 1-based
const ZONE_B_HEADERS = ["Asset", "Target %", "Actual %", "Drift", "Risk"];

// Em-dash empty state (D-06): leaf/aggregate formulas wrap IFERROR(…, EMPTY_STATE) so
// an asset with no BUY rows reads "—" rather than #DIV/0!.
const EMPTY_STATE = '"—"';

// Maximum Zone A per-asset rows before Zone A's TOTAL row would collide with Zone B's
// pinned header. Zone A occupies rows 1..(2 + assets.length); the TOTAL row lands at
// (2 + assets.length). For no overlap with ZONE_B_HEADER_ROW (12) and a 1-row blank gap
// (row 11) we need (2 + assets.length) < 12, i.e. assets.length <= 9. Mirrors the DCA Log
// MAX_SUMMARY_ROWS guard: fail loudly rather than silently overwrite Zone B (LAYOUT-02).
const MAX_ZONE_A_ASSET_ROWS = ZONE_B_HEADER_ROW - 3; // = 9

// Per-venue refresh status block (REFRESH-04, D-04/D-05/D-06).
// COLUMN-anchored top-right of the Dashboard, well to the right of Zone A/B (cols A–G),
// so the MAX_ZONE_A_ASSET_ROWS guard — which only shifts ROWS as the registry grows —
// can never make it collide with zone data. The layout builder owns ONLY the static
// labels here (venue names + header row); refreshAll() in Apps Script writes the dynamic
// timestamp + Stale? VALUES into the adjacent cells (D-05 build-time/run-time split).
//
// D-01 RELOCATION: Zone A now widens to col I (1-based 9). The status block moves
// right of col I with a one-column gap → STATUS_START_COL = 11 (col K). This is the
// cross-runtime geometry value Plan 03 (Refresh.ts) MUST match:
//   Refresh.ts STATUS_LASTUPDATED_COL = STATUS_START_COL + 1 = 12 (col L), Stale? = 13 (col M).
//
// Exact geometry (so refreshAll() targets the matching cells):
//   Col K (1-based 11) = STATUS_START_COL: venue label  ("Status" / "Hyperliquid" / "Solana/Jupiter")
//   Col L (1-based 12)                   : LastUpdated   (header static; value rows filled by refreshAll)
//   Col M (1-based 13)                   : Stale?        (header static; value rows filled by refreshAll)
//   Row 1 (STATUS_START_ROW) = header row: ["Status", "LastUpdated", "Stale?"]
//   Row 2                    = Hyperliquid line:   ["Hyperliquid"]    (L2/M2 filled by refreshAll)
//   Row 3                    = Solana/Jupiter line:["Solana/Jupiter"] (L3/M3 filled by refreshAll)
const STATUS_START_COL = 11; // 1-based col K — one-col gap right of new Zone A last col I (=9)
const STATUS_START_ROW = 1; // 1-based row 1 — top-right, above Zone B's header row (12)
const STATUS_HEADERS = ["Status", "LastUpdated", "Stale?"];
const STATUS_VENUE_LINES = ["Hyperliquid", "Solana/Jupiter"];

// Number-format pattern for percent / currency columns (skeleton formatting only).
const PERCENT_FORMAT = { type: "PERCENT", pattern: "0.00%" };
const CURRENCY_FORMAT = { type: "CURRENCY", pattern: "$#,##0.00" };

// --- Small request helpers ---

function stringCell(value) {
  return { userEnteredValue: { stringValue: value } };
}

// Formula cell — mirrors stringCell but emits userEnteredValue.formulaValue (D-02/D-03).
// `formula` must begin with "=" (Sheets treats formulaValue as a formula expression).
function formulaCell(formula) {
  return { userEnteredValue: { formulaValue: formula } };
}

// updateCells request writing a single row of formula cells starting at (row, startCol).
// Mirrors labelRowRequest; `row`/`startCol` are 1-based and converted to 0-based here.
function formulaRowRequest(sheetId, row, startCol, formulas) {
  return {
    updateCells: {
      fields: "userEnteredValue",
      start: { sheetId, rowIndex: row - 1, columnIndex: startCol - 1 },
      rows: [{ values: formulas.map(formulaCell) }],
    },
  };
}

// Single-cell formula request at (row, col) (1-based). Used where only one cell in a row
// gets a formula (e.g. Zone A TOTAL Value, Zone B blended-risk) and the surrounding cells
// must stay untouched (notably Qty(B)/Price(C), written by refreshAll()).
function formulaCellRequest(sheetId, row, col, formula) {
  return formulaRowRequest(sheetId, row, col, [formula]);
}

// Static numeric value cell — for Target %/Risk pulled from assets.json (NOT formulas).
function numberCell(value) {
  return { userEnteredValue: { numberValue: value } };
}

function numberCellRequest(sheetId, row, col, value) {
  return {
    updateCells: {
      fields: "userEnteredValue",
      start: { sheetId, rowIndex: row - 1, columnIndex: col - 1 },
      rows: [{ values: [numberCell(value)] }],
    },
  };
}

// updateCells request writing a single row of string labels starting at (row, startCol).
// `row`/`startCol` are 1-based for readability; converted to 0-based grid indices here.
function labelRowRequest(sheetId, row, startCol, labels) {
  return {
    updateCells: {
      fields: "userEnteredValue",
      start: {
        sheetId,
        rowIndex: row - 1,
        columnIndex: startCol - 1,
      },
      rows: [{ values: labels.map(stringCell) }],
    },
  };
}

// repeatCell number-format request over a column block (skeleton formatting).
function numberFormatRequest(sheetId, startRow, endRow, startCol, endCol, numberFormat) {
  return {
    repeatCell: {
      range: {
        sheetId,
        startRowIndex: startRow - 1,
        endRowIndex: endRow, // exclusive, already 1-based-inclusive -> exclusive
        startColumnIndex: startCol - 1,
        endColumnIndex: endCol, // exclusive
      },
      cell: { userEnteredFormat: { numberFormat } },
      fields: "userEnteredFormat.numberFormat",
    },
  };
}

// --- Conditional formatting (D-07) — NEW request type, no prior analog ---

// Light green / light red background fills (background-fill, not text color, D-07).
const GREEN_FILL = { red: 0.72, green: 0.88, blue: 0.74 };
const RED_FILL = { red: 0.96, green: 0.8, blue: 0.8 };

// Drift tolerance (D-07, Claude's discretion): flag when |drift| >= 0.05 (5 percentage
// points absolute). Drift values are fractions (Actual % − Target %), so 0.05 = 5pp.
const DRIFT_TOLERANCE = 0.05;

// addConditionalFormatRule request (Sheets v4). `condition` is a BooleanCondition
// (e.g. NUMBER_GREATER / NUMBER_LESS / CUSTOM_FORMULA); `fill` is a backgroundColor RGB.
// `range` is a 0-based GridRange. `index` positions the rule (managed rules are 0..N-1).
function addConditionalFormatRuleRequest(sheetId, range, condition, fill, index) {
  return {
    addConditionalFormatRule: {
      rule: {
        ranges: [{ sheetId, ...range }],
        booleanRule: { condition, format: { backgroundColor: fill } },
      },
      index,
    },
  };
}

// deleteConditionalFormatRule at a given 0-based index on a sheet (idempotency, D-07).
function deleteConditionalFormatRuleRequest(sheetId, index) {
  return { deleteConditionalFormatRule: { sheetId, index } };
}

// The Dashboard conditional-format rules (D-07): green PnL>0 / red PnL<0 on cols H+I
// over Zone A asset rows, plus a red |drift|>=tolerance flag on Zone B col D. Emitted in
// BOTH --build and --update. IDEMPOTENCY: addConditionalFormatRule STACKS on naive
// re-add, so on --update we emit deleteConditionalFormatRule for the managed indices
// FIRST, in DESCENDING order ([N-1 .. 0]). Each delete at the current top index removes
// one managed rule; descending order keeps the remaining target indices stable.
//
// The pre-clear is gated on `preClearConditionalRules` because the two paths have
// different invariants:
//   --build: the tab is freshly created in the SAME atomic batchUpdate (see index.js
//            runBuild) → it has 0 conditional-format rules → there is NOTHING to clear.
//            index.js batches the build with NO per-request error tolerance, so a delete
//            at a nonexistent index returns 400 "No conditional format rule found at
//            index N" and rolls back the ENTIRE structural stamp. Pre-clearing on build
//            BREAKS the build, so build passes preClearConditionalRules=false.
//   --update: the tab previously had structuralRequests applied → it has exactly
//            MANAGED_RULE_COUNT (3) managed rules → pre-clear deletes them so the re-add
//            converges to exactly 3 rules (never grows). Update passes true.
// 3 managed rules: green PnL>0 (H+I), red PnL<0 (H+I), red Drift |d|>=tol (Zone B D).
// Each rule spans its full column range, so PnL is one green + one red rule (not per-col).
const MANAGED_RULE_COUNT = 3;

function conditionalFormatRequests(sheetId, zoneAFirstAssetRow, zoneATotalRow, zoneBFirstAssetRow, zoneBTotalsRow, preClearConditionalRules) {
  const requests = [];

  // Pre-clear managed rules in DESCENDING index order so re-running --update never stacks.
  // Only on --update: a fresh --build tab has 0 rules and deleting a nonexistent index
  // rolls back the whole atomic build batch (index.js has no per-request error tolerance).
  if (preClearConditionalRules) {
    for (let i = MANAGED_RULE_COUNT - 1; i >= 0; i--) {
      requests.push(deleteConditionalFormatRuleRequest(sheetId, i));
    }
  }

  // Zone A PnL $ (col H = 0-based 7) + PnL % (col I = 0-based 8) over per-asset rows.
  // 0-based row span: [zoneAFirstAssetRow-1 .. zoneATotalRow-1) (excludes the TOTAL row).
  const pnlRange = {
    startRowIndex: zoneAFirstAssetRow - 1,
    endRowIndex: zoneATotalRow - 1,
    startColumnIndex: 7, // col H
    endColumnIndex: 9, // exclusive → cols H, I
  };
  const greaterThanZero = { type: "NUMBER_GREATER", values: [{ userEnteredValue: "0" }] };
  const lessThanZero = { type: "NUMBER_LESS", values: [{ userEnteredValue: "0" }] };
  // Indices 0..1: green (PnL>0) then red (PnL<0). 0 / em-dash text get no fill.
  requests.push(addConditionalFormatRuleRequest(sheetId, pnlRange, greaterThanZero, GREEN_FILL, 0));
  requests.push(addConditionalFormatRuleRequest(sheetId, pnlRange, lessThanZero, RED_FILL, 1));

  // Zone B Drift (col D = 0-based 3) over per-asset rows: red when |drift| >= tolerance.
  // CUSTOM_FORMULA references the first cell of the range (D{firstZoneBrow}); Sheets
  // applies it relatively down the range. em-dash text in Drift → ABS errors → no fill.
  const driftRange = {
    startRowIndex: zoneBFirstAssetRow - 1,
    endRowIndex: zoneBTotalsRow - 1,
    startColumnIndex: 3, // col D
    endColumnIndex: 4, // exclusive → col D only
  };
  const driftCustom = {
    type: "CUSTOM_FORMULA",
    values: [{ userEnteredValue: `=ABS(D${zoneBFirstAssetRow})>=${DRIFT_TOLERANCE}` }],
  };
  requests.push(addConditionalFormatRuleRequest(sheetId, driftRange, driftCustom, RED_FILL, 2));

  return requests;
}

// Freeze the top header row of the sheet.
function freezeHeaderRequest(sheetId) {
  return {
    updateSheetProperties: {
      properties: { sheetId, gridProperties: { frozenRowCount: 1 } },
      fields: "gridProperties.frozenRowCount",
    },
  };
}

// Shared structural request set (build and update apply the same ranges — the
// Dashboard has no protected data region, so update == build for structure).
//
// `assetList` defaults to the shared registry; an explicit list is accepted only so the
// overflow guard and Zone A/Zone B boundary-invariance can be exercised without mutating
// the import (mirrors dcaLogSheet.js `bandRequests`).
//
// `preClearConditionalRules` gates the conditional-format pre-clear deletes: false on
// --build (fresh tab, 0 rules, deletes would roll back the atomic build batch), true on
// --update (3 managed rules already present, pre-clear prevents stacking). See
// conditionalFormatRequests for the full invariant.
function structuralRequests(sheetId, assetList = assets, preClearConditionalRules = false) {
  // FAIL LOUDLY rather than silently overwrite Zone B. If the registry outgrows the
  // rows reserved above Zone B's pinned header, Zone A's TOTAL/label rows would stamp
  // onto Zone B's header and data — the exact "registry growth corrupts layout" defect
  // LAYOUT-02 exists to prevent. Mirrors the DCA Log MAX_SUMMARY_ROWS guard.
  if (assetList.length > MAX_ZONE_A_ASSET_ROWS) {
    throw new Error(
      `assets.length (${assetList.length}) exceeds MAX_ZONE_A_ASSET_ROWS ` +
        `(${MAX_ZONE_A_ASSET_ROWS}); Zone A would overwrite Zone B (header row ` +
        `${ZONE_B_HEADER_ROW}). Move ZONE_B_HEADER_ROW down or reduce the registry.`
    );
  }

  const requests = [];

  // Frozen header row.
  requests.push(freezeHeaderRequest(sheetId));

  // Zone A header + per-asset rows + TOTAL row.
  //
  // Per-asset row layout (D-01/D-02/D-03/D-06), cols A..I:
  //   A Asset    — label (asset id)
  //   B Qty      — LEFT EMPTY (refreshAll() writes the live on-chain qty)
  //   C Price    — LEFT EMPTY (refreshAll() writes the live price)
  //   D Value    — formula =B{r}*C{r}                         (D-02; never refresh-written)
  //   E Target % — static value from assets.json asset.target
  //   F Risk     — static value from assets.json asset.risk
  //   G AvgCost  — cross-sheet ref to the DCA Log summary Avg Cost cell (D-03, single source)
  //   H PnL $    — =IFERROR(D{r}-B{r}*G{r},"—")               (D-02/D-06)
  //   I PnL %    — =IFERROR((D{r}-B{r}*G{r})/(B{r}*G{r}),"—") (D-02/D-06)
  requests.push(labelRowRequest(sheetId, ZONE_A_HEADER_ROW, 1, ZONE_A_HEADERS));
  const zoneAFirstAssetRow = ZONE_A_HEADER_ROW + 1;
  assetList.forEach((asset, i) => {
    const row = zoneAFirstAssetRow + i;
    // A: asset id label. B/C stay EMPTY for refreshAll() (do NOT emit a value).
    requests.push(labelRowRequest(sheetId, row, 1, [asset.id]));
    // D: Value = Qty*Price (formula, not a refresh-written value).
    requests.push(formulaCellRequest(sheetId, row, 4, `=B${row}*C${row}`));
    // E/F: static target/risk from the registry.
    requests.push(numberCellRequest(sheetId, row, 5, asset.target));
    requests.push(numberCellRequest(sheetId, row, 6, asset.risk));
    // G: AvgCost references the DCA Log summary Avg Cost cell for this asset.
    // DCA Log summary row for asset i is DCA_LOG_FIRST_SUMMARY_ROW + i (1-based), Avg Cost
    // is summary col D. Sheet name quoted (contains a space); referenced from config (DCA_LOG).
    const dcaSummaryRow = DCA_LOG_FIRST_SUMMARY_ROW + i;
    const avgCostRef = `'${DCA_LOG}'!$${DCA_LOG_AVGCOST_COL}$${dcaSummaryRow}`;
    requests.push(formulaCellRequest(sheetId, row, 7, `=IFERROR(${avgCostRef},${EMPTY_STATE})`));
    // H: PnL $ = Value - Qty*AvgCost.
    requests.push(formulaCellRequest(sheetId, row, 8, `=IFERROR(D${row}-B${row}*G${row},${EMPTY_STATE})`));
    // I: PnL % = (Value - Qty*AvgCost) / (Qty*AvgCost).
    requests.push(
      formulaCellRequest(sheetId, row, 9, `=IFERROR((D${row}-B${row}*G${row})/(B${row}*G${row}),${EMPTY_STATE})`)
    );
  });
  const zoneATotalRow = ZONE_A_HEADER_ROW + 1 + assetList.length;
  const zoneALastAssetRow = zoneATotalRow - 1;
  requests.push(labelRowRequest(sheetId, zoneATotalRow, 1, ["TOTAL"]));
  // TOTAL Value (D): sum of the per-asset Value cells — drives Zone B Actual %.
  requests.push(
    formulaCellRequest(
      sheetId,
      zoneATotalRow,
      4,
      `=IFERROR(SUM(D${zoneAFirstAssetRow}:D${zoneALastAssetRow}),${EMPTY_STATE})`
    )
  );

  // Zone A number formats: Price/Value currency (cols C-D), Target % percent (E),
  // AvgCost + PnL $ currency (G-H), PnL % percent (I).
  requests.push(numberFormatRequest(sheetId, zoneAFirstAssetRow, zoneATotalRow, 3, 4, CURRENCY_FORMAT));
  requests.push(numberFormatRequest(sheetId, zoneAFirstAssetRow, zoneATotalRow, 5, 5, PERCENT_FORMAT));
  requests.push(numberFormatRequest(sheetId, zoneAFirstAssetRow, zoneATotalRow, 7, 8, CURRENCY_FORMAT));
  requests.push(numberFormatRequest(sheetId, zoneAFirstAssetRow, zoneATotalRow, 9, 9, PERCENT_FORMAT));

  // Zone B header + per-asset rows + TOTALS row.
  //
  // Per-asset row layout (D-05/D-06), cols A..E:
  //   A Asset    — label (asset id)
  //   B Target % — static value from assets.json asset.target
  //   C Actual % — =IFERROR(<asset Zone A Value>/<Zone A TOTAL Value>,"—")
  //   D Drift    — =IFERROR(C{r}-B{r},"—")
  //   E Risk     — static value from assets.json asset.risk
  requests.push(labelRowRequest(sheetId, ZONE_B_HEADER_ROW, 1, ZONE_B_HEADERS));
  const zoneBFirstAssetRow = ZONE_B_HEADER_ROW + 1;
  assetList.forEach((asset, i) => {
    const row = zoneBFirstAssetRow + i;
    // A: asset id label.
    requests.push(labelRowRequest(sheetId, row, 1, [asset.id]));
    // B: static target.
    requests.push(numberCellRequest(sheetId, row, 2, asset.target));
    // C: Actual % = this asset's Zone A Value / Zone A TOTAL Value (same-sheet refs).
    const zoneAValueCell = `$D$${zoneAFirstAssetRow + i}`;
    const zoneATotalValueCell = `$D$${zoneATotalRow}`;
    requests.push(
      formulaCellRequest(sheetId, row, 3, `=IFERROR(${zoneAValueCell}/${zoneATotalValueCell},${EMPTY_STATE})`)
    );
    // D: Drift = Actual % - Target %.
    requests.push(formulaCellRequest(sheetId, row, 4, `=IFERROR(C${row}-B${row},${EMPTY_STATE})`));
    // E: static risk.
    requests.push(numberCellRequest(sheetId, row, 5, asset.risk));
  });
  const zoneBTotalsRow = ZONE_B_HEADER_ROW + 1 + assetList.length;
  const zoneBLastAssetRow = zoneBTotalsRow - 1;
  requests.push(labelRowRequest(sheetId, zoneBTotalsRow, 1, ["TOTALS"]));
  // TOTALS Target sum (B).
  requests.push(
    formulaCellRequest(
      sheetId,
      zoneBTotalsRow,
      2,
      `=IFERROR(SUM(B${zoneBFirstAssetRow}:B${zoneBLastAssetRow}),${EMPTY_STATE})`
    )
  );
  // TOTALS blended Risk (E): SUMPRODUCT(Risk, Actual%) with IFERROR(Actual%,0) guard so
  // em-dash text in Actual % is treated as 0 and never propagates (D-06).
  requests.push(
    formulaCellRequest(
      sheetId,
      zoneBTotalsRow,
      5,
      `=IFERROR(SUMPRODUCT(E${zoneBFirstAssetRow}:E${zoneBLastAssetRow},` +
        `IFERROR(C${zoneBFirstAssetRow}:C${zoneBLastAssetRow},0)),${EMPTY_STATE})`
    )
  );

  // Zone B number formats: Target/Actual/Drift percent (cols B-D); Risk (E) stays plain.
  requests.push(numberFormatRequest(sheetId, zoneBFirstAssetRow, zoneBTotalsRow, 2, 4, PERCENT_FORMAT));

  // Per-venue refresh status block — STATIC labels only (D-05). Column-anchored at
  // STATUS_START_COL so it is immune to the row-shifting MAX_ZONE_A_ASSET_ROWS guard.
  // Header row, then exactly 2 venue lines (D-04). Composed via labelRowRequest (the
  // single-source helper) — never a hand-built updateCells literal. The adjacent
  // LastUpdated/Stale? value cells stay empty for refreshAll() to populate.
  requests.push(labelRowRequest(sheetId, STATUS_START_ROW, STATUS_START_COL, STATUS_HEADERS));
  STATUS_VENUE_LINES.forEach((venue, i) => {
    requests.push(labelRowRequest(sheetId, STATUS_START_ROW + 1 + i, STATUS_START_COL, [venue]));
  });

  // Conditional-format rules (D-07): green/red PnL fills (Zone A H+I) + red Drift flag
  // (Zone B D). The add requests are emitted in BOTH build and update; the delete-then-add
  // pre-clear (idempotency so --update never stacks duplicates) is gated on
  // preClearConditionalRules — emitted only on --update, since a fresh --build tab has 0
  // rules and a delete at a nonexistent index would roll back the atomic build batch.
  requests.push(
    ...conditionalFormatRequests(sheetId, zoneAFirstAssetRow, zoneATotalRow, zoneBFirstAssetRow, zoneBTotalsRow, preClearConditionalRules)
  );

  return requests;
}

// Build the Dashboard structural skeleton (first-time --build).
// `assetList` defaults to the shared registry (tests pass an explicit list to drive the
// overflow guard / Zone A-Zone B boundary-invariance without mutating the import).
export function dashboardBuildRequests(sheetId, assetList = assets) {
  // Build path: fresh tab with 0 conditional-format rules → do NOT pre-clear (deleting a
  // nonexistent rule index rolls back the atomic build batch in index.js).
  return structuralRequests(sheetId, assetList, false);
}

// Re-apply the Dashboard structure idempotently (--update). No protected data region
// on the Dashboard, so this mirrors the build structural ranges (labels/formats/frozen).
export function dashboardUpdateRequests(sheetId, assetList = assets) {
  // Update path: tab already has exactly MANAGED_RULE_COUNT (3) managed rules → pre-clear
  // them in descending order so the re-add converges to 3 (never stacks duplicates).
  return structuralRequests(sheetId, assetList, true);
}

// Re-export the Zone B header row and Zone A cap so tests can assert the no-collision
// invariant (zoneATotalRow < ZONE_B_HEADER_ROW) without recomputing the magic literal.
export { ZONE_B_HEADER_ROW, MAX_ZONE_A_ASSET_ROWS };

// Re-export the Zone A/B header arrays so tests can assert the widened/reduced column
// maps (D-01/D-05) without re-deriving the literals.
export { ZONE_A_HEADERS, ZONE_B_HEADERS };

// Re-export the status-block placement constants so tests can assert column-anchoring
// (right of Zone A) and non-collision with the zones without re-deriving the literals.
export { STATUS_START_COL, STATUS_START_ROW, STATUS_HEADERS, STATUS_VENUE_LINES };

// Re-export the sheet name so callers (index.js) resolve the target tab via one place.
export { DASHBOARD };
