# Project Structure

**Analysis Date:** 2026-06-13

> **State note:** The repository is a fresh `bun init` scaffold. This document records the **current directory layout** and the **planned layout** from `PLAN.md` §3 (marked _planned_).

## Current Layout

```
crypto-portfolio-tracker/
├── index.ts            # Bun scaffold entry — console.log("Hello via Bun!")
├── package.json        # "module": "index.ts"; devDep @types/bun; peer typescript
├── bun.lock            # lockfileVersion 1
├── tsconfig.json       # strict ESNext, bundler resolution
├── mise.toml           # pins bun=latest, node=latest (gitignored)
├── README.md           # bun init boilerplate
├── CLAUDE.md           # Bun-only + RTK project instructions
├── PLAN.md             # load-bearing build spec (the real substance)
├── .gitignore
├── .rtk/filters.toml   # untracked (RTK tooling)
└── .planning/codebase/ # this codebase map
```

No application source directories exist yet.

## Planned Layout (`PLAN.md` §3)

```
portfolio-tracker/
├── README.md
├── .gitignore                      # node_modules, *.key.json, .env, .clasp.json, apps-script/dist
├── layout-builder/                 # LOCAL ONLY — Node + service account
│   ├── package.json                # googleapis
│   ├── src/
│   │   ├── index.js                # entry: build or update layout
│   │   ├── auth.js                 # service-account auth (JWT)
│   │   ├── dashboardSheet.js       # Sheet 1 definition
│   │   ├── dcaLogSheet.js          # Sheet 2 definition
│   │   └── config.js               # spreadsheet ID, sheet names, asset list
│   ├── service-account.key.json    # gitignored, user-provided
│   └── README.md
└── apps-script/                    # DEPLOYED via clasp (TypeScript → dist)
    ├── package.json                # typescript, @types/google-apps-script, @google/clasp, esbuild|tsc
    ├── tsconfig.json
    ├── .clasp.json                 # gitignored; "rootDir": "dist"
    ├── appsscript.json             # manifest + OAuth scopes (copied into dist on build)
    ├── src/
    │   ├── Config.ts               # asset registry, refresh interval, cache TTL
    │   ├── Secrets.ts              # PropertiesService + Secret Manager
    │   ├── HyperliquidApi.ts       # UrlFetchApp → Hyperliquid info endpoint
    │   ├── JupiterApi.ts           # UrlFetchApp → Jupiter price API
    │   ├── SolanaRpc.ts            # UrlFetchApp → Solana RPC getTokenAccountsByOwner
    │   ├── Cache.ts                # CacheService wrapper
    │   ├── Refresh.ts              # main trigger: fetch all → write cells
    │   └── Triggers.ts             # install/remove time-driven trigger
    └── dist/                       # build output, what clasp pushes (gitignored)
```

## Key Locations

| Concern | Current | Planned |
|---------|---------|---------|
| Entry point | `index.ts` | `layout-builder/src/index.js`, `apps-script/src/Refresh.ts` |
| Config | `tsconfig.json`, `package.json` | `layout-builder/src/config.js`, `apps-script/src/Config.ts` |
| Secrets | _none_ | `layout-builder/service-account.key.json`, `apps-script/src/Secrets.ts` |
| Build output | _none_ (`bun run`) | `apps-script/dist/` |
| Project spec | `PLAN.md` | `PLAN.md` |
| Codebase map | `.planning/codebase/` | `.planning/codebase/` |

## Naming Conventions

**Current / planned (per `PLAN.md`):**
- **Layout builder** (`layout-builder/src/`) — JavaScript ESM, `camelCase` filenames (`dashboardSheet.js`, `dcaLogSheet.js`, `config.js`, `auth.js`, `index.js`)
- **Apps Script** (`apps-script/src/`) — TypeScript, `PascalCase` filenames matching the Apps Script `.gs` convention (`Config.ts`, `Secrets.ts`, `HyperliquidApi.ts`, `Refresh.ts`, `Triggers.ts`)
- **Two-runtime separation is structural** — the `layout-builder/` vs `apps-script/` split is a hard boundary; dependency sets must not be mixed.

## Spreadsheet Structure (the runtime "schema", `PLAN.md` §4)

The Google Sheet itself is the data model:
- **Sheet 1 — "Dashboard":** Zone A live holdings (rows 1–10, TOTAL row 10), Zone B allocation health (rows 12–21, TOTALS row 21)
- **Sheet 2 — "DCA Log":** append-only transaction log (cols A–I) + per-asset summary block below

---

*Structure analysis: 2026-06-13*
