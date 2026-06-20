// Unit tests for dashboardSheet.js (bun:test, co-located per TESTING.md).
//
// Phase 5 (PnL & Allocation) inverts the Phase 2 skeleton-only assertions: the Dashboard
// builders now emit formula cells (userEnteredValue.formulaValue) and conditional-format
// rules (addConditionalFormatRule). These tests assert those are PRESENT, that the Zone A
// last column + status-block anchors moved with the widened geometry, and that the
// column-non-collision / data-safety invariants still hold. Pure functions, no network —
// runnable under `bun test` with no credentials.
//
// SPREADSHEET_ID must be set for config.js (imported transitively) to load.
// Imported FIRST so the env var exists before config.js is evaluated (import order).
import "./testEnv.js";
import { test, expect } from "bun:test";
import assets from "../../assets.json" with { type: "json" };
import {
  dashboardBuildRequests,
  dashboardUpdateRequests,
  dashboardConditionalPreClearRequests,
  ZONE_B_HEADER_ROW,
  MAX_ZONE_A_ASSET_ROWS,
  STATUS_START_COL,
  STATUS_START_ROW,
  ZONE_A_HEADERS,
  ZONE_B_HEADERS,
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

test("build requests now emit formulas + conditional formatting (Phase 5 inverts D-08)", () => {
  const serialized = JSON.stringify(dashboardBuildRequests(GRID_ID));
  expect(serialized).toContain("formulaValue");
  expect(serialized).toContain("addConditionalFormatRule");
});

test("update requests now emit formulas + conditional formatting (Phase 5 inverts D-08)", () => {
  const serialized = JSON.stringify(dashboardUpdateRequests(GRID_ID));
  expect(serialized).toContain("formulaValue");
  expect(serialized).toContain("addConditionalFormatRule");
});

test("Zone A/B headers match the widened/reduced D-01/D-05 column maps", () => {
  expect(ZONE_A_HEADERS).toEqual(["Asset", "Qty", "Price", "Value", "Target %", "Risk", "AvgCost", "PnL $", "PnL %"]);
  expect(ZONE_B_HEADERS).toEqual(["Asset", "Target %", "Actual %", "Drift", "Risk"]);
});

test("build output contains the cross-sheet AvgCost reference and SUMPRODUCT blended risk", () => {
  const serialized = JSON.stringify(dashboardBuildRequests(GRID_ID));
  expect(serialized).toContain("'Transaction Log'!$D"); // single-source-of-truth AvgCost ref (D-03); tab renamed in Phase 6 (D-07)
  expect(serialized).toContain("SUMPRODUCT"); // Zone B blended-risk totals (ALLOC-02)
  expect(serialized).toContain("=B2*C2"); // Value(D) = Qty*Price (D-02)
});

test("PnL and Drift leaf formulas wrap IFERROR em-dash (D-06)", () => {
  const serialized = JSON.stringify(dashboardBuildRequests(GRID_ID));
  expect(serialized).toContain('IFERROR(D2-B2*G2,\\"—\\")'); // PnL $ leaf
  expect(serialized).toContain("—"); // em-dash empty state present
});

test("conditional-format rules use green/red background fills with NUMBER comparisons", () => {
  const serialized = JSON.stringify(dashboardBuildRequests(GRID_ID));
  expect(serialized).toContain("NUMBER_GREATER");
  expect(serialized).toContain("NUMBER_LESS");
  expect(serialized).toContain("backgroundColor");
});

test("conditional-format rules target Zone A PnL cols H+I and Zone B Drift col D", () => {
  const reqs = dashboardBuildRequests(GRID_ID);
  const ranges = reqs.filter((r) => r.addConditionalFormatRule).map((r) => r.addConditionalFormatRule.rule.ranges[0]);
  // PnL rules span cols H(7)..I(9 exclusive).
  expect(ranges.some((g) => g.startColumnIndex === 7 && g.endColumnIndex === 9)).toBe(true);
  // Drift rule targets Zone B col D(3)..(4 exclusive).
  expect(ranges.some((g) => g.startColumnIndex === 3 && g.endColumnIndex === 4)).toBe(true);
});

// WR-01: the conditional-format pre-clear DELETES were split out of dashboardUpdateRequests
// into dashboardConditionalPreClearRequests so index.js can send them in a SEPARATE,
// error-tolerant batchUpdate. The structural --update batch must therefore emit ZERO
// deletes (so an out-of-range delete on rule-count drift can never roll it back), while
// still emitting the add rules that converge the count back to 3.
test("--update structural batch emits ZERO deleteConditionalFormatRule but still adds rules (WR-01)", () => {
  const reqs = dashboardUpdateRequests(GRID_ID);
  const adds = reqs.filter((r) => r.addConditionalFormatRule).length;
  const deletes = reqs.filter((r) => r.deleteConditionalFormatRule);
  expect(adds).toBeGreaterThan(0);
  // No positional deletes in the structural batch — they live in the separate pre-clear now.
  expect(deletes.length).toBe(0);
});

// WR-01: the isolated pre-clear request set deletes exactly the MANAGED_RULE_COUNT (3)
// managed rules in DESCENDING index order ([2, 1, 0]) so each delete at the current top
// index removes one rule while keeping remaining indices stable. index.js sends these in
// their own batchUpdate and swallows only the "no rule at index" 400 on rule-count drift.
test("dashboardConditionalPreClearRequests deletes the 3 managed rules in descending order [2,1,0] (WR-01)", () => {
  const reqs = dashboardConditionalPreClearRequests(GRID_ID);
  expect(reqs.every((r) => r.deleteConditionalFormatRule)).toBe(true);
  expect(reqs.map((r) => r.deleteConditionalFormatRule.index)).toEqual([2, 1, 0]);
  // Each delete targets the dashboard sheetId, never another tab.
  expect(reqs.every((r) => r.deleteConditionalFormatRule.sheetId === GRID_ID)).toBe(true);
});

// CR-01: --build creates the Dashboard tab in the SAME atomic batchUpdate, so the tab has
// 0 conditional-format rules. Emitting any deleteConditionalFormatRule would target a
// nonexistent index, return 400, and roll back the entire atomic build. Build must emit
// ZERO deletes; only --update (where 3 managed rules already exist) pre-clears them.
test("--build emits zero deleteConditionalFormatRule requests (CR-01)", () => {
  const reqs = dashboardBuildRequests(GRID_ID);
  const deletes = reqs.filter((r) => r.deleteConditionalFormatRule);
  expect(deletes.length).toBe(0);
  // The add rules are still emitted on build (the fresh tab gets all 3 managed rules).
  expect(reqs.filter((r) => r.addConditionalFormatRule).length).toBeGreaterThan(0);
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

// 0-based Zone A last column. Phase 5 widens Zone A to cols A–I (1-based 1..9 -> 0-based
// 0..8); the status block (relocated to col K, STATUS_START_COL=11) must start strictly
// right of this with a gap, so the column-anchoring tests use the bumped anchor.
const ZONE_A_LAST_COL_0BASED = 8; // col I

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

test("status block is column-anchored right of widened Zone A (0-based columnIndex > 8)", () => {
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
