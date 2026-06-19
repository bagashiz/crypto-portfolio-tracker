// layout-builder DCA Log sheet definition (local-only Node / ESM runtime).
//
// HIGHEST STAKES (LAYOUT-02): the DCA Log holds hand-entered transaction history.
// A wrong batchUpdate range here is irreversible data loss. The safety mechanism is
// the simplest provably-correct one (D-06): `--update` NEVER references the data
// region. It only emits requests for the fixed top-of-data band; the data rows are
// never addressed, so they cannot be written or cleared.
//
// Top-of-data band layout (D-05) — positioned from the FIXED boundary, NOT assets.length:
//   row 1                            : summary block header ("Summary" + summary metric labels)
//   rows 2..(1+N)                    : one per-asset summary row (label = asset id), N = assets.length
//   rows (2+N)..(1+MAX_SUMMARY_ROWS) : reserved-but-unused summary rows (blank, format-only)
//   row (2+MAX_SUMMARY_ROWS)         : transaction column header row (row 22, Date..Notes A-I)
//   row DATA_START_ROW.. (row 23+)   : transaction DATA rows (user-entered, unbounded) -- NEVER touched.
//
// The band is positioned from the FIXED DATA_START_ROW (23) / MAX_SUMMARY_ROWS (20)
// reservation in config.js — it is NEVER derived from assets.length. This closes the
// LAYOUT-02 floating-boundary defect: a one-line registry edit can no longer move the
// transaction header onto a live DCA data row. Per-asset summary labels fill top-down up
// to assets.length; the reserved rows below stay blank; and assets.length > MAX_SUMMARY_ROWS
// fails loudly (below) rather than silently shifting the boundary into the data region.
//
// SUMMARY FORMULAS (Phase 5, D-04/D-06): the per-asset summary band (rows 2..1+N)
// now carries BUY-only cost-basis formulas — Total Invested, Total Qty, DCA-weighted
// Avg Cost, Buy Count, Last Buy, Total Fees — computed via SUMIFS/COUNTIFS/MAXIFS over
// open-ended A{DATA_START_ROW}:A ranges that READ the data region but never WRITE it.
// Every leaf is wrapped in IFERROR(…, "—") so an asset with no BUY rows reads "—" not
// #DIV/0!. This is the single source of truth for avg cost (the Dashboard AvgCost cell
// references it, D-03). SELL rows are ignored — realized PnL is Phase 6 (D-04).
//
// STILL NO conditional formatting on this tab (only the Dashboard, D-07) and NO
// data-validation dropdowns (PNL-06 v2-deferred). The open-ended ranges appear ONLY
// inside formula STRINGS; every emitted request range stays strictly above DATA_START_ROW
// (the irreversible-data-loss guard, LAYOUT-02 / D-06).

import { assets, DCA_LOG, DATA_START_ROW, MAX_SUMMARY_ROWS } from "./config.js";

// --- Layout constants (positioned from the FIXED boundary, never from assets.length) ---

const SUMMARY_HEADER_ROW = 1; // 1-based
const FIRST_SUMMARY_ROW = 2; // first per-asset summary row
// Last row of the reserved summary block (1-based): row (1 + MAX_SUMMARY_ROWS) = 21.
const LAST_RESERVED_SUMMARY_ROW = 1 + MAX_SUMMARY_ROWS;
const SUMMARY_HEADERS = [
  "Summary",
  "Total Invested",
  "Total Qty",
  "Avg Cost (DCA)",
  "Buy Count",
  "Last Buy",
  "Total Fees",
];

// Transaction header row sits immediately above the data region.
const TX_HEADER_ROW = DATA_START_ROW - 1; // 1-based
const TX_HEADERS = ["Date", "Asset", "Type", "Price", "Qty", "Total", "Fee", "Net Cost", "Notes"];

const CURRENCY_FORMAT = { type: "CURRENCY", pattern: "$#,##0.00" };
const DATE_FORMAT = { type: "DATE", pattern: "yyyy-mm-dd" };

// --- Request helpers ---

function stringCell(value) {
  return { userEnteredValue: { stringValue: value } };
}

// Mirror of stringCell, emitting a formula payload. The formula string begins with "=".
function formulaCell(formula) {
  return { userEnteredValue: { formulaValue: formula } };
}

