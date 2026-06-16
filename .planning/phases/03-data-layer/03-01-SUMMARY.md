---
phase: 03-data-layer
plan: 01
subsystem: infra
tags: [apps-script, oauth, properties-service, config, secrets, assets-registry]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: "apps-script TS toolchain (bun build --format=iife), shared assets.json registry, Config.ts Asset interface"
provides:
  - "assets.json with verified Solana mints (D-04) and HL spot tickers UBTC/HYPE/XAUT0 (D-05) — no placeholders"
  - "appsscript.json script.external_request OAuth scope (UrlFetchApp prerequisite for Plan 02)"
  - "Properties.ts: fail-loud getScriptProp(name) reader + placeholder-only setup() helper"
affects: [03-02 providers (HyperliquidApi/JupiterApi read ASSETS + getScriptProp), 04 sheet-writes]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Fail-loud config read: getScriptProp throws on null/empty (never silent default)"
    - "Placeholder-only secret seeding: setup() ships fake literals; real values set locally then reverted (SEC-02)"
    - "Minimal OAuth scope: only the capability the phase needs (external_request), nothing broader"

key-files:
  created:
    - apps-script/src/Properties.ts
  modified:
    - assets.json
    - apps-script/appsscript.json

key-decisions:
  - "BTC ticker is UBTC (bridged Unit BTC spot token), not the perp BTC instrument (D-05)"
  - "XAUt maps to HL spot ticker XAUT0 (token index 297) (D-05)"
  - "Only script.external_request scope this phase; cloud-platform/spreadsheets/scriptapp deferred to Phase 4"

patterns-established:
  - "Fail-loud Script Property reader: missing/empty -> throw, preventing null x-api-key 401 loops (Pitfall 4)"
  - "setup() seeds PLACEHOLDER literals only; no real secret ever committed (SEC-02)"

requirements-completed: [SEC-01, SEC-02]

# Metrics
duration: 8min
completed: 2026-06-16
---

# Phase 3 Plan 01: Config + Secrets Foundation Summary

**Verified asset registry (real Solana mints + HL spot tickers UBTC/HYPE/XAUT0), the single external_request OAuth scope, and a fail-loud getScriptProp() + placeholder-only setup() in Properties.ts — zero network code.**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-06-16
- **Completed:** 2026-06-16
- **Tasks:** 3
- **Files modified:** 3 (1 created, 2 modified)

## Accomplishments
- `assets.json` filled with the four verified Solana mints (D-04) and real HL spot tickers UBTC/HYPE/XAUT0 (D-05); zero PLACEHOLDER strings remain; 7-element array shape unchanged.
- `appsscript.json` grants exactly one OAuth scope — `script.external_request` — the hard blocking prerequisite for any `UrlFetchApp` call in Plan 02; no over-broad scope present.
- `Properties.ts` created with a fail-loud `getScriptProp(name)` (throws on null/empty) and a `setup()` that seeds the three runtime keys with PLACEHOLDER literals only.

## Task Commits

Each task was committed atomically:

1. **Task 1: Fill assets.json with verified mints and HL spot tickers** - `f3b1e68` (feat)
2. **Task 2: Add external_request OAuth scope to appsscript.json** - `79881e3` (feat)
3. **Task 3: Create Properties.ts — fail-loud getScriptProp + placeholder setup** - `c8e0b24` (feat)

## Files Created/Modified
- `assets.json` - BTC ticker -> UBTC, XAUt ticker -> XAUT0, four real Solana mints (IVVon/PST/ONyc/USDy); HYPE unchanged.
- `apps-script/appsscript.json` - `oauthScopes` `[]` -> `["https://www.googleapis.com/auth/script.external_request"]`.
- `apps-script/src/Properties.ts` - `getScriptProp(name): string` (fail-loud) and `setup(): void` (placeholder seeding) named exports; no property value is ever logged.

## Decisions Made
- Used computed-key object literal in `setup()` (`[HL_WALLET_ADDRESS]: ...`) with the key names as local consts so the three key strings appear exactly once — keeps key spelling a single source of truth.
- `getScriptProp` guards both `null` and `""` explicitly to satisfy Pitfall 4 (a null property silently flowing into an `x-api-key` header would produce a 401 loop).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Installed apps-script declared dependencies in the fresh worktree**
- **Found during:** Task 3 (Properties.ts typecheck)
- **Issue:** `bunx tsc --noEmit` failed with `TS2688: Cannot find type definition file for 'google-apps-script'` because the fresh worktree had no `apps-script/node_modules` — the already-declared `@types/google-apps-script` devDependency was not provisioned.
- **Fix:** Ran `bun install` inside `apps-script/` to provision the already-declared dependencies (no new package added; install of existing declared deps, not a new-package install).
- **Files modified:** None committed (`apps-script/node_modules` is gitignored; lockfile unchanged).
- **Verification:** `bunx tsc --noEmit -p apps-script/tsconfig.json` then printed `TSC OK`.
- **Committed in:** N/A (no tracked file changed)

---

**Total deviations:** 1 auto-fixed (1 blocking — dependency provisioning)
**Impact on plan:** Necessary to run the Task 3 typecheck gate in an isolated worktree. No source/scope change. All plan acceptance criteria met.

## Issues Encountered
- Initial verification `cd apps-script && ... grep apps-script/src/Properties.ts` used a path relative to the wrong cwd; re-ran the grep gate from the worktree root and it passed (`no real secret literals`). No source change required.

## User Setup Required
None for this plan's automated verification. Note for runtime (Plan 02+ / deployment): the user must edit the three `setup()` literals to real values LOCALLY, run `setup()` ONCE from the Apps Script editor, then revert — real wallet addresses + Jupiter key must never be committed (SEC-02).

## Next Phase Readiness
- Plan 02 (providers) can read `ASSETS` real values via `Config.ts` and `getScriptProp("JUP_API_KEY" | "HL_WALLET_ADDRESS" | "SOL_WALLET_ADDRESS")`.
- `UrlFetchApp` outbound capability is unlocked by the `external_request` scope.
- No blockers.

## Threat Surface Scan
No new security-relevant surface beyond the plan's threat model. All STRIDE register mitigations (T-03-01 placeholder-only literals + grep gate, T-03-02 no value logging, T-03-03 minimal scope, T-03-04 fail-loud read) are implemented.

## Self-Check: PASSED
- FOUND: assets.json (no PLACEHOLDER, 7 assets)
- FOUND: apps-script/appsscript.json (single external_request scope)
- FOUND: apps-script/src/Properties.ts (tsc OK, secret gate clean)
- FOUND commit: f3b1e68 (Task 1)
- FOUND commit: 79881e3 (Task 2)
- FOUND commit: c8e0b24 (Task 3)

---
*Phase: 03-data-layer*
*Completed: 2026-06-16*
