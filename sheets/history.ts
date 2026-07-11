import {
  valuesAt,
  privacyMaskRule,
  PRIVACY_FOLLOWER_CELL,
  type BuildContext,
  type BuildResult,
  type Primitive,
  type SheetRequest,
  type TabModule,
  type ValueRange,
} from "./lib.ts";

/**
 * History tab — the time series behind the historical PnL charts.
 *
 * This tab is APPEND-ONLY runtime data: the Apps Script `snapshotPortfolio()` (run daily
 * by a time-driven trigger) appends one row of fresh totals per day. Only the HEADER and
 * the tab's structure/charts are code-managed here; the data rows are sheet-managed, like
 * the Transactions ledger. There is intentionally no Table (so `appendRow` stays simple
 * and the charts can read whole growing columns).
 *
 * The tab may not exist yet — `ensureSheetId` lets the runner create it (addSheet) on the
 * first `sheet:build history`. The two line charts read whole columns (A:F), so they pick
 * up new snapshot rows automatically. Re-running MUST use `--reset` (charts would dup).
 */
const TITLE = "History";
const SHEET_ID = 424242; // fixed id for first-time creation (distinct from the other tabs)

const HEADERS = [
  "Date", "Total Value", "Cost Basis", "Unreal. PnL", "Real. PnL", "Total PnL",
] as const;

// Brand palette (matches the other tabs' header).
const BRAND = { red: 0.20784314, green: 0.40784314, blue: 0.32941177 };
const WHITE = { red: 1, green: 1, blue: 1 };
const USD = `"$"#,##0.00`;

const rng = (sheetId: number, r0: number, r1: number, c0: number, c1: number) =>
  ({ sheetId, startRowIndex: r0, endRowIndex: r1, startColumnIndex: c0, endColumnIndex: c1 });

// A whole-column source (no row bounds) so charts grow with appended snapshots.
const col = (sheetId: number, c: number) => ({ sourceRange: { sources: [{ sheetId, startColumnIndex: c, endColumnIndex: c + 1 }] } });

function lineChart(sheetId: number, title: string, seriesCols: number[], anchorRow: number): SheetRequest {
  return {
    addChart: {
      chart: {
        spec: {
          title,
          basicChart: {
            chartType: "LINE",
            legendPosition: "BOTTOM_LEGEND",
            headerCount: 1,
            axis: [
              { position: "BOTTOM_AXIS", title: "Date" },
              { position: "LEFT_AXIS", title: "USD" },
            ],
            domains: [{ domain: col(sheetId, 0) }], // Date
            series: seriesCols.map((c) => ({ series: col(sheetId, c), targetAxis: "LEFT_AXIS" })),
          },
        },
        position: { overlayPosition: { anchorCell: { sheetId, rowIndex: anchorRow, columnIndex: 7 }, widthPixels: 600, heightPixels: 320 } },
      },
    },
  };
}

export const history: TabModule = {
  title: TITLE,
  ensureSheetId: SHEET_ID,
  build(ctx: BuildContext): BuildResult {
    const sheetId = ctx.sheetId(TITLE);
    const grid: Primitive[][] = [[...HEADERS]];
    return {
      structure: [
        // Canvas + header styling.
        { updateSheetProperties: { properties: { sheetId, gridProperties: { hideGridlines: true, frozenRowCount: 1 } }, fields: "gridProperties.hideGridlines,gridProperties.frozenRowCount" } },
        { updateDimensionProperties: { range: { sheetId, dimension: "COLUMNS", startIndex: 0, endIndex: 1 }, properties: { pixelSize: 160 }, fields: "pixelSize" } },
        { updateDimensionProperties: { range: { sheetId, dimension: "COLUMNS", startIndex: 1, endIndex: 6 }, properties: { pixelSize: 115 }, fields: "pixelSize" } },
        { repeatCell: { range: rng(sheetId, 0, 1, 0, 6), cell: { userEnteredFormat: { backgroundColorStyle: { rgbColor: BRAND }, textFormat: { bold: true, foregroundColorStyle: { rgbColor: WHITE } } } }, fields: "userEnteredFormat.backgroundColorStyle,userEnteredFormat.textFormat" } },
        // Number formats: Date col, then USD on B:F.
        { repeatCell: { range: rng(sheetId, 1, 1000, 0, 1), cell: { userEnteredFormat: { numberFormat: { type: "DATE", pattern: "yyyy-mm-dd" } } }, fields: "userEnteredFormat.numberFormat" } },
        { repeatCell: { range: rng(sheetId, 1, 1000, 1, 6), cell: { userEnteredFormat: { numberFormat: { type: "CURRENCY", pattern: USD } } }, fields: "userEnteredFormat.numberFormat" } },
        // Charts: portfolio value (Value + Cost Basis), then PnL (Unreal/Real/Total).
        lineChart(sheetId, "Portfolio Value Over Time", [1, 2], 1),
        lineChart(sheetId, "PnL Over Time", [3, 4, 5], 18),
        // Money columns B:F — bounded generously (row 1000) so future snapshot rows stay masked.
        privacyMaskRule(
          [{ sheetId, startRowIndex: 1, endRowIndex: 1000, startColumnIndex: 1, endColumnIndex: 6 }],
          PRIVACY_FOLLOWER_CELL,
        ),
      ],
      values: [valuesAt(TITLE, grid), { range: "History!Z1", values: [[false]] } satisfies ValueRange],
    };
  },
};
