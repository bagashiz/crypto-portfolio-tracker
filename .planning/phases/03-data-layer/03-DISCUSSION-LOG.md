# Phase 3: Data Layer - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-16
**Phase:** 3-Data Layer
**Areas discussed:** Solana RPC endpoint, Asset id confirmation, Manual-holdings fallback, Provider return contract, Jupiter auth (emergent)

---

## Solana RPC endpoint → Balances source

Initial framing was public vs dedicated Solana RPC. User asked "can't I just use the existing Jupiter API?" — verified live that Jupiter `ultra/v1/balances` returns the wallet's real holdings, which collapsed the RPC decision entirely.

| Option | Description | Selected |
|--------|-------------|----------|
| Jupiter balances endpoint | `GET /ultra/v1/balances/{wallet}`; reuses Jupiter auth, removes the RPC blocker; deviates from DATA-03 wording | ✓ |
| Public Solana RPC | `getTokenAccountsByOwner` on mainnet-beta; matches DATA-03 literally, rate-limit risk at 5-min | |
| Dedicated Solana RPC | `getTokenAccountsByOwner` on Helius/QuickNode; reliable, extra credential | |

**User's choice:** Jupiter balances endpoint.
**Notes:** User initially reported `0` assets — but had tested `portfolio/v1/positions` (DeFi-positions endpoint, out of scope), not `ultra/v1/balances`. Live fetch of the user's wallet against `ultra/v1/balances` returned 7 real token balances, confirming viability. HL spot balances (`spotClearinghouseState`) also adopted for the Hyperliquid side. Deviates from DATA-03 (raw RPC) — recorded for a REQUIREMENTS/ROADMAP update.

---

## Asset id confirmation

| Option | Description | Selected |
|--------|-------------|----------|
| I'll paste them now | User provides exact mints/ticker | |
| Pre-deploy checklist | Keep placeholders, fill before deploy | ✓ (then superseded) |
| I'll confirm later in chat | Defer | |

**User's choice:** Pre-deploy checklist — then upgraded to "Yes, map them now" once the balances response exposed real mints.
**Notes:** All four Solana mints resolved on-chain via Jupiter token metadata and mapped (IVVon, PST, ONyc, USDy). XAUt confirmed as `XAUT0` (token 297) via the user's HL spot balances; BTC found to be held as `UBTC`. All three HL assets are spot tokens → priced from HL spot. Bad-id behavior: **Fail loud (throw)** chosen over skip/log-null.

---

## Manual-holdings fallback (DATA-04)

| Option | Description | Selected |
|--------|-------------|----------|
| Keep flag as safety switch | All auto-fetch; off-path leaves Qty untouched | |
| Drop manual mode entirely | Always fetch; remove FETCH_BALANCES + manual path | ✓ |
| Per-asset manual override | Mark specific assets manual in assets.json | |

**User's choice:** Drop manual mode entirely.
**Notes:** Also chose to auto-fetch **both** HL + Solana balances when fetching. User's steer: "there should be no asset for manual fetch." Descopes DATA-04 and removes the `FETCH_BALANCES` flag — recorded for a REQUIREMENTS/ROADMAP update.

---

## Provider return contract

| Option | Description | Selected |
|--------|-------------|----------|
| Normalized by asset id | Map keyed by id → `{price, qty}`, ticker/mint translation inside provider | ✓ |
| Raw keyed (ticker/mint) | Translate in refreshAll | |
| Separate price & balance maps | Distinct maps | |

**User's choice:** Normalized by asset id.
**Notes:** User asked whether the choice affects API efficiency — clarified it's organization-only (~4 calls/refresh regardless of map shape). Chosen as a maintainability preference.

---

## Jupiter auth (emergent gray area)

Surfaced after live testing showed Jupiter works keyless. Explored at the user's request.

| Option | Description | Selected |
|--------|-------------|----------|
| B: Keyed + Script Properties | `api.jup.ag` + `x-api-key` from `PropertiesService.JUP_API_KEY`; per-key limits, drops Secret Manager | ✓ |
| A: Keyless lite-api | No key, `lite-api.jup.ag`; drops SEC-01 fully; per-IP throttle risk on shared Apps Script IPs | |
| C: Keep Secret Manager | SEC-01 as written; most robust, most wiring | |

**User's choice:** B — keyed + Script Properties.
**Notes:** Key decision driver was rate-limit scope (per-IP vs per-key) on shared Google egress IPs, not raw RPS. Jupiter key judged low-sensitivity → Script Properties over Secret Manager. Deviates from SEC-01 — recorded for a REQUIREMENTS/ROADMAP update; removes `Secrets.ts`, `cloud-platform` scope, `GCP_PROJECT_ID`, `SM_RESOURCE_PATH`.

---

## Claude's Discretion

- Exact HL spot price endpoint (`allMids @index` vs `spotMetaAndAssetCtxs`) — research item.
- Provider module organization (combined vs split price/balance functions).
- Script Properties bootstrap mechanism (default: one-time `setup()` helper; manual editor entry acceptable).
- OAuth scopes timing (`external_request` now; `spreadsheets`/`script.scriptapp` Phase 4).
- HTTP/JSON parsing, retry/logging details.

## Deferred Ideas

- Caching, batched `setValues`, trigger, degradation orchestration → Phase 4.
- PnL/allocation formulas + conditional formatting → Phase 5.
- Jupiter `portfolio/v1/positions` → out of scope (returns 0 for held tokens, costly).
- HL perp positions (`clearinghouseState`) → out of scope (spot only).
- Upgrading Jupiter key to Secret Manager → revisit only if throttled.
