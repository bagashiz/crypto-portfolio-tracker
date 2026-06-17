# Phase 4: Refresh & Caching - Pattern Map

**Mapped:** 2026-06-17
**Files analyzed:** 7 (2 new, 5 modified)
**Analogs found:** 7 / 7

## File Classification

| New/Modified File | New/Mod | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|---------|------|-----------|----------------|---------------|
| `apps-script/src/Refresh.ts` (`refreshAll`) | NEW | orchestration / entry | request-response + transform + batch-write | `apps-script/src/Diagnostics.ts` (`testApi`) | exact (per-venue try/catch over both providers) |
| `apps-script/src/Triggers.ts` (`installTrigger`/`removeTrigger`) | NEW | trigger management / entry | event-driven (time-based) | `apps-script/src/Diagnostics.ts` (entry-point shape) + `Config.ts` (reads interval) | role-match (no ScriptApp usage exists yet) |
| `apps-script/src/entry.ts` | MOD | entry wiring | — | self (lines 56-64 TODO slots already templated) | exact (in-file template) |
| `apps-script/scripts/appendGlobals.ts` | MOD | build footer | — | self (line 28 `ENTRY_GLOBALS`) | exact (in-file template) |
| `apps-script/src/Config.ts` | MOD | config | — | self (lines 34-35 already declare the constants) | exact (constants exist) |
| `apps-script/appsscript.json` | MOD | config | — | self (line 5 `oauthScopes`) | exact (one-array edit) |
| `layout-builder/src/dashboardSheet.js` | MOD | layout request-builder | transform (build-time) | self (`labelRowRequest`/`numberFormatRequest` helpers) | exact (reuse own helpers) |
| `apps-script/src/globals.d.ts` | MOD (likely) | ambient typings | — | self (lines 18-21 reserved declarations) | exact (uncomment) |

**Note:** there is NO existing `CacheService`, `SpreadsheetApp`, or `ScriptApp` usage anywhere in the repo. Those three Apps Script surfaces are introduced fresh in Phase 4 — flagged in "No Analog Found" with the closest structural patterns to follow.

---

## Pattern Assignments

### `apps-script/src/Refresh.ts` — `refreshAll()` (orchestration, request-response + transform + batch-write)

**Primary analog:** `apps-script/src/Diagnostics.ts` — already calls BOTH providers, each wrapped in its own independent `try/catch`. This is the exact D-08 / per-provider-isolation shape `refreshAll()` must follow; copy the structure and add cache-fallback + sheet-write.

**Per-venue independent try/catch pattern** (`Diagnostics.ts` lines 16-27) — copy this isolation shape; one venue's throw must not skip the other:
```typescript
export function testApi(): void {
  try {
    Logger.log("Hyperliquid: " + JSON.stringify(getHyperliquidData()));
  } catch (e) {
    Logger.log("Hyperliquid FAILED: " + (e instanceof Error ? e.message : String(e)));
  }
  try {
    Logger.log("Jupiter: " + JSON.stringify(getJupiterData()));
  } catch (e) {
    Logger.log("Jupiter FAILED: " + (e instanceof Error ? e.message : String(e)));
  }
}
```
For `refreshAll()`: replace each `Logger.log` success path with "overwrite this venue's slice of the `PRICES_ALL` blob + mark fresh", and each `catch` with "read this venue's last-good from the blob, set `Stale?=TRUE`, freeze `LastUpdated`" (D-03/D-07).

**Provider consumption — D-09 contract** (`HyperliquidApi.ts` lines 151-163, `JupiterApi.ts` lines 122-135): both return `Record<string, { price: number; qty: number }>` keyed by asset `id`. `refreshAll()` merges the two maps and orders rows by the `ASSETS` registry. Import the providers the same way `Diagnostics.ts` does (lines 12-13):
```typescript
import { getHyperliquidData } from "./HyperliquidApi";
import { getJupiterData } from "./JupiterApi";
```
Per `entry.ts` lines 49-54, the providers are already retained in the bundle via `__PROVIDERS__`; `refreshAll()` calls them directly from inside the bundle (no shim needed for providers).

