---
phase: 02-layout-builder
reviewed: 2026-06-14T00:00:00Z
depth: standard
files_reviewed: 10
files_reviewed_list:
  - layout-builder/package.json
  - layout-builder/README.md
  - layout-builder/src/auth.js
  - layout-builder/src/config.js
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

# Phase 2: Code Review Report

**Reviewed:** 2026-06-14T00:00:00Z
**Depth:** standard
**Files Reviewed:** 10
**Status:** issues_found

## Summary

Reviewed the layout-builder Node/ESM package: CLI entry, auth, config, the two
sheet request-builders, and their tests. The code is well-commented and the
data-loss guard (`--update` never addressing rows at/below `DATA_START_ROW`) is
genuinely well-defended in `dcaLogSheet.js` and proven by a structural test.

However, the central safety guarantee has a hole at the source-of-truth layer:
`DATA_START_ROW` is derived from `assets.length` at runtime, while the user's
already-entered transaction data sits at a *fixed* absolute row decided when the
sheet was first built. Adding or removing an asset later shifts the derived band
under the existing data region — and `--update` will then write the structural
band on top of, or leave orphaned, real transaction rows. This is exactly the
irreversible-data-loss class the phase set out to prevent, so it is a BLOCKER.

Remaining findings are robustness/quality issues: a `--build` path that can fail
ungracefully against a brand-new spreadsheet's default tab, missing error-class
narrowing that can leak the SA key contents into logs, an off-by-one risk in the
test's data-region assertion that lets a real overwrite slip through, and several
maintainability concerns.

## Critical Issues

### CR-01: `DATA_START_ROW` derived from `assets.length` shifts the protected data band when the registry changes

**File:** `layout-builder/src/config.js:44`, `layout-builder/src/dcaLogSheet.js:36,87-115`
**Issue:**
`DATA_START_ROW = assets.length + 3` is recomputed from the *current* registry on
every run. The DCA Log transaction header (`TX_HEADER_ROW = DATA_START_ROW - 1`)
and the per-asset summary rows are all positioned from this derived value.

On first `--build` with 7 assets, the transaction header lands on row 9 and data
begins at row 10. The user then enters transactions starting at row 10. If a
later edit to `assets.json` changes the asset count (add an 8th asset, or remove
one), `DATA_START_ROW` shifts to 11 (or 9). Running `--update`:

- **Add an asset (count 7 -> 8):** the new summary row is written at row 8, the
  transaction header is re-stamped at row 10 — which is the **first existing
  data row**. `--update` overwrites a real transaction with header text.
- **Remove an asset (count 7 -> 6):** the band shrinks; the header is written at
  row 8, leaving the user's old header text and the now-misaligned first data
  rows stranded above the new data boundary.

