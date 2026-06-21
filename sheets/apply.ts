#!/usr/bin/env bun
/**
 * Apply the spreadsheet builders via Sheets `batchUpdate`.
 *
 *   bun run sheet:build                 # apply every tab module
 *   bun run sheet:build summary         # apply just the Summary module
 *   bun run sheet:build --dry-run       # validate without writing
 *
 * The desired structure lives in the per-tab modules; this runner resolves tab
 * titles -> sheetIds (the only live read) and sends the combined requests.
 */
import { gws, resolveSheetIds, type BuildContext, type TabModule } from "./lib.ts";
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
const tab = args.find((a) => !a.startsWith("--"));

const selected = tab
  ? MODULES.filter((m) => m.title.toLowerCase() === tab.toLowerCase())
  : MODULES;

if (selected.length === 0) {
  console.error(`No builder for tab "${tab}". Known: ${MODULES.map((m) => m.title).join(", ")}`);
  process.exit(1);
}

const ssid = spreadsheetId();
const ids = await resolveSheetIds(ssid);
const ctx: BuildContext = {
  sheetId(title) {
    const id = ids.get(title);
    if (id === undefined) throw new Error(`Tab "${title}" not found in spreadsheet`);
    return id;
  },
};

const requests = selected.flatMap((m) => {
  const reqs = m.build(ctx);
  console.log(`${m.title}: ${reqs.length} request(s)`);
  return reqs;
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
