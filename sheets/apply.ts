#!/usr/bin/env bun
/**
 * Apply the spreadsheet builders via Sheets `batchUpdate`.
 *
 *   bun run sheet:build                 # apply every tab module
 *   bun run sheet:build summary         # apply just the Summary module
 *   bun run sheet:build --dry-run       # validate without writing
 *   bun run sheet:build --reset         # tear down each tab's Table + CF rules first,
 *                                       #   making a full rebuild safely re-runnable
 *
 * The desired structure lives in the per-tab modules; this runner resolves tab
 * titles -> sheet metadata (the only live read) and sends the combined requests.
 */
import { gws, resolveSheetMeta, teardownRequests, writeValues, type BuildContext, type SheetRequest, type TabModule, type ValueRange } from "./lib.ts";
import { summary } from "./summary.ts";
import { holdings } from "./holdings.ts";
import { transactions } from "./transactions.ts";
import { history } from "./history.ts";

const MODULES: TabModule[] = [summary, holdings, transactions, history];

function spreadsheetId(): string {
  const id = process.env.GOOGLE_SPREADSHEET_ID;
  if (!id) throw new Error("GOOGLE_SPREADSHEET_ID is not set (check .env)");
  return id;
}

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const reset = args.includes("--reset");
const tab = args.find((a) => !a.startsWith("--"));

const selected = tab
  ? MODULES.filter((m) => m.title.toLowerCase() === tab.toLowerCase())
  : MODULES;

if (selected.length === 0) {
  console.error(`No builder for tab "${tab}". Known: ${MODULES.map((m) => m.title).join(", ")}`);
  process.exit(1);
}

const ssid = spreadsheetId();
const meta = await resolveSheetMeta(ssid);

// Resolve each selected tab to a sheetId. A tab that doesn't exist yet but declares
// `ensureSheetId` is created via an `addSheet` (with that fixed id) prepended to the batch,
// so the module's own structure can reference the id in the same request.
const resolved = new Map<string, number>();
const createSheets: SheetRequest[] = [];
for (const m of selected) {
  const existing = meta.get(m.title);
  if (existing) {
    resolved.set(m.title, existing.sheetId);
  } else if (m.ensureSheetId != null) {
    resolved.set(m.title, m.ensureSheetId);
    createSheets.push({ addSheet: { properties: { sheetId: m.ensureSheetId, title: m.title } } });
    console.log(`${m.title}: not found — will create (sheetId ${m.ensureSheetId})`);
  } else {
    throw new Error(`Tab "${m.title}" not found in spreadsheet and module has no ensureSheetId`);
  }
}
const ctx: BuildContext = {
  sheetId: (title) => {
    const id = resolved.get(title);
    if (id == null) throw new Error(`Tab "${title}" not resolved`);
    return id;
  },
};

const structure: SheetRequest[] = [...createSheets];
const valueRanges: ValueRange[] = [];
for (const m of selected) {
  const existing = meta.get(m.title);
  const teardown = reset && existing ? teardownRequests(existing) : [];
  const { structure: s, values: v } = m.build(ctx);
  console.log(`${m.title}: ${s.length} structure + ${v.length} value-range(s)${reset ? ` (+${teardown.length} reset)` : ""}`);
  structure.push(...teardown, ...s);
  valueRanges.push(...v);
}

if (structure.length === 0 && valueRanges.length === 0) {
  console.log("nothing to apply.");
  process.exit(0);
}

// Two phases, because structured Table refs only bind once the Table exists:
//   1. structure (teardown + addTable + conditional formats) via spreadsheets.batchUpdate
//   2. cell content via the VALUES api (USER_ENTERED) — formulaValue/updateCells does NOT
//      bind structured refs and yields #ERROR!
if (structure.length > 0) {
  await gws([
    "sheets",
    "spreadsheets",
    "batchUpdate",
    "--params",
    JSON.stringify({ spreadsheetId: ssid }),
    "--json",
    JSON.stringify({ requests: structure }),
    ...(dryRun ? ["--dry-run"] : []),
  ]);
  console.log(`  structure: ${structure.length} request(s) — ${dryRun ? "dry-run, nothing written" : "applied"}`);
}

// A freshly (re)created Table needs a moment to settle before its refs resolve.
if (!dryRun && valueRanges.length > 0 && structure.some((r) => "addTable" in r)) {
  const settleMs = Number(process.env.SHEET_TABLE_SETTLE_MS ?? 12000);
  console.log(`  waiting ${settleMs}ms for new Table(s) to settle...`);
  await Bun.sleep(settleMs);
}

await writeValues(ssid, valueRanges, dryRun);
if (valueRanges.length > 0) {
  console.log(`  values: ${valueRanges.length} range(s) — ${dryRun ? "dry-run, nothing written" : "applied"}`);
}
