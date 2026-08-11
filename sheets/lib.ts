/**
 * Shared helpers for the spreadsheet builder.
 *
 * A "builder" defines a tab's DESIRED structure as `batchUpdate` requests, which
 * `apply.ts` sends to the Sheets API. The spreadsheet id comes from
 * GOOGLE_SPREADSHEET_ID (.env, loaded automatically by Bun).
 *
 * Convention: rows/columns in the Sheets API are 0-indexed. In formulas, prefer
 * structured Table refs (e.g. =SUM(Holdings[Value])) over A1/whole-column ranges.
 */

/** A Sheets API `Request` (one entry in batchUpdate's `requests`). Kept loose to avoid a googleapis dep. */
export type SheetRequest = Record<string, unknown>;

export interface BuildContext {
  /** Resolve a tab title to its numeric sheetId. Throws if the tab is missing. */
  sheetId(title: string): number;
}

export type Primitive = string | number | boolean | null;

/** A block of cell content (A1 range + 2D grid) written via the values API. */
export interface ValueRange {
  range: string;
  values: Primitive[][];
}

export interface BuildResult {
  /** Structural requests for spreadsheets.batchUpdate (addTable, conditional formats, ...). */
  structure: SheetRequest[];
  /** Cell content written via the values API with USER_ENTERED. */
  values: ValueRange[];
}

export interface TabModule {
  /** The tab this module manages. */
  title: string;
  /**
   * Fixed sheetId to use if the tab does not exist yet — the runner emits an `addSheet`
   * with this id so the module's structure (charts/formats) can reference it in the same
   * batch. Omit for tabs that are expected to already exist.
   */
  ensureSheetId?: number;
  /** Produce the tab's desired structure + cell content (empty arrays for a no-op). */
  build(ctx: BuildContext): BuildResult;
}

/**
 * A ValueRange anchored at A1 of `title`.
 *
 * Cell content MUST go through the values API (USER_ENTERED), not `updateCells`:
 * structured Table refs (`Holdings[Value]`, `SUMIFS(Transactions[...])`) only bind when
 * parsed via USER_ENTERED. The same formula set as `updateCells.formulaValue` stores but
 * evaluates to #ERROR!. `null` cells are sent as "" (blank).
 */
export function valuesAt(title: string, grid: Primitive[][]): ValueRange {
  return { range: `${title}!A1`, values: grid };
}

/** Write cell content via the values API (USER_ENTERED); `null` clears the cell. */
export async function writeValues(spreadsheetId: string, ranges: ValueRange[], dryRun: boolean): Promise<void> {
  if (ranges.length === 0) return;
  const data = ranges.map((r) => ({
    range: r.range,
    values: r.values.map((row) => row.map((cell) => (cell === null ? "" : cell))),
  }));
  await gws([
    "sheets",
    "spreadsheets",
    "values",
    "batchUpdate",
    "--params",
    JSON.stringify({ spreadsheetId }),
    "--json",
    JSON.stringify({ valueInputOption: "USER_ENTERED", data }),
    ...(dryRun ? ["--dry-run"] : []),
  ]);
}

/**
 * The privacy checkbox lives at Summary!H1, but a CUSTOM_FORMULA conditional-format rule
 * CANNOT reference another sheet at all (confirmed against the live Sheets API: even a
 * same-sheet-qualified formula like `='Summary'!$H$1` is rejected when the rule lives on a
 * different tab — a hard platform limitation, not a request-shape bug). So every masked tab
 * needs its OWN local flag cell; Code.gs's `syncPrivacyFollowers` mirrors Summary!H1 onto
 * each one whenever it changes (menu click or a direct click on the H1 checkbox via onEdit).
 * `$Z$1` is just unused space, off past every tab's real columns/Table/chart.
 */
export const PRIVACY_FOLLOWER_CELL = "$Z$1";

/** Solid redaction-bar color (background AND font, so the text disappears into the block). */
export const PRIVACY_MASK_COLOR = { red: 0, green: 0, blue: 0 };

/**
 * A conditional-format rule that blacks out `ranges` (same color for background + font) when
 * `flagCellA1` (a LOCAL cell on the same tab as `ranges` — see PRIVACY_FOLLOWER_CELL) is TRUE
 * — a pure visual overlay: no cell value, formula, or number format is touched, so nothing
 * downstream (other formulas, charts) can break. Give this rule `index: 0` relative to any
 * pre-existing CF rules on the same ranges (add it AFTER them in the structure array) so it
 * wins over e.g. the PnL green/red rules when active.
 */
export function privacyMaskRule(ranges: Record<string, unknown>[], flagCellA1: string): SheetRequest {
  return {
    addConditionalFormatRule: {
      index: 0,
      rule: {
        ranges,
        booleanRule: {
          condition: { type: "CUSTOM_FORMULA", values: [{ userEnteredValue: `=${flagCellA1}=TRUE` }] },
          format: {
            backgroundColorStyle: { rgbColor: PRIVACY_MASK_COLOR },
            textFormat: { foregroundColorStyle: { rgbColor: PRIVACY_MASK_COLOR } },
          },
        },
      },
    },
  };
}

