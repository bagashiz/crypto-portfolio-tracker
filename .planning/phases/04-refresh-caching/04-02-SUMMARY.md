---
phase: 04-refresh-caching
plan: 02
subsystem: layout-builder
tags: [layout, dashboard, status-block, refresh, staleness]
requires:
  - layout-builder/src/dashboardSheet.js (existing structuralRequests + labelRowRequest helper)
  - assets.json (7-asset registry)
provides:
  - Static per-venue refresh status block labels (Hyperliquid + Solana/Jupiter, LastUpdated + Stale?) in Dashboard layout
  - STATUS_START_COL / STATUS_START_ROW placement constants (col I, rows 1-3) for Plan 01 refreshAll() to target
affects:
  - apps-script refreshAll() (Plan 01) writes dynamic timestamp/Stale? values into the adjacent J/K cells
tech-stack:
  added: []
  patterns:
    - Reused labelRowRequest single-source helper for status labels (no raw updateCells literal)
    - Column-anchored placement immune to the row-shifting MAX_ZONE_A_ASSET_ROWS guard
    - Build == update for static structure (both delegate to structuralRequests)
key-files:
  created: []
  modified:
    - layout-builder/src/dashboardSheet.js
    - layout-builder/src/dashboardSheet.test.js
decisions:
  - "Status block placed at col I (1-based 9), rows 1-3: header row + Hyperliquid line + Solana/Jupiter line; values left empty for refreshAll()"
metrics:
  duration: ~6m
  completed: 2026-06-17
  tasks: 2
  files: 2
---

# Phase 4 Plan 02: Dashboard Refresh Status Block Summary

Stamped the static per-venue refresh status block (Hyperliquid + Solana/Jupiter, each with LastUpdated and Stale? labels) into the Dashboard layout as column-anchored labels at col I rows 1-3, emitted by both `--build` and `--update`, with offline tests proving placement right of Zone A and non-collision with the zones at max registry capacity.

## What Was Built

- **Task 1 (commit 3c504f8):** Added `STATUS_START_COL` (9, col I), `STATUS_START_ROW` (1), `STATUS_HEADERS` (`["Status","LastUpdated","Stale?"]`), and `STATUS_VENUE_LINES` (`["Hyperliquid","Solana/Jupiter"]`) constants to `dashboardSheet.js`. Composed the block using the existing `labelRowRequest` helper and pushed the requests into `structuralRequests` so both `dashboardBuildRequests` and `dashboardUpdateRequests` emit them. Exported the placement constants for the test file. Inline comment documents the exact column/row geometry (J = LastUpdated values, K = Stale? values) so Plan 01's `refreshAll()` targets the matching cells.
- **Task 2 (commit 909203a):** Added 6 `bun:test` cases to `dashboardSheet.test.js`: labels exist on build; column-anchored right of Zone A (0-based columnIndex > 6); update emits the same labels as build; status rows stay above Zone B's header; no zone request intersects the status columns even at `MAX_ZONE_A_ASSET_ROWS` capacity; and status requests are skeleton-only (no `formulaValue` / `addConditionalFormatRule`).

## How It Works

The status block is COLUMN-anchored at col I, well to the right of Zone A (cols A–G) and Zone B (cols A–G). Because the `MAX_ZONE_A_ASSET_ROWS` guard only shifts ROWS as the asset registry grows, the fixed-column block can never collide with zone data. The layout builder owns ONLY the static labels (D-05 build-time/run-time split); the adjacent LastUpdated/Stale? value cells (cols J/K, rows 2-3) are left empty for Apps Script `refreshAll()` (Plan 01) to populate dynamically.

## Verification

- `cd layout-builder && bun test` — 33 pass, 0 fail across 3 files (7 dashboard cases pre-existing + 6 new status cases + dcaLog/config suites).
- `grep -E 'LastUpdated|Stale' layout-builder/src/dashboardSheet.js` — confirms the static labels and placement constants.

## Deviations from Plan

None - plan executed exactly as written.

## Threat Model Compliance

- **T-04-05 (Tampering — status block overwriting zones):** mitigated. Block is column-anchored right of Zone A and above Zone B; the new test "status block never intersects any zone request even at MAX_ZONE_A_ASSET_ROWS capacity" asserts non-collision at full registry size, mirroring the LAYOUT-02 boundary-safety discipline.
- **T-04-06 (DoS — --update wiping dynamic values):** accepted per plan; --update re-stamps only the static labels (empty adjacent value cells), self-healing on the next refreshAll run. No DCA data touched (separate tab).
- **T-04-SC (npm installs):** accepted; no new packages added.

## Notes / Follow-ups

- Materializing these labels in the live sheet requires a one-time `layout-builder --update` run — performed at the Plan 03 live-verify checkpoint, not here.

## Self-Check: PASSED

- FOUND: layout-builder/src/dashboardSheet.js
- FOUND: layout-builder/src/dashboardSheet.test.js
- FOUND commit: 3c504f8 (feat — status block)
- FOUND commit: 909203a (test — status assertions)
- No file deletions in either commit.
