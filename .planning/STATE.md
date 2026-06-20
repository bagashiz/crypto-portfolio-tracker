---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: executing
stopped_at: Phase 6 context gathered
last_updated: "2026-06-20T10:45:26.073Z"
last_activity: 2026-06-20 -- Phase 06 planning complete
progress:
  total_phases: 6
  completed_phases: 5
  total_plans: 14
  completed_plans: 14
  percent: 83
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-06-13)

**Core value:** See accurate unrealized PnL — live portfolio value measured against DCA-weighted cost basis — for the whole portfolio at a glance, refreshed automatically.
**Current focus:** Phase 05 — pnl-allocation

## Current Position

Phase: 06
Plan: Not started
Status: Ready to execute
Last activity: 2026-06-20 -- Phase 06 planning complete

Progress: [░░░░░░░░░░] 0%

## Performance Metrics

**Velocity:**

- Total plans completed: 14
- Average duration: -
- Total execution time: 0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01 | 2 | - | - |
| 02 | 3 | - | - |
| 03 | 3 | - | - |
| 04 | 3 | - | - |
| 05 | 3 | - | - |

**Recent Trend:**

- Last 5 plans: (none yet)
- Trend: -

*Updated after each plan completion*
| Phase 01 P01 | 5min | 2 tasks | 7 files |
| Phase 01 P02 | multi-session | 3 tasks | 8 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Pre-roadmap: Two-runtime architecture (layout-builder Node + Apps Script clasp) — never mix dependency sets
- Pre-roadmap: Raw HTTP everywhere; no SDKs in either runtime
- Pre-roadmap: Scheduled trigger writes data (not custom sheet functions)
- Pre-roadmap: FETCH_BALANCES flag gates Solana RPC to avoid two failure modes at once
- [Phase ?]: Single shared assets.json at repo root is the one source of truth (D-04), not two per-runtime configs
- [Phase ?]: assets.json uses placeholder mint/XAUt-ticker strings; exact values are a Phase 3 blocker (D-07)
- [Phase ?]: Apps Script editor function picker discovers functions via STATIC top-level function declarations only — expose globals via entry.ts __ENTRY__ namespace + post-build top-level shims (appendGlobals.ts), not runtime globalThis assignment (D-03 refinement)

### Pending Todos

None yet.

### Roadmap Evolution

- Phase 6 added: Realized PnL & Sell Log (SELL transactions + realized PnL per asset); splits SELL semantics out of Phase 5's BUY-only unrealized PnL; promotes PNL-05 from v2 (2026-06-19, during Phase 5 discussion)

### Blockers/Concerns

- Phase 3 blocker (pre-build): Four Solana mint addresses (IVVon, PST, ONyc, USDy) and exact Hyperliquid XAUt ticker are unconfirmed — fail silently if wrong. Confirm before implementing provider modules.
- Phase 3 blocker (pre-build): Solana RPC endpoint choice (public vs paid) unconfirmed — public endpoint will rate-limit at 5-min refresh.

## Deferred Items

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| PnL | Realized PnL (PNL-05) | Promoted to v1 → Phase 6 (2026-06-19) | Roadmap init |
| DCA Log | Data-validation dropdowns (PNL-06) | v2 | Roadmap init |

## Session Continuity

Last session: 2026-06-20T10:25:45.301Z
Stopped at: Phase 6 context gathered
Resume file: .planning/phases/06-realized-pnl-and-sell-log/06-CONTEXT.md

### Note (04-03 Task 1 deviation)

The package `deploy` script runs bare `clasp push`, but clasp 3.3.0 prompts before
overwriting a changed remote manifest and silently "Skipping push." when non-interactive.
The new OAuth scopes changed appsscript.json, so the push required `clasp push --force`.
Task 1 was completed with `bunx clasp push --force` (pushed dist/Code.js + dist/appsscript.json).
Consider updating apps-script/package.json `deploy` to `clasp push --force`.
