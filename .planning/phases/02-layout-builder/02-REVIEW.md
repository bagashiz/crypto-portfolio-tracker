---
phase: 02-layout-builder
reviewed: 2026-06-16T00:00:00Z
depth: standard
files_reviewed: 11
files_reviewed_list:
  - layout-builder/package.json
  - layout-builder/README.md
  - layout-builder/src/auth.js
  - layout-builder/src/config.js
  - layout-builder/src/config.test.js
  - layout-builder/src/dashboardSheet.js
  - layout-builder/src/dashboardSheet.test.js
  - layout-builder/src/dcaLogSheet.js
  - layout-builder/src/dcaLogSheet.test.js
  - layout-builder/src/index.js
  - layout-builder/src/testEnv.js
findings:
  critical: 1
  warning: 5
  info: 4
  total: 10
status: issues_found
---

# Phase 02: Code Review Report

**Reviewed:** 2026-06-16T00:00:00Z
**Depth:** standard
**Files Reviewed:** 11
**Status:** issues_found

## Summary

Reviewed the layout-builder local Node runtime: CLI entry/orchestration (`index.js`),
auth (`auth.js`), config and asset registry (`config.js`), the two sheet request-builders
(`dashboardSheet.js`, `dcaLogSheet.js`), and their co-located tests.

The DCA Log data-safety boundary (LAYOUT-02) — the headline irreversible-data-loss
guard — is now correctly implemented: `DATA_START_ROW` is a fixed literal (23) with no
`assets.length` term, every emitted range is provably bounded above the data region, an
overflow guard fails loudly, and a thorough structural test suite anchors all of this on
the hard literal. That part is solid. Secrets handling is also correct: the service-account
key path is local-only and gitignored (`*.key.json`, `service-account.key.json`), no key
contents are logged, and `getExistingTabs`'s `=== undefined` checks correctly distinguish a
valid gridId of `0` from a missing tab.

However, the same boundary-overflow protection that the DCA Log received was NOT applied
to the Dashboard sheet. The Dashboard hard-codes Zone B at row 12 while Zone A grows
downward with `assets.length`, with no guard. Past 9 assets, Zone A's per-asset/TOTAL
rows silently overwrite Zone B's header and data — the exact class of "registry growth
corrupts layout" defect LAYOUT-02 was created to prevent, left open on the sibling sheet.
This is the one Critical finding. The remaining findings are robustness and clarity gaps.

## Narrative Findings (AI reviewer)

## Critical Issues

### CR-01: Dashboard has no asset-count overflow guard; Zone A collides with Zone B past 9 assets

**File:** `layout-builder/src/dashboardSheet.js:90-110`

**Issue:** Zone B's header is hard-coded at row 12 (`ZONE_B_HEADER_ROW = 12`), but Zone A
grows downward with the registry:

```
zoneATotalRow = ZONE_A_HEADER_ROW + 1 + assets.length   // = 2 + assets.length
```

Zone A's per-asset label rows occupy 1-based rows `2 .. (1 + assets.length)` and the TOTAL
row lands at `2 + assets.length`. For no overlap with Zone B's header at row 12 we need
`2 + assets.length < 12`, i.e. `assets.length <= 9`. At `assets.length === 10` the Zone A
TOTAL row is stamped at row 12 — directly onto the Zone B header — and at 11+ assets the
Zone A per-asset labels overwrite Zone B header and rows. The number-format `repeatCell`
ranges (lines 99-101) also extend into Zone B's band.

Unlike `dcaLogSheet.js`, which fails loudly via the `MAX_SUMMARY_ROWS` guard
(`dcaLogSheet.js:106-112`), `dashboardSheet.js` has NO equivalent check. A one-line
`assets.json` edit growing the registry past 9 entries silently corrupts the Dashboard
layout (label rows overwriting each other) with no error — the same "registry growth moves
a fixed boundary onto live content" failure class LAYOUT-02 exists to prevent, left
unguarded on the Dashboard. The shared `MAX_SUMMARY_ROWS = 20` reservation makes this
worse: the DCA Log silently allows up to 20 assets, so an operator who raises the registry
to (say) 15 assets passes the DCA Log guard but silently corrupts the Dashboard.

**Fix:** Either derive Zone B's start row from `assets.length` (so it floats below Zone A
plus a one-row gap), or — to keep zones at fixed positions — add an explicit reservation
constant and a loud guard mirroring the DCA Log:

```js
// In config.js (shared reservation), or local to dashboardSheet.js:
export const MAX_ZONE_A_ASSET_ROWS = 9; // Zone B header pinned at row 12; 1 blank gap row.

// In structuralRequests(), before emitting any request:
if (assets.length > MAX_ZONE_A_ASSET_ROWS) {
  throw new Error(
    `assets.length (${assets.length}) exceeds MAX_ZONE_A_ASSET_ROWS ` +
      `(${MAX_ZONE_A_ASSET_ROWS}); Zone A would overwrite Zone B (header row ` +
      `${ZONE_B_HEADER_ROW}). Move ZONE_B_HEADER_ROW down or reduce the registry.`
  );
}
```

