# Phase 3: Data Layer - Context

**Gathered:** 2026-06-16
**Status:** Ready for planning

<domain>
## Phase Boundary

Build the Apps Script **data-provider layer**: callable modules that fetch live prices and on-chain balances via raw `UrlFetchApp` and return parsed, normalized data. Two providers, one per venue:

- **Hyperliquid** — spot mid prices + spot balances for BTC (`UBTC`), HYPE, XAUt (`XAUT0`).
- **Jupiter** — prices (`price/v3`) + balances (`ultra/v1/balances`) for the four Solana mints.

Plus the config plumbing those providers need: wallet addresses + the Jupiter API key in `PropertiesService` (Script Properties), and the minimal OAuth scope (`external_request`) to make outbound calls. Covers SEC-02, DATA-01, DATA-02, DATA-03 (revised), and the provider half of the data layer.

**This phase does NOT:** write anything to the sheet, batch, cache, or run on a trigger (all Phase 4 — `refreshAll()`, `PRICES_ALL` blob, `setValues`, per-provider degradation orchestration); and does NOT add any PnL/cost-basis/allocation formulas (Phase 5). Providers are pure functions that return data; Phase 4 consumes and writes it.

**Major scope changes from this discussion (verified live against the user's real wallets):**
- Solana balances come from **Jupiter `ultra/v1/balances`**, not raw Solana RPC `getTokenAccountsByOwner` → **DATA-03 rewritten**, the Solana-RPC provider (`SolanaRpc.ts`) is eliminated, and the STATE.md "public-vs-paid RPC endpoint" blocker is dissolved.
- **Manual-holdings mode dropped** → **DATA-04 descoped**, the `FETCH_BALANCES` flag is removed, balances are always fetched from both venues.
- Jupiter key lives in **Script Properties**, not GCP Secret Manager → **SEC-01 deviated**: `Secrets.ts`, the `cloud-platform` scope, `GCP_PROJECT_ID`, `SM_RESOURCE_PATH`, and `ScriptApp.getOAuthToken()` are all removed from this phase.

These deviations require a REQUIREMENTS.md + ROADMAP.md update (see Requirements Impact below).

</domain>

<decisions>
## Implementation Decisions

### Balances source (DATA-03, revised)
- **D-01:** Solana balances are fetched from **Jupiter Ultra**: `GET https://api.jup.ag/ultra/v1/balances/{SOL_WALLET_ADDRESS}`, which returns per-mint `{amount, uiAmount}` for all wallet token accounts. Verified live against the user's wallet — returns real holdings (the `portfolio/v1/positions` endpoint the user originally tried returns `0` because it only reports DeFi positions opened *through* Jupiter; that endpoint stays out of scope). No Solana RPC is used; `SolanaRpc.ts` is not built.
- **D-02:** Hyperliquid balances are fetched from `POST https://api.hyperliquid.xyz/info` body `{"type":"spotClearinghouseState","user":HL_WALLET_ADDRESS}`, which returns spot balances keyed by coin (`UBTC`, `HYPE`, `XAUT0`, plus untracked `USDC`/`MAX`). Verified live.
- **D-03:** Both venues' balances are **always fetched** — no `FETCH_BALANCES` flag, no manual-entry fallback. (DATA-04 descoped, see Requirements Impact.)

### Asset registry — real values confirmed on-chain (resolves the Phase-3 blocker)
- **D-04:** The four Solana `PLACEHOLDER_MINT_phase3` values in `assets.json` are replaced with verified mints (resolved via Jupiter token metadata):
  - `IVVon` → `CqW2pd6dCPG9xKZfAsTovzDsMmAGKJSDBNcwM96ondo` (iShares Core S&P 500 ETF, Ondo tokenized)
  - `PST` → `59obFNBzyTBGowrkif5uK7ojS58vsuWz3ZCvg6tfZAGw` (PayFi Strategy Token USDC)
  - `ONyc` → `5Y8NV33Vv7WbnLfq3zBcKSdYPrk7g2KoiQoe7M2tcxp5` (Onchain Yield Coin)
  - `USDy` → `A1KLoBrKBde8Ty9qtNQUtq3C2ortoC3u7twggz7sEto6` (Ondo US Dollar Yield / USDY)
- **D-05:** The XAUt `PLACEHOLDER_TICKER_phase3` and the HL ticker fields are replaced with the **spot** token names the user actually holds, and all three HL assets are priced from **Hyperliquid spot** (not perp):
  - `BTC` → ticker `UBTC` (bridged "Unit BTC" spot token; tracks BTC 1:1)
  - `HYPE` → ticker `HYPE` (spot)
  - `XAUt` → ticker `XAUT0` (spot, token index 297)
  - **Rationale:** the user holds spot, and accurate PnL (the core value) requires the price of what's held. `allMids` keys perps by symbol but spot tokens by pair index (`@N`), and `XAUT0` has no perp — so the provider must use the HL spot price path (exact endpoint, `allMids @index` vs `spotMetaAndAssetCtxs`, is a research item — see canonical refs).

### Jupiter auth (SEC-01, deviated → Option B)
- **D-06:** Use the **keyed** Jupiter endpoint `api.jup.ag` with an `x-api-key` header for both prices and balances. Rationale: keyless `lite-api.jup.ag` works at this cadence (~1 call/5 min ≪ 0.5 RPS) but is rate-limited **per-IP**, and `UrlFetchApp` egresses from shared Google IPs → risk of neighbor-induced 429s. The keyed tier is rate-limited **per-key**, insulating the refresh.
- **D-07:** The Jupiter key is stored in **`PropertiesService` Script Property `JUP_API_KEY`** — **not** GCP Secret Manager. Rationale: the key is low-sensitivity (read-only price data, free, instantly rotatable, no funds access); Secret Manager's IAM/audit value doesn't justify its wiring cost for a personal single-user script. This removes `Secrets.ts`, the `cloud-platform` OAuth scope, `GCP_PROJECT_ID`, `SM_RESOURCE_PATH`, and `ScriptApp.getOAuthToken()` from the phase.

### Prices (DATA-01, DATA-02)
- **D-08:** Hyperliquid prices for `UBTC`/`HYPE`/`XAUT0` come from one HL spot call (all spot mids in a single response — keeps the venue at ~2 calls total). Jupiter prices come from one `GET https://api.jup.ag/price/v3?ids={mint1,mint2,...}` call (all four mints in one request, ≤50/req). Net per-refresh cost: ~2 HL + ~2 Jupiter = **~4 HTTP calls**, independent of asset count.

### Provider return contract
- **D-09:** Each provider returns a map **keyed by asset `id`** (`BTC`, `HYPE`, `XAUt`, `IVVon`, ...) → `{ price, qty }`, with the raw ticker→id and mint→id translation hidden **inside** each provider. Phase 4's orchestrator and the sheet writer stay venue-agnostic and just merge maps. (Chosen as a maintainability preference — confirmed to have **zero** API/performance impact; call count is fixed by D-08 regardless of map shape.)
- **D-10:** **Fail loud:** if a tracked asset id is absent from a provider's API response (wrong mint, bad ticker, outage), the provider **throws**. This composes with Phase 4's per-provider `try/catch` + last-good cache: permanent config errors stay visible (that venue reads stale until fixed), while transient outages self-heal on the next successful fetch. One bad id therefore stales only its own venue, never the other.
- **D-13 (resolves Phase-3 research Open Question #1 — refines D-10 for balances):** The fail-loud rule applies **asymmetrically across price vs balance**:
  - **Prices:** a tracked id missing from a price response = wrong mint/ticker (config error) → **throw** (strict D-10).
  - **Balances:** a tracked id **cleanly absent** from a balances response = a legitimate **zero holding** (sold out) → return **qty 0**, do **not** throw. Jupiter `ultra/v1/balances` and HL `spotClearinghouseState` only list non-zero/owned token accounts, so absence is normal.
  - **Both:** an HTTP non-200, a malformed/unparseable body, or a missing top-level structure still **throws** (transient outage / API change stays loud and stales that venue via Phase 4's catch). Rationale: a real config error surfaces as a missing *price*; a missing *balance* must not stale the whole venue just because one asset was sold to zero.

### Config / secrets surface (SEC-02)
- **D-11:** Script Properties for this phase: `HL_WALLET_ADDRESS`, `SOL_WALLET_ADDRESS`, `JUP_API_KEY`. All read from `PropertiesService`, absent from committed source. The literal wallet addresses + key are **not** recorded in this committed CONTEXT (honoring SEC-02); the user holds them and sets them at setup. (Both wallet addresses are public read-only and were confirmed live during discussion.)
- **D-12:** New editor-callable globals (if any are added this phase for ad-hoc testing/setup) follow the Phase 1 mechanism: add to the `entry.ts` `__ENTRY__` object **and** the `ENTRY_GLOBALS` array in `scripts/appendGlobals.ts`. Provider functions themselves are internal (called by Phase 4's `refreshAll`), not editor entry points.

### Requirements Impact (MUST update before/at planning)
- **DATA-03** — reword from "raw RPC `getTokenAccountsByOwner` gated behind `FETCH_BALANCES`" to "Solana balances via Jupiter `ultra/v1/balances`, always fetched."
- **DATA-04** — mark **descoped** (no manual-holdings mode; balances always fetched). Roadmap Phase 3 SC#4 likewise rewrites.
- **SEC-01** — reword from "Jupiter key in GCP Secret Manager via `ScriptApp.getOAuthToken()`" to "Jupiter key in `PropertiesService` (`JUP_API_KEY`)"; Secret Manager removed.
- **DATA-01** — clarify HL prices are **spot** (`UBTC`/`HYPE`/`XAUT0`), not perp `allMids`-by-symbol.
- ROADMAP.md Phase 3 goal mentions "Secret Manager", "`getTokenAccountsByOwner`", and "manual-holdings fallback when the balance flag is off" — all three need editing to match D-01/D-03/D-07.

### Claude's Discretion
- Exact HL spot price endpoint (`allMids` `@index` lookup vs `spotMetaAndAssetCtxs`) — research item; pick whichever cleanly yields a mid for `UBTC`/`HYPE`/`XAUT0`.
- Provider file/module organization (e.g. one combined `HyperliquidApi.ts` returning prices+balances vs split price/balance functions) — default to per-venue modules returning the D-09 combined map.
- How Script Properties get populated: default to a one-time `setup()` helper run once from the editor (cleaner than hand-typing into the Properties UI); manual entry is an acceptable alternative.
- OAuth scopes in `appsscript.json`: this phase only needs `external_request`; `spreadsheets` + `script.scriptapp` land in Phase 4. Adding them now (forward-looking) is fine but not required.
- HTTP/JSON parsing details, retry-on-429 behavior within a single call, and logging of raw responses while wiring up ticker/mint mapping (per CONVENTIONS logging guidance).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase requirements & boundaries
- `.planning/REQUIREMENTS.md` — SEC-01, SEC-02, DATA-01–04 (read alongside the **Requirements Impact** list above — several are revised/descoped this phase)
- `.planning/ROADMAP.md` §"Phase 3: Data Layer" — goal + 4 success criteria (SC#4 and the goal's "Secret Manager / getTokenAccountsByOwner / FETCH_BALANCES" wording superseded by D-01/D-03/D-07)
- `.planning/PROJECT.md` — Constraints (no-SDK raw-HTTP rule, read-only/no-private-keys boundary, two-runtime isolation) and Key Decisions table

### External API specs (verified live during this discussion)
- Jupiter Ultra "Get Balances": `https://dev.jup.ag/docs/ultra-api/get-balances` (redirects to `developers.jup.ag`) — `GET /ultra/v1/balances/{wallet}`, per-mint `{amount, uiAmount}`; `api.jup.ag` (keyed) vs `lite-api.jup.ag` (keyless)
- Jupiter Price API: `GET /price/v3?ids={mints}` (≤50 mints/req), `x-api-key` header
- Hyperliquid info endpoint: `POST https://api.hyperliquid.xyz/info` — `{"type":"spotClearinghouseState","user":...}` (spot balances), `{"type":"allMids"}` / `{"type":"spotMetaAndAssetCtxs"}` (spot mids; XAUT0 = token index 297)
- `.planning/codebase/INTEGRATIONS.md` — pre-existing integration notes; **note it predates these decisions** (it still lists Solana RPC + Secret Manager + Jupiter Portfolio — superseded by D-01/D-02/D-07)

### Existing scaffold to extend
- `apps-script/src/Config.ts` — `ASSETS` registry (inlined from `assets.json`), `Asset` interface, `REFRESH_INTERVAL_MINUTES`/`CACHE_TTL_SECONDS`; providers read `ASSETS`
- `apps-script/src/entry.ts` + `apps-script/scripts/appendGlobals.ts` + `apps-script/src/globals.d.ts` — the `__ENTRY__` + post-build top-level-shim mechanism for editor-callable globals (D-12)
- `apps-script/appsscript.json` — `oauthScopes` currently `[]`; this phase adds `external_request`
- `assets.json` (repo root) — D-04/D-05 write the real mints + HL spot tickers here (single source of truth, inlined by `bun build`)
- `.planning/codebase/ARCHITECTURE.md` — provider-isolation pattern, no-SDK rule, build-time vs run-time split
- `.planning/codebase/CONVENTIONS.md` — PascalCase Apps Script filenames, per-provider try/catch, single-batch-write rule (Phase 4), logging guidance
- `.planning/phases/01-foundation/01-CONTEXT.md` — entry/globals mechanism, shared `assets.json` rationale
- `CLAUDE.md` (root) — Bun-first tooling, RTK prefix, two-runtime boundary

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `Config.ts` `ASSETS` + `Asset` interface — providers iterate this; D-04/D-05 just fill the `mint`/`ticker` values. The interface already has `venue`, `ticker?`, `mint?` — no shape change needed (note: `Secrets`-related fields are not in it, and now never will be).
- `entry.ts` / `appendGlobals.ts` pattern — reuse verbatim if any setup/test global is exposed; do not invent a new global mechanism.

### Established Patterns
- Raw `UrlFetchApp` only, no SDKs (project constraint) — both providers are raw HTTP.
- Per-provider isolation (independent try/catch) — D-10 fail-loud is designed to compose with this at the Phase 4 orchestrator level.
- `bun build` inlines `assets.json` into `Code.js` — real mints/tickers ship inlined; no runtime file dependency.

### Integration Points
- Providers are consumed by Phase 4's `refreshAll()` (not yet built) — D-09 return contract is that interface. Nothing in this phase writes to the sheet.
- `PropertiesService` is the new runtime config surface this phase introduces (`HL_WALLET_ADDRESS`, `SOL_WALLET_ADDRESS`, `JUP_API_KEY`).

</code_context>

<specifics>
## Specific Ideas

- **Verified, not assumed:** every external fact in D-01/D-02/D-04/D-05 was confirmed by live calls to the user's actual wallets during discussion (Solana `9cCTyVCn…qsB`, Hyperliquid `0x2594…12fc`). Downstream agents should treat the mints/tickers as ground-truth, not placeholders.
- **`portfolio/v1/positions` is a trap:** it returns `0` for plainly-held tokens (only tracks Jupiter-platform DeFi positions) and is the costly out-of-scope endpoint. Use `ultra/v1/balances`. Document this inline so it isn't "fixed" back later.
- **BTC is `UBTC`:** do not query Hyperliquid for a coin literally named `BTC` for the spot holding — the wallet holds the bridged `UBTC` spot token. Perp `BTC` exists but is a different instrument.
- **Keyed-but-not-Secret-Manager** is a deliberate middle path (Option B): the per-key rate-limit insulation is the part that matters on shared Apps Script IPs; Secret Manager's extra protection is not worth its wiring for this key.

</specifics>

<deferred>
## Deferred Ideas

- Caching (`PRICES_ALL` blob, TTL), single batched `setValues` write, time-driven trigger, and per-provider graceful-degradation orchestration → **Phase 4** (REFRESH-01..04). D-10's fail-loud assumes the Phase 4 catch/last-good layer exists.
- PnL / cost-basis / allocation formulas + conditional formatting → **Phase 5**.
- Jupiter `portfolio/v1/positions` multi-protocol position tracking → out of scope (REQUIREMENTS, reconfirmed: returns 0 for held tokens, 100 credits/call).
- Hyperliquid perp positions (`clearinghouseState`) → not held / out of scope; only spot is tracked.
- Upgrading Jupiter key storage to Secret Manager → only if shared-IP throttling proves insufficient or the key sensitivity changes (revisit, not planned).

None of these are scope creep into Phase 3 — they are explicitly later-phase or out-of-scope concerns surfaced while scoping the providers.

</deferred>

---

*Phase: 3-Data Layer*
*Context gathered: 2026-06-16*
