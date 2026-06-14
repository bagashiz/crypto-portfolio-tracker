// layout-builder auth (local-only Node / ESM runtime).
//
// Auth flow (D-03): load the service-account key from disk, build a service-account
// JWT via googleapis, and return an authenticated Sheets v4 API client. The service
// account must have been granted Editor access to the target spreadsheet out-of-band
// (D-01 — the builder targets a pre-existing, pre-shared sheet).
//
// SECURITY: the key file `layout-builder/service-account.key.json` is local-only and
// gitignored (`*.key.json`, `service-account.key.json`). It is never committed, never
// logged, and never pushed to Apps Script (two-runtime isolation). Its contents must
// not appear in any error message.

import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { google } from "googleapis";

// Single OAuth scope — write structure to a sheet already shared with the SA.
// No Drive-wide or admin scope is requested (threat T-02-04: least privilege).
const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";

// Resolve the key path relative to this module so it works regardless of cwd.
const __dirname = dirname(fileURLToPath(import.meta.url));
const KEY_PATH = join(__dirname, "..", "service-account.key.json");

// Returns an authenticated Sheets v4 client (googleapis `sheets` resource).
export function getSheetsClient() {
  const auth = new google.auth.GoogleAuth({
    keyFile: KEY_PATH,
    scopes: [SHEETS_SCOPE],
  });
  return google.sheets({ version: "v4", auth });
}
