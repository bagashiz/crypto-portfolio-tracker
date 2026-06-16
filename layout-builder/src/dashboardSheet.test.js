// Unit tests for dashboardSheet.js (bun:test, co-located per TESTING.md).
//
// These assert the Dashboard request-builders emit a SKELETON-ONLY structural
// request set (D-08): no formulas, no conditional formatting. Pure functions, no
// network — runnable under `bun test` with no credentials.
//
// SPREADSHEET_ID must be set for config.js (imported transitively) to load.
// Imported FIRST so the env var exists before config.js is evaluated (import order).
import "./testEnv.js";
import { test, expect } from "bun:test";
import assets from "../../assets.json" with { type: "json" };
import {
  dashboardBuildRequests,
  dashboardUpdateRequests,
  ZONE_B_HEADER_ROW,
  MAX_ZONE_A_ASSET_ROWS,
} from "./dashboardSheet.js";

const GRID_ID = 0;

// 0-based row index of Zone B's pinned header (row 12 1-based -> 0-based 11). Zone A must
// never emit a row at or beyond this index, or its TOTAL/labels would overwrite Zone B.
const ZONE_B_HEADER_ROW_0BASED = ZONE_B_HEADER_ROW - 1;

test("dashboardBuildRequests returns a non-empty array", () => {
  const reqs = dashboardBuildRequests(GRID_ID);
  expect(Array.isArray(reqs)).toBe(true);
  expect(reqs.length).toBeGreaterThan(0);
});

test("dashboardUpdateRequests returns a non-empty array", () => {
  const reqs = dashboardUpdateRequests(GRID_ID);
  expect(Array.isArray(reqs)).toBe(true);
  expect(reqs.length).toBeGreaterThan(0);
});

test("build requests reference one holdings row per asset (derived from assets.length)", () => {
  const serialized = JSON.stringify(dashboardBuildRequests(GRID_ID));
  // Each asset id must appear somewhere in the emitted Zone A holdings labels.
  for (const asset of assets) {
    expect(serialized).toContain(asset.id);
  }
  // Count distinct asset-id occurrences in stringValue cells equals assets.length.
  const reqs = dashboardBuildRequests(GRID_ID);
  const assetRowCount = countAssetLabelRows(reqs, assets);
  expect(assetRowCount).toBe(assets.length);
});

test("build requests are skeleton-only: no formulaValue, no addConditionalFormatRule (D-08)", () => {
  const serialized = JSON.stringify(dashboardBuildRequests(GRID_ID));
  expect(serialized).not.toContain("formulaValue");
  expect(serialized).not.toContain("addConditionalFormatRule");
});

test("update requests are skeleton-only: no formulaValue, no addConditionalFormatRule (D-08)", () => {
  const serialized = JSON.stringify(dashboardUpdateRequests(GRID_ID));
  expect(serialized).not.toContain("formulaValue");
  expect(serialized).not.toContain("addConditionalFormatRule");
});

// CR-01 guard: a registry larger than MAX_ZONE_A_ASSET_ROWS must fail loudly rather than
// silently stamp Zone A's TOTAL/label rows onto Zone B's pinned header. The builders accept
// an optional asset list so we can drive an oversized registry without mutating the import.
test("builders throw loudly when assets.length > MAX_ZONE_A_ASSET_ROWS", () => {
  const oversized = Array.from({ length: MAX_ZONE_A_ASSET_ROWS + 1 }, (_, i) => ({
    id: `FAKE${i}`,
  }));
  expect(() => dashboardBuildRequests(GRID_ID, oversized)).toThrow(/MAX_ZONE_A_ASSET_ROWS/);
  expect(() => dashboardUpdateRequests(GRID_ID, oversized)).toThrow(/MAX_ZONE_A_ASSET_ROWS/);
});

// At full capacity (MAX_ZONE_A_ASSET_ROWS assets) Zone A is allowed and STILL never
// collides with Zone B: the largest 0-based row index Zone A emits (its TOTAL row) stays
// strictly above Zone B's header row. Proves the cap leaves a non-overlapping gap.
test("a full-capacity registry keeps zoneATotalRow strictly above ZONE_B_HEADER_ROW", () => {
  const full = Array.from({ length: MAX_ZONE_A_ASSET_ROWS }, (_, i) => ({ id: `FULL${i}` }));
  const reqs = dashboardBuildRequests(GRID_ID, full);
  // Zone A's TOTAL row is the last label row before Zone B's header (0-based 11). Every
  // Zone A row index must be < ZONE_B_HEADER_ROW_0BASED.
  const zoneATotalRow0Based = 1 + full.length; // header row 0 + N asset rows -> TOTAL at 1+N
  expect(zoneATotalRow0Based).toBeLessThan(ZONE_B_HEADER_ROW_0BASED);
  // And no emitted Zone A label/format range starts at or beyond Zone B's header.
  const maxZoneARow = maxZoneALabelRowIndex(reqs);
  expect(maxZoneARow).toBeLessThan(ZONE_B_HEADER_ROW_0BASED);
});

// Largest 0-based start.rowIndex among Zone A label rows (those strictly above Zone B's
// header). Zone B labels sit at/after ZONE_B_HEADER_ROW_0BASED, so filtering on that index
// isolates Zone A's footprint.
function maxZoneALabelRowIndex(reqs) {
  let max = 0;
  for (const req of reqs) {
    const start = req?.updateCells?.start;
    if (!start || typeof start.rowIndex !== "number") continue;
    if (start.rowIndex >= ZONE_B_HEADER_ROW_0BASED) continue; // Zone B territory
    max = Math.max(max, start.rowIndex);
  }
  return max;
}

// Counts update-cells rows whose first stringValue cell equals an asset id.
function countAssetLabelRows(reqs, assetList) {
  const ids = new Set(assetList.map((a) => a.id));
  const seen = new Set();
  for (const req of reqs) {
    const rows = req?.updateCells?.rows;
    if (!Array.isArray(rows)) continue;
    for (const row of rows) {
      const cells = row?.values ?? [];
      for (const cell of cells) {
        const v = cell?.userEnteredValue?.stringValue;
        if (v && ids.has(v)) seen.add(v);
      }
    }
  }
  return seen.size;
}
