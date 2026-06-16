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
// SKELETON ONLY (D-08): header/label text, frozen header row, and number formats.
// NO formulas (`userEnteredValue.formulaValue`) and NO conditional formatting
// (`addConditionalFormatRule`) — those land in Phase 5, which extends this file.

import { assets, DASHBOARD } from "./config.js";

// --- Layout constants (Claude's discretion, derived from STRUCTURE.md, D-41) ---

// Zone A — Live Holdings.
const ZONE_A_HEADER_ROW = 1; // 1-based
const ZONE_A_HEADERS = ["Asset", "Qty", "Price", "Value", "Target %", "Risk", "APY %"];

// Zone B — Allocation Health (blank row 11 separates the zones).
const ZONE_B_HEADER_ROW = 12; // 1-based
const ZONE_B_HEADERS = ["Asset", "Target %", "Actual %", "Drift", "Risk", "APY %", "Monthly Yield"];

// Maximum Zone A per-asset rows before Zone A's TOTAL row would collide with Zone B's
// pinned header. Zone A occupies rows 1..(2 + assets.length); the TOTAL row lands at
// (2 + assets.length). For no overlap with ZONE_B_HEADER_ROW (12) and a 1-row blank gap
// (row 11) we need (2 + assets.length) < 12, i.e. assets.length <= 9. Mirrors the DCA Log
// MAX_SUMMARY_ROWS guard: fail loudly rather than silently overwrite Zone B (LAYOUT-02).
const MAX_ZONE_A_ASSET_ROWS = ZONE_B_HEADER_ROW - 3; // = 9

// Number-format pattern for percent / currency columns (skeleton formatting only).
const PERCENT_FORMAT = { type: "PERCENT", pattern: "0.00%" };
const CURRENCY_FORMAT = { type: "CURRENCY", pattern: "$#,##0.00" };

// --- Small request helpers (kept local; no formulas ever emitted) ---

function stringCell(value) {
  return { userEnteredValue: { stringValue: value } };
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
function structuralRequests(sheetId) {
  // FAIL LOUDLY rather than silently overwrite Zone B. If the registry outgrows the
  // rows reserved above Zone B's pinned header, Zone A's TOTAL/label rows would stamp
  // onto Zone B's header and data — the exact "registry growth corrupts layout" defect
  // LAYOUT-02 exists to prevent. Mirrors the DCA Log MAX_SUMMARY_ROWS guard.
  if (assets.length > MAX_ZONE_A_ASSET_ROWS) {
    throw new Error(
      `assets.length (${assets.length}) exceeds MAX_ZONE_A_ASSET_ROWS ` +
        `(${MAX_ZONE_A_ASSET_ROWS}); Zone A would overwrite Zone B (header row ` +
        `${ZONE_B_HEADER_ROW}). Move ZONE_B_HEADER_ROW down or reduce the registry.`
    );
  }

  const requests = [];

  // Frozen header row.
  requests.push(freezeHeaderRequest(sheetId));

  // Zone A header + per-asset rows + TOTAL row.
  requests.push(labelRowRequest(sheetId, ZONE_A_HEADER_ROW, 1, ZONE_A_HEADERS));
  assets.forEach((asset, i) => {
    const row = ZONE_A_HEADER_ROW + 1 + i;
    // First column is the asset id; remaining cells stay empty (filled by Phase 5).
    requests.push(labelRowRequest(sheetId, row, 1, [asset.id]));
  });
  const zoneATotalRow = ZONE_A_HEADER_ROW + 1 + assets.length;
  requests.push(labelRowRequest(sheetId, zoneATotalRow, 1, ["TOTAL"]));

  // Zone A number formats: Price/Value currency (cols C-D), Target/APY percent.
  requests.push(numberFormatRequest(sheetId, ZONE_A_HEADER_ROW + 1, zoneATotalRow, 3, 4, CURRENCY_FORMAT));
  requests.push(numberFormatRequest(sheetId, ZONE_A_HEADER_ROW + 1, zoneATotalRow, 5, 5, PERCENT_FORMAT));
  requests.push(numberFormatRequest(sheetId, ZONE_A_HEADER_ROW + 1, zoneATotalRow, 7, 7, PERCENT_FORMAT));

  // Zone B header + per-asset rows + TOTALS row.
  requests.push(labelRowRequest(sheetId, ZONE_B_HEADER_ROW, 1, ZONE_B_HEADERS));
  assets.forEach((asset, i) => {
    const row = ZONE_B_HEADER_ROW + 1 + i;
    requests.push(labelRowRequest(sheetId, row, 1, [asset.id]));
  });
  const zoneBTotalsRow = ZONE_B_HEADER_ROW + 1 + assets.length;
  requests.push(labelRowRequest(sheetId, zoneBTotalsRow, 1, ["TOTALS"]));

  // Zone B number formats: Target/Actual/Drift/APY percent.
  requests.push(numberFormatRequest(sheetId, ZONE_B_HEADER_ROW + 1, zoneBTotalsRow, 2, 4, PERCENT_FORMAT));
  requests.push(numberFormatRequest(sheetId, ZONE_B_HEADER_ROW + 1, zoneBTotalsRow, 6, 6, PERCENT_FORMAT));

  return requests;
}

// Build the Dashboard structural skeleton (first-time --build).
export function dashboardBuildRequests(sheetId) {
  return structuralRequests(sheetId);
}

// Re-apply the Dashboard structure idempotently (--update). No protected data region
// on the Dashboard, so this mirrors the build structural ranges (labels/formats/frozen).
export function dashboardUpdateRequests(sheetId) {
  return structuralRequests(sheetId);
}

// Re-export the sheet name so callers (index.js) resolve the target tab via one place.
export { DASHBOARD };
