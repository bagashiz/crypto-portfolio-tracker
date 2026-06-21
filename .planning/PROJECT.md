# Crypto Portfolio Tracker

## What This Is

A personal Google Sheets crypto portfolio tracker that auto-fetches live prices and on-chain balances for a Hyperliquid wallet and a Solana wallet, computes DCA-weighted cost basis with both unrealized and realized PnL from a manual transaction log, and surfaces allocation health (target vs actual, drift, risk). The spreadsheet structure is built and refreshed programmatically — the user never hand-edits the sheet layout, only enters BUY/SELL transactions. Shipped as v1.0 (2026-06-21).

## Core Value

See accurate unrealized PnL — live portfolio value measured against DCA-weighted cost basis — for the whole portfolio at a glance, refreshed automatically.

## Requirements

### Validated

<!-- Shipped and confirmed valuable. -->

- [x] Apps Script fetches live Hyperliquid spot prices via raw `UrlFetchApp` (Validated in Phase 3 — `spotMetaAndAssetCtxs`, asset-ctx joined by pair name not array index; BTC/HYPE/XAUt confirmed live in the deployed editor)
- [x] Apps Script fetches live Jupiter prices for Solana mints via raw `UrlFetchApp` (Validated in Phase 3 — `price/v3`, keyed by mint)
- [x] Apps Script fetches live Solana balances via raw `UrlFetchApp` (Validated in Phase 3 — via Jupiter `ultra/v1/balances` `uiAmount`, rather than raw RPC `getTokenAccountsByOwner`)
- [x] Secrets kept out of source: wallet addresses + Jupiter key live in `PropertiesService` (set in the editor, never committed); service-account key + `.clasp.json` gitignored (Validated in Phase 3 — Jupiter key in Script Properties, not GCP Secret Manager, which was descoped to the minimal `external_request` scope)
- [x] Prices/balances written to the sheet on a time-driven trigger (scheduled `refreshAll()`), single batched `setValues` write (Validated in Phase 4 — live editor run populates Zone A Qty/Price in one batched write; idempotent `installTrigger`/`removeTrigger` confirmed in the Triggers panel)
- [x] Single-blob cache (`PRICES_ALL`) with TTL + graceful degradation — per-venue try/catch, `LastUpdated`/`Stale?` status, never overwrite good data with errors (Validated in Phase 4 — induced single-venue failure kept last-good values + flagged only that venue Stale?, self-healed next run; cache backfilled from written rows so it never diverges from the sheet on an outage+eviction coincidence, CR-01)
- [x] Layout builder (local Node + `googleapis` service account) creates the Dashboard + Transaction Log tabs programmatically with headers, formats, frozen rows, summary rows, and formulas (Validated in Phases 2/5/6 — live `--build` against the real spreadsheet on 2026-06-21)
- [x] Layout builder `--update` is idempotent — re-applies structure/formats/formulas without ever touching the data rows (Validated in Phase 5 + quick task 260621-m70 — live `--update` round-trip confirmed data rows survive byte-for-byte and conditional-format rules converge without stacking)
- [x] DCA-weighted average cost basis per asset, single source of truth in the Transaction Log summary block (Validated in Phase 5)
- [x] Dashboard shows unrealized P&L in USD and %, color-coded green/red conditional formatting (Validated in Phase 5 — live render confirmed 2026-06-21)
- [x] Allocation health zone: target %, actual %, drift, blended risk via SUMPRODUCT (Validated in Phase 5; APY % + monthly yield scratched in Phase 5 discussion 2026-06-19)
- [x] Realized PnL per asset from SELL transactions (proceeds vs DCA-weighted cost basis) + portfolio Total Realized, separate from the BUY-only unrealized summary (Validated in Phase 6)

### Active

<!-- Current scope. Building toward these. Hypotheses until shipped. -->

(None — v1.0 shipped. Next milestone scope to be defined via `/gsd-new-milestone`.)

Candidate v2 items (not yet committed): data-validation dropdowns on the Transaction Log (Asset, Type — PNL-06); update the `apps-script` `deploy` script to `clasp push --force` (Phase 4 deviation note); confirm `XAUt`/mint registry values against a locale-pinned live sheet.

### Out of Scope

<!-- Explicit boundaries. Includes reasoning to prevent re-adding. -->

- Exponent onRe vault tracking — dropped from scope (no public API; no longer held)
- APY % / monthly yield on the Dashboard — scratched in Phase 5 discussion (2026-06-19); the `apy` field in `assets.json` is now vestigial
- Custom `=GET_*()` price functions — rejected: recalc unpredictably and can't reliably hold cache; the scheduled trigger is the data writer instead
- Signing / auto-DCA / any private-key handling — hard security boundary; this project is read-only
- SDKs (`gill`, `@nktkas/hyperliquid`, `@jup-ag/api`) — all exchange/chain calls are raw HTTP; no SDKs in either runtime
- Jupiter Portfolio endpoint / multi-protocol position tracking — costs 100 credits/call; raw RPC covers plain SPL balances

## Context

