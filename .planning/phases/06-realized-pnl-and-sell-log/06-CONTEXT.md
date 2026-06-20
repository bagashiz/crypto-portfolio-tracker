# Phase 6: Realized PnL & Sell Log - Context

**Gathered:** 2026-06-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Add **SELL semantics** to the transaction log and surface **realized PnL per asset**
(net sale proceeds − DCA-weighted cost basis of the units sold) in the Transaction Log
summary block — extending the SAME `layout-builder/` request-builders
(`dcaLogSheet.js`, `config.js`, and the cross-runtime sheet-name contract) without
breaking Phase 5's **BUY-only average-cost summary block** and without ever writing the
protected transaction data region (rows ≥ `DATA_START_ROW` = 23). Covers PNL-05.

**This phase does NOT:** change the Dashboard layout (realized PnL is summary-block-only,
D-03 — no Zone A widening, no second status-block/`refreshAll` shift); alter the BUY-only
avg-cost/unrealized-PnL formulas from Phase 5 (hard guard from the ROADMAP goal); add
data-validation dropdowns (PNL-06, v2); fetch any new data (no Apps Script provider
changes — but the **sheet rename** does touch Apps Script `Config`/`refreshAll`, see D-07).

</domain>

<decisions>
## Implementation Decisions

### Cost-basis method for realized PnL
- **D-01 (At-sale snapshot):** Each SELL row's cost basis is `qty_sold × BUY-average as of
  that row's date` (the running DCA average computed over BUY rows with `Date ≤ sell date`).
  Realized PnL is the sum of these per-row booked results. **Booked realized PnL is frozen
  once recorded** — buying more of the asset *after* a sale does NOT retroactively change a
  past sale's realized PnL. (This was explicitly chosen over the simpler "current BUY-avg"
  method, whose realized figure drifts when you re-buy, and over FIFO lots, which isn't
  formula-expressible. The user understood and rejected the drift behavior.)

### Where the per-sell-row running cost basis is computed
- **D-02 (Spill helper column):** Add ONE new helper column **to the right of `Notes` (col I)**
  — proposed col **J, header "Realized"** — and place a single `ARRAYFORMULA` in its **header
  cell (row 22, `TX_HEADER_ROW`, strictly above `DATA_START_ROW`=23)** that spills a per-row
  realized figure down the data region: for each SELL row, `(Total − Fee) − qty ×
  avgCostAsOf(date)`; blank for BUY rows. The summary block's per-asset Realized PnL then
  `SUM`/`SUMIFS` over that helper column. **This is a single header-row write (not per-row),
  so it respects the never-write-the-data-region guard** (Phase 2 D-06 / Phase 5 carry-forward).
  The user agrees to **never type into the helper column** (typing breaks the spill).
  - **Researcher/planner flag:** validate the `ARRAYFORMULA` can express a date-bounded
    running average per row over open-ended `A23:A` ranges in Google Sheets (likely needs a
    `SUMIFS(..., Date, "<="&Date_row)` style per-row expression). The pure-summary-cell
    "array formula only, no helper column" alternative was explicitly **rejected** in favor of
    this simpler, more auditable per-row spill approach.

### Dashboard surfacing
- **D-03 (Summary-block-only):** Realized PnL lives ONLY in the Transaction Log summary block
  (new per-asset columns + a portfolio total cell, see D-06). **No Dashboard layout change** —
  Zone A is NOT widened, the relocated status block and `refreshAll()` write targets from
  Phase 5 D-01 **stay put** (no second round of column churn).

### Fees treatment
- **D-04 (Net proceeds, fully fee-inclusive):** Realized per SELL row =
  `(Total − Fee) − qty × avgCostAsOf(date)`. The **sell fee IS subtracted** from proceeds.
  This is symmetric with the cost-basis side, which already includes **buy fees** (Phase 5
  `Total Invested = SUMIFS(Net Cost, BUY)` bakes in the buy fee). Net result: realized PnL =
  what you actually netted vs what you actually paid, fees on both sides.

### SELL row data-entry convention
- **D-05 (Derive proceeds from Total − Fee):** For a SELL row the user enters
  `Date · Asset · Type=SELL · Price · Qty · Total (gross proceeds) · Fee` — the **same fields
  as a BUY**. The realized helper (D-02) computes net proceeds = `Total − Fee` itself, so it
  does **not** depend on the `Net Cost` column for sells. `Net Cost` (col H) stays
  buy-oriented (amount paid) and may be left **blank on SELL rows**. Phase 5's `Type="BUY"`
  filter already shields the BUY-only summary metrics from SELL rows — confirmed safe, do not
  weaken that filter.

