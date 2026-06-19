# Phase 5: PnL & Allocation - Context

**Gathered:** 2026-06-19
**Status:** Ready for planning

<domain>
## Phase Boundary

Add **formulas + conditional formatting** to the existing layout-builder skeleton (`layout-builder/src/dashboardSheet.js`, `dcaLogSheet.js`) so the Dashboard shows **unrealized PnL** and **allocation health**, driven by DCA transaction rows the user enters in the DCA Log tab. This is the formula/format layer Phase 2 deliberately deferred (Phase 2 D-08). Covers PNL-01, PNL-02, PNL-03, PNL-04, ALLOC-01, and ALLOC-02 (reduced — see D-05).

**This phase does NOT:** handle SELL transactions or realized PnL (moved to **Phase 6**, BUY-only here, D-04); fetch any new data (refresh layer is Phase 4 — but the status-block columns move, see D-01/D-02); add data-validation dropdowns (PNL-06, v2). It extends the SAME structural ranges the Phase 2 skeleton already stamps and MUST still never touch the DCA Log transaction data region at/below `DATA_START_ROW` (Phase 2 D-06, LAYOUT-02 — irreversible-data-loss guard).

</domain>

<decisions>
## Implementation Decisions

### Dashboard PnL layout
- **D-01:** Zone A is widened with three new columns and the **APY % column is scratched**. Final Zone A column map: `Asset(A) · Qty(B) · Price(C) · Value(D) · Target %(E) · Risk(F) · AvgCost(G) · PnL $(H) · PnL %(I)`. The per-venue status block (`Status / LastUpdated / Stale?`) — currently column-anchored at col I — must shift to the right of the new col I, with a ≥1-column gap (exact start col is Claude's discretion, e.g. col K). **Consequence:** `apps-script/src/Refresh.ts` `refreshAll()` writes the `LastUpdated`/`Stale?` values into the status block — those write targets MOVE and must be updated to the new columns in this phase.
- **D-02:** `Value` (col D) is a **formula** `=Qty*Price` (`=B*C`), NOT a refresh-written value. `refreshAll()` therefore writes only Qty (B) + Price (C) + the (relocated) status values, and must **not** write col D. `PnL $` (H) `= Value − Qty*AvgCost` (`=D - B*G`); `PnL %` (I) `= (D - B*G)/(B*G)`.
- **D-03:** `AvgCost` (col G) **references the DCA Log summary block's Avg Cost cell** for that asset — single source of truth, no duplicated SUMIF on the Dashboard (PROJECT.md Key Decision).

### Cost-basis semantics
- **D-04:** Cost basis is **BUY-only**. Summary-block formulas filter `Type="BUY"`: Total Invested `=SUMIFS(NetCost, Asset, …, Type, "BUY")`; Total Qty `=SUMIFS(Qty, …, "BUY")`; Avg Cost `= Invested / Qty`; Buy Count `=COUNTIFS(…, "BUY")`; Last Buy `=MAXIFS(Date, …, "BUY")`; Total Fees `=SUMIFS(Fee, …, "BUY")`. SELL rows are **ignored** by the Phase 5 summary (SELL/realized PnL is **Phase 6**, PNL-05). All `SUMIFS`/`COUNTIFS`/`MAXIFS` use **open-ended ranges** (`A{DATA_START_ROW}:A`) per Phase 2 D-07 so they survive unbounded transaction growth.
  - **Live-qty vs DCA-qty divergence (accepted for v1):** PnL uses the **live on-chain Qty** (col B, written by `refreshAll()`) × (Price − AvgCost), i.e. `liveQty × (Price − AvgCost)`. The summary block's Total Qty (sum of BUY qty) may differ from live balance (transfers in/out, staking rewards, eventual sells). `AvgCost` stays the average **buy** price; PnL applies it to whatever is currently held on-chain. This divergence is expected and acceptable for v1.

### Allocation scope reduction
- **D-05:** **APY % and Monthly Yield are SCRATCHED everywhere** (Zone A APY%, Zone B APY%, Zone B Monthly Yield, and the totals-row "total monthly yield"). Final Zone B column map: `Asset(A) · Target %(B) · Actual %(C) · Drift(D) · Risk(E)`. `Actual %` `= asset Value / Zone A TOTAL Value`; `Drift` `= Actual − Target`. TOTALS row: Target sum + **blended Risk** via `SUMPRODUCT(Risk, Actual%)`. The `apy` field in `assets.json` is now **vestigial** (unused by the dashboard) — left in place to avoid cross-runtime churn with the Apps Script registry. REQUIREMENTS ALLOC-02 reduced; ROADMAP SC#5 reduced with a scope note (both updated 2026-06-19).

### Empty / error state
- **D-06:** All formula **leaf** cells wrap in `IFERROR(…, "—")` (em-dash) so an asset with no BUY rows yet shows `—` instead of `#DIV/0!`. Applies across the summary block, Dashboard `AvgCost`/`PnL $`/`PnL %`, and allocation `Actual %`/`Drift`. Aggregate/TOTAL(S) cells also wrap in `IFERROR`; since `—` is text, `SUM` skips it cleanly. **Planner note:** the blended-risk `SUMPRODUCT(Risk, Actual%)` must guard against text (`—`) in Actual% (e.g. treat missing as 0, or `SUMPRODUCT(Risk, IFERROR(Actual%,0))`).

### Conditional formatting
- **D-07:** **Background-fill** conditional formatting — green fill for PnL `> 0`, red fill for PnL `< 0`, no fill for `0` or `—`. Applied to **both** `PnL $` (col H) and `PnL %` (col I) per asset row. **Additionally**, apply conditional formatting to the allocation **Drift** column (col D, Zone B) to flag rebalance need — red when `|drift|` exceeds a tolerance band (recommended default **≥ 5 percentage points** absolute; exact threshold is Claude's discretion). Rules are emitted by the layout builder (`addConditionalFormatRule`) and re-applied in BOTH `--build` and `--update`; `--update` must be **idempotent** — clear/replace the managed rules (or guard) so re-running does not stack duplicate rules.

### Idempotency / data safety (carry-forward, non-negotiable)
- Formulas and conditional-format rules are added to the SAME structural/summary/Dashboard ranges the Phase 2 skeleton already writes. `--update` re-applies them and STILL **never addresses the DCA Log transaction data region** at/below `DATA_START_ROW` (Phase 2 D-06). The DCA-Log summary formulas live in the fixed top band (rows 2..1+MAX_SUMMARY_ROWS); the open-ended `A{DATA_START_ROW}:A` ranges only *read* the data region, never write it.

### Claude's Discretion
- Exact status-block start column after Zone A widens to col I (e.g. col K, one-column gap).
- Exact drift-coloring threshold/band and whether it's signed or absolute.
- Exact A1 formula syntax, `IFERROR` nesting, and whether `--update` clears+re-adds conditional-format rules vs guards against duplicates.
- Number-format strings for the new columns (currency for AvgCost/PnL $, percent for PnL %).
- How the `refreshAll()` status-column move is sequenced across this phase's plans — but it MUST be addressed (status columns relocated by D-01, and col D must not be overwritten by D-02).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase requirements & boundaries
- `.planning/REQUIREMENTS.md` — PNL-01, PNL-02, PNL-03, PNL-04, ALLOC-01, ALLOC-02 (ALLOC-02 reduced 2026-06-19); PNL-05 now Phase 6, PNL-06 v2
- `.planning/ROADMAP.md` §"Phase 5: PnL & Allocation" — goal + 5 success criteria (SC#5 reduced; scope note attached)
- `.planning/PROJECT.md` — Constraints (idempotency / no-data-loss, two-runtime boundary), Key Decisions (single-source-of-truth avg cost, scheduled trigger writes data)

### Sheet structure (the runtime "schema" being made live)
- `.planning/codebase/STRUCTURE.md` §"Spreadsheet Structure" — Dashboard zones + DCA Log layout (note: column maps here are superseded by D-01/D-05 above)
- `.planning/phases/02-layout-builder/02-CONTEXT.md` — Phase 2 D-05/D-06/D-07/D-08: the skeleton boundary these formulas extend; top-of-data band; open-ended-range plan; data-region safety

### Existing code to extend
- `layout-builder/src/dashboardSheet.js` — `structuralRequests()` + helpers (`labelRowRequest`, `numberFormatRequest`, `freezeHeaderRequest`); Zone A/B + status-block constants. Phase 5 adds `formulaValue` cells + `addConditionalFormatRule` here.
- `layout-builder/src/dcaLogSheet.js` — `bandRequests()`; summary block + `TX_HEADER_ROW`. Phase 5 adds the SUMIFS/MAXIFS/COUNTIFS summary formulas here.
- `layout-builder/src/config.js` — `DATA_START_ROW`, `MAX_SUMMARY_ROWS`, `DASHBOARD`, `DCA_LOG`, shared `assets.json` import
- `apps-script/src/Refresh.ts` — `refreshAll()` status-block write targets MOVE (D-01) and must NOT write Value col D (D-02)
- `assets.json` (repo root) — per-asset `target`/`risk` drive Zone B; `apy` now vestigial (D-05)
- `.planning/codebase/CONVENTIONS.md` — `layout-builder/` is ESM Node, camelCase filenames, pure offline-testable request-builders

No external ADRs/specs — requirements fully captured in the docs above and the decisions in this file.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `dashboardSheet.js` / `dcaLogSheet.js` already expose `build`/`update` request-builder pairs that return arrays of Sheets `batchUpdate` requests — extend these (don't recreate). Helpers `labelRowRequest` and `numberFormatRequest` are reused; add a `formulaCell`/`formulaRowRequest` helper (mirrors `stringCell`) emitting `userEnteredValue.formulaValue`, plus `addConditionalFormatRule` request builders.
- The overflow guards (`MAX_ZONE_A_ASSET_ROWS`, `MAX_SUMMARY_ROWS`) and offline unit tests (`*.test.js`) are the pattern to follow for any new formula/format ranges.

### Established Patterns
- Pure request-builders, no network/Google globals → unit-testable offline (the existing `dashboardSheet.test.js` / `dcaLogSheet.test.js`). New formulas/conditional-format rules should be asserted the same way (range bounds, formula strings, no data-region addressing).
- `--build` == `--update` for structural ranges because nothing below `DATA_START_ROW` is ever addressed. Conditional-format rules need idempotency care (clear/replace) since re-adding stacks them.

### Integration Points
- The Google Sheet is the only cross-runtime surface. Phase 5 writes formulas (layout builder, Node); `refreshAll()` (Apps Script) writes the live Qty/Price + status values those formulas consume. Two coupling points this phase changes: (1) status-block columns relocate (D-01); (2) `Value` becomes a formula so refresh must stop at Qty/Price (D-02).

</code_context>

<specifics>
## Specific Ideas

- User explicitly **scratched APY % and Monthly Yield** from the whole dashboard (D-05) — do not "helpfully" re-add them; ALLOC-02 was reduced accordingly.
- **Em-dash (`—`) empty state** (D-06), not blank and not `$0.00`, so un-held / un-logged assets read clearly as "no data."
- **Background-fill** green/red (not text color), and **Drift column also gets color** to flag rebalancing (D-07).
- **BUY-only** cost basis with SELL handling split into its own **Phase 6** — the user chose to make a new phase rather than fold SELL semantics into Phase 5 (D-04).

</specifics>

<deferred>
## Deferred Ideas

- **SELL transactions + realized PnL → Phase 6** (PNL-05, promoted from v2). Realized PnL = proceeds − cost basis of units sold; how SELL rows interact with the BUY-only average. Tracked in ROADMAP Phase 6 / REQUIREMENTS PNL-05.
- **Data-validation dropdowns (Asset, Type) on the DCA Log → PNL-06, v2** (REQUIREMENTS).
- **Remove vestigial `apy` field from `assets.json`** — optional future cleanup once confirmed no runtime reads it (cross-runtime change; out of scope here).

None of these are scope creep into Phase 5 — they are explicitly later-phase / v2 concerns surfaced while scoping.

</deferred>

---

*Phase: 5-PnL & Allocation*
*Context gathered: 2026-06-19*
