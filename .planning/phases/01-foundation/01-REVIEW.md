---
phase: 01-foundation
reviewed: 2026-06-14T00:00:00Z
depth: standard
files_reviewed: 15
files_reviewed_list:
  - apps-script/scripts/appendGlobals.ts
  - apps-script/src/Config.ts
  - apps-script/src/Hello.ts
  - apps-script/src/entry.ts
  - apps-script/src/globals.d.ts
  - apps-script/tsconfig.json
  - apps-script/appsscript.json
  - apps-script/package.json
  - layout-builder/src/config.js
  - layout-builder/package.json
  - assets.json
  - package.json
  - README.md
  - apps-script/README.md
  - layout-builder/README.md
findings:
  critical: 0
  warning: 5
  info: 4
  total: 9
status: issues_found
---

# Phase 1: Code Review Report

**Reviewed:** 2026-06-14
**Depth:** standard
**Files Reviewed:** 15
**Status:** issues_found

## Summary

Phase 1 scaffolds a two-runtime project: a local Node `layout-builder/` and a bundled
Apps Script data layer. The central, self-described risk of this phase — making an
imported/exported function callable as an editor-discoverable Apps Script global through
a `bun build --format=iife` bundle — was empirically verified and **works correctly**:

- `bun run build` produces `dist/Code.js`, inlines `assets.json` into the bundle (no
  runtime file dependency confirmed), and appends a top-level `function hello()` shim
  outside the IIFE.
- The hoisting interaction between the appended top-level `function hello()` and the
  IIFE's `globalThis.hello = hello` was traced: the IIFE's runtime assignment wins for
  `globalThis.hello`, and the editor-discoverable top-level shim delegates correctly
  through `globalThis.__ENTRY__.hello`. Both call paths return the real implementation.
- `bunx tsc --noEmit` passes clean against `apps-script/tsconfig.json`.
- `assets.json` targets sum to exactly 1.0; Node ESM JSON import in `layout-builder`
  verified. No secrets present in source.

No blockers. Findings are quality/robustness concerns: a documentation/mechanism
mismatch in `apps-script/README.md` that actively contradicts the working code, an
unvalidated JSON-to-typed-array cast, `"latest"` dependency pins, and untyped build
tooling.

## Warnings

### WR-01: apps-script/README.md documents a mechanism the code says does NOT work

**File:** `apps-script/README.md:16-30`
**Issue:** The README states the callability mechanism is plain `globalThis.hello = hello`:
> "a function is only callable from the editor if it exists as a top-level global ...
> `src/entry.ts` explicitly re-exposes callable functions by assigning them onto
> `globalThis`" with the example `globalThis.hello = hello; // now hello is a callable Apps Script global`.

This is precisely the mechanism that `entry.ts` (lines 6-13, 33-36) and
`appendGlobals.ts` (lines 4-13) explicitly document as INSUFFICIENT: the editor function
picker is populated by static analysis and "does NOT see runtime `globalThis.x = x`
assignments." The actual working mechanism is the post-build `appendGlobals.ts` shim
appended outside the IIFE. The README never mentions `appendGlobals.ts`, `__ENTRY__`, or
shims at all. A maintainer following the README would conclude `globalThis.hello = hello`
is sufficient, remove or skip the appendGlobals step, and silently break editor
discoverability — the exact failure this phase exists to prevent.
**Fix:** Update the "Build" section to describe the real two-part mechanism: (1) the IIFE
exposes implementations on `globalThis.__ENTRY__`, and (2) `scripts/appendGlobals.ts`
appends top-level `function` shims outside the IIFE that the editor picker discovers.
State that runtime `globalThis` assignment alone is NOT editor-visible. Cross-reference
the build script's second command (`bun scripts/appendGlobals.ts`).

### WR-02: ASSETS cast bypasses all type validation of assets.json

