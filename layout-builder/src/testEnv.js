// Test-only side-effect module: ensures SPREADSHEET_ID is set BEFORE config.js loads.
//
// config.js fails fast on a missing SPREADSHEET_ID (D-02). ES module imports are
// evaluated in source order, so importing this module before any module that
// transitively imports config.js guarantees the env var exists at config eval time.
// (A top-level `process.env.X ??= ...` statement in a test file runs AFTER its own
// imports are evaluated, which is too late — hence this dedicated import.)
process.env.SPREADSHEET_ID ??= "test-spreadsheet-id";
