---
phase: 04-refresh-caching
reviewed: 2026-06-17T00:00:00Z
depth: standard
files_reviewed: 9
files_reviewed_list:
  - apps-script/src/Refresh.ts
  - apps-script/src/Triggers.ts
  - apps-script/src/entry.ts
  - apps-script/src/globals.d.ts
  - apps-script/scripts/appendGlobals.ts
  - apps-script/src/Refresh.test.ts
  - apps-script/appsscript.json
  - layout-builder/src/dashboardSheet.js
  - layout-builder/src/dashboardSheet.test.js
findings:
  critical: 1
  warning: 5
  info: 3
  total: 9
status: issues_found
---

# Phase 4: Code Review Report

**Reviewed:** 2026-06-17
**Depth:** standard
**Files Reviewed:** 9
**Status:** issues_found

## Summary

Reviewed the Phase 4 refresh/caching seam: `refreshAll()` orchestration, the pure
`assembleRefreshRows` precedence logic, idempotent trigger management, the IIFE +
post-build-shim entry mechanism, and the layout builder's status-block structure.

The core per-venue isolation design is sound — each provider call is independently
try/caught, the value-cell write is a single `setValues`, and the pure assembler
correctly degrades live → cache → sheet → 0 and never injects a non-number into a
Qty/Price cell (well covered by `Refresh.test.ts`). The trigger install path is
idempotent.

However, there is one BLOCKER: the partial-failure path **silently destroys the
cached last-good of the failed venue** by persisting a blob slice that was just
overwritten/never-populated, which defeats the "cache is a last-good degradation
buffer" contract the whole phase is built on. Several WARNINGs concern the
`Stale?`/`LastUpdated` status semantics drifting from the documented contract and a
non-idempotent `installTrigger` failure window.

## Critical Issues

### CR-01: A cache MISS on a failed venue permanently discards that venue's last-good blob slice

**File:** `apps-script/src/Refresh.ts:119-179` (specifically 159-162 and 179)

**Issue:** The blob is read once at the top (`readBlob`). On a venue *success* the slice
is overwritten with fresh data; on a venue *failure* the slice is left as whatever
`readBlob` returned. At the end, the entire `blob` is unconditionally re-`put` into the
cache.

Trace the realistic steady-state failure: refresh interval is 5 min (`REFRESH_INTERVAL_MINUTES`)
and cache TTL is 5 min (`CACHE_TTL_SECONDS = 300`). These are equal, so the
`PRICES_ALL` entry routinely expires *at or before* the next run (CacheService eviction
is best-effort and frequently early). When a run starts after eviction, `readBlob`
returns `{}`. If Hyperliquid then *fails* this run:

- `blob.hyperliquid` stays `undefined`.
- Value cells correctly fall back to `currentSheet` (the still-displayed real numbers) — good.
- But line 179 re-`put`s `blob` with `hyperliquid: undefined`. The previous last-good
  slice that *was* in the sheet is never re-captured into the cache.

Net effect: after a single cache eviction coinciding with a venue outage, that venue
has **no last-good in the cache at all**, even though a real value is still shown on the
sheet. The status cell goes to `"—"`/`Stale?=TRUE` and stays there across every
subsequent failed run, and on recovery the LastUpdated history is gone. The cache —
the stated purpose of this phase ("last-good degradation buffer") — is effectively
empty exactly when it is needed.

This is a data-flow correctness defect in the central abstraction, not a cosmetic one:
the displayed sheet value and the cache are allowed to diverge, and the recovery path
relies on the cache.

**Fix:** When a venue has no live result this run, re-seed its blob slice from the value
that is actually being written (the `currentSheet` fallback) so the cache always mirrors
the displayed last-good:

```ts
// After assembling rows / before cache.put, backfill missing slices from what
// the sheet will show, so an eviction during an outage doesn't lose last-good.
if (!hlFresh && !blob.hyperliquid) {
  blob.hyperliquid = {
    data: sliceFromSheet(ASSETS, "hyperliquid", currentSheet),
    lastUpdated: blob.hyperliquid?.lastUpdated ?? nowStamp(), // or a "unknown" marker
  };
}
if (!solFresh && !blob.solana) {
  blob.solana = {
    data: sliceFromSheet(ASSETS, "solana", currentSheet),
    lastUpdated: blob.solana?.lastUpdated ?? nowStamp(),
  };
}
```

