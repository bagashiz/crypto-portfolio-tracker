# Crypto Portfolio Tracker

A personal Google Sheets crypto portfolio tracker that auto-fetches live prices and
on-chain balances for a Hyperliquid wallet and a Solana wallet, computes DCA-weighted
cost basis and unrealized PnL, and surfaces allocation health.

## Two-Runtime Layout

This is a Bun **workspace** with two isolated runtimes that never share declared
dependency sets. The Google Sheet is the only runtime integration surface between them.

- **`layout-builder/`** — local-only **Node** runtime. Uses `googleapis` (service-account
  auth) to build/refresh the Dashboard + DCA Log sheet structure programmatically. Run on
  demand by a human (`--build` / `--update`, implemented in Phase 2). The
  `service-account.key.json` lives here and is gitignored — never pushed anywhere.
- **`apps-script/`** — TypeScript authored in `src/`, bundled to a flat `dist/Code.js` and
  pushed via `clasp`. Runs on Google's V8 (no npm at runtime); all network calls use
  `UrlFetchApp`. Scheduled time-driven trigger writes prices/balances to the sheet.

## Shared Asset Registry

[`assets.json`](./assets.json) at the repo root is the **single source of truth** for the
asset registry. Adding or removing an asset is a **one-line edit in this one file** —
`layout-builder/` imports it as ESM, and the Apps Script bundle inlines it at build time.

> **Boundary note (D-06):** `assets.json` is build-time static data shared by both
> runtimes — it does **not** violate the "never mixed dependency sets" rule, which refers
> to declared npm dependencies only. Each package's npm deps stay isolated.

## Workspace Commands

```bash
bun install              # provisions both workspace members
bun run deploy           # delegates to: bun run --filter apps-script deploy
bun run build:apps-script
```

This project was created with Bun v1.3.14. [Bun](https://bun.com) is a fast all-in-one
JavaScript runtime.
