# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A personal Google Sheets portfolio tracker. **The system lives in two remote Google resources, not in this repo** — the local tree is just a Bun/TypeScript scaffold plus the `gws` CLI used to read and edit those resources. The IDs are in `.env` (see `.env.example`):

- `GOOGLE_SPREADSHEET_ID` → spreadsheet **"Global Crypto & RWA Portfolio"**
- `GOOGLE_APP_SCRIPT_ID` → its **container-bound Apps Script** project (single file `Code.gs`, V8 runtime, `Asia/Jakarta`)

There is no local copy of the spreadsheet or the script; pull them with `gws` when you need current state.

## The spreadsheet

Four tabs:
- **Holdings** — the core table (a formatted Table, so formulas use structured refs like `Holdings[Value]`). One row per asset. Live cells are computed by the Apps Script custom functions, routed by the **Network** column:
  - `Qty.` → `HL_BALANCE(ticker)` / `JUP_BALANCE(mint)` / `USDC_BALANCE()` (Hyperliquid + Solana combined)
  - `Price` → `HL_PRICE(ticker)` / `JUP_PRICE(mint)` / `1` for the USDC row
  - `Value = Qty × Price`; `Cost Basis` via `SUMIFS` over Transactions (Buys + fees − Sells); `Val. %` = Value ÷ Σ Value (the asset's actual share, sits beside `Value`); `Tgt. %` is a hand-set target; `Tgt. Value = Tgt. % × Σ Value` (the target dollar position per asset — how much *should* sit in it); `Dev. % = Tgt − Val`; `Dev. Value = Tgt. Value − Value` (dollar gap to target: +ve buy, −ve trim); `Unreal. PnL = Value − Cost Basis`; `Real. PnL` = weighted-average realized P/L (sell proceeds − fees − avg buy cost × qty sold). Column order interleaves each `%` with its `Value` pair, then groups Cost Basis with the PnLs: `Value, Val. %, Tgt. %, Tgt. Value, Dev. %, Dev. Value, Cost Basis, Unreal. PnL, Real. PnL`.
  - The **Ticker/Mint** column is the lookup identifier passed as the function argument, and it is *not* the display symbol: Hyperliquid rows use the **Hyperliquid spot ticker** (BTC→`UBTC`, XAUt→`XAUT0`, HYPE→`HYPE`), Solana rows use the **SPL token mint address**.
  - Two **conditional-format** rules colour the PnL columns (P:Q): green when `> 0`, red when `< 0`.
  - Column **A (Asset) is frozen** (`gridProperties.frozenColumnCount`) so it stays visible when scrolling horizontally past the later columns. A plain sheet property, not tied to the Table — unaffected by `holdings --reset`.
- **Transactions** — the buy/sell ledger (`Date, Asset, Side, Qty., Price, Amount, Fees`; `Amount = Qty × Price`) that feeds cost basis and realized PnL. `Asset` joins to the Holdings name; `Side` is a `BUY`/`SELL` dropdown.
- **Summary** — the dashboard (`summary.ts`): a USD→IDR rate (via `GOOGLEFINANCE("CURRENCY:USDIDR")`) and a **Risk Profile** at `D2:F2` (target-weighted risk score on a 1–10 scale — tiers map to 2/4/6/8/10 — plus a tier label whose chip is color-coded green→red by conditional formatting), headline KPIs in USD + IDR, allocation-by-Category (with $-to-rebalance), risk breakdown, and three charts. All pure `Holdings[…]`/`Transactions[…]` rollups — no Apps Script needed. Styling (banner, olive bands, zebra, borders, hidden gridlines, PnL + risk-tier conditional colors) is code-managed too.
- **History** — the time series behind the historical charts (`Date, Total Value, Cost Basis, Unreal. PnL, Real. PnL, Total PnL`). **Append-only runtime data**: the Apps Script `snapshotPortfolio()` adds one row/day via a daily trigger. Only the header + structure + two line charts (Value-over-time, PnL-over-time) are code-managed (`history.ts`); the rows are sheet-managed. Deliberately **not** a Table (so `appendRow` stays simple and the whole-column charts grow automatically). No backfill — the series starts when snapshotting begins (the series was wiped and restarted once already, after the PnL fix below).

Each tab's structure/formulas are reproduced in code under `sheets/` (`holdings.ts`, `transactions.ts`, `summary.ts`, `history.ts`). The builders use structured refs throughout and fix a latent bug where BTC's Cost Basis referenced the wrong row (`A6`).

**Formula conventions (Google Sheets Tables — learned the hard way):**
- Prefer **structured Table references** (`Holdings[Value]`, `SUMIFS(Transactions[Amount], …)`) over A1/whole-column ranges (`I:I`).
- **No Excel `[@Column]` "this row" syntax** — it yields `#ERROR!`. Inside a Table, a bare `Holdings[Value]` already resolves to the current row (implicit intersection).
- **Custom-function args and per-row SUMIFS criteria must use A1 relative refs** (`E2`, `F2`, `A2`), not structured refs: a structured self-ref fed to a custom function inside a calculated column doesn't resolve to a scalar and errors. Reserve structured refs for plain column arithmetic (`Val. %`, `Dev. %`, `Unreal. PnL`) and cross-table SUMIFS ranges. Using the A1 criterion also avoids the kind of latent bug the original had (BTC's Cost Basis pointed at `A6`).

