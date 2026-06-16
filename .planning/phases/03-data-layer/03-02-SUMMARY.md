---
phase: 03-data-layer
plan: 02
subsystem: data-providers
tags: [apps-script, urlfetchapp, hyperliquid, jupiter, providers, pure-parsers, tdd]

# Dependency graph
requires:
  - phase: 03-data-layer
    plan: 01
    provides: "Config.ts ASSETS registry (real mints/tickers), Properties.ts getScriptProp(), external_request OAuth scope"
provides:
  - "HyperliquidApi.getHyperliquidData(): D-09 Record<id,{price,qty}> for BTC/HYPE/XAUt from HL spot mids + balances (DATA-01)"
  - "JupiterApi.getJupiterData(): D-09 Record<id,{price,qty}> for IVVon/PST/ONyc/USDy from keyed price/v3 + ultra/v1/balances (DATA-02, DATA-03)"
  - "Exported pure parsers (parseHlSpotMids/parseHlBalances/parseJupPrices/parseJupBalances) — deterministic, bun-testable traversal+fail-loud logic"
affects: [04 refreshAll orchestration (consumes both venue maps), 04 cache/sheet-write]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pure-parser / thin-fetch split: I/O wrappers touch UrlFetchApp; pure parsers take parsed body -> map (Nyquist testability)"
    - "Asymmetric fail-loud: price-absent/malformed/non-200 -> throw (D-10/D-13); balance cleanly-absent -> qty 0 (D-13)"
    - "muteHttpExceptions:true + getResponseCode()!==200 throw on every UrlFetchApp call"
    - "HL spot priced via spotMetaAndAssetCtxs index-aligned midPx (never allMids-by-symbol perp mid)"

key-files:
  created:
    - apps-script/src/HyperliquidApi.ts
    - apps-script/src/JupiterApi.ts
    - apps-script/src/parsers.test.ts
  modified:
    - apps-script/tsconfig.json

key-decisions:
  - "Exclude src/**/*.test.ts from apps-script tsconfig: bun:test files run under Bun, not V8, and are tree-shaken from dist/Code.js — they must not be type-checked against google-apps-script typings"
  - "balances absent-key -> qty 0 (D-13 soften) implemented in both venues; only price-absence and HTTP/parse failures throw"
  - "HL USDC quote token assumed at index 0; spot pair found via universe.findIndex(u.tokens[0]===tokenIdx && u.tokens[1]===0)"

patterns-established:
  - "Provider module = exported pure parsers + private thin fetch wrappers + one exported getXData() D-09 assembler"
  - "TDD per provider: RED commit (failing test, module missing) -> GREEN commit (implementation)"

requirements-completed: [DATA-01, DATA-02, DATA-03]

# Metrics
duration: 12min
completed: 2026-06-16
---

# Phase 3 Plan 02: Data Providers (Hyperliquid + Jupiter) Summary

**Two raw-`UrlFetchApp` provider modules returning the D-09 `Record<id,{price,qty}>` contract — HL spot mids+balances via `spotMetaAndAssetCtxs`/`spotClearinghouseState` and Jupiter prices+Solana balances via keyed `price/v3`/`ultra/v1/balances` — with exported pure parsers TDD-tested for D-09 assembly, D-10 price-throw, and D-13 balance-qty-0/malformed-throw.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-06-16
- **Completed:** 2026-06-16
- **Tasks:** 2 (both TDD: RED + GREEN)
- **Files modified:** 4 (3 created, 1 modified)