Alternatively, decouple the two intervals (e.g. `CACHE_TTL_SECONDS` >> refresh interval,
e.g. 3600) so the blob reliably survives between runs — but that only narrows the window;
it does not close it, because CacheService eviction is not guaranteed to honor TTL. Prefer
the sheet-backfill so the invariant "cache == last displayed value" always holds.

## Warnings

### WR-01: `installTrigger` is not atomically idempotent — a crash between delete and create leaves zero triggers

**File:** `apps-script/src/Triggers.ts:43-56`

**Issue:** `installTrigger` deletes all existing `refreshAll` triggers, *then* creates one.
If `ScriptApp.newTrigger(...).create()` throws (quota exhaustion, transient ScriptApp
error), the function has already deleted the working trigger and the catch-less body
propagates — leaving the project with **no** refresh trigger at all. The doc comment
claims "creates exactly one"; on partial failure it creates zero and silently stops
refreshing until a human notices and re-runs. For an unattended tracker, a silent stop is
the worst failure mode.

**Fix:** Create-then-prune, or guard the create so a failure still leaves the prior trigger
intact:

```ts
export function installTrigger(): void {
  const before = ScriptApp.getProjectTriggers().filter(
    (t) => t.getHandlerFunction() === REFRESH_HANDLER,
  );
  ScriptApp.newTrigger(REFRESH_HANDLER).timeBased().everyMinutes(REFRESH_INTERVAL_MINUTES).create();
  // Only after the new trigger exists, remove the prior ones.
  for (const t of before) ScriptApp.deleteTrigger(t);
  Logger.log("installTrigger: created 1, removed " + before.length + " prior.");
}
```

### WR-02: `everyMinutes(REFRESH_INTERVAL_MINUTES)` will throw at runtime for the value 5 unless it is one of the allowed intervals — but the constant is documented as freely editable

**File:** `apps-script/src/Triggers.ts:45-48` and `apps-script/src/Config.ts:34`

**Issue:** `ClockTriggerBuilder.everyMinutes()` only accepts the enum-like values
1, 5, 10, 15, 30. The current value `5` is valid, but the Triggers.ts doc block invites
the user to "edit the constant, rebuild, redeploy" with no mention of this constraint.
Setting `REFRESH_INTERVAL_MINUTES = 3` (or any non-member) compiles cleanly under
`tsc` (it is a plain `number`) and only fails at trigger-install time with an opaque
Apps Script error — a deploy-time / runtime trap, not a compile-time one. Given the
"fails only at deploy time" pain this codebase explicitly tries to avoid, this is a
real footgun.

**Fix:** Either constrain the type so an illegal value fails type-check
(`export const REFRESH_INTERVAL_MINUTES: 1 | 5 | 10 | 15 | 30 = 5;`) or validate at the
top of `installTrigger` and throw a clear message naming the allowed set.

### WR-03: Fresh-run `LastUpdated` re-derives `nowStamp()` instead of using the stamp persisted in the blob, risking a visible skew

**File:** `apps-script/src/Refresh.ts:127,138,170-173,211-213`

**Issue:** On a fresh fetch, the blob slice is stamped at lines 127/138 with one
`nowStamp()` call, then `statusPair(true, blob.hyperliquid?.lastUpdated)` is called.
Because the slice was just set, `lastUpdated ?? nowStamp()` resolves to the persisted
stamp — so this happens to be correct *today*. But the contract is implicit and fragile:
if a future refactor ever sets `hlFresh = true` without also writing
`blob.hyperliquid.lastUpdated` (e.g. caching is moved after status), `statusPair` would
fall through to a *second, later* `nowStamp()` call, and the LastUpdated written to the
sheet would no longer equal the lastUpdated stored in the cache. Two sources of "now"
for one logical timestamp is an avoidable inconsistency.

**Fix:** Capture a single `runStamp = nowStamp()` at the top of `refreshAll`, use it for
both the blob slice and the status write, and have `statusPair` take the stamp explicitly
rather than re-deriving it.

### WR-04: `Stale?` reflects "this run's fetch failed", not "the displayed data is stale" — a venue with fresh data can still be flagged based on transient state

**File:** `apps-script/src/Refresh.ts:170-173,211-213`

