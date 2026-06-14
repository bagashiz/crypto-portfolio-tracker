---
phase: 01-foundation
plan: 02
subsystem: apps-script-toolchain
tags: [apps-script, clasp, bun-build, iife, globalThis, editor-picker, assets-inlining]

# Dependency graph
requires:
  - Root Bun workspace covering layout-builder and apps-script (Plan 01, D-08)
  - Single shared assets.json registry (Plan 01, D-04/D-07)
provides:
  - Apps Script TypeScript toolchain bundling src/ to flat dist/Code.js via bun build --format=iife (D-02)
  - Established pattern for exposing editor-callable Apps Script globals (entry.ts __ENTRY__ namespace + appendGlobals.ts top-level shims)
  - Deployed, editor-callable hello() smoke test proving the Phase-1 primary-risk bundling/deploy pipeline (SETUP-02)
  - Config.ts sourcing the inlined shared assets.json (CONFIG-01, D-05)
affects: [provider-modules, refresh-orchestration, trigger-install]

# Tech tracking
tech-stack:
  added: ["@google/clasp (declared)", "@types/google-apps-script (declared)"]
  patterns:
    - "bun build --format=iife bundles all import/export source into one flat dist/Code.js"
    - "Editor-callable globals via post-build top-level function shims that delegate to a namespaced runtime global (__ENTRY__)"
    - "Per-package dependency isolation: apps-script declares clasp/typings only, never googleapis"
    - "Shared assets.json inlined at build time — no Apps Script runtime file dependency"

key-files:
  created:
    - apps-script/package.json
    - apps-script/tsconfig.json
    - apps-script/appsscript.json
    - apps-script/README.md
    - apps-script/src/Config.ts
    - apps-script/src/Hello.ts
    - apps-script/src/entry.ts
    - apps-script/scripts/appendGlobals.ts
  modified: []

key-decisions:
  - "Apps Script editor function picker discovers functions by STATIC analysis of top-level `function name()` declarations ONLY — it does not see runtime globalThis assignments. D-03's bare-globalThis mechanism is necessary but NOT sufficient."
  - "Established pattern: entry.ts exposes implementations on globalThis.__ENTRY__ inside the IIFE; a committed post-build footer (appendGlobals.ts) appends top-level `function name() { return globalThis.__ENTRY__.name.apply(this, arguments); }` shims OUTSIDE the IIFE so the editor picker discovers them. Driven by a single name array → one-line change to add a global."
  - "Minimal/empty oauthScopes in Phase 1 — hello() touches no scope-gated API (D-11/D-12); scopes deferred to Phase 3 (least privilege, T-01-04)."

patterns-established:
  - "Editor-callable Apps Script global = __ENTRY__ namespace assignment (entry.ts) + top-level shim (appendGlobals.ts); future refreshAll/installTrigger/removeTrigger follow this same one-line pattern"
  - "Build script: `bun build src/entry.ts --format=iife --outfile=dist/Code.js && bun scripts/appendGlobals.ts`"
  - "Deploy script: build → `cp appsscript.json dist/appsscript.json` → `clasp push`"

requirements-completed: [SETUP-02, CONFIG-01]

# Metrics
duration: ~multi-session (checkpoint-gated)
completed: 2026-06-14
---

# Phase 1 Plan 02: Apps Script Toolchain Summary

**Apps Script TypeScript toolchain that bundles import/export source into one flat `dist/Code.js` via `bun build --format=iife`, inlines the shared `assets.json`, and exposes a deployed, editor-callable `hello()` global — proving (and refining) the Phase-1 primary-risk bundling/deploy pattern.**

## Performance

- **Tasks:** 3 (2 auto + 1 blocking human-verify checkpoint)
- **Files created:** 8

## Accomplishments

