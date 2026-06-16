# Phase 3: Data Layer - Research

**Researched:** 2026-06-16
**Domain:** Apps Script raw-HTTP data providers (Hyperliquid + Jupiter) over `UrlFetchApp`
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Solana balances via Jupiter Ultra `GET https://api.jup.ag/ultra/v1/balances/{SOL_WALLET_ADDRESS}` (per-mint `{amount, uiAmount}`). No Solana RPC; `SolanaRpc.ts` is NOT built. `portfolio/v1/positions` stays out of scope (returns 0 for held tokens).
- **D-02:** Hyperliquid balances via `POST https://api.hyperliquid.xyz/info` body `{"type":"spotClearinghouseState","user":HL_WALLET_ADDRESS}` — spot balances keyed by coin (`UBTC`, `HYPE`, `XAUT0`, plus untracked `USDC`/`MAX`).
- **D-03:** Both venues' balances are **always fetched** — no `FETCH_BALANCES` flag, no manual fallback (DATA-04 descoped).
- **D-04:** Four Solana mints written to `assets.json`: `IVVon`→`CqW2pd6dCPG9xKZfAsTovzDsMmAGKJSDBNcwM96ondo`, `PST`→`59obFNBzyTBGowrkif5uK7ojS58vsuWz3ZCvg6tfZAGw`, `ONyc`→`5Y8NV33Vv7WbnLfq3zBcKSdYPrk7g2KoiQoe7M2tcxp5`, `USDy`→`A1KLoBrKBde8Ty9qtNQUtq3C2ortoC3u7twggz7sEto6`.
- **D-05:** HL spot tickers in `assets.json`: `BTC`→`UBTC`, `HYPE`→`HYPE`, `XAUt`→`XAUT0` (token index 297). All three priced from **Hyperliquid spot**, not perp.
- **D-06:** Use **keyed** `api.jup.ag` with `x-api-key` header for both prices and balances (insulates from shared-Google-IP 429s on the keyless `lite-api.jup.ag` tier).
- **D-07:** Jupiter key in `PropertiesService` Script Property `JUP_API_KEY` — NOT GCP Secret Manager. Removes `Secrets.ts`, `cloud-platform` scope, `GCP_PROJECT_ID`, `SM_RESOURCE_PATH`, `ScriptApp.getOAuthToken()`.
- **D-08:** ~2 HL calls (1 prices + 1 balances) + ~2 Jupiter calls (1 prices + 1 balances) = **~4 HTTP calls/refresh**, independent of asset count. HL prices: one spot call returns all three mids. Jupiter prices: one `price/v3?ids={4 mints}` call (≤50/req).
- **D-09:** Each provider returns a map **keyed by asset `id`** (`BTC`, `HYPE`, `XAUt`, `IVVon`, ...) → `{ price, qty }`. Ticker→id and mint→id translation hidden **inside** each provider.
- **D-10:** **Fail loud** — if a tracked asset id is absent from a provider's response, the provider **throws** (composes with Phase 4's per-provider try/catch + last-good cache).
- **D-11:** Script Properties this phase: `HL_WALLET_ADDRESS`, `SOL_WALLET_ADDRESS`, `JUP_API_KEY`. Read from `PropertiesService`, absent from committed source. Literal values NOT in committed docs (SEC-02).
- **D-12:** New editor-callable globals follow the Phase 1 mechanism: add to `entry.ts` `__ENTRY__` object AND `ENTRY_GLOBALS` array in `scripts/appendGlobals.ts`. Provider functions themselves are internal (not editor entry points).

### Claude's Discretion
- Exact HL spot price endpoint (`allMids` `@index` lookup vs `spotMetaAndAssetCtxs`) — research item; pick whichever cleanly yields a mid. **→ This research recommends `spotMetaAndAssetCtxs` (see Pattern 1).**
- Provider file/module organization — default to per-venue modules returning the D-09 combined map.
- How Script Properties get populated — default to a one-time `setup()` helper run once from the editor; manual entry acceptable.
- OAuth scopes in `appsscript.json` — this phase only needs `external_request`; adding `spreadsheets`/`script.scriptapp` now is fine but not required.
- HTTP/JSON parsing details, retry-on-429 behavior within a single call, logging raw responses during bring-up.