**Ordering by registry** (pattern from `HyperliquidApi.ts` line 153 / `JupiterApi.ts` line 125 — filter `ASSETS` by venue, iterate in registry order):
```typescript
import { ASSETS } from "./Config";
// ... build the single setValues array by iterating ASSETS in order so row order
// matches the layout-builder's Zone A row order (dashboardSheet.js lines 113-117).
```

**Error-message convention** (used throughout providers — `instanceof Error` narrowing): mirror `Diagnostics.ts` line 20 `e instanceof Error ? e.message : String(e)` for any logging in the catch blocks.

**Single batched write (D-08, REFRESH-02):** no existing analog in this repo for `SpreadsheetApp` (see "No Analog Found"). Required shape: one `range.setValues(rows)` over the Zone A value columns (D-10: likely Qty col B + Price col C only), where each row's values come from (1) live fetch, else (2) cache last-good, else (3) current sheet values read at run start. Source row geometry from `dashboardSheet.js`: Zone A header row 1, per-asset rows start at row 2 (`ZONE_A_HEADER_ROW + 1`), columns `Asset, Qty, Price, Value, Target %, Risk, APY %` (lines 20-21).

---

### `apps-script/src/Triggers.ts` — `installTrigger()` / `removeTrigger()` (trigger management, event-driven)

**Interval source — compiled constant (D-09):** read `REFRESH_INTERVAL_MINUTES` from `Config.ts` (line 34, currently `5`):
```typescript
export const REFRESH_INTERVAL_MINUTES = 5;
```
`installTrigger()` does `ScriptApp.newTrigger("refreshAll").timeBased().everyMinutes(REFRESH_INTERVAL_MINUTES).create()`.

**Idempotency requirement (D-09):** `installTrigger()` must first remove any existing `refreshAll` trigger before creating one (iterate `ScriptApp.getProjectTriggers()`, delete those whose `getHandlerFunction() === "refreshAll"`). `removeTrigger()` does the same removal without re-creating. No `ScriptApp` analog exists in the repo — structurally this is the same "fail-loud / single-responsibility entry function" shape as `Diagnostics.ts`.

**Entry-point shape:** export top-level functions returning `void`, same as `testApi()` (`Diagnostics.ts` line 16). They become editor-callable via the `entry.ts` + `appendGlobals.ts` shim mechanism below.

---

### `apps-script/src/entry.ts` (entry wiring) — uncomment the reserved TODO slots

**Analog: self.** Lines 56-64 already contain the exact one-line template. The live `__ENTRY__` assignment is line 36:
```typescript
(globalThis as any).__ENTRY__ = { hello, testApi };
```
Phase 4 adds the three new functions to this object and imports them at the top (mirroring the existing `import { testApi } from "./Diagnostics";` on line 26):
```typescript
import { refreshAll } from "./Refresh";
import { installTrigger, removeTrigger } from "./Triggers";
// ...
(globalThis as any).__ENTRY__ = { hello, testApi, refreshAll, installTrigger, removeTrigger };
```
The committed TODO (lines 56-64) prescribes exactly this: "Add `refreshAll` to the `__ENTRY__` object above AND to the name array in `scripts/appendGlobals.ts`". Providers stay on `__PROVIDERS__` (line 54) — do NOT add them to `__ENTRY__`.

---

### `apps-script/scripts/appendGlobals.ts` (build footer) — add 3 names

**Analog: self.** Line 28 is the single edit point:
```typescript
const ENTRY_GLOBALS = ["hello", "testApi"] as const;
```
becomes:
```typescript
const ENTRY_GLOBALS = ["hello", "testApi", "refreshAll", "installTrigger", "removeTrigger"] as const;
```
The shim emitter (lines 39-46) and idempotent SENTINEL guard (lines 34-38) need NO changes — they iterate `ENTRY_GLOBALS` generically. Each name yields a top-level `function name() { return globalThis.__ENTRY__.name.apply(this, arguments); }` (line 41).

