import {
  valuesAt,
  oneOfList,
  privacyMaskRule,
  PRIVACY_FOLLOWER_CELL,
  TABLE_BANDING,
  type BuildContext,
  type BuildResult,
  type Primitive,
  type SheetRequest,
  type TabModule,
  type ValueRange,
} from "./lib.ts";

/**
 * Holdings tab — one row per tracked asset; the portfolio's core table.
 *
 * This module reproduces the WHOLE tab from an empty sheet: the `Holdings` Table
 * (column types + Category/Risk dropdowns + banding), the two PnL conditional-
 * format rules, and the header + asset rows + formulas.
 *
 * Code-managed here: structure, formulas, and the asset list + `Tgt. %` targets
 * (treated as configuration). The Transactions ledger stays sheet-managed.
 *
 * NOTE: the live tab is already built, so re-applying as-is will error on `addTable`
 * and duplicate the CF rules — clear the tab first when doing a full rebuild.
 *
 * Formulas use structured refs per project convention. This also FIXES a bug in the
 * live sheet where BTC's (row 2) Cost Basis referenced `A6` instead of its own row;
 * `[@Asset]` makes every row self-referential.
 */
const TITLE = "Holdings";

const HEADERS = [
  "Asset", "Category", "Risk", "Link", "Network", "Ticker/Mint",
  "Qty.", "Price", "Value", "Val. %",
  "Tgt. %", "Tgt. Value", "Dev. %", "Dev. Value",
  "Cost Basis", "Unreal. PnL", "Real. PnL",
] as const;

type Network = "Hyperliquid" | "Solana" | "Hyperliquid & Solana";

interface Asset {
  asset: string;
  category: "Crypto" | "Equity" | "Fixed Income" | "Commodity" | "Cash";
  risk: "Low" | "Low-Medium" | "Medium" | "Medium-High" | "High";
  link: string;
  network: Network;
  /** Lookup arg for the price/balance functions: HL spot ticker, or SPL mint for Solana. */
  tickerOrMint: string;
  /** Target allocation as a fraction (0.15 = 15%). Hand-set config. */
  target: number;
  /** Cash (USDC): no cost basis / PnL. */
  cash?: boolean;
}

const ASSETS: Asset[] = [
  { asset: "BTC", category: "Crypto", risk: "High", link: "https://app.hyperliquid.xyz/trade/BTC/USDC", network: "Hyperliquid", tickerOrMint: "UBTC", target: 0.15 },
  { asset: "HYPE", category: "Crypto", risk: "High", link: "https://app.hyperliquid.xyz/trade/HYPE/USDC", network: "Hyperliquid", tickerOrMint: "HYPE", target: 0.05 },
  { asset: "IVVon", category: "Equity", risk: "Medium-High", link: "https://jup.ag/tokens/CqW2pd6dCPG9xKZfAsTovzDsMmAGKJSDBNcwM96ondo", network: "Solana", tickerOrMint: "CqW2pd6dCPG9xKZfAsTovzDsMmAGKJSDBNcwM96ondo", target: 0.05 },
  { asset: "PST", category: "Fixed Income", risk: "Medium", link: "https://app.huma.finance/", network: "Solana", tickerOrMint: "59obFNBzyTBGowrkif5uK7ojS58vsuWz3ZCvg6tfZAGw", target: 0.2 },
  { asset: "ONyc", category: "Fixed Income", risk: "Medium-High", link: "https://www.orca.so/trade?tokenIn=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v&tokenOut=5Y8NV33Vv7WbnLfq3zBcKSdYPrk7g2KoiQoe7M2tcxp5", network: "Solana", tickerOrMint: "5Y8NV33Vv7WbnLfq3zBcKSdYPrk7g2KoiQoe7M2tcxp5", target: 0.15 },
  { asset: "USDy", category: "Fixed Income", risk: "Low-Medium", link: "https://www.orca.so/trade?tokenIn=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v&tokenOut=A1KLoBrKBde8Ty9qtNQUtq3C2ortoC3u7twggz7sEto6", network: "Solana", tickerOrMint: "A1KLoBrKBde8Ty9qtNQUtq3C2ortoC3u7twggz7sEto6", target: 0.15 },
  { asset: "XAUt", category: "Commodity", risk: "Low-Medium", link: "https://www.orca.so/trade?tokenIn=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v&tokenOut=AymATz4TCL9sWNEEV9Kvyz45CHVhDZ6kUgjTJPzLpU9P", network: "Solana", tickerOrMint: "AymATz4TCL9sWNEEV9Kvyz45CHVhDZ6kUgjTJPzLpU9P", target: 0.15 },
  { asset: "USDC", category: "Cash", risk: "Low", link: "", network: "Hyperliquid & Solana", tickerOrMint: "USDC/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", target: 0.1, cash: true },
];

