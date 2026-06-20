# Phase 6: Realized PnL & Sell Log - Research

**Researched:** 2026-06-20
**Domain:** Google Sheets array formulas (date-bounded running averages), Sheets API v4 in-place sheet rename, layout-builder request-builder extension
**Confidence:** HIGH (formula construction MEDIUM-HIGH — verified against multiple Sheets references; rename + codebase integration HIGH — read directly from source)

## Summary

Phase 6 is almost entirely a **layout-builder formula/format problem plus one cross-runtime sheet rename**, with zero new data fetching. The work extends the SAME pure offline-testable request-builders in `layout-builder/src/dcaLogSheet.js` that Phase 5 already populated with BUY-only summary formulas, plus a one-line cross-runtime sheet-name change in `config.js` + `apps-script/src/Refresh.ts`/`Config.ts`, plus an explicit Sheets-API rename request in `index.js`.

The single highest-value finding (the CONTEXT.md D-02 flag) is **confirmed and resolved**: a plain `SUMIFS(...)` wrapped in `ARRAYFORMULA` does **NOT** expand per-row in Google Sheets — it collapses to a single scalar. This is the documented quirk CONTEXT.md warned about. The correct, robust construction for a per-SELL-row date-bounded BUY-weighted running average is **`BYROW(...LAMBDA(...))`** (or equivalently `MAP(...LAMBDA(...))`) wrapping a normal `SUMIFS`, anchored in the header cell (row 22) and spilling down `A23:A`. Both `SUMIFS` calls (NetCost and Qty) keep their `Type="BUY"` filter and gain a per-row `Date<="&date` criterion supplied by the LAMBDA parameter. This respects the never-write-the-data-region guard (single header-cell write) and is far more auditable than an MMULT criteria-matrix trick.

The sheet rename ("DCA Log" → "Transaction Log", D-07) has a **non-obvious integration hazard**: `index.js` resolves tabs **by title** (`getExistingTabs` → `tabs.get(DCA_LOG)`). Simply changing the `DCA_LOG` constant to the new title makes `--update` fail with "tab not found" on any spreadsheet that still has a tab named "DCA Log". The rename must be an **explicit `updateSheetProperties` request** that looks up the OLD title's sheetId and renames it in place (never delete+recreate), and the discovery/resolution logic must tolerate both the old and new title during the transition.

**Primary recommendation:** Add ONE helper column ("Realized", col J) whose header cell (row 22) holds a `BYROW(A23:A, LAMBDA(d, IF(d="","", <per-row realized expr>)))` spill formula; add per-asset realized summary columns via the existing `formulaRowRequest`/`SUMIFS` pattern; reuse the Phase 5 conditional-format helpers (moved/shared into `dcaLogSheet.js`) for the Realized $/% cells; and handle the tab rename as an explicit, old-title-aware `updateSheetProperties` request in `index.js`.

## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01 (At-sale snapshot cost basis):** Each SELL row's cost basis = `qty_sold × BUY-average as of that row's date` (running DCA average over BUY rows with `Date ≤ sell date`). Realized PnL = sum of per-row booked results. **Booked realized PnL is frozen once recorded** — re-buying after a sale does NOT retroactively change a past sale's realized PnL. (Chosen over "current BUY-avg" drift method and over FIFO lots — FIFO is not formula-expressible.)
- **D-02 (Spill helper column):** ONE new helper column to the RIGHT of `Notes` (col I) — proposed col **J, header "Realized"** — with a single `ARRAYFORMULA`-style spill formula in its **header cell (row 22, `TX_HEADER_ROW`, strictly above `DATA_START_ROW`=23)**. Spills a per-row realized figure down the data region: for each SELL row `(Total − Fee) − qty × avgCostAsOf(date)`; blank for BUY rows. Summary block per-asset Realized PnL `SUM`/`SUMIFS` over that helper column. **Single header-row write — respects never-write-the-data-region guard.** User agrees to NEVER type into the helper column.
- **D-03 (Summary-block-only):** Realized PnL lives ONLY in the Transaction Log summary block. **No Dashboard layout change** — Zone A NOT widened, status block / `refreshAll()` write targets from Phase 5 D-01 stay put.
- **D-04 (Net proceeds, fee-inclusive):** Realized per SELL row = `(Total − Fee) − qty × avgCostAsOf(date)`. Sell fee IS subtracted; symmetric with buy-fee-inclusive cost basis.
- **D-05 (Derive proceeds from Total − Fee):** SELL row user enters `Date · Asset · Type=SELL · Price · Qty · Total (gross proceeds) · Fee` — same fields as BUY. Helper computes net proceeds itself; does NOT depend on `Net Cost` (col H) for sells. `Net Cost` stays buy-oriented and may be blank on SELL rows. Phase 5's `Type="BUY"` filter shields BUY-only metrics from SELL rows — confirmed safe, do not weaken.
- **D-06 (Realized metrics):** Per asset: **Sold Qty** `SUMIFS(qty,…,SELL)`, **Net Proceeds** `SUMIFS(Total−Fee,…,SELL)`, **Realized PnL ($)**, **Realized PnL (%)** = `realized$ ÷ (soldQty × avgCostAsOf)`. Plus a single **portfolio Total Realized PnL** cell. All leaf cells `IFERROR(…,"—")`.
- **D-07 (Rename "DCA Log" → "Transaction Log"):** Cross-runtime contract change — update `layout-builder/src/config.js` `DCA_LOG` name AND Apps Script `Config`/`refreshAll()` reference **in lockstep**. `--update` MUST rename the existing tab **in place (never delete + recreate)** to preserve logged rows. Internal symbol/constant names may stay `DCA_LOG` (planner discretion); only the user-visible title must change.
- **Carry-forward (non-negotiable):** BUY-only avg-cost summary (Type="BUY" SUMIFS/COUNTIFS/MAXIFS) **untouched**. Realized PnL reads the existing Avg Cost cell as cost-basis source (single source of truth). `IFERROR(…,"—")` on every new cell. Reuse Phase 5 D-07 background-fill conditional formatting (green>0, red<0, none for 0/—) on new Realized PnL ($/%) cells; emit in BOTH `--build` and `--update` with idempotent clear/replace (no stacking). Open-ended `A{DATA_START_ROW}:A` ranges. `--update` re-applies formulas/formats/helper-column header formula and STILL never addresses the data region at/below `DATA_START_ROW`.

