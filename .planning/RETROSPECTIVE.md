# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v1.0 — MVP

**Shipped:** 2026-06-21
**Phases:** 6 | **Plans:** 16 | **Tasks:** 33

### What Was Built
- Two-runtime architecture: local Node `layout-builder/` (isolated `googleapis`) that stamps the Dashboard + Transaction Log structure, and a Google Apps Script V8 data layer pushed via `clasp` — the Sheet as the only integration surface.
- Raw-`UrlFetchApp` data layer: Hyperliquid spot prices+balances and Jupiter prices + Solana balances (Jupiter `ultra/v1/balances`), with fail-loud `PropertiesService`-backed config and zero SDKs.
- Scheduled `refreshAll()` on a 5-min trigger: single batched `setValues`, `PRICES_ALL` last-good cache blob, per-venue graceful degradation (`LastUpdated`/`Stale?`).
- DCA-weighted cost basis (single source of truth in the summary block), unrealized PnL ($/%) with green/red conditional formatting, allocation health (target/actual/drift/blended risk), and realized PnL from SELL rows.
- Idempotent `--build`/`--update` that provably never touches the transaction data region (row 23+), with a fixed `DATA_START_ROW` literal guarding against asset-registry drift.

### What Worked
- **Data-region safety as a tested invariant.** Pinning `DATA_START_ROW` to a fixed literal and asserting in unit tests that no `--update` request reaches the data region made the irreversible-data-loss constraint mechanically enforced, not just documented.
- **Provider isolation + last-good cache.** Per-venue try/catch off one cache blob meant a single venue outage degraded gracefully instead of blanking the sheet — validated by an induced failure.
- **Tight phase layering.** Each horizontal layer (foundation → builder → data → refresh → PnL → realized) depended fully on the one below, so nothing was wired before its foundation existed.

### What Was Inefficient
- **Offline tests gave false confidence on a live-only seam.** The `--update` conditional-format pre-clear had a tolerance regex matched against a *guessed* Sheets API error string. Every offline test passed, but the real message (`No conditional format on sheet: <id> at index: <n>`) never matched — so **no `--update` actually landed between Phase 2 and milestone close**. The gap only surfaced at the live verification gate, where it had silently blocked all Phase 5/6 formatting from ever reaching the sheet.
- **Deferring all live verification to milestone close** meant a structurally-invisible runtime defect rode along for four phases before anyone ran `--update` against the real spreadsheet.

### Patterns Established
- **Error-tolerance predicates must be matched against the real API vocabulary and unit-tested with the real string** — not a plausible-looking guess. (Quick task 260621-m70 broadened + exported the matcher and locked it with regression tests.)
- **Live round-trip at least once per layer that writes to an external system**, rather than batching all live checks at the end — a structural proof (`no request addresses the data region`) is necessary but not sufficient for runtime/visual properties.
- Quick-task-as-verification-fix: a defect caught at the milestone gate was routed through `/gsd-quick` (atomic commit + regression test + STATE tracking) rather than an ad-hoc edit.

### Key Lessons
1. **A passing offline suite can mask a 100%-blocking live defect.** If a code path only executes against a remote API, assert against that API's actual error/response strings, captured from a real call — not from inference.
2. **Verify live behavior incrementally, per writing layer.** "Structurally proven, live round-trip pending" is a real gap, not a formality — schedule the round-trip when the layer ships, not at close.
3. **Idempotency hygiene that swallows expected errors needs a test for the swallow itself**, not just for the happy-path request shape.

### Cost Observations
- Model mix: predominantly Opus (orchestration + planning + execution) for this milestone.
- Notable: the single most expensive latent bug (4 phases of silently-unapplied structure) was free to catch — surfaced by one live `--update` at the verification gate — and cheap to fix (one regex + a regression test).

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Phases | Plans | Key Change |
|-----------|--------|-------|------------|
| v1.0 | 6 | 16 | Initial MVP; established two-runtime split, data-region safety invariant, and live-verification gate at milestone close |

### Cumulative Quality

| Milestone | Tests | Source LOC | SDK Additions |
|-----------|-------|------------|---------------|
| v1.0 | 55 offline (layout-builder) + Apps Script suite, all green | ~3,754 TS/JS | 0 (raw HTTP everywhere, by constraint) |

### Top Lessons (Verified Across Milestones)

1. Offline structural proofs do not cover runtime/visual properties — pair them with at least one live round-trip per external-write layer. *(First observed v1.0; watch whether it recurs.)*
