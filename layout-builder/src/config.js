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

// Placeholder — set to the target spreadsheet ID before running --build/--update.
export const SPREADSHEET_ID = "PLACEHOLDER_SPREADSHEET_ID";

// Sheet (tab) name constants — UPPER_SNAKE_CASE per CONVENTIONS.md.
export const DASHBOARD = "Dashboard";
export const DCA_LOG = "DCA Log";
