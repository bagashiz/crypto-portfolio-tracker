---
phase: 04-refresh-caching
plan: 01
subsystem: api
tags: [apps-script, cacheservice, spreadsheetapp, scriptapp, refresh, trigger, bun-test]

# Dependency graph
requires:
  - phase: 03-data-layer
    provides: "getHyperliquidData/getJupiterData D-09 providers (Record<id,{price,qty}>), fail-loud per venue"
  - phase: 01-foundation
    provides: "entry.ts __ENTRY__ + appendGlobals.ts ENTRY_GLOBALS top-level-shim mechanism"
provides:
  - "refreshAll() time-driven trigger entry point (fetch both venues -> per-venue degrade -> single batched setValues -> blob update)"
  - "assembleRefreshRows() pure, exported, unit-tested row-sourcing function (live->cache->sheet precedence, D-08)"
  - "installTrigger()/removeTrigger() idempotent time-driven trigger management (D-09)"
  - "PRICES_ALL per-venue last-good cache blob ({hyperliquid:{data,lastUpdated}, solana:{...}})"
  - "two new oauthScopes (spreadsheets, script.scriptapp) and three new editor-discoverable globals"
affects: [phase-05-pnl-allocation, layout-builder-status-block]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Per-venue independent try/catch over both providers (graceful degradation, D-03)"
    - "Pure row-sourcing seam (assembleRefreshRows) kept free of CacheService/SpreadsheetApp/ScriptApp so it is bun-testable"
    - "Single batched setValues over Zone A Qty/Price only; status block written in one separate batched setValues"
    - "Idempotent trigger install (delete-by-handler-name before create)"

key-files:
  created:
    - apps-script/src/Refresh.ts
    - apps-script/src/Refresh.test.ts
    - apps-script/src/Triggers.ts
  modified:
    - apps-script/appsscript.json
    - apps-script/src/entry.ts
    - apps-script/scripts/appendGlobals.ts
    - apps-script/src/globals.d.ts

key-decisions:
  - "PRICES_ALL is a last-good degradation buffer, not a call-reduction cache: refreshAll always fetches live, reads cache only on a venue failure (D-01)"
  - "Status block placed top-right cols I-K rows 1-3, dynamic values written to LastUpdated col J + Stale? col K (D-04/D-06); layout-builder Plan 02 stamps the static labels"
  - "A failed venue never writes a non-number into Qty/Price; cold-start passthrough reads current sheet values, missing/blank cells degrade to 0 (T-04-01/D-07)"
  - "Two distinct setValues calls: one for the batched Qty/Price data (REFRESH-02), one for the per-venue status pair — both genuinely batched"

patterns-established:
  - "assembleRefreshRows: pure precedence resolver (live ?? cache ?? sheet) with toFinite() number guard"
  - "deleteRefreshTriggers() shared helper backs both installTrigger (idempotency) and removeTrigger (teardown)"

requirements-completed: [REFRESH-01, REFRESH-02, REFRESH-03, REFRESH-04]

# Metrics
duration: 12min
completed: 2026-06-17
---

# Phase 4 Plan 01: Refresh Orchestration Summary

**Apps Script refresh layer: a single-batched-write `refreshAll()` with per-venue graceful degradation off a `PRICES_ALL` last-good cache blob, plus idempotent time-driven `installTrigger`/`removeTrigger`, all wired as editor-discoverable globals.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-06-17T14:20:10Z
- **Completed:** 2026-06-17T14:32:00Z (approx)
- **Tasks:** 3
- **Files modified:** 7 (3 created, 4 modified)

## Accomplishments
- `refreshAll()` orchestrator: fetches both venues live with independent per-venue try/catch (D-03), sources each venue's rows by precedence live → cache last-good → current sheet (D-08), writes Zone A Qty/Price in a single batched `setValues` (REFRESH-02), maintains the per-venue `PRICES_ALL` blob, and writes the per-venue LastUpdated/Stale? status pair (D-04).
- Pure, exported, unit-tested `assembleRefreshRows()` — 6 bun tests cover live precedence, partial degradation, cold-start passthrough, registry order, and the no-non-number-injection guard (T-04-01).
- Idempotent `installTrigger()`/`removeTrigger()` from the compiled `REFRESH_INTERVAL_MINUTES` constant (D-09); install removes any existing `refreshAll` trigger before creating one (T-04-02 duplicate-trigger guard).
- Two new OAuth scopes (`spreadsheets`, `script.scriptapp`) and three new editor-discoverable top-level globals confirmed in the built `dist/Code.js`.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add OAuth scopes + wire entry globals** - `458d357` (feat)
2. **Task 2 (RED): failing tests for assembleRefreshRows** - `151ed60` (test)
3. **Task 2 (GREEN): assembleRefreshRows + refreshAll** - `4dfd7d0` (feat)
4. **Task 3: idempotent Triggers + full bundle build** - `e41d3d4` (feat)