### Realized metrics in the summary block
- **D-06 (Per-asset + portfolio total + %):** The Transaction Log summary block gains, per
  asset: **Sold Qty** (`SUMIFS(qty, …, SELL)`), **Net Proceeds** (`SUMIFS(Total−Fee, …,
  SELL)`), **Realized PnL ($)**, and **Realized PnL (%)** (`realized$ ÷ (soldQty × avgCostAsOf)`).
  Plus a single **portfolio Total Realized PnL** cell (`SUM` of per-asset realized $) in the
  summary totals area (NOT on the Dashboard, per D-03). All leaf cells `IFERROR(…,"—")`.

### Sheet rename (cross-runtime)
- **D-07 ("DCA Log" → "Transaction Log"):** Rename the tab now that it holds both BUY and
  SELL rows. This is a **cross-runtime contract change** — update `layout-builder/src/config.js`
  `DCA_LOG` name constant AND the Apps Script `Config`/`refreshAll()` sheet-name reference **in
  lockstep**. The layout builder's `--update` path MUST **rename the existing tab in place
  (never delete + recreate)** so logged transaction rows are preserved (irreversible-data-loss
  guard). Internal symbol/constant names may stay `DCA_LOG` if churn-reduction warrants — only
  the user-visible sheet title must change; planner's discretion on internal naming.

### Carry-forward (non-negotiable from Phase 5 / Phase 2)
- BUY-only avg-cost summary (Type="BUY" `SUMIFS`/`COUNTIFS`/`MAXIFS`) is **untouched** — the
  ROADMAP goal's hard guard. Realized PnL reads the existing Avg Cost cell as its cost-basis
  source (single source of truth, no duplicated SUMIF).
- `IFERROR(…, "—")` em-dash empty state on every new leaf/aggregate cell.
- Reuse Phase 5 D-07 **background-fill** conditional formatting (green > 0, red < 0, none for
  0/—) on the new Realized PnL ($/%) cells; rules emitted in BOTH `--build` and `--update`
  with idempotent clear/replace (no stacking).
- Open-ended `A{DATA_START_ROW}:A` ranges (Phase 2 D-07) for all new formulas.
- `--update` re-applies formulas/formats/the helper-column header formula and STILL never
  addresses the data region at/below `DATA_START_ROW` (Phase 2 D-06).

### Claude's Discretion
- Exact helper column letter/header text and exact new summary-column placement (the summary
  metrics occupy top-band rows 2..1+N; the spill helper occupies the data-region rows of the
  same sheet — lay them out so the column overlap between the summary band and the data band
  reads coherently).
- Exact `ARRAYFORMULA` / `SUMIFS`-with-date-bound A1 syntax for the date-bounded running
  average; `IFERROR` nesting; number-format strings (currency for $/proceeds, percent for %).
- Conditional-format threshold reuse vs new rule for realized cells.
- Whether internal constants keep the `DCA_LOG` name (only the visible tab title must change).
- How the rename + new formulas are sequenced across this phase's plans.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase requirements & boundaries
- `.planning/REQUIREMENTS.md` — **PNL-05** (Realized PnL from SELL transactions, promoted to
  v1, Phase 6); confirms the BUY-only avg-cost summary must not break. PNL-06 (dropdowns) is v2.
- `.planning/ROADMAP.md` §"Phase 6: Realized PnL & Sell Log" — goal + scope note (SELL
  semantics split out of Phase 5 to keep the data-loss-sensitive layout work focused).
- `.planning/PROJECT.md` — Constraints (idempotency / no-data-loss, two-runtime boundary),
  Key Decisions (single-source-of-truth avg cost, single batched write).

### Phase 5 — the BUY-only layer this phase extends (read before touching summary formulas)
- `.planning/phases/05-pnl-allocation/05-CONTEXT.md` — D-03 (AvgCost single source of truth),
  **D-04 (BUY-only cost basis, accepted live-qty divergence)**, D-06 (IFERROR em-dash), D-07
  (background-fill conditional formatting), idempotency/data-safety carry-forward.

### Sheet structure & data-region safety
- `.planning/phases/02-layout-builder/02-CONTEXT.md` — Phase 2 D-06 (never write/clear data
  region) and D-07 (open-ended ranges) — the irreversible-data-loss guard this phase must honor.
