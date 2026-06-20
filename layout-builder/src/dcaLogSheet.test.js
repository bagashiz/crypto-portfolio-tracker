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
import { DATA_START_ROW, MAX_SUMMARY_ROWS } from "./config.js";
import {
  dcaLogBuildRequests,
  dcaLogUpdateRequests,
  dcaLogConditionalPreClearRequests,
} from "./dcaLogSheet.js";

const GRID_ID = 0;

// The FIXED data-region boundary, hard-coded as a literal. The data-safety assertion
// below is bounded against THIS literal — never against a value recomputed from
// assets.length. The whole point of LAYOUT-02 is that the boundary cannot float with
// the registry; anchoring the test on the literal makes any boundary-moving change fail.
const DATA_START_ROW_LITERAL = 23;

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
  "Realized", // Phase 6 (D-02): the 10th column = per-row realized-PnL helper (col J)
];

// 0-based index of the first DATA row, DERIVED FROM THE HARD LITERAL (23 - 1 = 22) so the
// data-region assertion can never float with the registry. We import DATA_START_ROW only
// to prove it equals the literal (next test), then assert all ranges against the literal.
const DATA_START_ROW_0BASED = DATA_START_ROW_LITERAL - 1;

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

// LAYOUT-02 anchor: the imported boundary MUST equal the hard literal. If config.js ever
// reverts to a floating boundary, this fails immediately rather than silently passing.
test("DATA_START_ROW equals the fixed literal 23 (boundary is pinned, not floating)", () => {
  expect(DATA_START_ROW).toBe(DATA_START_ROW_LITERAL);
  expect(DATA_START_ROW).toBe(23);
});

// Boundary invariance under registry change. The transaction header sits at the fixed
// 0-based row index 21 (row 22, = DATA_START_ROW - 1) regardless of assets.length, and NO
// request range ever reaches past the data-region boundary. Both facts are checked against
// the hard literal, so adding/removing an asset cannot move where the header lands.
test("transaction header row is fixed (0-based 21) and does not move with the asset count", () => {
  const headerRowIndex = findHeaderRowIndex(dcaLogBuildRequests(GRID_ID));
  // row 22 1-based -> 0-based 21 -> DATA_START_ROW_LITERAL - 2.
  expect(headerRowIndex).toBe(DATA_START_ROW_LITERAL - 2);
  expect(headerRowIndex).toBe(21);
});

test("no request range endRowIndex exceeds the fixed boundary, independent of assets.length", () => {
  // The max endRowIndex across all requests is fixed by MAX_SUMMARY_ROWS, not assets.length.
  // It must never exceed the data-region start (0-based 22).
  const maxEnd = maxEndRowIndex(dcaLogBuildRequests(GRID_ID));
  expect(maxEnd).toBeLessThanOrEqual(DATA_START_ROW_0BASED);
  expect(maxEnd).toBeLessThanOrEqual(22);
});

// Reserved-but-unused summary rows stay blank (D-08): exactly assets.length label rows are
// emitted in the summary block, none for the reserved rows below them.
test("summary block emits exactly assets.length label rows; reserved rows stay blank", () => {
  const reqs = dcaLogBuildRequests(GRID_ID);
  const summaryLabelRows = countSummaryLabelRows(reqs);
  expect(summaryLabelRows).toBe(assets.length);
  // Reserved capacity exists above the asset count, and those rows carry no label request.
  expect(assets.length).toBeLessThan(MAX_SUMMARY_ROWS);
});

// Overflow guard: a registry larger than MAX_SUMMARY_ROWS must fail loudly rather than
// silently shifting the boundary into the data region. The builders accept an optional
// asset list so we can drive an oversized registry without mutating the shared import.
test("builders throw loudly when assets.length > MAX_SUMMARY_ROWS", () => {
  const oversized = Array.from({ length: MAX_SUMMARY_ROWS + 1 }, (_, i) => ({
    id: `FAKE${i}`,
  }));
  expect(() => dcaLogBuildRequests(GRID_ID, oversized)).toThrow(/MAX_SUMMARY_ROWS/);
  expect(() => dcaLogUpdateRequests(GRID_ID, oversized)).toThrow(/MAX_SUMMARY_ROWS/);
});

// A registry exactly at capacity (MAX_SUMMARY_ROWS) is allowed and STILL never crosses the
// fixed boundary — proving the band is positioned from the reservation, not the count.
test("a full-capacity registry (MAX_SUMMARY_ROWS assets) still respects the fixed boundary", () => {
  const full = Array.from({ length: MAX_SUMMARY_ROWS }, (_, i) => ({ id: `FULL${i}` }));
  const reqs = dcaLogBuildRequests(GRID_ID, full);
  const headerRowIndex = findHeaderRowIndex(reqs);
  expect(headerRowIndex).toBe(DATA_START_ROW_LITERAL - 2);
  expect(maxEndRowIndex(reqs)).toBeLessThanOrEqual(DATA_START_ROW_0BASED);
});

