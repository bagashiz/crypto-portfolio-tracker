# Coding Conventions

**Analysis Date:** 2026-06-13

> **Project maturity note:** The repository is a freshly-scaffolded Bun project. The only source file is `index.ts` (a single `console.log("Hello via Bun!")` starter). No production code, lint config, or formatter config exists yet. The conventions below are derived from: (1) `tsconfig.json` strictness flags, (2) the mandatory runtime/tooling rules in `CLAUDE.md`, and (3) the architectural handoff spec in `PLAN.md`. They are **prescriptive** — follow them when writing new code, since no existing code establishes a competing pattern.

## Runtime & Tooling Rules (non-negotiable)

These come from `CLAUDE.md` and override defaults:

- **Use Bun, never Node.js tooling.** `bun <file>` not `node`/`ts-node`; `bun install` not npm/yarn/pnpm; `bun test` not jest/vitest; `bun build` not webpack/esbuild; `bunx` not `npx`.
- **Use Bun built-in APIs over npm packages:**
  - `Bun.serve()` for HTTP/WebSocket/HTTPS — not `express` or `ws`.
  - `bun:sqlite` — not `better-sqlite3`.
  - `Bun.redis` — not `ioredis`.
  - `Bun.sql` — not `pg` / `postgres.js`.
  - `Bun.file` over `node:fs` `readFile`/`writeFile`.
  - `Bun.$\`...\`` for shell — not `execa`.
- **No `dotenv`.** Bun auto-loads `.env`.
- **Frontend:** HTML imports with `Bun.serve()` (React/CSS/Tailwind supported) — not `vite`.
- **RTK prefix:** Per `CLAUDE.md`, prefix shell commands with `rtk` (token-optimized proxy), including inside `&&` chains.

## Two-Runtime Boundary (from `PLAN.md`)

The planned codebase splits into two directories with **separate dependency sets that must not mix**:

- `layout-builder/` — local-only Node, uses `googleapis`, talks to the Sheets API.
- `apps-script/` — authored in TypeScript, built to `dist/`, pushed via `clasp`. **No npm packages at runtime** (Google V8, no module resolution). All network calls use `UrlFetchApp` against raw HTTP endpoints.

**Constraint:** In `apps-script/src/`, avoid `export`/`import` between your own `.ts` files — Apps Script links files via concatenated global scope. Trigger entry points (`refreshAll`, `installTrigger`, etc.) must compile to **top-level global functions**, not module-closure-wrapped.

## Naming Patterns

**Files:**
- Bun/TypeScript entry & utility files: lowercase, no extension drama — `index.ts`, `auth.js`, `config.js`, `dashboardSheet.js` (camelCase for multi-word in `layout-builder/`).
- Apps Script source files: PascalCase — `Config.ts`, `Secrets.ts`, `HyperliquidApi.ts`, `JupiterApi.ts`, `SolanaRpc.ts`, `Cache.ts`, `Refresh.ts`, `Triggers.ts`.
- Test files: `*.test.ts` co-located with source (Bun convention, see `CLAUDE.md` example `index.test.ts`).

**Functions:**
- camelCase — `getJupApiKey()`, `refreshAll()`, `installTrigger()`.

**Variables:**
- camelCase for locals/params.
- UPPER_SNAKE_CASE for config keys / cache keys / Script Properties — `PRICES_ALL`, `SM_RESOURCE_PATH`, `HL_WALLET_ADDRESS`, `SOL_WALLET_ADDRESS`, `GCP_PROJECT_ID`, `FETCH_BALANCES`.

**Types:**
- PascalCase (TypeScript default) — no established examples yet; follow standard `interface`/`type` PascalCase.

## Code Style

**Formatting:**
- No formatter config present (no `.prettierrc`, `.editorconfig`, `biome.json`).
- Observed in `index.ts` / config files: 2-space indentation, double quotes, semicolons, trailing newline. Match this until a formatter is adopted.

**Linting:**
- No linter configured. Type safety is enforced via `tsconfig.json` `strict` mode instead (see below).

**TypeScript strictness (`tsconfig.json` — treat as the lint baseline):**
- `"strict": true` — full strict mode.
- `"noUncheckedIndexedAccess": true` — indexed access returns `T | undefined`; handle the `undefined` case.
- `"noFallthroughCasesInSwitch": true` — every `case` must `break`/`return`.
- `"noImplicitOverride": true` — use the `override` keyword when overriding.
- `"verbatimModuleSyntax": true` — use `import type` / `export type` for type-only imports.
- `"allowImportingTsExtensions": true` — `.ts` extensions in imports are allowed (Bun bundler mode).
- `"noEmit": true` — Bun handles execution/bundling; tsc is type-check only.
- `"jsx": "react-jsx"` — React JSX without explicit `React` import.
- Disabled (allowed): `noUnusedLocals`, `noUnusedParameters`, `noPropertyAccessFromIndexSignature` are `false`.

## Import Organization

**Order** (standard, no enforced rule yet):
1. Bun built-ins (`bun:sqlite`, `bun:test`) and Node-compat.
2. Third-party (`googleapis` in `layout-builder/` only).
3. Local modules.

**Type imports:** Use `import type { Foo } from "..."` due to `verbatimModuleSyntax`.

**Path Aliases:** None configured.

**Apps Script exception:** Do not use cross-file `import`/`export` in `apps-script/src/` (breaks global linking unless the bundler inlines to a single file).

## Error Handling

From `PLAN.md` §6 (graceful degradation requirements):
- **Wrap each external provider call in its own `try/catch`.** A Jupiter outage must not blank Hyperliquid prices.
- **Never overwrite good data with an error.** On fetch failure, keep the last cached value and write a status/timestamp cell (`LastUpdated`, `Stale?`) instead.
- Treat `CacheService` misses as normal (soft cache) — always fall back to a live fetch and re-cache.

## Logging

**Framework:** `console.log` (Bun/Apps Script native — `index.ts` uses it; `PLAN.md` instructs logging raw API output during bring-up). No logging library.

**Patterns:**
- Log raw API responses while wiring up `HyperliquidApi`/`JupiterApi`/`SolanaRpc` to confirm ticker/mint mapping.
- Log rate-limit response headers where available to monitor headroom.

## Comments

**When to Comment:**
- `tsconfig.json` uses inline `//` section banners to group settings — mirror that lightweight style for grouped config.
- Explain non-obvious external-API quirks (e.g. XAUt ticker confirmation, mint-address registry rationale) inline, per `PLAN.md` open items.

**JSDoc/TSDoc:** No usage established; not required.

## Function Design

**Size / Return Values:**
- Favor single-responsibility provider functions (one per external API) so failures isolate cleanly.
- Batch I/O: `PLAN.md` mandates a **single `setValues` batch write** to the sheet — never cell-by-cell; one batched fetch → one JSON blob → one cache key.

**Parameters:** No established convention; standard positional params.

## Module Design

**Exports:**
- `layout-builder/` (Node): normal ESM (`"type": "module"` in `package.json`).
- `apps-script/`: **no module exports between own files**; rely on global scope, expose trigger entry points as top-level functions.

**Barrel Files:** None present; not used.

## Single Source of Truth Rules (`PLAN.md`)

- **Avg cost** computed only in the DCA Log summary block; the Dashboard `AVGCOST` references it — do not duplicate `SUMIF` logic.
- **Asset registry** (Solana mint addresses + HL tickers) lives in one `Config` map per runtime so adding/removing an asset is a one-line change.

---

*Convention analysis: 2026-06-13*