### Claude's Discretion

- Exact helper column letter/header text and exact new summary-column placement (lay out the summary band vs data band column overlap so it reads coherently).
- Exact `ARRAYFORMULA`/`SUMIFS`-with-date-bound A1 syntax for the date-bounded running average; `IFERROR` nesting; number-format strings (currency for $/proceeds, percent for %).
- Conditional-format threshold reuse vs new rule for realized cells.
- Whether internal constants keep the `DCA_LOG` name (only the visible tab title must change).
- How the rename + new formulas are sequenced across this phase's plans.

### Deferred Ideas (OUT OF SCOPE)

- **Data-validation dropdowns (Asset, Type) → PNL-06, v2.**
- **FIFO / per-lot cost-basis accounting** — rejected for v1 (not formula-expressible; would push compute into Apps Script).
- **Remove vestigial `apy` field from `assets.json`** — optional future cross-runtime cleanup.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PNL-05 | User can log SELL transactions in the (renamed) Transaction Log and see realized PnL per asset (sale proceeds vs DCA-weighted cost basis), without breaking the BUY-only avg-cost summary | The `BYROW`+`LAMBDA`+`SUMIFS` per-row date-bounded running-average construction (see Code Examples) computes realized PnL per SELL row in a single header-cell spill; D-06 summary metrics use the existing `SUMIFS`/`formulaRowRequest` pattern over the helper column + `Type="SELL"` filter; the BUY-only summary is untouched (separate `Type="BUY"` filter, confirmed orthogonal) |

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Per-SELL-row realized PnL computation | Spreadsheet formula (layout-builder writes it) | — | Lives entirely in the sheet as a spill formula; no runtime compute. Layout-builder only WRITES the formula string once into the header cell. |
| Per-asset realized summary metrics (Sold Qty, Net Proceeds, Realized $/%) | Spreadsheet formula (layout-builder writes it) | — | `SUMIFS` over the helper column + Type=SELL; same tier/pattern as Phase 5 BUY summary. |
| Helper-column header formula emission | layout-builder (`dcaLogSheet.js`, Node ESM) | — | Pure request-builder; single header-row `formulaValue` write. |
| Conditional formatting on Realized $/% cells | layout-builder (`dcaLogSheet.js`) | — | `addConditionalFormatRule` requests; pattern already exists in `dashboardSheet.js`, must be shared/duplicated into the DCA Log builder. |
| Tab rename "DCA Log" → "Transaction Log" | layout-builder (`index.js` orchestration + `config.js` constant) | Apps Script (`Config.ts`/`Refresh.ts` name reference) | The Sheets API rename is a layout-builder batchUpdate request; the Apps Script side only needs its hardcoded sheet-name string updated in lockstep (the rename is on the LOG tab, not the Dashboard tab `refreshAll` writes to — see Pitfall 3). |
| SELL data entry | User (manual, in the data region) | — | Out of scope for code; the never-write guard protects these rows. |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `googleapis` | already installed (layout-builder) | Sheets API v4 `spreadsheets.batchUpdate` for the rename + formula/format writes | Already the sole layout-builder dependency; the rename uses `updateSheetProperties` on the existing batchUpdate path — no new dependency. |
| Bun test runner (`bun:test`) | already in use | Offline unit tests for new formula strings / ranges / no-data-region assertions | Project convention (CLAUDE.md, `dcaLogSheet.test.js`). |

**No new packages are introduced by this phase.** All work uses existing dependencies and Google Sheets built-in functions (`BYROW`/`MAP`, `LAMBDA`, `SUMIFS`, `IFERROR`).

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `BYROW`/`MAP` + `LAMBDA` + `SUMIFS` spill | `ARRAYFORMULA` + `SUMIF` criteria-array (`Date,"<="&A23:A`) trick | `SUMIF` (single criterion) CAN expand inside ARRAYFORMULA, but Phase 6 needs TWO criteria per sum (Type=BUY AND Date≤row) — single-criterion SUMIF can't filter Type at the same time without a concatenation hack. `BYROW`/`MAP` keeps a clean two-criterion `SUMIFS` and is more readable. **Recommended over the SUMIF trick.** |
| `BYROW`/`MAP` + `LAMBDA` | `MMULT` criteria-matrix | MMULT works but is opaque/unauditable and harder to extend; CONTEXT.md explicitly favors the "simpler, more auditable" approach. Avoid. |
| Helper-column spill (D-02) | Single complex per-asset summary-cell array formula (no helper column) | Explicitly REJECTED in CONTEXT.md D-02 — the user chose the auditable per-row spill. |

