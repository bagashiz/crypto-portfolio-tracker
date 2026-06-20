# Phase 6: Realized PnL & Sell Log - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-20
**Phase:** 6-realized-pnl-and-sell-log
**Areas discussed:** Cost-basis method, Compute host, Dashboard surfacing, Fees treatment, SELL row entry, Realized metrics, Tab rename

---

## Cost-basis method (D-01)

| Option | Description | Selected |
|--------|-------------|----------|
| Current BUY-avg (simple) | proceeds − soldQty × current BUY-avg; pure SUMIFS but past realized drifts when you re-buy | |
| At-sale snapshot | cost basis = BUY-avg as of the sell's date; booked realized frozen; needs per-row helper | ✓ |
| FIFO lots | match sells to specific buy lots; most accurate, not formula-expressible | |

**User's choice:** At-sale snapshot
**Notes:** User asked "how does re-buying after a sell affect realized PnL?" — walked through a worked buy/sell/re-buy-cheaper example showing the simple method jumps +$50→+$75 on a re-buy. User chose snapshot specifically to freeze booked realized PnL.

---

## Compute host for the per-sell-row cost basis (D-02)

| Option | Description | Selected |
|--------|-------------|----------|
| Array formula only (no helper col) | single summary-cell array/SUMPRODUCT per asset; zero new columns; feasibility/perf risk | |
| Spill helper column (right of Notes) | one ARRAYFORMULA in header row 22 spills per-row realized down a new col J; summary SUMs it | ✓ |
| You decide (planner picks) | prefer array-only, fall back to helper column | |

**User's choice:** Spill helper column
**Notes:** User asked "what's the difference between the two formula approaches?" — explained both yield the same number; A keeps the sheet pristine but bets on a complex formula, B adds one hands-off column with simpler/auditable per-row math. User accepted the single visible helper column (col J) and to never type into it.

---

## Dashboard surfacing (D-03)

| Option | Description | Selected |
|--------|-------------|----------|
| Summary block only | realized only in the Transaction Log summary block; no Dashboard layout churn | ✓ |
| New Zone A column | realized column on the Dashboard next to unrealized; shifts status block + refreshAll targets again | |
| Single total cell | one Total Realized PnL cell on the Dashboard | |

**User's choice:** Summary block only
**Notes:** Avoids a second round of Phase 5 D-01 status-block/refreshAll column churn.

---

## Fees treatment (D-04)

| Option | Description | Selected |
|--------|-------------|----------|
| Net proceeds (after sell fee) | (Total − Fee) − qty × avgCost; symmetric with buy-fee-inclusive cost basis | ✓ |
| Gross proceeds (ignore sell fee) | proceeds − qty × avgCost; asymmetric, mildly overstates net | |

**User's choice:** Net proceeds (after sell fee)
**Notes:** Buy fees are already in avgCost (Phase 5 Net Cost); subtracting sell fees makes realized PnL fully fee-inclusive on both sides.

---

## SELL row entry (D-05)

| Option | Description | Selected |
|--------|-------------|----------|
| Derive from Total − Fee | enter Price·Qty·Total·Fee, leave Net Cost blank; helper derives net proceeds | ✓ |
| Use Net Cost as net proceeds | repurpose Net Cost col = Total − Fee on sells; one more cell to fill | |

**User's choice:** Derive from Total − Fee
**Notes:** Fewer cells to fill, less error-prone; Net Cost stays buy-oriented and blank on sells.

---

## Realized metrics (D-06)

| Option | Description | Selected |
|--------|-------------|----------|
| Realized PnL % | per-asset realized return = realized$ / (soldQty × avgCost) | ✓ |
| Portfolio total realized | single Total Realized PnL summing all assets | ✓ |
| Sold Qty / Proceeds cols | helper summary columns for total qty sold + net proceeds per asset | ✓ |

**User's choice:** All three (multi-select)
**Notes:** Summary block gains Sold Qty · Net Proceeds · Realized $ · Realized % per asset, plus a portfolio Total Realized cell.

---

## Tab rename (D-07)

| Option | Description | Selected |
|--------|-------------|----------|
| Transactions | clean/neutral, covers buys + sells | |
| Transaction Log | keeps the "Log" framing, append-only record | ✓ |
| Trade Log | active-trader flavored | |
| Keep "DCA Log" | no rename | |

**User's choice:** Transaction Log
**Notes:** User raised the rename unprompted ("rename the DCA Log into something that matches"). Flagged the cross-runtime contract (config.js DCA_LOG + Apps Script Config/refreshAll) and the rename-in-place (not recreate) requirement for data safety.

---

## Claude's Discretion

- Exact helper-column letter/header text, exact new summary-column placement, and coherent layout of the summary-band vs data-band column overlap.
- Exact ARRAYFORMULA / date-bounded SUMIFS A1 syntax, IFERROR nesting, number-format strings.
- Whether internal constants keep the `DCA_LOG` name (only the visible tab title must change).
- Conditional-format threshold reuse vs new rule for realized cells.
- Plan sequencing of the rename + new formulas.

## Deferred Ideas

- Data-validation dropdowns (Asset, Type) — PNL-06, v2.
- FIFO / per-lot cost-basis accounting — considered and rejected for v1 (not formula-expressible).
- Remove vestigial `apy` field from `assets.json` — optional future cross-runtime cleanup.
