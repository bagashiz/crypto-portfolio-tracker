import {
  valuesAt,
  privacyMaskRule,
  type BuildContext,
  type BuildResult,
  type Primitive,
  type SheetRequest,
  type TabModule,
  type ValueRange,
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
 * Styling (`styling()`) is also code-managed: hidden gridlines, a title banner, olive
 * section/header bands (the brand color the other tabs use), zebra striping, borders,
 * column widths, and green/red conditional formatting on the PnL figures.
 *
 * Row positions are FIXED because the charts and style ranges reference them by index —
 * keep the grid and the chart/format ranges in sync if you reflow the layout. Structure
 * (styling + charts) goes via batchUpdate; cell content via the values API (USER_ENTERED).
 *
 * NOTE: re-running adds duplicate charts + conditional-format rules (addChart/addCF never
 * error, unlike addTable), so a rebuild MUST use `--reset` (lib's teardownRequests tears
 * down charts and CF rules first).
 */
const TITLE = "Summary";

// Category order drives both the table rows and the pie/column charts.
const CATEGORIES = ["Safe Haven", "RWA Yield", "Equity", "Crypto"] as const;
const RISKS = ["Low", "Low-Medium", "Medium", "Medium-High", "High"] as const;

// Anchor cells (B2 = USD→IDR rate, B6 = Total Value) the rollups lean on.
const RATE = "$B$2";
const TOTAL_VALUE = "$B$6";

// Menu-only control (no visible checkbox): Z1, off past the dashboard/charts, is the master
// privacy flag `togglePrivacyMode` (Code.gs) writes and mirrors onto the other tabs' own
// local Z1 follower cells (see PRIVACY_FOLLOWER_CELL in sheets/lib.ts).
const PRIVACY_CELL = "$Z$1";

// Per-row formula generators (r = 1-based sheet row).
const catRow = (name: string, r: number): Primitive[] => [
  name,
  `=SUMIF(Holdings[Category], A${r}, Holdings[Value])`,
  `=SUMIF(Holdings[Category], A${r}, Holdings[Tgt. %])`,
  `=IF(${TOTAL_VALUE}=0, 0, B${r}/${TOTAL_VALUE})`,
  // Dev % = Act − Tgt (standard convention: +ve overweight, -ve underweight — matches
  // Holdings' Dev. %/Dev. Value). NOT an action signal; Rebalance $ below is deliberately
  // the opposite sign of this.
  `=D${r}-C${r}`,
  `=(C${r}-D${r})*${TOTAL_VALUE}`, // $ to buy (+) / trim (−) to hit target — independent of Dev %'s sign, not a multiple of it
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

// Risk Profile (D2:F2, beside the rate): target-weighted risk score on a 1–10 scale,
// normalized by Σ targets, plus a label for the nearest tier. Uses each asset's hand-set
// Tgt. % as the weight — so it's the *intended* risk posture, not current. The five tiers
// map to 2/4/6/8/10 (even steps of 2, High = 10); the label (keyed off the score in E2)
// divides by that step to recover the tier index.
const RISK_LEVELS = [2, 4, 6, 8, 10]; // parallel to RISKS (Low … High)
const RISK_STEP = 2;
const RISK_SCORE = `=(${RISKS.map((rk, i) => `SUMIF(Holdings[Risk], "${rk}", Holdings[Tgt. %])*${RISK_LEVELS[i]}`).join(" + ")}) / SUM(Holdings[Tgt. %])`;
const RISK_LABEL = `=CHOOSE(ROUND(E2 / ${RISK_STEP}, 0), ${RISKS.map((rk) => `"${rk}"`).join(", ")})`;

function grid(): Primitive[][] {
  const cat = CATEGORIES.map((c, i) => catRow(c, CAT_FIRST + i));
  const risk = RISKS.map((rk, i) => riskRow(rk, RISK_FIRST + i));
  return [
    ["Portfolio Summary"], // 1
    ["USD → IDR rate", `=GOOGLEFINANCE("CURRENCY:USDIDR")`, "", "Risk Profile", RISK_SCORE, RISK_LABEL], // 2 (rate A:B, risk profile D:F)
    ["", "", ""], // 3 (blank; clears the old A3:C3 risk-profile cells)
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

// ── Styling. All ranges are 0-based, end-exclusive. ──
type Rgb = { red: number; green: number; blue: number };

// Palette anchored on the olive brand color the Holdings/Transactions tables use.
const BRAND: Rgb = { red: 0.20784314, green: 0.40784314, blue: 0.32941177 }; // headers / banner
const BAND: Rgb = { red: 0.84, green: 0.9, blue: 0.86 }; // section divider band
const ZEBRA: Rgb = { red: 0.94, green: 0.965, blue: 0.95 }; // alternating data row
const TOTAL_BG: Rgb = { red: 0.88, green: 0.93, blue: 0.89 }; // category Total row
const WHITE: Rgb = { red: 1, green: 1, blue: 1 };
const BORDER: Rgb = { red: 0.78, green: 0.83, blue: 0.8 };
const CF_GREEN: Rgb = { red: 0.8, green: 0.92, blue: 0.8 }; // PnL > 0
const CF_RED: Rgb = { red: 0.97, green: 0.8, blue: 0.8 }; // PnL < 0
const INK: Rgb = { red: 0.1, green: 0.1, blue: 0.1 }; // dark text for the risk chip
// Risk gradient (parallel to RISKS, Low → High): green → yellow → orange → red.
const RISK_COLORS: Rgb[] = [
  { red: 0.78, green: 0.91, blue: 0.79 }, // Low
  { red: 0.87, green: 0.93, blue: 0.7 }, // Low-Medium
  { red: 0.99, green: 0.91, blue: 0.65 }, // Medium
  { red: 0.98, green: 0.8, blue: 0.58 }, // Medium-High
  { red: 0.96, green: 0.71, blue: 0.67 }, // High
];

const USD = `"$"#,##0.00`;
const IDR = `"Rp"#,##0`;
const PCT = `0.0%`;

const rng = (sheetId: number, r0: number, r1: number, c0: number, c1: number) =>
  ({ sheetId, startRowIndex: r0, endRowIndex: r1, startColumnIndex: c0, endColumnIndex: c1 });

const fill = (sheetId: number, r0: number, r1: number, c0: number, c1: number, rgbColor: Rgb): SheetRequest => ({
  repeatCell: { range: rng(sheetId, r0, r1, c0, c1), cell: { userEnteredFormat: { backgroundColorStyle: { rgbColor } } }, fields: "userEnteredFormat.backgroundColorStyle" },
});
// textFormat only (disjoint from background/align/numberFormat, so calls layer without clobbering).
const text = (sheetId: number, r0: number, r1: number, c0: number, c1: number, opts: { bold?: boolean; fontSize?: number; color?: Rgb }): SheetRequest => {
  const tf: Record<string, unknown> = {};
  if (opts.bold !== undefined) tf.bold = opts.bold;
  if (opts.fontSize !== undefined) tf.fontSize = opts.fontSize;
  if (opts.color) tf.foregroundColorStyle = { rgbColor: opts.color };
  return { repeatCell: { range: rng(sheetId, r0, r1, c0, c1), cell: { userEnteredFormat: { textFormat: tf } }, fields: "userEnteredFormat.textFormat" } };
};
const align = (sheetId: number, r0: number, r1: number, c0: number, c1: number, opts: { h?: string; v?: string }): SheetRequest => {
  const fmt: Record<string, unknown> = {};
  const fields: string[] = [];
  if (opts.h) { fmt.horizontalAlignment = opts.h; fields.push("userEnteredFormat.horizontalAlignment"); }
  if (opts.v) { fmt.verticalAlignment = opts.v; fields.push("userEnteredFormat.verticalAlignment"); }
  return { repeatCell: { range: rng(sheetId, r0, r1, c0, c1), cell: { userEnteredFormat: fmt }, fields: fields.join(",") } };
};
const numFmt = (sheetId: number, r0: number, r1: number, c0: number, c1: number, type: string, pattern: string): SheetRequest => ({
  repeatCell: { range: rng(sheetId, r0, r1, c0, c1), cell: { userEnteredFormat: { numberFormat: { type, pattern } } }, fields: "userEnteredFormat.numberFormat" },
});
const merge = (sheetId: number, r0: number, r1: number, c0: number, c1: number): SheetRequest => ({
  mergeCells: { mergeType: "MERGE_ALL", range: rng(sheetId, r0, r1, c0, c1) },
});
const colWidth = (sheetId: number, c0: number, c1: number, px: number): SheetRequest => ({
  updateDimensionProperties: { range: { sheetId, dimension: "COLUMNS", startIndex: c0, endIndex: c1 }, properties: { pixelSize: px }, fields: "pixelSize" },
});
const rowHeight = (sheetId: number, r0: number, r1: number, px: number): SheetRequest => ({
  updateDimensionProperties: { range: { sheetId, dimension: "ROWS", startIndex: r0, endIndex: r1 }, properties: { pixelSize: px }, fields: "pixelSize" },
});
const allBorders = (sheetId: number, r0: number, r1: number, c0: number, c1: number): SheetRequest => {
  const line = { style: "SOLID", colorStyle: { rgbColor: BORDER } };
  return { updateBorders: { range: rng(sheetId, r0, r1, c0, c1), top: line, bottom: line, left: line, right: line, innerHorizontal: line, innerVertical: line } };
};
const cfRule = (sheetId: number, r0: number, r1: number, c0: number, c1: number, type: string, rgbColor: Rgb): SheetRequest => ({
  addConditionalFormatRule: { index: 0, rule: { ranges: [rng(sheetId, r0, r1, c0, c1)], booleanRule: { condition: { type, values: [{ userEnteredValue: "0" }] }, format: { backgroundColorStyle: { rgbColor } } } } },
});
// Color a cell by exact text match (used for the risk tier chip).
const cfText = (sheetId: number, r0: number, r1: number, c0: number, c1: number, value: string, bg: Rgb): SheetRequest => ({
  addConditionalFormatRule: { index: 0, rule: { ranges: [rng(sheetId, r0, r1, c0, c1)], booleanRule: { condition: { type: "TEXT_EQ", values: [{ userEnteredValue: value }] }, format: { backgroundColorStyle: { rgbColor: bg }, textFormat: { bold: true, foregroundColorStyle: { rgbColor: INK } } } } } },
});

// A section divider band (row r, 0-based) spanning its block's width (cols 0..c1).
const section = (sheetId: number, r: number, c1: number): SheetRequest[] => [
  merge(sheetId, r, r + 1, 0, c1),
  fill(sheetId, r, r + 1, 0, c1, BAND),
  text(sheetId, r, r + 1, 0, c1, { bold: true, fontSize: 11, color: BRAND }),
  align(sheetId, r, r + 1, 0, c1, { v: "MIDDLE" }),
];
// A table header row (row r, 0-based): olive fill, white bold; numeric cols (1..c1) right-aligned.
const header = (sheetId: number, r: number, c1: number): SheetRequest[] => [
  fill(sheetId, r, r + 1, 0, c1, BRAND),
  text(sheetId, r, r + 1, 0, c1, { bold: true, fontSize: 10, color: WHITE }),
  align(sheetId, r, r + 1, 0, c1, { v: "MIDDLE" }),
  align(sheetId, r, r + 1, 1, c1, { h: "RIGHT" }),
];

function styling(sheetId: number): SheetRequest[] {
  return [
    // Canvas: drop gridlines, widen the label column, give room for IDR figures.
    { updateSheetProperties: { properties: { sheetId, gridProperties: { hideGridlines: true } }, fields: "gridProperties.hideGridlines" } },
    colWidth(sheetId, 0, 1, 165),
    colWidth(sheetId, 1, 6, 115),
    rowHeight(sheetId, 0, 1, 40), // title
    rowHeight(sheetId, 3, 4, 26),
    rowHeight(sheetId, 12, 13, 26),
    rowHeight(sheetId, 20, 21, 26),

    // Title banner (A1:F1).
    merge(sheetId, 0, 1, 0, 6),
    fill(sheetId, 0, 1, 0, 6, BRAND),
    text(sheetId, 0, 1, 0, 6, { bold: true, fontSize: 15, color: WHITE }),
    align(sheetId, 0, 1, 0, 6, { v: "MIDDLE" }),

    // Section dividers (KPI/risk are 3 wide, category is 6).
    ...section(sheetId, 3, 3),
    ...section(sheetId, 12, 6),
    ...section(sheetId, 20, 3),

    // Table header rows.
    ...header(sheetId, 4, 3),
    ...header(sheetId, 13, 6),
    ...header(sheetId, 21, 3),

    // Zebra striping on the data rows.
    fill(sheetId, 6, 7, 0, 3, ZEBRA),
    fill(sheetId, 8, 9, 0, 3, ZEBRA),
    fill(sheetId, 10, 11, 0, 3, ZEBRA),
    fill(sheetId, 15, 16, 0, 6, ZEBRA),
    fill(sheetId, 17, 18, 0, 6, ZEBRA),
    fill(sheetId, 23, 24, 0, 3, ZEBRA),
    fill(sheetId, 25, 26, 0, 3, ZEBRA),

    // Category Total row (row 19): emphasized fill + bold.
    fill(sheetId, 18, 19, 0, 6, TOTAL_BG),
    text(sheetId, 18, 19, 0, 6, { bold: true }),

    // Block borders for definition.
    allBorders(sheetId, 4, 11, 0, 3),
    allBorders(sheetId, 13, 19, 0, 6),
    allBorders(sheetId, 21, 27, 0, 3),

    // Number formats.
    numFmt(sheetId, 1, 2, 1, 2, "NUMBER", `#,##0`), // rate (B2)
    numFmt(sheetId, 1, 2, 4, 5, "NUMBER", `0.0" / 10"`), // risk score (E2), 1–10 scale
    text(sheetId, 1, 2, 3, 4, { bold: true, color: BRAND }), // "Risk Profile" label (D2)
    text(sheetId, 1, 2, 5, 6, { bold: true }), // risk tier label (F2); color set by CF below
    // Risk tier chip: color F2 by the tier it shows (green → red).
    ...RISKS.map((rk, i) => cfText(sheetId, 1, 2, 5, 6, rk, RISK_COLORS[i] ?? CF_GREEN)),
    numFmt(sheetId, 5, 10, 1, 2, "CURRENCY", USD), // KPI USD
    numFmt(sheetId, 5, 10, 2, 3, "CURRENCY", IDR), // KPI IDR
    numFmt(sheetId, 10, 11, 1, 2, "PERCENT", PCT), // Return %
    numFmt(sheetId, 14, 19, 1, 2, "CURRENCY", USD), // category Value
    numFmt(sheetId, 14, 19, 2, 5, "PERCENT", PCT), // Tgt/Act/Dev
    numFmt(sheetId, 14, 19, 5, 6, "CURRENCY", USD), // Rebalance $
    numFmt(sheetId, 22, 27, 1, 2, "CURRENCY", USD), // risk Value
    numFmt(sheetId, 22, 27, 2, 3, "PERCENT", PCT), // risk Act %

    // Green/red on the PnL figures (rows 8..11, USD + IDR). CF overrides the zebra fill.
    cfRule(sheetId, 7, 11, 1, 3, "NUMBER_GREATER", CF_GREEN),
    cfRule(sheetId, 7, 11, 1, 3, "NUMBER_LESS", CF_RED),
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
    // Money ranges masked by the privacy checkbox: KPI USD+IDR, category Value + Rebalance $
    // (through the Total row, CAT_TOTAL — not CAT_TOTAL-1, which would exclude it), risk
    // Value. Kept in sync with the row anchors above (CAT_FIRST, CAT_TOTAL, RISK_FIRST).
    const moneyRanges = [
      { sheetId, startRowIndex: 5, endRowIndex: 10, startColumnIndex: 1, endColumnIndex: 3 }, // B6:C10
      { sheetId, startRowIndex: CAT_FIRST - 1, endRowIndex: CAT_TOTAL, startColumnIndex: 1, endColumnIndex: 2 }, // B15:B19
      { sheetId, startRowIndex: CAT_FIRST - 1, endRowIndex: CAT_TOTAL, startColumnIndex: 5, endColumnIndex: 6 }, // F15:F19
      { sheetId, startRowIndex: RISK_FIRST - 1, endRowIndex: RISK_FIRST - 1 + RISKS.length, startColumnIndex: 1, endColumnIndex: 2 }, // B23:B27
    ];
    const privacyValue: ValueRange = { range: "Summary!Z1", values: [[false]] };
    return {
      structure: [
        ...styling(sheetId),
        privacyMaskRule(moneyRanges, PRIVACY_CELL),
        pie(sheetId, "Allocation by Category", CAT_FIRST, CATEGORIES.length, 3),
        tgtVsAct(sheetId, 19),
        pie(sheetId, "Allocation by Risk", RISK_FIRST, RISKS.length, 35),
      ],
      values: [valuesAt(TITLE, grid()), privacyValue],
    };
  },
};
