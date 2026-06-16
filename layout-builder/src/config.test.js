// Unit tests for config.js (bun:test, co-located per TESTING.md).
//
// LAYOUT-02 boundary-fix suite (02-03 gap closure): proves the DCA Log data-region
// boundary DATA_START_ROW is a FIXED integer literal decided at build time, NOT a
// value derived from assets.length. Asserting against the HARD literal 23 (not a
// registry-recomputed value) is the whole point — it makes any future registry
// change that would move the boundary fail this suite loudly, instead of silently
// re-stamping the transaction header onto a live DCA data row (the LAYOUT-02
// irreversible-data-loss defect this plan closes).
//
// Imported FIRST so SPREADSHEET_ID exists before config.js is evaluated.
import "./testEnv.js";
import { test, expect } from "bun:test";
import { assets, DATA_START_ROW, MAX_SUMMARY_ROWS } from "./config.js";

// The fixed data-region boundary, hard-coded as a literal here. This MUST equal the
// literal 23 and MUST NOT be recomputed from assets.length — anchoring on the literal
// is what makes a boundary-moving registry change fail loudly.
const DATA_START_ROW_LITERAL = 23;

test("MAX_SUMMARY_ROWS is the fixed reservation literal 20", () => {
  expect(MAX_SUMMARY_ROWS).toBe(20);
});

test("DATA_START_ROW is the fixed integer literal 23", () => {
  // Asserted against the hard literal, NOT against assets.length + anything.
  expect(DATA_START_ROW).toBe(DATA_START_ROW_LITERAL);
  expect(DATA_START_ROW).toBe(23);
});

test("DATA_START_ROW === MAX_SUMMARY_ROWS + 3 (derived from the fixed reservation only)", () => {
  expect(DATA_START_ROW).toBe(MAX_SUMMARY_ROWS + 3);
});

test("DATA_START_ROW does not move with the registry length (boundary is fixed)", () => {
  // The boundary is computed at module load with no assets.length term, so for the
  // current 7-asset registry it is 23; the same literal would hold for a 1-asset or a
  // 20-asset registry. We assert the invariant by confirming the value equals the
  // literal and is unrelated to the current count.
  expect(DATA_START_ROW).toBe(23);
  expect(DATA_START_ROW).not.toBe(assets.length + 3);
});

test("MAX_SUMMARY_ROWS reserves room for the current registry with headroom", () => {
  // assets.length (currently 7) must fit inside the reserved summary block. Exceeding
  // MAX_SUMMARY_ROWS must be a GUARDED failure at build/update time (covered in the
  // dcaLogSheet overflow-guard test), never a silent boundary shift.
  expect(MAX_SUMMARY_ROWS).toBeGreaterThanOrEqual(assets.length);
  expect(assets.length).toBeLessThan(MAX_SUMMARY_ROWS);
});