**Installation:** None required.

## Package Legitimacy Audit

> Not applicable — this phase installs **no external packages**. All formula functions are Google Sheets built-ins; the only library (`googleapis`) is already present in `layout-builder/`.

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
                          layout-builder (Node ESM, local, on-demand)
                          ┌──────────────────────────────────────────────┐
  operator runs           │  index.js  --build | --update                 │
  node --env-file=.env ──▶│    │                                          │
  src/index.js --update   │    ├─ getExistingTabs() ── reads tab TITLES   │
                          │    │     (HAZARD: rename changes the title)    │
                          │    ├─ [NEW] resolve OLD title "DCA Log"        │
                          │    │     → updateSheetProperties rename ─────┐ │
                          │    ├─ dcaLogUpdateRequests(sheetId) ─────────┤ │
                          │    │     • summary BUY formulas (untouched)  │ │
                          │    │     • [NEW] realized summary SUMIFS     │ │
                          │    │     • [NEW] helper-col header BYROW     │ │
                          │    │     • [NEW] conditional-format rules    │ │
                          │    └─ batchUpdate ───────────────────────────┘ │
                          └───────────────────┬──────────────────────────┘
                                              │ Sheets API v4 (single batched write)
                                              ▼
                          ┌──────────────────────────────────────────────┐
                          │     Google Spreadsheet (sole integration       │
                          │     surface) — "Transaction Log" tab           │
                          │  ┌────────────────────────────────────────┐   │
                          │  │ rows 1..21  : summary band              │   │
                          │  │   per-asset: BUY metrics (Phase 5)      │   │
                          │  │   [NEW] per-asset: Sold Qty, Net        │   │
                          │  │         Proceeds, Realized $, Realized % │   │
                          │  │   [NEW] portfolio Total Realized cell    │   │
                          │  │ row 22      : TX header + [NEW] "Realized"│  │
                          │  │   header cell holds BYROW spill formula │   │
                          │  │ rows 23..∞  : user-entered TX data       │   │
                          │  │   col J spills realized per SELL row     │   │
                          │  │   ▲ NEVER written by builder (guard)     │   │
                          │  └────────────────────────────────────────┘   │
                          └───────────────────┬──────────────────────────┘
                                              │ (Dashboard tab — UNCHANGED, D-03)
                                              ▼
                          Apps Script refreshAll() writes Qty/Price/status
                          to the DASHBOARD tab only — NOT the Transaction Log.
                          Config.ts/Refresh.ts sheet-name string updated in
                          lockstep ONLY if it references the LOG tab (see Pitfall 3).
