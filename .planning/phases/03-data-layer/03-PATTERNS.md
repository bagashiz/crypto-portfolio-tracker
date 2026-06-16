# Phase 3: Data Layer - Pattern Map

**Mapped:** 2026-06-16
**Files analyzed:** 8 (4 new, 4 modified)
**Analogs found:** 6 / 8 (2 providers have NO existing analog — see "No Analog Found")

## File Classification

| New/Modified File | New/Mod | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|---------|------|-----------|----------------|---------------|
| `apps-script/src/HyperliquidApi.ts` | NEW | service (provider) | request-response (HTTP fetch → map) | *(none — first `UrlFetchApp` provider)* | no-analog |
| `apps-script/src/JupiterApi.ts` | NEW | service (provider) | request-response (HTTP fetch → map) | *(none — first `UrlFetchApp` provider)* | no-analog |
| `apps-script/src/Properties.ts` | NEW (optional) | utility (config reader) | transform (KV read) | `apps-script/src/Config.ts` (module shape) | role-match |
| `apps-script/src/entry.ts` | MOD | config (entry/globals) | event-driven (editor-callable) | itself (extend existing `__ENTRY__` pattern) | exact (self) |
| `apps-script/scripts/appendGlobals.ts` | MOD | config (build shim) | batch (post-build) | itself (extend `ENTRY_GLOBALS`) | exact (self) |
| `apps-script/src/globals.d.ts` | MOD | config (ambient types) | n/a | itself (extend `declare global`) | exact (self) |
| `apps-script/appsscript.json` | MOD | config (OAuth scopes) | n/a | itself (`oauthScopes` array) | exact (self) |
| `assets.json` (repo root) | MOD | config (data) | n/a | itself (fill placeholders) | exact (self) |

> **Discretion note (D-12 / research §Recommended Structure):** `Properties.ts` and the `setup()` editor global are *optional*. If the planner chooses manual Project-Settings entry for Script Properties, `Properties.ts` may be inlined into each provider and `setup()` / `globals.d.ts` / `appendGlobals.ts` left untouched. The classification above lists the maximal set.

---

## Pattern Assignments

### `apps-script/src/HyperliquidApi.ts` (service/provider, request-response) — NO ANALOG

There is **no existing `UrlFetchApp` provider** in the codebase to copy from. Use **RESEARCH.md Patterns 1, 5, and the §Code Examples assembly** as the source of truth — they are venue-verified and already match this codebase's conventions. Mirror these *project* patterns from existing files:

**Module/import pattern** — copy from `Config.ts` lines 7, 9-31 (named `export`, JSDoc banner, `import type` for type-only). Providers are imported into `entry.ts` so the IIFE bundler retains them (research Pitfall 5):
```typescript
// from Config.ts — named exports + import type convention (verbatimModuleSyntax)
import assetsJson from "../../assets.json" with { type: "json" };
export const ASSETS: readonly Asset[] = assetsJson as readonly Asset[];
```
New file reads the registry: `import { ASSETS } from "./Config";` then `ASSETS.filter((a) => a.venue === "hyperliquid")`.

**Core fetch pattern** — RESEARCH.md Pattern 1 (`fetchHlSpotMids`, lines 174-199) and Pattern 5 (`fetchHlBalances`, lines 293-313). Two POSTs to `https://api.hyperliquid.xyz/info`: `{"type":"spotMetaAndAssetCtxs"}` (prices, index-aligned `midPx`) and `{"type":"spotClearinghouseState","user":wallet}` (balances). `muteHttpExceptions: true` + `getResponseCode() !== 200` throw on every call.

**Return-contract assembly (D-09)** — RESEARCH.md §Code Examples lines 384-396 (`getHyperliquidData(): Record<string, { price: number; qty: number }>`). Ticker→id translation hidden inside; merges mids + qtys by `a.id`.

