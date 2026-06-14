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
import { dashboardBuildRequests, dashboardUpdateRequests } from "./dashboardSheet.js";

const GRID_ID = 0;

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
