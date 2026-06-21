import {
  setCells,
  oneOfList,
  TABLE_BANDING,
  type BuildContext,
  type Primitive,
  type SheetRequest,
  type TabModule,
} from "./lib.ts";

/**
 * Holdings tab — one row per tracked asset; the portfolio's core table.
 *
 * This module reproduces the WHOLE tab from an empty sheet: the `Holdings` Table
 * (column types + Category/Profile dropdowns + banding), the two PnL conditional-
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
  "Asset", "Category", "Profile", "Link", "Network", "Ticker/Mint",
  "Qty.", "Price", "Value", "Cost Basis", "Tgt. %", "Act. %", "Dev. %",
  "Unreal. PnL", "Real. PnL",
] as const;

type Network = "Hyperliquid" | "Solana" | "Hyperliquid & Solana";

interface Asset {
  asset: string;
  category: "Crypto" | "Equity" | "RWA Yield" | "Safe Haven";
  profile: "Low" | "Low-Medium" | "Medium" | "Medium-High" | "High";
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
  { asset: "BTC", category: "Crypto", profile: "High", link: "https://app.hyperliquid.xyz/trade/BTC/USDC", network: "Hyperliquid", tickerOrMint: "UBTC", target: 0.15 },
  { asset: "HYPE", category: "Crypto", profile: "High", link: "https://app.hyperliquid.xyz/trade/HYPE/USDC", network: "Hyperliquid", tickerOrMint: "HYPE", target: 0.05 },
  { asset: "IVVon", category: "Equity", profile: "Medium-High", link: "https://jup.ag/tokens/CqW2pd6dCPG9xKZfAsTovzDsMmAGKJSDBNcwM96ondo", network: "Solana", tickerOrMint: "CqW2pd6dCPG9xKZfAsTovzDsMmAGKJSDBNcwM96ondo", target: 0.05 },
  { asset: "PST", category: "RWA Yield", profile: "Medium", link: "https://app.huma.finance/", network: "Solana", tickerOrMint: "59obFNBzyTBGowrkif5uK7ojS58vsuWz3ZCvg6tfZAGw", target: 0.2 },
  { asset: "ONyc", category: "RWA Yield", profile: "Medium-High", link: "https://www.orca.so/trade?tokenIn=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v&tokenOut=5Y8NV33Vv7WbnLfq3zBcKSdYPrk7g2KoiQoe7M2tcxp5", network: "Solana", tickerOrMint: "5Y8NV33Vv7WbnLfq3zBcKSdYPrk7g2KoiQoe7M2tcxp5", target: 0.15 },
  { asset: "USDy", category: "RWA Yield", profile: "Low-Medium", link: "https://www.orca.so/trade?tokenIn=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v&tokenOut=A1KLoBrKBde8Ty9qtNQUtq3C2ortoC3u7twggz7sEto6", network: "Solana", tickerOrMint: "A1KLoBrKBde8Ty9qtNQUtq3C2ortoC3u7twggz7sEto6", target: 0.15 },
  { asset: "XAUt", category: "Safe Haven", profile: "Low-Medium", link: "https://app.hyperliquid.xyz/trade/XAUT/USDC", network: "Hyperliquid", tickerOrMint: "XAUT0", target: 0.15 },
  { asset: "USDC", category: "Safe Haven", profile: "Low", link: "", network: "Hyperliquid & Solana", tickerOrMint: "USDC/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", target: 0.1, cash: true },
];

// Calculated columns — identical per row, with current-row structured refs (`[@Col]`).
const F_QTY = `=IF([@Network]="Hyperliquid & Solana", USDC_BALANCE(), IF([@Network]="Hyperliquid", HL_BALANCE([@[Ticker/Mint]]), IF([@Network]="Solana", JUP_BALANCE([@[Ticker/Mint]]), "")))`;
const F_PRICE = `=IF([@Network]="Hyperliquid & Solana", 1, IF([@Network]="Hyperliquid", HL_PRICE([@[Ticker/Mint]]), IF([@Network]="Solana", JUP_PRICE([@[Ticker/Mint]]), "")))`;
const F_VALUE = `=[@[Qty.]]*[@Price]`;
const F_COST = `=SUMIFS(Transactions[Amount], Transactions[Asset], [@Asset], Transactions[Side], "BUY") + SUMIFS(Transactions[Fees], Transactions[Asset], [@Asset], Transactions[Side], "BUY") - SUMIFS(Transactions[Amount], Transactions[Asset], [@Asset], Transactions[Side], "SELL")`;
const F_ACT = `=IF(SUM(Holdings[Value])=0, 0, ROUND([@Value]/SUM(Holdings[Value]), 4))`;
const F_DEV = `=[@[Tgt. %]]-[@[Act. %]]`;
const F_UPNL = `=[@Value]-[@[Cost Basis]]`;
// Realized PnL (weighted-average cost): sell proceeds (net of fees) minus the average
// buy cost of the units sold. Zero until there are SELL rows for the asset.
const F_REAL = `=LET(
  sellProceeds, SUMIFS(Transactions[Amount], Transactions[Asset], [@Asset], Transactions[Side], "SELL"),
  sellFees,     SUMIFS(Transactions[Fees],   Transactions[Asset], [@Asset], Transactions[Side], "SELL"),
  sellQty,      SUMIFS(Transactions[Qty.],   Transactions[Asset], [@Asset], Transactions[Side], "SELL"),
  buyAmount,    SUMIFS(Transactions[Amount], Transactions[Asset], [@Asset], Transactions[Side], "BUY"),
  buyQty,       SUMIFS(Transactions[Qty.],   Transactions[Asset], [@Asset], Transactions[Side], "BUY"),
  IF(buyQty=0, 0, sellProceeds - sellFees - (buyAmount / buyQty) * sellQty)
)`;

function rowFor(a: Asset): Primitive[] {
  return [
    a.asset, a.category, a.profile, a.link, a.network, a.tickerOrMint,
    F_QTY, F_PRICE, F_VALUE,
    a.cash ? null : F_COST,
    a.target,
    F_ACT, F_DEV,
    a.cash ? null : F_UPNL,
    a.cash ? null : F_REAL,
  ];
}

const COLUMNS = [
  { columnIndex: 0, columnName: "Asset" },
  { columnIndex: 1, columnName: "Category", columnType: "DROPDOWN", dataValidationRule: oneOfList(["Safe Haven", "RWA Yield", "Equity", "Crypto"]) },
  { columnIndex: 2, columnName: "Profile", columnType: "DROPDOWN", dataValidationRule: oneOfList(["Low", "Low-Medium", "Medium", "Medium-High", "High"]) },
  { columnIndex: 3, columnName: "Link" },
  { columnIndex: 4, columnName: "Network" },
  { columnIndex: 5, columnName: "Ticker/Mint" },
  { columnIndex: 6, columnName: "Qty." },
  { columnIndex: 7, columnName: "Price", columnType: "CURRENCY" },
  { columnIndex: 8, columnName: "Value", columnType: "CURRENCY" },
  { columnIndex: 9, columnName: "Cost Basis", columnType: "CURRENCY" },
  { columnIndex: 10, columnName: "Tgt. %", columnType: "PERCENT" },
  { columnIndex: 11, columnName: "Act. %", columnType: "PERCENT" },
  { columnIndex: 12, columnName: "Dev. %", columnType: "PERCENT" },
  { columnIndex: 13, columnName: "Unreal. PnL", columnType: "CURRENCY" },
  { columnIndex: 14, columnName: "Real. PnL", columnType: "CURRENCY" },
];

// Conditional formatting on the PnL columns (N:O): green when > 0, red when < 0.
const PNL_GREEN = { red: 0.5764706, green: 0.76862746, blue: 0.49019608 };
const PNL_RED = { red: 0.8784314, green: 0.4, blue: 0.4 };

function pnlRule(sheetId: number, type: "NUMBER_GREATER" | "NUMBER_LESS", rgbColor: object): SheetRequest {
  return {
    addConditionalFormatRule: {
      index: 0,
      rule: {
        ranges: [{ sheetId, startRowIndex: 0, endRowIndex: 9, startColumnIndex: 13, endColumnIndex: 15 }],
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
  build(ctx: BuildContext): SheetRequest[] {
    const sheetId = ctx.sheetId(TITLE);
    const rows = ASSETS.length + 1; // header + assets
    const cells: Primitive[][] = [[...HEADERS], ...ASSETS.map(rowFor)];
    return [
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
      setCells(sheetId, 0, 0, cells),
      pnlRule(sheetId, "NUMBER_GREATER", PNL_GREEN),
      pnlRule(sheetId, "NUMBER_LESS", PNL_RED),
    ];
  },
};