```

### Component Responsibilities

| File | Responsibility | Change in Phase 6 |
|------|----------------|-------------------|
| `layout-builder/src/dcaLogSheet.js` | DCA/Transaction Log structural band + summary formulas (pure request-builder) | Add realized summary columns (`formulaRowRequest`), the helper-column header `BYROW` formula, conditional-format rules; extend `SUMMARY_HEADERS`/`TX_HEADERS`; widen number-format ranges to new columns |
| `layout-builder/src/config.js` | `DCA_LOG` tab-name constant, `DATA_START_ROW`, `MAX_SUMMARY_ROWS` | Change `DCA_LOG` value to "Transaction Log" (keep internal symbol name if desired); add OLD-title constant for rename discovery |
| `layout-builder/src/index.js` | `--build`/`--update` orchestration; tab discovery by title | Add explicit rename step (old-title→new-title `updateSheetProperties`); make `--update` discovery tolerant of old title pre-rename |
| `layout-builder/src/dcaLogSheet.test.js` | Offline data-safety + formula assertions | Add assertions for realized formulas, helper-column header position (row 22, above 23), no-data-region addressing, conditional-format presence |
| `apps-script/src/Config.ts` / `Refresh.ts` | Apps Script sheet-name references | Update LOG-tab name string IF referenced (verify — `Refresh.ts` currently references only `"Dashboard"`, see Pitfall 3) |
| `layout-builder/src/dashboardSheet.js` | Dashboard structure | **READ-ONLY confirm NOT modified (D-03)** |

### Recommended Project Structure

No new files. All changes are in the existing `layout-builder/src/` files plus the Apps Script name reference. The conditional-format helpers currently live in `dashboardSheet.js` (`addConditionalFormatRuleRequest`, `deleteConditionalFormatRuleRequest`, `conditionalFormatRequests`, `MANAGED_RULE_COUNT`). Phase 6 needs them on the LOG tab too — planner's choice:
- **Option A (lowest churn):** Duplicate the small helper functions into `dcaLogSheet.js` with a LOG-tab-specific managed-rule count.
- **Option B (DRY):** Extract the conditional-format request helpers into a shared module (e.g. `conditionalFormat.js`) imported by both sheet builders. Cleaner but more churn. **Recommend Option A** to minimize risk in a data-loss-sensitive phase.

### Pattern 1: Per-row date-bounded running average via BYROW + LAMBDA + SUMIFS

**What:** Compute, for each data row, a BUY-weighted running average over BUY rows dated `≤` that row's date, then book realized PnL only on SELL rows. Spills from a single header cell.

**When to use:** This is THE construction for the D-02 helper column. Use `BYROW` (returns a 1-column array, auto-spills) wrapping a normal multi-criteria `SUMIFS`.

**Why not plain ARRAYFORMULA(SUMIFS):** `SUMIFS` does NOT expand per-row inside `ARRAYFORMULA` — it collapses to a single scalar `[VERIFIED: multiple Google Sheets references — see Sources]`. `SUMIF` (single criterion) does expand, but Phase 6 needs two criteria (Type=BUY AND Date≤row), so `BYROW`/`MAP` + `SUMIFS` is the correct tool.

### Anti-Patterns to Avoid

- **`=ARRAYFORMULA(SUMIFS(...))` for per-row results** — collapses to one scalar; silent wrong answer (one value repeated or a single sum). This is the exact trap CONTEXT.md flagged.
- **Renaming the tab by changing the constant only** — `index.js` resolves by title; `--update` then fails "tab not found" on existing sheets. Must add an explicit rename request keyed on the OLD title.
- **Delete + recreate the tab to rename** — irreversible data loss; CONTEXT.md D-07 and Phase 2 D-06 forbid it. Use `updateSheetProperties` with `fields:"title"`.
- **Writing realized values into the data region** — the helper must be a SINGLE header-cell (row 22) spill; never a per-row `updateCells` over rows ≥ 23.
- **Weakening the Phase 5 `Type="BUY"` filter** — would let SELL rows corrupt the BUY-only summary. Keep BUY and SELL filters strictly separate.
- **Stacking conditional-format rules on `--update`** — must pre-clear managed rules (descending index) before re-adding, per the existing `dashboardSheet.js` pattern.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Per-row running average over open-ended range | Custom Apps Script loop / per-row formula writes | `BYROW(A23:A, LAMBDA(...))` single-cell spill | Per-row writes would address the protected data region; Apps Script compute violates D-02's "stays in the sheet" intent |
| Multi-criteria array sum | MMULT criteria matrix or string-concatenation SUMIF hack | `BYROW`/`MAP` + `SUMIFS` | Readable, auditable, two-criteria-native (CONTEXT.md preference) |
| Sheet rename | delete tab + addSheet + re-stamp | `updateSheetProperties` `fields:"title"` | Field-mask rename preserves ALL cell data `[VERIFIED: developers.google.com batchUpdate guide]`; delete+recreate is irreversible data loss |
| Conditional-format idempotency | Re-add rules every run | Pre-clear managed indices (descending) then re-add | Naive re-add STACKS duplicate rules (existing project pattern, `dashboardSheet.js`) |

**Key insight:** The hard part of this phase is NOT the math — it's keeping every write strictly above `DATA_START_ROW` (row 23) while still producing a per-row spill into the data region, and renaming a tab whose identity the orchestrator currently derives from its (changing) title. Both are solved by Sheets primitives, not custom code.

## Runtime State Inventory

> This phase includes a **rename** (D-07), so the inventory is required.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | The "DCA Log" tab holds user-entered transaction rows (rows ≥ 23). The tab is being RENAMED, not its data. No cell keys/IDs embed the string "DCA Log". | Rename in place via `updateSheetProperties` (data preserved by field-mask semantics). NO data migration — code-side rename only. |
| Live service config | Apps Script `Refresh.ts` references sheet name `"Dashboard"` (hardcoded `DASHBOARD_SHEET = "Dashboard"`) — it does **NOT** reference the LOG tab at all (it writes Qty/Price/status to the Dashboard only). `Config.ts` defines asset registry + refresh constants, **no sheet-name reference to the LOG tab**. | **Verify during planning:** grep Apps Script `src/` for any `"DCA Log"` / `getSheetByName` referencing the log tab. Current read shows NONE — the Apps Script lockstep change in D-07 may be a **no-op** because `refreshAll()` never touches the log tab. If a reference exists elsewhere (e.g. a not-yet-read file), update it. (See Pitfall 3.) |
| OS-registered state | None — no OS-level registration embeds the sheet name. | None — verified by inspection (Apps Script trigger registers `refreshAll`, a function name, not a sheet name). |
| Secrets/env vars | `SPREADSHEET_ID` (env), `JUP_API_KEY` (Script Property), wallet addresses (Script Properties). None reference the sheet/tab name "DCA Log". | None. |
| Build artifacts | `apps-script/dist/Code.js` is the inlined bundle; if any Apps Script source string references the log tab it must be re-built + `clasp push --force` (per STATE.md 04-03 note). | IF an Apps Script source reference exists: `bun build` → `clasp push --force`. If none (likely), no Apps Script rebuild needed for the rename. |

**Canonical question — after every repo file is updated, what runtime systems still have "DCA Log" cached/stored/registered?** The Google Sheet tab itself (renamed in place by `updateSheetProperties`) and — only if a not-yet-inspected Apps Script source references it — `dist/Code.js`. `Refresh.ts`/`Config.ts` as read do NOT reference the log tab. Verify with a grep during planning.

## Common Pitfalls

### Pitfall 1: ARRAYFORMULA(SUMIFS) silently collapses to a scalar
**What goes wrong:** Wrapping `SUMIFS` in `ARRAYFORMULA` returns ONE value (not a per-row column). The helper column shows the same number on every row, or a single value in the header cell with nothing spilling.
**Why it happens:** `SUMIFS` is not array-aware over its criteria the way `SUMIF` is; `ARRAYFORMULA` cannot vectorize it per-row.
**How to avoid:** Use `BYROW(A23:A, LAMBDA(d, IF(d="","", ...SUMIFS(...,"<="&d)...)))` so each row's date `d` is fed individually into a scalar `SUMIFS`. `BYROW` returns the 1-column array that spills.
**Warning signs:** Same realized value repeated down the column; or a `#REF!`/single-cell result instead of a spill.

