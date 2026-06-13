# Bun

Default to using Bun instead of Node.js.

- Use `bun <file>` instead of `node <file>` or `ts-node <file>`
- Use `bun test` instead of `jest` or `vitest`
- Use `bun build <file.html|file.ts|file.css>` instead of `webpack` or `esbuild`
- Use `bun install` instead of `npm install` or `yarn install` or `pnpm install`
- Use `bun run <script>` instead of `npm run <script>` or `yarn run <script>` or `pnpm run <script>`
- Use `bunx <package> <command>` instead of `npx <package> <command>`
- Bun automatically loads .env, so don't use dotenv.

## APIs

- `Bun.serve()` supports WebSockets, HTTPS, and routes. Don't use `express`.
- `bun:sqlite` for SQLite. Don't use `better-sqlite3`.
- `Bun.redis` for Redis. Don't use `ioredis`.
- `Bun.sql` for Postgres. Don't use `pg` or `postgres.js`.
- `WebSocket` is built-in. Don't use `ws`.
- Prefer `Bun.file` over `node:fs`'s readFile/writeFile
- Bun.$`ls` instead of execa.

## Testing

Use `bun test` to run tests.

```ts#index.test.ts
import { test, expect } from "bun:test";

test("hello world", () => {
  expect(1).toBe(1);
});
```

## Frontend

Use HTML imports with `Bun.serve()`. Don't use `vite`. HTML imports fully support React, CSS, Tailwind.

Server:

```ts#index.ts
import index from "./index.html"

Bun.serve({
  routes: {
    "/": index,
    "/api/users/:id": {
      GET: (req) => {
        return new Response(JSON.stringify({ id: req.params.id }));
      },
    },
  },
  // optional websocket support
  websocket: {
    open: (ws) => {
      ws.send("Hello, world!");
    },
    message: (ws, message) => {
      ws.send(message);
    },
    close: (ws) => {
      // handle close
    }
  },
  development: {
    hmr: true,
    console: true,
  }
})
```

HTML files can import .tsx, .jsx or .js files directly and Bun's bundler will transpile & bundle automatically. `<link>` tags can point to stylesheets and Bun's CSS bundler will bundle.

```html#index.html
<html>
  <body>
    <h1>Hello, world!</h1>
    <script type="module" src="./frontend.tsx"></script>
  </body>
</html>
```

With the following `frontend.tsx`:

```tsx#frontend.tsx
import React from "react";
import { createRoot } from "react-dom/client";

// import .css files directly and it works
import './index.css';

const root = createRoot(document.body);

export default function Frontend() {
  return <h1>Hello, world!</h1>;
}

root.render(<Frontend />);
```

Then, run index.ts

```sh
bun --hot ./index.ts
```

For more information, read the Bun API docs in `node_modules/bun-types/docs/**.mdx`.

<!-- rtk-instructions v2 -->

# RTK (Rust Token Killer) - Token-Optimized Commands

## Golden Rule

**Always prefix commands with `rtk`**. If RTK has a dedicated filter, it uses it. If not, it passes through unchanged. This means RTK is always safe to use.

**Important**: Even in command chains with `&&`, use `rtk`:

```bash

# ❌ Wrong

git add . && git commit -m "msg" && git push

# ✅ Correct

rtk git add . && rtk git commit -m "msg" && rtk git push
```

## RTK Commands by Workflow

### Build & Compile (80-90% savings)

```bash
rtk cargo build         # Cargo build output
rtk cargo check         # Cargo check output
rtk cargo clippy        # Clippy warnings grouped by file (80%)
rtk tsc                 # TypeScript errors grouped by file/code (83%)
rtk lint                # ESLint/Biome violations grouped (84%)
rtk prettier --check    # Files needing format only (70%)
rtk next build          # Next.js build with route metrics (87%)
```

### Test (60-99% savings)

