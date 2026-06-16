---
phase: 02-layout-builder
plan: 03
subsystem: infra
tags: [layout-builder, google-sheets, data-safety, idempotency, tdd, bun-test]

# Dependency graph
requires:
  - phase: 02-layout-builder (02-01, 02-02)
    provides: DCA Log band builder (dcaLogSheet.js), shared assets.json registry, config.js DATA_START_ROW boundary, testEnv.js test idiom
provides:
  - DATA_START_ROW pinned to a fixed literal (23 = MAX_SUMMARY_ROWS + 3) with zero assets.length term
  - MAX_SUMMARY_ROWS reservation (20) gating the per-asset summary block
  - DCA Log band positioned from the fixed boundary; reserved summary rows stay blank; loud overflow guard
  - Data-safety test suite anchored to the hard literal 23 plus a registry-invariance and overflow-guard test
affects: [02-layout-builder verification, Phase 5 SUMIF formulas, any future CONFIG-01 asset add/remove]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Fixed build-time data-region boundary (literal, not registry-derived) for irreversible-data-loss safety"
    - "Optional injected asset-list parameter so guards/invariants are testable without mutating the shared import"
    - "Data-safety assertions anchored to a hard literal so a boundary-moving change fails loudly"

key-files:
  created:
    - layout-builder/src/config.test.js
  modified:
    - layout-builder/src/config.js
    - layout-builder/src/dcaLogSheet.js
    - layout-builder/src/dcaLogSheet.test.js

key-decisions:
  - "DATA_START_ROW is a fixed literal (23 = MAX_SUMMARY_ROWS + 3), never derived from assets.length — closes the LAYOUT-02 floating-boundary defect"
  - "MAX_SUMMARY_ROWS = 20 reserves the summary block (7 current assets + headroom); exceeding it fails loudly rather than shifting the boundary"
  - "Reserved-but-unused summary rows stay label/format-only (D-08); formats span the full reserved block (rows 2-21), strictly above the data region"

patterns-established:
  - "Fixed-boundary band positioning: builders position the whole band from the reservation, not the live asset count"
  - "Literal-anchored data-safety tests: import the boundary only to prove it equals the hard literal, then assert ranges against the literal"

requirements-completed: [LAYOUT-02]

# Metrics
duration: ~12min
completed: 2026-06-16
---

# Phase 2 Plan 03: Fixed DATA_START_ROW Boundary (LAYOUT-02 Gap Closure) Summary

**Pinned the DCA Log data-region boundary to a fixed literal (DATA_START_ROW = 23 = MAX_SUMMARY_ROWS + 3) backed by a MAX_SUMMARY_ROWS=20 reservation, so a CONFIG-01 asset add can no longer re-stamp the transaction header onto live DCA transactions — with the data-safety test now anchored to the hard literal and a loud overflow guard.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-06-16 (worktree execution)
- **Completed:** 2026-06-16
- **Tasks:** 2 (both TDD: RED → GREEN)
- **Files modified:** 4 (1 created, 3 modified)

## Accomplishments
- Removed the LAYOUT-02 root defect: `DATA_START_ROW = assets.length + 3` (floating) replaced with `MAX_SUMMARY_ROWS + 3` (fixed literal 23), with no `assets.length` term.
- Added `MAX_SUMMARY_ROWS = 20` reservation; per-asset summary rows fill top-down within it, reserved rows stay blank (D-08), and `assets.length > MAX_SUMMARY_ROWS` throws loudly instead of shifting the boundary.
- Repositioned the DCA Log band from the fixed boundary; the transaction header is locked at row 22 (0-based 21) regardless of asset count.
- Hardened the data-safety suite: assertions anchored to the hard literal `23`, plus a boundary-invariance test and an overflow-guard test. Full suite green (23 tests).

## Task Commits

Each task was committed atomically (TDD RED → GREEN):

1. **Task 1 (RED): failing config boundary test** - `35cf0a7` (test)
2. **Task 1 (GREEN): pin DATA_START_ROW to fixed literal 23** - `86c4cc1` (feat)
3. **Task 2 (RED): anchor data-safety to literal 23 + invariant/overflow tests** - `2bb546b` (test)
4. **Task 2 (GREEN): position band from fixed boundary, reserve rows, guard overflow** - `56b69aa` (feat)

_Note: no REFACTOR commits were needed — GREEN implementations were already clean._

## Files Created/Modified
- `layout-builder/src/config.js` - DATA_START_ROW now a fixed literal (MAX_SUMMARY_ROWS + 3 = 23) with no assets.length term; added MAX_SUMMARY_ROWS = 20; rewrote the boundary banner to document the fixed row map and the LAYOUT-02 defect closed.
- `layout-builder/src/config.test.js` (created) - asserts DATA_START_ROW === 23 against a hard literal, DATA_START_ROW === MAX_SUMMARY_ROWS + 3, and boundary invariance under registry length.
- `layout-builder/src/dcaLogSheet.js` - imports MAX_SUMMARY_ROWS; positions the band from the fixed boundary; fills summary labels top-down; leaves reserved rows blank; formats the full reserved block (rows 2-21); throws loudly on overflow; accepts an optional assetList param for testability.
- `layout-builder/src/dcaLogSheet.test.js` - data-region assertion bounded against the hard literal 23; added a fixed-header-row invariance test, a reserved-rows-blank test, an overflow-guard test, and a full-capacity boundary test.

## Decisions Made
- **MAX_SUMMARY_ROWS = 20**: covers the current 7 assets with comfortable growth headroom; chosen as the fixed reservation so the boundary is generous and stable.
- **Optional `assetList` parameter on the builders**: lets the overflow guard and boundary-invariance be exercised with an oversized/full registry without mutating the shared `assets.json` import. Defaults to the shared registry, so production behavior is unchanged.
- **Format the full reserved block (rows 2-21), not just used rows**: formats carry no value and stay strictly above the data region (endRowIndex 21 < boundary 22), keeping the layout consistent regardless of asset count while preserving D-08 (label/format-only).

## Deviations from Plan

None - plan executed exactly as written. Both tasks followed the prescribed TDD RED→GREEN cycle, all acceptance criteria and verification greps pass, and no auto-fixes (Rules 1-3) or architectural decisions (Rule 4) were required.

## Issues Encountered
- During Task 2 RED, most hardened assertions already passed because `TX_HEADER_ROW` derives from `DATA_START_ROW` (now the fixed 23) — only the new overflow-guard test failed, which was the intended RED signal for the new behavior. Resolved by implementing the guard and the optional `assetList` param in Task 2 GREEN.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- LAYOUT-02 data-safety gap is closed: the DCA Log data region cannot be overwritten by a registry edit, and the test suite fails loudly if any future change tries to move the boundary.
- Phase 5 open-ended `A{DATA_START_ROW}:A` SUMIF ranges (D-07) are compatible with — and improved by — the fixed, generous boundary.
- No new blockers introduced. Pre-existing Phase 3 blockers (Solana mint addresses, XAUt ticker, RPC endpoint) remain unchanged and out of scope for this plan.

## Self-Check: PASSED

All claimed files exist on disk and all task/summary commits are present in git history; working tree clean.

---
*Phase: 02-layout-builder*
*Completed: 2026-06-16*