Preferred long-term fix: compute `ZONE_B_HEADER_ROW = zoneATotalRow + 2` so the two zones
can never collide regardless of registry size, and drop the magic 12.

## Warnings

### WR-01: `structuralRequests` accepts no asset-list override, so the Dashboard overflow path is untestable

**File:** `layout-builder/src/dashboardSheet.js:82,120-128`

**Issue:** `dcaLogSheet.js` deliberately threads an optional `assetList = assets` parameter
through `bandRequests` / `dcaLogBuildRequests` / `dcaLogUpdateRequests` (lines 102, 154,
161) specifically so the overflow guard and boundary-invariance can be unit-tested without
mutating the shared import (`dcaLogSheet.test.js:120-136`). The Dashboard builders
(`dashboardBuildRequests` / `dashboardUpdateRequests`) hard-bind to the imported `assets`
with no override. Even once CR-01's guard is added, there is no way to drive it from a test,
and there is currently no test asserting Zone A and Zone B do not overlap at any asset
count. The asymmetry means the higher-stakes-looking DCA Log is well covered while the
Dashboard's collision risk is invisible to the suite.

**Fix:** Mirror the DCA Log signature: `structuralRequests(sheetId, assetList = assets)`
and thread `assetList` through both exported builders, then add a test that asserts (a) the
guard throws past the limit and (b) `zoneATotalRow < ZONE_B_HEADER_ROW` for a max-size
registry.

### WR-02: `--build` tab creation and structural stamp are not atomic; a partial failure leaves orphan empty tabs

**File:** `layout-builder/src/index.js:91-112`

**Issue:** `runBuild` issues two separate `batchUpdate` calls: first to `addSheet` both
tabs (lines 91-94), then to stamp structure (line 112). If the process dies or the second
call fails (network error, 5xx, transient quota) after the tabs are created but before the
structural stamp, the `Dashboard` and `DCA Log` tabs now exist but are empty/unstructured.
Re-running `--build` then hits the D-04 guard (`index.js:82-88`) and refuses, and `--update`
will re-stamp structure onto those empty tabs — which happens to recover here, but only by
luck. There is no transactional rollback and no message telling the operator that the safe
recovery path after a half-built run is `--update`, not `--build`.

**Fix:** Either (a) combine `addSheet` and the structural requests into a single
`batchUpdate` (Sheets `batchUpdate` is atomic — all requests apply or none do), using the
`addSheet` reply's `replies[].addSheet.properties.sheetId` to obtain the new gridIds in the
same call, eliminating the second round-trip and the orphan-tab window entirely; or (b) if
the two-call shape is kept, catch a stamp failure and surface explicit guidance: "tabs were
created but not structured — run `--update` to finish."

### WR-03: Build-time fail-fast in `config.js` runs on import, breaking any test that imports it without `testEnv.js` first

**File:** `layout-builder/src/config.js:20-27`

**Issue:** `config.js` throws at module-evaluation time if `SPREADSHEET_ID` is unset
(lines 21-26). Every module under test transitively imports `config.js`, so the entire test
suite depends on the side-effect import `./testEnv.js` running *before* `config.js` in ES
module order. This works today, but it is fragile: any new test file (or any reordering of
imports, e.g. an auto-formatter or an `import`-sorter that alphabetizes) that places a
`config.js`-importing line above `import "./testEnv.js"` will throw at collection time with
a confusing "SPREADSHEET_ID is not set" error unrelated to the test's intent. The contract
is enforced only by comment convention (`testEnv.js:3-7`), not by tooling.

**Fix:** Make the dependency explicit and order-independent. Options: (a) export a
`getSpreadsheetId()` function that validates on call rather than throwing at import time, so
modules importing `config.js` for constants don't trip the env check; (b) read a default in
a test/NODE_ENV-aware way; or at minimum (c) add a test that documents and asserts the
import-ordering invariant so an accidental reorder fails loudly with a clear message.

### WR-04: `getExistingTabs` stores `sheetId` without validating it is numeric, masking malformed API responses

**File:** `layout-builder/src/index.js:59-65`

**Issue:** `getExistingTabs` only gates on `typeof props.title === "string"`, then stores
`props.sheetId` unconditionally. If the API returns a sheet with a title but a
missing/undefined `sheetId` (malformed or partial response), the map stores
`title -> undefined`. Downstream, `runBuild`/`runUpdate` test `dashboardId === undefined`
(lines 100, 124-128) and would treat a present-but-malformed tab as "missing," producing a
misleading "tab not found / creation did not produce gridIds" error rather than a clear
"unexpected API response" diagnostic. (Note: the title-based D-04 existence guard at
`runBuild` line 82 uses `tabs.has(title)` and is unaffected; only gridId resolution is.)

