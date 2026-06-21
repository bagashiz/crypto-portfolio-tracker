# Milestones

## v1.0 MVP (Shipped: 2026-06-21)

**Delivered:** A live Google Sheets crypto portfolio tracker — auto-fetched Hyperliquid + Solana prices/balances on a 5-minute trigger, DCA-weighted cost basis with unrealized + realized PnL, and allocation health — built and idempotently refreshed entirely from code.

**Phases completed:** 6 phases, 16 plans, 33 tasks
**Git range:** `fa87216` (initial commit) → `1ee8528` · ~3,754 LOC TS/JS · 2026-06-13 → 2026-06-21 (9 days)
**Notable:** Live milestone verification flushed out a real `--update` defect (conditional-format pre-clear error-tolerance matched the wrong Sheets API message string), fixed under quick task `260621-m70` — which also revealed no `--update` had landed since Phase 2, so the fix retroactively pushed all Phase 5/6 formatting + the Transaction Log rename to the live sheet.

**Key accomplishments:**

- Two-runtime Bun workspace skeleton with a single shared assets.json registry, an isolated-googleapis layout-builder package, and SEC-03 gitignore coverage verified before any key file exists.
- Apps Script TypeScript toolchain that bundles import/export source into one flat `dist/Code.js` via `bun build --format=iife`, inlines the shared `assets.json`, and exposes a deployed, editor-callable `hello()` global — proving (and refining) the Phase-1 primary-risk bundling/deploy pattern.
- Env-sourced config + service-account Sheets client + two pure skeleton request-builder modules (Dashboard Zone A/B and DCA Log top-of-data band), with the DCA Log `--update` set proven by unit test to never touch the transaction data region.
- `index.js` CLI wires the Plan 01 building blocks into a working `--build` (with the D-04 tab-existence guard, never creating a spreadsheet) and `--update` (structural-only, never addressing the DCA Log data region) command, backed by real `node --env-file=.env` package scripts and documented setup.
- Pinned the DCA Log data-region boundary to a fixed literal (DATA_START_ROW = 23 = MAX_SUMMARY_ROWS + 3) backed by a MAX_SUMMARY_ROWS=20 reservation, so a CONFIG-01 asset add can no longer re-stamp the transaction header onto live DCA transactions — with the data-safety test now anchored to the hard literal and a loud overflow guard.
- Verified asset registry (real Solana mints + HL spot tickers UBTC/HYPE/XAUT0), the single external_request OAuth scope, and a fail-loud getScriptProp() + placeholder-only setup() in Properties.ts — zero network code.
- Two raw-`UrlFetchApp` provider modules returning the D-09 `Record<id,{price,qty}>` contract — HL spot mids+balances via `spotMetaAndAssetCtxs`/`spotClearinghouseState` and Jupiter prices+Solana balances via keyed `price/v3`/`ultra/v1/balances` — with exported pure parsers TDD-tested for D-09 assembly, D-10 price-throw, and D-13 balance-qty-0/malformed-throw.
- Both venue providers are wired into the deployed bundle and live-verified end-to-end: real Hyperliquid spot prices and Solana balances/prices flow back from the deployed Apps Script editor, with zero secrets committed.
- Apps Script refresh layer: a single-batched-write `refreshAll()` with per-venue graceful degradation off a `PRICES_ALL` last-good cache blob, plus idempotent time-driven `installTrigger`/`removeTrigger`, all wired as editor-discoverable globals.
- Deployed the Phase 4 refresh layer to a Sheet-bound Apps Script, installed the 5-minute trigger, and live-verified self-refresh + per-venue graceful degradation against the user's real wallets.
- Dashboard unrealized PnL ($ and %) against DCA-weighted cost basis with the DCA Log summary block as the single source of truth, green/red conditional formatting, and an allocation-health zone (target %, actual %, drift, blended risk via SUMPRODUCT) — live-verified on the real spreadsheet.
- Transaction Log builder now books per-row realized PnL via a single row-22 BYROW spill, per-asset realized summary metrics (Sold Qty / Net Proceeds / Realized $ / Realized %), a portfolio Total Realized cell, and green/red conditional formatting — all strictly above the protected data region (row 23).
- `--update` upgrades an existing "DCA Log" tab to "Transaction Log" in place via a field-mask `updateSheetProperties` rename (never delete+recreate), idempotent on reruns, with the log-tab conditional pre-clear isolated in an error-tolerant batch — Apps Script confirmed a no-op.

---
