---
phase: 05-pnl-allocation
plan: 03
subsystem: apps-script-refresh
tags: [refresh, cross-runtime-geometry, status-block, pnl]
requires:
  - "05-02: Dashboard STATUS_START_COL=11 (col K) relocation + Value=B*C formula"
provides:
  - "Refresh.ts STATUS_LASTUPDATED_COL = 12 (col L), Stale? = 13 (col M)"
  - "Exported constants STATUS_LASTUPDATED_COL / QTY_COL / VALUE_COLS for geometry assertions"
  - "Confirmed invariant: Zone A refresh write is 2 cols (Qty B / Price C), Value col D excluded"
affects:
  - apps-script/src/Refresh.ts
  - apps-script/src/Refresh.test.ts
tech-stack:
  added: []
  patterns:
    - "Cross-runtime geometry coupling expressed as STATUS_LASTUPDATED_COL = STATUS_START_COL + 1"
    - "Module-private constants exported solely to make cross-runtime geometry test-assertable"
key-files:
  created: []
  modified:
    - apps-script/src/Refresh.ts
    - apps-script/src/Refresh.test.ts
decisions:
  - "STATUS_LASTUPDATED_COL derived as STATUS_START_COL + 1 (local mirror const = 11) rather than a bare literal 12, so the +1 coupling to the layout builder is self-documenting"
  - "Exported QTY_COL/VALUE_COLS/STATUS_LASTUPDATED_COL (preferred plan option) instead of source-level string assertions"
metrics:
  duration: ~4 min
  completed: 2026-06-19
requirements: [PNL-03]
---

# Phase 5 Plan 03: Refresh Cross-Runtime Geometry Sync Summary

Moved the Apps Script refresh layer in lockstep with Plan 02's Dashboard geometry: `refreshAll()` now writes LastUpdated/Stale? at cols L/M (12/13) matching the relocated status block (layout-builder `STATUS_START_COL=11`), and its Qty/Price write is pinned to 2 cols (B:C) so the new `=B*C` Value formula in col D is never clobbered.

## What Was Built

- **`Refresh.ts` status column relocation:** `STATUS_LASTUPDATED_COL` changed from `10` (col J) to `STATUS_START_COL + 1 = 12` (col L), with `STATUS_START_COL = 11` added as a local mirror of the layout builder's value so the cross-runtime `+1` coupling is explicit. Stale? now lands at col M (13) via the existing 2-col status `setValues` width.
- **Value-exclusion re-confirmation:** `VALUE_COLS` stays `2`; the Zone A `valueRange` spans only Qty(B)+Price(C). Added inline comments documenting that Value(D) is intentionally excluded because it is a `=B*C` formula (D-02) and writing it would clobber the formula / #VALUE-cascade the PnL math (T-05-06).
- **Exported geometry constants:** `STATUS_LASTUPDATED_COL`, `QTY_COL`, `VALUE_COLS` are now exported from `Refresh.ts` solely so the test suite can assert the cross-runtime geometry behaviorally and structurally.
- **Comment hygiene:** Updated all geometry comments (the constant block, the status `setValues` site, and the `statusPair` doc) from the stale I/J/K references to the correct K/L/M columns.
- **`Refresh.test.ts` guards:** Added assertions that `STATUS_LASTUPDATED_COL === 12`, `QTY_COL === 2`, `VALUE_COLS === 2`, and that every `assembleRefreshRows` output row is exactly 2-wide (no Value leak). Existing assembler/backfill tests pass unchanged.

## Task Commits

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 1 | Move status-block write columns; re-confirm Qty/Price-only write (TDD) | `43f8145` | apps-script/src/Refresh.ts |
| 2 | Assert cross-runtime geometry + Value-exclusion | `25fa32d` | apps-script/src/Refresh.test.ts |

TDD note: this plan is `type: execute` with Task 1 marked `tdd="true"`. The RED gate (failing import of not-yet-exported constants + the `=== 12` assertion against the old value `10`) and GREEN gate (the Refresh.ts edit) were exercised in sequence. Because the plan splits source (Task 1) and test (Task 2) into distinct deliverables/commits, the per-task commits are `feat` (Task 1) then `test` (Task 2) rather than the canonical test-before-feat ordering; the RED phase was verified before the source edit (see Verification).

## Verification

- RED confirmed: `bun test apps-script/src/Refresh.test.ts` failed with `Export named 'QTY_COL' not found` before the Refresh.ts edit.
- GREEN confirmed: after the edit, `bun test apps-script/src/Refresh.test.ts` -> 11 pass / 0 fail.
- Full suite: `bun test apps-script/` -> 28 pass / 0 fail (107 expect() calls).
- `STATUS_LASTUPDATED_COL === 12` and `VALUE_COLS === 2` asserted.
- Qty/Price write provably 2 cols wide (every assembled row length 2; getRange spans `(row, QTY_COL=2, n, VALUE_COLS=2)` = B:C).
- Both writes remain single batched `setValues` (no cell-by-cell `setValue` introduced).

## Threat Mitigations Applied

- **T-05-06 (Tampering — overwrite Value(D) formula):** `VALUE_COLS` pinned to 2 and asserted; the getRange write spans only B:C; inline comment documents the exclusion.
- **T-05-07 (Tampering — status write landing in Zone A PnL cols):** `STATUS_LASTUPDATED_COL` moved to 12 (col L) and asserted `=== 12`, so it cannot silently drift back onto the new PnL columns (H/I) or the old col J.

## Deviations from Plan

None - plan executed exactly as written. The only judgment call (introducing a local `STATUS_START_COL = 11` mirror const rather than a bare `12` literal) is within the action's intent ("Change STATUS_LASTUPDATED_COL ... to STATUS_START_COL + 1 = 12") and makes the cross-runtime coupling self-documenting.

## Known Stubs

None. No placeholder values, mock data sources, or unwired components introduced. The status value cells (L/M) are written at runtime by `refreshAll()` as designed (build-time/run-time split, D-05) — not stubs.

## Self-Check: PASSED

- FOUND: apps-script/src/Refresh.ts (modified, committed 43f8145)
- FOUND: apps-script/src/Refresh.test.ts (modified, committed 25fa32d)
- FOUND: .planning/phases/05-pnl-allocation/05-03-SUMMARY.md (3e04a8f)
- FOUND commits: 43f8145, 25fa32d, 3e04a8f