```bash
rtk cargo test          # Cargo test failures only (90%)
rtk go test             # Go test failures only (90%)
rtk jest                # Jest failures only (99.5%)
rtk vitest              # Vitest failures only (99.5%)
rtk playwright test     # Playwright failures only (94%)
rtk pytest              # Python test failures only (90%)
rtk rake test           # Ruby test failures only (90%)
rtk rspec               # RSpec test failures only (60%)
rtk test <cmd>          # Generic test wrapper - failures only
```

### Git (59-80% savings)

```bash
rtk git status          # Compact status
rtk git log             # Compact log (works with all git flags)
rtk git diff            # Compact diff (80%)
rtk git show            # Compact show (80%)
rtk git add             # Ultra-compact confirmations (59%)
rtk git commit          # Ultra-compact confirmations (59%)
rtk git push            # Ultra-compact confirmations
rtk git pull            # Ultra-compact confirmations
rtk git branch          # Compact branch list
rtk git fetch           # Compact fetch
rtk git stash           # Compact stash
rtk git worktree        # Compact worktree
```

Note: Git passthrough works for ALL subcommands, even those not explicitly listed.

### GitHub (26-87% savings)

```bash
rtk gh pr view <num>    # Compact PR view (87%)
rtk gh pr checks        # Compact PR checks (79%)
rtk gh run list         # Compact workflow runs (82%)
rtk gh issue list       # Compact issue list (80%)
rtk gh api              # Compact API responses (26%)
```

### JavaScript/TypeScript Tooling (70-90% savings)

```bash
rtk pnpm list           # Compact dependency tree (70%)
rtk pnpm outdated       # Compact outdated packages (80%)
rtk pnpm install        # Compact install output (90%)
rtk npm run <script>    # Compact npm script output
rtk npx <cmd>           # Compact npx command output
rtk prisma              # Prisma without ASCII art (88%)
```

### Files & Search (60-75% savings)

```bash
rtk ls <path>           # Tree format, compact (65%)
rtk read <file>         # Code reading with filtering (60%)
rtk grep <pattern>      # Search grouped by file (75%). Format flags (-c, -l, -L, -o, -Z) run raw.
rtk find <pattern>      # Find grouped by directory (70%)
```

### Analysis & Debug (70-90% savings)

```bash
rtk err <cmd>           # Filter errors only from any command
rtk log <file>          # Deduplicated logs with counts
rtk json <file>         # JSON structure without values
rtk deps                # Dependency overview
rtk env                 # Environment variables compact
rtk summary <cmd>       # Smart summary of command output
rtk diff                # Ultra-compact diffs
```

### Infrastructure (85% savings)

```bash
rtk docker ps           # Compact container list
rtk docker images       # Compact image list
rtk docker logs <c>     # Deduplicated logs
rtk kubectl get         # Compact resource list
rtk kubectl logs        # Deduplicated pod logs
```

### Network (65-70% savings)

```bash
rtk curl <url>          # Compact HTTP responses (70%)
rtk wget <url>          # Compact download output (65%)
```

### Meta Commands

```bash
rtk gain                # View token savings statistics
rtk gain --history      # View command history with savings
rtk discover            # Analyze Claude Code sessions for missed RTK usage
rtk proxy <cmd>         # Run command without filtering (for debugging)
rtk init                # Add RTK instructions to CLAUDE.md
rtk init --global       # Add RTK to ~/.claude/CLAUDE.md
```

## Token Savings Overview

| Category | Commands | Typical Savings |
|----------|----------|-----------------|
| Tests | vitest, playwright, cargo test | 90-99% |
| Build | next, tsc, lint, prettier | 70-87% |
| Git | status, log, diff, add, commit | 59-80% |
| GitHub | gh pr, gh run, gh issue | 26-87% |
| Package Managers | pnpm, npm, npx | 70-90% |
| Files | ls, read, grep, find | 60-75% |
| Infrastructure | docker, kubectl | 85% |
| Network | curl, wget | 65-70% |

Overall average: **60-90% token reduction** on common development operations.
<!-- /rtk-instructions -->

<!-- GSD:project-start source:PROJECT.md -->

## Project

**Crypto Portfolio Tracker**

