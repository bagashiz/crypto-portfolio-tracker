# Requirements: Crypto Portfolio Tracker

**Defined:** 2026-06-13
**Core Value:** See accurate unrealized PnL — live portfolio value measured against DCA-weighted cost basis — for the whole portfolio at a glance, refreshed automatically.

## v1 Requirements

Requirements for the initial release. Each maps to a roadmap phase.

### Project Setup

- [ ] **SETUP-01**: Two-runtime repo skeleton exists with separate dependency sets — `layout-builder/` (Node + `googleapis`) and `apps-script/` (TypeScript) — plus `.gitignore` and per-runtime READMEs
- [ ] **SETUP-02**: Apps Script TS toolchain compiles `src/` to flat `dist/` with trigger entry points as top-level globals; `clasp push` of `dist/` works and a deployed function is globally callable; a `deploy` script wires build + push

### Configuration

- [ ] **CONFIG-01**: Asset registry (Solana mint addresses, Hyperliquid tickers, target allocation, risk scores, APY) lives in one config source per runtime so adding/removing an asset is a one-line change

### Layout Builder

- [ ] **LAYOUT-01**: User can run `layout-builder --build` to create the Dashboard and DCA Log tabs with headers, formatting, frozen header rows, summary rows, and formulas, authenticated via the service account
- [ ] **LAYOUT-02**: User can run `layout-builder --update` to idempotently re-apply structure, formats, validations, and formulas without ever altering DCA Log data rows

### Price & Balance Data

- [ ] **DATA-01**: Apps Script fetches Hyperliquid mid prices (`allMids`) via raw `UrlFetchApp`
- [ ] **DATA-02**: Apps Script fetches Jupiter prices for the Solana mints via raw `UrlFetchApp` (key in `x-api-key` header)
- [ ] **DATA-03**: Apps Script fetches on-chain Solana balances via raw RPC `getTokenAccountsByOwner`, gated behind a `FETCH_BALANCES` flag
- [ ] **DATA-04**: User can enter holdings manually when `FETCH_BALANCES` is off

### Refresh & Caching

- [ ] **REFRESH-01**: A time-driven trigger runs `refreshAll()` on a configurable interval (default 5 min), installable/removable via `Triggers`
- [ ] **REFRESH-02**: `refreshAll()` writes prices/balances to the Dashboard in a single batched `setValues` write (never cell-by-cell)
- [ ] **REFRESH-03**: A single-blob cache (`PRICES_ALL`) with TTL guards against rate limits, treated as soft with a live-fetch fallback on miss
- [ ] **REFRESH-04**: Graceful degradation — each provider wrapped in independent try/catch, with `LastUpdated`/`Stale?` status cells; a failed call never overwrites good cached data with errors

### Cost Basis & PnL

- [ ] **PNL-01**: User can record DCA transactions in the DCA Log tab (date, asset, type, price, qty, total, fee, net cost, notes)
- [ ] **PNL-02**: A per-asset summary block computes total invested, total qty, DCA-weighted average cost, buy count, last buy, and total fees as the single source of truth for cost basis
- [ ] **PNL-03**: The Dashboard shows unrealized P&L in USD (`Value − Qty × AvgCost`) and P&L %
- [ ] **PNL-04**: P&L cells are color-coded via conditional formatting (green for gains, red for losses)

### Allocation Health

- [ ] **ALLOC-01**: The allocation zone shows target %, actual %, and drift per asset
- [ ] **ALLOC-02**: The allocation zone shows risk score, APY, and monthly yield per asset, with a totals row (target sum, blended risk via `SUMPRODUCT`, total monthly yield)

### Security & Secrets

- [ ] **SEC-01**: The Jupiter API key is stored in GCP Secret Manager and read via a `Secrets` module using `ScriptApp.getOAuthToken()`
- [ ] **SEC-02**: Wallet addresses and runtime config are stored in `PropertiesService`, not hardcoded
- [ ] **SEC-03**: The service-account key is local-only and gitignored; `.gitignore` covers `*.key.json`, `.clasp.json`, and `apps-script/dist`

## v2 Requirements

Deferred to a future release. Tracked but not in the current roadmap.

### PnL

- **PNL-05**: Realized PnL from SELL transactions
- **PNL-06**: Data-validation dropdowns on the DCA Log (Asset, Type) if not delivered in v1

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
| (to be filled by roadmap) | | |

**Coverage:**
- v1 requirements: 22 total
- Mapped to phases: (pending roadmap)
- Unmapped: (pending roadmap)

---
*Requirements defined: 2026-06-13*
*Last updated: 2026-06-13 after initial definition*