**Fix:** Only record entries with a valid numeric id, and treat a title-without-id as an
explicit error:

```js
if (typeof props.title === "string") {
  if (typeof props.sheetId !== "number") {
    throw new Error(`Tab "${props.title}" returned no numeric sheetId (malformed API response).`);
  }
  tabs.set(props.title, props.sheetId);
}
```

### WR-05: `void google;` is dead code masquerading as a contract assertion; the import is unused

**File:** `layout-builder/src/index.js:23,158-159`

**Issue:** `google` is imported (line 23) and then referenced only via `void google;`
(line 159) with a comment claiming it makes the dependency "unambiguously part of this
module's contract." `google` is never actually used in this file — `getSheetsClient()`
(from `auth.js`) is the only thing that touches `googleapis`. The `void google;` statement
is a no-op that exists solely to keep an otherwise-unused import. This is dead code; it adds
nothing to the runtime contract (the real dependency edge is `auth.js → googleapis`) and a
future reader/linter will be misled into thinking `google` is used here.

**Fix:** Remove both the unused `import { google } from "googleapis";` and the
`void google;` line. The `googleapis` dependency is already exercised via `auth.js`.

## Info

### IN-01: `numberFormatRequest` mixed 1-based/exclusive convention invites off-by-one column/row errors

**File:** `layout-builder/src/dashboardSheet.js:54-68`, `layout-builder/src/dcaLogSheet.js:68-82`

**Issue:** `numberFormatRequest(..., startCol, endCol, ...)` treats `startCol` as 1-based
inclusive (`startColumnIndex: startCol - 1`) but `endCol` as already-exclusive
(`endColumnIndex: endCol`). The comment "exclusive, already 1-based-inclusive -> exclusive"
describes this, but the mixed convention (one arg adjusted, the other not) is a classic
off-by-one trap. The current call sites are correct (e.g. cols C-D passed as `3, 4`), but
the asymmetry is fragile under future edits. The same applies to `startRow` (adjusted) vs
`endRow` (passed through).

**Fix:** Use a uniform convention — pass both ends as 1-based inclusive and convert both
inside the helper — or rename params to `endColExclusive` / `endRowExclusive` to make the
contract self-documenting.

### IN-02: Header comment describes a layout (Zone A "rows 1-10", TOTAL at row 10) that does not match the 7-asset reality (TOTAL at row 9)

**File:** `layout-builder/src/dashboardSheet.js:8-9`

**Issue:** The header comment states "Zone A — Live Holdings: rows 1-10 (header row 1,
per-asset rows, TOTAL row 10)". With the current 7-asset registry the TOTAL row is computed
at row 9 (`2 + 7`), not 10, and Zone A occupies rows 1-9. The comment encodes an assumed
8-asset layout that drifts from both the code and the data — this drift is part of what
makes CR-01 easy to miss.

**Fix:** Describe Zone A as floating with `assets.length` (rows `1 .. 2 + assets.length`)
and Zone B's start as fixed/derived, so the comment matches the computed positions.

### IN-03: Magic row literal `12` for Zone B with no named relationship to Zone A

**File:** `layout-builder/src/dashboardSheet.js:24`

**Issue:** `ZONE_B_HEADER_ROW = 12` is a magic number whose safety depends entirely on Zone
A staying under it (see CR-01). Nothing in the code expresses the invariant "Zone B must
start below Zone A's TOTAL row." A reader cannot tell why 12 (vs 11 or 13) is correct.

**Fix:** Derive it (`const ZONE_B_HEADER_ROW = zoneATotalRow + 2;`) or, if it must stay
fixed, add a comment and the CR-01 guard tying it to `MAX_ZONE_A_ASSET_ROWS`.

### IN-04: `package.json` pins `googleapis` to `latest`, making builds non-reproducible

**File:** `layout-builder/package.json:9-11`

**Issue:** `"googleapis": "latest"` resolves to whatever the newest published version is at
install time, so two installs days apart can pull different majors with breaking API
changes. For a local-only tool that mutates a spreadsheet holding irreversible transaction
data, a surprise dependency bump in the Sheets client is an avoidable risk. (Project CLAUDE.md
mandates Bun, but this sub-package is explicitly Node-runtime per the two-runtime boundary,
so npm semantics apply here.)

**Fix:** Pin a concrete caret range (e.g. `"googleapis": "^144.0.0"`, or the version
currently resolved) and commit a lockfile for the sub-package so installs are reproducible.

---

_Reviewed: 2026-06-16T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
