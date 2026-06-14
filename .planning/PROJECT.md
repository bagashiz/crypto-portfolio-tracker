# Crypto Portfolio Tracker

## What This Is

A personal Google Sheets crypto portfolio tracker that auto-fetches live prices and on-chain balances for a Hyperliquid wallet and a Solana wallet, computes DCA-weighted cost basis and unrealized PnL from a manual transaction log, and surfaces allocation health (target vs actual, drift, risk, yield). The spreadsheet structure is built and refreshed programmatically — the user never hand-edits the sheet layout, only enters DCA transactions.

## Core Value

See accurate unrealized PnL — live portfolio value measured against DCA-weighted cost basis — for the whole portfolio at a glance, refreshed automatically.

## Requirements

### Validated

<!-- Shipped and confirmed valuable. -->

(None yet — ship to validate. Repo is a fresh `bun init` scaffold; no app code exists.)

### Active

<!-- Current scope. Building toward these. Hypotheses until shipped. -->

- [ ] Layout builder (local Node + `googleapis` service account) creates the Dashboard + DCA Log tabs programmatically with headers, formats, frozen rows, summary rows, and formulas
- [ ] Layout builder `--update` is idempotent — re-applies structure/formats/formulas without ever touching the DCA Log data rows
- [ ] Apps Script fetches Hyperliquid mid prices (`allMids`) via raw `UrlFetchApp`
- [ ] Apps Script fetches Jupiter prices for Solana mints via raw `UrlFetchApp`
- [ ] Apps Script fetches on-chain Solana balances via raw RPC `getTokenAccountsByOwner` (gated behind a `FETCH_BALANCES` flag)
- [ ] Prices/balances written to the sheet on a time-driven trigger (scheduled `refreshAll()`), single batched `setValues` write
- [ ] Single-blob cache (`PRICES_ALL`) with TTL + graceful degradation (per-provider try/catch, `LastUpdated`/`Stale?` status, never overwrite good data with errors)
- [ ] DCA Log tab → DCA-weighted average cost basis per asset (single source of truth)
- [ ] Dashboard shows unrealized P&L in USD and %, color-coded (green/red conditional formatting)
- [ ] Allocation health zone: target %, actual %, drift, risk score, APY, monthly yield
- [ ] Secrets handled correctly: Jupiter API key in GCP Secret Manager; wallet addresses + config in `PropertiesService`; service-account key local-only and gitignored

### Out of Scope

<!-- Explicit boundaries. Includes reasoning to prevent re-adding. -->

- Exponent onRe vault tracking — dropped from scope (no public API; no longer held)
- Realized PnL — deferred to v2; v1 focuses on unrealized PnL
- Custom `=GET_*()` price functions — rejected: recalc unpredictably and can't reliably hold cache; the scheduled trigger is the data writer instead
- Signing / auto-DCA / any private-key handling — hard security boundary; this project is read-only
- SDKs (`gill`, `@nktkas/hyperliquid`, `@jup-ag/api`) — all exchange/chain calls are raw HTTP; no SDKs in either runtime
- Jupiter Portfolio endpoint / multi-protocol position tracking — costs 100 credits/call; raw RPC covers plain SPL balances

## Context

- **Foundation built (Phase 1 complete, 2026-06-14).** The two-runtime skeleton now exists: root Bun workspace, shared `assets.json` registry, `layout-builder/` package (isolated `googleapis`), and `apps-script/` TS toolchain bundling to a flat `dist/Code.js` via `bun build --format=iife` + `clasp push`. A deployed `hello()` was confirmed editor-callable. Substance originally came from a pre-GSD `PLAN.md` build spec (now absorbed into these planning docs) and a prior-session memory.
- **This merges two prior visions:** the `PLAN.md` two-runtime architecture (service-account layout builder + scheduled Apps Script data layer) combined with the PnL-dashboard features from the earlier memory (DCA cost basis, unrealized PnL, color coding, allocation health).
- **Assets tracked:**
  - Hyperliquid wallet: BTC, HYPE, XAUt
  - Solana wallet: IVVon, PST, ONyc, USDy
  - USDC: static $1.00 reserve
- **Reference docs:** Hyperliquid `https://api.hyperliquid.xyz/info` (`allMids`, `spotClearinghouseState`); Jupiter Price v3 `https://api.jup.ag/price/v3?ids={mints}` (key via `x-api-key`); Solana RPC `getTokenAccountsByOwner`.
- **Known open items to confirm during build:** exact Hyperliquid ticker for tokenized gold (`XAUT` vs other); the four Solana mint addresses; Solana RPC endpoint choice (public vs paid); refresh interval (default 5 min). These fail *silently* if wrong.
- **Detailed codebase map** lives in `.planning/codebase/` (ARCHITECTURE, STACK, STRUCTURE, CONCERNS, CONVENTIONS, INTEGRATIONS, TESTING).

## Constraints

- **Tech stack**: Two isolated runtimes, two dependency sets, never mixed — local Node layout builder (`googleapis`) and Google Apps Script V8 data layer (no npm/module resolution). The Google Sheet is the only integration surface between them.
- **Apps Script authoring**: TypeScript in `apps-script/src/`, compiled to flat `dist/`, pushed via `clasp`. Trigger/entry functions (`refreshAll`, `installTrigger`) must compile to top-level globals — no `import`/`export` between source files unless the bundler inlines to one file. Fails only at deploy time.
- **No npm in Apps Script**: all network calls via `UrlFetchApp` against raw HTTP endpoints.
- **Security**: service-account key local-only (gitignored, never pushed); Jupiter API key in Secret Manager; no private keys anywhere; all access read-only.
- **Tooling**: Bun for root project tooling/tests (`bun test`); Node for the layout builder runtime.
- **Idempotency**: layout `--update` must never clear DCA Log data rows — irreversible data-loss risk.

## Key Decisions

<!-- Decisions that constrain future work. -->

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Scheduled time-driven trigger writes data (not custom `=GET_*()` functions) | Custom functions recalc unpredictably and can't reliably hold cache (PLAN.md §5.4) | — Pending |
| Two-runtime architecture (service-account layout builder + clasp Apps Script) | Version-control sheet structure in code; isolate build-time vs run-time | ✓ Established in Phase 1 (both packages scaffolded, deps isolated) |
| Apps Script globals exposed via top-level `function` shims (`appendGlobals.ts`), not runtime `globalThis` assignment alone | `bun build --format=iife` traps declarations in a closure; the editor function picker only discovers static top-level `function` declarations. Runtime `globalThis.x = x` is invisible to the picker. | ✓ Phase 1 — pattern proven; future `refreshAll`/`installTrigger`/`removeTrigger` add one line to the `ENTRY_GLOBALS` array |
| Fresh greenfield build (no existing deployed project to preserve) | Repo is only a scaffold; no live bound script to extend | — Pending |
| Raw HTTP everywhere, no SDKs | Apps Script has no npm runtime; layout builder only talks to Sheets API | — Pending |
| On-chain balance fetch gated behind `FETCH_BALANCES` flag, manual holdings first | Avoid two failure modes (price refresh + RPC) at once; RPC rate limits | — Pending |
| Single source of truth for avg cost (DCA Log summary block) | Don't duplicate SUMIF logic across Dashboard and Log | — Pending |
| Exponent onRe vault removed from scope | No public API and no longer held | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-06-14 after Phase 1 (Foundation) completion*
