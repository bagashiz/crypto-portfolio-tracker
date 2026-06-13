# Technology Stack

**Analysis Date:** 2026-06-13

> **State note:** The repository is currently a fresh `bun init` scaffold (only `index.ts` with a hello-world `console.log`). The full target stack is defined in `PLAN.md`, which describes two separate runtimes (a local Node layout builder and a Google Apps Script data layer). This document records both the **current implemented stack** and the **planned stack** from `PLAN.md`, clearly separated.

## Languages

**Primary (current):**
- TypeScript `^5` (resolved `5.9.3` per `bun.lock`) — entry point `index.ts`, configured by `tsconfig.json`

**Primary (planned, per `PLAN.md`):**
- TypeScript `^5` — Apps Script data layer authored in `.ts` (`apps-script/src/`), compiled to `dist/` and pushed via `clasp`. TS provides typings only; Apps Script runs Google's V8 (no Node runtime, no npm).
- JavaScript (ESM) — local layout builder (`layout-builder/src/*.js`)

**Secondary:**
- Not detected

## Runtime

**Environment (current):**
- Bun (latest; project created with Bun `1.3.14` per `README.md`)
- Node (latest) — declared in `mise.toml` for tool provisioning

**Environment (planned):**
- Node — local layout builder runtime (`layout-builder/`), talks to Google Sheets API via `googleapis`
- Google Apps Script V8 — data layer runtime (`apps-script/`); no npm/module resolution, all network calls via `UrlFetchApp`

**Tool version management:**
- `mise.toml` pins `bun = "latest"` and `node = "latest"`
- Note: `mise.toml` is listed in `.gitignore` (line 37) — tool config is local only

**Package Manager:**
- Bun (current root project)
- Lockfile: present (`bun.lock`, lockfileVersion 1)
- Planned sub-projects use their own dependency sets: `layout-builder/package.json` and `apps-script/package.json` (per `PLAN.md` §3) — two separate, non-mixed dependency sets

## Frameworks

**Core (current):**
- None — single-file scaffold

**Core (planned):**
- Google Apps Script (data layer) — time-driven triggers, `CacheService`, `PropertiesService`, `UrlFetchApp`, `ScriptApp`, `SpreadsheetApp`
- `clasp` (`@google/clasp`) — Apps Script deployment toolchain (`clasp push` of `dist/`)

**Testing:**
- Bun's built-in test runner (`bun test`) is the project convention (per `CLAUDE.md`). No test files present yet.

**Build/Dev (planned):**
- esbuild or tsc — compiles `apps-script/src/*.ts` → `apps-script/dist/` (flat global-scope output required so trigger entry points are top-level functions)
- `bun build` is the documented bundler for the root/Bun side (per `CLAUDE.md`)

## Key Dependencies

**Current (`package.json` / `bun.lock`):**
- `typescript` `^5` (peerDependency) — language tooling
- `@types/bun` `latest` (devDependency, resolved `1.3.14`) — Bun type definitions
- Transitive: `bun-types` `1.3.14`, `@types/node` `25.9.3`, `undici-types` `7.24.6`

No runtime/production dependencies are installed yet.

**Planned — layout builder (`layout-builder/package.json`):**
- `googleapis` — Google Sheets API client; service-account JWT auth (`google.auth.JWT` / `GoogleAuth`)

**Planned — Apps Script (`apps-script/package.json`):**
- `typescript` — authoring
- `@types/google-apps-script` — Apps Script typings
- `@google/clasp` — deploy tooling
- esbuild (or tsc) — build to flat `dist/`

**Explicitly dropped (per `PLAN.md` §2):**
- `@nktkas/hyperliquid`, `@jup-ag/api`, `gill` — not used anywhere. All exchange/chain calls are raw HTTP via `UrlFetchApp`; no SDKs in either runtime.

## Configuration

**Bun / TypeScript (`tsconfig.json`):**
- Targets/lib: `ESNext`; `module: Preserve`; `moduleResolution: bundler`; `moduleDetection: force`
- `jsx: react-jsx`, `allowJs: true`, `types: ["bun"]`
- `allowImportingTsExtensions: true`, `verbatimModuleSyntax: true`, `noEmit: true`
- Strictness: `strict: true`, `skipLibCheck: true`, `noFallthroughCasesInSwitch: true`, `noUncheckedIndexedAccess: true`, `noImplicitOverride: true`
- Relaxed: `noUnusedLocals: false`, `noUnusedParameters: false`, `noPropertyAccessFromIndexSignature: false`

**Environment:**
- Bun auto-loads `.env` (no `dotenv`, per `CLAUDE.md`)
- `.env*` variants are gitignored (`.gitignore` lines 18–24). No `.env` file currently present.
- Planned: layout builder spreadsheet ID via `config.js` or `.env`

**Secrets (planned, per `PLAN.md` §5.1):**
- Service-account key `layout-builder/service-account.key.json` — local only, gitignored, never pushed to Apps Script
- Apps Script secrets via GCP Secret Manager (Jupiter API key) + `PropertiesService` (Script Properties) for wallet addresses, project ID, resource paths

**Apps Script manifest (planned):**
- `appsscript.json` — OAuth scopes (`spreadsheets`, `external_request`, `cloud-platform`, `script.scriptapp`), timezone/date pinning; copied into `dist/` on build
- `.clasp.json` — `"rootDir": "dist"`, script ID; gitignored

## Platform Requirements

**Development:**
- Bun (latest) and Node (latest), provisioned via `mise`
- Install: `bun install`; run: `bun run index.ts`
- Planned: Google Cloud project with Sheets API + Secret Manager enabled; `clasp login`; a target spreadsheet shared with the service-account email (Editor)

**Production:**
- Layout builder: runs locally/on-demand (`node src/index.js --build|--update`)
- Data layer: deployed to Google Apps Script (sheet-bound), driven by a time-driven trigger (default 5-minute refresh)

---

*Stack analysis: 2026-06-13*
