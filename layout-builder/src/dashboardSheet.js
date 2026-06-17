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

// Per-venue refresh status block (REFRESH-04, D-04/D-05/D-06).
// COLUMN-anchored top-right of the Dashboard, well to the right of Zone A/B (cols A–G),
// so the MAX_ZONE_A_ASSET_ROWS guard — which only shifts ROWS as the registry grows —
// can never make it collide with zone data. The layout builder owns ONLY the static
// labels here (venue names + header row); refreshAll() in Apps Script writes the dynamic
// timestamp + Stale? VALUES into the adjacent cells (D-05 build-time/run-time split).
//
// Exact geometry (so Plan 01's refreshAll() targets the matching cells):
//   Col I (1-based 9) = STATUS_START_COL: venue label   ("Status" / "Hyperliquid" / "Solana/Jupiter")
//   Col J (1-based 10)                  : LastUpdated    (header static; value rows filled by refreshAll)
//   Col K (1-based 11)                  : Stale?         (header static; value rows filled by refreshAll)
//   Row 1 (STATUS_START_ROW) = header row: ["Status", "LastUpdated", "Stale?"]
//   Row 2                    = Hyperliquid line:   ["Hyperliquid"]    (J2/K2 filled by refreshAll)
//   Row 3                    = Solana/Jupiter line:["Solana/Jupiter"] (J3/K3 filled by refreshAll)
const STATUS_START_COL = 9; // 1-based col I — right of Zone A's last col G (=7)
const STATUS_START_ROW = 1; // 1-based row 1 — top-right, above Zone B's header row (12)
const STATUS_HEADERS = ["Status", "LastUpdated", "Stale?"];
const STATUS_VENUE_LINES = ["Hyperliquid", "Solana/Jupiter"];

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
//
// `assetList` defaults to the shared registry; an explicit list is accepted only so the
// overflow guard and Zone A/Zone B boundary-invariance can be exercised without mutating
// the import (mirrors dcaLogSheet.js `bandRequests`).
function structuralRequests(sheetId, assetList = assets) {
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
  requests.push(labelRowRequest(sheetId, ZONE_A_HEADER_ROW, 1, ZONE_A_HEADERS));
  assetList.forEach((asset, i) => {
    const row = ZONE_A_HEADER_ROW + 1 + i;
    // First column is the asset id; remaining cells stay empty (filled by Phase 5).
    requests.push(labelRowRequest(sheetId, row, 1, [asset.id]));
  });
  const zoneATotalRow = ZONE_A_HEADER_ROW + 1 + assetList.length;
  requests.push(labelRowRequest(sheetId, zoneATotalRow, 1, ["TOTAL"]));

  // Zone A number formats: Price/Value currency (cols C-D), Target/APY percent.
  requests.push(numberFormatRequest(sheetId, ZONE_A_HEADER_ROW + 1, zoneATotalRow, 3, 4, CURRENCY_FORMAT));
  requests.push(numberFormatRequest(sheetId, ZONE_A_HEADER_ROW + 1, zoneATotalRow, 5, 5, PERCENT_FORMAT));
  requests.push(numberFormatRequest(sheetId, ZONE_A_HEADER_ROW + 1, zoneATotalRow, 7, 7, PERCENT_FORMAT));

  // Zone B header + per-asset rows + TOTALS row.
  requests.push(labelRowRequest(sheetId, ZONE_B_HEADER_ROW, 1, ZONE_B_HEADERS));
  assetList.forEach((asset, i) => {
    const row = ZONE_B_HEADER_ROW + 1 + i;
    requests.push(labelRowRequest(sheetId, row, 1, [asset.id]));
  });
  const zoneBTotalsRow = ZONE_B_HEADER_ROW + 1 + assetList.length;
  requests.push(labelRowRequest(sheetId, zoneBTotalsRow, 1, ["TOTALS"]));

  // Zone B number formats: Target/Actual/Drift/APY percent.
  requests.push(numberFormatRequest(sheetId, ZONE_B_HEADER_ROW + 1, zoneBTotalsRow, 2, 4, PERCENT_FORMAT));
  requests.push(numberFormatRequest(sheetId, ZONE_B_HEADER_ROW + 1, zoneBTotalsRow, 6, 6, PERCENT_FORMAT));

  // Per-venue refresh status block — STATIC labels only (D-05). Column-anchored at
  // STATUS_START_COL so it is immune to the row-shifting MAX_ZONE_A_ASSET_ROWS guard.
  // Header row, then exactly 2 venue lines (D-04). Composed via labelRowRequest (the
  // single-source helper) — never a hand-built updateCells literal. The adjacent
  // LastUpdated/Stale? value cells stay empty for refreshAll() to populate.
  requests.push(labelRowRequest(sheetId, STATUS_START_ROW, STATUS_START_COL, STATUS_HEADERS));
  STATUS_VENUE_LINES.forEach((venue, i) => {
    requests.push(labelRowRequest(sheetId, STATUS_START_ROW + 1 + i, STATUS_START_COL, [venue]));
  });

  return requests;
}

// Build the Dashboard structural skeleton (first-time --build).
// `assetList` defaults to the shared registry (tests pass an explicit list to drive the
// overflow guard / Zone A-Zone B boundary-invariance without mutating the import).
export function dashboardBuildRequests(sheetId, assetList = assets) {
  return structuralRequests(sheetId, assetList);
}

// Re-apply the Dashboard structure idempotently (--update). No protected data region
// on the Dashboard, so this mirrors the build structural ranges (labels/formats/frozen).
export function dashboardUpdateRequests(sheetId, assetList = assets) {
  return structuralRequests(sheetId, assetList);
}

// Re-export the Zone B header row and Zone A cap so tests can assert the no-collision
// invariant (zoneATotalRow < ZONE_B_HEADER_ROW) without recomputing the magic literal.
export { ZONE_B_HEADER_ROW, MAX_ZONE_A_ASSET_ROWS };

// Re-export the status-block placement constants so tests can assert column-anchoring
// (right of Zone A) and non-collision with the zones without re-deriving the literals.
export { STATUS_START_COL, STATUS_START_ROW, STATUS_HEADERS, STATUS_VENUE_LINES };

// Re-export the sheet name so callers (index.js) resolve the target tab via one place.
export { DASHBOARD };
