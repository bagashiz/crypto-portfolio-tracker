// Unit tests for index.js runUpdate's log-tab rename/discovery decision (bun:test).
//
// D-07 data-safety suite: proves the "DCA Log" -> "Transaction Log" upgrade on --update is
// an in-place, field-mask rename that NEVER deletes + recreates the tab (irreversible-data-
// loss guard, D-07 / Phase 2 D-06), is idempotent on reruns, and errors clearly when the
// log tab is absent under both titles. Tests are pure/offline: they exercise the exported
// resolveLogTabRequests(tabs) over a plain Map, with no Sheets client and no network.
//
// Imported FIRST so SPREADSHEET_ID exists before config.js is evaluated (index.js -> config.js).
import "./testEnv.js";
import { test, expect } from "bun:test";
import { DCA_LOG, DCA_LOG_LEGACY } from "./config.js";
import { resolveLogTabRequests } from "./index.js";

// Sanity: the rename target/source titles are the Phase 5/6 values the rest of the suite assumes.
test("config titles: DCA_LOG is the new title, DCA_LOG_LEGACY is the old one", () => {
  expect(DCA_LOG).toBe("Transaction Log");
  expect(DCA_LOG_LEGACY).toBe("DCA Log");
});

test("legacy-titled tab yields one field-mask rename request and the legacy sheetId", () => {
  const tabs = new Map([
    ["DCA Log", 5],
    ["Dashboard", 1],
  ]);
  const { logId, renameRequests } = resolveLogTabRequests(tabs);

  // Resolves to the legacy tab's id (so the structural re-apply targets the same sheet).
  expect(logId).toBe(5);

  // Exactly one rename request, field-mask shaped.
  expect(renameRequests).toHaveLength(1);
  const req = renameRequests[0];
  expect(req.updateSheetProperties).toBeDefined();
  expect(req.updateSheetProperties.fields).toBe("title");
  expect(req.updateSheetProperties.properties.sheetId).toBe(5);
  expect(req.updateSheetProperties.properties.title).toBe("Transaction Log");
});

test("already-renamed tab is idempotent: no rename request, resolves the new-title id", () => {
  const tabs = new Map([
    ["Transaction Log", 5],
    ["Dashboard", 1],
  ]);
  const { logId, renameRequests } = resolveLogTabRequests(tabs);

  expect(logId).toBe(5);
  expect(renameRequests).toHaveLength(0);
});

test("missing log tab (neither title) throws mentioning BOTH titles", () => {
  const tabs = new Map([["Dashboard", 1]]);
  expect(() => resolveLogTabRequests(tabs)).toThrow(/Transaction Log/);
  expect(() => resolveLogTabRequests(tabs)).toThrow(/DCA Log/);
});

test("never delete+recreate: no deleteSheet/addSheet for the log tab in any --update path", () => {
  // Legacy-rename path.
  const legacy = resolveLogTabRequests(
    new Map([
      ["DCA Log", 5],
      ["Dashboard", 1],
    ])
  );
  const legacyJson = JSON.stringify(legacy.renameRequests);
  expect(legacyJson).not.toContain("deleteSheet");
  expect(legacyJson).not.toContain("addSheet");

  // Already-renamed (idempotent) path.
  const renamed = resolveLogTabRequests(
    new Map([
      ["Transaction Log", 5],
      ["Dashboard", 1],
    ])
  );
  const renamedJson = JSON.stringify(renamed.renameRequests);
  expect(renamedJson).not.toContain("deleteSheet");
  expect(renamedJson).not.toContain("addSheet");
});

test("rename request is data-preserving: field mask is exactly 'title'", () => {
  const { renameRequests } = resolveLogTabRequests(
    new Map([
      ["DCA Log", 7],
      ["Dashboard", 1],
    ])
  );
  expect(renameRequests[0].updateSheetProperties.fields).toBe("title");
});
