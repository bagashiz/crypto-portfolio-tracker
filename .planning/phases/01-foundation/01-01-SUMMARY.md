---
phase: 01-foundation
plan: 01
subsystem: infra
tags: [bun-workspace, monorepo, gitignore, assets-registry, googleapis, esm]

# Dependency graph
requires: []
provides:
  - Root Bun workspace covering layout-builder and apps-script (D-08)
  - Single shared assets.json registry (single source of truth, D-04/D-07)
  - layout-builder package scaffold with isolated googleapis dependency (D-09)
  - layout-builder/src/config.js importing the shared registry as ESM (D-05)
  - Verified SEC-03 gitignore coverage before any key file exists (D-13)
affects: [apps-script-toolchain, layout-builder-cli, provider-modules]

# Tech tracking
tech-stack:
  added: [googleapis (declared, not installed)]
  patterns:
    - "Bun workspace monorepo with delegating root scripts"
    - "Single shared build-time assets.json consumed by both runtimes via ESM import"
    - "Per-package npm dependency isolation (never mixed dependency sets)"

key-files:
  created:
    - assets.json
    - layout-builder/package.json
    - layout-builder/src/config.js
    - layout-builder/README.md
  modified:
    - package.json
    - README.md
    - index.ts (deleted — throwaway bun init scaffold)

key-decisions:
  - "Single shared assets.json at repo root is the one source of truth, not two per-runtime configs (D-04)"
  - "assets.json uses placeholder mint/XAUt ticker strings — exact values are a Phase 3 blocker; Phase 1 establishes shape only (D-07)"
  - "Removed throwaway index.ts and dropped the package.json module field (not load-bearing)"
  - ".gitignore NOT rewritten — existing broad patterns already satisfy SEC-03; verified via git check-ignore (D-13)"

patterns-established:
  - "Bun workspace: root package.json declares workspaces + delegating --filter scripts"
  - "Shared registry: assets.json imported via ESM `with { type: json }`, re-exported from config.js, never duplicated"
  - "Dependency isolation: layout-builder declares googleapis only; no apps-script deps leak in"

requirements-completed: [SETUP-01, CONFIG-01, SEC-03]

# Metrics
duration: ~5min
completed: 2026-06-14
---

# Phase 1 Plan 01: Foundation Summary

**Two-runtime Bun workspace skeleton with a single shared assets.json registry, an isolated-googleapis layout-builder package, and SEC-03 gitignore coverage verified before any key file exists.**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-06-14T05:25:23Z
- **Completed:** 2026-06-14T05:30:35Z
- **Tasks:** 2
- **Files modified:** 7 (4 created, 2 modified, 1 deleted)

## Accomplishments
- Verified SEC-03 / D-13: `*.key.json`, `.clasp.json`, `apps-script/dist/`, and `service-account.key.json` all ignored via `git check-ignore` BEFORE any key file is created — `.gitignore` was NOT rewritten (existing broad patterns suffice).
- Stood up the root Bun workspace (D-08): `workspaces: ["layout-builder", "apps-script"]` plus delegating `deploy` / `build:apps-script` scripts.
- Created `assets.json` (D-04/D-07): a 7-asset registry (BTC/HYPE/XAUt on hyperliquid, IVVon/PST/ONyc/USDy on solana) with placeholder mint/XAUt-ticker strings (Phase 3 blocker respected — no invented real addresses).
- Scaffolded the `layout-builder/` package (SETUP-01/D-09): isolated `googleapis` dependency, ESM `config.js` importing the shared `assets.json` and re-exporting the list plus `SPREADSHEET_ID` placeholder and `DASHBOARD`/`DCA_LOG` constants, and a per-runtime README.

## Task Commits

Each task was committed atomically:

1. **Task 1: Verify gitignore + root workspace + shared assets.json** - `a626b81` (feat)
2. **Task 2: Scaffold layout-builder package consuming shared assets.json** - `afe2f8b` (feat)

## Files Created/Modified
- `assets.json` - Single shared asset registry (7 assets, D-07 schema: id/venue/ticker|mint/target/risk/apy)
- `package.json` - Root Bun workspace + delegating deploy/build:apps-script scripts; removed `module` field
- `README.md` - Two-runtime layout, shared registry, D-06 boundary note
- `layout-builder/package.json` - Workspace member, type:module, googleapis-only dependency
- `layout-builder/src/config.js` - ESM import of root assets.json, re-export + SPREADSHEET_ID/DASHBOARD/DCA_LOG constants
- `layout-builder/README.md` - Local-only runtime + gitignored service-account key (SETUP-01)
- `index.ts` - Deleted (throwaway bun init hello-world, not load-bearing)

## Decisions Made
- Single shared `assets.json` is the one source of truth (not two per-runtime configs) — drift removed rather than guarded against (D-04).
- Placeholder strings for solana mints (`PLACEHOLDER_MINT_phase3`) and XAUt ticker (`PLACEHOLDER_TICKER_phase3`) — exact values unconfirmed, Phase 3 blocker; only the shape is established (D-07).
- `.gitignore` left untouched; existing broad `dist` + secret patterns verified sufficient via `git check-ignore` (D-13).
- Removed throwaway `index.ts` and its `module` reference in `package.json` (CONTEXT confirmed not load-bearing).
- `googleapis` declared but not installed — install/linking deferred to Plan 02 verification (per threat register T-01-SC).

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None. Both tasks' automated verification passed on first run. An additional runtime check confirmed `config.js` imports the 7-asset registry and exports the expected constants.

## User Setup Required
None - no external service configuration required this plan. (Service-account key, spreadsheet ID, and clasp auth land in later phases.)

## Next Phase Readiness
- Plan 02 (Apps Script toolchain) can build on the established workspace, shared `assets.json`, and isolated-deps pattern.
- Carried-forward blocker (unchanged): exact Solana mint addresses (IVVon/PST/ONyc/USDy) and the Hyperliquid XAUt ticker remain UNCONFIRMED — they are placeholder strings in `assets.json` and must be confirmed before Phase 3 provider modules are implemented.

## Known Stubs

| File | Detail | Reason / Resolution |
|------|--------|---------------------|
| `assets.json` | `mint: "PLACEHOLDER_MINT_phase3"` (4 solana entries), `ticker: "PLACEHOLDER_TICKER_phase3"` (XAUt) | Intentional per D-07 — exact values are a Phase 3 blocker. Phase 1 establishes shape only. Resolved when provider modules are wired (Phase 3). |
| `layout-builder/src/config.js` | `SPREADSHEET_ID = "PLACEHOLDER_SPREADSHEET_ID"` | Intentional — real spreadsheet ID provided in a later phase before `--build`/`--update` runs (Phase 2). |
| `layout-builder/package.json` | `build`/`update` scripts echo "not implemented" | Intentional — real CLI implemented in Phase 2 (D documented in plan action). |

These stubs do not block the plan goal (structural skeleton + single-source registry); each is explicitly deferred to a named later phase.

## Self-Check: PASSED

All created files verified present (assets.json, package.json, README.md, layout-builder/{package.json,src/config.js,README.md}, SUMMARY.md); index.ts confirmed deleted; both task commits (a626b81, afe2f8b) present in git log.

---
*Phase: 01-foundation*
*Completed: 2026-06-14*
