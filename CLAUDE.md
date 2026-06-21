# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A personal Google Sheets portfolio tracker. **The system lives in two remote Google resources, not in this repo** — the local tree is just a Bun/TypeScript scaffold plus the `gws` CLI used to read and edit those resources. The IDs are in `.env` (see `.env.example`):

- `GOOGLE_SPREADSHEET_ID` → spreadsheet **"Global Crypto & RWA Portfolio"**
- `GOOGLE_APP_SCRIPT_ID` → its **container-bound Apps Script** project (single file `Code.gs`, V8 runtime, `Asia/Jakarta`)

There is no local copy of the spreadsheet or the script; pull them with `gws` when you need current state.

## The spreadsheet

Three tabs:
- **Holdings** — the core table (a formatted Table, so formulas use structured refs like `Holdings[Value]`). One row per asset. Live cells are computed by the Apps Script custom functions, routed by the **Network** column:
  - `Qty.` → `HL_BALANCE(ticker)` / `JUP_BALANCE(mint)` / `USDC_BALANCE()` (Hyperliquid + Solana combined)
  - `Price` → `HL_PRICE(ticker)` / `JUP_PRICE(mint)` / `1` for the USDC row
  - `Value = Qty × Price`; `Cost Basis` via `SUMIFS` over Transactions (Buys + fees − Sells); `Tgt. %` is a hand-set target; `Act. %` = Value ÷ Σ Value; `Dev. % = Tgt − Act`; `Unreal. PnL = Value − Cost Basis`; `Real. PnL` = weighted-average realized P/L (sell proceeds − fees − avg buy cost × qty sold).
  - The **Ticker/Mint** column is the lookup identifier passed as the function argument, and it is *not* the display symbol: Hyperliquid rows use the **Hyperliquid spot ticker** (BTC→`UBTC`, XAUt→`XAUT0`, HYPE→`HYPE`), Solana rows use the **SPL token mint address**.
  - Two **conditional-format** rules colour the PnL columns (N:O): green when `> 0`, red when `< 0`.
- **Transactions** — the buy/sell ledger (`Date, Asset, Side, Qty., Price, Amount, Fees`; `Amount = Qty × Price`) that feeds cost basis and realized PnL. `Asset` joins to the Holdings name; `Side` is a `BUY`/`SELL` dropdown.
- **Summary** — currently empty; **to be built out** (see *Developing the spreadsheet*).

Each tab's structure/formulas are reproduced in code under `sheets/` (`holdings.ts`, `transactions.ts`, `summary.ts`). The builders use structured refs throughout and fix a latent bug where BTC's Cost Basis referenced the wrong row (`A6`).

**Formula convention:** prefer **structured Table references** (`Holdings[Value]`, `SUM(Holdings[Value])`) over A1/whole-column ranges (`I:I`, `I2:I9`). They're self-documenting and survive row/column moves. Use A1-style only where structured refs don't apply (e.g. cross-tab `SUMIFS(Transactions!F:F, …)`, or a single anchored cell).

## The Apps Script (`Code.gs`)

Exposes **custom spreadsheet functions** the Holdings cells call directly (`=HL_PRICE`, `=HL_PRICES`, `=HL_BALANCE`, `=JUP_PRICE`, `=JUP_PRICES`, `=JUP_BALANCE`, `=USDC_BALANCE`, plus batch `*S` variants). There is **no scheduled trigger** — values refresh when the sheet recalculates.

Data sources, all raw `UrlFetchApp`, read-only, public addresses only:
- **Hyperliquid** `POST /info` — `spotMetaAndAssetCtxs` (prices, mapped token→`midPx`), `spotClearinghouseState` (balances).
- **Jupiter** — `price/v3` (prices) and `ultra/v1/balances` (balances), both requiring `x-api-key`.

Caching is layered in `withCachedFetch`: `CacheService` (TTL = `CACHE_TTL_SECONDS`, default 300s) for the hot path, a `STALE_<key>` copy in Script Properties as a fallback when a fetch fails, and `LockService` to prevent cache-stampede on concurrent recalcs.

**Secrets live in Script Properties, never in code:** `HL_WALLET_ADDRESS`, `SOL_WALLET_ADDRESS`, `JUP_API_KEY`, and optional `CACHE_TTL_SECONDS`. When editing the script, preserve these reads.

## Developing the spreadsheet

