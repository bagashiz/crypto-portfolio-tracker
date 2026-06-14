# Roadmap: Crypto Portfolio Tracker

## Overview

Build a two-runtime Google Sheets portfolio tracker from a fresh scaffold. Work proceeds in strict horizontal layers: first the repo foundation and toolchain (both runtimes compilable and deployable), then the layout builder that stamps the spreadsheet structure, then the Apps Script data providers that fetch live prices and balances, then the refresh/caching layer that drives automatic updates, and finally the formula and formatting layer that turns raw data into PnL and allocation health. Each layer depends fully on the one below it; nothing is wired until its foundation exists.

## Phases

**Phase Numbering:**

- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Foundation** - Repo skeleton, gitignore, Apps Script toolchain verified, asset config registry in place (completed 2026-06-14)
- [x] **Phase 2: Layout Builder** - Service-account layout builder creates and idempotently updates Dashboard + DCA Log tabs (completed 2026-06-14)
- [ ] **Phase 3: Data Layer** - Apps Script provider modules (Hyperliquid, Jupiter, Solana RPC) with secrets wired via Secret Manager and PropertiesService
- [ ] **Phase 4: Refresh & Caching** - Time-driven trigger runs batched writes with blob cache and graceful degradation per provider
- [ ] **Phase 5: PnL & Allocation** - DCA log, cost-basis summary block, unrealized P&L display with color coding, and allocation health zone

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

- [ ] 01-PLAN.md — Repo foundation: verify gitignore, root Bun workspace, shared assets.json, layout-builder package

**Wave 2** *(blocked on Wave 1 completion)*

- [ ] 02-PLAN.md — Apps Script toolchain: TS source + entry.ts globals, bun build IIFE bundle, clasp deploy + hello() smoke test

### Phase 2: Layout Builder

**Goal**: A user can build and idempotently update the complete spreadsheet structure from the command line without touching DCA Log data rows
**Depends on**: Phase 1
**Requirements**: LAYOUT-01, LAYOUT-02
**Success Criteria** (what must be TRUE):

  1. Running `layout-builder --build` creates the Dashboard tab and DCA Log tab with correct headers, frozen rows, summary rows, and formulas authenticated via the service account
  2. Running `layout-builder --update` re-applies all structural changes (headers, formats, formulas) and leaves existing DCA Log data rows byte-for-byte unchanged
  3. Running `--update` twice in a row produces the same spreadsheet state as running it once (idempotent)

> **Scope note (Phase 2 CONTEXT D-08):** Phase 2 delivers the STATIC skeleton only — tab creation, headers, frozen rows, summary-block labels, number formats, empty cells. All PnL/cost-basis/allocation **formulas** and **conditional formatting** are deferred to Phase 5 (extends the same builder files). SC#1's "...and formulas" is intentionally reinterpreted to skeleton-only for this phase; absent formulas in Phase 2 are not a gap. Idempotency (SC#2, SC#3) applies fully to the structural ranges Phase 2 writes.

**Plans**: 2 plans

**Wave 1**

- [x] 02-01-PLAN.md — Foundation: .env-sourced config, service-account auth client, and pure Dashboard + DCA Log skeleton request-builders with provable data-region safety
- [x] 02-02-PLAN.md — CLI orchestrator: `--build` (tab-existence guard, never spreadsheets.create) + `--update` (structural-only) dispatch, package.json node --env-file scripts, README

> 02-02 depends on 02-01 (Wave 2). Listed here under the phase; execution waves are read from each plan's frontmatter.

### Phase 3: Data Layer

**Goal**: Apps Script provider modules fetch Hyperliquid prices, Jupiter prices, and Solana balances via raw UrlFetchApp, with the Jupiter API key in Secret Manager, wallet config in PropertiesService, and a manual-holdings fallback when the balance flag is off
**Depends on**: Phase 2
**Requirements**: SEC-01, SEC-02, DATA-01, DATA-02, DATA-03, DATA-04
**Success Criteria** (what must be TRUE):

  1. Calling the Hyperliquid provider module returns mid prices for all tracked tickers (BTC, HYPE, XAUt) as parsed numbers, with no SDK used
  2. Calling the Jupiter provider module returns prices for all tracked Solana mints using the `x-api-key` header sourced from Secret Manager, not hardcoded
  3. Wallet addresses and runtime config are readable from `PropertiesService` Script Properties and absent from all source files committed to git
  4. When `FETCH_BALANCES` is false, the system falls back to manually entered holdings without error; when true, Solana RPC balances are fetched via `getTokenAccountsByOwner`

**Plans**: TBD

### Phase 4: Refresh & Caching

**Goal**: A time-driven trigger automatically refreshes prices and balances on a configurable interval using a single batched write, a blob cache with TTL, and per-provider graceful degradation
**Depends on**: Phase 3
**Requirements**: REFRESH-01, REFRESH-02, REFRESH-03, REFRESH-04
**Success Criteria** (what must be TRUE):

  1. `installTrigger()` creates a time-driven trigger that runs `refreshAll()` at the configured interval; `removeTrigger()` removes it; both are callable from the Apps Script editor
  2. Each `refreshAll()` execution writes all price and balance data to the Dashboard in a single `setValues` call — no cell-by-cell writes
  3. A `PRICES_ALL` cache blob is written after a live fetch and served on the next run within TTL; a cache miss triggers a fresh fetch without error
  4. If one provider (e.g., Jupiter) fails, the Dashboard still shows the last good values for the other providers and `Stale?` / `LastUpdated` status cells reflect the partial failure

**Plans**: TBD

### Phase 5: PnL & Allocation

**Goal**: Users see accurate unrealized PnL and allocation health in the Dashboard, driven by DCA transaction entries in the DCA Log tab
**Depends on**: Phase 4
**Requirements**: PNL-01, PNL-02, PNL-03, PNL-04, ALLOC-01, ALLOC-02
**Success Criteria** (what must be TRUE):

  1. User can enter a DCA transaction (date, asset, type, price, qty, total, fee, net cost, notes) in the DCA Log tab and it persists across layout `--update` runs
  2. The DCA Log summary block shows total invested, total qty, DCA-weighted average cost, buy count, last buy date, and total fees per asset — and is the only place this computation lives
  3. The Dashboard shows unrealized P&L in USD and % for each asset, calculated as `Value − Qty × AvgCost`, and these values match manual spot-check arithmetic
  4. P&L cells are visually green for gains and red for losses via conditional formatting, visible without any manual formatting step
  5. The allocation zone shows target %, actual %, drift, risk score, APY, and monthly yield per asset, plus a totals row with blended risk via `SUMPRODUCT` and total monthly yield

**Plans**: TBD
**UI hint**: yes

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation | 2/2 | Complete    | 2026-06-14 |
| 2. Layout Builder | 2/2 | Complete   | 2026-06-14 |
| 3. Data Layer | 0/TBD | Not started | - |
| 4. Refresh & Caching | 0/TBD | Not started | - |
| 5. PnL & Allocation | 0/TBD | Not started | - |
