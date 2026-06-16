// layout-builder CLI entry point (local-only Node / ESM runtime).
//
// Dispatch contract (D-39: zero-dep argv parsing):
//   node --env-file=.env src/index.js --build    -> first-time tab creation + structure
//   node --env-file=.env src/index.js --update   -> idempotent structural re-apply
// Exactly one of --build / --update must be supplied; neither/both prints usage
// and exits non-zero.
//
// Orchestration (ARCHITECTURE.md "Data Flow (layout build)"):
//   getSheetsClient()  -> authenticated Sheets v4 client (service-account JWT, auth.js)
//   spreadsheets.get   -> read existing tab titles -> gridIds (NEVER create a spreadsheet, D-01)
//   request-builders   -> dashboard/dcaLog Build|Update request arrays (dashboardSheet.js, dcaLogSheet.js)
//   spreadsheets.batchUpdate -> stamp the structure in one batched call
//
// SAFETY:
//   D-01: the target is a PRE-EXISTING, pre-shared spreadsheet — we never create one.
//   D-04: --build REFUSES (non-zero) if either tab already exists, directing to --update;
//         it never deletes or recreates an existing tab (irreversible-data-loss guard).
//   D-06: --update appends ONLY the Plan 01 structural builders, which are provably
//         bounded above DATA_START_ROW (proven by Plan 01 unit test). This file adds NO
//         ad-hoc range write/clear, so the DCA Log transaction data region is never addressed.

import { google } from "googleapis";

import { getSheetsClient } from "./auth.js";
import { getSpreadsheetId, DASHBOARD, DCA_LOG } from "./config.js";
import { dashboardBuildRequests, dashboardUpdateRequests } from "./dashboardSheet.js";
import { dcaLogBuildRequests, dcaLogUpdateRequests } from "./dcaLogSheet.js";

const USAGE =
  "Usage: node --env-file=.env src/index.js (--build | --update)\n" +
  "  --build   Create the Dashboard + DCA Log tabs and stamp structure (first run only).\n" +
  "  --update  Re-apply structure idempotently (never touches DCA Log data rows).";

// --- argv dispatch (D-39: process.argv, zero-dep) -------------------------------

// Parse exactly one of --build / --update. Returns "build" | "update" or throws
// with the usage message on neither/both (so the caller exits non-zero).
function parseMode(argv) {
  const wantsBuild = argv.includes("--build");
  const wantsUpdate = argv.includes("--update");
  if (wantsBuild === wantsUpdate) {
    // both flags or neither flag — ambiguous
    throw new Error(USAGE);
  }
  return wantsBuild ? "build" : "update";
}

// --- existing-tab discovery (D-01: read-only; never creates a spreadsheet) ------

// Read the spreadsheet's current tabs and return a Map of title -> sheetId (gridId).
// Fields are limited to sheets.properties(sheetId,title) to keep the payload minimal.
async function getExistingTabs(sheets, spreadsheetId) {
  const res = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: "sheets.properties(sheetId,title)",
  });
  const tabs = new Map();
  for (const sheet of res.data.sheets ?? []) {
    const props = sheet.properties ?? {};
    if (typeof props.title === "string") {
      // WR-04: a title with a non-numeric/missing sheetId is a malformed API response.
      // Surface it explicitly rather than storing `title -> undefined`, which downstream
      // `=== undefined` checks would misread as "tab missing" and emit a misleading error.
      // (A valid gridId of 0 is a number and passes — only undefined/null/non-number fail.)
      if (typeof props.sheetId !== "number") {
        throw new Error(
          `Tab "${props.title}" returned no numeric sheetId (malformed API response).`
        );
      }
      tabs.set(props.title, props.sheetId);
    }
  }
  return tabs;
}

// Issue a single batched structural stamp. Returns the API replies array so callers can
// read back per-request results (e.g. addSheet.properties.sheetId from the same call).
async function batchUpdate(sheets, spreadsheetId, requests) {
  const res = await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: { requests },
  });
  return res.data.replies ?? [];
}

// --- --build (LAYOUT-01 + D-04 guard) -------------------------------------------

