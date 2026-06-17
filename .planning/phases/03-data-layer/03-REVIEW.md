---
phase: 03-data-layer
reviewed: 2026-06-17T00:00:00Z
depth: standard
files_reviewed: 11
files_reviewed_list:
  - apps-script/appsscript.json
  - apps-script/scripts/appendGlobals.ts
  - apps-script/src/Diagnostics.ts
  - apps-script/src/HyperliquidApi.ts
  - apps-script/src/JupiterApi.ts
  - apps-script/src/Properties.ts
  - apps-script/src/entry.ts
  - apps-script/src/globals.d.ts
  - apps-script/src/parsers.test.ts
  - apps-script/tsconfig.json
  - assets.json
findings:
  critical: 0
  warning: 4
  info: 3
  total: 7
status: issues_found
---

# Phase 3: Code Review Report

**Reviewed:** 2026-06-17T00:00:00Z
**Depth:** standard
**Files Reviewed:** 11
**Status:** issues_found

## Summary

Reviewed the Apps Script data layer: two raw-`UrlFetchApp` providers (Hyperliquid spot, Jupiter Solana), the Script-Property reader, the IIFE entry/footer shim mechanism, the asset registry, and the pure-parser test suite. Build (`bun build` + `appendGlobals.ts`), typecheck (`tsc --noEmit`), and tests (`bun test`: 17 pass) all succeed. No secrets are committed; `dist`, `service-account.key.json`, and `.clasp.json` are gitignored. The architecture (pure parsers split from I/O wrappers, per-provider isolation, single-blob design) is sound and well-tested for the documented edge cases.

The defects found are not crashes but **silent-corruption gaps**: the parsers promise "finite number" in their contracts and the project's fail-loud convention demands that bad upstream data must throw rather than flow into PnL math — yet a non-numeric/`NaN` price or quantity passes through unchecked. This violates the explicit "never overwrite good data with an error" + fail-loud rules and would surface as `NaN`/`#NUM!` in the sheet instead of a clean stale-data fallback. No Critical issues; four Warnings center on numeric validation and one secret-leakage edge.

## Warnings

### WR-01: `parseHlSpotMids` does not enforce the "finite number" contract — non-numeric `midPx` yields silent `NaN`

**File:** `apps-script/src/HyperliquidApi.ts:82-85`
**Issue:** The function's JSDoc promises `ticker -> mid (finite number)` and the file header commits to fail-loud (D-10) on bad price data, but the implementation only rejects `mid == null`. Any other non-numeric `midPx` string (e.g. a future `"n/a"`, `""`, or a malformed value) passes the null check and `Number(mid)` returns `NaN`. `NaN` then propagates through `getHyperliquidData()` into the cached blob and into DCA/PnL formulas, producing `NaN`/`#NUM!` in the sheet — the exact "overwrite good data with garbage" outcome the fail-loud rule exists to prevent. A throw here would instead let Phase 4's per-provider try/catch keep the last good cached value.
**Fix:**
```ts
const n = Number(mid);
if (!Number.isFinite(n)) {
  throw new Error('HL: non-finite midPx for "' + ticker + '" (pair ' + pair.name + "): " + mid);
}
out[ticker] = n;
```

### WR-02: `parseHlBalances` coerces `total` without a finiteness guard — silent `NaN` quantity

**File:** `apps-script/src/HyperliquidApi.ts:103-113`
**Issue:** `byCoin[b.coin] = b.total` stores `total` with no type check, then `Number(total)` is taken at line 112. If a balance entry carries a non-numeric `total` (malformed/partial response, or a non-string type slipping past), the result is `NaN` rather than a throw or a clean 0. A `NaN` quantity silently corrupts portfolio value. The D-13 contract distinguishes "cleanly absent -> 0" from "malformed -> throw"; a present-but-garbage `total` falls into neither branch and leaks `NaN`.
**Fix:**
```ts
const total = byCoin[ticker];
if (total == null) { out[ticker] = 0; continue; } // D-13 legitimate zero
const n = Number(total);
if (!Number.isFinite(n)) {
  throw new Error('HL: non-finite balance total for "' + ticker + '": ' + total);
}
out[ticker] = n;
```

### WR-03: Jupiter parsers accept `NaN`/`Infinity` — `typeof === "number"` is not a finiteness check

