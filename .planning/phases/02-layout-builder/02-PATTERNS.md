# Phase 2: Layout Builder - Pattern Map

**Mapped:** 2026-06-14
**Files analyzed:** 6 (4 new, 2 modified)
**Analogs found:** 2 exact / 4 partial-or-none of 6

> **Honesty note:** This is a thin scaffold repo. There is **no existing Google Sheets API code** to copy — `auth.js`, `dashboardSheet.js`, `dcaLogSheet.js`, and `index.js` are all greenfield. The only real in-repo analogs are the **Phase 1 scaffold files** (`config.js`, both `package.json` files, `entry.ts`/`Hello.ts`). For Sheets-API-specific patterns the planner must fall back to RESEARCH.md / `googleapis` docs and the structural spec in STRUCTURE.md + CONTEXT.md decisions. Patterns below are therefore split into (a) **in-repo analogs** (ESM/camelCase/config/script wiring) and (b) **prescriptive conventions** (CONVENTIONS.md) where no analog exists.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `layout-builder/src/config.js` (modify) | config | n/a | itself (extend in place) | exact (self) |
| `layout-builder/package.json` (modify) | config (scripts) | n/a | `apps-script/package.json` scripts | exact (sibling runtime) |
| `layout-builder/src/auth.js` (new) | auth/utility | request-response (JWT → API client) | none in repo | no analog |
| `layout-builder/src/index.js` (new) | CLI entry / orchestration | batch (argv → batchUpdate) | `apps-script/src/entry.ts` (entry-point shape only) | partial (role-match, different mechanism) |
| `layout-builder/src/dashboardSheet.js` (new) | sheet-definition / builder | batch (range definitions → batchUpdate requests) | `apps-script/src/Config.ts` (assets iteration only) | partial (asset-iteration pattern) |
| `layout-builder/src/dcaLogSheet.js` (new) | sheet-definition / builder | batch (range definitions → batchUpdate requests) | `dashboardSheet.js` (sibling, built same phase) | sibling (build together) |

## Pattern Assignments

### `layout-builder/src/config.js` (config, modify-in-place)

**Analog:** itself — extend, do not recreate (CONTEXT D-02 rewires `SPREADSHEET_ID`).

**Existing import + re-export pattern to preserve** (`config.js` lines 6–9):
```js
import assets from "../../assets.json" with { type: "json" };
export { assets };
```
Keep the shared-registry import verbatim (single source of truth, D-04/D-05). The `with { type: "json" }` import attribute is the established repo idiom (mirrored in `apps-script/src/Config.ts` line 7).

**The one change required** (`config.js` lines 15–16) — replace the placeholder constant with a `.env`-sourced value (D-02). Current:
```js
export const SPREADSHEET_ID = "PLACEHOLDER_SPREADSHEET_ID";
```
becomes a `process.env.SPREADSHEET_ID` read. Node runtime — Bun auto-`.env` does NOT apply; the value arrives via `node --env-file=.env` (D-02). Planner should decide whether to fail-fast on a missing/placeholder value here.

**Preserve the sheet-name constants verbatim** (`config.js` lines 19–20) — `dashboardSheet.js` / `dcaLogSheet.js` import these:
```js
export const DASHBOARD = "Dashboard";
export const DCA_LOG = "DCA Log";
```

**Comment style to match** — inline `//` banners grouping config sections (already present in `config.js`; mirror for any new exported settings like data-region start row, frozen-row counts).

---

### `layout-builder/package.json` (config — scripts, modify)

**Analog:** `apps-script/package.json` lines 5–8 — the sibling runtime already replaced its Phase-1 stub scripts with real invocations. Copy that shape.

**Current stubs to replace** (`layout-builder/package.json` lines 5–8):
```json
"scripts": {
  "build": "echo 'layout-builder --build not implemented in Phase 1 (Phase 2)' && exit 0",
  "update": "echo 'layout-builder --update not implemented in Phase 1 (Phase 2)' && exit 0"
}
```

**Real-invocation pattern** (mirrors `apps-script/package.json` line 6 `"build": "bun build ..."`):
Replace with `node --env-file=.env src/index.js --build` and `... --update` (D-02: Node + explicit `--env-file`, NOT `bun` — layout-builder is the documented Node exception to the Bun-first rule).

**Preserve** `"type": "module"` (line 3) and the `googleapis` dependency (lines 9–11) — ESM is the established module mode; `googleapis` is the only allowed dependency (two-runtime isolation).

---

### `layout-builder/src/auth.js` (auth, request-response) — NO ANALOG

