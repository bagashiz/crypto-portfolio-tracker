# Phase 4: Refresh & Caching - Context

**Gathered:** 2026-06-17
**Status:** Ready for planning

<domain>
## Phase Boundary

Build the Apps Script **refresh orchestration layer** on top of the Phase 3 providers: a time-driven trigger that runs `refreshAll()`, which fetches both venues live, writes prices + balances to the Dashboard in a **single batched `setValues`**, maintains a `PRICES_ALL` cache blob used as a last-good degradation buffer, and degrades **per-venue** (keeps last-good values, flags `Stale?`, freezes `LastUpdated`) when a provider fails. Covers REFRESH-01..04.

New editor-callable globals this phase: `refreshAll`, `installTrigger`, `removeTrigger` (TODO slots already reserved in `entry.ts` + `appendGlobals.ts`).

**This phase does NOT:**
- Add any PnL / cost-basis / allocation formulas or conditional formatting → **Phase 5** (the `Value = Qty × Price` formula, color coding, allocation zone math).
- Change the provider modules' return contract (D-09 `Record<id,{price,qty}>`) or their fail-loud behavior (D-10/D-13) — Phase 4 **consumes** them.
- Add new assets or handle USDC static reserve (USDC is not in the registry; out of scope here).

**Cross-runtime touch:** this phase edits the **layout-builder** runtime (`dashboardSheet.js`) once, to stamp the static status-block labels (see D-05). All dynamic writes are Apps Script.

</domain>

<decisions>
## Implementation Decisions

### Cache role (REFRESH-03)
- **D-01:** `PRICES_ALL` is a **last-good degradation buffer**, NOT a call-reduction cache. `refreshAll()` **always fetches live every run** (~4 HTTP calls total per D-08). On a successful venue fetch it overwrites that venue's slice of the blob with fresh values. The cache is **read only when a venue fails this run**, to source that venue's last-good values for the sheet. Rationale: core value is "live PnL refreshed automatically"; at ~4 calls/5 min rate limits are a non-issue, so the cache's real job is graceful degradation, not skipping fetches. (Resolves the SC#3 ambiguity — "served on the next run within TTL" is satisfied by serving last-good on a failed run, not by skipping live fetches.)
- **D-02:** `CACHE_TTL_SECONDS` (currently 300) only bounds how long `CacheService` retains the blob. It does **not** gate fetching and does **not** blank stale values. Blob eviction is treated as a normal cold-start (see D-07). The blob should be structured **per-venue** (e.g. `{ hyperliquid: {data, lastUpdated}, solana: {data, lastUpdated} }`) so a partial failure can read one venue's last-good while the other stays fresh.

### Staleness semantics (REFRESH-04)
- **D-03:** **Show last-good, flag immediately.** The moment a provider fails on a run, keep its last-good values on the sheet, set that venue's `Stale?=TRUE`, and **freeze** its `LastUpdated` at the last successful time. **No TTL grace window, no TTL-based blanking** while a last-good value exists. A stale-but-real price beats a blank. A venue self-heals (`Stale?` back to `FALSE`, `LastUpdated` advances) on its next successful run.