### Pitfall 2: Tab rename breaks title-based discovery in `index.js`
**What goes wrong:** After setting `DCA_LOG = "Transaction Log"`, running `--update` on an existing spreadsheet (tab still named "DCA Log") throws `--update requires existing tab(s): Transaction Log not found`. The rename never happens because discovery fails first.
**Why it happens:** `index.js` `getExistingTabs()` builds a `title → sheetId` map and `runUpdate` does `tabs.get(DCA_LOG)` (the NEW title), which is absent until after the rename.
**How to avoid:** In `--update`, look up the tab by BOTH the new title and the OLD title ("DCA Log"); if found under the old title, emit an `updateSheetProperties` rename request FIRST (in the same or a preceding batch), then resolve the sheetId for the structural requests. Make it idempotent: if already renamed, skip the rename. Keep an explicit `DCA_LOG_LEGACY = "DCA Log"` constant for the transition.
**Warning signs:** `--update` fails immediately on a previously-built sheet; or the rename request targets a sheetId resolved from the new (absent) title.

### Pitfall 3: Assuming the Apps Script lockstep change is required when it may be a no-op
**What goes wrong:** Planner schedules an Apps Script `Config.ts`/`Refresh.ts` edit + rebuild + `clasp push --force` for the rename, but `refreshAll()` only ever references `DASHBOARD_SHEET = "Dashboard"` — it never reads/writes the log tab. The "lockstep" edit has nothing to change, and an unnecessary `clasp push` adds risk (manifest-prompt issue from STATE.md 04-03).
**Why it happens:** D-07 says "update the Apps Script Config/refreshAll sheet-name reference in lockstep" — but the current code has no such reference to the LOG tab.
**How to avoid:** Grep `apps-script/src/` for `"DCA Log"` and any `getSheetByName`/sheet-name string referencing the log tab. If none (as the read of `Refresh.ts`/`Config.ts` shows), document that the Apps Script side needs NO change and skip the rebuild. If a reference exists in a file not yet inspected, update it and rebuild/push.
**Warning signs:** A planned Apps Script edit with no actual string to change; an unnecessary `clasp push` step.

### Pitfall 4: Realized % denominator double-counts the date-bounded average
**What goes wrong:** The per-row helper already bakes in `qty × avgCostAsOf(date)`. If the summary `Realized %` recomputes a denominator using the CURRENT BUY-avg cell (Phase 5) instead of the per-row at-sale cost, the % drifts after re-buys — contradicting D-01's frozen-realized intent.
**Why it happens:** D-06 says `% = realized$ ÷ (soldQty × avgCostAsOf)` — but "avgCostAsOf" is per-SELL-row, not the single current Avg Cost cell. A naive `realized$ ÷ (SoldQty × CurrentAvgCost)` is wrong for multi-date sells.
**How to avoid:** Compute the cost basis of sold units as a SECOND helper-column expression (e.g. `qty × avgCostAsOf(date)` per SELL row, or derive it as `NetProceeds − Realized$` since `realized = proceeds − costBasis ⇒ costBasis = proceeds − realized`). Then `Realized % = SUMIFS(realized$) ÷ SUMIFS(costBasis)`. **Simplest:** `costBasisSold = NetProceeds − Realized$`, so `% = TotalRealized$ ÷ (NetProceeds − TotalRealized$)`, avoiding a second helper column entirely. Planner should pick and document the exact denominator.
**Warning signs:** Realized % changes when the user adds a BUY after a sale; % inconsistent with $ for an asset sold across multiple dates.

### Pitfall 5: Helper column overlaps the summary band columns
**What goes wrong:** The summary band occupies columns starting at A across rows 2..21; the new realized SUMMARY metric columns and the data-region helper column ("Realized", col J) share the same sheet. If the summary metrics extend into col J, they collide with the spill helper's header cell at row 22 / data spill below.
**Why it happens:** Summary band and data band are the same columns, different rows. The spill helper anchors at row 22 col J; summary metrics anchor at rows 2..21 in whatever columns the planner picks.
**How to avoid:** The "Realized" spill helper header MUST be at row 22 (TX_HEADER_ROW) in its column (J). The summary realized metric columns (rows 2..21) can reuse columns that are blank in the summary band or extend rightward — but ensure the spill helper's column at row 22 carries the `BYROW` formula and rows 2..21 of that same column are either blank or carry a coherent summary value. Lay out so the row-22 boundary is the only place the helper formula lives. (CONTEXT.md flags this as Claude's discretion — document the final column map.)
**Warning signs:** A summary formula and the spill formula targeting the same cell; `#REF!` spill-blocked errors ("Array result was not expanded because it would overwrite data").

