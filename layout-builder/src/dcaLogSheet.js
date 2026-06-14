// layout-builder DCA Log sheet definition (local-only Node / ESM runtime).
//
// HIGHEST STAKES (LAYOUT-02): the DCA Log holds hand-entered transaction history.
// A wrong batchUpdate range here is irreversible data loss. The safety mechanism is
// the simplest provably-correct one (D-06): `--update` NEVER references the data
// region. It only emits requests for the fixed top-of-data band; the data rows are
// never addressed, so they cannot be written or cleared.
//
// Top-of-data band layout (D-05, mirrors config.js DATA_START_ROW derivation):
//   row 1            : summary block header ("Summary" + summary metric labels)
//   rows 2..(1+N)    : one per-asset summary row (label = asset id), N = assets.length
//   row (2+N)        : transaction column header row (Date..Notes, cols A-I)
//   row DATA_START_ROW.. : transaction DATA rows (user-entered, grow unbounded) -- NEVER touched.
//
// SKELETON ONLY (D-08): labels + number formats + frozen rows. NO SUMIF/PnL formulas
// (Phase 5 will SUMIF over open-ended A{DATA_START_ROW}:A ranges, D-07) and NO
// conditional formatting. NO data-validation dropdowns (PNL-06 v2-deferred).

import { assets, DCA_LOG, DATA_START_ROW } from "./config.js";

// --- Layout constants (derived from DATA_START_ROW so band + boundary stay in sync) ---

const SUMMARY_HEADER_ROW = 1; // 1-based
const FIRST_SUMMARY_ROW = 2; // first per-asset summary row
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

// --- Request helpers (no formulas ever emitted) ---

function stringCell(value) {
  return { userEnteredValue: { stringValue: value } };
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
// above DATA_START_ROW. No request addresses any row at or beyond the data region
// (the irreversible-data-loss guard, LAYOUT-02 / D-06). This is also why build and
// update share the same set: there is no separate "clear data" step to get wrong.
function bandRequests(sheetId) {
  const requests = [];

  // Freeze the summary block + transaction header (everything above the data region).
  requests.push(freezeRowsRequest(sheetId, TX_HEADER_ROW));

  // Summary block header row.
  requests.push(labelRowRequest(sheetId, SUMMARY_HEADER_ROW, 1, SUMMARY_HEADERS));

  // One summary row per asset (label only — Phase 5 fills SUMIF metrics, D-07/D-08).
  assets.forEach((asset, i) => {
    const row = FIRST_SUMMARY_ROW + i;
    requests.push(labelRowRequest(sheetId, row, 1, [asset.id]));
  });
  const lastSummaryRow = FIRST_SUMMARY_ROW + assets.length - 1;

  // Summary number formats: Total Invested (col B) + Avg Cost (col D) + Total Fees (col G).
  requests.push(numberFormatRequest(sheetId, FIRST_SUMMARY_ROW, lastSummaryRow, 2, 2, CURRENCY_FORMAT));
  requests.push(numberFormatRequest(sheetId, FIRST_SUMMARY_ROW, lastSummaryRow, 4, 4, CURRENCY_FORMAT));
  requests.push(numberFormatRequest(sheetId, FIRST_SUMMARY_ROW, lastSummaryRow, 7, 7, CURRENCY_FORMAT));

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
export function dcaLogBuildRequests(sheetId) {
  return bandRequests(sheetId);
}

// Re-apply ONLY the structural band (--update). The transaction data region at and
// below DATA_START_ROW is never addressed — no write, no clear — so re-running --update
// leaves DCA Log data byte-for-byte unchanged and "twice == once" (D-06, LAYOUT-02).
export function dcaLogUpdateRequests(sheetId) {
  return bandRequests(sheetId);
}

// Re-export the sheet name so callers (index.js) resolve the target tab via one place.
export { DCA_LOG };
