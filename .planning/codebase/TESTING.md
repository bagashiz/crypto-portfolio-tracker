# Testing

**Analysis Date:** 2026-06-13

> **State note:** The repository is a fresh `bun init` scaffold. There are **zero tests and zero test infrastructure** beyond Bun's built-in runner. This document records the current state and the prescribed testing approach derived from `CLAUDE.md` (Bun-only) and `PLAN.md` (risk areas).

## Framework

**Current convention:** Bun's built-in test runner — `bun test` (mandated by `CLAUDE.md`; do **not** use Jest or Vitest).

```ts
// index.test.ts
import { test, expect } from "bun:test";

test("hello world", () => {
  expect(1).toBe(1);
});
```

Run with `bun test`. RTK convention prefixes it: `rtk bun test` (or generic `rtk test <cmd>`) for token-filtered failures-only output.

## Current State

- **Test files:** none
- **Test infra/config:** none (Bun needs none — `bun test` discovers `*.test.ts` / `*.spec.ts`)
- **Coverage tooling:** none configured (`bun test --coverage` available if needed)
- **CI:** none

## Structure (prescribed)

Co-locate tests next to source using Bun's discovery pattern:
- `layout-builder/src/dcaLogSheet.test.js` — layout-builder unit tests
- `apps-script/src/HyperliquidApi.test.ts` — provider parsing tests

> **Apps Script caveat:** code running inside Apps Script (V8, `UrlFetchApp`, `SpreadsheetApp`) cannot run under `bun test` directly. Test **pure logic** (JSON parsing, blob building, ticker/mint mapping, formula generation) by extracting it from the Google globals; the trigger-bound parts are verified manually via `clasp push`.

## Priority Test Targets (from `PLAN.md` risk areas)

| Priority | Target | Why |
|----------|--------|-----|
| **High** | Layout `--update` idempotency (`layout-builder`) | A wrong `batchUpdate` range can wipe hand-entered DCA Log history — irreversible data loss (`PLAN.md` §4, §6.5) |
| **Medium** | HL / Jupiter / RPC JSON parsing (`apps-script` providers) | Wrong ticker/mint mapping fails silently (blank price / wrong asset) (`PLAN.md` §8) |
| **Medium** | Single-blob cache build / fallback (`Cache.ts`) | A miss must fall back to live fetch; one provider failure must not blank the blob (`PLAN.md` §5.3, §6.3) |
| **Low / manual** | Apps Script triggers, Sheets formulas | Verified via `clasp push` + visual sheet inspection, not unit tests |

## Mocking

- **HTTP providers** — inject the fetch boundary so `UrlFetchApp` / `fetch` can be replaced with fixture JSON in tests (capture real HL `allMids`, Jupiter `price/v3`, and Solana `getTokenAccountsByOwner` responses as fixtures). Keep provider parsing logic pure and free of Google globals so it is unit-testable.
- **Google globals** — `SpreadsheetApp`, `CacheService`, `PropertiesService`, `UrlFetchApp` are not available under `bun test`; isolate logic away from them or stub them where unavoidable.

## Coverage

No coverage target defined. Given the data-loss risk, prioritize covering the layout `--update` idempotency path before broad coverage goals.

---

*Testing analysis: 2026-06-13*
