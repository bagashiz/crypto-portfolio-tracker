# Phase 1: Foundation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-14
**Phase:** 1-Foundation
**Areas discussed:** Apps Script bundling, Asset registry shape, Repo orchestration, Deploy + smoke test

---

## Apps Script bundling

| Option | Description | Selected |
|--------|-------------|----------|
| esbuild single bundle | Author with import/export; one Code.js; entry fns re-exposed on globalThis | ✓ (strategy) |
| Per-file tsc, global scope | No import/export; 1:1 .ts→.js; global-scope concatenation linking | |

**User's choice:** Single-bundle strategy. On the follow-up bundler question, chose **`bun build --format=iife`** (native Bun bundler) over `bunx esbuild` — to honor CLAUDE.md's "use bun build, not esbuild" rule and avoid an extra dependency.
**Notes:** Critical risk flagged: must verify at deploy that the IIFE output exposes imported/exported entry functions as callable Apps Script globals.

---

## Asset registry shape

| Option | Description | Selected |
|--------|-------------|----------|
| One shared JSON, both import | Single assets.json at repo root; both runtimes import; bun build inlines into Code.js | ✓ (final) |
| Two configs, one per runtime | Separate config per runtime; honors strict boundary literally; drift risk | (initial, reversed) |

**User's choice:** Initially selected "two configs per runtime" for strict isolation. When presented with a drift-guard follow-up (Bun parity test vs comment-only), the user responded **"change my mind, single json file"** — reversing to the single shared `assets.json`.
**Notes:** Reversal rationale: a single source of truth removes the drift problem entirely rather than guarding against it. The drift-guard question became moot. Confirmed the shared JSON is build-time data and does not violate the two-runtime dependency-set boundary.

---

## Repo orchestration

| Option | Description | Selected |
|--------|-------------|----------|
| Bun workspace at root | root workspaces: [layout-builder, apps-script]; one bun install; scripts delegate | ✓ |
| Three independent installs | No root workspace; install/run in each subdir; max isolation | |

**User's choice:** Bun workspace at root.
**Notes:** Pairs naturally with the root-level shared assets.json. Declared dependency sets remain isolated per package — workspace linking must not mix googleapis into apps-script.

---

## Deploy + smoke test

| Option | Description | Selected |
|--------|-------------|----------|
| Bare global + Logger.log | hello() export re-exposed on globalThis, returns string + Logger.log; proves toolchain only | ✓ |
| Reads a Script Property | hello() also reads PropertiesService; proves scopes + props but pulls Phase 3 setup early | |

**User's choice:** Bare global + Logger.log (asked for the recommendation; chose it after the tradeoff was explained).
**Notes:** Tradeoff framed as: bare = "does my build pipeline produce a callable global?" (the Phase 1 question) vs Script Property = "does build + OAuth + PropertiesService work?" (a Phase 3 question asked too early). Scopes/PropertiesService/Secret Manager deliberately deferred to Phase 3. `deploy` = bun build → copy appsscript.json → clasp push.

---

## Claude's Discretion

- Exact directory/file naming within each runtime (beyond established conventions).
- Per-runtime README content/structure.
- Minimal `appsscript.json` contents for Phase 1 (timezone + minimal scopes).
- clasp auth flow specifics (login, script ID provisioning).

## Deferred Ideas

- Full OAuth scope set in `appsscript.json` — Phase 3.
- PropertiesService / Secret Manager setup — Phase 3.
- Sheet layout, validations, formulas — Phases 2 and 5.