### Status cells (REFRESH-04)
- **D-04:** Status is **per-venue — exactly 2 lines**: one `LastUpdated` + `Stale?` pair for **Hyperliquid**, one for **Solana/Jupiter**. (Not a single global status — that couldn't express a partial failure per SC#4; not per-asset — staleness is inherently per-venue since all of a venue's assets fail together.)
- **D-05:** **Runtime split for the status block.** The **layout builder** (`layout-builder/src/dashboardSheet.js`) stamps the **static labels** (venue names + `LastUpdated` / `Stale?` headers) as part of Dashboard structure — same ownership model as the Zone A/B headers. `refreshAll()` writes **only the dynamic** timestamp + `Stale?` flag values. Keeps the build-time/run-time boundary clean (layout builder owns all static structure; Apps Script owns all live data). Phase 5 also extends `dashboardSheet.js`, so editing it here is the established pattern. **Requires a one-time `layout-builder --update` to materialize the labels.**
- **D-06:** **Placement: top-right, column-anchored, fixed.** The 2-line status block lives in the free columns to the right of Zone A (the zones use cols A–G; put the block around cols I–K, rows 1–3). Column-anchored so it never floats or collides as the asset registry grows/shrinks (Zone A/B *rows* shift with asset count, per the `MAX_ZONE_A_ASSET_ROWS` guard; *columns* don't). Exact columns/rows are Claude's discretion as long as they don't overlap zones A/B and survive the registry-growth guard.

### Degradation cold-start (REFRESH-04)
- **D-07:** When a provider fails **and there is no cached last-good** (true first run, or `CacheService` evicted the blob): **leave that venue's Qty/Price cells untouched**, set `Stale?=TRUE`, leave `LastUpdated` blank / "—" / "never". A failure **never writes a non-number** into Price/Qty cells (no `ERR`/`#N/A` markers) — that would cascade into Phase 5's `Value = Qty × Price` and the TOTAL/allocation math as `#VALUE`. Self-heals on the next successful run.
- **D-08 (derived from D-07 + REFRESH-02 — Claude's discretion on mechanics):** To keep the write a **single `setValues`** over the full Zone A value range while leaving a failed venue "untouched," `refreshAll()` sources each venue's row values from: (1) this run's live fetch if it succeeded, else (2) the cache last-good if present, else (3) the **current sheet values read at the start of the run**. This guarantees a failure never *clears* a previously-good value and the write stays one `setValues` call. Planner decides exactly which columns the single write spans (see D-10).

### Interval / trigger config (REFRESH-01)
- **D-09:** Interval is a **compiled constant** — keep `REFRESH_INTERVAL_MINUTES = 5` in `Config.ts`; `installTrigger()` reads it (`ScriptApp.newTrigger(...).timeBased().everyMinutes(5)`). "Configurable" = edit the constant, rebuild, redeploy, re-run `installTrigger()`. No Script Property override (a personal tracker rarely retunes; one source of truth is simpler). `installTrigger()` must be **idempotent** — remove any existing `refreshAll` trigger before creating a new one so re-installs don't stack duplicate triggers.

### Claude's Discretion
- **D-10:** Which Dashboard columns the single `setValues` spans. Likely **Qty (col B) + Price (col C) only**, leaving `Value` (col D, a Phase 5 formula) and the static `Target%/Risk/APY` (cols E–G) alone. Whether refresh also writes the static `Target/Risk/APY` from the registry, or that's left to Phase 5, is open — default to **not** writing them in Phase 4 (they're static config, and Phase 5 owns Zone A/B value semantics). Planner/researcher to confirm against the Phase 5 formula plan so the refresh write and the formulas don't fight over cells.
- Exact `PRICES_ALL` blob JSON shape (per-venue keys, timestamp format).
- Status-cell exact columns/rows within the top-right region, and timestamp display format (respect the `Asia/Jakarta` timezone in `appsscript.json`).
- Whether to also expose a manual `refreshAll()` editor run for testing (likely yes — it's already an entry global).
- HTTP/parse error classification reuse — providers already throw per D-10/D-13; Phase 4 just wraps each provider call in its own `try/catch`.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase requirements & boundaries
- `.planning/REQUIREMENTS.md` — REFRESH-01, REFRESH-02, REFRESH-03, REFRESH-04
- `.planning/ROADMAP.md` §"Phase 4: Refresh & Caching" — goal + 4 success criteria (note: SC#3's "served on the next run within TTL" is interpreted per D-01 — served as last-good on a *failed* run, not by skipping live fetches)
- `.planning/PROJECT.md` — Constraints (single batched `setValues`, never cell-by-cell; per-provider try/catch; never overwrite good data with errors; two-runtime isolation) and Key Decisions table

### Prior-phase decisions this phase builds on
- `.planning/phases/03-data-layer/03-CONTEXT.md` — **D-09** provider return contract (`Record<id,{price,qty}>`), **D-10/D-13** fail-loud (price throws, balance absence = qty 0, HTTP/parse error throws) — Phase 4's per-provider `try/catch` + last-good cache is the layer that makes fail-loud safe
- `.planning/phases/01-foundation/01-CONTEXT.md` — `entry.ts __ENTRY__` + `appendGlobals.ts` ENTRY_GLOBALS top-level-shim mechanism for new editor globals (`refreshAll`/`installTrigger`/`removeTrigger`)
- `.planning/phases/02-layout-builder/02-CONTEXT.md` — `dashboardSheet.js` structure model + `MAX_ZONE_A_ASSET_ROWS` / Zone A↔B boundary guard (status-block placement must respect this)

### Existing code to extend
- `apps-script/src/entry.ts` — uncomment/extend the reserved TODO slots for `refreshAll` / `installTrigger` / `removeTrigger`; providers already on `__PROVIDERS__`
- `apps-script/scripts/appendGlobals.ts` — add the 3 new names to the ENTRY_GLOBALS array (one-line-per-name pattern)
- `apps-script/src/HyperliquidApi.ts` `getHyperliquidData()` + `apps-script/src/JupiterApi.ts` `getJupiterData()` — the two functions `refreshAll()` calls; return `Record<id,{price,qty}>`
- `apps-script/src/Config.ts` — `REFRESH_INTERVAL_MINUTES` (5), `CACHE_TTL_SECONDS` (300), `ASSETS` registry (7 assets, ordered BTC/HYPE/XAUt = hyperliquid, IVVon/PST/ONyc/USDy = solana)
- `apps-script/appsscript.json` — `oauthScopes` currently only `script.external_request`; **add `spreadsheets` and `script.scriptapp`** for `SpreadsheetApp` writes + `ScriptApp` trigger management
- `layout-builder/src/dashboardSheet.js` — add the static status-block labels (D-05); Zone A = cols A–G rows 1–9(+), Zone B header row 12
- `.planning/codebase/ARCHITECTURE.md` / `CONVENTIONS.md` — single-batch-write rule, provider-isolation pattern, no-SDK rule
- `CLAUDE.md` (root) — Bun-first tooling, RTK prefix, two-runtime boundary

### External API specs (used by the providers, for reference)
- Hyperliquid info endpoint, Jupiter `price/v3` + `ultra/v1/balances` — already wired in Phase 3; Phase 4 does not call them directly (calls the providers)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `getHyperliquidData()` / `getJupiterData()` — drop-in; `refreshAll()` merges their two `Record<id,{price,qty}>` maps into one ordered-by-`ASSETS` write array.
- `entry.ts` / `appendGlobals.ts` shim mechanism — reuse verbatim for the 3 new globals; do not invent a new global mechanism.
- `dashboardSheet.js` label/format request-builder helpers (`labelRowRequest`, etc.) — reuse to stamp the static status labels (D-05).
- `MAX_ZONE_A_ASSET_ROWS` guard pattern — the status-block placement (D-06) sits in fixed columns precisely to avoid this row-collision class.

### Established Patterns
- Single batched `setValues` (never cell-by-cell) — REFRESH-02; D-08 keeps it to one call even under partial failure.
- Per-provider independent `try/catch` — composes with Phase 3 fail-loud (D-10/D-13): one venue's throw stales only that venue.
- `bun build --format=iife` + `appendGlobals.ts` post-build footer — new entry points need one line in `__ENTRY__` and one in ENTRY_GLOBALS.
- Static structure stamped by the layout builder; live data written by Apps Script — D-05 extends this exact split to status cells.

### Integration Points
- `refreshAll()` is the new orchestrator consuming both providers (the D-09 contract is the seam).
- `CacheService.getScriptCache()` — new runtime surface for the `PRICES_ALL` blob.
- `SpreadsheetApp.getActiveSpreadsheet()` (container-bound script, per PROJECT.md Key Decisions — no spreadsheet ID needed) — new write surface; the Dashboard tab is the target.
- `ScriptApp` time-based trigger — new surface for `installTrigger`/`removeTrigger`.
- One-time `layout-builder --update` re-run after this phase to materialize the new status labels (D-05).

</code_context>

<specifics>
## Specific Ideas

- **"Live PnL" drives the cache decision:** the user explicitly wants genuinely fresh numbers each run, not cached-within-TTL displays — hence fetch-first / cache-as-last-good (D-01), even though SC#3 reads cache-first on the surface.
- **A stale-but-real price beats a blank** (D-03/D-07): degradation never blanks or error-markers a value cell; worst case the cell holds an older real number with `Stale?=TRUE` next to it.
- **Status block is glanceable, per-venue, top-right** (D-04/D-06): the user wants to see at a glance *which* venue is behind, not just that "something" is stale.

</specifics>

<deferred>
## Deferred Ideas

- `Value = Qty × Price` formula, P&L USD/%, color coding (conditional formatting), allocation zone math → **Phase 5** (the refresh write must leave col D and cols E–G alone per D-10 so Phase 5 formulas aren't clobbered).
- Who writes static `Target/Risk/APY` cells (registry-driven) — leaning Phase 5; flagged in D-10 for planner to confirm.
- USDC static $1.00 reserve — not in the asset registry; not a Phase 4 concern.
- Script-Property-overridable refresh interval — rejected for now (D-09); revisit only if retuning-without-rebuild becomes a real need.
- Retry/backoff inside a single failed venue fetch — not required; the 5-min trigger cadence is the retry.

None of these are scope creep into Phase 4 — they are explicitly later-phase or out-of-scope concerns surfaced while scoping the refresh layer.

</deferred>

---

*Phase: 4-Refresh & Caching*
*Context gathered: 2026-06-17*
