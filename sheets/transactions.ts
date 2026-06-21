import {
  valuesAt,
  oneOfList,
  TABLE_BANDING,
  type BuildContext,
  type BuildResult,
  type Primitive,
  type TabModule,
} from "./lib.ts";

/**
 * Transactions tab — the buy/sell ledger that feeds Holdings' cost basis.
 *
 * Reproduces the `Transactions` Table (Date as DATE_TIME, Side as a BUY/SELL
 * dropdown, Price/Fees as CURRENCY, banding) + the header + the `Amount`
 * calculated column (= Qty × Price).
 *
 * The ledger ROWS are SHEET-MANAGED user data — add transactions in the sheet,
 * not here. `SEED` is a point-in-time snapshot so the tab is reproducible from
 * scratch; applying it overwrites whatever rows currently exist.
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

const SEED: Txn[] = [
  { date: "=DATE(2026,6,21)", asset: "BTC", side: "BUY", qty: 0.0000094818, price: 60666, fees: 0 },
  { date: "=DATE(2026,6,21)", asset: "HYPE", side: "BUY", qty: 0.00993473, price: 56.828, fees: 0 },
  { date: "=DATE(2026,6,21)", asset: "XAUt", side: "BUY", qty: 0.00997889, price: 4217.5, fees: 0 },
  { date: "=DATE(2026,6,21)", asset: "IVVon", side: "BUY", qty: 0.014921479, price: 761.42, fees: 0 },
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
  { columnIndex: 5, columnName: "Amount" },
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
      ],
      values: [valuesAt(TITLE, grid)],
    };
  },
};
