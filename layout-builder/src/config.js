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
//
// WR-03: validation is done LAZILY on call, NOT at module-evaluation time. Importing
// config.js for constants (asset registry, sheet names, DATA_START_ROW) must never throw
// just because SPREADSHEET_ID is unset — that import-time throw made the entire test suite
// depend on `import "./testEnv.js"` running before any config.js-importing line, an
// invariant enforced only by comment and brittle under import reordering. `getSpreadsheetId()`
// moves the check to the single runtime call site (index.js) that actually needs the id.
const PLACEHOLDER_SPREADSHEET_ID = "PLACEHOLDER_SPREADSHEET_ID";

export function getSpreadsheetId() {
  const spreadsheetId = process.env.SPREADSHEET_ID;
  if (!spreadsheetId || spreadsheetId === PLACEHOLDER_SPREADSHEET_ID) {
    throw new Error(
      "SPREADSHEET_ID is not set. Create a gitignored .env with " +
        "SPREADSHEET_ID=<your sheet id> and run via `node --env-file=.env src/index.js ...`."
    );
  }
  return spreadsheetId;
}

// Sheet (tab) name constants — UPPER_SNAKE_CASE per CONVENTIONS.md.
export const DASHBOARD = "Dashboard";
// Phase 6 / D-07: the DCA Log tab is renamed to the user-visible "Transaction Log"
// (it now carries SELL rows + realized PnL, not just DCA buys). The symbol name stays
// DCA_LOG so existing imports are unchanged.
export const DCA_LOG = "Transaction Log";
// OLD title, kept ONLY so index.js --update can discover a previously-built tab still
// named "DCA Log" and rename it in place (RESEARCH Pitfall 2 / D-07). Never used as a
// write target — purely for the one-time rename-discovery transition.
export const DCA_LOG_LEGACY = "DCA Log";

// DCA Log transaction data-region boundary (1-based row index) — FIXED at build time.
//
// Fixed row map (NEVER moves when the asset registry grows or shrinks):
//   row 1                       : summary block title/header
//   rows 2..(1 + MAX_SUMMARY_ROWS)   : reserved per-asset summary block (rows 2-21)
//                                      — filled top-down up to assets.length; the rest
//                                        stay blank (label/format-only, no formulas, D-08)
//   row (2 + MAX_SUMMARY_ROWS)       : transaction column header row (row 22, Date..Notes A-I)
//   row (3 + MAX_SUMMARY_ROWS) onward: transaction DATA rows (row 23+, user-entered, unbounded)
//
// DATA_START_ROW is that first data row. It is the irreversible-data-loss boundary
// (D-06/D-07): `--update` must NEVER write to or clear any row at or below this row.
//
// WHY FIXED, NOT DERIVED FROM assets.length (LAYOUT-02 gap closure):
//   The previous `assets.length + 3` FLOATED the boundary with the registry. The
//   documented one-line CONFIG-01 asset add followed by `--update` then re-stamped the
//   transaction header directly onto the first existing DCA data row — overwriting real
//   hand-entered transactions with header text. That is exactly the irreversible
//   data-loss class LAYOUT-02 exists to prevent. Pinning the boundary to a fixed literal
//   (computed only from the MAX_SUMMARY_ROWS reservation and fixed header offsets, with
//   NO assets.length term) means a registry edit can never move the header onto a data row.
//   Phase 5's open-ended A{DATA_START_ROW}:A SUMIF ranges (D-07) are compatible with — and
//   improved by — a fixed, generous boundary.

// Reserved maximum number of per-asset summary rows. assets.length must never exceed
// this (the builders fail loudly if it does, rather than silently shifting the boundary).
// 20 covers the current 7 assets plus comfortable growth headroom.
export const MAX_SUMMARY_ROWS = 20;

// First transaction DATA row = summary header (1) + reserved block (MAX_SUMMARY_ROWS)
// + transaction header (1) + 1. Equals MAX_SUMMARY_ROWS + 3 = 23. NO assets.length term.
export const DATA_START_ROW = MAX_SUMMARY_ROWS + 3;
