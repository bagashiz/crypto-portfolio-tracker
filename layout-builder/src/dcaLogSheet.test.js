// Unit tests for dcaLogSheet.js (bun:test, co-located per TESTING.md).
//
// HIGH-PRIORITY data-safety suite (TESTING.md): proves the DCA Log `--update`
// request set NEVER addresses the transaction data region (LAYOUT-02 / D-06) —
// the irreversible-data-loss guard, checked structurally against DATA_START_ROW,
// not by a comment. Also asserts skeleton-only (D-08) and idempotency.
//
// Imported FIRST so SPREADSHEET_ID exists before config.js is evaluated.
import "./testEnv.js";
import { test, expect } from "bun:test";
import assets from "../../assets.json" with { type: "json" };
import { DATA_START_ROW } from "./config.js";
import { dcaLogBuildRequests, dcaLogUpdateRequests } from "./dcaLogSheet.js";

const GRID_ID = 0;

const EXPECTED_HEADERS = [
  "Date",
  "Asset",
  "Type",
  "Price",
  "Qty",
  "Total",
  "Fee",
  "Net Cost",
  "Notes",
];

// 0-based index of the first DATA row. No structural request may touch this row or below.
const DATA_START_ROW_0BASED = DATA_START_ROW - 1;

test("dcaLogBuildRequests returns a non-empty array", () => {
  const reqs = dcaLogBuildRequests(GRID_ID);
  expect(Array.isArray(reqs)).toBe(true);
  expect(reqs.length).toBeGreaterThan(0);
});

test("dcaLogUpdateRequests returns a non-empty array", () => {
  const reqs = dcaLogUpdateRequests(GRID_ID);
  expect(Array.isArray(reqs)).toBe(true);
  expect(reqs.length).toBeGreaterThan(0);
});

test("build requests contain the exact 9-column transaction header row in order", () => {
  const headerRow = findHeaderRow(dcaLogBuildRequests(GRID_ID));
  expect(headerRow).toEqual(EXPECTED_HEADERS);
});

test("summary block has one labeled row per asset (derived from assets.length)", () => {
  const serialized = JSON.stringify(dcaLogBuildRequests(GRID_ID));
  for (const asset of assets) {
    expect(serialized).toContain(asset.id);
  }
});

// THE CRITICAL ASSERTION (LAYOUT-02 / D-06).
test("NO dcaLogUpdateRequests range touches a row at or below the data region", () => {
  const reqs = dcaLogUpdateRequests(GRID_ID);
  for (const req of reqs) {
    for (const range of extractRanges(req)) {
      // An open-ended range (no endRowIndex) over the grid would span the data region.
      expect(range.endRowIndex).toBeDefined();
      // endRowIndex is exclusive: it must stop at or before the data-region start.
      expect(range.endRowIndex).toBeLessThanOrEqual(DATA_START_ROW_0BASED);
      // Also guard the start side: never begin inside the data region.
      if (range.startRowIndex !== undefined) {
        expect(range.startRowIndex).toBeLessThan(DATA_START_ROW_0BASED);
      }
    }
  }
});

test("both builders are skeleton-only: no formulaValue, no addConditionalFormatRule (D-08)", () => {
  const build = JSON.stringify(dcaLogBuildRequests(GRID_ID));
  const update = JSON.stringify(dcaLogUpdateRequests(GRID_ID));
  expect(build).not.toContain("formulaValue");
  expect(build).not.toContain("addConditionalFormatRule");
  expect(update).not.toContain("formulaValue");
  expect(update).not.toContain("addConditionalFormatRule");
});

test("dcaLogUpdateRequests is deterministic (update twice == once)", () => {
  expect(dcaLogUpdateRequests(GRID_ID)).toEqual(dcaLogUpdateRequests(GRID_ID));
});

// --- helpers ---

// Extract every grid range referenced by a single request object, normalized so each
// has rowIndex bounds we can assert against. Covers updateCells (start-based, single
// row per `rows` entry), repeatCell/updateBorders (range-based).
function extractRanges(req) {
  const ranges = [];

  if (req.updateCells) {
    const { start, range, rows } = req.updateCells;
    if (range) {
      ranges.push(range);
    } else if (start) {
      // start-based updateCells: spans `rows.length` rows from start.rowIndex.
      const rowCount = Array.isArray(rows) ? rows.length : 1;
      ranges.push({
        startRowIndex: start.rowIndex,
        endRowIndex: start.rowIndex + rowCount,
      });
    }
  }
  if (req.repeatCell?.range) ranges.push(req.repeatCell.range);
  if (req.updateBorders) ranges.push(req.updateBorders);
  // updateSheetProperties (frozen rows) addresses no data range — skip safely.

  return ranges;
}

// Find the row whose cells equal the 9 transaction headers, in order.
function findHeaderRow(reqs) {
  for (const req of reqs) {
    const rows = req?.updateCells?.rows;
    if (!Array.isArray(rows)) continue;
    for (const row of rows) {
      const values = (row?.values ?? []).map(
        (c) => c?.userEnteredValue?.stringValue
      );
      if (
        values.length >= EXPECTED_HEADERS.length &&
        EXPECTED_HEADERS.every((h, i) => values[i] === h)
      ) {
        return values.slice(0, EXPECTED_HEADERS.length);
      }
    }
  }
  return null;
}