**Error handling (D-10 / D-13)** — fail loud per asymmetric rule:
- Non-200 / malformed body / missing top-level structure → **throw** (both prices and balances).
- Price: tracked ticker missing from `spotMeta.tokens` or null `midPx` → **throw** (config error).
- Balance: ticker cleanly absent from `balances[]` → **qty 0**, do NOT throw (legitimate zero / sold-out per D-13). *(RESEARCH Pattern 5 line 309 shows the strict-throw variant — the planner must SOFTEN the balance branch to qty 0 to satisfy D-13.)*

**TS-strict guards (CLAUDE.md):** `noUncheckedIndexedAccess` makes `ctxs[pairPos]` and array indexing `T | undefined` — guard before `!` or `Number()`. Use `import type` for the response-shape types.

---

### `apps-script/src/JupiterApi.ts` (service/provider, request-response) — NO ANALOG

Same situation: no existing provider analog. Source of truth is **RESEARCH.md Patterns 2, 3, 4**. Project-convention analogs identical to `HyperliquidApi.ts` above (Config.ts module shape, entry.ts retention).

**Core fetch pattern** — RESEARCH.md Pattern 2 (`fetchJupPrices`, lines 210-230): `GET https://api.jup.ag/price/v3?ids={mints.join(",")}` with `x-api-key` header; mint→`usdPrice`. RESEARCH.md Pattern 4 (`fetchJupBalances`, lines 263-284): `GET https://api.jup.ag/ultra/v1/balances/{wallet}` with `x-api-key`; mint→`uiAmount` (NOT `amount`; native SOL keyed `"SOL"`).

**Auth pattern (SEC-01)** — RESEARCH.md Pattern 3 (`getScriptProp`, lines 237-242): read `JUP_API_KEY` from `PropertiesService`, fail loud on null. Header `{ "x-api-key": apiKey }`. Never `Logger.log` the key (Security Domain V7).

**Return-contract assembly (D-09)** — RESEARCH.md §Code Examples line 398 note: filter `venue === "solana"`, use `a.mint`, key output by `a.id`.

**Error handling (D-10 / D-13)** — identical asymmetric rule as Hyperliquid: price missing mint → throw; balance cleanly-absent mint → qty 0 (RESEARCH Pattern 4 line 280 shows strict variant — soften the balance branch per D-13); non-200 / malformed → throw.

---

### `apps-script/src/Properties.ts` (utility, transform) — optional

**Analog:** `apps-script/src/Config.ts` (module-shape only; semantically new).

**Pattern** — RESEARCH.md Pattern 3 lines 237-242 (`getScriptProp` fail-loud reader) plus optional `setup()` lines 248-254. Module shape mirrors `Config.ts`: JSDoc banner + named exports. If `setup()` is exposed as an editor global it follows the D-12 mechanism below.

> ⚠️ **SEC-02 / checkpoint:human-verify (research Open Q2):** if `setup()` is committed, it MUST NOT contain real wallet/key literals. Planner should add a `checkpoint:human-verify` confirming no secrets land in committed source, or document the Project-Settings UI path and skip the helper.

---

### `apps-script/src/entry.ts` (config/entry) — extend in place

**Analog:** itself — the existing `__ENTRY__` mechanism (lines 24-50).

**Provider-retention pattern (research Pitfall 5):** import the providers so the IIFE bundler does not tree-shake them. This phase's providers are *internal* (called by Phase 4's `refreshAll`, not editor entry points per D-12), so reference them to retain in the bundle:
```typescript
// existing convention to mirror (entry.ts lines 24-25, 31)
import { hello } from "./Hello";
import { ASSETS } from "./Config";
(globalThis as any).__ENTRY__ = { hello };
```
Add `import { getHyperliquidData } from "./HyperliquidApi";` / `import { getJupiterData } from "./JupiterApi";` and reference them (e.g. via `globalThis` or a temporary test global) so they survive the build. The file already has a `TODO(Phase 3 — providers/refresh)` marker at lines 43-46 pointing exactly here.

**Editor-global pattern (D-12)** — only if `setup()` is exposed: add `setup` to the `__ENTRY__` object (line 31 pattern) AND to `ENTRY_GLOBALS` in `appendGlobals.ts` AND declare in `globals.d.ts`. All three edits are one line each.

