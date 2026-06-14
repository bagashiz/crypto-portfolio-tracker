# Phase 2: Layout Builder - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-14
**Phase:** 2-Layout Builder
**Areas discussed:** Spreadsheet source, Config & auth wiring, Build guard, DCA-row protection, Formula/format scope

---

## Spreadsheet source

| Option | Description | Selected |
|--------|-------------|----------|
| Target existing | User creates a blank sheet, shares with SA as Editor, paste ID into config | ✓ |
| Builder creates it | `--build` calls spreadsheets.create; file lands in SA Drive | |

**User's choice:** Target existing (recommended)
**Notes:** Avoids service-account-owned-Drive ownership headaches; matches PROJECT.md platform setup.

---

## Config & auth wiring

| Option | Description | Selected |
|--------|-------------|----------|
| `.env` file, gitignored | Read SPREADSHEET_ID from gitignored .env at runtime (Node --env-file) | ✓ |
| Edit config.js constant | Already scaffolded; commits personal sheet ID to git | |
| CLI flag | Pass --spreadsheet-id per run | |

**User's choice:** `.env` file, gitignored (recommended)
**Notes:** layout-builder runs on Node, so Bun's auto-.env doesn't apply — needs explicit loader.

---

## Build guard (tabs already exist)

| Option | Description | Selected |
|--------|-------------|----------|
| Refuse, direct to --update | `--build` errors if tabs exist; first-time-creation only | ✓ |
| Recreate tabs (destructive) | Delete and rebuild tabs | |

**User's choice:** Refuse, tell user to use --update (recommended)
**Notes:** Hard guard against irreversible data loss.

---

## DCA-row protection — summary block placement

| Option | Description | Selected |
|--------|-------------|----------|
| Right of data, fixed columns | Summary in cols K+; data appends in A–I | (variant) |
| Below the data | Summary beneath transactions; position drifts | |
| Separate sheet/section | Summary on own area/tab | |

**User's choice:** Variant of option 1 — **fixed band at the TOP of the data** (summary block + transaction header row pinned to fixed top rows; transactions append below a fixed start row).
**Notes:** Keeps every structural element at a fixed address so --update never computes where data ends.

---

## DCA-row protection — idempotency mechanism

| Option | Description | Selected |
|--------|-------------|----------|
| Only write fixed structural ranges | --update never addresses the data region | ✓ |
| Read-modify-write w/ boundary detection | Read sheet, detect data bounds, write around | |
| Developer metadata markers | Tag structural ranges via Sheets dev metadata | |

**User's choice:** Only write fixed structural ranges (recommended)
**Notes:** Simplest provably-correct design — the data region is simply never addressed.

---

## Formula/format scope (Phase 2 ↔ Phase 5)

| Option | Description | Selected |
|--------|-------------|----------|
| Everything now — full formulas + formatting | Phase 2 writes all formulas + conditional formatting | |
| Static skeleton only — defer to Phase 5 | Phase 2 = headers/frozen/labels/formats/empty cells | ✓ |
| Split by tab | DCA Log full, Dashboard skeleton; rest in Phase 5 | |

**User's choice:** Static skeleton only — defer formulas to Phase 5
**Notes:** Keeps roadmap's "formulas last" horizontal layering. Deliberately diverges from ROADMAP Phase 2 SC#1 wording ("...and formulas") — flagged in CONTEXT.md for the verifier.

---

## Claude's Discretion

- CLI argument parsing approach (`process.argv` vs small parser lib).
- Sheets API call strategy (single `batchUpdate` vs grouped requests).
- Exact number formats, frozen-row counts, column widths, precise Dashboard cell map (from STRUCTURE.md sketch).
- Whether to include trivially-free data validation now (dropdowns themselves are v2-deferred).
- Per-runtime README updates.

## Deferred Ideas

- All PnL/cost-basis/allocation formulas + green/red conditional formatting → Phase 5.
- DCA Log data-validation dropdowns (Asset, Type) → PNL-06, v2.
- Solana mint addresses + XAUt ticker confirmation → Phase 3 blocker (does not affect Phase 2).