test("summary band emits formulas AND the Transaction Log tab now has conditional formatting (D-04/D-07)", () => {
  const build = JSON.stringify(dcaLogBuildRequests(GRID_ID));
  const update = JSON.stringify(dcaLogUpdateRequests(GRID_ID));
  // Phase 5 INVERSION (D-04): the summary band carries BUY-only cost-basis formulas.
  expect(build).toContain("formulaValue");
  expect(build).toContain("SUMIFS");
  expect(update).toContain("formulaValue");
  expect(update).toContain("SUMIFS");
  // Phase 6 INVERSION (D-07): the log tab now reuses the Dashboard green/red conditional
  // formatting on the Realized $/Realized % summary cells — both build and update add rules.
  expect(build).toContain("addConditionalFormatRule");
  expect(update).toContain("addConditionalFormatRule");
  // Build is add-only (fresh tab, 0 rules → no pre-clear); update pre-clears (descending)
  // before re-adding so re-running --update never stacks duplicate rules.
  expect(build).not.toContain("deleteConditionalFormatRule");
  expect(update).toContain("deleteConditionalFormatRule");
});

test("Realized realized PnL: SELL summary + BYROW row-22 spill + em-dash leaves (D-02/D-06)", () => {
  const build = JSON.stringify(dcaLogBuildRequests(GRID_ID));
  // Per-asset realized summary uses a SELL-only filter (escaped quotes in the JSON).
  expect(build).toContain(',\\"SELL\\"');
  // The BYROW per-row spill is anchored at the header cell: row 22 (0-based 21), col J (9).
  const reqs = dcaLogBuildRequests(GRID_ID);
  const spill = reqs.find(
    (r) => r?.updateCells?.rows?.[0]?.values?.[0]?.userEnteredValue?.formulaValue?.includes("BYROW")
  );
  expect(spill).toBeDefined();
  expect(spill.updateCells.start.rowIndex).toBe(21);
  expect(spill.updateCells.start.columnIndex).toBe(9);
  // Exactly one BYROW spill (single header-cell, never per-row data-region writes).
  expect((build.match(/BYROW/g) || []).length).toBe(1);
  // Every realized leaf is IFERROR(…, "—") so empty/pre-BUY sells read "—" not #VALUE/#DIV.
  expect(build).toContain("IFERROR");
  expect(build).toContain("—");
});

test("dcaLogConditionalPreClearRequests returns the 2 descending-index deletes [1, 0]", () => {
  const pre = dcaLogConditionalPreClearRequests(GRID_ID);
  expect(pre.length).toBe(2);
  expect(pre[0].deleteConditionalFormatRule.index).toBe(1);
  expect(pre[1].deleteConditionalFormatRule.index).toBe(0);
});

test("summary formulas are BUY-only and use the em-dash empty state (D-04/D-06)", () => {
  const build = JSON.stringify(dcaLogBuildRequests(GRID_ID));
  // BUY-only filter present in the SUMIFS/COUNTIFS/MAXIFS criteria.
  expect(build).toContain('SUMIFS');
  expect(build).toContain('COUNTIFS');
  expect(build).toContain('MAXIFS');
  // The BUY-only Type filter. In the JSON-serialized form the inner quotes are escaped,
  // so the literal substring is `,"BUY"` (with backslash-escaped quotes).
  expect(build).toContain(',\\"BUY\\"');
  // Every leaf wrapped in IFERROR(…, "—") so empty assets read "—" not #DIV/0!.
  expect(build).toContain("IFERROR");
  expect(build).toContain("—");
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
  // Phase 6: addConditionalFormatRule carries its target range(s) under rule.ranges. The
  // critical data-region guard must see them too — every conditional range stays in the
  // summary band (endRowIndex = 1+assets.length << 22), never the data region.
  if (req.addConditionalFormatRule?.rule?.ranges) {
    for (const range of req.addConditionalFormatRule.rule.ranges) ranges.push(range);
  }
  // deleteConditionalFormatRule / updateSheetProperties (frozen rows) address no data
  // range — skip safely.

  return ranges;
}

// 0-based row index of the transaction header (the updateCells start.rowIndex of the row
// whose values equal the 9 transaction headers). Returns null if not found.
function findHeaderRowIndex(reqs) {
  for (const req of reqs) {
    const rows = req?.updateCells?.rows;
    const start = req?.updateCells?.start;
    if (!Array.isArray(rows) || !start) continue;
    for (const row of rows) {
      const values = (row?.values ?? []).map((c) => c?.userEnteredValue?.stringValue);
      if (
        values.length >= EXPECTED_HEADERS.length &&
        EXPECTED_HEADERS.every((h, i) => values[i] === h)
      ) {
        return start.rowIndex;
      }
    }
  }
  return null;
}

// Largest endRowIndex referenced by any request range (0-based, exclusive).
function maxEndRowIndex(reqs) {
  let max = 0;
  for (const req of reqs) {
    for (const range of extractRanges(req)) {
      if (typeof range.endRowIndex === "number") {
        max = Math.max(max, range.endRowIndex);
      }
    }
  }
  return max;
}

// Count single-asset summary label rows: updateCells rows in the summary block (start
// rowIndex >= 1 i.e. row 2+, above the transaction header) carrying exactly one cell.
function countSummaryLabelRows(reqs) {
  let count = 0;
  const headerRowIndex = findHeaderRowIndex(reqs);
  for (const req of reqs) {
    const start = req?.updateCells?.start;
    const rows = req?.updateCells?.rows;
    if (!start || !Array.isArray(rows)) continue;
    if (start.rowIndex < 1) continue; // skip the summary header row (0-based 0)
    if (headerRowIndex !== null && start.rowIndex >= headerRowIndex) continue; // skip tx header
    for (const row of rows) {
      const cells = row?.values ?? [];
      if (cells.length === 1 && cells[0]?.userEnteredValue?.stringValue !== undefined) {
        count += 1;
      }
    }
  }
  return count;
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
