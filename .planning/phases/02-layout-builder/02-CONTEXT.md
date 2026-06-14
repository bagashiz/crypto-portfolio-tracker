# Phase 2: Layout Builder - Context

**Gathered:** 2026-06-14
**Status:** Ready for planning

<domain>
## Phase Boundary

Build the local Node CLI `layout-builder` that stamps the Google Sheet **structure** for both tabs. `--build` creates the Dashboard + DCA Log tabs (headers, frozen rows, summary-block labels, number formats, empty cells) on a pre-existing spreadsheet, authenticated by the service account. `--update` idempotently re-applies that structure **without ever touching DCA Log transaction data rows**. Covers LAYOUT-01, LAYOUT-02.

**This phase does NOT** (deliberately deferred, see D-08): write any PnL/cost-basis/allocation **formulas** or **conditional formatting** — those land in Phase 5, which extends the same builder files. It does NOT fetch any price/balance data, wire OAuth scopes, PropertiesService, or Secret Manager (Phase 3), nor any refresh/trigger logic (Phase 4).

**Scope reinterpretation flag:** ROADMAP.md Phase 2 Success Criterion #1 lists "...summary rows, **and formulas**." This discussion deliberately scopes Phase 2 to the **static skeleton only** and moves all formulas to Phase 5 (D-08). The verifier should NOT treat absent formulas in Phase 2 as a gap — the Phase 2 summary block has labels + number formats but no SUMIF/PnL formulas yet. Idempotency criteria (#2, #3) still apply fully to the structural ranges Phase 2 does write.

</domain>

<decisions>
## Implementation Decisions

### Spreadsheet provenance & target (LAYOUT-01)
- **D-01:** `--build` targets a **pre-existing spreadsheet** that the user has created and shared with the service-account email as **Editor** — the builder does NOT call `spreadsheets.create`. Rationale: a service-account-created file lands in the SA's Drive with no UI and ownership/sharing friction; targeting a user-owned, pre-shared sheet matches the platform setup already noted in PROJECT.md.

### Config & auth wiring (LAYOUT-01)
- **D-02:** The spreadsheet ID is read from a **gitignored `.env`** at runtime (keeps the personal sheet ID out of git history), NOT from the committed `config.js` constant. `layout-builder` runs on **Node**, so Bun's auto-`.env` loading does NOT apply — use an explicit loader (e.g. `node --env-file=.env`). `config.js` should source `SPREADSHEET_ID` from `process.env` (the current `PLACEHOLDER_SPREADSHEET_ID` constant is replaced by this wiring).
- **D-03:** Service-account key location is already settled by Phase 1: `layout-builder/service-account.key.json`, gitignored, loaded by `src/auth.js` via service-account JWT (`google.auth.JWT` / `GoogleAuth`). Add `.env` to gitignore coverage if not already implied by existing `.env*` patterns.

### `--build` safety guard (LAYOUT-01, idempotency)
- **D-04:** If the Dashboard or DCA Log tab **already exists**, `--build` **refuses with an error** and directs the user to `--update`. `--build` is first-time-creation only — it never deletes or recreates an existing tab. Hard guard against the irreversible-data-loss constraint.

### DCA Log structure & data-row protection (LAYOUT-02 — highest stakes)
- **D-05:** The DCA Log uses a **fixed structural band at the TOP**: the per-asset summary block (total invested, total qty, DCA-weighted avg cost, buy count, last buy, total fees) occupies fixed top rows, immediately followed by the **transaction column header row** (Date, Asset, Type, Price, Qty, Total, Fee, Net Cost, Notes — cols A–I). Transaction data rows **append downward below a fixed start row** and grow unbounded. (User variant of "right of data": chose **top-of-data** placement.)
- **D-06:** `--update` writes **ONLY fixed structural ranges** — the summary block cells, the transaction header row, number formats, frozen rows. It issues **no write and no clear** to the transaction data region below the header row. The data region is simply never addressed, which is the simplest provably-correct way to satisfy "leaves DCA Log data rows byte-for-byte unchanged" and "running `--update` twice == once."
- **D-07:** (Phase 5 dependency, noted now for layout planning) The Phase 5 summary-block cost-basis formulas will SUMIF over **open-ended ranges** (e.g. `A{start}:A`) so they work regardless of how many transaction rows exist. Phase 2 must lay out the band so those open-ended ranges have room (data region starts at a known fixed row with nothing structural below it).

### Formula & formatting scope (Phase 2 ↔ Phase 5 boundary)
- **D-08:** Phase 2 builds the **static skeleton only**: tab creation, headers, frozen header rows, summary-row labels, number formats, empty cells. **All formulas** (Value, PnL USD/%, allocation target/actual/drift, SUMPRODUCT blended risk, monthly yield, summary-block SUMIF cost basis) **and all conditional formatting** (green/red PnL) are **deferred to Phase 5**, which extends `dashboardSheet.js` / `dcaLogSheet.js`. Chosen over "build everything now" to keep the roadmap's horizontal layering ("formulas last") intact.