### Deferred Ideas (OUT OF SCOPE)
- Caching (`PRICES_ALL` blob, TTL), single batched `setValues` write, time-driven trigger, per-provider graceful-degradation orchestration → **Phase 4**.
- PnL / cost-basis / allocation formulas + conditional formatting → **Phase 5**.
- Jupiter `portfolio/v1/positions` → out of scope (returns 0 for held tokens, 100 credits/call).
- Hyperliquid perp positions (`clearinghouseState`) → not held / out of scope; only spot.
- Upgrading Jupiter key to Secret Manager → revisit only if shared-IP throttling proves insufficient.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SEC-01 | Jupiter key in `PropertiesService` (`JUP_API_KEY`), read at call time, absent from source | `PropertiesService.getScriptProperties().getProperty("JUP_API_KEY")` pattern; passed as `x-api-key` header (Pattern 3). No Secret Manager. |
| SEC-02 | Wallet addresses + runtime config in `PropertiesService`, not hardcoded | Same `PropertiesService` read for `HL_WALLET_ADDRESS`, `SOL_WALLET_ADDRESS`; fail-loud if a required property is missing (Pitfall 4). |
| DATA-01 | HL **spot** mid prices for `UBTC`/`HYPE`/`XAUT0` via raw `UrlFetchApp` | `spotMetaAndAssetCtxs` one-call path: name→token index→pair index→ctx `midPx` (Pattern 1). |
| DATA-02 | Jupiter prices for Solana mints via keyed `api.jup.ag` `price/v3` | `GET /price/v3?ids={mints}` mint-keyed response, `usdPrice` field (Pattern 2). |
| DATA-03 | Solana balances via Jupiter `ultra/v1/balances`, always fetched | `GET /ultra/v1/balances/{wallet}` mint-keyed, `uiAmount` = human qty (Pattern 4). |
</phase_requirements>

## Summary

This phase wires two raw-HTTP provider modules inside the Apps Script V8 runtime, with all network I/O through `UrlFetchApp` (no SDKs, no npm). The only genuinely open research item — the Hyperliquid spot price path — is now **resolved**: use `POST /info {"type":"spotMetaAndAssetCtxs"}`, a single call that returns the spot metadata and per-pair asset contexts together. Map each tracked token name (`UBTC`/`HYPE`/`XAUT0`) → its entry in the `tokens` array → its `index` → the `universe` pair whose `tokens` array contains that index paired with USDC (token 0) → read `midPx` from the aligned asset-contexts array at the same position. This avoids string-parsing the `@N` keys that `allMids` uses for spot, and yields all three mids from one response — satisfying D-08's "one HL prices call" budget.

The remaining provider shapes are confirmed: Jupiter `price/v3` returns a **mint-keyed** object with `usdPrice`; Jupiter `ultra/v1/balances` returns a **mint-keyed** object (native SOL keyed as the string `"SOL"`) with `amount` (raw integer string) and `uiAmount` (human-readable decimal-adjusted number — use this for qty); Hyperliquid `spotClearinghouseState` returns `{ balances: [{ coin, total, hold, ... }] }` where `total` is the human-readable balance keyed by coin name. All four are accessed over `UrlFetchApp` with `muteHttpExceptions: true` so the provider reads `getResponseCode()` and throws a descriptive error rather than letting Apps Script throw an opaque exception.

Security surface is minimal and already decided: three Script Properties (`HL_WALLET_ADDRESS`, `SOL_WALLET_ADDRESS`, `JUP_API_KEY`) read via `PropertiesService` at call time; one new OAuth scope (`external_request`). No private keys, all read-only, key is low-sensitivity and instantly rotatable.

**Primary recommendation:** Build two per-venue modules (`HyperliquidApi.ts`, `JupiterApi.ts`), each exposing one internal function returning a `Record<id, {price, qty}>` map; price HL spot via `spotMetaAndAssetCtxs` (single call, index-aligned `midPx`); use `muteHttpExceptions:true` + `getResponseCode()` checks everywhere; throw on any missing tracked id (D-10). Add a one-time `setup()` editor global for populating Script Properties.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Hyperliquid spot prices (`UBTC`/`HYPE`/`XAUT0`) | API / Backend (Apps Script) | — | All external fetches run in the scheduled Apps Script V8 runtime; no client tier exists. |
| Hyperliquid spot balances | API / Backend (Apps Script) | — | Same runtime; `spotClearinghouseState` is a public read keyed by public wallet. |
| Jupiter Solana prices | API / Backend (Apps Script) | — | Keyed `api.jup.ag` call; key lives in Script Properties (config tier). |
| Jupiter Solana balances | API / Backend (Apps Script) | — | `ultra/v1/balances` public read keyed by public wallet. |
| Secret/config storage (`JUP_API_KEY`, wallet addresses) | Config / Storage (`PropertiesService`) | — | Script-scoped key/value store; not Secret Manager (D-07). |
| Provider→sheet write, cache, trigger | **OUT OF SCOPE** (Phase 4) | — | Providers are pure data functions; orchestration is Phase 4. |

## Standard Stack

This phase introduces **no new packages**. The Apps Script runtime (Google V8) has no module resolution; all capabilities come from built-in Apps Script services and raw HTTP.

### Core
| Capability | Provided By | Purpose | Why Standard |
|------------|-------------|---------|--------------|
| Outbound HTTP | `UrlFetchApp` (built-in) | POST/GET to HL + Jupiter | Only network primitive available in Apps Script; project's no-SDK rule. |
| Config/secret read | `PropertiesService.getScriptProperties()` (built-in) | Read `JUP_API_KEY`, wallet addresses | Script-scoped KV store; D-07/D-11 surface. |
| Logging | `Logger.log` / `console.log` (built-in) | Log raw responses during bring-up | Native; no scope gate (CONVENTIONS logging guidance). |
| JSON parse | `JSON.parse` (V8 built-in) | Parse response bodies | Native. |