## Accomplishments
- `HyperliquidApi.ts` (DATA-01): `getHyperliquidData()` returns `Record<id,{price,qty}>` keyed BTC/HYPE/XAUt. Prices from `spotMetaAndAssetCtxs` (name -> token index -> `[tokenIndex,0]` USDC universe pair -> positionally-aligned `ctxs[pairPos].midPx`); balances from `spotClearinghouseState`. Spot only — never perp `allMids`-by-symbol (Pitfall 1), `UBTC` not perp `BTC`.
- `JupiterApi.ts` (DATA-02, DATA-03): `getJupiterData()` returns `Record<id,{price,qty}>` keyed IVVon/PST/ONyc/USDy. One price call (`price/v3?ids={4 mints}`) + one balances call (`ultra/v1/balances/{wallet}`) over keyed `api.jup.ag` with `x-api-key` (D-06, D-08). Uses `uiAmount` (decimal-adjusted), never raw `amount`; `ultra/v1/balances`, never `portfolio/v1/positions`.
- `parsers.test.ts`: 15 deterministic `bun test` cases over fixture bodies asserting D-09 assembly, D-10 (price-absent / null midPx / no-USDC-pair / non-number usdPrice -> throw), and D-13 (balance cleanly-absent -> qty 0; malformed/non-object/non-array bodies -> throw).
- All parsers guard every indexed access (`noUncheckedIndexedAccess`); full apps-script source type-checks under strict.

## Task Commits

Each task followed the TDD RED -> GREEN gate; committed atomically:

1. **Task 1 RED: failing Hyperliquid parser tests** - `8791a45` (test)
2. **Task 1 GREEN: HyperliquidApi.ts (DATA-01)** - `40c0901` (feat)
3. **Task 2 RED: failing Jupiter parser tests** - `0b6b2f4` (test)
4. **Task 2 GREEN: JupiterApi.ts (DATA-02, DATA-03) + tsconfig exclude** - `2c32fba` (feat)

## Files Created/Modified
- `apps-script/src/HyperliquidApi.ts` - exports `getHyperliquidData`, `parseHlSpotMids`, `parseHlBalances`; private `fetchHlSpotMids`/`fetchHlBalances` thin wrappers.
- `apps-script/src/JupiterApi.ts` - exports `getJupiterData`, `parseJupPrices`, `parseJupBalances`; private `fetchJupPrices`/`fetchJupBalances` thin wrappers.
- `apps-script/src/parsers.test.ts` - 15 `bun:test` cases (8 Hyperliquid + 7 Jupiter) over fixture bodies.
- `apps-script/tsconfig.json` - added `"exclude": ["src/**/*.test.ts"]`.

## Decisions Made
- **Test files excluded from the Apps Script tsconfig.** The plan's verify command runs `tsc --noEmit -p apps-script/tsconfig.json` and demands "TSC OK". Co-located `*.test.ts` (Bun convention) import `bun:test`, unresolvable under the V8 `types:["google-apps-script"]` config. Test files are never reachable from `entry.ts`, so the IIFE bundler tree-shakes them out of `dist/Code.js` — they are pure Bun-runtime artifacts. Excluding them keeps the type-check scoped to deployed source (both providers + Properties + Config) without polluting it with Bun typings. (Deviation Rule 3 — see below.)
- **uiAmount via `Number(entry.uiAmount)`** keeps a single numeric-coercion path consistent with HL's string `total`/`midPx` `Number()` parses, even though Jupiter `uiAmount` is already a number.
- **HL fixture mirrors the verified HYPE @107 / pair `[150,0]` alignment** so the `findIndex` traversal is exercised against realistic positional data rather than a degenerate 1-pair body.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Provisioned apps-script declared dependencies in the fresh worktree**
- **Found during:** Pre-execution setup (needed for the Task 2 typecheck gate).
- **Issue:** The fresh worktree had no `apps-script/node_modules`, so `tsc` would fail `TS2688: Cannot find type definition file for 'google-apps-script'` (same as Plan 01).
- **Fix:** Ran `bun install` inside `apps-script/` — provisions already-declared devDependencies (`@types/google-apps-script`, `@google/clasp`); no new package added.
- **Files modified:** None committed (`apps-script/node_modules` gitignored; lockfile unchanged).
- **Commit:** N/A (no tracked file changed)

