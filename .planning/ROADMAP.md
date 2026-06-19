# Roadmap: Crypto Portfolio Tracker

## Overview

Build a two-runtime Google Sheets portfolio tracker from a fresh scaffold. Work proceeds in strict horizontal layers: first the repo foundation and toolchain (both runtimes compilable and deployable), then the layout builder that stamps the spreadsheet structure, then the Apps Script data providers that fetch live prices and balances, then the refresh/caching layer that drives automatic updates, and finally the formula and formatting layer that turns raw data into PnL and allocation health. Each layer depends fully on the one below it; nothing is wired until its foundation exists.

## Phases

**Phase Numbering:**

- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Foundation** - Repo skeleton, gitignore, Apps Script toolchain verified, asset config registry in place (completed 2026-06-14)
- [x] **Phase 2: Layout Builder** - Service-account layout builder creates and idempotently updates Dashboard + DCA Log tabs; LAYOUT-02 data-region safety fixed (DATA_START_ROW pinned to a fixed literal) — verified, UAT-passed, threat-secure (completed 2026-06-16)
- [x] **Phase 3: Data Layer** - Apps Script provider modules (Hyperliquid spot, Jupiter prices + Jupiter Ultra balances) with the Jupiter key and wallet config wired via PropertiesService (completed 2026-06-17)
- [x] **Phase 4: Refresh & Caching** - Time-driven trigger runs batched writes with blob cache and graceful degradation per provider (completed 2026-06-17)
- [ ] **Phase 5: PnL & Allocation** - DCA log, cost-basis summary block, unrealized P&L display with color coding, and allocation health zone
- [ ] **Phase 6: Realized PnL & Sell Log** - SELL transaction handling in the DCA Log and realized PnL per asset (proceeds vs DCA cost basis), separate from Phase 5's BUY-only unrealized PnL

## Phase Details

### Phase 1: Foundation

**Goal**: Both runtimes are scaffolded, secrets are gitignored before any key file is created, the Apps Script toolchain compiles and deploys a trivial function, and asset config exists in one place per runtime
**Depends on**: Nothing (first phase)
**Requirements**: SETUP-01, SETUP-02, CONFIG-01, SEC-03
**Success Criteria** (what must be TRUE):

  1. `layout-builder/` and `apps-script/` directories exist with separate `package.json` files and distinct dependency sets that never overlap
  2. Running `clasp push` deploys a compiled `dist/` and a trivial top-level function (e.g., `hello`) is callable from the Apps Script editor without errors
  3. `.gitignore` covers `*.key.json`, `.clasp.json`, and `apps-script/dist/` — confirmed by `git status` showing those paths as ignored before any key file is written
  4. Adding or removing an asset requires a one-line change in a single config file in each runtime (not scattered across multiple files)**Plans**: 2 plans

**Wave 1**

- [x] 01-PLAN.md — Repo foundation: verify gitignore, root Bun workspace, shared assets.json, layout-builder package

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 02-PLAN.md — Apps Script toolchain: TS source + entry.ts globals, bun build IIFE bundle, clasp deploy + hello() smoke test

### Phase 2: Layout Builder

**Goal**: A user can build and idempotently update the complete spreadsheet structure from the command line without touching DCA Log data rows
**Depends on**: Phase 1
**Requirements**: LAYOUT-01, LAYOUT-02
**Success Criteria** (what must be TRUE):

  1. Running `layout-builder --build` creates the Dashboard tab and DCA Log tab with correct headers, frozen rows, summary rows, and formulas authenticated via the service account
  2. Running `layout-builder --update` re-applies all structural changes (headers, formats, formulas) and leaves existing DCA Log data rows byte-for-byte unchanged
  3. Running `--update` twice in a row produces the same spreadsheet state as running it once (idempotent)

> **Scope note (Phase 2 CONTEXT D-08):** Phase 2 delivers the STATIC skeleton only — tab creation, headers, frozen rows, summary-block labels, number formats, empty cells. All PnL/cost-basis/allocation **formulas** and **conditional formatting** are deferred to Phase 5 (extends the same builder files). SC#1's "...and formulas" is intentionally reinterpreted to skeleton-only for this phase; absent formulas in Phase 2 are not a gap. Idempotency (SC#2, SC#3) applies fully to the structural ranges Phase 2 writes.

**Plans**: 3 plans

**Wave 1**

