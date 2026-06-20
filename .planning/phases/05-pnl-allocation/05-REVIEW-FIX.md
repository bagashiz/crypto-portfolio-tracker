---
phase: 05-pnl-allocation
fixed_at: 2026-06-20T05:40:07Z
review_path: .planning/phases/05-pnl-allocation/05-REVIEW.md
iteration: 1
findings_in_scope: 3
fixed: 3
skipped: 0
status: all_fixed
---

# Phase 5: Code Review Fix Report

**Fixed at:** 2026-06-20T05:40:07Z
**Source review:** .planning/phases/05-pnl-allocation/05-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope (critical + warning): 3
- Fixed: 3
- Skipped: 0
- Test suite after fixes: **70 pass / 0 fail** (`rtk bun test`, 397 expect() calls, 5 files)

Scope was `critical_warning`: all 3 Warnings (WR-01, WR-02, WR-03) were fixed.
The 3 Info findings (IN-01, IN-02, IN-03) were out of scope and not touched.

## Fixed Issues

### WR-02: status block written from the pre-backfill blob snapshot

**Files modified:** `apps-script/src/Refresh.ts`
**Commit:** `e3f1f87` (shared with WR-03 — see note below)
**Status:** fixed — requires human verification (ordering/logic change)

**Applied fix:** Reordered `refreshAll()` so `backfillBlobFromSheet(blob, ASSETS, rows)`
runs BEFORE the status block is written. The status pair (`statusRows`) is now derived
from the finalized, post-backfill `blob`, so the displayed `LastUpdated`/`Stale?` is
provably consistent with the persisted cache slice rather than coincidentally equal.
The single batched status `setValues` and the cache `put` are unchanged; only the order
of `backfillBlobFromSheet` relative to the status write moved (it now precedes it).

Flagged for human verification because this is a control-flow/ordering change: Tier 1/2
verification confirms syntax and that the existing pure-seam tests still pass, but
`refreshAll()` itself touches Apps Script globals and is not bun-testable, so the
end-to-end status/cache consistency is not exercised by an automated test. The behavior
is unchanged for today's inputs (both paths still produce `"—"` for a failed+evicted
venue); the fix removes the latent desync risk the review described.

### WR-03: dead computed `lastAssetRow` / `STATUS_SOL_ROW` kept alive by `void`

**Files modified:** `apps-script/src/Refresh.ts`
**Commit:** `e3f1f87` (shared with WR-02)
**Status:** fixed

**Applied fix:** Removed the computed-then-`void`-ed `lastAssetRow` (it never bounded any
write — the value range already uses `ASSETS.length`) and the unused `STATUS_SOL_ROW`
constant, plus both trailing `void` statements. The implied Solana status row is now noted
in a one-line comment on `STATUS_HL_ROW` ("Solana row (3) is implied by the 2-row status
range height"). No behavioral change. `noUnusedLocals` is disabled in `tsconfig.json`, so
removing these does not break the type-checker.

**Commit-sharing note (WR-02 + WR-03):** Both findings edit overlapping lines of the same
function body in `apps-script/src/Refresh.ts` — the WR-02 reorder and the WR-03 `void`
removal were inseparable in a single coherent edit (the `void lastAssetRow` /
`void STATUS_SOL_ROW` statements sat in the exact block reordered for WR-02). They were
therefore committed together as one atomic commit (`e3f1f87`) referencing both IDs, rather
than producing a corrupt intermediate state. Each finding's intent is fully and
independently realized in that commit.

### WR-01: `--update` aborts the whole atomic batch if the live conditional-rule count drifts below 3

**Files modified:** `layout-builder/src/index.js`, `layout-builder/src/dashboardSheet.js`, `layout-builder/src/dashboardSheet.test.js`
**Commit:** `d67c2cd`
**Status:** fixed — requires human verification (network-glue path not bun-testable)

**Applied fix (review's Option 2 — split deletes into a separate error-tolerant batch):**

1. `dashboardSheet.js`: extracted the descending-index conditional-format pre-clear deletes
   into a new exported `dashboardConditionalPreClearRequests(sheetId)` (emits `[2,1,0]`).
   `dashboardUpdateRequests` now passes `preClearConditionalRules = false`, so the structural
   `--update` batch emits ZERO deletes. The conditional-format ADD rules are still emitted in
   the structural batch and still converge the rule count to exactly `MANAGED_RULE_COUNT` (3).
2. `index.js` `runUpdate`: sends `dashboardConditionalPreClearRequests(dashboardId)` in its OWN
   `batchUpdate` BEFORE the structural re-apply, wrapped in a `try/catch` that swallows ONLY the
   `No conditional format rule found at index N` 400 (matched by the new
   `isNoConditionalRuleAtIndexError` predicate; any other error still surfaces loudly). The
   structural batch (dashboard + DCA Log) is therefore never rolled back by an out-of-range
   delete on rule-count drift, so `--update` always lands.
3. `dashboardSheet.test.js`: replaced the old "structural `--update` emits `[2,1,0]` deletes"
   assertion with two tests — (a) the structural `--update` batch now emits ZERO deletes but
   still emits add rules; (b) `dashboardConditionalPreClearRequests` emits exactly `[2,1,0]`
   against the dashboard `sheetId`.

**Why Option 2 over Option 1 (live rule-count read):** Option 1 (an extra
`spreadsheets.get` round-trip to read `conditionalFormats` and pass the live count to the
builder) is a larger architectural change to the `--update` orchestration and request-builder
signatures. Option 2 is the bounded fix that directly removes the rollback risk while keeping
the builder pure and the structural batch atomic.

**Residual risk / human verification:** `runUpdate` is network glue — `index.js` invokes
`main()` at import time, so it cannot be imported under `bun test` without an auth/env-bearing
harness (a refactor beyond this fix's scope). The review asked for "a test that simulates the
API rejecting an out-of-range delete"; that simulation requires a Sheets API mock around
`runUpdate`, which the project does not currently have. The unit-testable seam — the request
shape (`dashboardConditionalPreClearRequests`) — IS now covered. The 400-swallow predicate
(`isNoConditionalRuleAtIndexError`) is simple self-contained regex logic but is not
unit-covered. A human should confirm the live `--update` drift path behaves as intended (run
`--update` against a sheet with a UI-deleted PnL/Drift rule and confirm it completes and
re-converges to 3 rules).

## Verification

- Cross-runtime geometry contract intact: `STATUS_START_COL` (dashboardSheet.js) = 11 and
  `STATUS_LASTUPDATED_COL` (Refresh.ts) = 12 are unchanged (the WR-01 changes never touched
  the status block; the `Refresh.test.ts` assertion `STATUS_LASTUPDATED_COL === 12` passes).
- Idempotency preserved: no new range write/clear was added to `runUpdate`; the DCA Log data
  region is still never addressed. The WR-01 change only relocates the conditional-format
  deletes (which target the Dashboard tab's rules, not any data region) into a separate batch.
- Syntax: `node --check index.js`, `node --check dashboardSheet.js` both pass.
- Full suite: `rtk bun test` → 70 pass / 0 fail.

---

_Fixed: 2026-06-20T05:40:07Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