**File:** `apps-script/src/JupiterApi.ts:57-60, 85`
**Issue:** `parseJupPrices` guards with `typeof entry.usdPrice !== "number"` and `parseJupBalances` with `typeof entry.uiAmount === "number"`, but both pass for `NaN` and `±Infinity` (`typeof NaN === "number"`). The JSDoc claims "finite number". While `JSON.parse` cannot itself emit `NaN`/`Infinity`, the contract is stated but not enforced, and this is inconsistent with the stricter intent of the HL parsers. Tightening to `Number.isFinite` makes the "finite number" promise real and uniform across both venues.
**Fix:**
```ts
// parseJupPrices
if (!entry || !Number.isFinite(entry.usdPrice)) {
  throw new Error("Jupiter: no/non-finite usdPrice for mint " + mint);
}
out[mint] = entry.usdPrice;

// parseJupBalances
out[mint] = entry && Number.isFinite(entry.uiAmount) ? entry.uiAmount : 0;
```

### WR-04: Error throws interpolate raw `getContentText()` / wallet-bearing URL — secret/PII surface on failure path

**File:** `apps-script/src/JupiterApi.ts:97-98, 110-111`; `apps-script/src/HyperliquidApi.ts:125-126, 139-141`
**Issue:** On any non-200, the providers throw with the full upstream response body appended (`... + res.getContentText()`), and `testApi()` / Phase 4's try/catch logs that message. The project's SEC-01 rule is emphatic that the Jupiter API key must never be logged. The key lives in the `x-api-key` header (not the body), so direct leakage is unlikely — but error bodies from gateways/proxies sometimes echo request metadata, and the Jupiter balances URL embeds the wallet address. Throwing the verbatim body and wallet-bearing URL on the error path is the one place where unscrubbed upstream content reaches the log. Recommend truncating/sanitizing the echoed body and not interpolating the wallet into messages.
**Fix:**
```ts
// Cap echoed body length and never include the wallet/key:
const snippet = res.getContentText().slice(0, 200);
throw new Error("Jupiter ultra/v1/balances " + res.getResponseCode() + ": " + snippet);
// For HL/Jup balances, identify the call by venue+endpoint, not by the full URL/wallet.
```

## Info

### IN-01: Non-null assertions in provider assembly mask the real failure point

**File:** `apps-script/src/HyperliquidApi.ts:154,159-160`; `apps-script/src/JupiterApi.ts:126,132`
**Issue:** `a.ticker!`, `a.mint!`, `mids[ticker]!`, `qtys[ticker]!` assert non-undefined. They are safe today because the parsers throw on a missing price and `Config.Asset` makes `ticker`/`mint` optional only structurally — but the `!` defeats `noUncheckedIndexedAccess`. If a future asset row omits `ticker`/`mint` for its venue, this fails as a confusing `undefined`-keyed lookup rather than a clear config error. A guard at the top of each provider (assert `a.ticker`/`a.mint` present) would localize the failure.
**Fix:** Validate `ticker`/`mint` presence per venue once when filtering `ASSETS`, then drop the `!`.

### IN-02: `getResponseCode() !== 200` rejects other 2xx success codes

**File:** `apps-script/src/HyperliquidApi.ts:125,139`; `apps-script/src/JupiterApi.ts:97,110`
**Issue:** Strict `!== 200` treats any other 2xx (e.g. `204`, `206`) as a hard failure. Both APIs return `200` today, so this is currently correct and arguably the more fail-loud choice. Noted only so the assumption is explicit; consider `code < 200 || code >= 300` if either endpoint ever varies.
**Fix:** `if (res.getResponseCode() < 200 || res.getResponseCode() >= 300) { ... }` (optional).

### IN-03: `appendGlobals.ts` `ENTRY_GLOBALS` and `entry.ts` `__ENTRY__` must be hand-kept in sync

**File:** `apps-script/scripts/appendGlobals.ts:28`; `apps-script/src/entry.ts:36`
**Issue:** The editor-callable entry list is duplicated in two files (`["hello","testApi"]` in the footer script and `{ hello, testApi }` in `__ENTRY__`). A shim appended for a name absent from `__ENTRY__` would throw `Cannot read properties of undefined` at call time; both files' headers already warn about this. The duplication is intentional and documented, but it is a real drift hazard for Phase 4's `refreshAll`/`installTrigger` additions. Consider deriving `ENTRY_GLOBALS` from a shared constant or having the build assert every shim name resolves on `__ENTRY__`.
**Fix:** Export the entry-name list from one module and import it in both, or add a build-time assertion that each `ENTRY_GLOBALS` name exists on `__ENTRY__`.

---

_Reviewed: 2026-06-17T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
