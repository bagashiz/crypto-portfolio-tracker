---
phase: 04-refresh-caching
plan: 03
subsystem: infra
tags: [apps-script, clasp, time-driven-trigger, oauth, graceful-degradation, container-bound]

# Dependency graph
requires:
  - phase: 04-refresh-caching (04-01)
    provides: refreshAll() orchestrator, installTrigger()/removeTrigger(), PRICES_ALL last-good blob
  - phase: 04-refresh-caching (04-02)
    provides: static per-venue refresh status labels in the Dashboard layout
provides:
  - Deployed, trigger-driven self-refreshing Dashboard verified against real wallets
  - One installed time-driven refreshAll trigger (~5 min cadence)
  - Live-proven graceful degradation (per-venue Stale?/last-good under induced failure)
  - Container-bound Apps Script deployment (script bound to the live Sheet)
affects: [phase-05, allocation-pnl, dashboard]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Container-bound Apps Script: refreshAll resolves the sheet via SpreadsheetApp.getActiveSpreadsheet()"
    - "clasp push --force in the deploy script (clasp 3.x skips non-interactively when the remote manifest changed)"

key-files:
  created:
    - .planning/phases/04-refresh-caching/04-03-SUMMARY.md
  modified:
    - apps-script/src/Refresh.ts
    - apps-script/.clasp.json

key-decisions:
  - "Switched deployment from a standalone script to a Sheet-bound Apps Script (user decision at live gate) so getActiveSpreadsheet() resolves the container natively — no SPREADSHEET_ID Script Property needed"
  - "Deploy uses clasp push --force; bare clasp push skips when the manifest (new OAuth scopes) changed"

patterns-established:
  - "Live-integration gate: deploy + materialize labels + human-verify against real wallets and a simulated partial failure"

requirements-completed: [REFRESH-01, REFRESH-02, REFRESH-03, REFRESH-04]

# Metrics
duration: ~80min (incl. fix-and-redeploy loop)
completed: 2026-06-17
---

# Phase 04: refresh-caching — Plan 03 Summary

**Deployed the Phase 4 refresh layer to a Sheet-bound Apps Script, installed the 5-minute trigger, and live-verified self-refresh + per-venue graceful degradation against the user's real wallets.**

## Performance

- **Duration:** ~80 min (including a live-gate fix-and-redeploy loop and a standalone→bound deployment switch)
- **Completed:** 2026-06-17T15:00:54Z
- **Tasks:** 2/2
- **Files modified:** 2 source/config (`Refresh.ts`, `.clasp.json`)

## Accomplishments
- Built + pushed the IIFE bundle (`refreshAll`, `installTrigger`, `removeTrigger` + shims) to the live container-bound script via `clasp push --force`.
- Materialized the Plan 02 static status labels in the live Dashboard via `layout-builder --update` (DCA Log data rows untouched).
- Live-verified all four Phase 4 success criteria against real wallets: single batched Zone A Qty/Price write, genuinely-live each run, induced single-venue failure keeps last-good + flags Stale?=TRUE for only that venue and self-heals, and idempotent trigger install/remove.

## Task Commits

1. **Task 1: Build, deploy, materialize status labels** — `da62d45` (docs/STATE; `dist/` is gitignored — deploy pushed `dist/appsscript.json` + `dist/Code.js` to the live script)
2. **Task 2: Live-verify (human-verify checkpoint)** — verified interactively by the user; no code change required beyond the live-gate fixes below.

Live-gate fixes (Task 2 fix-and-redeploy loop):
- `548a1f6` fix(04-01): open Dashboard by SPREADSHEET_ID (first fix for the null active-spreadsheet on the standalone script)
- `f99272d` fix(04-01): revert to getActiveSpreadsheet for the container-bound script (final approach)

## Files Created/Modified
- `apps-script/src/Refresh.ts` — sheet handle resolution (net change: uses `getActiveSpreadsheet()` for the bound script)
- `apps-script/.clasp.json` — `scriptId` repointed to the new Sheet-bound project (gitignored; local only)

## Decisions Made
- **Standalone → container-bound switch.** First live run of `refreshAll` threw `TypeError: Cannot read properties of null (reading 'getSheetByName')` because the original script was standalone (no `parentId` in `.clasp.json`) and `getActiveSpreadsheet()` returns null there. Offered open-by-id (SPREADSHEET_ID Script Property) vs. a Sheet-bound script; user chose bound. Repointed `.clasp.json` to the bound project, reverted to `getActiveSpreadsheet()`, re-pushed. Net source change is minimal.
- **`clasp push --force` required.** Bare `clasp push` (in the package `deploy` script) skips non-interactively when the remote manifest changed (new OAuth scopes). Used `--force`; the `deploy` script should be updated to match (tracked in STATE.md).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Null active spreadsheet on first live run**
- **Found during:** Task 2 (live human-verify)
- **Issue:** `refreshAll` threw a null `getSheetByName` error — the deployed script was standalone, so `getActiveSpreadsheet()` was null.
- **Fix:** Switched the deployment to a Sheet-bound script (user decision); `getActiveSpreadsheet()` now resolves the container. (Intermediate openById fix `548a1f6` reverted by `f99272d`.)
- **Files modified:** `apps-script/src/Refresh.ts`, `apps-script/.clasp.json`
- **Verification:** Re-run of `refreshAll` populated Zone A and status cells; all five live checks passed.
- **Committed in:** `548a1f6`, `f99272d`

---

**Total deviations:** 1 blocking (resolved via deployment-model switch)
**Impact on plan:** Necessary for the live integration to function. No scope creep — the runtime logic from 04-01/04-02 was unchanged; only the sheet-handle resolution and deploy target changed.

## Issues Encountered
- Bare `clasp push` skipped silently (clasp 3.x manifest-change prompt) — resolved with `--force`.
- OAuth consent screen shows "Untitled project" (cosmetic): the default GCP consent name is snapshotted at first provisioning; renaming the script afterward doesn't rewrite it. No functional impact.

## User Setup Required
The bound Apps Script project needs three Script Properties set (do not carry over from the old standalone project): `HL_WALLET_ADDRESS`, `SOL_WALLET_ADDRESS`, `JUP_API_KEY`. No `SPREADSHEET_ID` (bound) and no GCP/Secret Manager linkage (the Jupiter key is read directly as a Script Property). The 5-minute `refreshAll` trigger is installed and the script is authorized.

## Next Phase Readiness
- Dashboard now self-refreshes live (Zone A Qty/Price + per-venue status) on a 5-minute trigger — the foundation Phase 5 (allocation / PnL) builds on.
- Follow-up: update `apps-script/package.json` `deploy` script to `clasp push --force`.

---
*Phase: 04-refresh-caching*
*Completed: 2026-06-17*