- **Task 1** — Authored the `apps-script/` package: `package.json` (isolated `@google/clasp` + `@types/google-apps-script`, NO `googleapis`; `build` and `deploy` scripts), `tsconfig.json` (strict, google-apps-script types, JSON-import support), minimal `appsscript.json` (V8, empty scopes), `README.md`, and source modules `Hello.ts` (pure `Logger.log` smoke test, no scope-gated API), `Config.ts` (imports shared `../../assets.json`, CONFIG-01/D-05), and `entry.ts` (single IIFE build entry).
- **Task 2** — Linked the Bun workspace (`bun install`), built the IIFE bundle, and asserted locally that `dist/Code.js` is one flat file containing the exposed `hello` global and inlined assets (`BTC`/`HYPE`), with `dist/Code.js` gitignored (T-01-03).
- **Task 3 (human-verify, blocking)** — Human ran `clasp push` and confirmed in the Apps Script editor that `hello` is a selectable top-level function, runs cleanly with NO authorization prompt and NO error, and logs its string via `Logger.log` (SETUP-02, D-03, D-11, D-12). User response: "approved".

## Task Commits

Each task was committed atomically:

1. **Task 1: Author Apps Script package, source modules, and entry.ts wiring** — `0c93cb4` (feat)
2. **Task 2: Link workspace, prove IIFE bundle exposes globals + inlining** — `2aea9b4` (build)
3. **Task 3 fix: Expose Apps Script globals via top-level function shims (editor picker)** — `56e3533` (fix)

## Files Created

- `apps-script/package.json` — isolated clasp/typings deps; `build` (`bun build … --format=iife && bun scripts/appendGlobals.ts`) and `deploy` (build → copy manifest → `clasp push`) scripts
- `apps-script/tsconfig.json` — strict TS config with `google-apps-script` types + JSON-import support
- `apps-script/appsscript.json` — minimal V8 manifest, empty `oauthScopes` (deferred to Phase 3)
- `apps-script/README.md` — build/deploy flow, the `entry.ts` → editor-callable-globals pattern, one-time clasp auth note
- `apps-script/src/Hello.ts` — `hello()` smoke test (`Logger.log` only, no scope-gated API)
- `apps-script/src/Config.ts` — imports shared `../../assets.json`, exposes `ASSETS` registry + interval/TTL constants
- `apps-script/src/entry.ts` — single IIFE build entry; exposes `__ENTRY__.hello`, `globalThis.hello`, `globalThis.ASSETS`
- `apps-script/scripts/appendGlobals.ts` — committed post-build footer that appends top-level `function` shims for editor-picker discovery

## Decisions Made

- **Minimal oauthScopes** in Phase 1 — `hello()` calls no scope-gated API, so the manifest ships empty scopes; full scopes land in Phase 3 with the first real API call (least privilege, T-01-04).
- **`assets.json` inlined at build time** (D-05) — Apps Script has no runtime file dependency; verified by grepping inlined asset ids (`BTC`/`HYPE`) in `dist/Code.js`.
- See the critical finding below for the central decision of this plan.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] D-03 bare-`globalThis` mechanism does not make functions editor-callable**

- **Found during:** Task 3 (deploy + editor smoke test — the Phase-1 primary-risk check)
- **Issue:** The plan's D-02/D-03 mechanism — "assign trigger functions to `globalThis` inside the IIFE" — is **necessary but NOT sufficient**. Apps Script's editor function picker discovers functions via **STATIC analysis of top-level `function name()` declarations only**; it does **not** see runtime `globalThis.x = x` assignments. Because `bun build --format=iife` wraps every declaration inside a `(() => { … })()` closure, the bundle alone exposed no top-level `function hello()`. The first deploy showed **"No functions"** in the editor — the exact failure this phase exists to catch.
- **Fix (now the established pattern for all future trigger entry points — `refreshAll` / `installTrigger` / `removeTrigger`):** `entry.ts` exposes the live implementations on a single namespaced global `globalThis.__ENTRY__ = { … }` inside the IIFE; a committed post-build footer step (`apps-script/scripts/appendGlobals.ts`) appends real **top-level** `function name() { return globalThis.__ENTRY__.name.apply(this, arguments); }` shims **outside** the IIFE so the editor picker discovers them statically and they delegate to the bundled implementations at runtime. The footer is driven by a single name array (`ENTRY_GLOBALS`) → adding a new global is a one-line change in both `entry.ts` and `appendGlobals.ts`. Build script updated to `bun build src/entry.ts --format=iife --outfile=dist/Code.js && bun scripts/appendGlobals.ts`.
- **Why it still satisfies the requirement:** This refines the *literal mechanism* of D-03 while fully satisfying its *intent* and SETUP-02 — the deployed bundle exposes callable Apps Script globals. The `globalThis.hello` assignment is retained (harmless, preserves the D-03 contract); the top-level shim is what makes it selectable.
- **Files modified:** `apps-script/src/entry.ts`, `apps-script/scripts/appendGlobals.ts`, `apps-script/package.json`
- **Commit:** `56e3533`