- [x] 02-01-PLAN.md — Foundation: .env-sourced config, service-account auth client, and pure Dashboard + DCA Log skeleton request-builders with provable data-region safety

**Wave 2** *(depends on 02-01)*

- [x] 02-02-PLAN.md — CLI orchestrator: `--build` (tab-existence guard, never spreadsheets.create) + `--update` (structural-only) dispatch, package.json node --env-file scripts, README

**Wave 3** *(gap closure — depends on 02-01, 02-02)*

- [x] 02-03-PLAN.md — Gap closure (LAYOUT-02): pin DATA_START_ROW to a fixed literal (MAX_SUMMARY_ROWS reservation) so the data-region boundary never floats with the registry; reserve blank summary rows; harden the data-safety test against the hard literal

> Execution waves are read from each plan's frontmatter.

### Phase 3: Data Layer

**Goal**: Apps Script provider modules fetch Hyperliquid spot prices + balances, Jupiter prices, and Solana balances (Jupiter Ultra) via raw UrlFetchApp, with the Jupiter API key and wallet config in PropertiesService; balances are always fetched (no manual-holdings flag)
**Depends on**: Phase 2
**Requirements**: SEC-01, SEC-02, DATA-01, DATA-02, DATA-03 _(manual-holdings requirement descoped — see CONTEXT D-03)_
**Success Criteria** (what must be TRUE):

  1. Calling the Hyperliquid provider module returns **spot** mid prices for all tracked tickers (`UBTC`, `HYPE`, `XAUT0`) as parsed numbers, with no SDK used
  2. Calling the Jupiter provider module returns prices for all tracked Solana mints using the `x-api-key` header sourced from `PropertiesService` (`JUP_API_KEY`), not hardcoded
  3. Wallet addresses and runtime config are readable from `PropertiesService` Script Properties and absent from all source files committed to git
  4. Solana balances are fetched from Jupiter `ultra/v1/balances` and Hyperliquid spot balances from `spotClearinghouseState`, always (no `FETCH_BALANCES` flag); a provider throws if a tracked asset id is absent from its API response (fail-loud, D-10/D-13)

**Plans**: 3 plans

**Wave 1**

- [x] 03-01-PLAN.md — Config foundation: fill assets.json real mints/HL spot tickers (D-04/D-05), add external_request OAuth scope, Properties.ts fail-loud getScriptProp + placeholder setup() (SEC-01/SEC-02)

**Wave 2** *(depends on 03-01)*

- [x] 03-02-PLAN.md — Providers: HyperliquidApi (spot mids via spotMetaAndAssetCtxs + balances) and JupiterApi (price/v3 + ultra/v1/balances) with pure tested parsers enforcing D-09/D-10/D-13 (DATA-01/02/03)

**Wave 3** *(depends on 03-01, 03-02)*

- [x] 03-03-PLAN.md — Wiring + live verify: retain providers in the bundle, expose setup() editor global (D-12), build/grep verify, human-verify checkpoint for live Script-Properties setup + provider smoke test + no-secret-committed gate

### Phase 4: Refresh & Caching

**Goal**: A time-driven trigger automatically refreshes prices and balances on a configurable interval using a single batched write, a blob cache with TTL, and per-provider graceful degradation
**Depends on**: Phase 3
**Requirements**: REFRESH-01, REFRESH-02, REFRESH-03, REFRESH-04
**Success Criteria** (what must be TRUE):

  1. `installTrigger()` creates a time-driven trigger that runs `refreshAll()` at the configured interval; `removeTrigger()` removes it; both are callable from the Apps Script editor
  2. Each `refreshAll()` execution writes all price and balance data to the Dashboard in a single `setValues` call — no cell-by-cell writes
  3. A `PRICES_ALL` cache blob is written after a live fetch and served on the next run within TTL; a cache miss triggers a fresh fetch without error
  4. If one provider (e.g., Jupiter) fails, the Dashboard still shows the last good values for the other providers and `Stale?` / `LastUpdated` status cells reflect the partial failure

**Plans**: 3 plans

**Wave 1**

- [x] 04-01-PLAN.md — Apps Script refresh core: refreshAll() (per-venue degrade + PRICES_ALL last-good blob + single setValues), idempotent installTrigger/removeTrigger, new OAuth scopes, entry-global wiring
- [x] 04-02-PLAN.md — Layout builder: stamp the static 2-line per-venue status block (LastUpdated/Stale?) in fixed top-right columns (D-05/D-06), offline non-collision tests