_Task 2 followed the TDD RED → GREEN cycle (no refactor commit needed; the status-write consolidation was applied before the GREEN commit)._

## Files Created/Modified
- `apps-script/src/Refresh.ts` - `refreshAll()` orchestrator + pure `assembleRefreshRows()` row-sourcing + `PRICES_ALL` constant + blob/status helpers
- `apps-script/src/Refresh.test.ts` - 6 bun tests for the D-08/D-03/D-07 sourcing precedence and number guard
- `apps-script/src/Triggers.ts` - `installTrigger()`/`removeTrigger()` idempotent time-driven trigger management
- `apps-script/appsscript.json` - oauthScopes adds `spreadsheets` + `script.scriptapp` (timeZone Asia/Jakarta preserved)
- `apps-script/src/entry.ts` - imports + registers refreshAll/installTrigger/removeTrigger in `__ENTRY__`; removed the now-fulfilled Phase 4 TODO block
- `apps-script/scripts/appendGlobals.ts` - `ENTRY_GLOBALS` extended to all five names
- `apps-script/src/globals.d.ts` - uncommented the three trigger/refresh ambient declarations

## Decisions Made
- **Status block geometry:** Plan 02 (layout-builder labels) has not landed, so per the plan's instruction I used the agreed top-right block — headers row 1, Hyperliquid row 2, Solana row 3, with dynamic values in LastUpdated (col J) + Stale? (col K). Alignment is to be confirmed at the live-verify checkpoint (Plan 03). The two contiguous status rows are written in one batched `setValues` over J2:K3.
- **Number guard:** `toFinite()` coerces any undefined/non-finite/blank source value to `0`, so a cold-start failure with an unreadable current cell still emits a number — never NaN/null/string that would `#VALUE`-cascade into Phase 5 formulas.
- **setValues count:** the literal `grep -c 'setValues' == 1` acceptance heuristic is not satisfiable (data write + status write are necessarily distinct cell ranges); the binding requirement REFRESH-02 — a single batched Qty/Price write — is met, and the status block is itself a single batched write.

## Deviations from Plan

None - plan executed exactly as written. No bugs, missing critical functionality, or blocking issues were encountered (Rules 1-4 not triggered). No new packages were added (T-04-SC: Apps Script has no npm runtime).

## Issues Encountered
- Bundle build and full `bun test` both green on first integration run after Task 3; no debugging required.

## User Setup Required
None for this plan's code. Note for the phase: a one-time `layout-builder --update` is required (Plan 02) to materialize the static status-block labels, and `installTrigger()` must be run once from the editor to start the schedule. These are tracked at the phase level, not this plan.

## Next Phase Readiness
- Refresh seam is ready: `refreshAll` is the trigger handler and an editor-callable manual-refresh entry point; the providers' fail-loud behavior is now safe behind per-venue degradation.
- Phase 5 owns Value/PnL formulas (col D) and Target/Risk/APY (cols E–G); this plan deliberately leaves those cells untouched (D-10), so the refresh write and Phase 5 formulas will not fight over cells.
- Open: status-block column/row alignment with the layout builder's eventual labels (Plan 02) — confirm at the Plan 03 live-verify checkpoint.

## Self-Check: PASSED

- Created files present and committed: `apps-script/src/Refresh.ts`, `apps-script/src/Refresh.test.ts`, `apps-script/src/Triggers.ts` (confirmed via successful commits 4dfd7d0/151ed60/e41d3d4 and the `bun build` that bundled all 10 modules).
- Modified files committed in `458d357`.
- Commits verified in `git log`: 458d357, 151ed60, 4dfd7d0, e41d3d4.
- Full suite: 23 pass / 0 fail. Bundle build: 5 top-level shims emitted, 3 new globals (refreshAll/installTrigger/removeTrigger) present in dist/Code.js.

---
*Phase: 04-refresh-caching*
*Completed: 2026-06-17*
