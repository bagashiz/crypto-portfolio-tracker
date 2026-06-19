# Phase 5: PnL & Allocation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-19
**Phase:** 5-PnL & Allocation
**Areas discussed:** Dashboard PnL layout, Cost-basis semantics, Empty/error state, Conditional formatting, APY/Monthly-yield scope

---

## Dashboard PnL layout

| Option | Description | Selected |
|--------|-------------|----------|
| Extend Zone A right, push status | Append AvgCost/PnL$/PnL% in Zone A, shift status block right | ✓ |
| Insert PnL after Value | Insert PnL cols at E/F/G, push Target/Risk/APY out | |
| Separate PnL block | Leave Zone A as-is, add a dedicated PnL block elsewhere | |

**User's choice:** Extend Zone A right, push the status block.
**Notes:** APY % column subsequently scratched (see APY scope below), so final Zone A = Asset/Qty/Price/Value/Target%/Risk/AvgCost/PnL$/PnL%. Status block must relocate; `refreshAll()` status write targets move.

| Option | Description | Selected |
|--------|-------------|----------|
| Formulas; AvgCost refs DCA Log | Value=Qty×Price formula; AvgCost references DCA Log summary; PnL formulas | ✓ |
| refreshAll writes Value too | Apps Script writes Value/AvgCost as plain values | |

**User's choice:** Formulas; AvgCost references the DCA Log summary (single source of truth).
**Notes:** Value=B*C; refresh writes only Qty/Price; PnL$=D−B*G; PnL%=(D−B*G)/(B*G).

---

## Cost-basis semantics

| Option | Description | Selected |
|--------|-------------|----------|
| BUY-only average | Avg cost & qty filter Type=BUY; SELLs ignored (v2) | ✓ (via new phase) |
| Net of SELLs | Qty/invested net out SELLs | |
| No Type filter | Sum all rows | |

**User's choice:** Make a **new phase** to accommodate the selling log → Phase 6 created. Phase 5 stays BUY-only (Type=BUY filter); SELL/realized-PnL semantics deferred to Phase 6 (PNL-05 promoted from v2).
**Notes:** The original BUY-vs-SELL question was reframed by the decision to split SELL handling into its own phase rather than fold it into Phase 5.

---

## Empty / error state

| Option | Description | Selected |
|--------|-------------|----------|
| Dash — placeholder | IFERROR(…, "—") | ✓ |
| Blank | IFERROR(…, "") | |
| Zero | IFERROR(…, 0) | |

**User's choice:** Em-dash `—` placeholder.
**Notes:** Applied across summary block, Dashboard PnL, and allocation cells. `—` is text so SUM skips it; SUMPRODUCT blended-risk needs a guard.

---

## Conditional formatting

| Option | Description | Selected |
|--------|-------------|----------|
| Background fill | Green/red cell fill | |
| Text color | Green/red text | |
| Fill + also color drift | Background fill on PnL + color the allocation Drift column | ✓ |

**User's choice:** Background fill on PnL **and** color the Drift column.

| Option | Description | Selected |
|--------|-------------|----------|
| Both PnL $ and PnL % | Color cols H and I | ✓ |
| PnL % only | Color only % | |
| Include TOTAL row | Also color the aggregate PnL | |

**User's choice:** Both PnL $ and PnL %.
**Notes:** Green for >0, red for <0, no fill for 0/`—`. Drift colored to flag rebalance (threshold Claude's discretion, default ≥5pp).

---

## APY / Monthly-yield scope

| Option | Description | Selected |
|--------|-------------|----------|
| Settle APY units | Reconcile fraction-vs-whole-percent mismatch (e.g. /100 in formula) | |
| Scratch APY column | Remove APY display | ✓ (extended) |

**User's choice:** **Scratch APY everywhere, and Monthly Yield too.**
**Notes:** Surfaced as a unit-consistency landmine (`target`=fraction 0.4 vs `apy`=whole-percent 5 → would render 500%). User resolved by removing APY % (both zones) and Monthly Yield (per-asset + total) entirely. ALLOC-02 reduced; ROADMAP SC#5 reduced with scope note; PROJECT.md updated. `assets.json.apy` now vestigial. Removes the unit landmine.

## Claude's Discretion

- Exact relocated status-block start column (e.g. col K).
- Drift-coloring threshold/band (signed vs absolute).
- A1 formula syntax, IFERROR nesting, clear-vs-guard for idempotent conditional-format rules on `--update`.
- New-column number formats.
- Sequencing of the `refreshAll()` status-column move across plans.

## Deferred Ideas

- SELL transactions + realized PnL → Phase 6 (PNL-05).
- Data-validation dropdowns (Asset, Type) → PNL-06, v2.
- Remove vestigial `apy` field from `assets.json` → optional future cleanup.
