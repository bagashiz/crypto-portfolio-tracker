---
phase: 02-layout-builder
fixed_at: 2026-06-16T00:00:00Z
review_path: .planning/phases/02-layout-builder/02-REVIEW.md
iteration: 1
findings_in_scope: 6
fixed: 6
skipped: 0
status: all_fixed
---

# Phase 02: Code Review Fix Report

**Fixed at:** 2026-06-16T00:00:00Z
**Source review:** .planning/phases/02-layout-builder/02-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 6 (1 Critical, 5 Warning)
- Fixed: 6
- Skipped: 0

Test suite went from 23 pass / 0 fail to **27 pass / 0 fail** (4 new tests added across WR-01 and WR-03). All fixes verified with `node -c` syntax checks plus the full `bun test` suite after each commit.

## Fixed Issues

### CR-01: Dashboard has no asset-count overflow guard; Zone A collides with Zone B past 9 assets

**Files modified:** `layout-builder/src/dashboardSheet.js`
**Commit:** 06a2fac
**Applied fix:** Added `MAX_ZONE_A_ASSET_ROWS` constant (derived as `ZONE_B_HEADER_ROW - 3` = 9, with a comment explaining the no-collision arithmetic) and a loud `throw` at the top of `structuralRequests` mirroring the DCA Log `MAX_SUMMARY_ROWS` fail-loud pattern. A registry larger than 9 now fails with an actionable error instead of silently stamping Zone A's TOTAL/label rows onto Zone B's pinned header (row 12). Zones stay at fixed positions (the explicit-reservation option), preserving the skeleton-only scope (D-08) — no formulas, no conditional formatting added.

### WR-01: `structuralRequests` accepts no asset-list override, so the Dashboard overflow path is untestable

**Files modified:** `layout-builder/src/dashboardSheet.js`, `layout-builder/src/dashboardSheet.test.js`
**Commit:** f57c8fd
**Applied fix:** Threaded an optional `assetList = assets` parameter through `structuralRequests`, `dashboardBuildRequests`, and `dashboardUpdateRequests`, mirroring the DCA Log `bandRequests` signature. Exported `ZONE_B_HEADER_ROW` and `MAX_ZONE_A_ASSET_ROWS` so tests assert the invariant against the named constants rather than a magic literal. Added two tests: (a) builders throw past `MAX_ZONE_A_ASSET_ROWS`, and (b) at full capacity `zoneATotalRow` (and the max emitted Zone A label row) stays strictly above `ZONE_B_HEADER_ROW`.

### WR-02: `--build` tab creation and structural stamp are not atomic; a partial failure leaves orphan empty tabs

**Files modified:** `layout-builder/src/index.js`
**Commit:** 4627a8f
**Applied fix:** Adopted the preferred option (a): combined the two `addSheet` requests and the structural builders into a single atomic `batchUpdate` call. Assigned explicit gridIds (1, 2) in the `addSheet` request properties so the structural builders can reference them in the same payload, eliminating the second round-trip and the orphan-empty-tab window entirely. `batchUpdate` now returns `res.data.replies` for callers that need per-request results.

**Requires human verification:** this is a behavioral change to live Sheets API orchestration (atomic batch with explicit gridIds 1/2 instead of a second round-trip). The offline test suite cannot exercise the real `batchUpdate` path. Confirm against a real spreadsheet that explicit gridIds 1/2 are accepted on a fresh build and that the single-batch stamp applies as expected.

### WR-03: Build-time fail-fast in `config.js` runs on import, breaking any test that imports it without `testEnv.js` first

**Files modified:** `layout-builder/src/config.js`, `layout-builder/src/index.js`, `layout-builder/src/config.test.js`
**Commit:** b4a1430
**Applied fix:** Adopted option (a): replaced the import-time `throw` with a lazy `getSpreadsheetId()` function that validates on call. Importing `config.js` for constants no longer depends on `testEnv.js` evaluating before any config-importing line. `index.js` now imports `getSpreadsheetId`, resolves + fail-fast validates the id once in `main()`, and threads `spreadsheetId` through `getExistingTabs` / `batchUpdate` / `runBuild` / `runUpdate`. Added two tests documenting the order-independent contract (value returned when set; loud throw when unset or placeholder).

### WR-04: `getExistingTabs` stores `sheetId` without validating it is numeric, masking malformed API responses

**Files modified:** `layout-builder/src/index.js`
**Commit:** dcd359c
**Applied fix:** Applied the suggested guard: when a sheet has a string title but `typeof props.sheetId !== "number"`, throw an explicit "malformed API response" error instead of storing `title -> undefined`. A valid gridId of `0` still passes (it is a number), preserving the existing `=== undefined` distinction noted in the review.

### WR-05: `void google;` is dead code masquerading as a contract assertion; the import is unused

**Files modified:** `layout-builder/src/index.js`
**Commit:** 576ecc0
**Applied fix:** Removed both the unused `import { google } from "googleapis";` and the `void google;` no-op. The real `googleapis` dependency edge is `auth.js`'s `getSheetsClient()`; the layout builder still exercises the dependency through that path. Verified no remaining `google` references in `index.js`.

---

_Fixed: 2026-06-16T00:00:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