// Formulas, generated per row `r` (sheet row, 1-based). IMPORTANT: columns that feed a
// scalar into a custom function (Qty/Price) or use a per-row SUMIFS criterion (Cost/Real)
// must use A1 relative refs (E2, F2, A2): inside a Table's calculated column a structured
// self-ref like `Holdings[Ticker/Mint]` does NOT resolve to a scalar and yields #ERROR!.
// Plain column arithmetic (Act/Unreal.) keeps structured refs; cross-table SUMIFS ranges
// stay structured (`Transactions[Amount]`). The A1 criterion also fixes the old A6 bug.
const fQty = (r: number) =>
  `=IF(E${r}="Hyperliquid & Solana", USDC_BALANCE(), IF(E${r}="Hyperliquid", HL_BALANCE(F${r}), IF(E${r}="Solana", JUP_BALANCE(F${r}), "")))`;
const fPrice = (r: number) =>
  `=IF(E${r}="Hyperliquid & Solana", 1, IF(E${r}="Hyperliquid", HL_PRICE(F${r}), IF(E${r}="Solana", JUP_PRICE(F${r}), "")))`;
const fValue = (r: number) => `=G${r}*H${r}`;
// Cost Basis / Real. PnL: MOVING-AVERAGE COST method, via a per-transaction state machine
// (SCAN) — NOT a single all-history weighted average. A single average over every BUY
// minus every SELL breaks once a position fully closes and reopens: it blends the closed
// lot's price into the new lot (overstating Cost Basis) AND retroactively changes the
// ALREADY-REALIZED PnL from the old sale every time a later, unrelated BUY is added — a
// closed sale's PnL must never move again after the fact.
//
// This tracks (running qty, running avg cost/unit, cumulative realized PnL) across the
// asset's transactions IN ROW ORDER (assumes the ledger is entered chronologically, top
// to bottom — an out-of-order row computes the wrong PnL). A BUY updates the running
// average; a SELL locks in realized PnL against the CURRENT average and leaves the
// average untouched, so a later BUY can never revise a sale that already happened.
// Cost Basis = final qty × final avg (naturally $0 once a position is fully closed).
const fState = (r: number) => `LET(
  asset, A${r},
  n, COUNTIFS(Transactions[Asset], asset),
  IF(n=0, {0,0,0}, LET(
    side, FILTER(Transactions[Side], Transactions[Asset]=asset),
    qty,  FILTER(Transactions[Qty.], Transactions[Asset]=asset),
    amt,  FILTER(Transactions[Amount], Transactions[Asset]=asset),
    fee,  FILTER(Transactions[Fees], Transactions[Asset]=asset),
    states, SCAN(HSTACK(0,0,0), SEQUENCE(n), LAMBDA(acc, i, LET(
      q, INDEX(qty, i, 1), s, INDEX(side, i, 1), a, INDEX(amt, i, 1), f, INDEX(fee, i, 1),
      pq, INDEX(acc, 1, 1), pa, INDEX(acc, 1, 2), pr, INDEX(acc, 1, 3),
      IF(s="BUY",
        HSTACK(pq + q, IF(pq + q = 0, 0, (pq * pa + a + f) / (pq + q)), pr),
        HSTACK(pq - q, pa, pr + (a - f - pa * q))
      )
    ))),
    INDEX(states, n, 0)
  ))
)`;
const fCost = (r: number) => `=LET(s, ${fState(r)}, INDEX(s, 1, 1) * INDEX(s, 1, 2))`;
// Val. % — the asset's actual share of total value (= Value ÷ Σ Value).
const F_VAL = `=IF(SUM(Holdings[Value])=0, 0, ROUND(Holdings[Value] / SUM(Holdings[Value]), 4))`;
// Plain column arithmetic, so structured refs (position-independent — the % and Value
// columns sit interleaved, so an A1 ref like K-L would break if columns are reordered).
// Standard finance convention: deviation = Actual − Target. +ve = overweight (holding more
// than target), -ve = underweight (holding less). NOT an action signal — see Real. PnL's
// sibling "Rebalance $" on Summary for the buy(+)/trim(−) framing, which is intentionally
// the opposite sign of this.
const F_DEV = `=Holdings[Val. %]-Holdings[Tgt. %]`;
const F_UPNL = `=Holdings[Value]-Holdings[Cost Basis]`;
// Target dollar position: the asset's target share of the WHOLE portfolio value, i.e. how
// much should sit in this asset. Plain column arithmetic, so structured refs (cf. Val. %).
const F_TGTVAL = `=Holdings[Tgt. %]*SUM(Holdings[Value])`;
// Dollar deviation from target (Actual − Target, same convention as Dev. %): +ve = holding
// more than target (overweight), -ve = holding less (underweight). Equivalent to Dev. % × Σ Value.
const F_DEVVAL = `=Holdings[Value]-Holdings[Tgt. Value]`;
// Cumulative realized PnL — the running-realized-PnL component of the SAME moving-average
// state machine as fCost above, so the two never double-count and a sale's PnL is locked
// in permanently once it happens.
const fReal = (r: number) => `=LET(s, ${fState(r)}, INDEX(s, 1, 3))`;