## Code Examples

> These are CONSTRUCTION TEMPLATES verified against Google Sheets formula semantics (see Sources). Exact column letters/A1 refs are Claude's discretion — adapt to the final column map. The formulas live INSIDE `formulaValue` strings emitted by `dcaLogSheet.js`; the request range is always the single header cell (row 22), never the data region.

### Helper-column header formula (D-02) — per-row date-bounded realized PnL

```javascript
// Source: BYROW + LAMBDA + SUMIFS construction (Google Sheets array-formula semantics,
// see Sources). Emitted into the row-22 header cell of the "Realized" helper column (col J).
// Columns: Date=A, Asset=B, Type=C, Price=D, Qty=E, Total=F, Fee=G, Net Cost=H, Notes=I.
// dataAnchor = DATA_START_ROW (23).
//
// For each data row d (a date in col A):
//   - blank row            -> ""   (trailing empty rows stay clean)
//   - BUY row              -> ""   (only SELL rows book realized)
//   - SELL row             -> (Total - Fee) - Qty * avgCostAsOf(date)
//     where avgCostAsOf = SUMIFS(NetCost, Type=BUY, Date<=d) / SUMIFS(Qty, Type=BUY, Date<=d)
//
// BYROW iterates the open-ended A23:A; the LAMBDA receives one row's cells so SUMIFS runs
// scalar (NOT the ARRAYFORMULA(SUMIFS) trap). IFERROR guards the divide-by-zero for a SELL
// dated before any BUY (no cost basis yet) -> "—".

const a = DATA_START_ROW; // 23
const realizedHeaderFormula =
  `=BYROW(A${a}:A, LAMBDA(rowDate, ` +
    `IFS(` +
      `rowDate="", "", ` +                                   // blank/trailing row
      `INDEX(C${a}:C, MATCH(rowDate, A${a}:A, 0))<>"SELL", "", ` + // BUY (or non-SELL) row -> blank
      `TRUE, IFERROR(` +
        // net proceeds  (Total - Fee) for this SELL row
        `(INDEX(F${a}:F, MATCH(rowDate, A${a}:A, 0)) - INDEX(G${a}:G, MATCH(rowDate, A${a}:A, 0))) ` +
        `- INDEX(E${a}:E, MATCH(rowDate, A${a}:A, 0)) ` +    // qty sold
          // * avgCostAsOf(date): BUY-weighted running average over Date<=rowDate
          `* ( SUMIFS(H${a}:H, C${a}:C, "BUY", A${a}:A, "<="&rowDate) ` +
          `  / SUMIFS(E${a}:E, C${a}:C, "BUY", A${a}:A, "<="&rowDate) ), ` +
        `"—") ` +
    `)` +
  `))`;
```

