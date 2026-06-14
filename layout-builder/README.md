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

## Setup

### 1. `.env` (gitignored)

The target spreadsheet ID is supplied at runtime via a gitignored `.env` (it is never
committed to git). `layout-builder` runs on **Node**, so Bun's auto-`.env` loading does
NOT apply — the value is loaded by `node --env-file=.env`. Create `layout-builder/.env`:

```
SPREADSHEET_ID=<the target spreadsheet id>
```

The ID is the long token in the sheet URL: `https://docs.google.com/spreadsheets/d/<id>/edit`.

### 2. Service-account key (gitignored)

Place the service-account JSON key at `layout-builder/service-account.key.json`
(gitignored — never committed, never pushed to Apps Script). Then **share the target
spreadsheet with the service-account email as Editor** (the builder targets a
pre-existing, pre-shared sheet — it never creates one).

## Commands

```sh
# First-time creation: creates the Dashboard + DCA Log tabs and stamps structure.
npm run build            # = node --env-file=.env src/index.js --build

# Idempotent re-apply: re-stamps structure/formats/frozen rows.
npm run update           # = node --env-file=.env src/index.js --update
```

> `--build` **refuses with an error** if the Dashboard or DCA Log tab already exists —
> use `--update` instead (it never deletes or recreates a tab).
>
> `--update` re-applies only the structural band and **never touches the DCA Log
> transaction (data) rows** — running it twice is identical to running it once.
