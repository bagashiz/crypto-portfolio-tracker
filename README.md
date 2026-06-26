# Crypto Portfolio Tracker

A personal, code-managed **Google Sheets portfolio tracker** for crypto and tokenized real-world assets (RWAs). It pulls live balances and prices from **Hyperliquid** and **Solana (via Jupiter)** straight into a spreadsheet, then layers cost basis, P/L, allocation, rebalancing, and risk analysis on top — with a daily historical snapshot.

> The "app" is a Google Sheet plus its bound Apps Script. This repo is the **source of truth for that sheet's structure** (a TypeScript builder) and the Apps Script code — not a server you run.

## Why

Balances live in different places — a Hyperliquid account, a Solana wallet (RWA yield tokens, tokenized equities, stables) — and neither venue gives you a single portfolio view across both. Spreadsheets can hold the view, but maintaining formulas, fetching live prices, and keeping a tidy dashboard by hand is tedious and error-prone.

This project combines **Hyperliquid + Solana holdings into one sheet**, fetches prices/balances automatically, and computes the things you actually care about:

- What's my **total value** (in USD and IDR)?
- What's my **cost basis** and **unrealized / realized P/L**?
- How is the portfolio **allocated** vs. my targets, and **how many dollars** do I need to move to rebalance?
- How **risky** is the book, weighted by target allocation?
- How has it **trended** over time?

## How it works

Three pieces:

1. **The Google Spreadsheet** — the live document with four tabs (Holdings, Transactions, Summary, History).
2. **A container-bound Apps Script** (`Code.gs`) — exposes custom spreadsheet functions (`=HL_PRICE`, `=JUP_BALANCE`, …) that the Holdings cells call to fetch live data, plus a daily trigger that appends a snapshot to History.
3. **This repo** — a Bun/TypeScript **builder** that defines each tab's desired structure/formulas as code and applies it to the sheet via the Google Sheets API, using the [`gws`](https://github.com/googleworkspace/cli) CLI. The code is the source of truth; you edit a builder module and re-apply, rather than hand-editing the sheet.

```
┌──────────────┐   custom functions    ┌─────────────────────┐
│  Hyperliquid │◀──(=HL_PRICE, etc.)──▶│                     │
│   /info API  │                       │  Apps Script Code.gs │
└──────────────┘                       │  (bound to sheet)    │
┌──────────────┐                       │  + daily snapshot    │
│ Jupiter API  │◀──(=JUP_BALANCE)─────▶│    trigger           │
│ price/balance│                       └──────────┬──────────┘
└──────────────┘                                  │
                                                  ▼
   this repo  ──build via gws──▶  ┌───────────────────────────┐
   (sheets/*.ts builder)          │   Google Spreadsheet       │
   (apps-script/src/*.gs)         │   Holdings │ Transactions   │
                                  │   Summary  │ History        │
                                  └───────────────────────────┘
```

## Features

### Holdings — the core table
One row per asset, routed by a **Network** column (Hyperliquid / Solana / combined):
- **Live `Qty.` and `Price`** via custom functions (`HL_BALANCE`/`HL_PRICE`, `JUP_BALANCE`/`JUP_PRICE`, combined `USDC_BALANCE`).
- `Value = Qty × Price`, `Cost Basis` (from the Transactions ledger), `Val. %` (actual share of the book).
- **Targets & rebalancing in dollars:** hand-set `Tgt. %` → `Tgt. Value` (`Tgt. % × total value`, how much *should* sit in the asset) and `Dev. Value` (`Tgt. Value − Value`, the dollar gap: positive = buy, negative = trim).
- `Unreal. PnL`, `Real. PnL` (weighted-average realized), with green/red conditional formatting.

### Transactions — the ledger
Your buy/sell history (`Date, Asset, Side, Qty., Price, Amount, Fees`). Feeds cost basis and realized P/L. You add rows here in the sheet.

### Summary — the dashboard
- USD→IDR conversion via `GOOGLEFINANCE("CURRENCY:USDIDR")`.
- **Risk Profile** — a target-weighted 1–10 risk score with a color-coded tier label.
- Headline KPIs in USD **and** IDR, allocation-by-Category with dollars-to-rebalance, risk breakdown, and charts.
- Pure spreadsheet rollups — no Apps Script needed.

### History — the time series
A daily Apps Script trigger appends `Date, Total Value, Cost Basis, Unreal. PnL, Real. PnL, Total PnL`, charted as value-over-time and PnL-over-time.

## Tech stack