- `.planning/codebase/STRUCTURE.md` §"Spreadsheet Structure" — DCA/Transaction Log + summary
  band layout (column maps superseded by D-01/D-05/D-06 here and Phase 5 D-01).

### Existing code to extend
- `layout-builder/src/dcaLogSheet.js` — `bandRequests()`, `SUMMARY_HEADERS`, `TX_HEADERS`,
  `FIRST_SUMMARY_ROW`, `TX_HEADER_ROW`, `formulaRowRequest`, BUY-only `SUMIFS` summary
  formulas. Phase 6 adds the realized metric columns + the helper-column header `ARRAYFORMULA`
  here, and updates `TX_HEADERS`/`SUMMARY_HEADERS`.
- `layout-builder/src/config.js` — `DATA_START_ROW` (23), `MAX_SUMMARY_ROWS` (20), `DCA_LOG`
  (rename target, D-07), `assets.json` import.
- `apps-script/src/Config.ts` + `apps-script/src/Refresh.ts` — sheet-name reference for the
  renamed tab (D-07); `refreshAll()` write targets are otherwise unchanged (D-03 keeps the
  Dashboard layout fixed).
- `layout-builder/src/dashboardSheet.js` — **read only to confirm it is NOT modified** (D-03).
- `.planning/codebase/CONVENTIONS.md` — `layout-builder/` is ESM Node, camelCase filenames,
  pure offline-testable request-builders (`*.test.js`); assert new formula/format ranges the
  same way (range bounds, formula strings, no data-region addressing).

No external ADRs/specs — requirements fully captured in the docs above and the decisions here.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `dcaLogSheet.js` already emits per-asset summary formulas via `formulaRowRequest` and uses
  open-ended `$X$23:$X` ranges with `Type="BUY"` filters — extend this exact pattern for the
  new realized metric columns (don't recreate). The existing offline unit tests
  (`dcaLogSheet.test.js`) are the assertion pattern for the new formulas/ranges.
- Phase 5's `addConditionalFormatRule` background-fill helper (green/red, idempotent
  clear/replace) is reused for the Realized PnL ($/%) cells.

### Established Patterns
- Pure request-builders, no network/Google globals → unit-testable offline. New formulas, the
  helper-column `ARRAYFORMULA`, and conditional-format rules must assert range bounds, formula
  strings, and **no data-region addressing** the same way.
- Summary metrics live in the top band (rows 2..1+`MAX_SUMMARY_ROWS`); transaction data lives
  at rows ≥ 23; the header row (22) is the boundary where single-write spill formulas are
  allowed to anchor.

### Integration Points
- The Google Sheet is the only cross-runtime surface. The **tab rename (D-07)** is the one
  cross-runtime coupling this phase changes — `config.js` `DCA_LOG` and Apps Script
  `Config`/`refreshAll` must change together, and `--update` must rename-in-place.
- Realized PnL consumes the existing BUY-only Avg Cost cell (Phase 5) as its cost-basis input
  — do not duplicate the avg-cost computation.

</code_context>

<specifics>
## Specific Ideas

- User explicitly wanted realized PnL that **doesn't drift** when re-buying after a sale — the
  at-sale snapshot (D-01) was chosen specifically to freeze booked realized PnL.
- User chose the **simpler, auditable spill helper column** (D-02) over a single complex
  summary-cell array formula, accepting one hands-off helper column in exchange for robustness.
- User wanted the tab renamed from "DCA Log" to **"Transaction Log"** (D-07) because it now
  records sells as well as DCA buys.
- Realized PnL stays **off the Dashboard** (D-03) — summary block only, to avoid re-disturbing
  the Phase 5 Dashboard layout.

</specifics>

<deferred>
## Deferred Ideas

- **Data-validation dropdowns (Asset, Type) on the Transaction Log → PNL-06, v2** (REQUIREMENTS).
- **FIFO / per-lot cost-basis accounting** — considered and rejected for v1 (not
  formula-expressible; would push compute into Apps Script). Revisit only if tax-style lot
  accounting becomes a requirement.
- **Remove vestigial `apy` field from `assets.json`** — optional future cross-runtime cleanup
  (carried from Phase 5 deferred list).

None of these are scope creep into Phase 6 — they are v2 / future concerns surfaced while scoping.

</deferred>

---

*Phase: 6-Realized PnL & Sell Log*
*Context gathered: 2026-06-20*