A personal Google Sheets crypto portfolio tracker that auto-fetches live prices and on-chain balances for a Hyperliquid wallet and a Solana wallet, computes DCA-weighted cost basis and unrealized PnL from a manual transaction log, and surfaces allocation health (target vs actual, drift, risk, yield). The spreadsheet structure is built and refreshed programmatically — the user never hand-edits the sheet layout, only enters DCA transactions.

**Core Value:** See accurate unrealized PnL — live portfolio value measured against DCA-weighted cost basis — for the whole portfolio at a glance, refreshed automatically.

### Constraints

- **Tech stack**: Two isolated runtimes, two dependency sets, never mixed — local Node layout builder (`googleapis`) and Google Apps Script V8 data layer (no npm/module resolution). The Google Sheet is the only integration surface between them.
- **Apps Script authoring**: TypeScript in `apps-script/src/`, compiled to flat `dist/`, pushed via `clasp`. Trigger/entry functions (`refreshAll`, `installTrigger`) must compile to top-level globals — no `import`/`export` between source files unless the bundler inlines to one file. Fails only at deploy time.
- **No npm in Apps Script**: all network calls via `UrlFetchApp` against raw HTTP endpoints.
- **Security**: service-account key local-only (gitignored, never pushed); Jupiter API key in Secret Manager; no private keys anywhere; all access read-only.
- **Tooling**: Bun for root project tooling/tests (`bun test`); Node for the layout builder runtime.
- **Idempotency**: layout `--update` must never clear DCA Log data rows — irreversible data-loss risk.

<!-- GSD:project-end -->

<!-- GSD:stack-start source:codebase/STACK.md -->

## Technology Stack

## Languages

- TypeScript `^5` (resolved `5.9.3` per `bun.lock`) — entry point `index.ts`, configured by `tsconfig.json`
- TypeScript `^5` — Apps Script data layer authored in `.ts` (`apps-script/src/`), compiled to `dist/` and pushed via `clasp`. TS provides typings only; Apps Script runs Google's V8 (no Node runtime, no npm).
- JavaScript (ESM) — local layout builder (`layout-builder/src/*.js`)
- Not detected

## Runtime

- Bun (latest; project created with Bun `1.3.14` per `README.md`)
- Node (latest) — declared in `mise.toml` for tool provisioning
- Node — local layout builder runtime (`layout-builder/`), talks to Google Sheets API via `googleapis`
- Google Apps Script V8 — data layer runtime (`apps-script/`); no npm/module resolution, all network calls via `UrlFetchApp`
- `mise.toml` pins `bun = "latest"` and `node = "latest"`
- Note: `mise.toml` is listed in `.gitignore` (line 37) — tool config is local only
- Bun (current root project)
- Lockfile: present (`bun.lock`, lockfileVersion 1)
- Planned sub-projects use their own dependency sets: `layout-builder/package.json` and `apps-script/package.json` (per `PLAN.md` §3) — two separate, non-mixed dependency sets

## Frameworks

- None — single-file scaffold
- Google Apps Script (data layer) — time-driven triggers, `CacheService`, `PropertiesService`, `UrlFetchApp`, `ScriptApp`, `SpreadsheetApp`
- `clasp` (`@google/clasp`) — Apps Script deployment toolchain (`clasp push` of `dist/`)
- Bun's built-in test runner (`bun test`) is the project convention (per `CLAUDE.md`). No test files present yet.
- esbuild or tsc — compiles `apps-script/src/*.ts` → `apps-script/dist/` (flat global-scope output required so trigger entry points are top-level functions)
- `bun build` is the documented bundler for the root/Bun side (per `CLAUDE.md`)

## Key Dependencies

- `typescript` `^5` (peerDependency) — language tooling
- `@types/bun` `latest` (devDependency, resolved `1.3.14`) — Bun type definitions
- Transitive: `bun-types` `1.3.14`, `@types/node` `25.9.3`, `undici-types` `7.24.6`
- `googleapis` — Google Sheets API client; service-account JWT auth (`google.auth.JWT` / `GoogleAuth`)
- `typescript` — authoring
- `@types/google-apps-script` — Apps Script typings
- `@google/clasp` — deploy tooling
- esbuild (or tsc) — build to flat `dist/`
- `@nktkas/hyperliquid`, `@jup-ag/api`, `gill` — not used anywhere. All exchange/chain calls are raw HTTP via `UrlFetchApp`; no SDKs in either runtime.

