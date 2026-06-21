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
import { gws, resolveSheetMeta, teardownRequests, type BuildContext, type SheetMeta, type TabModule } from "./lib.ts";
import { summary } from "./summary.ts";
import { holdings } from "./holdings.ts";
import { transactions } from "./transactions.ts";

const MODULES: TabModule[] = [summary, holdings, transactions];

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
function metaOf(title: string): SheetMeta {
  const m = meta.get(title);
  if (!m) throw new Error(`Tab "${title}" not found in spreadsheet`);
  return m;
}
const ctx: BuildContext = { sheetId: (title) => metaOf(title).sheetId };

const requests = selected.flatMap((m) => {
  const teardown = reset ? teardownRequests(metaOf(m.title)) : [];
  const built = m.build(ctx);
  console.log(`${m.title}: ${built.length} request(s)${reset ? ` (+${teardown.length} reset)` : ""}`);
  return [...teardown, ...built];
});

if (requests.length === 0) {
  console.log("nothing to apply.");
  process.exit(0);
}

await gws([
  "sheets",
  "spreadsheets",
  "batchUpdate",
  "--params",
  JSON.stringify({ spreadsheetId: ssid }),
  "--json",
  JSON.stringify({ requests }),
  ...(dryRun ? ["--dry-run"] : []),
]);
console.log(dryRun ? "dry-run OK (nothing written)" : "applied.");
