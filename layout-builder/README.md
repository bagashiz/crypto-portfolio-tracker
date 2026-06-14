# layout-builder

**Local-only Node runtime** that builds and refreshes the Google Sheet structure
(Dashboard + DCA Log tabs) programmatically via the Google Sheets API (`googleapis`,
service-account auth). This package is **never deployed** — it runs on the developer's
machine on demand.

## Security

- `service-account.key.json` lives **in this directory**, is **gitignored**, and is
  **never pushed** anywhere — not committed to git and not pushed to Apps Script.
- All access is **read-only / structural**; no private keys, no signing.

## Shared Asset Registry

`src/config.js` imports the **shared** repo-root [`assets.json`](../assets.json) as ESM —
the single source of truth for the asset registry. Assets are never duplicated here;
adding or removing an asset is a one-line edit in `assets.json`.

## Status

Phase 1 scaffolds this package only (declared `googleapis` dependency, config wiring,
this README). **Phase 2** implements the actual `--build` / `--update` CLI
(`src/index.js`, `src/auth.js`, `src/dashboardSheet.js`, `src/dcaLogSheet.js`).