**Wave 2** *(depends on 04-01, 04-02)*

- [x] 04-03-PLAN.md — Deploy + live-verify checkpoint: clasp push, one-time layout --update, live refresh, induced single-venue degradation + self-heal, trigger idempotency

### Phase 5: PnL & Allocation

**Goal**: Users see accurate unrealized PnL and allocation health in the Dashboard, driven by DCA transaction entries in the DCA Log tab
**Depends on**: Phase 4
**Requirements**: PNL-01, PNL-02, PNL-03, PNL-04, ALLOC-01, ALLOC-02
**Success Criteria** (what must be TRUE):

  1. User can enter a DCA transaction (date, asset, type, price, qty, total, fee, net cost, notes) in the DCA Log tab and it persists across layout `--update` runs
  2. The DCA Log summary block shows total invested, total qty, DCA-weighted average cost, buy count, last buy date, and total fees per asset — and is the only place this computation lives
  3. The Dashboard shows unrealized P&L in USD and % for each asset, calculated as `Value − Qty × AvgCost`, and these values match manual spot-check arithmetic
  4. P&L cells are visually green for gains and red for losses via conditional formatting, visible without any manual formatting step
  5. The allocation zone shows target %, actual %, drift, and risk score per asset, plus a totals row with the target sum and blended risk via `SUMPRODUCT`

> **Scope note (Phase 5 CONTEXT, 2026-06-19):** APY %, per-asset Monthly Yield, and total Monthly Yield were **scratched** from the Dashboard during discussion — SC#5's original "APY, and monthly yield … total monthly yield" wording is intentionally reduced to risk-only allocation health. The `apy` field in `assets.json` is now vestigial (unused by the dashboard), left in place to avoid cross-runtime churn. SELL/realized-PnL handling moved to Phase 6 — Phase 5 cost basis is BUY-only.

**Plans**: 3 plans

**Wave 1**

- [ ] 05-01-PLAN.md — DCA Log BUY-only cost-basis summary formulas (SUMIFS/COUNTIFS/MAXIFS, IFERROR em-dash) + inverted skeleton test, data-region-safe (PNL-01, PNL-02)
- [ ] 05-02-PLAN.md — Dashboard PnL formulas + allocation health (Value=B*C, AvgCost cross-sheet ref, PnL $/%, Actual %/Drift, SUMPRODUCT blended risk) + green/red conditional formatting (idempotent) + status-block relocation to col K + inverted dashboard test (PNL-03, PNL-04, ALLOC-01, ALLOC-02)

**Wave 2** *(depends on 05-02 — must match the chosen STATUS_START_COL)*

- [ ] 05-03-PLAN.md — Apps Script Refresh.ts cross-runtime move: STATUS_LASTUPDATED_COL 10→12 (matches status block at col K) + re-confirm Qty/Price-only write (Value col D excluded, now a formula) + Refresh test assertions (PNL-03)

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation | 2/2 | Complete    | 2026-06-14 |
| 2. Layout Builder | 3/3 | Complete    | 2026-06-16 |
| 3. Data Layer | 3/3 | Complete    | 2026-06-17 |
| 4. Refresh & Caching | 3/3 | Complete    | 2026-06-17 |
| 5. PnL & Allocation | 0/3 | Not started | - |
| 6. Realized PnL & Sell Log | 0/TBD | Not started | - |

### Phase 6: Realized PnL & Sell Log

**Goal:** A user can log SELL transactions in the DCA Log and see realized PnL per asset (sale proceeds vs DCA-weighted cost basis) alongside the existing unrealized PnL, without breaking Phase 5's BUY-only average-cost summary block.
**Requirements**: PNL-05 (promoted from v2)
**Depends on:** Phase 5
**Plans:** 0 plans

> **Scope note:** Phase 5 deliberately scopes cost basis to BUY rows only (Type=BUY filter) — SELL rows are ignored by the avg-cost/unrealized-PnL summary. Phase 6 introduces SELL semantics: realized PnL (proceeds − cost basis of units sold) per asset, and how SELL rows interact with the BUY-only average. Splitting this out keeps Phase 5's irreversible-data-loss-sensitive layout work focused on unrealized PnL.

Plans:

- [ ] TBD (run /gsd-plan-phase 6 to break down)