function rowFor(a: Asset, r: number): Primitive[] {
  return [
    a.asset, a.category, a.risk, a.link, a.network, a.tickerOrMint,
    fQty(r), fPrice(r), fValue(r),
    F_VAL,
    a.target, F_TGTVAL,
    F_DEV, F_DEVVAL,
    a.cash ? null : fCost(r),
    a.cash ? null : F_UPNL,
    a.cash ? null : fReal(r),
  ];
}

// NOTE: dropdown *options* (Category, Risk) are code-managed here, but their CHIP
// COLORS are not — the Sheets API has no field for per-value dropdown colors. Set them by
// hand in the UI; they're wiped on every --reset rebuild of this tab.
const COLUMNS = [
  { columnIndex: 0, columnName: "Asset" },
  { columnIndex: 1, columnName: "Category", columnType: "DROPDOWN", dataValidationRule: oneOfList(["Cash", "Fixed Income", "Commodity", "Equity", "Crypto"]) },
  { columnIndex: 2, columnName: "Risk", columnType: "DROPDOWN", dataValidationRule: oneOfList(["Low", "Low-Medium", "Medium", "Medium-High", "High"]) },
  { columnIndex: 3, columnName: "Link" },
  { columnIndex: 4, columnName: "Network" },
  { columnIndex: 5, columnName: "Ticker/Mint" },
  { columnIndex: 6, columnName: "Qty." },
  { columnIndex: 7, columnName: "Price", columnType: "CURRENCY" },
  { columnIndex: 8, columnName: "Value", columnType: "CURRENCY" },
  { columnIndex: 9, columnName: "Val. %", columnType: "PERCENT" },
  { columnIndex: 10, columnName: "Tgt. %", columnType: "PERCENT" },
  { columnIndex: 11, columnName: "Tgt. Value", columnType: "CURRENCY" },
  { columnIndex: 12, columnName: "Dev. %", columnType: "PERCENT" },
  { columnIndex: 13, columnName: "Dev. Value", columnType: "CURRENCY" },
  { columnIndex: 14, columnName: "Cost Basis", columnType: "CURRENCY" },
  { columnIndex: 15, columnName: "Unreal. PnL", columnType: "CURRENCY" },
  { columnIndex: 16, columnName: "Real. PnL", columnType: "CURRENCY" },
];