### Supporting (already installed — dev/build only, not runtime)
| Package | Version | Purpose | When Used |
|---------|---------|---------|-----------|
| `@google/clasp` | latest (devDep) | `clasp push` of `dist/` | Deploy step only. |
| `@types/google-apps-script` | latest (devDep) | TS typings for `UrlFetchApp`, `PropertiesService`, etc. | Compile-time only; no runtime presence. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `spotMetaAndAssetCtxs` for HL prices | `allMids` + parse `@N` spot keys | `allMids` keys spot by `@{pairIndex}` (e.g. HYPE = `@107`), requiring a *separate* `spotMeta` call anyway to compute the pair index, then string-key lookup. `spotMetaAndAssetCtxs` returns meta + ctxs in **one** call with positional alignment — fewer calls, no string parsing. |
| Keyed `api.jup.ag` | Keyless `lite-api.jup.ag` | Keyless is per-IP rate-limited; Apps Script egresses from shared Google IPs → neighbor-induced 429 risk (D-06). |
| Jupiter `ultra/v1/balances` | Solana RPC `getTokenAccountsByOwner` | RPC eliminated (D-01); public RPC rate-limits at 5-min cadence and needs decimals lookup per mint. `ultra/v1/balances` returns `uiAmount` pre-adjusted. |

**Installation:** None. (Verify build still works: `cd apps-script && bun run build`.)

## Package Legitimacy Audit

> This phase installs **no external packages**. The Apps Script runtime has no npm. Existing dev-dependencies (`@google/clasp`, `@types/google-apps-script`) were vetted in Phase 1 and are unchanged.

| Package | Registry | Disposition |
|---------|----------|-------------|
| (none added) | — | No installs this phase. |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
Phase 4 refreshAll()  [NOT built this phase — consumer]
        │ calls (internal, no editor exposure)
        ├──────────────────────────┐
        ▼                          ▼
  HyperliquidApi.ts          JupiterApi.ts
   getHyperliquidData()       getJupiterData()
        │                          │
   reads ASSETS                reads ASSETS (venue==="solana" mints)
   (venue==="hyperliquid")     reads JUP_API_KEY, SOL_WALLET_ADDRESS
   reads HL_WALLET_ADDRESS     via PropertiesService
   via PropertiesService            │
        │                          │
   ┌────┴─────┐              ┌──────┴───────┐
   ▼          ▼              ▼              ▼
 POST /info  POST /info    GET price/v3   GET ultra/v1/
 spotMeta-   spotClearing  ?ids={mints}   balances/{wallet}
 AndAssetCtxs houseState    x-api-key      x-api-key
 (prices)    (balances)    (prices)       (balances)
   │          │              │              │
   ▼          ▼              ▼              ▼
 name→idx→   coin→total    mint→usdPrice  mint→uiAmount
 pair→midPx                                (SOL key special)
   │          │              │              │
   └────┬─────┘              └──────┬───────┘
        ▼                          ▼
  Record<id,{price,qty}>     Record<id,{price,qty}>
  throws if tracked id       throws if tracked id
  absent (D-10)              absent (D-10)