**Issue:** `Stale?` is computed purely as `!fresh`. Consider a successful run that, on the
*next* run, fails: the displayed value is unchanged (still the last good number) but
`Stale?` flips to TRUE — correct. Now consider the documented "cold-start-failed" branch:
value cell is `currentSheet` (a *real* prior number that may be only seconds old) yet
LastUpdated is written as `"—"` while `Stale?=TRUE`. The user sees a live-looking number
with a blank timestamp, which reads as "no data" rather than "recently good, fetch
hiccuped". The status semantics conflate "fetch failed this tick" with "data is old",
which undermines the at-a-glance trust the status block exists to provide.

**Fix:** When falling back to `currentSheet` because the cache was empty, still emit the
cache's prior `lastUpdated` if any; only emit `"—"` when there is genuinely no prior
timestamp anywhere. Pairing this with the CR-01 sheet-backfill makes the timestamp track
the real last-good. Consider documenting that `Stale?` means "not refreshed this run."

### WR-05: `statusPair` writes a mixed string/boolean row through `setValues`; a string `"—"` in the LastUpdated cell defeats any date formatting and sorts/compares oddly

**File:** `apps-script/src/Refresh.ts:174-176,211-213`

**Issue:** The LastUpdated values are written as plain strings (`yyyy-MM-dd HH:mm:ss` or
`"—"`), not Date objects. If the layout builder applies (or later applies) a date
number-format to column J, a string value will not be formatted and will be left-aligned
as text, visually inconsistent with a formatted timestamp. Mixing the sentinel `"—"` with
real timestamp strings also means the column cannot be reliably parsed/compared
downstream (Phase 5 staleness coloring). Writing a `Date` plus a separate empty/blank for
the cold-start case would be more robust.

**Fix:** Write `new Date()` (let the sheet format it) for real stamps and `""` (empty),
not `"—"`, for the unknown case; or keep strings but ensure the layout builder leaves
column J as plain text and Phase 5 parses accordingly. At minimum, document that J is a
text column so downstream code does not assume a Date.

## Info

### IN-01: Dead "geometry sanity" locals kept alive with `void`

**File:** `apps-script/src/Refresh.ts:99 (QTY_COL group),151,181-182`

**Issue:** `lastAssetRow` (line 151) is computed and then discarded via `void lastAssetRow`
(line 181), and `STATUS_SOL_ROW` is similarly `void`-ed (line 182). These are dead values
kept only to silence "unused" — `noUnusedLocals` is off, so the `void` statements add
noise without effect. They read as leftover scaffolding.

**Fix:** Remove `lastAssetRow` and the two `void` statements; if `STATUS_SOL_ROW` documents
intent, keep it only in a comment or assert `STATUS_HL_ROW + 1 === STATUS_SOL_ROW` once.

### IN-02: `(globalThis as any)` triple-cast loses type safety on the entry namespace

**File:** `apps-script/src/entry.ts:39,57`

**Issue:** `__ENTRY__` and `__PROVIDERS__` are assigned via `(globalThis as any)`, so a
typo in a delegated name (`appendGlobals.ts` shim referencing `globalThis.__ENTRY__.<name>`)
would not be caught by the compiler — it would surface only as a runtime "cannot read
property of undefined" inside the editor. Given the entry-shim mechanism is the documented
primary risk of this phase, a typed interface for `__ENTRY__` would catch name drift between
`entry.ts` and `appendGlobals.ts`'s `ENTRY_GLOBALS` at build time.

**Fix:** Declare `var __ENTRY__: Record<typeof ENTRY_GLOBALS[number], (...a: unknown[]) => unknown>`
in `globals.d.ts` and drop the `as any`, so a missing key fails type-check.

### IN-03: `numberFormatRequest` end-index comment is misleading

**File:** `layout-builder/src/dashboardSheet.js:80-93`

**Issue:** The parameter is named `endRow`/`endCol` and the comment says
"exclusive, already 1-based-inclusive -> exclusive", but callers pass the 1-based inclusive
last row/col directly as the exclusive end (e.g. `zoneATotalRow` as `endRow`), relying on
the off-by-one between 1-based-inclusive and 0-based-exclusive happening to cancel. It works,
but the naming invites a future caller to pass a true exclusive bound and silently format one
row too few. Tighten the parameter names/comment to state "pass the 1-based inclusive last
row; it is used directly as the 0-based exclusive end."

**Fix:** Rename to `lastRow1Based`/`lastCol1Based` and document the cancellation explicitly,
or convert consistently (`endRowIndex: lastRow` with `startRowIndex: startRow - 1`).

---

_Reviewed: 2026-06-17_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