## The Apps Script (`Code.gs`)

Exposes **custom spreadsheet functions** the Holdings cells call directly (`=HL_PRICE`, `=HL_PRICES`, `=HL_BALANCE`, `=JUP_PRICE`, `=JUP_PRICES`, `=JUP_BALANCE`, `=USDC_BALANCE`, plus batch `*S` variants). The Holdings live cells refresh when the sheet recalculates (no trigger drives them).

**One scheduled trigger** drives historical snapshots: `snapshotPortfolio()` computes portfolio totals and appends a row to the **History** tab. It fetches **Total Value fresh** (price/balance are custom functions, which go stale when the sheet isn't open — a trigger must not just read those cells) but reads **Cost Basis / Real. PnL** from the Holdings columns (native `SUMIFS`, always fresh), resolved **by header name** (not fixed index — a Holdings column reorder previously mis-read `Val. %` as `Cost Basis`). The trigger is **not** created by pushing code — run `setupDailySnapshotTrigger()` **once** from the Apps Script editor to install it (daily ~23:00 Asia/Jakarta); re-running it replaces rather than duplicates. Triggers bind by **function name**, so pushing a `Code.gs` change alone is enough for the next scheduled fire to run the new logic — no reinstall needed unless the trigger itself is missing or its schedule changes. The **spreadsheet timezone is `Asia/Jakarta`** (set to match the script's) so the appended `new Date()` displays in WIB — if it drifts to another zone, the timestamps render shifted (e.g. `America/Los_Angeles` showed the 23:xx fire as 9:xx).

**Unreal./Real. PnL are summed PER ROW, excluding cash — never `totalValue − costBasis` at the portfolio level.** Cash rows (USDC) have a blank Cost Basis cell (no acquisition cost), but their Value still feeds Total Value. Netting a single aggregate `totalValue - costBasis` double-counts cash as fake profit, since Total Value includes it but Cost Basis doesn't. `computePortfolioTotals()` in `Code.gs` sums `(Value − Cost Basis)` per non-cash row instead, matching how Summary's `SUM(Holdings[Unreal. PnL])` already worked (that column is blank for cash rows too).

Data sources, all raw `UrlFetchApp`, read-only, public addresses only:
- **Hyperliquid** `POST /info` — `spotMetaAndAssetCtxs` (prices, mapped token→`midPx`), `spotClearinghouseState` (balances).
- **Jupiter** — `price/v3` (prices) and `ultra/v1/balances` (balances), both requiring `x-api-key`.

Caching is layered in `withCachedFetch`: `CacheService` (TTL = `CACHE_TTL_SECONDS`, default 300s) for the hot path, a `STALE_<key>` copy in Script Properties as a fallback when a fetch fails, and `LockService` to prevent cache-stampede on concurrent recalcs.

**Secrets live in Script Properties, never in code:** `HL_WALLET_ADDRESS`, `SOL_WALLET_ADDRESS`, `JUP_API_KEY`, and optional `CACHE_TTL_SECONDS`. When editing the script, preserve these reads.

## Developing the spreadsheet