```

Each provider makes exactly 2 calls (prices + balances), merges them by asset `id` internally, and returns one map. Phase 4 merges the two venue maps.

### Recommended Project Structure
```
apps-script/src/
├── Config.ts            # ASSETS registry (D-04/D-05 fill mint/ticker) — EXISTS
├── entry.ts             # add setup() to __ENTRY__ if exposing a setup global (D-12)
├── Hello.ts             # Phase 1 smoke test — unchanged
├── HyperliquidApi.ts    # NEW: getHyperliquidData() → Record<id,{price,qty}>
├── JupiterApi.ts        # NEW: getJupiterData() → Record<id,{price,qty}>
├── Properties.ts        # NEW (optional): typed getScriptProp() reader + setup() helper
└── globals.d.ts         # add setup global decl if exposed
apps-script/scripts/
└── appendGlobals.ts     # add "setup" to ENTRY_GLOBALS if exposed (D-12)
```

**Apps Script cross-file note:** CONVENTIONS forbids `import`/`export` between `apps-script/src/*.ts` *unless the bundler inlines to one file*. The project uses `bun build src/entry.ts --format=iife --outfile=dist/Code.js`, which **does** bundle everything reachable from `entry.ts` into a single `Code.js`. Therefore `import { ... }` between source files is SAFE here (it's how `entry.ts` already imports `Hello` and `Config`). Providers should be imported into `entry.ts` (directly or transitively) so the bundler retains them. A provider that nothing imports is tree-shaken out.

### Pattern 1: Hyperliquid spot mid via `spotMetaAndAssetCtxs` (RECOMMENDED — resolves the open item)
**What:** One POST returns `[meta, ctxs]`. `meta.tokens` gives name→token-index; `meta.universe` gives pair entries with `tokens:[tokenIdx, quoteIdx]` and positional `index`; `ctxs[i]` aligns with `meta.universe[i]` and carries `midPx`.
**When to use:** Pricing spot tokens (`UBTC`/`HYPE`/`XAUT0`) where you need a USD mid and want a single call.
**Traversal for one token name → mid:**
1. `tokenIndex = meta.tokens.find(t => t.name === ticker).index`
2. `pairPos = meta.universe.findIndex(u => u.tokens[0] === tokenIndex && u.tokens[1] === 0)` (token 0 = USDC quote)
3. `midPx = ctxs[pairPos].midPx` (string → `Number()`)

```typescript
// Source: https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint/spot
// [VERIFIED: Hyperliquid docs] response is a 2-element array [meta, ctxs]; ctxs[i] aligns to meta.universe[i].
function fetchHlSpotMids(tickers: string[]): Record<string, number> {
  const res = UrlFetchApp.fetch("https://api.hyperliquid.xyz/info", {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify({ type: "spotMetaAndAssetCtxs" }),
    muteHttpExceptions: true,
  });
  if (res.getResponseCode() !== 200) {
    throw new Error(`HL spotMetaAndAssetCtxs ${res.getResponseCode()}: ${res.getContentText()}`);
  }
  const [meta, ctxs] = JSON.parse(res.getContentText()) as [
    { tokens: { name: string; index: number }[]; universe: { tokens: number[]; index: number }[] },
    { midPx: string | null }[],
  ];
  const out: Record<string, number> = {};
  for (const ticker of tickers) {
    const tok = meta.tokens.find((t) => t.name === ticker);
    if (!tok) throw new Error(`HL: token "${ticker}" not in spotMeta.tokens`); // D-10 fail loud
    const pairPos = meta.universe.findIndex((u) => u.tokens[0] === tok.index && u.tokens[1] === 0);
    if (pairPos < 0) throw new Error(`HL: no USDC spot pair for "${ticker}" (token ${tok.index})`); // D-10
    const mid = ctxs[pairPos]?.midPx;
    if (mid == null) throw new Error(`HL: null midPx for "${ticker}" (pair ${pairPos})`); // D-10
    out[ticker] = Number(mid);
  }
  return out;
}
```

> **Index sanity check (verified):** HYPE token index = 150; its spot pair is `@107` with `tokens:[150,0]`. So `universe[107].tokens === [150,0]` and `ctxs[107].midPx` is the HYPE/USDC mid. The `findIndex` above generalizes this without hardcoding 107. XAUT0 is token index 297 per D-05 — the same lookup finds its USDC pair. `[VERIFIED: Hyperliquid docs + WebSearch cross-check]`

### Pattern 2: Jupiter prices via `price/v3` (mint-keyed)
**What:** `GET /price/v3?ids={comma-joined mints}` returns an object keyed by mint with `usdPrice`.
**When to use:** Pricing the four Solana mints in one call (≤50 ids/req).

```typescript
// Source: https://dev.jup.ag/docs/price/v3  [VERIFIED: Jupiter docs + WebSearch]
function fetchJupPrices(mints: string[], apiKey: string): Record<string, number> {
  const url = `https://api.jup.ag/price/v3?ids=${mints.join(",")}`;
  const res = UrlFetchApp.fetch(url, {
    method: "get",
    headers: { "x-api-key": apiKey },
    muteHttpExceptions: true,
  });
  if (res.getResponseCode() !== 200) {
    throw new Error(`Jupiter price/v3 ${res.getResponseCode()}: ${res.getContentText()}`);
  }
  const data = JSON.parse(res.getContentText()) as Record<string, { usdPrice: number; decimals: number } | undefined>;
  const out: Record<string, number> = {};
  for (const mint of mints) {
    const entry = data[mint];
    if (!entry || typeof entry.usdPrice !== "number") {
      throw new Error(`Jupiter: no usdPrice for mint ${mint}`); // D-10 fail loud
    }
    out[mint] = entry.usdPrice;
  }
  return out;
}
```
Response example: `{ "So111...112": { "usdPrice": 147.47, "blockId": 348004023, "decimals": 9, "priceChange24h": 1.29 } }`.

### Pattern 3: Reading the Jupiter key + wallet addresses from Script Properties (SEC-01/SEC-02)
```typescript
// [VERIFIED: Apps Script docs] PropertiesService is the script-scoped KV store.
function getScriptProp(name: string): string {
  const v = PropertiesService.getScriptProperties().getProperty(name);
  if (!v) throw new Error(`Missing Script Property: ${name}`); // fail loud, never silent default
  return v;
}
// usage: getScriptProp("JUP_API_KEY"), getScriptProp("HL_WALLET_ADDRESS"), getScriptProp("SOL_WALLET_ADDRESS")
```
Optional one-time setup global (D-12 discretion):
```typescript
// Run ONCE from the editor, then DELETE the literal values from the function body,
// or prompt-set them. Editor-exposed via __ENTRY__ + appendGlobals (D-12).
function setup(): void {
  PropertiesService.getScriptProperties().setProperties({
    HL_WALLET_ADDRESS: "0x...",   // user fills, runs once
    SOL_WALLET_ADDRESS: "9cC...", // user fills, runs once
    JUP_API_KEY: "...",           // user fills, runs once
  });
}
```
> ⚠️ If `setup()` is committed with literal values it would violate SEC-02. Recommend either (a) leave placeholders the user edits locally and never commits real values, or (b) have the user set properties via the Apps Script Project Settings UI and skip the helper. The planner should add a `checkpoint:human-verify` confirming no real wallet/key literals land in committed source.

### Pattern 4: Jupiter balances via `ultra/v1/balances` (mint-keyed, SOL special)
**What:** `GET /ultra/v1/balances/{wallet}` returns an object keyed by **mint address** for SPL tokens (native SOL keyed by the literal string `"SOL"`), each `{ amount, uiAmount, slot, isFrozen }`. `amount` = raw integer string; `uiAmount` = decimal-adjusted human number → **use `uiAmount` for qty**.

```typescript
// Source: https://dev.jup.ag/docs/ultra-api/get-balances  [VERIFIED: Jupiter docs + WebSearch]
function fetchJupBalances(wallet: string, mints: string[], apiKey: string): Record<string, number> {
  const res = UrlFetchApp.fetch(`https://api.jup.ag/ultra/v1/balances/${wallet}`, {
    method: "get",
    headers: { "x-api-key": apiKey },
    muteHttpExceptions: true,
  });
  if (res.getResponseCode() !== 200) {
    throw new Error(`Jupiter balances ${res.getResponseCode()}: ${res.getContentText()}`);
  }
  const data = JSON.parse(res.getContentText()) as Record<string, { uiAmount: number } | undefined>;
  const out: Record<string, number> = {};
  for (const mint of mints) {
    const entry = data[mint];
    // A wallet with ZERO of a tracked mint may omit the key. Decide with the planner:
    // strict D-10 → throw; lenient → qty 0. See Pitfall 2.
    if (!entry || typeof entry.uiAmount !== "number") {
      throw new Error(`Jupiter: no balance entry for mint ${mint}`); // D-10 (strict)
    }
    out[mint] = entry.uiAmount;
  }
  return out;
}
```
Response example: `{ "SOL": { "amount": "0", "uiAmount": 0, "slot": 324307186, "isFrozen": false }, "<mint>": { ... } }`.

### Pattern 5: Hyperliquid spot balances via `spotClearinghouseState`
**What:** `POST /info {"type":"spotClearinghouseState","user":WALLET}` → `{ balances: [{ coin, token, hold, total, entryNtl }] }`. `total` = full human-readable balance; keyed by `coin` name (`UBTC`/`HYPE`/`XAUT0`, plus untracked `USDC`/`MAX`).

```typescript
// Source: https://hyperliquid.gitbook.io/.../info-endpoint/spot  [VERIFIED: Hyperliquid docs]
function fetchHlBalances(wallet: string, tickers: string[]): Record<string, number> {
  const res = UrlFetchApp.fetch("https://api.hyperliquid.xyz/info", {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify({ type: "spotClearinghouseState", user: wallet }),
    muteHttpExceptions: true,
  });
  if (res.getResponseCode() !== 200) {
    throw new Error(`HL spotClearinghouseState ${res.getResponseCode()}: ${res.getContentText()}`);
  }
  const { balances } = JSON.parse(res.getContentText()) as { balances: { coin: string; total: string }[] };
  const byCoin: Record<string, string> = {};
  for (const b of balances) byCoin[b.coin] = b.total;
  const out: Record<string, number> = {};
  for (const ticker of tickers) {
    const total = byCoin[ticker];
    if (total == null) throw new Error(`HL: no spot balance for "${ticker}"`); // D-10 (strict)
    out[ticker] = Number(total);
  }
  return out;
}
```

### Anti-Patterns to Avoid
- **Calling `allMids` for spot prices and reading by symbol** — spot tokens are NOT keyed by symbol in `allMids`; they're `@{pairIndex}`. Reading `mids["HYPE"]` returns the *perp* mid (wrong instrument). Use Pattern 1.
- **Querying coin `BTC` for the spot BTC holding** — the wallet holds bridged `UBTC` (a different spot token). Perp `BTC` exists but is a different instrument (CONTEXT specifics).
- **Using `portfolio/v1/positions`** — returns 0 for plainly-held tokens (only Jupiter-platform DeFi positions) and costs 100 credits/call. Out of scope; document inline so it isn't "fixed" back.
- **Letting `UrlFetchApp` throw on 4xx/5xx** — without `muteHttpExceptions:true`, Apps Script throws an opaque exception you can't inspect. Always mute + check `getResponseCode()`.
- **Reading `amount` instead of `uiAmount`** — `amount` is the raw integer string (needs decimals division); `uiAmount` is already human-readable.
- **Cross-file `import` assumption inverted** — do NOT avoid imports here; the IIFE bundler inlines them. The real rule is: anything not reachable from `entry.ts` gets tree-shaken out.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Decimal-adjusting raw token amounts | Per-mint `amount / 10^decimals` math | Jupiter `uiAmount` field | Already decimal-adjusted; avoids a decimals lookup and rounding bugs. |
| HL spot pair index lookup | Hardcoded `@107`/`@297` constants | `findIndex` over `universe.tokens` (Pattern 1) | Indices can shift as HL adds pairs; derive from response. |
| HTTP client / retry framework | Custom fetch wrapper with backoff | `UrlFetchApp` + `muteHttpExceptions` | At ~1 call/5min, no retry framework is warranted; a single status check suffices. |
| Secret storage | Encrypting the key in source | `PropertiesService` Script Property | Built-in, not committed, instantly rotatable (D-07). |

**Key insight:** Both venues hand you human-readable numbers (`uiAmount`, `total`, `midPx`) if you pick the right endpoint — most "hand-rolling" risk here is re-deriving values the API already provides cleanly.

## Common Pitfalls

### Pitfall 1: Spot vs perp price confusion on Hyperliquid
**What goes wrong:** Reading `allMids["HYPE"]` returns the perp mid; spot price differs and `XAUT0`/`UBTC` have no/ different perp.
**Why it happens:** `allMids` keys perps by symbol, spot by `@{pairIndex}` — the same response mixes both keyings.
**How to avoid:** Use `spotMetaAndAssetCtxs` (Pattern 1); never index spot by symbol.
**Warning signs:** Price for HYPE that doesn't match the spot market; `mids["UBTC"]` undefined.

### Pitfall 2: Zero-balance mint omitted from response
**What goes wrong:** A tracked mint the wallet currently holds 0 of may be absent from `ultra/v1/balances`, and strict D-10 would throw — staling the whole venue for a legitimately-empty holding.
**Why it happens:** Balance endpoints often omit zero-balance token accounts.
**How to avoid:** Decide the policy with the planner. The CONTEXT verified all four mints currently return real holdings, so strict-throw is defensible *now*; but a future sell-to-zero would break it. Recommended: throw only when the API call itself fails or returns malformed data; treat a *missing tracked mint* as qty 0 (still distinguishes "API broken" from "holds none"). **[ASSUMED]** — confirm with user which semantics they want.
**Warning signs:** Venue goes stale right after a position is fully sold.

### Pitfall 3: Shared-IP 429 from keyless tier
**What goes wrong:** `lite-api.jup.ag` rate-limits per-IP; Apps Script egresses from shared Google IPs → neighbor traffic triggers 429.
**Why it happens:** Many scripts share the same egress IP pool.
**How to avoid:** Use keyed `api.jup.ag` with `x-api-key` (D-06). Note: Jupiter rate limits are enforced **per-account**, not strictly per-key, but the key still moves you off the shared keyless-IP bucket — which is the insulation that matters. `[VERIFIED: Jupiter docs]`
**Warning signs:** Intermittent 429s uncorrelated with your own call rate.

### Pitfall 4: Missing Script Property = silent wrong behavior
**What goes wrong:** `getProperty("JUP_API_KEY")` returns `null` if unset; an unguarded read sends `x-api-key: null` and 401s confusingly.
**Why it happens:** Properties aren't populated until `setup()` runs or the user sets them in the UI.
**How to avoid:** Wrap reads in `getScriptProp()` that throws on null/empty (Pattern 3).
**Warning signs:** 401/403 from Jupiter; HL balance call with `user: null`.

### Pitfall 5: Provider tree-shaken out of the bundle
**What goes wrong:** A provider file that nothing imports won't appear in `dist/Code.js`.
**Why it happens:** `bun build` tree-shakes unreachable code from the `entry.ts` graph.
**How to avoid:** Import the provider into `entry.ts` (Phase 4 will call it via `refreshAll`; this phase can reference it from `__ENTRY__` or a temporary test global to keep it in the bundle). Verify with a build + grep of `dist/Code.js`.
**Warning signs:** Editor can't find the function; `dist/Code.js` doesn't contain the provider name.

## Runtime State Inventory

> This phase is **greenfield provider code**, not a rename/refactor — but it introduces new runtime config state worth recording explicitly.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — providers are stateless pure fetches. | None. |
| Live service config | 3 new Script Properties: `HL_WALLET_ADDRESS`, `SOL_WALLET_ADDRESS`, `JUP_API_KEY` (live in Apps Script project, NOT in git). | User sets once via `setup()` or Project Settings UI. Planner adds a verify step. |
| OS-registered state | None. | None. |
| Secrets/env vars | `JUP_API_KEY` (low-sensitivity, read-only, rotatable) in `PropertiesService`. No private keys anywhere. | Ensure no literal lands in committed source (SEC-02). |
| Build artifacts | `assets.json` placeholders (`PLACEHOLDER_MINT_phase3`, `PLACEHOLDER_TICKER_phase3`) replaced with D-04/D-05 real values; inlined into `dist/Code.js` by `bun build`. | Edit `assets.json`; rebuild. `dist/` is gitignored, regenerated. |

## Code Examples

All verified provider code is in **Architecture Patterns** (Patterns 1–5). The D-09 return-contract assembly per venue:

```typescript
// HyperliquidApi.ts — getHyperliquidData(): Record<id, {price, qty}>
function getHyperliquidData(): Record<string, { price: number; qty: number }> {
  const wallet = getScriptProp("HL_WALLET_ADDRESS");
  const hlAssets = ASSETS.filter((a) => a.venue === "hyperliquid"); // {id, ticker}
  const tickers = hlAssets.map((a) => a.ticker!);
  const mids = fetchHlSpotMids(tickers);        // Pattern 1
  const qtys = fetchHlBalances(wallet, tickers); // Pattern 5
  const out: Record<string, { price: number; qty: number }> = {};
  for (const a of hlAssets) {
    out[a.id] = { price: mids[a.ticker!]!, qty: qtys[a.ticker!]! }; // ticker→id hidden here (D-09)
  }
  return out;
}
```
The Jupiter equivalent maps `mint → id` identically (filter `venue === "solana"`, use `a.mint`).

## State of the Art

| Old Approach (pre-CONTEXT docs) | Current Approach (D-01..D-12) | When Changed | Impact |
|--------------------------------|-------------------------------|--------------|--------|
| Solana RPC `getTokenAccountsByOwner` | Jupiter `ultra/v1/balances` | Phase 3 discuss (D-01) | No RPC endpoint choice; `uiAmount` pre-adjusted; `SolanaRpc.ts` not built. |
| Jupiter key in GCP Secret Manager | `PropertiesService` `JUP_API_KEY` | D-07 | No `Secrets.ts`, no `cloud-platform` scope, no `getOAuthToken()`. |
| HL perp `allMids` by symbol | HL spot `spotMetaAndAssetCtxs` | D-05 + this research | Correct instrument priced; one call for all three mids. |
| `FETCH_BALANCES` flag / manual mode | Always fetch both venues | D-03 (DATA-04 descoped) | Simpler; no flag plumbing. |

**Deprecated/outdated (do NOT follow):**
- `.planning/codebase/INTEGRATIONS.md` — predates these decisions; still lists Solana RPC, Secret Manager, Jupiter Portfolio, `SM_RESOURCE_PATH`, `GCP_PROJECT_ID`. **Historical only.**
- `.planning/codebase/ARCHITECTURE.md` data-flow diagram — shows `SolanaRpc getTokenAccountsByOwner if FETCH_BALANCES` and `allMids`; superseded.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Zero-balance tracked mints may be omitted from `ultra/v1/balances`; recommend treating missing-mint as qty 0 rather than strict-throw | Pitfall 2 | If user wants strict D-10 even for zero balances, semantics differ. Low risk now (all four mints return holdings live); matters after a sell-to-zero. **Confirm with user.** |
| A2 | `ultra/v1/balances` keys SPL tokens by mint and native SOL by `"SOL"` (per WebSearch example); HL token (USDC) quote index is 0 | Patterns 4 & 1 | Doc site returned 404 to the fetcher; shape taken from search snippet + CONTEXT live verification. If keying differs, lookup must adjust. Mitigated by bring-up logging of raw responses. |
| A3 | `spotMetaAndAssetCtxs` `ctxs[i]` aligns positionally with `meta.universe[i]` | Pattern 1 | If alignment differs, midPx maps to wrong pair. Verified in HL docs; mitigated by logging + the HYPE `@107` sanity check during bring-up. |

## Open Questions

1. **Zero-balance semantics for `ultra/v1/balances` / `spotClearinghouseState`**
   - What we know: All tracked assets currently return real holdings (CONTEXT live-verified).
   - What's unclear: Whether a missing tracked id (after selling to zero) should throw (strict D-10) or be qty 0.
   - Recommendation: Treat a *failed/malformed API call* as throw (D-10), but a *cleanly-absent tracked id* as qty 0. Surface to user at planning.

2. **`setup()` helper vs manual Project Settings entry for Script Properties**
   - What we know: Both work; D-12 allows a one-time editor global.
   - What's unclear: User preference; committing `setup()` with real literals would violate SEC-02.
   - Recommendation: Ship `setup()` with placeholder literals the user edits locally and never commits, OR document the Project Settings UI path. Add a `checkpoint:human-verify` for no committed secrets.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `UrlFetchApp` | All outbound HTTP | ✓ (Apps Script built-in) | V8 runtime | — |
| `PropertiesService` | SEC-01/SEC-02 config | ✓ (built-in) | V8 runtime | — |
| `external_request` OAuth scope | `UrlFetchApp` outbound | ✗ (must be added) | — | None — **blocking**, add to `appsscript.json` |
| Jupiter API key | DATA-02/DATA-03 (keyed tier) | user-provided | — | keyless `lite-api.jup.ag` (rejected by D-06) |
| `bun` (build) | Compile `src/`→`dist/Code.js` | ✓ | latest | — |
| `clasp` (deploy) | Push `dist/` | ✓ (devDep) | latest | — |

**Missing dependencies with no fallback:**
- `external_request` OAuth scope — currently `oauthScopes: []` in `appsscript.json`. Must add `"https://www.googleapis.com/auth/script.external_request"` or the providers cannot make any outbound call. This is the single hard prerequisite task.

**Missing dependencies with fallback:**
- Jupiter API key — user must provision and set `JUP_API_KEY`. (Keyless fallback exists but is explicitly rejected by D-06.)

## Project Constraints (from CLAUDE.md)

- **Bun-first tooling:** `bun build` (already wired in `apps-script/package.json`), `bun test`, `bunx`. Never `node`/`npm`/`tsc` directly.
- **RTK prefix:** prefix shell commands with `rtk` (including in `&&` chains).
- **Two-runtime boundary:** `apps-script/` has NO npm runtime; all network via `UrlFetchApp`. Never import an SDK at runtime.
- **No SDKs:** `@nktkas/hyperliquid`, `@jup-ag/api`, `gill` are forbidden — raw HTTP only.
- **TS strict mode:** `noUncheckedIndexedAccess` (indexed access is `T | undefined` — guard it; note the `!` assertions in examples assume prior throw-guards), `verbatimModuleSyntax` (use `import type`), every switch case must `break`/`return`.
- **Security:** no private keys; all access read-only; key local/Script-Property-only, never committed.
- **2-space indent, double quotes, semicolons, trailing newline.**

## Security Domain

> `security_enforcement: true`, ASVS Level 1, block on `high`.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|------------------|
| V2 Authentication | partial | Jupiter `x-api-key` from Script Property; HL/Solana reads are unauthenticated public endpoints (read-only, public wallets). |
| V3 Session Management | no | No sessions; stateless scheduled fetches. |
| V4 Access Control | no | Read-only; no privileged operations, no user input. |
| V5 Input Validation | yes | Validate/guard all API response shapes before indexing (`getResponseCode()` check, null guards, fail-loud on missing ids). Wallet addresses come from trusted Script Properties, not user input. |
| V6 Cryptography | no | No crypto operations; no signing; no private keys (hard project boundary). |
| V7 Error Handling & Logging | yes | `muteHttpExceptions` + descriptive throws; log raw responses during bring-up but avoid logging the `x-api-key` value. |
| V14 Configuration | yes | Secret in `PropertiesService` not source; minimal OAuth scope (`external_request` only this phase); key rotatable. |

### Known Threat Patterns for {Apps Script raw-HTTP provider}

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| API key leaked into committed source / logs | Information Disclosure | Store in `PropertiesService`; never `Logger.log(apiKey)`; SEC-02 verify step on commit. |
| Malformed/hostile API response crashes or mis-prices | Tampering | Status-code check + shape guards + fail-loud on missing tracked id (D-10); `Number()` parse of string fields. |
| Over-broad OAuth scope | Elevation of Privilege | Add only `external_request` this phase; defer `spreadsheets`/`script.scriptapp` to Phase 4. |
| Wrong instrument priced (perp vs spot) → bad PnL | Tampering (integrity) | Use `spotMetaAndAssetCtxs`; never index spot by symbol (Pitfall 1). |

## Sources

### Primary (HIGH confidence)
- Hyperliquid Spot API docs — `https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint/spot` — `spotMeta`, `spotMetaAndAssetCtxs` (`[meta, ctxs]`, `ctxs[i]`↔`universe[i]`, `midPx`), `spotClearinghouseState` (`balances[].coin/total`).
- Hyperliquid Info endpoint docs — `https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint` — `allMids` spot `@{pairIndex}` keying vs perp symbol keying; HYPE = `@107` (token 150, pair `[150,0]`).
- Apps Script `UrlFetchApp` reference — `https://developers.google.com/apps-script/reference/url-fetch/url-fetch-app` — `method`/`contentType`/`headers`/`payload`/`muteHttpExceptions`, `getResponseCode()`, `getContentText()`.

### Secondary (MEDIUM confidence)
- Jupiter Price API v3 — `https://dev.jup.ag/docs/price/v3` (via WebSearch snippet) — mint-keyed `{usdPrice, blockId, decimals, priceChange24h}`.
- Jupiter Ultra Get Balances — `https://dev.jup.ag/docs/ultra-api/get-balances` (via WebSearch snippet; doc site 404'd to fetcher) — mint-keyed, SOL as `"SOL"`, `{amount, uiAmount, slot, isFrozen}`.
- Jupiter rate limits — `https://dev.jup.ag/portal/rate-limit` / `https://dev.jup.ag/docs/api-faq` — per-account 60s sliding window, 429 on exceed, `X-API-Key` header.

### Tertiary (LOW confidence)
- WebSearch snippets cross-referencing the above where the live doc site returned 404 to the fetcher — flagged in Assumptions Log (A2).

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new packages; all built-in Apps Script services with official refs.
- Architecture (HL spot price path): HIGH — `spotMetaAndAssetCtxs` shape and index alignment confirmed in HL docs and cross-checked (`@107` HYPE example).
- Jupiter response shapes: MEDIUM — doc site 404'd to the fetcher; shapes from search snippets + CONTEXT live verification; mitigated by bring-up logging (A2).
- Pitfalls: HIGH — derived from documented keying quirks and project CONTEXT.

**Research date:** 2026-06-16
**Valid until:** 2026-07-16 (stable APIs; re-verify HL `universe` indices and Jupiter response shapes if more than ~30 days elapse, since spot pair indices shift as venues add markets).
