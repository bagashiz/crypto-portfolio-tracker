import {
  valuesAt,
  oneOfList,
  privacyMaskRule,
  PRIVACY_FOLLOWER_CELL,
  TABLE_BANDING,
  type BuildContext,
  type BuildResult,
  type Primitive,
  type TabModule,
  type ValueRange,
} from "./lib.ts";

/**
 * Transactions tab — the buy/sell ledger that feeds Holdings' cost basis.
 *
 * Reproduces the `Transactions` Table (Date as DATE_TIME, Side as a BUY/SELL
 * dropdown, Price/Amount/Fees as CURRENCY, banding) + the header + the `Amount`
 * calculated column (= Qty × Price).
 *
 * The ledger ROWS are SHEET-MANAGED user data — add transactions in the sheet,
 * not here. `SEED` is just an ILLUSTRATIVE placeholder set (round, made-up
 * figures — not real trades) so the tab is reproducible from scratch; applying it
 * OVERWRITES whatever rows currently exist, so don't re-apply over a live ledger.
 */
const TITLE = "Transactions";

const HEADERS = ["Date", "Asset", "Side", "Qty.", "Price", "Amount", "Fees"] as const;

interface Txn {
  /** A DATE() formula so the source stays readable; renders via the column's DATE_TIME format. */
  date: string;
  asset: string;
  side: "BUY" | "SELL";
  qty: number;
  price: number;
  fees: number;
}

// Illustrative placeholders only — round, made-up figures, not real trades.
const SEED: Txn[] = [
  { date: "=DATE(2026,1,1)", asset: "BTC", side: "BUY", qty: 0.001, price: 60000, fees: 0 },
  { date: "=DATE(2026,1,1)", asset: "HYPE", side: "BUY", qty: 1, price: 50, fees: 0 },
  { date: "=DATE(2026,1,1)", asset: "XAUt", side: "BUY", qty: 0.01, price: 4000, fees: 0 },
  { date: "=DATE(2026,1,1)", asset: "IVVon", side: "BUY", qty: 0.01, price: 750, fees: 0 },
];

// Bare `Table[Column]` resolves to the current row in a Table's calculated column;
// the Excel-style `[@Column]` syntax is unsupported in Sheets.
const F_AMOUNT = `=Transactions[Qty.]*Transactions[Price]`;

function rowFor(t: Txn): Primitive[] {
  return [t.date, t.asset, t.side, t.qty, t.price, F_AMOUNT, t.fees];
}

// NOTE: the Side BUY/SELL dropdown options are code-managed, but their chip COLORS are
// not (no Sheets API field for it). They're set by hand in the UI and wiped by --reset, so
// avoid rebuilding this tab if you want to keep them.
const COLUMNS = [
  { columnIndex: 0, columnName: "Date", columnType: "DATE_TIME" },
  { columnIndex: 1, columnName: "Asset" },
  { columnIndex: 2, columnName: "Side", columnType: "DROPDOWN", dataValidationRule: oneOfList(["BUY", "SELL"]) },
  { columnIndex: 3, columnName: "Qty." },
  { columnIndex: 4, columnName: "Price", columnType: "CURRENCY" },
  { columnIndex: 5, columnName: "Amount", columnType: "CURRENCY" },
  { columnIndex: 6, columnName: "Fees", columnType: "CURRENCY" },
];

export const transactions: TabModule = {
  title: TITLE,
  build(ctx: BuildContext): BuildResult {
    const sheetId = ctx.sheetId(TITLE);
    const rows = SEED.length + 1; // header + seed rows
    const grid: Primitive[][] = [[...HEADERS], ...SEED.map(rowFor)];
    return {
      structure: [
        {
          addTable: {
            table: {
              name: "Transactions",
              range: { sheetId, startRowIndex: 0, endRowIndex: rows, startColumnIndex: 0, endColumnIndex: HEADERS.length },
              columnProperties: COLUMNS,
              rowsProperties: TABLE_BANDING,
            },
          },
        },
        // Money columns (Price, Amount, Fees) are contiguous — one rect. `endRowIndex: 1000`
        // is aspirational, not guaranteed: the Sheets API silently CLAMPS a request's range to
        // the sheet's current gridProperties.rowCount at apply time (this tab is intentionally
        // kept small, not grown to 1000 rows just to make this range "stick" — see CLAUDE.md).
        // A ledger row added past the sheet's current bottom won't be covered by this rule
        // until it's re-applied (`sheet:build transactions --reset`, which also re-clamps to
        // whatever the grid is at that point).
        privacyMaskRule(
          [{ sheetId, startRowIndex: 1, endRowIndex: 1000, startColumnIndex: 4, endColumnIndex: 7 }],
          PRIVACY_FOLLOWER_CELL,
        ),
      ],
      values: [valuesAt(TITLE, grid), { range: "Transactions!Z1", values: [[false]] } satisfies ValueRange],
    };
  },
};
