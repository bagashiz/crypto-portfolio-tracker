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

export interface TabModule {
  /** The tab this module manages. */
  title: string;
  /** Produce the requests that bring the tab to its desired state (return [] for a no-op). */
  build(ctx: BuildContext): SheetRequest[];
}

export type Primitive = string | number | boolean | null;

/** Wrap a primitive as a Sheets `CellData`. Strings starting with `=` become formulas; `null`/`""` clears the cell. */
export function cellData(value: Primitive): Record<string, unknown> {
  if (value === null || value === "") return {};
  if (typeof value === "number") return { userEnteredValue: { numberValue: value } };
  if (typeof value === "boolean") return { userEnteredValue: { boolValue: value } };
  if (value.startsWith("=")) return { userEnteredValue: { formulaValue: value } };
  return { userEnteredValue: { stringValue: value } };
}

/**
 * Write a 2D matrix of values/formulas starting at (startRow, startCol), both 0-indexed.
 * Only touches `userEnteredValue` — formatting and neighbouring cells are left untouched.
 */
export function setCells(
  sheetId: number,
  startRow: number,
  startCol: number,
  rows: Primitive[][],
): SheetRequest {
  return {
    updateCells: {
      start: { sheetId, rowIndex: startRow, columnIndex: startCol },
      rows: rows.map((row) => ({ values: row.map(cellData) })),
      fields: "userEnteredValue",
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
}

/** Read each tab's id, tables, and conditional-format count (the one live read the builder needs, at apply-time). */
export async function resolveSheetMeta(spreadsheetId: string): Promise<Map<string, SheetMeta>> {
  const out = await gws([
    "sheets",
    "spreadsheets",
    "get",
    "--params",
    JSON.stringify({ spreadsheetId, fields: "sheets(properties(sheetId,title),tables(tableId),conditionalFormats)" }),
    "--format",
    "json",
  ]);
  const data = JSON.parse(out) as {
    sheets: {
      properties: { sheetId: number; title: string };
      tables?: { tableId: string }[];
      conditionalFormats?: unknown[];
    }[];
  };
  return new Map(
    data.sheets.map((s) => [
      s.properties.title,
      {
        sheetId: s.properties.sheetId,
        tableIds: (s.tables ?? []).map((t) => t.tableId),
        conditionalFormatCount: (s.conditionalFormats ?? []).length,
      },
    ]),
  );
}

/**
 * Requests that strip a tab's existing Table(s) and conditional-format rules, so a
 * module's `addTable`/`addConditionalFormatRule` can re-run without erroring/duplicating.
 * CF rules are deleted high index -> 0 so indices stay valid as the list shrinks.
 */
export function teardownRequests(meta: SheetMeta): SheetRequest[] {
  const reqs: SheetRequest[] = meta.tableIds.map((tableId) => ({ deleteTable: { tableId } }));
  for (let i = meta.conditionalFormatCount - 1; i >= 0; i--) {
    reqs.push({ deleteConditionalFormatRule: { sheetId: meta.sheetId, index: i } });
  }
  return reqs;
}