---

### `apps-script/src/Config.ts` (config) — constants already present

**Analog: self.** Lines 34-35 already declare both constants this phase consumes:
```typescript
export const REFRESH_INTERVAL_MINUTES = 5;
export const CACHE_TTL_SECONDS = 300;
```
Phase 4 likely needs NO change here beyond confirming values (they are described as "placeholders; tuned in later phases", line 33). `ASSETS` (line 31) is the ordered registry `refreshAll()` iterates. If a `PRICES_ALL` cache-key constant is wanted, follow the `UPPER_SNAKE_CASE` const-export convention already used on lines 34-35.

---

### `apps-script/appsscript.json` (config) — add two oauth scopes

**Analog: self.** Line 5 currently:
```json
"oauthScopes": ["https://www.googleapis.com/auth/script.external_request"]
```
Add the two scopes CONTEXT.md D-05/integration-points require (`SpreadsheetApp` writes + `ScriptApp` triggers):
```json
"oauthScopes": [
  "https://www.googleapis.com/auth/script.external_request",
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/script.scriptapp"
]
```
Preserve `"timeZone": "Asia/Jakarta"` (line 2) — the `LastUpdated` timestamp format must respect it (D-08 discretion).

---

### `layout-builder/src/dashboardSheet.js` (layout request-builder) — stamp static status labels (D-05)

**Analog: self.** Reuse the existing `labelRowRequest` helper to stamp the 2-line venue status block's STATIC labels (venue names + `LastUpdated`/`Stale?` headers). `refreshAll()` writes only the dynamic values into the adjacent cells.

**`labelRowRequest` helper** (lines 46-58) — the exact helper to reuse for the status labels:
```javascript
function labelRowRequest(sheetId, row, startCol, labels) {
  return {
    updateCells: {
      fields: "userEnteredValue",
      start: { sheetId, rowIndex: row - 1, columnIndex: startCol - 1 },
      rows: [{ values: labels.map(stringCell) }],
    },
  };
}
```
Note 1-based `row`/`startCol` converted to 0-based grid indices inside the helper — pass 1-based values (matches lines 112, 127).

**Where to add the requests** (`structuralRequests`, lines 93-140) — push the new status-label requests into the same `requests` array, alongside the Zone A/B labels. Both `dashboardBuildRequests` (line 145) and `dashboardUpdateRequests` (line 151) delegate to `structuralRequests`, so adding here covers both `--build` and `--update` automatically.

**Placement constraint (D-06):** put the block in free columns to the right of Zone A (zones use cols A–G), e.g. cols I–K rows 1–3. Column-anchored so it survives the `MAX_ZONE_A_ASSET_ROWS` registry-growth guard (lines 32, 98-104) — that guard only shifts ROWS, never columns, so a column-anchored block is collision-safe by construction.

**Optional format** (lines 61-75 `numberFormatRequest`) — if the dynamic `LastUpdated` cell needs a date/time format, this helper builds a `repeatCell` number-format request; reuse it the same way Zone A formats are applied (lines 122-124).

---

### `apps-script/src/globals.d.ts` (ambient typings) — uncomment reserved declarations (likely)

**Analog: self.** Lines 18-21 already reserve the declarations:
```typescript
// var refreshAll: () => void;
// var installTrigger: () => void;
// var removeTrigger: () => void;
```
If `entry.ts` adds bare `globalThis.refreshAll = refreshAll` assignments (as it does for `hello` on line 41), these must be uncommented to type-check under `strict`. If the new globals are placed ONLY on `__ENTRY__` (cast via `(globalThis as any)`, like `installTrigger` would be), no `globals.d.ts` edit is strictly required — but uncommenting them is the documented intent ("assigned in entry.ts as they land", line 18).

---

## Shared Patterns