**Analog:** none. No `googleapis` / JWT code exists anywhere in the repo.

**Prescriptive guidance (from ARCHITECTURE.md + CONVENTIONS.md):**
- ESM, camelCase filename (already named correctly), 2-space indent, double quotes, semicolons.
- Import order: third-party (`googleapis`) before local (`./config.js`).
- Service-account JWT via `google.auth.JWT` / `GoogleAuth` (ARCHITECTURE.md line 30), key from `layout-builder/service-account.key.json` (D-03, gitignored — `.gitignore` lines 26–27 already cover `*.key.json` + `service-account.key.json`).
- Scope: `https://www.googleapis.com/auth/spreadsheets`.
- Single-responsibility function returning an authenticated Sheets client (e.g. `getSheetsClient()`), camelCase (CONVENTIONS line 40).
- Planner: source patterns from RESEARCH.md / `googleapis` README, not from this codebase.

---

### `layout-builder/src/index.js` (CLI entry / orchestration, batch) — PARTIAL ANALOG

**Analog:** `apps-script/src/entry.ts` — role-match (the project's other entry point) but **different mechanism** (it does global-shim wiring, not CLI arg parsing). Borrow only the "thin entry that delegates + documents the dispatch" shape, not the IIFE/globalThis code.

**Entry-point documentation idiom to mirror** (`entry.ts` lines 1–23 header block) — a top-of-file block comment explaining what the entry does and the one-line-to-extend contract. `index.js` should similarly document the `--build` / `--update` dispatch.

**Mechanism (prescriptive, from CONTEXT + ARCHITECTURE):**
- Parse `--build` / `--update` from `process.argv` (CLI parsing is Claude's Discretion, D-39; `process.argv` favored for zero-dep).
- `--build`: **guard first** — if `Dashboard` or `DCA Log` tab already exists, refuse with an error pointing to `--update` (D-04, hard data-loss guard). Then create tabs + stamp structure.
- `--update`: re-apply ONLY fixed structural ranges; never address the DCA Log data region (D-06).
- Data flow: `auth.js` → Sheets client → `dashboardSheet.js` + `dcaLogSheet.js` produce request arrays → single `batchUpdate` (ARCHITECTURE.md lines 42–48; batched-vs-grouped is Claude's Discretion D-40).
- Import order: third-party (`googleapis` if used directly) → local (`./auth.js`, `./config.js`, `./dashboardSheet.js`, `./dcaLogSheet.js`).

---

### `layout-builder/src/dashboardSheet.js` (sheet-definition / builder, batch) — PARTIAL ANALOG

**Analog:** `apps-script/src/Config.ts` lines 7, 31 — for the **asset-registry iteration pattern only**. The builder generates one Dashboard holdings row per asset by iterating the shared registry.

**Asset-iteration source pattern** (`Config.ts` line 7 + 31, and `config.js` line 6 in this runtime):
```js
import { assets } from "./config.js";
// iterate assets to emit per-asset rows; read id, target, risk, apy (CONTEXT line 78)
```
Mint/ticker fields are still placeholders (`assets.json` lines 21, 29, 36, 44, 52) — Phase 2 layout needs only `id`, `target`, `risk`, `apy`, so placeholders do NOT block this phase (CONTEXT line 78).

**Structural spec (prescriptive, from STRUCTURE.md + CONTEXT D-08):**
- Dashboard Zone A live holdings rows 1–10 (TOTAL row 10); Zone B allocation health rows 12–21 (TOTALS row 21) — STRUCTURE.md line 80.
- **Skeleton only**: tab creation, headers, frozen header rows, summary-row labels, number formats, empty cells. **NO formulas, NO conditional formatting** (D-08 — deferred to Phase 5; verifier must not flag missing formulas, CONTEXT line 13). Do NOT "helpfully" add formulas.
- Exact number-format strings / frozen-row counts / column widths / precise cell map are Claude's Discretion (D-41) — derive from STRUCTURE.md sketch.
- Output: pure functions returning Sheets API request objects (single-responsibility, CONVENTIONS lines 107–109), camelCase function names.
- No in-repo analog for the actual `batchUpdate` request shapes — use RESEARCH.md / `googleapis` Sheets API reference.

---

### `layout-builder/src/dcaLogSheet.js` (sheet-definition / builder, batch) — SIBLING ANALOG

**Analog:** `dashboardSheet.js` (built the same phase — mirror its module shape: ESM, pure request-builder functions, imports from `./config.js`).

**Structural spec (prescriptive, from CONTEXT D-05/D-06/D-07 — HIGHEST STAKES):**
- **Top-of-data band (D-05, user's explicit choice — supersedes STRUCTURE.md "summary below data" sketch):** per-asset summary block (total invested, total qty, DCA-weighted avg cost, buy count, last buy, total fees) occupies fixed TOP rows, immediately followed by the transaction column header row: `Date, Asset, Type, Price, Qty, Total, Fee, Net Cost, Notes` (cols A–I). Transaction data appends below a fixed start row, growing unbounded.
- **Data-row protection (D-06) — implement as "never reference the data region":** `--update` writes ONLY summary-block cells, the header row, number formats, frozen rows. Issue **no write and no clear** to the data region. Do NOT implement read-detect-write boundary logic — the simplest correct mechanism is to never address those ranges (CONTEXT lines 94, 32).
- **Leave room for Phase 5 open-ended SUMIF ranges (D-07):** data region must start at a known fixed row with nothing structural below it.
- **Skeleton only** — labels + number formats, NO SUMIF/PnL formulas (D-08).
- Dropdowns (Asset/Type data-validation) are v2-deferred (PNL-06) — out of scope unless trivially free (D-42).

---

## Shared Patterns

### ESM module + filename convention
**Source:** `layout-builder/package.json` line 3 (`"type": "module"`), `layout-builder/src/config.js` (existing ESM file).
**Apply to:** all `layout-builder/src/*.js` files.
- `"type": "module"` ESM. camelCase filenames (`index.js`, `auth.js`, `dashboardSheet.js`, `dcaLogSheet.js`). camelCase functions/locals; UPPER_SNAKE_CASE for exported config constants (`SPREADSHEET_ID`, `DASHBOARD`, `DCA_LOG`).
- 2-space indent, double quotes, semicolons, trailing newline (CONVENTIONS lines 52–53).

### Single-source-of-truth asset registry
**Source:** `layout-builder/src/config.js` line 6, `apps-script/src/Config.ts` line 7.
**Apply to:** `config.js`, `dashboardSheet.js`, `dcaLogSheet.js`.
```js
import assets from "../../assets.json" with { type: "json" };
```
Read the registry only via `config.js`'s re-export; never duplicate or hardcode the asset list. Adding/removing an asset stays a one-line edit in `assets.json` (D-04/D-05, CONVENTIONS line 124).

### Two-runtime isolation
**Source:** CONVENTIONS.md lines 23–30, both `package.json` dependency blocks.
**Apply to:** all new files.
- `layout-builder/` uses `googleapis` ONLY. Never import apps-script code or pull in apps-script deps. The Google Sheet is the only integration surface (CONTEXT line 85).

### package.json script replacement idiom
**Source:** `apps-script/package.json` lines 5–8 (already migrated from stubs to real commands).
**Apply to:** `layout-builder/package.json`.
- Replace `echo ... && exit 0` Phase-1 stubs with real runtime invocations. Layout-builder uses `node --env-file=.env` (D-02), NOT `bun` — the documented Node exception.

### Comment / block-header style
**Source:** `apps-script/src/entry.ts` lines 1–23, `config.js` inline banners.
**Apply to:** `index.js` (dispatch contract), `auth.js`, sheet builders.
- Top-of-file block comment for entry/mechanism files explaining the design + the one-line-to-extend contract; inline `//` banners to group config. Explain non-obvious decisions inline (e.g. why `--update` never addresses the data region).

## No Analog Found

Files/concerns with no close match in the codebase — planner uses RESEARCH.md + `googleapis` docs + STRUCTURE.md/CONTEXT decisions instead:

| File / Concern | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `auth.js` (service-account JWT) | auth | request-response | No `googleapis`/JWT code exists anywhere in repo |
| Sheets API `batchUpdate` request shapes (in `index.js`, `dashboardSheet.js`, `dcaLogSheet.js`) | builder | batch | No existing Sheets API calls; request-object structure is greenfield |
| `--build` tab-existence guard logic (D-04) | orchestration | batch | No prior Sheets-read/guard code to copy |
| `.env` loading via `node --env-file` | config | n/a | First `.env` consumer; Bun auto-load doesn't apply to Node runtime |

## Metadata

**Analog search scope:** `layout-builder/`, `apps-script/src/`, `apps-script/scripts/`, repo-root configs (`assets.json`, `package.json`, `tsconfig.json`, `.gitignore`).
**Files scanned:** 11 source/config files (excluded `node_modules`, `.git`, `.planning`, `.claude` tooling).
**Pattern extraction date:** 2026-06-14