**File:** `apps-script/src/Config.ts:31`
**Issue:** `export const ASSETS: readonly Asset[] = assetsJson as readonly Asset[];`
casts raw JSON to the `Asset[]` type with no validation. The `Asset` interface marks
`ticker?`/`mint?` optional but documents an invariant ("present when venue ===
'hyperliquid'/'solana'") that nothing enforces. A `hyperliquid` asset missing `ticker`,
a `solana` asset missing `mint`, a `venue` typo, or a non-numeric `target`/`risk`/`apy`
would type-check clean and surface as a runtime failure (or silently wrong cost-basis
math) in Phase 3 providers, far from the source. `target` values summing to ≠ 1.0 would
also pass unnoticed. Same unvalidated re-export exists in `layout-builder/src/config.js:6-9`.
**Fix:** Add a lightweight validator invoked at module load (or a build-time check) that
asserts: each entry's `venue` is in the union; `hyperliquid` entries have a `ticker` and
`solana` entries have a `mint`; numeric fields are finite numbers; and `target` values
sum to ~1.0. Fail loudly with the offending `id`. Even a small `for` loop throwing on
violation converts a latent Phase-3 bug into an immediate, located error.

### WR-03: All dependencies pinned to "latest" — non-reproducible installs

**File:** `apps-script/package.json:10-11`, `layout-builder/package.json:10-11`, `package.json:11`
**Issue:** Every dependency uses `"latest"`: `@google/clasp`, `@types/google-apps-script`,
`googleapis`, `@types/bun`, and root `typescript ^5` is a peerDependency only. `bun.lock`
pins current resolutions, but `"latest"` means any `bun install` that ignores/refreshes
the lockfile (CI without committed lock, `bun update`, a teammate's fresh clone after a
new release) pulls unvetted new majors. `clasp` and `googleapis` are deploy/auth-path
tools — an unexpected major bump can break `clasp push` or auth, and is a supply-chain
exposure for credential-handling code.
**Fix:** Pin to caret ranges of known-good versions (e.g. `"googleapis": "^144.0.0"`,
`"@google/clasp": "^2.4.2"`, etc.) matching what `bun.lock` currently resolves, and
ensure `bun.lock` is committed (it is) and respected in CI (`bun install --frozen-lockfile`).

### WR-04: appendGlobals.ts is excluded from type-checking

**File:** `apps-script/tsconfig.json:31` (`"include": ["src"]`) vs `apps-script/scripts/appendGlobals.ts`
**Issue:** `appendGlobals.ts` lives in `scripts/`, outside the tsconfig `include: ["src"]`
glob, so it receives ZERO type-checking from `bunx tsc`. It also uses Bun APIs
(`Bun.file`, `Bun.write`, `import.meta.url`) while the apps-script tsconfig declares only
`types: ["google-apps-script"]`, so even if included it would not type-check against the
right ambient types. This is the load-bearing build step that guarantees editor
discoverability; a typo in `ENTRY_GLOBALS`, the sentinel, or the shim template string
would not be caught until a manual build/deploy. The hardcoded `ENTRY_GLOBALS = ["hello"]`
must also be kept manually in sync with `entry.ts`'s `__ENTRY__` object — a duplication
the comments acknowledge but nothing verifies.
**Fix:** Either add a dedicated tsconfig for `scripts/` with `types: ["bun"]` and wire it
into the type-check step, or derive `ENTRY_GLOBALS` from a single shared source so the
shim list and `__ENTRY__` keys cannot drift. Minimum: add `scripts` to a checked glob so
the file is at least syntax/type-validated in CI.

### WR-05: Empty oauthScopes will block the next phase and has no documented gate

**File:** `apps-script/appsscript.json:5`
**Issue:** `"oauthScopes": []` is intentional and correct for the Phase 1 `hello()` smoke
test (Logger needs no scope). However, the project conventions (CLAUDE.md / architecture
notes) require scopes `spreadsheets`, `external_request`, `cloud-platform`,
`script.scriptapp` for the real data layer. Nothing in the manifest, README, or a TODO
flags that this empty array is a deliberate Phase-1-only placeholder that MUST be
populated before `refreshAll`/providers/triggers land. With the comment-free manifest,
the empty scope set reads as a finished config and risks silently shipping a data layer
that fails at runtime on the first `SpreadsheetApp`/`UrlFetchApp`/Secret Manager call.
**Fix:** Add a clear marker that scopes are intentionally empty for Phase 1 — e.g. a
`TODO(Phase 3)` note in `apps-script/README.md` listing the required scopes, and/or track
it in the phase plan so the manifest is updated alongside the first scope-gated entry
point.

## Info

### IN-01: Redundant dual-exposure of hello (globalThis.hello + __ENTRY__ + shim)

**File:** `apps-script/src/entry.ts:31-36`
**Issue:** `hello` is exposed three ways: `globalThis.__ENTRY__.hello`, `globalThis.hello`,
and (post-build) the top-level shim. The shim delegates through `__ENTRY__`, while
`globalThis.hello` is set to the impl directly. Only `__ENTRY__` (for the shim) and the
shim itself are strictly required for editor callability. The bare `globalThis.hello`
line is documented as "harmless" but adds a third path with no consumer, which can
confuse future maintainers about which mechanism is authoritative.
**Fix:** Consider dropping the bare `globalThis.hello = hello` (and its `globals.d.ts`
declaration) once the shim mechanism is the documented contract, or keep it but annotate
that it is NOT the editor-callable path.

### IN-02: __ENTRY__ namespace global is untyped (cast via `as any`)

**File:** `apps-script/src/entry.ts:31`
**Issue:** `(globalThis as any).__ENTRY__ = { hello };` uses `as any`, so the namespace
object that the whole shim mechanism depends on has no type. A typo in a future entry
name (e.g. `refreshAl`) would not be caught.
**Fix:** Declare `var __ENTRY__: { hello: () => string; ... }` in `globals.d.ts` and drop
the `as any`, so additions to the namespace are type-checked against the documented set.

### IN-03: SPREADSHEET_ID placeholder has no guard against accidental runs

**File:** `layout-builder/src/config.js:16`
**Issue:** `SPREADSHEET_ID = "PLACEHOLDER_SPREADSHEET_ID"` is a sentinel. Phase 2's
`--build`/`--update` will consume it; if the developer forgets to set it, the Sheets API
call fails with an opaque error rather than a clear "configure SPREADSHEET_ID" message.
**Fix:** When Phase 2 wires the CLI, assert `SPREADSHEET_ID !== "PLACEHOLDER_SPREADSHEET_ID"`
at entry and exit with a clear message. (Noting now so it is not forgotten.)

### IN-04: assets.json carries Phase-3 placeholders that are structurally valid but semantically inert

**File:** `assets.json:21,29,37,45,53` (`PLACEHOLDER_TICKER_phase3`, `PLACEHOLDER_MINT_phase3`)
**Issue:** Per phase context these placeholders are intentional, so this is not a defect.
Flagged only because the duplicate `PLACEHOLDER_MINT_phase3` across four solana entries
means WR-02's suggested validation must allow placeholders during Phase 1/2 but reject
them before Phase 3 fetches run.
**Fix:** When adding the WR-02 validator, scope the "real mint/ticker required" check to
Phase 3+ (or gate it behind a flag), so placeholders pass now but fail before live fetches.

---

_Reviewed: 2026-06-14_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