### Per-provider isolation (try/catch)
**Source:** `apps-script/src/Diagnostics.ts` lines 16-27
**Apply to:** `Refresh.ts` `refreshAll()`
Each venue provider call is wrapped in its OWN `try/catch`. A Jupiter outage must not blank Hyperliquid data (PROJECT.md constraint + D-10/D-13). This is the seam that makes the providers' fail-loud behavior safe.

### Fail-loud property/config reads
**Source:** `apps-script/src/Properties.ts` lines 22-28
**Apply to:** any Script Property reads in Phase 4 (providers already use `getScriptProp`; `refreshAll`/`Triggers` likely don't need new ones, but if they do, reuse this).
```typescript
export function getScriptProp(name: string): string {
  const value = PropertiesService.getScriptProperties().getProperty(name);
  if (value === null || value === "") {
    throw new Error("Missing Script Property: " + name);
  }
  return value;
}
```

### Entry-global shim mechanism (two-file edit)
**Source:** `apps-script/src/entry.ts` lines 36, 56-64 + `apps-script/scripts/appendGlobals.ts` line 28
**Apply to:** every new editor-callable global (`refreshAll`, `installTrigger`, `removeTrigger`)
Add the name in BOTH places: the `__ENTRY__` object in `entry.ts` AND the `ENTRY_GLOBALS` array in `appendGlobals.ts`. Never invent a new global mechanism (CONTEXT.md "reuse verbatim").

### Registry-ordered iteration (single source of truth)
**Source:** `HyperliquidApi.ts` line 153 / `JupiterApi.ts` line 125 (`ASSETS.filter(a => a.venue === ...)`)
**Apply to:** `refreshAll()` building the `setValues` row array, and the layout-builder row order (`dashboardSheet.js` lines 113-117).
Iterate `ASSETS` in registry order so the refresh write rows line up with the layout-builder's Zone A rows.

### Pure request-builder helpers (layout builder)
**Source:** `layout-builder/src/dashboardSheet.js` lines 40-85 (`stringCell`, `labelRowRequest`, `numberFormatRequest`, `freezeHeaderRequest`)
**Apply to:** the new static status-block labels — never hand-build a raw `batchUpdate` request; compose the existing helpers (offline-unit-testable, no Google globals).

---

## No Analog Found

These Apps Script API surfaces are introduced fresh in Phase 4 — NO existing usage anywhere in the repo. The planner should treat the closest structural pattern (noted) plus the Apps Script API docs as the reference:

| Surface | Where used | Closest structural pattern | Notes |
|---------|------------|----------------------------|-------|
| `CacheService.getScriptCache()` | `Refresh.ts` (`PRICES_ALL` blob) | none — fresh | Per-venue blob shape `{ hyperliquid: {data, lastUpdated}, solana: {data, lastUpdated} }` (D-02). `get`/`put(key, json, CACHE_TTL_SECONDS)`. Treat miss as cold-start (D-07), not an error. |
| `SpreadsheetApp.getActiveSpreadsheet()` | `Refresh.ts` (Dashboard write) | `dashboardSheet.js` row/col geometry (lines 20-21, 113-118) for WHERE to write | Container-bound (no spreadsheet ID, per PROJECT.md). Single `range.setValues(rows)` over Zone A value cols (D-08/D-10). Read current values at run start for the fallback source. |
| `ScriptApp.newTrigger()` / `getProjectTriggers()` / `deleteTrigger()` | `Triggers.ts` | `Diagnostics.ts` entry-fn shape; `Config.ts` line 34 for interval | `.timeBased().everyMinutes(REFRESH_INTERVAL_MINUTES)`. Idempotent install: delete existing `refreshAll` triggers first (D-09). |

These are exactly the three surfaces the new `oauthScopes` (`spreadsheets`, `script.scriptapp`) and the existing `script.external_request` unlock.

## Metadata

**Analog search scope:** `apps-script/src/`, `apps-script/scripts/`, `apps-script/`, `layout-builder/src/`
**Files scanned:** 12 source/config files read in full (all ≤ 165 lines, single-pass)
**Pattern extraction date:** 2026-06-17