- **v1.0 shipped (2026-06-21).** All 6 phases complete: two-runtime skeleton (Bun workspace, shared `assets.json`, isolated-`googleapis` `layout-builder/`, `apps-script/` TS → flat `dist/Code.js` via `bun build --format=iife` + `clasp push`), idempotent layout builder, raw-`UrlFetchApp` data layer (Hyperliquid + Jupiter), scheduled `refreshAll()` with `PRICES_ALL` cache + graceful degradation, unrealized + realized PnL, and allocation health — all live-verified against the real spreadsheet and wallets. ~3,754 LOC TS/JS, 16 plans, 33 tasks. Live close-out verification caught a real `--update` defect (conditional-format pre-clear matched the wrong Sheets API error string), fixed under quick task `260621-m70`; that fix landed all the Phase 5/6 structure that had been silently stuck since Phase 2 and renamed the tab `DCA Log` → `Transaction Log`.
- **Foundation history (Phase 1, 2026-06-14).** Substance originally came from a pre-GSD `PLAN.md` build spec (now absorbed into these planning docs) and a prior-session memory.
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
| Scheduled time-driven trigger writes data (not custom `=GET_*()` functions) | Custom functions recalc unpredictably and can't reliably hold cache (PLAN.md §5.4) | ✓ Established in Phase 4 (`refreshAll()` on a 5-min trigger; one batched `setValues`) |
| Two-runtime architecture (service-account layout builder + clasp Apps Script) | Version-control sheet structure in code; isolate build-time vs run-time | ✓ Established in Phase 1 (both packages scaffolded, deps isolated) |
| Apps Script is **container-bound** to the spreadsheet (not standalone) | Bound script uses `SpreadsheetApp.getActiveSpreadsheet()` — no spreadsheet ID needed in `PropertiesService` on the Apps Script side; matches the single-sheet model. Implies: the sheet must be created first, then a script bound to it (Extensions → Apps Script) to obtain the `scriptId` that `clasp` pushes to. Does NOT affect the layout builder, which always addresses the sheet by ID via the service account over the Sheets API. | ✓ Confirmed in Phase 4 — initial deploy was standalone (`getActiveSpreadsheet()` returned null → live `getSheetByName` crash at the verify gate); switched to a Sheet-bound script and reverted to `getActiveSpreadsheet()`. `.clasp.json` `scriptId` repointed to the bound project. |
| Apps Script globals exposed via top-level `function` shims (`appendGlobals.ts`), not runtime `globalThis` assignment alone | `bun build --format=iife` traps declarations in a closure; the editor function picker only discovers static top-level `function` declarations. Runtime `globalThis.x = x` is invisible to the picker. | ✓ Phase 1 pattern; Phase 4 surfaces `refreshAll`/`installTrigger`/`removeTrigger` as the `ENTRY_GLOBALS`, and dropped the Phase 1/3 scaffold entries `hello()`/`testApi()` |
| Fresh greenfield build (no existing deployed project to preserve) | Repo is only a scaffold; no live bound script to extend | ✓ Good — built from scratch, no legacy to preserve |
| Raw HTTP everywhere, no SDKs | Apps Script has no npm runtime; layout builder only talks to Sheets API | ✓ Good — all venue calls via `UrlFetchApp`; no SDK ever added |
| On-chain balance fetch gated behind `FETCH_BALANCES` flag, manual holdings first | Avoid two failure modes (price refresh + RPC) at once; RPC rate limits | ⌫ Dropped (Phase 3 D-03, DATA-04 descoped) — balances always fetched from both venues; Solana via Jupiter `ultra/v1/balances` (not raw RPC `getTokenAccountsByOwner`), so the dual-failure concern dissolved |
| Single source of truth for avg cost (DCA Log summary block) | Don't duplicate SUMIF logic across Dashboard and Log | ✓ Good — Phase 5: Dashboard `AVGCOST` cross-sheet refs the summary cell; no duplicated SUMIFS |
| Exponent onRe vault removed from scope | No public API and no longer held | ✓ Good — stayed out of scope |
| Jupiter API key in `PropertiesService` Script Property, not GCP Secret Manager | Secret Manager + `cloud-platform` scope was overkill for one key; minimal `external_request` scope instead | ✓ Good (Phase 3 D-07) — key read at call time, never committed |
| `--update` conditional-format pre-clear must tolerate the live "delete missing rule" error by matching the **real** Sheets API message string | Offline tests asserted delete indices but never the live error wording, so a guessed regex silently aborted every `--update` since Phase 2 | ⚠️ Revisit pattern — error-tolerance predicates matched against guessed API strings are untested until live; fixed in quick task 260621-m70, but a class worth guarding against elsewhere |

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
*Last updated: 2026-06-21 after v1.0 MVP milestone — all 6 phases shipped and live-verified against the real spreadsheet and wallets. The tracker now builds/idempotently updates the Dashboard + Transaction Log tabs from code, fetches Hyperliquid + Jupiter prices/balances on a 5-min trigger with `PRICES_ALL` caching and per-venue graceful degradation, and computes DCA-weighted unrealized PnL, realized PnL from SELL rows, and allocation health — all with the transaction data region provably untouched by `--update`. v1.0 close-out caught and fixed a real `--update` defect (quick task 260621-m70) and renamed `DCA Log` → `Transaction Log`. Next milestone scope TBD via `/gsd-new-milestone`.*