function labelRowRequest(sheetId, row, startCol, labels) {
  return {
    updateCells: {
      fields: "userEnteredValue",
      start: { sheetId, rowIndex: row - 1, columnIndex: startCol - 1 },
      rows: [{ values: labels.map(stringCell) }],
    },
  };
}

// Mirror of labelRowRequest, mapping each entry through formulaCell. `row`/`startCol`
// are 1-based and converted to 0-based. The request range spans exactly one row at
// `row` — the open-ended A{DATA_START_ROW}:A ranges live ONLY inside the formula
// strings, so this request never addresses the data region (LAYOUT-02 / D-06).
function formulaRowRequest(sheetId, row, startCol, formulas) {
  return {
    updateCells: {
      fields: "userEnteredValue",
      start: { sheetId, rowIndex: row - 1, columnIndex: startCol - 1 },
      rows: [{ values: formulas.map(formulaCell) }],
    },
  };
}

function numberFormatRequest(sheetId, startRow, endRow, startCol, endCol, numberFormat) {
  return {
    repeatCell: {
      range: {
        sheetId,
        startRowIndex: startRow - 1,
        endRowIndex: endRow, // exclusive (1-based-inclusive end -> exclusive)
        startColumnIndex: startCol - 1,
        endColumnIndex: endCol, // exclusive
      },
      cell: { userEnteredFormat: { numberFormat } },
      fields: "userEnteredFormat.numberFormat",
    },
  };
}

function freezeRowsRequest(sheetId, count) {
  return {
    updateSheetProperties: {
      properties: { sheetId, gridProperties: { frozenRowCount: count } },
      fields: "gridProperties.frozenRowCount",
    },
  };
}