The much-advertised guard ("`--update` never touches rows at/below
`DATA_START_ROW`") is only true *for a fixed DATA_START_ROW*. Because the value
floats with `assets.length`, the guard's own boundary moves into live data. The
test in `dcaLogSheet.test.js` cannot catch this — it imports the same derived
`DATA_START_ROW`, so the assertion moves in lockstep with the band and stays
green while real rows get clobbered.

**Fix:**
Pin the data boundary to an immutable value once the sheet exists, independent of
`assets.length`. Options, in order of safety:

```js
// config.js — make the band boundary a fixed constant, not derived.
// The summary block must be sized for the MAX supported assets, reserving a
// fixed gap so the transaction header/data region never moves.
export const MAX_SUMMARY_ROWS = 16;          // fixed capacity, > any realistic registry
export const SUMMARY_HEADER_ROW = 1;
export const TX_HEADER_ROW = SUMMARY_HEADER_ROW + MAX_SUMMARY_ROWS + 1; // fixed
export const DATA_START_ROW = TX_HEADER_ROW + 1;                        // fixed forever
```

Then summary rows beyond `assets.length` are simply left blank, and `DATA_START_ROW`
never moves regardless of registry edits. Add a test that asserts
`DATA_START_ROW` equals a hard-coded literal (not a value derived from
`assets.length`) so a future registry change that would move the boundary fails
the suite loudly. Alternatively, read the persisted boundary back from the live
sheet and refuse `--update` if the on-sheet header row no longer matches the
computed one.

## Warnings

### WR-01: `--build` against a fresh spreadsheet leaves the default tab and can collide on re-run

**File:** `layout-builder/src/index.js:78-117`
**Issue:**
A newly created Google spreadsheet always contains a default tab (commonly
`Sheet1`). `runBuild` only checks for `Dashboard`/`DCA Log` and adds two new
tabs, leaving the stray default tab behind. More importantly, the D-04 guard only
refuses when `Dashboard` or `DCA Log` already exist; it does not detect a partial
prior run. If the first `batchUpdate` (the two `addSheet`s) succeeds but the
second (structural stamp) fails — network blip, quota — a re-run of `--build`
will now correctly refuse (tabs exist), but the operator is left with two
empty, unstamped tabs and the only path forward is `--update`. That recovery
path is undocumented for this failure mode.

**Fix:**
Document the partial-failure recovery ("if `--build` fails after tab creation,
re-run with `--update`"), and consider deleting/ignoring the default tab or at
least logging its presence. At minimum add a comment in `runBuild` noting that
the two-batch sequence is not atomic.

### WR-02: Top-level error handler can leak service-account key contents into logs

**File:** `layout-builder/src/index.js:169-180`, `layout-builder/src/auth.js:8-11`
**Issue:**
`auth.js` explicitly promises the key contents "must not appear in any error
message." But `getSheetsClient()` uses `keyFile`, so key parsing happens lazily
inside googleapis during the first API call, and any error there is caught by the
generic handler at `index.js:169` which prints `err.message` / `String(err)`.
googleapis/google-auth-library errors on malformed key JSON can include fragments
of the offending input. `String(err)` on a non-Error throw could serialize an
object containing the loaded key. The handler makes no attempt to scrub or
narrow by error type, so the security promise is not actually enforced in code.

**Fix:**
Narrow the printed surface and never `String(err)` an arbitrary object:

```js
main().catch((err) => {
  const message = err instanceof Error ? err.message : "Unexpected error.";
  // Defensive: never echo anything that might embed key material.
  console.error(message.replace(/-----BEGIN[\s\S]*?-----END[^-]*-----/g, "[redacted-key]"));
  // ...actionable hint...
  process.exit(1);
});
```

### WR-03: Data-region test off-by-one allows an overwrite of the first data row to pass

**File:** `layout-builder/src/dcaLogSheet.test.js:64`
**Issue:**
The critical assertion uses `expect(range.endRowIndex).toBeLessThanOrEqual(DATA_START_ROW_0BASED)`.
`endRowIndex` is exclusive, and `DATA_START_ROW_0BASED` is the 0-based index of
the first data row. A range with `endRowIndex === DATA_START_ROW_0BASED` stops
exactly before the data — that is correct and should pass. But the `<=`
combined with the exclusive semantics means a range whose *last written row* is
`DATA_START_ROW_0BASED` (i.e. `endRowIndex === DATA_START_ROW_0BASED + 1`) would
fail — good — yet the start-side guard at line 67 uses
`toBeLessThan(DATA_START_ROW_0BASED)`, which is correct, but `extractRanges` does
not normalize `updateCells` requests that carry both a `range` AND `rows`, nor
`repeatCell` with an open-ended (missing `endRowIndex`) range from a future edit.
The net effect: the suite proves the *current* request set is safe, but is brittle
against the very Phase-5 extensions the comments anticipate. Given CR-01, this
test also cannot detect the floating-boundary class of overwrite at all.

**Fix:**
Assert `DATA_START_ROW` against a hard literal independent of `assets.length`
(see CR-01), and make `extractRanges` fail closed on any range it does not
recognize (push a sentinel range with `endRowIndex: Infinity` for unknown request
shapes so the assertion catches them) rather than silently skipping them.

### WR-04: `getExistingTabs` silently drops tabs whose `sheetId` is missing or whose title is non-string

**File:** `layout-builder/src/index.js:58-65`
**Issue:**
`tabs.set(props.title, props.sheetId)` runs whenever `props.title` is a string,
but does not validate that `props.sheetId` is a number. If the API returns a tab
with a string title but (for any reason) an undefined `sheetId`, it is stored as
`undefined` and later `created.get(DASHBOARD)` returns `undefined`, which the code
interprets as "tab not created." For `runUpdate`, an undefined stored value would
be treated as "missing tab." These are silent mis-classifications rather than
clear errors.

**Fix:**
Only register tabs with a numeric `sheetId`:

```js
if (typeof props.title === "string" && typeof props.sheetId === "number") {
  tabs.set(props.title, props.sheetId);
}
```

### WR-05: `googleapis: "latest"` pins nothing — non-reproducible, supply-chain exposure

**File:** `layout-builder/package.json:10`
**Issue:**
`"googleapis": "latest"` resolves to whatever is newest at install time. This
makes builds non-reproducible and silently pulls in new transitive code on every
fresh install — a supply-chain risk for a tool that authenticates with a
service-account key and writes to a live spreadsheet. There is no lockfile shown
in `layout-builder/` (the root `bun.lock` does not cover this isolated package's
install when run via `node`/npm).

**Fix:**
Pin a concrete version range (e.g. `"googleapis": "^144.0.0"`) and commit a
lockfile for this package so installs are reproducible.

## Info

### IN-01: `void google;` is a code smell standing in for a real dependency use

**File:** `layout-builder/src/index.js:159`
**Issue:**
`void google;` exists only to "make the dependency unambiguously part of this
module's contract." `google` is already imported and genuinely used transitively
via `auth.js`; the top-level `import { google } from "googleapis"` here is unused
in this file and the `void` is a workaround for that. It is dead code dressed up
as intent.

**Fix:** Remove both the unused `import { google } from "googleapis"` (line 23)
and the `void google;` statement. `getSheetsClient` already owns that dependency.

### IN-02: Duplicated request-helper definitions across the two sheet builders

**File:** `layout-builder/src/dashboardSheet.js:33-78`, `layout-builder/src/dcaLogSheet.js:44-81`
**Issue:**
`stringCell`, `labelRowRequest`, `numberFormatRequest`, and the freeze-rows
helper are copy-pasted between `dashboardSheet.js` and `dcaLogSheet.js` with
near-identical bodies. Divergence risk: a fix to the 1-based -> 0-based
conversion in one file will not propagate to the other.

**Fix:** Extract the shared request-builders into a `src/requests.js` module and
import them in both sheet definitions.

### IN-03: `CURRENCY_FORMAT` constant duplicated across modules

**File:** `layout-builder/src/dashboardSheet.js:29`, `layout-builder/src/dcaLogSheet.js:39`
**Issue:** The same `{ type: "CURRENCY", pattern: "$#,##0.00" }` literal is
defined in two files. Same drift risk as IN-02.

**Fix:** Move number-format constants into a shared module alongside the
extracted helpers.

### IN-04: README documents `npm run build`/`update` but project convention is Bun

**File:** `layout-builder/README.md:45-48`, `layout-builder/package.json:6-7`
**Issue:** Project CLAUDE.md mandates Bun over npm/Node tooling, yet the scripts
and README invoke `node --env-file=.env` and `npm run ...`. This is intentional
for the layout-builder (it is explicitly the Node runtime, per the two-runtime
boundary), but the `npm run` phrasing in the README is gratuitous and conflicts
with the stated convention. The `node --env-file` part is correct and required
(Bun auto-loads `.env`, Node does not).

**Fix:** Keep `node --env-file=.env` (required), but invoke the scripts directly
or note clearly that this package is the deliberate Node exception so readers do
not "correct" it to Bun.

---

_Reviewed: 2026-06-14T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
