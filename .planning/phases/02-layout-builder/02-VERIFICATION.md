---
phase: 02-layout-builder
verified: 2026-06-14T00:00:00Z
status: gaps_found
score: 5/6 must-haves verified
overrides_applied: 0
gaps:
  - truth: "`layout-builder --update` leaves existing DCA Log data rows byte-for-byte unchanged (SC#2 / LAYOUT-02)"
    status: partial
    reason: >
      The data-region guard holds ONLY for a fixed asset registry. DATA_START_ROW is
      derived at runtime as `assets.length + 3` (config.js:44), so the protected boundary
      floats with the asset count. After the documented one-line add of an asset to
      assets.json (CONFIG-01), re-running `--update` re-stamps the transaction header row
      directly onto the first existing transaction data row, overwriting real DCA data with
      header text — the exact irreversible-data-loss class LAYOUT-02 exists to prevent.
      Confirmed by simulation: built with 7 assets -> data at row 10; add 1 asset ->
      tx-header re-stamped at row 10 (= first data row). The data-safety unit test cannot
      catch this because it imports the same derived DATA_START_ROW, so its assertion
      boundary moves in lockstep with the band and stays green while real rows are clobbered.
    artifacts:
      - path: "layout-builder/src/config.js"
        issue: "DATA_START_ROW = assets.length + 3 floats with the registry; not pinned to a fixed absolute row decided at build time"
      - path: "layout-builder/src/dcaLogSheet.js"
        issue: "TX_HEADER_ROW = DATA_START_ROW - 1 and summary-block rows are all positioned from the floating value (lines 23-36, 87-115)"
      - path: "layout-builder/src/dcaLogSheet.test.js"
        issue: "Critical assertion imports the same derived DATA_START_ROW; boundary moves with the band, so it cannot detect the floating-boundary overwrite (line 30, 64)"
    missing:
      - "Pin the DCA Log band boundary to a fixed constant independent of assets.length (e.g. MAX_SUMMARY_ROWS reserving a fixed gap so DATA_START_ROW never moves)"
      - "Leave summary rows beyond assets.length blank rather than shifting the transaction header"
      - "Add a test asserting DATA_START_ROW equals a hard-coded literal (not a value derived from assets.length) so a registry change that would move the boundary fails the suite loudly"
      - "Alternatively, read the persisted boundary back from the live sheet and refuse --update if the on-sheet header row no longer matches"
---

# Phase 2: Layout Builder Verification Report