## Configuration

- Targets/lib: `ESNext`; `module: Preserve`; `moduleResolution: bundler`; `moduleDetection: force`
- `jsx: react-jsx`, `allowJs: true`, `types: ["bun"]`
- `allowImportingTsExtensions: true`, `verbatimModuleSyntax: true`, `noEmit: true`
- Strictness: `strict: true`, `skipLibCheck: true`, `noFallthroughCasesInSwitch: true`, `noUncheckedIndexedAccess: true`, `noImplicitOverride: true`
- Relaxed: `noUnusedLocals: false`, `noUnusedParameters: false`, `noPropertyAccessFromIndexSignature: false`
- Bun auto-loads `.env` (no `dotenv`, per `CLAUDE.md`)
- `.env*` variants are gitignored (`.gitignore` lines 18–24). No `.env` file currently present.
- Planned: layout builder spreadsheet ID via `config.js` or `.env`
- Service-account key `layout-builder/service-account.key.json` — local only, gitignored, never pushed to Apps Script
- Apps Script secrets via GCP Secret Manager (Jupiter API key) + `PropertiesService` (Script Properties) for wallet addresses, project ID, resource paths
- `appsscript.json` — OAuth scopes (`spreadsheets`, `external_request`, `cloud-platform`, `script.scriptapp`), timezone/date pinning; copied into `dist/` on build
- `.clasp.json` — `"rootDir": "dist"`, script ID; gitignored

## Platform Requirements

- Bun (latest) and Node (latest), provisioned via `mise`
- Install: `bun install`; run: `bun run index.ts`
- Planned: Google Cloud project with Sheets API + Secret Manager enabled; `clasp login`; a target spreadsheet shared with the service-account email (Editor)
- Layout builder: runs locally/on-demand (`node src/index.js --build|--update`)
- Data layer: deployed to Google Apps Script (sheet-bound), driven by a time-driven trigger (default 5-minute refresh)

<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->

## Conventions

## Runtime & Tooling Rules (non-negotiable)

- **Use Bun, never Node.js tooling.** `bun <file>` not `node`/`ts-node`; `bun install` not npm/yarn/pnpm; `bun test` not jest/vitest; `bun build` not webpack/esbuild; `bunx` not `npx`.
- **Use Bun built-in APIs over npm packages:**
- **No `dotenv`.** Bun auto-loads `.env`.
- **Frontend:** HTML imports with `Bun.serve()` (React/CSS/Tailwind supported) — not `vite`.
- **RTK prefix:** Per `CLAUDE.md`, prefix shell commands with `rtk` (token-optimized proxy), including inside `&&` chains.

## Two-Runtime Boundary (from `PLAN.md`)

- `layout-builder/` — local-only Node, uses `googleapis`, talks to the Sheets API.
- `apps-script/` — authored in TypeScript, built to `dist/`, pushed via `clasp`. **No npm packages at runtime** (Google V8, no module resolution). All network calls use `UrlFetchApp` against raw HTTP endpoints.

## Naming Patterns

- Bun/TypeScript entry & utility files: lowercase, no extension drama — `index.ts`, `auth.js`, `config.js`, `dashboardSheet.js` (camelCase for multi-word in `layout-builder/`).
- Apps Script source files: PascalCase — `Config.ts`, `Secrets.ts`, `HyperliquidApi.ts`, `JupiterApi.ts`, `SolanaRpc.ts`, `Cache.ts`, `Refresh.ts`, `Triggers.ts`.
- Test files: `*.test.ts` co-located with source (Bun convention, see `CLAUDE.md` example `index.test.ts`).
- camelCase — `getJupApiKey()`, `refreshAll()`, `installTrigger()`.
- camelCase for locals/params.
- UPPER_SNAKE_CASE for config keys / cache keys / Script Properties — `PRICES_ALL`, `SM_RESOURCE_PATH`, `HL_WALLET_ADDRESS`, `SOL_WALLET_ADDRESS`, `GCP_PROJECT_ID`, `FETCH_BALANCES`.
- PascalCase (TypeScript default) — no established examples yet; follow standard `interface`/`type` PascalCase.

