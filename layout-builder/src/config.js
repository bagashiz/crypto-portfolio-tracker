// layout-builder config (local-only Node / ESM runtime).
//
// The asset registry is the single source of truth in the repo-root assets.json
// (D-04 / D-05). It is imported here, never duplicated — adding/removing an asset
// is a one-line edit in assets.json alone.
import assets from "../../assets.json" with { type: "json" };

// Re-export the shared asset list so layout-builder code reads it from one place.
export { assets };

// Layout-builder-only settings below. These are NOT shared with the Apps Script
// runtime (D-06: declared deps and per-runtime config stay isolated; only the
// build-time assets.json data is shared).

// Spreadsheet target ID — sourced from a gitignored .env (D-02), never committed.
// layout-builder runs on Node, so Bun's auto-.env loading does NOT apply; the value
// arrives via `node --env-file=.env`. Fail-fast if missing or still the placeholder
// so a misconfigured run can never address the wrong (or a default) spreadsheet.
const PLACEHOLDER_SPREADSHEET_ID = "PLACEHOLDER_SPREADSHEET_ID";
const spreadsheetId = process.env.SPREADSHEET_ID;
if (!spreadsheetId || spreadsheetId === PLACEHOLDER_SPREADSHEET_ID) {
  throw new Error(
    "SPREADSHEET_ID is not set. Create a gitignored .env with " +
      "SPREADSHEET_ID=<your sheet id> and run via `node --env-file=.env src/index.js ...`."
  );
}
export const SPREADSHEET_ID = spreadsheetId;

// Sheet (tab) name constants — UPPER_SNAKE_CASE per CONVENTIONS.md.
export const DASHBOARD = "Dashboard";
export const DCA_LOG = "DCA Log";

// DCA Log transaction data-region boundary (1-based row index).
// The DCA Log top-of-data band is laid out as (D-05):
//   row 1            : summary block title/header
//   rows 2..(1+N)    : one per-asset summary row (N = assets.length)
//   row (2+N)        : transaction column header row (Date..Notes, cols A-I)
//   row (3+N) onward : transaction DATA rows (user-entered, grow unbounded)
// DATA_START_ROW is that first data row. It is the irreversible-data-loss boundary
// (D-06/D-07): `--update` must NEVER write to or clear any row at or below this row.
// Fixed value derived from the current registry (7 assets -> header on row 9,
// data starts on row 10). Computed from assets.length so it stays consistent if the
// registry grows.
export const DATA_START_ROW = assets.length + 3;
