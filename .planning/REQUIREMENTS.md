# Requirements: Crypto Portfolio Tracker

**Defined:** 2026-06-13
**Core Value:** See accurate unrealized PnL — live portfolio value measured against DCA-weighted cost basis — for the whole portfolio at a glance, refreshed automatically.

## v1 Requirements

Requirements for the initial release. Each maps to a roadmap phase.

### Project Setup

- [x] **SETUP-01**: Two-runtime repo skeleton exists with separate dependency sets — `layout-builder/` (Node + `googleapis`) and `apps-script/` (TypeScript) — plus `.gitignore` and per-runtime READMEs
- [x] **SETUP-02**: Apps Script TS toolchain compiles `src/` to flat `dist/` with trigger entry points as top-level globals; `clasp push` of `dist/` works and a deployed function is globally callable; a `deploy` script wires build + push

### Configuration

- [x] **CONFIG-01**: Asset registry (Solana mint addresses, Hyperliquid tickers, target allocation, risk scores, APY) lives in one config source per runtime so adding/removing an asset is a one-line change

### Layout Builder

- [ ] **LAYOUT-01**: User can run `layout-builder --build` to create the Dashboard and DCA Log tabs with headers, formatting, frozen header rows, summary rows, and formulas, authenticated via the service account
- [ ] **LAYOUT-02**: User can run `layout-builder --update` to idempotently re-apply structure, formats, validations, and formulas without ever altering DCA Log data rows

### Price & Balance Data

- [x] **DATA-01**: Apps Script fetches Hyperliquid **spot** mid prices for `UBTC`/`HYPE`/`XAUT0` via raw `UrlFetchApp` (spot price path — not perp `allMids`-by-symbol; revised Phase 3 D-05)
- [x] **DATA-02**: Apps Script fetches Jupiter prices for the Solana mints via raw `UrlFetchApp` (keyed `api.jup.ag` `price/v3`, `x-api-key` header)
- [x] **DATA-03**: Apps Script fetches Solana balances via Jupiter `ultra/v1/balances` (raw `UrlFetchApp`), always fetched (revised Phase 3 D-01 — Solana RPC `getTokenAccountsByOwner` removed)
- [ ] ~~**DATA-04**~~ **(DESCOPED)**: Manual-holdings mode dropped — balances are always fetched from both venues; no `FETCH_BALANCES` flag (superseded by Phase 3 D-03)

### Refresh & Caching

- [x] **REFRESH-01**: A time-driven trigger runs `refreshAll()` on a configurable interval (default 5 min), installable/removable via `Triggers`
- [x] **REFRESH-02**: `refreshAll()` writes prices/balances to the Dashboard in a single batched `setValues` write (never cell-by-cell)
- [x] **REFRESH-03**: A single-blob cache (`PRICES_ALL`) with TTL guards against rate limits, treated as soft with a live-fetch fallback on miss
- [x] **REFRESH-04**: Graceful degradation — each provider wrapped in independent try/catch, with `LastUpdated`/`Stale?` status cells; a failed call never overwrites good cached data with errors

### Cost Basis & PnL

- [ ] **PNL-01**: User can record DCA transactions in the DCA Log tab (date, asset, type, price, qty, total, fee, net cost, notes)
- [ ] **PNL-02**: A per-asset summary block computes total invested, total qty, DCA-weighted average cost, buy count, last buy, and total fees as the single source of truth for cost basis
- [ ] **PNL-03**: The Dashboard shows unrealized P&L in USD (`Value − Qty × AvgCost`) and P&L %
- [ ] **PNL-04**: P&L cells are color-coded via conditional formatting (green for gains, red for losses)

### Realized PnL

- [ ] **PNL-05**: User can log SELL transactions in the DCA Log and see realized PnL per asset (sale proceeds vs DCA-weighted cost basis), without breaking the BUY-only avg-cost summary (promoted from v2 — own phase, Phase 6)

### Allocation Health

- [ ] **ALLOC-01**: The allocation zone shows target %, actual %, and drift per asset
- [ ] **ALLOC-02**: The allocation zone shows risk score per asset, with a totals row (target sum, blended risk via `SUMPRODUCT`) _(APY and monthly yield scratched in Phase 5 discussion 2026-06-19 — see Phase 5 CONTEXT)_

### Security & Secrets

- [x] **SEC-01**: The Jupiter API key is stored in `PropertiesService` Script Property `JUP_API_KEY`, read at call time and absent from committed source (revised Phase 3 D-07 — GCP Secret Manager / `ScriptApp.getOAuthToken()` removed)
- [x] **SEC-02**: Wallet addresses and runtime config are stored in `PropertiesService`, not hardcoded
- [x] **SEC-03**: The service-account key is local-only and gitignored; `.gitignore` covers `*.key.json`, `.clasp.json`, and `apps-script/dist`

## v2 Requirements

Deferred to a future release. Tracked but not in the current roadmap.

### PnL

- **PNL-06**: Data-validation dropdowns on the DCA Log (Asset, Type) if not delivered in v1

> **PNL-05** (Realized PnL from SELL transactions) promoted to v1 — now tracked under Realized PnL above, scoped to Phase 6.

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Exponent onRe vault tracking | No public API and no longer held |
| Custom `=GET_*()` price functions | Recalc unpredictably, can't reliably hold cache; scheduled trigger writes data instead |
| Signing / auto-DCA / private keys | Hard security boundary — project is read-only |
| SDKs (`gill`, `@nktkas/hyperliquid`, `@jup-ag/api`) | No npm runtime in Apps Script; all calls are raw HTTP |
| Jupiter Portfolio endpoint / multi-protocol positions | 100 credits/call; raw RPC covers plain SPL balances |

## Traceability

Which phases cover which requirements. Populated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| SETUP-01 | Phase 1 | Complete |
| SETUP-02 | Phase 1 | Complete |
| CONFIG-01 | Phase 1 | Complete |
| SEC-03 | Phase 1 | Complete |
| LAYOUT-01 | Phase 2 | Pending |
| LAYOUT-02 | Phase 2 | Pending |
| SEC-01 | Phase 3 | Complete |
| SEC-02 | Phase 3 | Complete |
| DATA-01 | Phase 3 | Complete |
| DATA-02 | Phase 3 | Complete |
| DATA-03 | Phase 3 | Complete |
| DATA-04 | Phase 3 | Descoped |
| REFRESH-01 | Phase 4 | Complete |
| REFRESH-02 | Phase 4 | Complete |
| REFRESH-03 | Phase 4 | Complete |
| REFRESH-04 | Phase 4 | Complete |
| PNL-01 | Phase 5 | Pending |
| PNL-02 | Phase 5 | Pending |
| PNL-03 | Phase 5 | Pending |
| PNL-04 | Phase 5 | Pending |
| ALLOC-01 | Phase 5 | Pending |
| ALLOC-02 | Phase 5 | Pending |
| PNL-05 | Phase 6 | Pending |

**Coverage:**

- v1 requirements: 23 total (22 active + 1 descoped: DATA-04)
- Mapped to phases: 23
- Unmapped: 0

---
*Requirements defined: 2026-06-13*
*Last updated: 2026-06-16 — Phase 3 discuss-phase deviations (DATA-01/03 revised, DATA-04 descoped, SEC-01 to PropertiesService)*