The point of this rewrite is to **expand the sheet's features** (Summary dashboard and History/snapshots are done), not just mirror it. The intended model is a **builder**, not ad-hoc live edits or re-querying state on every change: the sheet's *desired structure* lives as code in the repo and gets applied via `spreadsheets.batchUpdate`.

The dev loop: edit a tab's builder module → apply it → eyeball the live sheet → iterate on the code. This gives version history/diffs per feature, reproducibility (rebuild from scratch), and reviewable changes before they hit the doc. Do **not** re-query the whole sheet every time a change is wanted — the code is the source of truth. Read the live sheet only to (a) resolve tab title → `sheetId` at apply-time, or (b) inspect current state when explicitly asked "what's there now?".

**Two kinds of content — never conflate them:**
- **Code-managed** (structure, formulas, number formats, conditional formatting, the Tables, the asset list + `Tgt. %` targets — these are config) → defined in builder modules.
- **Sheet-managed** (the live balances/prices the formulas fetch, and the **Transactions ledger rows**) → runtime/user data. Add transactions in the sheet, not in code; the ledger in `transactions.ts` is a point-in-time `SEED` snapshot for reproducibility, not the source of truth.

**Layout:** `sheets/apply.ts` resolves tab titles → sheetIds and runs each module (`bun run sheet:build [tab] [--reset] [--dry-run]`); per-tab modules are `holdings.ts`, `transactions.ts`, `summary.ts`, `history.ts`; `sheets/lib.ts` holds helpers (`valuesAt`, `writeValues`, `oneOfList`, `TABLE_BANDING`, `teardownRequests`, `gws`, `resolveSheetMeta`). A module's `build()` returns `{ structure, values }`.

**Creating a new tab:** a module whose tab doesn't exist yet sets `ensureSheetId` (a fixed, collision-free sheetId); the runner prepends an `addSheet` with that id so the module's own charts/formats can reference it in the same batch. Once created, the runner uses the existing sheetId and the `addSheet` is skipped (so re-runs don't re-create). `History` is the example.

**Teardown (`--reset`) covers Tables, conditional-format rules, *and* charts** (`resolveSheetMeta`/`teardownRequests` track all three). A tab with charts or CF rules but no Table (Summary, History) still needs `--reset` to re-run — `addChart`/`addConditionalFormatRule` don't error on a repeat, they silently duplicate.

**Apply is two-phase, and the ordering is load-bearing:**
1. **structure** (teardown + `addTable` + conditional formats) via `spreadsheets.batchUpdate`.
2. **values** (cell content) via the **values API with `USER_ENTERED`** — *not* `updateCells`/`formulaValue`, which stores formulas that fail to bind structured Table refs and render `#ERROR!`.

Between the phases a freshly created Table needs ~10s+ to "settle" before its refs resolve, so `apply.ts` sleeps after an `addTable` (`SHEET_TABLE_SETTLE_MS`, default 12000).

**Re-running:** modules emit `addTable` for a *fresh* build, so a plain re-run onto an already-built tab errors on `addTable` (atomic batch — nothing applies). Use **`--reset`** to tear down the tab's existing Table(s) + conditional-format rules first (CF before table — deleting a Table cascades to its in-range CF rules). For a content-only change (formula tweak) just write the values range. Always `--dry-run` first.

**Rebuilding the Holdings Table breaks dependent structured refs.** Deleting + recreating the `Holdings` Table (any `holdings --reset`, e.g. to add/reorder a column) *freezes* the structured refs in tabs that read it (`Summary`) to the **old column positions** — they keep computing but bind to the wrong column (symptom: values land in the wrong KPI, no `#REF!`). After any Holdings rebuild, **re-apply Summary** (`sheet:build summary --reset`) to re-author its formulas against the new layout.

> **Dropdown chip colors are UI-only and NOT code-managed.** The Sheets API has no field for per-value dropdown colors (`DataValidationRule.condition.values` carry no color), so the builder only creates the dropdown *options* (Category, Risk, Side). The colored chips are set by hand in the UI and are **wiped whenever that tab is rebuilt with `--reset`** (the Table is deleted/recreated). Reapply them manually after a rebuild; avoid `--reset` on Transactions if you want to keep the `Side` chip colors.

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
