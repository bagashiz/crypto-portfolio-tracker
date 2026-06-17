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
  STATUS_START_COL,
  STATUS_START_ROW,
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

// --- Per-venue refresh status block (REFRESH-04, D-04/D-05/D-06) ---

// 0-based Zone A last column. Zone A uses cols A–G (1-based 1..7 -> 0-based 0..6); the
// status block must start at or beyond 0-based 7 (col H) to sit strictly right of Zone A.
const ZONE_A_LAST_COL_0BASED = 6; // col G

// Collect every status-block label request: those whose start.columnIndex is in the
// status columns (>= STATUS_START_COL-1) — i.e. right of Zone A's label/format ranges.
function statusBlockRequests(reqs) {
  const startCol0 = STATUS_START_COL - 1;
  return reqs.filter((req) => {
    const start = req?.updateCells?.start;
    return start && typeof start.columnIndex === "number" && start.columnIndex >= startCol0;
  });
}

test("build requests include the static status-block labels (LastUpdated, Stale?, both venues)", () => {
  const serialized = JSON.stringify(dashboardBuildRequests(GRID_ID));
  expect(serialized).toContain("LastUpdated");
  expect(serialized).toContain("Stale?");
  expect(serialized).toContain("Hyperliquid");
  expect(serialized).toContain("Solana"); // matches "Solana/Jupiter"
});

test("status block is column-anchored right of Zone A (0-based columnIndex >= 7)", () => {
  const reqs = dashboardBuildRequests(GRID_ID);
  const statusReqs = statusBlockRequests(reqs);
  expect(statusReqs.length).toBeGreaterThan(0);
  // Every status request must start strictly right of Zone A's last column (0-based 6).
  for (const req of statusReqs) {
    expect(req.updateCells.start.columnIndex).toBeGreaterThan(ZONE_A_LAST_COL_0BASED);
  }
  // And the configured start column itself is right of Zone A.
  expect(STATUS_START_COL - 1).toBeGreaterThan(ZONE_A_LAST_COL_0BASED);
});

test("update requests emit the same status labels as build (static structure: build == update)", () => {
  const serialized = JSON.stringify(dashboardUpdateRequests(GRID_ID));
  expect(serialized).toContain("LastUpdated");
  expect(serialized).toContain("Stale?");
  expect(serialized).toContain("Hyperliquid");
  expect(serialized).toContain("Solana");
});

test("status block rows stay above Zone B's header row (no Zone B overlap)", () => {
  const reqs = dashboardBuildRequests(GRID_ID);
  const statusReqs = statusBlockRequests(reqs);
  // The block occupies STATUS_START_ROW..STATUS_START_ROW+2 (header + 2 venue lines).
  for (const req of statusReqs) {
    expect(req.updateCells.start.rowIndex).toBeLessThan(ZONE_B_HEADER_ROW_0BASED);
  }
  // Tightest expected footprint: 3 rows starting at STATUS_START_ROW (1-based).
  const maxStatusRow0 = STATUS_START_ROW - 1 + 2;
  expect(maxStatusRow0).toBeLessThan(ZONE_B_HEADER_ROW_0BASED);
});

test("status block never intersects any zone request even at MAX_ZONE_A_ASSET_ROWS capacity", () => {
  const full = Array.from({ length: MAX_ZONE_A_ASSET_ROWS }, (_, i) => ({ id: `FULL${i}` }));
  const reqs = dashboardBuildRequests(GRID_ID, full);
  const statusReqs = statusBlockRequests(reqs);
  expect(statusReqs.length).toBeGreaterThan(0);
  const statusCol0 = STATUS_START_COL - 1;
  // Zone A/B requests are everything NOT in the status columns. None of them may touch
  // the status columns — the block is column-anchored, so registry growth (which only
  // shifts ROWS) can never collide with it.
  for (const req of reqs) {
    const uc = req?.updateCells?.start;
    const rc = req?.repeatCell?.range;
    if (uc && typeof uc.columnIndex === "number" && uc.columnIndex < statusCol0) {
      // Zone label row: only spans its labels; cannot reach the status column.
      const cellCount = req.updateCells.rows?.[0]?.values?.length ?? 0;
      expect(uc.columnIndex + cellCount).toBeLessThanOrEqual(statusCol0);
    }
    if (rc && typeof rc.endColumnIndex === "number") {
      // Zone number-format ranges end before the status column.
      expect(rc.endColumnIndex).toBeLessThanOrEqual(statusCol0);
    }
  }
});

test("status requests are skeleton-only: no formulaValue, no addConditionalFormatRule", () => {
  const statusReqs = statusBlockRequests(dashboardBuildRequests(GRID_ID));
  const serialized = JSON.stringify(statusReqs);
  expect(serialized).not.toContain("formulaValue");
  expect(serialized).not.toContain("addConditionalFormatRule");
});

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