async function runBuild(sheets, spreadsheetId) {
  const tabs = await getExistingTabs(sheets, spreadsheetId);

  // D-04 hard guard: refuse if either tab already exists. Never delete/recreate.
  const existing = [DASHBOARD, DCA_LOG].filter((title) => tabs.has(title));
  if (existing.length > 0) {
    throw new Error(
      `--build refuses: tab(s) already exist: ${existing.join(", ")}. ` +
        "Run --update to re-apply structure without touching existing data."
    );
  }

  // WR-02: create the tabs AND stamp their structure in ONE atomic batchUpdate (Sheets
  // batchUpdate applies all requests or none). We assign explicit gridIds in the addSheet
  // requests so the structural builders can reference them in the same payload — there is
  // no second round-trip, so no window where empty/unstructured orphan tabs can survive a
  // partial failure. The chosen ids are unused-by-construction (this run just refused if
  // either tab existed); a collision would surface as a loud addSheet error, not silent
  // corruption.
  const dashboardId = 1;
  const dcaLogId = 2;
  const requests = [
    { addSheet: { properties: { sheetId: dashboardId, title: DASHBOARD } } },
    { addSheet: { properties: { sheetId: dcaLogId, title: DCA_LOG } } },
    ...dashboardBuildRequests(dashboardId),
    ...dcaLogBuildRequests(dcaLogId),
  ];
  await batchUpdate(sheets, spreadsheetId, requests);

  console.log(
    `Built ${DASHBOARD} (gridId ${dashboardId}) and ${DCA_LOG} (gridId ${dcaLogId}).`
  );
}

// --- --update (LAYOUT-02 + D-06: structural-only, never the data region) --------

async function runUpdate(sheets, spreadsheetId) {
  const tabs = await getExistingTabs(sheets, spreadsheetId);

  const dashboardId = tabs.get(DASHBOARD);
  const dcaLogId = tabs.get(DCA_LOG);
  const missing = [];
  if (dashboardId === undefined) missing.push(DASHBOARD);
  if (dcaLogId === undefined) missing.push(DCA_LOG);
  if (missing.length > 0) {
    throw new Error(
      `--update requires existing tab(s): ${missing.join(", ")} not found. ` +
        "Run --build first to create the tabs."
    );
  }

  // D-06: append ONLY the Plan 01 update builders (provably bounded above
  // DATA_START_ROW). No ad-hoc clear/write request is added here, so the DCA Log
  // transaction data region is never addressed. Single batched call.
  const requests = [
    ...dashboardUpdateRequests(dashboardId),
    ...dcaLogUpdateRequests(dcaLogId),
  ];
  await batchUpdate(sheets, spreadsheetId, requests);

  console.log(
    `Re-applied structure to ${DASHBOARD} and ${DCA_LOG} ` +
      "(DCA Log transaction data untouched)."
  );
}

// --- entry --------------------------------------------------------------------

async function main() {
  // parseMode throws USAGE on neither/both — surfaced as a non-zero exit below.
  const mode = parseMode(process.argv.slice(2));

  // Resolve + fail-fast validate SPREADSHEET_ID at the entry point (WR-03: validation is
  // now lazy in config.js, so the single runtime caller that needs the id performs it).
  void google;
  const spreadsheetId = getSpreadsheetId();

  const sheets = getSheetsClient();
  if (mode === "build") {
    await runBuild(sheets, spreadsheetId);
  } else {
    await runUpdate(sheets, spreadsheetId);
  }
}

main().catch((err) => {
  // Actionable surface for the common operator-facing failures: usage, missing key
  // file, sheet-not-shared (403), missing SPREADSHEET_ID (thrown at config import).
  const message = err && err.message ? err.message : String(err);
  console.error(message);
  console.error(
    "\nIf this is an auth/API error, verify: " +
      "(1) layout-builder/service-account.key.json exists, " +
      "(2) the target spreadsheet is shared with the service-account email as Editor, " +
      "(3) SPREADSHEET_ID is set in a gitignored .env (run via node --env-file=.env)."
  );
  process.exit(1);
});
