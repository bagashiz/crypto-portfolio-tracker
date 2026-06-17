---
phase: 03-data-layer
plan: 03
subsystem: data-layer-integration
tags: [apps-script, bun-build, iife, clasp, editor-globals, d-12, live-verification]

# Dependency graph
requires:
  - phase: 03-data-layer
    plan: 01
    provides: "Properties.ts getScriptProp(), assets.json registry, external_request OAuth scope"
  - phase: 03-data-layer
    plan: 02
    provides: "getHyperliquidData()/getJupiterData() D-09 providers + pure parsers"
provides:
  - "entry.ts wires both providers into the bundle (retained in dist/Code.js, not tree-shaken) via __PROVIDERS__"
  - "testApi() editor-callable global (D-12 __ENTRY__ + appendGlobals + globals.d.ts) — live smoke test of both venues"
  - "Live-verified deployment: HL spot prices + Solana balances/prices return real data; no secret committed"
affects: [04 refreshAll orchestration, 04 cache/sheet-write]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "D-12 editor-global mechanism proven end-to-end (IIFE bundle + top-level delegating shims)"
    - "Editor diagnostic entry point (testApi) calls internal providers in isolated try/catch"

key-files:
  created:
    - apps-script/src/Diagnostics.ts
  modified:
    - apps-script/src/entry.ts
    - apps-script/scripts/appendGlobals.ts
    - apps-script/src/globals.d.ts
    - apps-script/src/Properties.ts
    - apps-script/src/HyperliquidApi.ts
    - apps-script/src/parsers.test.ts

key-decisions:
  - "Replaced setup() with testApi() as the second editor global (user-directed deviation): setup() could only ever seed PLACEHOLDER keys (SEC-02 forbids committing real values) and clobbered manually-set Script Properties on every run. Real config is now set once in Project Settings -> Script Properties (persists across deploys); testApi() is a live smoke test."
  - "HL spot price join fixed: ctxs is NOT positionally aligned with universe (live feed: 636 ctxs vs 307 universe, reordered). Join asset-ctx by pair name == ctx.coin, never array index."

patterns-established:
  - "Editor diagnostic: testApi() runs each provider in its own try/catch and logs the D-09 {price,qty} map (values only, never wallet/key)"
  - "Provider retention: providers stay INTERNAL (__PROVIDERS__), kept in the bundle by reachability without being editor entry points"

requirements-completed: [SEC-01, SEC-02, DATA-01, DATA-02, DATA-03]

# Metrics
duration: ~40min
completed: 2026-06-17
---

# Phase 03 (data-layer) — Plan 03 Summary

**Both venue providers are wired into the deployed bundle and live-verified end-to-end: real Hyperliquid spot prices and Solana balances/prices flow back from the deployed Apps Script editor, with zero secrets committed.**

## Performance

- **Duration:** ~40 min (incl. live human-verify checkpoint + two checkpoint-driven fixes)
- **Completed:** 2026-06-17
- **Tasks:** 2/2 (Task 1 auto; Task 2 human-verify checkpoint approved)
- **Files modified:** 6 (1 created)

## Accomplishments
- `entry.ts` imports both providers (retained in `dist/Code.js`) and exposes `testApi()` as a top-level editor global via the D-12 `__ENTRY__` + `appendGlobals.ts` + `globals.d.ts` mechanism. `bun run build` green; `dist/Code.js` carries `function hello()` and `function testApi()` shims plus `getHyperliquidData`/`getJupiterData` internally.
- Live human-verify checkpoint **passed**: `testApi()` in the deployed editor logged real data — BTC $65,729.50 / HYPE $73.45 / XAUt $4,332.75 with live qtys, and IVVon/PST/ONyc/USDy from Jupiter — proving DATA-01/02/03 end-to-end. SEC-01/SEC-02 confirmed: config lives in Script Properties; secret scan over the committed tree shows only public Solana mints.

## Task Commits

1. **Task 1: Wire providers into bundle + expose editor global (D-12, Pitfall 5)** — `add6ece` (feat)
2. **Checkpoint fix A: HL spot ctxs join by coin==pair.name** — `13cfb2e` (fix)
3. **Checkpoint fix B: replace setup() seeder with testApi() diagnostic** — `382d32d` (feat)

## Files Created/Modified
- `apps-script/src/Diagnostics.ts` (new) — `testApi()` editor diagnostic; runs both providers isolated, logs D-09 maps (values only).
- `apps-script/src/entry.ts` — imports both providers (retention) + `testApi`; `__ENTRY__ = { hello, testApi }`.
- `apps-script/scripts/appendGlobals.ts` — `ENTRY_GLOBALS = ["hello", "testApi"]`.
- `apps-script/src/globals.d.ts` — ambient `var testApi` (replaces `setup`).
- `apps-script/src/Properties.ts` — dropped `setup()`; keeps fail-loud `getScriptProp()` only.
- `apps-script/src/HyperliquidApi.ts` — spot price join by pair name == ctx.coin (was positional `ctxs[pairPos]`).
- `apps-script/src/parsers.test.ts` — HL fixture rewritten (longer/reordered ctxs) so positional reads fail; +2 regression tests.

## Deviations
1. **Rule 3 (blocking) — HL spot price misalignment (fix A, `13cfb2e`).** Live verification surfaced wrong prices (BTC $0.000068, etc.). Root cause: `ctxs` is not positionally aligned with `universe` (636 vs 307, reordered). Fixed by joining on pair `name` == ctx `coin`. Verified live (~$65.7k BTC). Fixture + 2 tests added to lock it in.
2. **Scope deviation — `setup()` removed, `testApi()` added (fix B, `382d32d`).** Plan must-haves named `setup()` as the second editor global. In practice `setup()` could only seed PLACEHOLDER values (SEC-02) and overwrote the user's manually-set Script Properties on each run. Per user direction it was removed; real config is set once in Project Settings → Script Properties. The D-12 editor-global mechanism is unchanged and still proven — `testApi()` is the demonstrated top-level global instead, and adds genuine live-smoke-test value.
3. **Rule 3 (provisioning) — `bun install` in `apps-script/`** to provision already-declared devDeps in the fresh worktree (no new package, no tracked change).

## Self-Check: PASSED
- `bun run build` green; `dist/Code.js` exposes `function hello()` + `function testApi()`; providers retained internally.
- `tsc --noEmit` clean; `bun test` 44/44 pass.
- Live editor run of `testApi()` returns correct real prices/qtys for all 7 tracked ids (DATA-01/02/03).
- Secret scan over committed tree: only public Solana mints present — no wallet address or API key (SEC-01/SEC-02).