**Future phases inherit this pattern:** any new trigger/entry global (`refreshAll`, `installTrigger`, `removeTrigger`) must be added to BOTH the `__ENTRY__` object in `entry.ts` AND the `ENTRY_GLOBALS` array in `appendGlobals.ts`. Runtime `globalThis` assignment alone will NOT make a function editor-callable.

## Authentication Gates

- **Task 3 (clasp auth):** One-time interactive Google auth (`clasp login`) + script-ID provisioning was a human step in the blocking human-verify checkpoint (T-01-05, accept). Credentials are handled by clasp/Google and never stored in the repo; the generated `.clasp.json` is gitignored (verified — `git check-ignore apps-script/.clasp.json` exits 0). This is normal flow, not a failure.

## Issues Encountered

The "No functions" editor failure on first deploy (see Deviations). Resolved by the top-level-shim pattern; re-deployed and human-verified as passing.

## User Setup Required

- One-time clasp auth (`clasp login`) and script-ID provisioning (`clasp create`/`clasp clone`) — completed during the Task 3 checkpoint. `.clasp.json` remains local-only/gitignored.

## Next Phase Readiness

- The bundling/deploy pipeline (`bun build --format=iife` → `appendGlobals.ts` shims → `clasp push`) is proven end-to-end. Phases 3-5 can add `refreshAll` / `installTrigger` / `removeTrigger` and provider modules on top of it.
- **Carried-forward blocker (unchanged):** exact Solana mint addresses (IVVon/PST/ONyc/USDy) and the Hyperliquid XAUt ticker remain placeholder strings in `assets.json` — must be confirmed before Phase 3 provider modules.
- **Carried-forward blocker (unchanged):** Solana RPC endpoint choice (public vs paid) unconfirmed — public will rate-limit at 5-min refresh.

## Known Stubs

| File | Detail | Reason / Resolution |
|------|--------|---------------------|
| `apps-script/src/entry.ts` | TODO placeholders for `refreshAll` / `installTrigger` / `removeTrigger` (commented) | Intentional — only `hello()` is live this phase; trigger entry points land in Phases 3-4 following the established `__ENTRY__` + shim pattern. |
| `apps-script/src/Config.ts` | `REFRESH_INTERVAL_MINUTES` / `CACHE_TTL_SECONDS` placeholder constants | Intentional — tuned when refresh/cache logic is implemented (Phase 3+). |
| `apps-script/appsscript.json` | empty `oauthScopes` | Intentional (D-11/D-12, least privilege) — real scopes added in Phase 3 with the first scope-gated API call. |

These stubs do not block the plan goal (proving the toolchain + editor-callable `hello()`); each is deferred to a named later phase.

## Self-Check: PASSED

All 8 created files verified present on disk (`apps-script/{package.json,tsconfig.json,appsscript.json,README.md,scripts/appendGlobals.ts,src/{Config.ts,Hello.ts,entry.ts}}`). All three task commits present in git log (`0c93cb4`, `2aea9b4`, `56e3533`). Build output `dist/Code.js` confirmed to contain the appended top-level `function hello()` shim and is gitignored. Task 3 (deploy + editor-callable `hello()`) verified by the human ("approved").

---
*Phase: 01-foundation*
*Completed: 2026-06-14*