// Conditional formatting on the PnL columns (P:Q): green when > 0, red when < 0.
const PNL_GREEN = { red: 0.5764706, green: 0.76862746, blue: 0.49019608 };
const PNL_RED = { red: 0.8784314, green: 0.4, blue: 0.4 };

// Freezes column A so Asset stays visible when scrolling horizontally past the PnL
// columns. Idempotent (just (re)sets a sheet property), so unlike addTable/
// addConditionalFormatRule it's safe to apply on every run without needing --reset.
function freezeAssetColumn(sheetId: number): SheetRequest {
  return {
    updateSheetProperties: {
      properties: { sheetId, gridProperties: { frozenColumnCount: 1 } },
      fields: "gridProperties.frozenColumnCount",
    },
  };
}

// Money columns for the privacy mask (Portfolio ▸ Hide amounts). Price (H) is deliberately
// EXCLUDED — it's a per-unit market price, not a position size, so it stays visible; only
// Value (I) onward reveals how much is actually held/invested.
function privacyRanges(sheetId: number, rows: number): SheetRequest[] {
  return [
    { sheetId, startRowIndex: 1, endRowIndex: rows, startColumnIndex: 8, endColumnIndex: 9 }, // Value
    { sheetId, startRowIndex: 1, endRowIndex: rows, startColumnIndex: 11, endColumnIndex: 12 }, // Tgt. Value
    { sheetId, startRowIndex: 1, endRowIndex: rows, startColumnIndex: 13, endColumnIndex: 17 }, // Dev. Value..Real. PnL
  ];
}

function pnlRule(sheetId: number, type: "NUMBER_GREATER" | "NUMBER_LESS", rgbColor: object): SheetRequest {
  return {
    addConditionalFormatRule: {
      index: 0,
      rule: {
        ranges: [{ sheetId, startRowIndex: 0, endRowIndex: 9, startColumnIndex: 15, endColumnIndex: 17 }],
        booleanRule: {
          condition: { type, values: [{ userEnteredValue: "0" }] },
          format: { backgroundColorStyle: { rgbColor } },
        },
      },
    },
  };
}

export const holdings: TabModule = {
  title: TITLE,
  build(ctx: BuildContext): BuildResult {
    const sheetId = ctx.sheetId(TITLE);
    const rows = ASSETS.length + 1; // header + assets
    const grid: Primitive[][] = [[...HEADERS], ...ASSETS.map((a, i) => rowFor(a, i + 2))];
    return {
      structure: [
        freezeAssetColumn(sheetId),
        {
          addTable: {
            table: {
              name: "Holdings",
              range: { sheetId, startRowIndex: 0, endRowIndex: rows, startColumnIndex: 0, endColumnIndex: HEADERS.length },
              columnProperties: COLUMNS,
              rowsProperties: TABLE_BANDING,
            },
          },
        },
        pnlRule(sheetId, "NUMBER_GREATER", PNL_GREEN),
        pnlRule(sheetId, "NUMBER_LESS", PNL_RED),
        privacyMaskRule(privacyRanges(sheetId, rows), PRIVACY_FOLLOWER_CELL),
      ],
      values: [valuesAt(TITLE, grid), { range: "Holdings!Z1", values: [[false]] } satisfies ValueRange],
    };
  },
};