---

### `apps-script/scripts/appendGlobals.ts` (config/build) — extend in place

**Analog:** itself — line 24.

**Pattern:** add any new editor global name to the array:
```typescript
const ENTRY_GLOBALS = ["hello"] as const;   // → add "setup" here IF exposed (D-12)
```
The append/shim/idempotent-sentinel mechanism (lines 30-43) needs no other change. **Do NOT** add provider function names here — providers are internal, not editor-callable (D-12).

---

### `apps-script/src/globals.d.ts` (config/types) — extend in place

**Analog:** itself — lines 9-19.

**Pattern:** add an ambient `var` declaration for any new exposed global, mirroring `var hello: () => string;` (line 11). E.g. `var setup: () => void;` if `setup()` is exposed. The file already reserves space for later globals (lines 15-18).

---

### `apps-script/appsscript.json` (config/OAuth) — extend in place

**Analog:** itself — line 5 (`"oauthScopes": []`).

**Pattern (DATA-01/02/03 blocking prereq, research §Environment Availability lines 439, 445):** add the single scope this phase needs:
```json
"oauthScopes": [
  "https://www.googleapis.com/auth/script.external_request"
]
```
Defer `spreadsheets` / `script.scriptapp` to Phase 4 (minimal-scope, Security Domain "Over-broad OAuth scope" mitigation). `appsscript.json` is copied into `dist/` on deploy (`package.json` `deploy` script).

---

### `assets.json` (config/data) — fill placeholders

**Analog:** itself — current placeholders at lines 21, 29, 37, 45, 53.

**Pattern (D-04 / D-05):** replace literal placeholder strings; shape/keys unchanged (matches the `Asset` interface in `Config.ts` lines 13-28):
- Line 21: `XAUt` ticker `PLACEHOLDER_TICKER_phase3` → `XAUT0`
- Also update `BTC` ticker `BTC` → `UBTC` (line 5) per D-05 (the wallet holds bridged `UBTC`, not perp `BTC` — research Anti-Pattern line 318).
- Lines 29/37/45/53 Solana mints `PLACEHOLDER_MINT_phase3` → `CqW2pd6dCPG9xKZfAsTovzDsMmAGKJSDBNcwM96ondo` (IVVon), `59obFNBzyTBGowrkif5uK7ojS58vsuWz3ZCvg6tfZAGw` (PST), `5Y8NV33Vv7WbnLfq3zBcKSdYPrk7g2KoiQoe7M2tcxp5` (ONyc), `A1KLoBrKBde8Ty9qtNQUtq3C2ortoC3u7twggz7sEto6` (USDy).
- 2-space indent, double quotes, trailing newline (CLAUDE.md style). Inlined into `dist/Code.js` by `bun build`.

---

## Shared Patterns

### HTTP fetch (raw `UrlFetchApp`, no SDK)
**Source:** RESEARCH.md Patterns 1-5 (no in-repo analog yet).
**Apply to:** `HyperliquidApi.ts`, `JupiterApi.ts`.
```typescript
const res = UrlFetchApp.fetch(url, {
  method: "post", // or "get"
  contentType: "application/json",      // POST bodies
  headers: { "x-api-key": apiKey },     // Jupiter only; never log this value
  payload: JSON.stringify(body),        // POST bodies
  muteHttpExceptions: true,             // ALWAYS — so we read the code, not an opaque throw
});
if (res.getResponseCode() !== 200) {
  throw new Error(`<venue> <op> ${res.getResponseCode()}: ${res.getContentText()}`);
}
```

### Script Property read (fail-loud)
**Source:** RESEARCH.md Pattern 3, lines 237-242.
**Apply to:** both providers (`HL_WALLET_ADDRESS`, `SOL_WALLET_ADDRESS`, `JUP_API_KEY`); optionally factored into `Properties.ts`.
```typescript
function getScriptProp(name: string): string {
  const v = PropertiesService.getScriptProperties().getProperty(name);
  if (!v) throw new Error(`Missing Script Property: ${name}`); // never silent default
  return v;
}
```