// The fixed structural band — and ONLY the band. Every range below is bounded strictly
// above DATA_START_ROW (the FIXED boundary, row 23). No request addresses any row at or
// beyond the data region (the irreversible-data-loss guard, LAYOUT-02 / D-06). The band
// is positioned from the fixed boundary, NOT assets.length, so a registry edit can never
// shift it. This is also why build and update share the same set: there is no separate
// "clear data" step to get wrong.
//
// `assetList` defaults to the shared registry; an explicit list is accepted only so the
// overflow guard and boundary-invariance can be exercised without mutating the import.
function bandRequests(sheetId, assetList = assets) {
  // FAIL LOUDLY rather than silently shift the boundary into the data region. If the
  // registry outgrows the reserved summary block, the operator must raise MAX_SUMMARY_ROWS
  // in config.js and re-run --build — never let the band creep onto live transactions.
  if (assetList.length > MAX_SUMMARY_ROWS) {
    throw new Error(
      `assets.length (${assetList.length}) exceeds MAX_SUMMARY_ROWS (${MAX_SUMMARY_ROWS}); ` +
        "increase MAX_SUMMARY_ROWS in config.js and re-run --build — refusing to silently " +
        "shift DATA_START_ROW into the DCA Log data region (LAYOUT-02)."
    );
  }

  const requests = [];

  // Freeze the summary block + transaction header (everything above the data region).
  requests.push(freezeRowsRequest(sheetId, TX_HEADER_ROW));

  // Summary block header row.
  requests.push(labelRowRequest(sheetId, SUMMARY_HEADER_ROW, 1, SUMMARY_HEADERS));

  // One summary row per asset, filling the reserved block TOP-DOWN (rows 2..1+N). The
  // reserved-but-unused rows (N+2..1+MAX_SUMMARY_ROWS) receive NO label request — they
  // stay blank (label only — Phase 5 fills SUMIF metrics, D-07/D-08).
  assetList.forEach((asset, i) => {
    const row = FIRST_SUMMARY_ROW + i;
    requests.push(labelRowRequest(sheetId, row, 1, [asset.id]));
  });

  // BUY-only cost-basis summary formulas, one row per asset (rows 2..1+N), starting at
  // column B (col 2). Each cell references the open-ended transaction data region via
  // A{dataAnchor}:A ranges INSIDE the formula string only — the request range itself is a
  // single summary row, never the data region (D-04/D-06). The summary row's own asset id
  // sits in column A (already emitted above) and is the SUMIFS criterion ($A{row}).
  //
  // TX column map (per PATTERNS.md / D-04): Date=A, Asset=B, Type=C, Price=D, Qty=E,
  // Total=F, Fee=G, Net Cost=H. Summary metric columns: Total Invested=B, Total Qty=C,
  // Avg Cost=D, Buy Count=E, Last Buy=F, Total Fees=G.
  //
  // `dataAnchor` is derived from the imported DATA_START_ROW constant so the formula
  // strings track the fixed boundary (currently 23) — never a hard-coded literal here.
  const dataAnchor = DATA_START_ROW;
  assetList.forEach((asset, i) => {
    const row = FIRST_SUMMARY_ROW + i;
    const a = `$A${row}`; // this summary row's asset id (SUMIFS criterion)
    const buyFilter = `$C$${dataAnchor}:$C,"BUY"`;
    const assetFilter = `$B$${dataAnchor}:$B,${a}`;
    const totalInvested = `SUMIFS($H$${dataAnchor}:$H,${assetFilter},${buyFilter})`;
    const totalQty = `SUMIFS($E$${dataAnchor}:$E,${assetFilter},${buyFilter})`;
    const formulas = [
      // Total Invested (B)
      `=IFERROR(${totalInvested},"—")`,
      // Total Qty (C)
      `=IFERROR(${totalQty},"—")`,
      // Avg Cost (D) — DCA-weighted: Invested / Qty (single source of truth)
      `=IFERROR(${totalInvested}/${totalQty},"—")`,
      // Buy Count (E)
      `=IFERROR(COUNTIFS(${assetFilter},${buyFilter}),"—")`,
      // Last Buy (F)
      `=IFERROR(MAXIFS($A$${dataAnchor}:$A,${assetFilter},${buyFilter}),"—")`,
      // Total Fees (G)
      `=IFERROR(SUMIFS($G$${dataAnchor}:$G,${assetFilter},${buyFilter}),"—")`,
    ];
    requests.push(formulaRowRequest(sheetId, row, 2, formulas));
  });

  // Summary number formats span the FULL reserved block (rows 2..1+MAX_SUMMARY_ROWS = 2-21),
  // not just the used rows — the reserved rows are still strictly above the data region
  // (endRowIndex = MAX_SUMMARY_ROWS + 1 = 21, exclusive 21 < boundary 22). Formats are
  // allowed in the blank reserved rows because they carry no value (D-08 label/format-only).
  const reservedEnd = LAST_RESERVED_SUMMARY_ROW; // 1-based inclusive end (21)
  requests.push(numberFormatRequest(sheetId, FIRST_SUMMARY_ROW, reservedEnd, 2, 2, CURRENCY_FORMAT));
  requests.push(numberFormatRequest(sheetId, FIRST_SUMMARY_ROW, reservedEnd, 4, 4, CURRENCY_FORMAT));
  requests.push(numberFormatRequest(sheetId, FIRST_SUMMARY_ROW, reservedEnd, 7, 7, CURRENCY_FORMAT));
  // Last Buy (col F = 6) is a date (MAXIFS over the Date column) — format it as a date
  // over the same reserved block. Still strictly above the data region (endRowIndex 21 < 22).
  requests.push(numberFormatRequest(sheetId, FIRST_SUMMARY_ROW, reservedEnd, 6, 6, DATE_FORMAT));

  // Transaction header row (cols A-I), immediately above the data region.
  requests.push(labelRowRequest(sheetId, TX_HEADER_ROW, 1, TX_HEADERS));

  // Number format for the transaction header row's Date column only (header text row).
  // NOTE: we deliberately format only the header row, NOT the data region below it —
  // formatting DATA_START_ROW.. would address the protected data rows (D-06). Phase 5
  // may extend formatting into the data region if it does so without clearing values.
  requests.push(numberFormatRequest(sheetId, TX_HEADER_ROW, TX_HEADER_ROW, 1, 1, DATE_FORMAT));

  return requests;
}

// Build the DCA Log top-of-data skeleton (first-time --build).
// `assetList` defaults to the shared registry (tests pass an explicit list to drive the
// overflow guard / boundary-invariance without mutating the import).
export function dcaLogBuildRequests(sheetId, assetList = assets) {
  return bandRequests(sheetId, assetList);
}

// Re-apply ONLY the structural band (--update). The transaction data region at and
// below DATA_START_ROW is never addressed — no write, no clear — so re-running --update
// leaves DCA Log data byte-for-byte unchanged and "twice == once" (D-06, LAYOUT-02).
export function dcaLogUpdateRequests(sheetId, assetList = assets) {
  return bandRequests(sheetId, assetList);
}

// Re-export the sheet name so callers (index.js) resolve the target tab via one place.
export { DCA_LOG };
