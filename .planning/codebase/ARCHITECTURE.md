# Architecture

**Analysis Date:** 2026-06-13

> **State note:** The repository is currently a fresh `bun init` scaffold. The only executable code is `index.ts` (`console.log("Hello via Bun!")`). The substantive architecture lives in `PLAN.md`, a load-bearing build spec. This document records the **current state** and the **planned target architecture** (marked _planned_), clearly separated.

## Overview

**Current:** Single-file Bun/TypeScript scaffold. No application architecture yet.

**Planned (per `PLAN.md`):** A Google Sheets crypto portfolio tracker composed of **two isolated runtimes** that share only the target spreadsheet:

1. **Layout builder** — local Node program (`layout-builder/`) that creates and idempotently updates the spreadsheet structure via the Google Sheets API using a service account.
2. **Data layer** — Google Apps Script (`apps-script/`), authored in TypeScript, compiled to `dist/`, deployed via `clasp`. Fetches live prices + on-chain balances and writes them into the sheet on a time-driven trigger.

The two runtimes never share code or dependencies. The spreadsheet is the only integration surface between them.

## Architectural Pattern

**Planned:** Two-runtime, single-shared-datastore (the Google Sheet acts as both database and UI).

- **Build-time vs. run-time split** — the layout builder defines _structure_ (run on demand by a human); the Apps Script layer fills in _data_ (run on a schedule). Structure is version-controlled in code, not hand-built.
- **Read-only safety boundary** — no private keys anywhere. All exchange/chain access is read-only (public wallet addresses + public price endpoints). Signing/auto-DCA is explicitly out of scope (`PLAN.md` §6.8).
- **No-SDK raw-HTTP rule** — Apps Script runs Google's V8 with no npm/module resolution, so all network calls use `UrlFetchApp` against raw HTTP endpoints. SDKs (`@nktkas/hyperliquid`, `@jup-ag/api`, `gill`) are explicitly dropped (`PLAN.md` §2).

## Layers (planned)

### Layout builder (`layout-builder/`)
- **Entry** — `src/index.js` with `--build` / `--update` flags
- **Auth** — `src/auth.js`: service-account JWT (`google.auth.JWT` / `GoogleAuth` from `googleapis`)
- **Sheet definitions** — `src/dashboardSheet.js` (Sheet 1), `src/dcaLogSheet.js` (Sheet 2)
- **Config** — `src/config.js`: spreadsheet ID, sheet names, asset list

### Data layer (`apps-script/src/`)
- **Config / Secrets** — `Config.ts` (asset registry, refresh interval, cache TTL), `Secrets.ts` (PropertiesService + GCP Secret Manager for the Jupiter API key)
- **Providers** — `HyperliquidApi.ts`, `JupiterApi.ts`, `SolanaRpc.ts` (each wraps `UrlFetchApp` against one raw endpoint)
- **Cache** — `Cache.ts`: wraps `CacheService.getScriptCache()`; one batched JSON blob under one key (`PRICES_ALL`)
- **Orchestration** — `Refresh.ts` (`refreshAll()` main trigger entry), `Triggers.ts` (install/remove time-driven trigger)

## Data Flow (planned)

**Layout build (on demand):**
```
human runs `node src/index.js --build|--update`
  → auth.js (service-account JWT)
  → Sheets API batchUpdate (explicit ranges)
  → Dashboard + DCA Log tabs created/refreshed
```

**Data refresh (every ~5 min, time-driven trigger):**
```
trigger → refreshAll()
  → check CacheService for PRICES_ALL
      hit  → use blob
      miss → HyperliquidApi (allMids) + JupiterApi (price/v3)
             [+ SolanaRpc getTokenAccountsByOwner if FETCH_BALANCES]
           → build JSON blob → cache.put(TTL)
  → single setValues batch write to Dashboard cols D (price) / E (holdings)
  → spreadsheet formulas compute Value, P&L, allocation, yield
```

## Key Abstractions (planned)

- **Single-blob cache** (`PRICES_ALL`) — one fetch → one JSON blob → one cache key; all cell writes read from it. Treated as _soft_ (eviction before TTL is normal; always fall back to live fetch).
- **Provider isolation** — each price/balance provider wrapped in independent try/catch so one outage doesn't blank the others (graceful degradation, `PLAN.md` §6.3).
- **Config registry** — all Solana mint addresses + HL tickers live in one `Config` map so adding/removing an asset is a one-line change.
- **Idempotent layout update** — the `--update` path re-applies headers/formats/validations/formulas only, never touching DCA Log data rows.

## Entry Points

**Current:**
- `index.ts` — Bun scaffold entry (`package.json` `"module"` field)

**Planned:**
- `layout-builder/src/index.js` — CLI entry (`--build` / `--update`)
- `apps-script/src/Refresh.ts` → `refreshAll()` — trigger entry (must compile to a top-level global)
- `apps-script/src/Triggers.ts` → `installTrigger()` / `removeTrigger()` — must compile to top-level globals

## Architectural Constraints (planned, `PLAN.md` §2)

- **Apps Script global scope** — trigger/entry functions must be top-level in compiled output. Avoid `import`/`export` between Apps Script source files unless the bundler inlines them into one flat file (concatenation-style global scope is how Apps Script links files).
- **Two separate directories, runtimes, dependency sets** — never mixed.
- **Service-account key is local only** — never committed, never pushed to Apps Script.

---

*Architecture analysis: 2026-06-13*