## Code Style

- No formatter config present (no `.prettierrc`, `.editorconfig`, `biome.json`).
- Observed in `index.ts` / config files: 2-space indentation, double quotes, semicolons, trailing newline. Match this until a formatter is adopted.
- No linter configured. Type safety is enforced via `tsconfig.json` `strict` mode instead (see below).
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

## Error Handling

- **Wrap each external provider call in its own `try/catch`.** A Jupiter outage must not blank Hyperliquid prices.
- **Never overwrite good data with an error.** On fetch failure, keep the last cached value and write a status/timestamp cell (`LastUpdated`, `Stale?`) instead.
- Treat `CacheService` misses as normal (soft cache) — always fall back to a live fetch and re-cache.

## Logging

- Log raw API responses while wiring up `HyperliquidApi`/`JupiterApi`/`SolanaRpc` to confirm ticker/mint mapping.
- Log rate-limit response headers where available to monitor headroom.

## Comments

- `tsconfig.json` uses inline `//` section banners to group settings — mirror that lightweight style for grouped config.
- Explain non-obvious external-API quirks (e.g. XAUt ticker confirmation, mint-address registry rationale) inline, per `PLAN.md` open items.

## Function Design

- Favor single-responsibility provider functions (one per external API) so failures isolate cleanly.
- Batch I/O: `PLAN.md` mandates a **single `setValues` batch write** to the sheet — never cell-by-cell; one batched fetch → one JSON blob → one cache key.

## Module Design

- `layout-builder/` (Node): normal ESM (`"type": "module"` in `package.json`).
- `apps-script/`: **no module exports between own files**; rely on global scope, expose trigger entry points as top-level functions.

## Single Source of Truth Rules (`PLAN.md`)

- **Avg cost** computed only in the DCA Log summary block; the Dashboard `AVGCOST` references it — do not duplicate `SUMIF` logic.
- **Asset registry** (Solana mint addresses + HL tickers) lives in one `Config` map per runtime so adding/removing an asset is a one-line change.

<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->

## Architecture

## Overview

## Architectural Pattern

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

```

```

```

```

## Key Abstractions (planned)

- **Single-blob cache** (`PRICES_ALL`) — one fetch → one JSON blob → one cache key; all cell writes read from it. Treated as _soft_ (eviction before TTL is normal; always fall back to live fetch).
- **Provider isolation** — each price/balance provider wrapped in independent try/catch so one outage doesn't blank the others (graceful degradation, `PLAN.md` §6.3).
- **Config registry** — all Solana mint addresses + HL tickers live in one `Config` map so adding/removing an asset is a one-line change.
- **Idempotent layout update** — the `--update` path re-applies headers/formats/validations/formulas only, never touching DCA Log data rows.

## Entry Points

- `index.ts` — Bun scaffold entry (`package.json` `"module"` field)
- `layout-builder/src/index.js` — CLI entry (`--build` / `--update`)
- `apps-script/src/Refresh.ts` → `refreshAll()` — trigger entry (must compile to a top-level global)
- `apps-script/src/Triggers.ts` → `installTrigger()` / `removeTrigger()` — must compile to top-level globals

## Architectural Constraints (planned, `PLAN.md` §2)

- **Apps Script global scope** — trigger/entry functions must be top-level in compiled output. Avoid `import`/`export` between Apps Script source files unless the bundler inlines them into one flat file (concatenation-style global scope is how Apps Script links files).
- **Two separate directories, runtimes, dependency sets** — never mixed.
- **Service-account key is local only** — never committed, never pushed to Apps Script.

<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->

## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, `.github/skills/`, or `.codex/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->

## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:

- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->

<!-- GSD:profile-start -->

## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
