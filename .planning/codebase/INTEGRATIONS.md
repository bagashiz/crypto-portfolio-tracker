# External Integrations

**Analysis Date:** 2026-06-13

> **State note:** No integrations are wired in code yet — the repo is a fresh `bun init` scaffold. Every integration below is specified in `PLAN.md` (the build handoff spec) and is **planned, not yet implemented**. File paths reference the planned structure in `PLAN.md` §3.

## APIs & External Services

**Price data:**
- **Hyperliquid** — live mid prices for BTC, HYPE, XAUt
  - SDK/Client: none (raw HTTP via `UrlFetchApp`); planned `apps-script/src/HyperliquidApi.ts`
  - Endpoint: `POST https://api.hyperliquid.xyz/info` body `{"type":"allMids"}`
  - Auth: none (public)
- **Jupiter (jup.ag)** — live prices for Solana SPL tokens (IVVon, PST, ONyc, USDy)
  - SDK/Client: none (raw HTTP); planned `apps-script/src/JupiterApi.ts`
  - Endpoint: `GET https://api.jup.ag/price/v3?ids={mints}` (≤50 mints/request)
  - Auth: `x-api-key` header (key from GCP Secret Manager)
  - Rate limits: keyless 0.5 RPS / free 1 RPS, 60s sliding window, HTTP 429 on exceed

**Balances (on-chain, optional behind `FETCH_BALANCES` flag):**
- **Solana RPC** — SPL token balances via `getTokenAccountsByOwner`
  - SDK/Client: none (raw HTTP); planned `apps-script/src/SolanaRpc.ts`
  - Endpoint: a Solana RPC (public vs dedicated — open item)
  - Auth: none (public RPC; wallet address is public)
- **Hyperliquid balances (optional)** — `POST /info` `{"type":"clearinghouseState"|"spotClearinghouseState","user":HL_WALLET_ADDRESS}`

**Google Sheets API:**
- Used by the local layout builder to create/update the two-tab spreadsheet structure
  - SDK/Client: `googleapis` (planned `layout-builder/package.json`)
  - Auth: service-account JWT (`google.auth.JWT` / `GoogleAuth`), planned `layout-builder/src/auth.js`

**Not recommended / unused:**
- Jupiter Portfolio API (`GET https://api.jup.ag/portfolio/v1/positions`) — BETA, 100 credits/call; avoided for polling. Only for future multi-protocol position tracking.

## Data Storage

**Databases:**
- None. The Google Sheet is the system of record / output surface.

**File Storage:**
- Local filesystem only (service-account key, build output)

**Caching:**
- Apps Script `CacheService.getScriptCache()` — planned `apps-script/src/Cache.ts`
  - One batched fetch → single JSON blob → one cache key (e.g. `PRICES_ALL`)
  - TTL = refresh interval (default 300s; max 21600s), script scope, soft (eviction expected, fall back to live fetch)

## Authentication & Identity

**Google service account (layout builder):**
- JWT auth via `googleapis`; key file `layout-builder/service-account.key.json` (local only, gitignored)
- Target spreadsheet shared with the service-account email as Editor

**Apps Script OAuth (data layer):**
- Built-in script OAuth; `ScriptApp.getOAuthToken()` used for Secret Manager REST calls
- Manifest scopes (`appsscript.json`): `spreadsheets`, `external_request`, `cloud-platform`, `script.scriptapp`

**No private keys / signing:** read-only wallet addresses only; no transaction signing anywhere in this project.

## Monitoring & Observability

**Error Tracking:**
- None. Planned graceful degradation: per-provider try/catch, keep last cached value, write `LastUpdated` / `Stale?` status cells rather than overwriting good data.

**Logs:**
- Apps Script execution logs (Stackdriver/Logger); current root project uses `console.log`

## CI/CD & Deployment

**Hosting:**
- Layout builder: local/on-demand (`node src/index.js --build|--update`)
- Data layer: Google Apps Script (sheet-bound), time-driven trigger

**Deploy pipeline (planned, per `PLAN.md` §6.9):**
- `clasp` — `npm run build && clasp push` (build copies `appsscript.json` into `dist/`, pushes only `dist/`)
- `clasp login` required; `.clasp.json` and `dist/` gitignored
- No CI service configured

## Environment Configuration

**Required env / script properties (planned, per `PLAN.md` §5.1):**
- Layout builder: spreadsheet ID (via `config.js` or `.env`)
- Apps Script `PropertiesService` (Script Properties):
  - `SM_RESOURCE_PATH` — Secret Manager resource name for the Jupiter key
  - `HL_WALLET_ADDRESS` — Hyperliquid wallet (public, read-only)
  - `SOL_WALLET_ADDRESS` — Solana wallet (public, read-only)
  - `GCP_PROJECT_ID`

**Secrets location:**
- Jupiter API key → GCP Secret Manager (`secretmanager.googleapis.com/v1/{path}:access`), read via `apps-script/src/Secrets.ts`
- Service-account key → local file `layout-builder/service-account.key.json` (gitignored)
- Wallet addresses → Script Properties (public data, no Secret Manager needed)
- `.env*` gitignored (`.gitignore` lines 18–24); Bun auto-loads `.env`

## Webhooks & Callbacks

**Incoming:**
- None

**Outgoing:**
- None (the data layer polls external APIs on a time-driven trigger; it does not emit webhooks)

---

*Integration audit: 2026-06-13*