**Phase Goal:** A user can build and idempotently update the complete spreadsheet structure from the command line without touching DCA Log data rows.
**Verified:** 2026-06-14
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #   | Truth | Status | Evidence |
| --- | ----- | ------ | -------- |
| 1   | `--build` creates Dashboard + DCA Log tabs with correct headers, frozen rows, summary-block labels, authenticated via service account (SC#1, skeleton-only per D-08) | ✓ VERIFIED | `index.js:78-117` runBuild creates both tabs (addSheet, never `spreadsheets.create` — confirmed `grep` returns 0 matches), resolves gridIds, stamps `dashboardBuildRequests` + `dcaLogBuildRequests`. `auth.js:26-32` returns authenticated Sheets v4 client via `GoogleAuth` with single `auth/spreadsheets` scope. Headers verified: DCA Log 9-col header `["Date","Asset","Type","Price","Qty","Total","Fee","Net Cost","Notes"]` asserted by passing test; Dashboard Zone A/B headers in `dashboardSheet.js:21,25`. Frozen rows via `updateSheetProperties.gridProperties.frozenRowCount`. |
| 2   | `--build` refuses (directing to `--update`) if either tab already exists (D-04 guard) | ✓ VERIFIED | `index.js:82-88` filters existing tabs and throws a clear Error directing to `--update`; never deletes/recreates. |
| 3   | `--update` re-applies structural changes (SC#2 structural portion) | ✓ VERIFIED | `index.js:121-149` runUpdate resolves existing gridIds (errors to `--build` if missing) and appends only `dashboardUpdateRequests` + `dcaLogUpdateRequests`; no ad-hoc range write/clear in the update branch. |
| 4   | `--update` leaves existing DCA Log data rows byte-for-byte unchanged (SC#2 / LAYOUT-02) | ✗ FAILED | Guard holds only for a FIXED registry. `DATA_START_ROW = assets.length + 3` (config.js:44) floats. Simulation: build@7 assets -> data row 10; add 1 asset -> `--update` re-stamps tx-header at row 10 = first data row -> overwrites real transactions. Test boundary moves in lockstep (test imports same derived value) and stays green. See CR-01 evaluation below. |
| 5   | `--update` twice produces the same state as once (SC#3, idempotent) | ✓ VERIFIED (for fixed registry) | `dcaLogUpdateRequests(0)` deep-equals across calls (passing deterministic test); update builders are pure and share `bandRequests`. NOTE: idempotency holds only while the registry is unchanged between the two runs — the same floating-boundary flaw (#4) means a registry edit between runs is non-idempotent and destructive. |
| 6   | Skeleton-only scope honored — no formulas / no conditional formatting (D-08) | ✓ VERIFIED | `grep` for `formulaValue`/`addConditionalFormatRule` in both builders matches only comments. Tests assert `JSON.stringify` of all four builders contains neither substring (4 passing assertions). Per D-08 and ROADMAP scope note, absent formulas are NOT a gap. |

**Score:** 5/6 truths verified (truth #4 FAILED — BLOCKER)

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `layout-builder/src/config.js` | SPREADSHEET_ID from env, DASHBOARD/DCA_LOG, DATA_START_ROW, assets re-export | ⚠️ SUBSTANTIVE but defective | Env-sourced ID with fail-fast verified (import throws when unset). DASHBOARD/DCA_LOG present. `assets` re-export present. DATA_START_ROW present but DERIVED (`assets.length + 3`) — the root of CR-01. |
| `layout-builder/src/auth.js` | getSheetsClient() authenticated Sheets v4 client | ✓ VERIFIED | `GoogleAuth` with keyFile `service-account.key.json`, single `auth/spreadsheets` scope; returns `google.sheets({version:"v4"})`. grep confirms scope + keyfile. |
| `layout-builder/src/dashboardSheet.js` | dashboardBuildRequests / dashboardUpdateRequests | ✓ VERIFIED | Pure builders, Zone A (rows 1-10) + Zone B (rows 12-21) labels/formats/frozen row, per-asset rows iterate registry. Formula-free. |
| `layout-builder/src/dcaLogSheet.js` | dcaLogBuild/UpdateRequests with data-region safety | ⚠️ SUBSTANTIVE but defective | Emits top-of-data band only; never addresses rows >= DATA_START_ROW — correct in principle, but the boundary itself floats (CR-01), so "above the data region" is not stable across registry edits. |
| `layout-builder/src/dcaLogSheet.test.js` | Assert no update request touches rows >= DATA_START_ROW | ⚠️ PRESENT but blind to CR-01 | Critical assertion present and passing, but imports the same derived DATA_START_ROW so it cannot detect the floating-boundary overwrite. |
| `layout-builder/src/index.js` | CLI dispatch --build/--update, tab-existence guard, batched orchestration | ✓ VERIFIED | `node --check` passes; process.argv dispatch, getSheetsClient, batchUpdate, no spreadsheets.create. |
| `layout-builder/package.json` | real build/update scripts via node --env-file=.env | ✓ VERIFIED | `build`/`update` invoke `node --env-file=.env src/index.js --build|--update`; no echo stubs; type=module + googleapis preserved. |
| `layout-builder/README.md` | documented CLI + .env setup | ✓ VERIFIED | Documents .env SPREADSHEET_ID, key placement/sharing, both commands, refuse-if-exists + data-safety caveats. |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| dashboardSheet.js | config.js | import assets, DASHBOARD | ✓ WIRED | `import { assets, DASHBOARD } from "./config.js"` (line 15) |
| dcaLogSheet.js | config.js | import DCA_LOG, DATA_START_ROW | ✓ WIRED | `import { assets, DCA_LOG, DATA_START_ROW } from "./config.js"` (line 19) |
| index.js | auth.js | getSheetsClient() | ✓ WIRED | imported and invoked in main() (lines 25, 161) |
| index.js | dashboardSheet.js + dcaLogSheet.js | build/update request-builders | ✓ WIRED | all four builders imported and used in runBuild/runUpdate (lines 27-28, 108-111, 139-142) |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Full unit suite passes | `bun test` (run once) | 12 pass / 0 fail, 72 assertions, 2 files | ✓ PASS |
| index.js valid ESM | `node --check src/index.js` | no error | ✓ PASS |
| No spreadsheets.create (D-01) | `grep spreadsheets.create src/index.js` | 0 matches | ✓ PASS |
| Two-runtime isolation | `grep -rn apps-script src/` | 0 matches | ✓ PASS |
| config.js fail-fast on missing SPREADSHEET_ID | dynamic import without env | throws as designed | ✓ PASS |
| Floating-boundary data-loss simulation (CR-01) | derived-row arithmetic (build@7 vs update@8) | tx-header row 10 == first data row 10 -> overwrite | ✗ FAIL (confirms CR-01) |

### Probe Execution

Not applicable — no `scripts/*/tests/probe-*.sh` and phase does not declare probes. (Unit suite serves as the runnable check; run once above.)

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| LAYOUT-01 | 02-01, 02-02 | `--build` creates tabs with headers/formatting/frozen rows/summary rows (formulas deferred per D-08), authenticated via SA | ✓ SATISFIED | runBuild + auth.js + builders; tab-existence guard; needs human run for live-sheet confirmation |
| LAYOUT-02 | 02-01, 02-02 | `--update` idempotently re-applies structure without ever altering DCA Log data rows | ✗ BLOCKED | Data-row safety is conditional on a fixed registry; floating DATA_START_ROW overwrites live data on registry change (CR-01). The "without ever altering DCA Log data rows" clause is not unconditionally met. |

No orphaned requirements: REQUIREMENTS.md maps only LAYOUT-01, LAYOUT-02 to Phase 2; both are claimed by the plans.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| config.js | 44 | Runtime-derived safety boundary (`assets.length + 3`) for an irreversible-data-loss guard | 🛑 Blocker | Root cause of CR-01 — see gap #4 |
| index.js | 159 | `void google;` dead-code-as-intent (unused top-level googleapis import) | ℹ️ Info | Cosmetic (IN-01); not goal-blocking |
| package.json | 10 | `googleapis: "latest"` unpinned | ⚠️ Warning | Non-reproducible install (WR-05); supply-chain note; not goal-blocking |

No `TBD`/`FIXME`/`XXX` debt markers found in phase files. No stub/placeholder rendering paths (empty value cells are intentional per D-08, label-only summary rows are documented phase boundary).

## Independent Evaluation of Code Review CR-01

The review (02-REVIEW.md) flags as CRITICAL that `DATA_START_ROW = assets.length + 3` floats with the registry. I evaluated this independently against the actual code rather than trusting the review.

**Verdict: CR-01 is a GENUINE threat to the phase goal — confirmed, not dismissed.**

Evidence gathered:
1. **Code confirms the derivation.** `config.js:44` literally computes `export const DATA_START_ROW = assets.length + 3;`. The SUMMARY even frames it as a feature ("stays consistent as assets grow").
2. **The whole band is positioned from this floating value.** `dcaLogSheet.js:36` sets `TX_HEADER_ROW = DATA_START_ROW - 1`; summary rows and the transaction header all move when the count changes.
3. **Arithmetic simulation confirms data loss.** Built with the current 7 assets, data starts at row 10. Adding an 8th asset (a CONFIG-01 one-line edit the project explicitly supports) makes `--update` re-stamp the transaction header at row 10 — the first existing data row — overwriting a real transaction with header text. Removing an asset strands old data above a now-lower boundary.
4. **The test is blind to it.** `dcaLogSheet.test.js:30` derives its assertion boundary from the same imported `DATA_START_ROW`, so the boundary and the band move together; the suite stays green while live rows are clobbered. All 12 tests pass — which is exactly why a passing suite is not evidence of the goal.
5. **No mitigating safeguard exists.** No fixed-MAX reservation, no "do not edit the registry after build" warning in code/README, no on-sheet boundary read-back. `git log` confirms config.js (21:25) predates the review (21:37) and was not amended afterward.

**Why this blocks the phase goal (not merely a quality nit):** The goal is "idempotently update ... *without touching DCA Log data rows*," and SC#2 demands data rows be "byte-for-byte unchanged." The guard satisfies this only under the unstated precondition "the asset registry never changes after the first build." But the registry is *designed* for one-line edits (CONFIG-01), and `--update` is the exact command the user would run after such an edit to re-apply structure. The realistic, intended operator workflow therefore drives directly into irreversible data loss — the precise risk LAYOUT-02 was written to eliminate. The safety property is real but conditional, and the condition is one the project actively encourages users to violate.

This is not an override candidate: it is an unfixed defect, not an intentional, documented deviation. It is not deferrable: no later milestone phase (Phase 3-5 are Apps Script data/refresh/formulas) addresses layout-builder data-region safety.

### Human Verification Required

None blocking the gap decision. (Live-sheet `--build`/`--update` against a real shared spreadsheet would normally be a human check for LAYOUT-01, but the phase already fails on truth #4 / LAYOUT-02, so status is gaps_found regardless; defer live UAT until the gap is closed.)

### Gaps Summary

Five of six observable truths are verified: `--build` creation, the D-04 existence guard, structural `--update`, skeleton-only scope (D-08), and within-registry idempotency are all solid and well-tested. The auth, CLI, package scripts, README, and two-runtime isolation all check out.

The single blocking gap is the DCA Log data-region safety boundary. The guard is implemented as "never address rows at/below `DATA_START_ROW`" — a sound mechanism — but `DATA_START_ROW` is derived from `assets.length` at runtime instead of pinned to the absolute row chosen when the sheet was built. Because the asset registry is explicitly meant to be edited (one-line add/remove), a registry change followed by `--update` shifts the protected boundary onto live transaction rows and overwrites them. This defeats SC#2 ("byte-for-byte unchanged") and the SC#3 idempotency guarantee across registry edits, and it is invisible to the existing test suite, which derives its assertion from the same floating value.

Fix direction (from CR-01, validated): pin the band boundary to a fixed constant (reserve a fixed max summary capacity so `DATA_START_ROW` never moves), leave unused summary rows blank, and add a test asserting `DATA_START_ROW` equals a hard literal so any future registry change that would move the boundary fails loudly.

---

_Verified: 2026-06-14_
_Verifier: Claude (gsd-verifier)_