The point of this rewrite is to **expand the sheet's features** (first up: building out the empty Summary tab), not just mirror it. The intended model is a **builder**, not ad-hoc live edits or re-querying state on every change: the sheet's *desired structure* lives as code in the repo and gets applied via `spreadsheets.batchUpdate`.

The dev loop: edit a tab's builder module → apply it → eyeball the live sheet → iterate on the code. This gives version history/diffs per feature, reproducibility (rebuild from scratch), and reviewable changes before they hit the doc. Do **not** re-query the whole sheet every time a change is wanted — the code is the source of truth. Read the live sheet only to (a) resolve tab title → `sheetId` at apply-time, or (b) inspect current state when explicitly asked "what's there now?".

**Two kinds of content — never conflate them:**
- **Code-managed** (structure, formulas, number formats, conditional formatting, the Tables, the asset list + `Tgt. %` targets — these are config) → defined in builder modules.
- **Sheet-managed** (the live balances/prices the formulas fetch, and the **Transactions ledger rows**) → runtime/user data. Add transactions in the sheet, not in code; the ledger in `transactions.ts` is a point-in-time `SEED` snapshot for reproducibility, not the source of truth.

**Layout:** `sheets/apply.ts` resolves tab titles → sheetIds and runs each module's `batchUpdate` requests (`bun run sheet:build [tab] [--dry-run]`); per-tab modules are `holdings.ts`, `transactions.ts`, `summary.ts`; `sheets/lib.ts` holds the request helpers (`setCells`, `oneOfList`, `TABLE_BANDING`, `gws`, `resolveSheetIds`).

**Re-running:** each module emits `addTable` + CF rules for a *fresh* build, so a plain re-run onto an already-built tab errors on `addTable` (the batch is atomic — nothing applies). Use **`--reset`** to make a full rebuild safely re-runnable: it tears down the tab's existing Table(s) and conditional-format rules (via `deleteTable` / `deleteConditionalFormatRule`) before re-adding, in the same atomic batch. For a content-only change (e.g. a formula tweak) just send the `setCells` portion — that's idempotent on its own. Always `--dry-run` first.

## Toolchain & commands

- **Runtime: Bun** (not Node), pinned with `gcloud` in `mise.toml` — `mise install` to provision. TypeScript runs through Bun (`noEmit`, bundler resolution, `.ts` extension imports); there is no build step and no `scripts` field in `package.json`.

```bash
bun install              # deps (bun.lock)
bunx tsc --noEmit        # typecheck
bun test                 # *.test.ts (Bun test runner)

bun run as:pull          # remote Apps Script -> ./apps-script/src
bun run as:push          # ./apps-script/src -> remote (replaces ALL files)
bun run as:push --dry-run # validate the push without writing

bun run sheet:build [tab] [--reset] [--dry-run]   # apply the sheet builders (all tabs, or one)
```

## Working with the remote via `gws`

`gws` is the Google Workspace CLI dev-dependency — invoke it as **`bunx gws`** (it is not on `$PATH`). Skills under `.claude/skills/` (`gws-shared`, `gws-sheets`, `gws-script`) document auth and methods; read `gws-shared` first. Auth uses the local keyring (`gws auth login`).

Pattern for any call: discover with `bunx gws <service> --help`, inspect params with `bunx gws schema <service>.<resource>.<method>`, then pass `--params`/`--json`. Quote ranges in double quotes (`"Holdings!A1:O9"`) so the `!` survives the shell.

### Apps Script: clasp-style pull/push

`apps-script/sync.ts` (run via `bun run as:pull` / `as:push`) wraps `gws script projects getContent`/`updateContent` to sync the project to/from **`apps-script/src/`**. File-type mapping mirrors clasp: `SERVER_JS`→`.gs`, `HTML`→`.html`, the manifest→`appsscript.json`. The script id comes from `GOOGLE_APP_SCRIPT_ID`.

`updateContent` **clears and replaces the entire project**, so push always sends the full file set — edit files in `apps-script/src/`, never push a partial set (the script refuses to push if `appsscript.json` is missing). Use `as:push --dry-run` to validate first, and confirm before any real push.

### Sheets: builder + ad-hoc reads
Build/refresh tab structure with `bun run sheet:build` (see *Developing the spreadsheet*). For one-off inspection:
```bash
bunx gws sheets +read --spreadsheet "$GOOGLE_SPREADSHEET_ID" --range "Holdings!A1:O9"
```
Confirm before any write/delete; prefer `--dry-run` first.