### Provider return contract (D-09)
**Source:** RESEARCH.md §Code Examples lines 384-398.
**Apply to:** both providers — `Record<string, { price: number; qty: number }>` keyed by asset `id`, raw ticker/mint→id translation hidden inside, built by iterating the venue-filtered `ASSETS` slice.

### Fail-loud error policy (D-10 + D-13 asymmetry)
**Source:** CONTEXT.md D-10/D-13; RESEARCH.md Patterns soften needed.
**Apply to:** both providers.
- Prices: missing tracked id → **throw**.
- Balances: cleanly-absent tracked id → **qty 0** (do NOT throw).
- Any non-200 / malformed / missing top-level structure → **throw** (both).
> RESEARCH Patterns 4 & 5 ship the *strict* balance branch (throw). The planner must explicitly soften balances to qty 0 — this is the one place research code diverges from the locked decision.

### Module / JSDoc / strict-TS conventions
**Source:** `Config.ts`, `Hello.ts`, `entry.ts`.
**Apply to:** all new `.ts` files.
- Named `export` (no default), top-of-file JSDoc banner, `import type` for type-only imports (`verbatimModuleSyntax`).
- Guard indexed access (`noUncheckedIndexedAccess` → `T | undefined`) before non-null assertion or `Number()`.
- 2-space indent, double quotes, semicolons, trailing newline.
- PascalCase provider filenames (`HyperliquidApi.ts`, `JupiterApi.ts`, `Properties.ts`); camelCase functions (`getHyperliquidData`, `getScriptProp`).

### Editor-global exposure (D-12) — only if a global is added
**Source:** `entry.ts` line 31, `appendGlobals.ts` line 24, `globals.d.ts` line 11.
**Apply to:** `setup()` if exposed. Three coordinated one-line edits: `__ENTRY__` object + `ENTRY_GLOBALS` array + ambient `var` decl. Providers are NOT exposed (internal per D-12).

### Bundle-retention (research Pitfall 5)
**Source:** `entry.ts` lines 24-25 (imports `Hello`/`Config` to retain them).
**Apply to:** both providers — must be reachable from `entry.ts` or `bun build` tree-shakes them out of `dist/Code.js`. Verify: `cd apps-script && bun run build` then grep `dist/Code.js` for the provider names.

---

## No Analog Found

The two core deliverables have **no existing in-repo analog** — this is the project's first `UrlFetchApp` / raw-HTTP provider code. The planner should use RESEARCH.md Patterns 1-5 (venue-verified) as the implementation source, and borrow only *project conventions* (module shape, JSDoc, strict-TS guards, exports) from `Config.ts` / `Hello.ts` / `entry.ts`.

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `apps-script/src/HyperliquidApi.ts` | service/provider | request-response | No `UrlFetchApp` provider exists yet; `Hello.ts` explicitly forbids scope-gated APIs, so it is not a fetch analog. Use RESEARCH Patterns 1 + 5 + §Code Examples. |
| `apps-script/src/JupiterApi.ts` | service/provider | request-response | Same — first keyed-HTTP provider. Use RESEARCH Patterns 2 + 3 + 4. |

> `SolanaRpc.ts`, `Secrets.ts` — **NOT built this phase** (eliminated by D-01 / D-07). Do not create them.
> `.planning/codebase/INTEGRATIONS.md` and `ARCHITECTURE.md` data-flow — **historical/superseded** (predate D-01/D-02/D-07); do not mirror their Solana-RPC / Secret-Manager / `allMids` patterns (RESEARCH lines 409-411).

## Metadata

**Analog search scope:** `apps-script/src/`, `apps-script/scripts/`, repo root (`assets.json`, `appsscript.json`, `package.json`).
**Files scanned:** 8 (Config.ts, entry.ts, Hello.ts, appendGlobals.ts, globals.d.ts, appsscript.json, assets.json, package.json).
**Pattern extraction date:** 2026-06-16