**2. [Rule 3 - Blocking] Excluded `src/**/*.test.ts` from apps-script tsconfig**
- **Found during:** Task 2 verify (`tsc --noEmit -p apps-script/tsconfig.json`).
- **Issue:** `tsc` emitted `parsers.test.ts(14,30): error TS2307: Cannot find module 'bun:test'`. The Apps Script tsconfig uses `types:["google-apps-script"]` (V8 runtime, no Bun typings); the Bun-only test file cannot type-check there. Without the fix the plan's "TSC OK" acceptance criterion fails.
- **Fix:** Added `"exclude": ["src/**/*.test.ts"]` to `apps-script/tsconfig.json` with an explanatory comment. Test files run under `bun test` and are tree-shaken from the deployed bundle, so they are correctly outside the V8 type-check surface.
- **Files modified:** `apps-script/tsconfig.json`
- **Commit:** `2c32fba`

---

**Total deviations:** 2 auto-fixed (both blocking — dependency provisioning + test-file type-check scope). No source/scope change to the providers themselves; all plan acceptance criteria met.

## Issues Encountered
- The harness routes file writes through the worktree path (`.claude/worktrees/agent-.../`), not the shared-checkout path; the first `Write` to the shared path was rejected and re-issued against the worktree path. No content change.

## User Setup Required
None for automated verification. Runtime (deployment) still requires the three `setup()` Script Properties to hold real values (set locally, run once, revert) per Plan 01's SEC-02 note. Live-wallet behavior is deferred to the Plan 03 human-verify checkpoint (providers call `UrlFetchApp`/`PropertiesService`, so they cannot run under `bun test`).

## Next Phase Readiness
- Plan 03 can import `getHyperliquidData`/`getJupiterData` into the bundle (Pitfall 5: anything not reachable from `entry.ts` is tree-shaken; Plan 03 wires them via `refreshAll`/`__ENTRY__`).
- Plan 03 grep gate for `x-api-key` leak: providers reference the key only in the `x-api-key` header and in negative-guidance comments — no `Logger.log(apiKey)`.
- No blockers.

## TDD Gate Compliance
Both tasks followed RED -> GREEN. Verified in git log:
- Task 1: `test(03-02)` RED `8791a45` (failed — module missing) -> `feat(03-02)` GREEN `40c0901`.
- Task 2: `test(03-02)` RED `0b6b2f4` (failed — module missing) -> `feat(03-02)` GREEN `2c32fba`.
No REFACTOR commits needed (implementations passed clean on first GREEN). No test passed unexpectedly during RED.

## Threat Surface Scan
No new security-relevant surface beyond the plan's threat model. STRIDE register mitigations implemented:
- T-03-05 (malformed/hostile response): `muteHttpExceptions:true` + non-200 throw in every fetch wrapper; pure parsers narrow body shape and throw on malformed structure before indexing; `Number()` coercion of string fields.
- T-03-06 (wrong instrument priced): HL prices via `spotMetaAndAssetCtxs` index-aligned `midPx`; `UBTC` not perp `BTC`; never `allMids`-by-symbol.
- T-03-07 (JUP_API_KEY leak): key flows only into the `x-api-key` header; no `Logger.log(apiKey)` (grep confirms only comment references).
- T-03-09 (zero-balance staling venue): D-13 implemented — balance absence -> qty 0, only price-absence/HTTP/parse failures throw.
- T-03-SC (npm/bun installs): no packages installed; raw `UrlFetchApp` only.

## Self-Check: PASSED
- FOUND: apps-script/src/HyperliquidApi.ts (exports getHyperliquidData/parseHlSpotMids/parseHlBalances)
- FOUND: apps-script/src/JupiterApi.ts (exports getJupiterData/parseJupPrices/parseJupBalances)
- FOUND: apps-script/src/parsers.test.ts (15 cases, all green)
- FOUND: apps-script/tsconfig.json (excludes test files; TSC OK)
- FOUND commit: 8791a45 (Task 1 RED)
- FOUND commit: 40c0901 (Task 1 GREEN)
- FOUND commit: 0b6b2f4 (Task 2 RED)
- FOUND commit: 2c32fba (Task 2 GREEN)

---
*Phase: 03-data-layer*
*Completed: 2026-06-16*