> **Planner note — INDEX/MATCH-by-date caveat:** the template above keys per-row lookups on the row's DATE via `MATCH(rowDate, A:A, 0)`, which returns the FIRST matching date. If two transactions share an exact date, this mis-keys. **Prefer the cleaner form:** pass the WHOLE row to the LAMBDA so cells are read positionally, e.g.
> ```
> =BYROW(A{a}:I{a}, LAMBDA(r, LET(
>     d, INDEX(r,1,1), ty, INDEX(r,1,3), q, INDEX(r,1,5), tot, INDEX(r,1,6), fee, INDEX(r,1,7),
>     IF(d="","",
>       IF(ty<>"SELL","",
>         IFERROR((tot-fee) - q * (
>           SUMIFS(H{a}:H, C{a}:C,"BUY", A{a}:A,"<="&d) /
>           SUMIFS(E{a}:E, C{a}:C,"BUY", A{a}:A,"<="&d)
>         ),"—")))))
> ```
> This avoids the duplicate-date MATCH problem entirely (each row's own cells are used) and is the **recommended construction**. `BYROW` over `A{a}:I{a}` still spills a single column. Note `BYROW` needs a bounded-width input (`A:I`), not `A:A`, when reading multiple columns per row.

### Per-asset realized summary metrics (D-06) — over the helper column

```javascript
// Source: existing dcaLogSheet.js formulaRowRequest / SUMIFS pattern (Phase 5), extended.
// Helper "Realized" column = J. Summary row for an asset at `row`, asset id in $A{row}.
const a = DATA_START_ROW; // 23
const r = `$A${row}`;                               // this summary row's asset id
const sellFilter = `$C$${a}:$C,"SELL"`;
const assetFilter = `$B$${a}:$B,${r}`;

const soldQty     = `SUMIFS($E$${a}:$E,${assetFilter},${sellFilter})`;
const netProceeds = `SUMIFS($F$${a}:$F,${assetFilter},${sellFilter}) - SUMIFS($G$${a}:$G,${assetFilter},${sellFilter})`;
// Realized $ : SUM the helper column for this asset's SELL rows.
const realizedDollars = `SUMIFS($J$${a}:$J,${assetFilter},${sellFilter})`;
// Realized % : realized$ / costBasisSold, where costBasisSold = netProceeds - realized$.
const realizedPct = `${realizedDollars} / ( ${netProceeds} - ${realizedDollars} )`;

const realizedFormulas = [
  `=IFERROR(${soldQty},"—")`,
  `=IFERROR(${netProceeds},"—")`,
  `=IFERROR(${realizedDollars},"—")`,
  `=IFERROR(${realizedPct},"—")`,
];
// emit via formulaRowRequest(sheetId, row, <startColForRealizedBlock>, realizedFormulas);
```

### Portfolio Total Realized PnL cell (D-06)

```javascript
// SUM of per-asset Realized $ cells (text "—" is skipped by SUM). Place in the summary
// totals area (NOT the Dashboard, D-03). Example over the realized-$ summary column X, rows 2..1+N:
const totalRealized = `=IFERROR(SUM($X$${FIRST_SUMMARY_ROW}:$X$${1 + assetList.length}),"—")`;
```

### In-place tab rename (D-07) — explicit, old-title-aware

```javascript
// Source: developers.google.com Sheets API batchUpdate guide (UpdateSheetPropertiesRequest +
// field mask "title"); renaming preserves ALL cell data. Add to index.js runUpdate.
import { DCA_LOG, DASHBOARD } from "./config.js";       // DCA_LOG === "Transaction Log" (new)
const DCA_LOG_LEGACY = "DCA Log";                       // OLD title, for transition discovery

// resolve the log sheetId by NEW then OLD title (idempotent across reruns)
let logId = tabs.get(DCA_LOG);
const requests = [];
if (logId === undefined) {
  const legacyId = tabs.get(DCA_LOG_LEGACY);
  if (legacyId === undefined) {
    throw new Error(`--update requires the log tab ("${DCA_LOG}" or "${DCA_LOG_LEGACY}").`);
  }
  // rename in place — preserves data (field-mask semantics). NEVER delete+recreate.
  requests.push({
    updateSheetProperties: {
      properties: { sheetId: legacyId, title: DCA_LOG },
      fields: "title",
    },
  });
  logId = legacyId;
}
// ...then push dcaLogUpdateRequests(logId) etc. into the same/subsequent batch.
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `ARRAYFORMULA(SUMIF(...))` criteria-array trick for per-row sums | `BYROW`/`MAP` + `LAMBDA` + `SUMIFS` | LAMBDA helper functions GA in Google Sheets (Aug 2022) | Multi-criteria per-row sums are now clean and readable; no MMULT/concatenation hacks needed |
| MMULT criteria matrix for conditional running totals | `BYROW`/`SCAN`/`MAP` LAMBDA helpers | 2022+ | Auditable, maintainable formulas (matches CONTEXT.md preference) |

**Deprecated/outdated:**
- MMULT criteria-matrix running totals: still work but superseded by LAMBDA helpers for readability. Avoid for this phase.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `BYROW` over an open-ended `A23:A` (or `A23:I`) input spills only as far as populated rows and emits `""` for trailing blanks given the `IF(d="","")` guard | Code Examples, Pitfall 1 | If `BYROW` errors on fully-empty open ranges, the planner may need a bounded range or an `IFERROR`/`FILTER` guard. Mitigation: test on the live sheet during execution; the `IF(d="","")` first-branch is the standard blank guard. |
| A2 | The Apps Script side (`Config.ts`/`Refresh.ts`) has NO reference to the log tab name, making the D-07 "lockstep" Apps Script edit a likely no-op | Runtime State Inventory, Pitfall 3 | If a reference exists in an un-read Apps Script file, the rename would desync the Apps Script view. Mitigation: planner MUST grep `apps-script/src/` for `"DCA Log"`/`getSheetByName` before finalizing — explicitly called out as a verification task. |
| A3 | `costBasisSold = NetProceeds − Realized$` is an algebraically valid denominator for Realized % (since realized = proceeds − costBasis) | Pitfall 4, Code Examples | If the user expects % relative to a different denominator (e.g. gross proceeds), the % is "wrong" by their definition. Mitigation: D-06 specifies `soldQty × avgCostAsOf` — the algebraic identity matches it; document the chosen form. |
| A4 | Number-format ranges can be widened to the new realized summary columns + helper column header WITHOUT addressing the data region (endRowIndex ≤ 22) | Architecture / number formats | If a format range accidentally extends to ≥ row 23 it violates the guard. Mitigation: the existing `numberFormatRequest` + test assertion (`endRowIndex ≤ DATA_START_ROW_0BASED`) already catches this. |

## Open Questions

1. **Does `BYROW` over a fully-bounded `A23:I` (vs `A23:A`) change the spill behavior for the realized column?**
   - What we know: `BYROW` returns a 1-column array; reading multiple columns per row requires a multi-column input range (`A23:I`).
   - What's unclear: exact spill length over an open-ended `A23:I` with many trailing blanks — Sheets may spill to the last non-empty row of the whole range.
   - Recommendation: use the whole-row `BYROW(A23:I, LAMBDA(r, ...))` form (recommended construction) and verify spill length on the live sheet in an execution checkpoint; the `IF(d="","")` guard keeps trailing rows blank.

2. **Where exactly do the realized summary columns sit relative to the Phase 5 BUY summary columns?** (Claude's discretion, D-06.)
   - What we know: BUY summary occupies cols B..G (rows 2..21). Helper "Realized" is col J at row 22+.
   - What's unclear: which columns hold Sold Qty / Net Proceeds / Realized $ / Realized % in the summary band.
   - Recommendation: place the 4 realized metrics in contiguous columns to the right of the BUY summary (e.g. H..K in the summary band), keeping col J's row-22 spill formula coherent; document the final map in the plan and assert it in tests.

3. **Is an Apps Script rebuild+push actually needed for the rename?** (Tied to A2.)
   - What we know: `Refresh.ts` references only `"Dashboard"`.
   - What's unclear: whether any other Apps Script source references the log tab.
   - Recommendation: grep first; only rebuild+`clasp push --force` if a reference is found.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `googleapis` (layout-builder) | Sheets API batchUpdate (rename + writes) | ✓ (already installed) | as in `layout-builder/package.json` | — |
| Bun | `bun test` for offline unit tests | ✓ | latest (mise) | — |
| Node | layout-builder runtime | ✓ | latest (mise) | — |
| Google Sheets `BYROW`/`LAMBDA`/`SUMIFS` | The realized spill formula | ✓ (Sheets built-ins, GA since 2022) | n/a | MMULT/SUMIF-array (less readable) |
| `clasp` | Apps Script push (ONLY if Apps Script source changes) | ✓ (used in Phase 4) | 3.3.0 | — (likely not needed — see A2) |

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** none blocking — the formula has fallback constructions if `BYROW` misbehaves.

## Security Domain

> `security_enforcement` not disabled in config — section included. This phase adds NO network calls, NO secrets, NO new external input surface. It writes formulas/formats and renames a tab via the already-authenticated service-account path.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | No new auth surface; reuses service-account JWT (`auth.js`) |
| V3 Session Management | no | N/A (batch tool) |
| V4 Access Control | yes (existing) | Read/write limited to the shared spreadsheet via service-account Editor share; all chain/exchange access remains read-only (unchanged) |
| V5 Input Validation | partial | The realized formulas consume USER-entered cells (Total/Fee/Qty/Date/Type). Malformed entries (text in numeric cells, bad dates) must degrade to `"—"` via `IFERROR`, never `#VALUE`-cascade. This is the de-facto validation control. |
| V6 Cryptography | no | No crypto; no private keys (hard project boundary) |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Builder accidentally writes/clears user transaction rows (data loss) | Tampering / DoS | Never-write-the-data-region guard: every emitted range `endRowIndex ≤ 22`; the existing `dcaLogSheet.test.js` critical assertion enforces it. Extend the assertion to the new realized formulas/formats. |
| Rename via delete+recreate wipes logged transactions | Tampering | `updateSheetProperties` field-mask rename (data preserved); explicit test that no `addSheet`/`deleteSheet` is emitted for the log tab on `--update`. |
| Malformed user cell `#VALUE`-cascades through realized math | DoS (display) | `IFERROR(…,"—")` on every leaf + the `IF(d="","")` blank guard in the spill. |

## Sources

### Primary (HIGH confidence)
- developers.google.com/workspace/sheets/api/guides/batchupdate — `UpdateSheetPropertiesRequest` JSON + `fields:"title"` mask; rename preserves cell data `[CITED]`
- developers.google.com/workspace/sheets/api/guides/field-masks — field-mask semantics (unspecified fields left unchanged) `[CITED]`
- Existing codebase (read directly): `layout-builder/src/dcaLogSheet.js`, `config.js`, `index.js`, `dcaLogSheet.test.js`, `dashboardSheet.js` (conditional-format helpers), `apps-script/src/Refresh.ts`, `Config.ts` `[VERIFIED: codebase grep/read]`

### Secondary (MEDIUM confidence)
- benlcollins.com/spreadsheets/byrow-function/ — `BYROW` returns a 1-column spill array `[CITED]`
- infoinspired.com (SUMIFS array-formula expanding; SUMIF ARRAYFORMULA; array running totals) — confirms `ARRAYFORMULA(SUMIFS)` does NOT expand per-row; MAP+LAMBDA converts SUMIFS to a per-row array; SUMIF-criteria-array running-total pattern `[CITED]`
- benlcollins.com/spreadsheets/running-total/ — array running-total constructions `[CITED]`

### Tertiary (LOW confidence)
- General LAMBDA-helper availability (GA Aug 2022) — training knowledge, broadly corroborated by the above `[ASSUMED]`

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new packages; all built-ins/existing deps verified against installed code.
- Architecture / integration: HIGH — read directly from source; the rename hazard and Apps Script no-op are grounded in the actual `index.js`/`Refresh.ts` code.
- Realized formula construction: MEDIUM-HIGH — the `ARRAYFORMULA(SUMIFS)` collapse and the `BYROW`/`MAP`+`LAMBDA`+`SUMIFS` fix are confirmed by multiple Sheets references; exact spill behavior over open-ended ranges flagged for a live-sheet execution checkpoint (A1).
- Pitfalls: HIGH — derived from the actual code paths (title-based discovery, conditional-format stacking, data-region guard) plus the verified formula quirk.

**Research date:** 2026-06-20
**Valid until:** 2026-07-20 (stable domain — Sheets formula semantics and API are slow-moving; codebase facts valid until the files change)
