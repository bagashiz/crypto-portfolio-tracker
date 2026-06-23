import {
  valuesAt,
  type BuildContext,
  type BuildResult,
  type Primitive,
  type SheetRequest,
  type TabModule,
} from "./lib.ts";

/**
 * Summary tab — the portfolio dashboard. Pure rollups of Holdings + Transactions,
 * so it needs no new Apps Script. Everything here is CODE-MANAGED (layout, formulas,
 * number formats, charts).
 *
 * Four blocks, laid out down column A with charts overlaid to the right (col H):
 *   1. Headline KPIs   — totals in USD and IDR (rate via GOOGLEFINANCE).
 *   2. Allocation by Category — value / tgt / act / dev / $-to-rebalance per category.
 *   3. Risk Breakdown  — value + actual % per Risk tier.
 *   plus a pie (category), a pie (risk), and a Tgt-vs-Act column chart.
 *
 * Unlike Holdings/Transactions this tab uses PLAIN cells, not a Table, so its formulas
 * are normal sheet formulas: structured refs like `SUM(Holdings[Value])` resolve fine
 * here (the A1-ref gotcha only bites inside a Table's calculated columns).
 *
 * Row positions are FIXED because the charts reference them by index — keep the grid and
 * the chart/format ranges in sync if you reflow the layout. Charts/formats live in
 * `structure` (batchUpdate); cell content in `values` (values API, USER_ENTERED).
 *
 * NOTE: re-running adds duplicate charts (addChart never errors, unlike addTable), so a
 * rebuild MUST use `--reset` (now tears down charts too, via lib's teardownRequests).
 */
const TITLE = "Summary";

// Category order drives both the table rows and the pie/column charts.
const CATEGORIES = ["Safe Haven", "RWA Yield", "Equity", "Crypto"] as const;
const RISKS = ["Low", "Low-Medium", "Medium", "Medium-High", "High"] as const;

// Anchor cells (B2 = USD→IDR rate, B6 = Total Value) the rollups lean on.
const RATE = "$B$2";
const TOTAL_VALUE = "$B$6";

// Per-row formula generators (r = 1-based sheet row).
const catRow = (name: string, r: number): Primitive[] => [
  name,
  `=SUMIF(Holdings[Category], A${r}, Holdings[Value])`,
  `=SUMIF(Holdings[Category], A${r}, Holdings[Tgt. %])`,
  `=IF(${TOTAL_VALUE}=0, 0, B${r}/${TOTAL_VALUE})`,
  `=C${r}-D${r}`, // Dev % = Tgt − Act
  `=E${r}*${TOTAL_VALUE}`, // $ to buy (+) / trim (−) to hit target
];
const riskRow = (name: string, r: number): Primitive[] => [
  name,
  `=SUMIF(Holdings[Risk], A${r}, Holdings[Value])`,
  `=IF(${TOTAL_VALUE}=0, 0, B${r}/${TOTAL_VALUE})`,
];

// Fixed row anchors (1-based) for the two grouped tables.
const CAT_FIRST = 15; // Safe Haven … Crypto on 15..18, Total on 19
const CAT_TOTAL = CAT_FIRST + CATEGORIES.length; // 19
const RISK_FIRST = 23; // Low … High on 23..27

function grid(): Primitive[][] {
  const cat = CATEGORIES.map((c, i) => catRow(c, CAT_FIRST + i));
  const risk = RISKS.map((rk, i) => riskRow(rk, RISK_FIRST + i));
  return [
    ["Portfolio Summary"], // 1
    ["USD → IDR rate", `=GOOGLEFINANCE("CURRENCY:USDIDR")`], // 2
    [""], // 3
    ["Headline KPIs"], // 4
    ["Metric", "USD", "IDR"], // 5
    ["Total Value", "=SUM(Holdings[Value])", `=B6*${RATE}`], // 6
    ["Total Cost Basis", "=SUM(Holdings[Cost Basis])", `=B7*${RATE}`], // 7
    ["Unrealized PnL", "=SUM(Holdings[Unreal. PnL])", `=B8*${RATE}`], // 8
    ["Realized PnL", "=SUM(Holdings[Real. PnL])", `=B9*${RATE}`], // 9
    ["Total PnL", "=B8+B9", `=B10*${RATE}`], // 10
    ["Return %", "=IF(B7=0, 0, B8/B7)"], // 11
    [""], // 12
    ["Allocation by Category"], // 13
    ["Category", "Value (USD)", "Tgt %", "Act %", "Dev %", "Rebalance $"], // 14
    ...cat, // 15..18
    ["Total", `=SUM(B${CAT_FIRST}:B18)`, `=SUM(C${CAT_FIRST}:C18)`, `=SUM(D${CAT_FIRST}:D18)`, `=SUM(E${CAT_FIRST}:E18)`, `=SUM(F${CAT_FIRST}:F18)`], // 19
    [""], // 20
    ["Risk Breakdown"], // 21
    ["Risk", "Value (USD)", "Act %"], // 22
    ...risk, // 23..27
  ];
}

