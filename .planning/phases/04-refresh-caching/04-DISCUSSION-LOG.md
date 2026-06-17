# Phase 4: Refresh & Caching - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-17
**Phase:** 4-Refresh & Caching
**Areas discussed:** Cache role & TTL, Status cells design, Degradation edge cases, Interval config

---

## Cache role & TTL

### What is the PRICES_ALL cache primarily FOR?

| Option | Description | Selected |
|--------|-------------|----------|
| Last-good fallback | Always fetch live every run (~4 calls); overwrite cache on success; read cache only when a provider fails, to keep showing last-good values. Cache = degradation buffer. | ✓ |
| Cache-first (skip fetch in TTL) | If blob younger than TTL, write cached values and skip the live fetch; only fetch on miss. Saves calls but shows stale numbers until TTL expires. | |

**User's choice:** Last-good fallback
**Notes:** Aligns with the core value "live PnL refreshed automatically." Rate limits are a non-issue at ~4 calls/5 min. Resolves the SC#3 literal-reading ambiguity.

### When a venue is failing, how long to show cached values / when does Stale? flip?

| Option | Description | Selected |
|--------|-------------|----------|
| Show last-good, flag immediately | On failure, keep last-good values, set venue Stale?=TRUE now, freeze LastUpdated at last success. No TTL-based blanking. | ✓ |
| Grace window before flagging stale | Keep Stale?=FALSE through brief blips; flip only after last success older than CACHE_TTL_SECONDS. | |

**User's choice:** Show last-good, flag immediately
**Notes:** A stale-but-real price beats a blank. Implies per-venue freeze → per-venue status (carried into next area).

---

## Status cells design

### How granular should the status row(s) be?

| Option | Description | Selected |
|--------|-------------|----------|
| Per-venue: 2 status lines | One LastUpdated + Stale? pair for Hyperliquid, one for Solana/Jupiter. | ✓ |
| Single global status | One LastUpdated + Stale? for the whole refresh. | |
| Per-asset status | A Stale? indicator on every Zone A asset row. | |

**User's choice:** Per-venue: 2 status lines
**Notes:** Directly satisfies SC#4 (other providers still show last-good); matches the per-venue freeze.

### Which runtime owns static labels vs dynamic values?

| Option | Description | Selected |
|--------|-------------|----------|
| Layout builder stamps labels, Apps Script writes values | dashboardSheet.js gets static status labels; refreshAll() writes only timestamp + flag. Clean build-time/run-time split. Needs one-time `--update`. | ✓ |
| Apps Script writes labels + values | refreshAll()/setup writes both; layout builder untouched but structure ownership splits across runtimes. | |

**User's choice:** Layout builder stamps labels, Apps Script writes values
**Notes:** Keeps the two-runtime boundary clean; Phase 5 already extends dashboardSheet.js.

### Where on the Dashboard should the status block sit?

| Option | Description | Selected |
|--------|-------------|----------|
| Top-right, fixed | Free columns right of Zone A (cols ~I–K, rows 1–3). Column-anchored, never floats with registry. | ✓ |
| Below Zone B, computed offset | A couple rows under the Zone B TOTALS row; reads as a footer but floats with asset count and is below the fold. | |

**User's choice:** Top-right, fixed
**Notes:** Columns don't shift with asset count; avoids the Zone A↔B row-collision guard entirely.

---

## Degradation edge cases

### Cold start — provider fails with NO cached last-good. What goes in Qty/Price?

| Option | Description | Selected |
|--------|-------------|----------|
| Leave cells untouched + Stale?=TRUE | Don't write that venue's Qty/Price; Stale?=TRUE, LastUpdated blank/"never". A failure never writes a non-number. | ✓ |
| Write explicit error marker | Put 'ERR'/'#N/A' in cells; obvious but cascades into Phase 5 Value=Qty×Price as #VALUE. | |

**User's choice:** Leave cells untouched + Stale?=TRUE
**Notes:** Derived mechanic (not asked, follows from "never overwrite good data"): single setValues sources each venue's cells from live → cache last-good → current sheet values, so a failure never clears a good value and the write stays one call.

---

## Interval config

### How configurable should the refresh interval be?

| Option | Description | Selected |
|--------|-------------|----------|
| Compiled constant, 5 min | REFRESH_INTERVAL_MINUTES = 5 in Config.ts; change = edit + rebuild + redeploy + reinstall. | ✓ |
| Script Property override | installTrigger() reads a Script Property if set, else the constant; retune without rebuild, but needs validation against {1,5,10,15,30}. | |

**User's choice:** Compiled constant, 5 min
**Notes:** Personal tracker rarely retunes; one source of truth. installTrigger() must be idempotent (remove existing refreshAll trigger before creating).

---

## Claude's Discretion

- Which columns the single setValues spans (default Qty+Price only, leaving Value/Target/Risk/APY for Phase 5).
- Whether refresh writes static Target/Risk/APY (default: no, Phase 5 owns it).
- Exact PRICES_ALL blob JSON shape (per-venue keys + timestamps).
- Exact status-cell columns/rows within the top-right region; timestamp format (Asia/Jakarta).
- Whether to also expose manual `refreshAll()` for editor testing.

## Deferred Ideas

- Value formula, P&L USD/%, color coding, allocation math → Phase 5.
- Static Target/Risk/APY ownership → leaning Phase 5.
- USDC static $1.00 reserve → not in registry, out of scope.
- Script-Property-overridable interval → revisit only if needed.
- Per-fetch retry/backoff → not needed; the 5-min trigger is the retry.