### Claude's Discretion
- CLI argument parsing approach (`process.argv` vs a small parser lib) for `--build` / `--update`.
- Sheets API call strategy — single `batchUpdate` vs grouped requests (PLAN/ARCHITECTURE lean toward batched `batchUpdate` with explicit ranges; planner decides).
- Exact number-format strings, frozen-row counts, column widths, and the precise Dashboard Zone A (rows ~1–10) / Zone B (rows ~12–21) cell map — derive from STRUCTURE.md "Spreadsheet Structure" sketch.
- Whether to include any non-formula data-validation now (note: PNL-06 dropdowns are explicitly **v2-deferred** per REQUIREMENTS.md, so dropdowns are out of scope unless trivially free).
- Per-runtime README updates reflecting the implemented CLI.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase requirements & boundaries
- `.planning/REQUIREMENTS.md` — LAYOUT-01, LAYOUT-02 (exact acceptance language); note PNL-06 dropdowns are v2-deferred
- `.planning/ROADMAP.md` §"Phase 2: Layout Builder" — goal + 3 success criteria (SC#1 "formulas" reinterpreted per D-08)
- `.planning/PROJECT.md` — Constraints (idempotency / no-data-loss, two-runtime boundary, security) and Key Decisions table

### Sheet structure (the runtime "schema" to stamp)
- `.planning/codebase/STRUCTURE.md` §"Spreadsheet Structure" — Dashboard Zone A holdings (rows 1–10, TOTAL row 10), Zone B allocation health (rows 12–21, TOTALS row 21); DCA Log cols A–I + summary block
- `.planning/codebase/ARCHITECTURE.md` §"Layout builder" + "Data Flow (layout build)" — service-account JWT → Sheets API `batchUpdate`; idempotent `--update` re-applies structure only

### Existing scaffold to extend
- `layout-builder/src/config.js` — current `SPREADSHEET_ID` placeholder + `DASHBOARD`/`DCA_LOG` constants + shared `assets.json` import (D-02 rewires ID to `.env`)
- `assets.json` (repo root) — shared asset registry; the builder iterates this for per-asset rows (mint/ticker values are still placeholders — Phase 3 blocker, but Phase 2 only needs `id`, `target`, `risk`, `apy` for layout)
- `.planning/codebase/CONVENTIONS.md` — `layout-builder/` is ESM Node, camelCase filenames (`index.js`, `auth.js`, `dashboardSheet.js`, `dcaLogSheet.js`)
- `.planning/phases/01-foundation/01-CONTEXT.md` — Phase 1 decisions (D-04/D-05 shared assets.json, two-runtime isolation)
- `CLAUDE.md` (root) — Bun-first rules (note: layout-builder is the Node exception), RTK prefix

No external ADRs/specs — requirements fully captured in the docs above and the decisions in this file.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `layout-builder/src/config.js` — already imports shared `assets.json` and defines `DASHBOARD` / `DCA_LOG` sheet-name constants; extend (don't recreate). `SPREADSHEET_ID` placeholder gets replaced by `.env` wiring (D-02).
- `layout-builder/package.json` — declares `googleapis`; `build`/`update` scripts are currently no-op stubs (`echo ... exit 0`) to be replaced with real `node src/index.js --build|--update` invocations (with `--env-file`).
- `assets.json` — single source of truth; the builder reads `id`/`target`/`risk`/`apy` per asset to generate Dashboard rows. Mint/ticker placeholders don't block Phase 2 (layout, not data).

### Established Patterns
- Two-runtime isolation (Phase 1): `layout-builder/` keeps `googleapis` only; never pull in apps-script deps. ESM, camelCase filenames.
- Service-account JWT auth via `googleapis` (`auth.js`) — planned file, not yet written.

### Integration Points
- The Google Sheet is the only integration surface; the builder writes structure that Phase 3–5 (Apps Script) later fills with data and formulas.
- `.env` (new this phase) supplies `SPREADSHEET_ID` to the Node runtime.

</code_context>

<specifics>
## Specific Ideas

- **Top-of-data structural band** is the user's explicit choice for the DCA Log: summary block + transaction header row pinned to fixed top rows; transactions append below a fixed start row. Downstream agents must implement exactly this — not the "summary below the data" sketch in STRUCTURE.md (which this decision supersedes).
- **`--update` addresses only structural ranges** — implement the data-row safety as "never reference the data region," not as read-detect-write boundary logic. This is the user's chosen mechanism (simplest correct design).
- **Skeleton-now, formulas-Phase-5** is a deliberate phase-boundary choice the user made knowing it diverges from ROADMAP SC#1 wording — preserve the divergence; don't "helpfully" add formulas in Phase 2.

</specifics>

<deferred>
## Deferred Ideas

- All PnL / cost-basis / allocation **formulas** + **green/red conditional formatting** → Phase 5 (extends `dashboardSheet.js` / `dcaLogSheet.js`).
- Data-validation **dropdowns** on DCA Log (Asset, Type) → PNL-06, v2-deferred per REQUIREMENTS.md.
- Exact Solana mint addresses + XAUt ticker confirmation → Phase 3 blocker (does not affect Phase 2 layout).

None of these are scope creep into Phase 2 — they are explicitly later-phase/v2 concerns surfaced while scoping the builder.

</deferred>

---

*Phase: 2-Layout Builder*
*Context gathered: 2026-06-14*
