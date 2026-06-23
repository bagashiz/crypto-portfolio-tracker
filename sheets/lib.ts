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