// ── Formatting helpers (repeatCell). Ranges are 0-based, end-exclusive. ──
function numFmt(sheetId: number, r0: number, r1: number, c0: number, c1: number, type: string, pattern: string): SheetRequest {
  return {
    repeatCell: {
      range: { sheetId, startRowIndex: r0, endRowIndex: r1, startColumnIndex: c0, endColumnIndex: c1 },
      cell: { userEnteredFormat: { numberFormat: { type, pattern } } },
      fields: "userEnteredFormat.numberFormat",
    },
  };
}
function bold(sheetId: number, r0: number, r1: number, c0: number, c1: number): SheetRequest {
  return {
    repeatCell: {
      range: { sheetId, startRowIndex: r0, endRowIndex: r1, startColumnIndex: c0, endColumnIndex: c1 },
      cell: { userEnteredFormat: { textFormat: { bold: true } } },
      fields: "userEnteredFormat.textFormat.bold",
    },
  };
}

const USD = `"$"#,##0.00`;
const IDR = `"Rp"#,##0`;
const PCT = `0.0%`;

function formats(sheetId: number): SheetRequest[] {
  return [
    // Bold: title, section headers, table header rows, the category Total row.
    bold(sheetId, 0, 1, 0, 1),
    bold(sheetId, 3, 4, 0, 1),
    bold(sheetId, 12, 13, 0, 1),
    bold(sheetId, 20, 21, 0, 1),
    bold(sheetId, 4, 5, 0, 3), // row 5 KPI header
    bold(sheetId, 13, 14, 0, 6), // row 14 category header
    bold(sheetId, 18, 19, 0, 6), // row 19 Total
    bold(sheetId, 21, 22, 0, 3), // row 22 risk header
    // Rate (B2) as a plain grouped number.
    numFmt(sheetId, 1, 2, 1, 2, "NUMBER", `#,##0`),
    // KPI block: USD (B6:B10), IDR (C6:C10), Return % (B11).
    numFmt(sheetId, 5, 10, 1, 2, "CURRENCY", USD),
    numFmt(sheetId, 5, 10, 2, 3, "CURRENCY", IDR),
    numFmt(sheetId, 10, 11, 1, 2, "PERCENT", PCT),
    // Category block (rows 15..19): Value + Rebalance $ as USD, Tgt/Act/Dev as %.
    numFmt(sheetId, 14, 19, 1, 2, "CURRENCY", USD),
    numFmt(sheetId, 14, 19, 2, 5, "PERCENT", PCT),
    numFmt(sheetId, 14, 19, 5, 6, "CURRENCY", USD),
    // Risk block (rows 23..27): Value as USD, Act as %.
    numFmt(sheetId, 22, 27, 1, 2, "CURRENCY", USD),
    numFmt(sheetId, 22, 27, 2, 3, "PERCENT", PCT),
  ];
}

// ── Charts (addChart). Anchored down column H (columnIndex 7). ──
function source(sheetId: number, r0: number, r1: number, c0: number, c1: number) {
  return { sourceRange: { sources: [{ sheetId, startRowIndex: r0, endRowIndex: r1, startColumnIndex: c0, endColumnIndex: c1 }] } };
}
function overlay(sheetId: number, anchorRow: number): object {
  return { overlayPosition: { anchorCell: { sheetId, rowIndex: anchorRow, columnIndex: 7 }, widthPixels: 480, heightPixels: 280 } };
}

function pie(sheetId: number, title: string, firstRow1: number, count: number, anchorRow: number): SheetRequest {
  const r0 = firstRow1 - 1; // labels in col A, values in col B
  const r1 = r0 + count;
  return {
    addChart: {
      chart: {
        spec: {
          title,
          pieChart: { legendPosition: "RIGHT_LEGEND", domain: source(sheetId, r0, r1, 0, 1), series: source(sheetId, r0, r1, 1, 2) },
        },
        position: overlay(sheetId, anchorRow),
      },
    },
  };
}

// Tgt vs Act column chart over the category table (header row 14 included; headerCount:1
// makes "Tgt %"/"Act %" the series names and the categories the axis labels).
function tgtVsAct(sheetId: number, anchorRow: number): SheetRequest {
  const r0 = 13; // header row 14 (0-based)
  const r1 = CAT_TOTAL - 1; // through last category (row 18), excludes Total
  return {
    addChart: {
      chart: {
        spec: {
          title: "Target vs Actual by Category",
          basicChart: {
            chartType: "COLUMN",
            legendPosition: "BOTTOM_LEGEND",
            headerCount: 1,
            axis: [
              { position: "BOTTOM_AXIS", title: "Category" },
              { position: "LEFT_AXIS", title: "Allocation %" },
            ],
            domains: [{ domain: source(sheetId, r0, r1, 0, 1) }],
            series: [
              { series: source(sheetId, r0, r1, 2, 3), targetAxis: "LEFT_AXIS" }, // Tgt %
              { series: source(sheetId, r0, r1, 3, 4), targetAxis: "LEFT_AXIS" }, // Act %
            ],
          },
        },
        position: overlay(sheetId, anchorRow),
      },
    },
  };
}

export const summary: TabModule = {
  title: TITLE,
  build(ctx: BuildContext): BuildResult {
    const sheetId = ctx.sheetId(TITLE);
    return {
      structure: [
        ...formats(sheetId),
        pie(sheetId, "Allocation by Category", CAT_FIRST, CATEGORIES.length, 3),
        tgtVsAct(sheetId, 19),
        pie(sheetId, "Allocation by Risk", RISK_FIRST, RISKS.length, 35),
      ],
      values: [valuesAt(TITLE, grid())],
    };
  },
};