- **[Bun](https://bun.sh)** runtime + TypeScript (no build step).
- **[mise](https://mise.jdx.dev)** to pin Bun + gcloud.
- **[`gws`](https://github.com/googleworkspace/cli)** (Google Workspace CLI) for Sheets / Apps Script API access.
- **Google Apps Script** (V8) for live data + the snapshot trigger.
- Data sources: **[Hyperliquid API](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api)** (public, no key) and **[Jupiter API](https://dev.jup.ag)** (price v3 + ultra balances, API key required).

## Setup

### 1. Prerequisites

Install [mise](https://mise.jdx.dev), then provision the pinned toolchain (Bun + gcloud):

```bash
mise install
bun install            # installs deps, including the gws CLI (dev dependency)
```

### 2. Create the spreadsheet and its Apps Script

1. Create a new Google Sheet (e.g. "Global Crypto & RWA Portfolio"). Note its **spreadsheet ID** from the URL.
2. In the sheet, open **Extensions → Apps Script** to create the **container-bound** script project. In its **Project Settings**, note the **Script ID**, and set:
   - **Runtime:** V8
   - **Time zone:** `Asia/Jakarta` (or your zone — keep it consistent with the spreadsheet's, see step 7).
3. Set the **spreadsheet's** time zone to match (File → Settings → Time zone). This matters: the daily snapshot writes `new Date()`, which Sheets renders in the *spreadsheet's* zone — a mismatch makes timestamps look shifted.

### 3. Get the API credentials

- **Hyperliquid:** nothing needed — the public `POST /info` endpoint requires no key.
- **Jupiter:** create an API key in the **[Jupiter portal](https://portal.jup.ag)** (used for `price/v3` and `ultra/v1/balances`).
- **Wallet addresses** (read-only, public):
  - `HL_WALLET_ADDRESS` — the EVM address used on Hyperliquid.
  - `SOL_WALLET_ADDRESS` — your Solana wallet (base58).

### 4. Configure Apps Script Script Properties

Secrets live in **Script Properties**, never in code. In the Apps Script editor: **Project Settings → Script Properties**, add:

| Property | Value |
|---|---|
| `HL_WALLET_ADDRESS` | your Hyperliquid EVM address |
| `SOL_WALLET_ADDRESS` | your Solana wallet address |
| `JUP_API_KEY` | your Jupiter API key |
| `CACHE_TTL_SECONDS` | *(optional)* price/balance cache TTL, default `300` |

### 5. Authenticate `gws` and set local env

```bash
bunx gws auth login          # browser OAuth; grants Sheets + Apps Script access
cp .env.example .env
```

Fill in `.env`:

```
GOOGLE_SPREADSHEET_ID=...    # from step 2
GOOGLE_APP_SCRIPT_ID=...     # the Apps Script project's Script ID
```

### 6. Push the Apps Script and build the tabs

```bash
# Push the custom functions + snapshot code to the bound script project.
bun run as:push --dry-run    # validate first
bun run as:push              # replaces ALL files in the project

# Build the sheet tabs (structure, formulas, formatting). --reset makes it re-runnable.
bun run sheet:build --dry-run
bun run sheet:build --reset
```

The asset list, networks, **Ticker/Mint** identifiers, and target % live in `sheets/holdings.ts` — edit them to match your own portfolio. The **Ticker/Mint** is the *lookup* identifier, not the display symbol:
- Hyperliquid rows use the **spot ticker** (e.g. BTC → `UBTC`, XAUt → `XAUT0`, HYPE → `HYPE`).
- Solana rows use the **SPL token mint address**.

> The seed rows in `sheets/transactions.ts` are illustrative placeholders. Add your real trades in the **Transactions** tab in the sheet, not in code.

### 7. Install the daily snapshot trigger

Triggers can't be created by pushing code. Open the Apps Script editor and **run `setupDailySnapshotTrigger()` once** (authorize when prompted). It installs a daily ~23:00 (project time zone) trigger that appends to History; re-running it replaces rather than duplicates.

## Daily use & dev loop

- **Add trades** in the Transactions tab; balances/prices refresh automatically when the sheet recalculates.
- **Evolve the sheet** by editing a builder module (`sheets/*.ts`) and re-applying — you get version history, diffs, and reproducibility:

```bash
bun run sheet:build holdings --reset --dry-run   # preview
bun run sheet:build holdings --reset             # apply one tab
```

## Commands

```bash
bun install                  # install deps
bunx tsc --noEmit            # typecheck
bun test                     # run tests

bun run as:pull              # remote Apps Script -> apps-script/src
bun run as:push [--dry-run]  # apps-script/src -> remote (replaces ALL files)

bun run sheet:build [tab] [--reset] [--dry-run]   # apply the sheet builder(s)

bunx gws sheets +read --spreadsheet "$GOOGLE_SPREADSHEET_ID" --range "Holdings!A1:Q9"   # ad-hoc read
```

## Notes & caveats

- **Secrets stay in Script Properties.** `.env` (gitignored) only holds the spreadsheet/script IDs. No wallet addresses or API keys are committed.
- **Dropdown chip colors are UI-only.** The Sheets API can't set per-value dropdown colors, so Category/Risk/Side chip colors are set by hand and are wiped whenever that tab is rebuilt with `--reset` — reapply them in the UI.
- **Rebuilding the Holdings Table** (`holdings --reset`) re-binds dependent formulas in Summary to the old column layout; re-apply Summary (`sheet:build summary --reset`) afterward.
- See [`CLAUDE.md`](./CLAUDE.md) for the full architecture and formula conventions.

## License

Personal project — no warranty. Use at your own risk; nothing here is financial advice.
```