/** Shared Table banding (olive header + zebra rows) used by the Holdings and Transactions tables. */
export const TABLE_BANDING = {
  headerColorStyle: { rgbColor: { red: 0.20784314, green: 0.40784314, blue: 0.32941177 } },
  firstBandColorStyle: { rgbColor: { red: 1, green: 1, blue: 1 } },
  secondBandColorStyle: { rgbColor: { red: 0.9647059, green: 0.972549, blue: 0.9764706 } },
};

/** A ONE_OF_LIST data-validation rule (dropdown) for a Table column. */
export function oneOfList(values: string[]): Record<string, unknown> {
  return { condition: { type: "ONE_OF_LIST", values: values.map((v) => ({ userEnteredValue: v })) } };
}

/**
 * Moving-average-cost per-transaction state machine for one asset — the shared core of
 * Holdings' Cost Basis/Real. PnL formulas AND Summary's ledger-wide ("survives delisting")
 * Realized PnL total. Tracks (running qty, running avg cost/unit, cumulative realized PnL)
 * across the asset's transactions IN ROW ORDER (assumes the ledger is entered
 * chronologically, top to bottom — an out-of-order row computes the wrong PnL). A BUY
 * updates the running average; a SELL locks in realized PnL against the CURRENT average and
 * leaves the average untouched, so a later BUY can never revise a sale that already
 * happened. Returns a 1x3 array {qty, avgCost, realizedPnL}.
 *
 * `assetExpr` is any formula expression evaluating to the asset name — an A1 ref (Holdings,
 * one row per asset) or a LAMBDA-bound variable (Summary, mapped over every distinct asset
 * that ever appears in Transactions, including ones no longer listed in Holdings). Bound
 * internally to `assetName` rather than reused verbatim so a LAMBDA-bound caller can safely
 * pass its own variable (e.g. `asset`) without a same-name LET shadowing ambiguity.
 */
export function assetPnlState(assetExpr: string): string {
  return `LET(
    assetName, ${assetExpr},
    n, COUNTIFS(Transactions[Asset], assetName),
    IF(n=0, {0,0,0}, LET(
      side, FILTER(Transactions[Side], Transactions[Asset]=assetName),
      qty,  FILTER(Transactions[Qty.], Transactions[Asset]=assetName),
      amt,  FILTER(Transactions[Amount], Transactions[Asset]=assetName),
      fee,  FILTER(Transactions[Fees], Transactions[Asset]=assetName),
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
}

/** Run `gws` via the local dependency, returning stdout. Throws on non-zero exit. */
export async function gws(args: string[]): Promise<string> {
  const proc = Bun.spawn(["bunx", "gws", ...args], { stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (code !== 0) throw new Error(`gws ${args.join(" ")} failed (${code}):\n${stderr || stdout}`);
  return stdout;
}

export interface SheetMeta {
  sheetId: number;
  /** Ids of Tables defined on the tab (for teardown on --reset). */
  tableIds: string[];
  /** Count of conditional-format rules on the tab (for teardown on --reset). */
  conditionalFormatCount: number;
  /** Ids of embedded charts on the tab (for teardown on --reset). */
  chartIds: number[];
}

/** Read each tab's id, tables, and conditional-format count (the one live read the builder needs, at apply-time). */
export async function resolveSheetMeta(spreadsheetId: string): Promise<Map<string, SheetMeta>> {
  const out = await gws([
    "sheets",
    "spreadsheets",
    "get",
    "--params",
    JSON.stringify({ spreadsheetId, fields: "sheets(properties(sheetId,title),tables(tableId),conditionalFormats,charts(chartId))" }),
    "--format",
    "json",
  ]);
  const data = JSON.parse(out) as {
    sheets: {
      properties: { sheetId: number; title: string };
      tables?: { tableId: string }[];
      conditionalFormats?: unknown[];
      charts?: { chartId: number }[];
    }[];
  };
  return new Map(
    data.sheets.map((s) => [
      s.properties.title,
      {
        sheetId: s.properties.sheetId,
        tableIds: (s.tables ?? []).map((t) => t.tableId),
        conditionalFormatCount: (s.conditionalFormats ?? []).length,
        chartIds: (s.charts ?? []).map((c) => c.chartId),
      },
    ]),
  );
}

/**
 * Requests that strip a tab's existing Table(s) and conditional-format rules, so a
 * module's `addTable`/`addConditionalFormatRule` can re-run without erroring/duplicating.
 *
 * CF rules go FIRST (high index -> 0, so indices stay valid as the list shrinks) and
 * before the table: deleting a Table cascades to remove conditional formats inside its
 * range, which would otherwise invalidate the later index-based CF deletes.
 */
export function teardownRequests(meta: SheetMeta): SheetRequest[] {
  const reqs: SheetRequest[] = [];
  for (let i = meta.conditionalFormatCount - 1; i >= 0; i--) {
    reqs.push({ deleteConditionalFormatRule: { sheetId: meta.sheetId, index: i } });
  }
  for (const tableId of meta.tableIds) reqs.push({ deleteTable: { tableId } });
  for (const chartId of meta.chartIds) reqs.push({ deleteEmbeddedObject: { objectId: chartId } });
  return reqs;
}
