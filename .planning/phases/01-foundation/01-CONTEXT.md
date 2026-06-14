# Phase 1: Foundation - Context

**Gathered:** 2026-06-14
**Status:** Ready for planning

<domain>
## Phase Boundary

Scaffold both runtimes from the current `bun init` scaffold: create `layout-builder/` (Node + `googleapis`) and `apps-script/` (TypeScript → flat `dist/` via `clasp`), with secrets gitignored before any key file exists, the Apps Script toolchain compiling and deploying a trivial callable global, and a single asset config registry. Covers SETUP-01, SETUP-02, CONFIG-01, SEC-03.

**This phase does NOT:** wire any provider call, OAuth scope behavior, PropertiesService, Secret Manager, sheet layout, or refresh logic — those belong to Phases 2-5. The verification function is a pure toolchain smoke test, nothing more.

</domain>

<decisions>
## Implementation Decisions

### Apps Script bundling (SETUP-02)
- **D-01:** Author Apps Script source with **normal `import`/`export`** between files (`Config.ts`, `HyperliquidApi.ts`, `Refresh.ts`, etc.) — no global-scope concatenation style. Cross-file type-checking is wanted.
- **D-02:** Bundle to **one flat `dist/Code.js`** using **`bun build --format=iife`** (Bun's native bundler, per CLAUDE.md's "use bun build, not esbuild" rule — esbuild was explicitly rejected to avoid bending that convention).
- **D-03:** An **`entry.ts`** imports all modules and assigns trigger/entry functions (`refreshAll`, `installTrigger`, `removeTrigger`, `hello`) to `globalThis` so they compile to top-level Apps Script globals. **Critical correctness point to verify at deploy:** confirm the IIFE output actually exposes those globals as callable from the Apps Script editor. This is the primary risk of Phase 1.

### Asset registry (CONFIG-01)
- **D-04:** **Single shared `assets.json` at repo root** is the one source of truth — NOT two per-runtime configs. (User initially leaned two-config for strict isolation, then reversed when weighing drift risk: a single source removes the drift problem entirely rather than guarding against it.)
- **D-05:** `layout-builder/` imports `assets.json` as ESM; the Apps Script `entry.ts` imports it and **`bun build` inlines it into `Code.js`**, so Apps Script has **no runtime file dependency**. Adding/removing an asset is a one-line change in one file.
- **D-06:** This does **not** cross the two-runtime boundary — `assets.json` is build-time static data, not a shared dependency or shared module. The "never mixed dependency sets" constraint refers to declared npm deps, which stay isolated per package.
- **D-07:** Registry fields (superset; each runtime reads only what it needs): asset `id`, `venue` (`hyperliquid` | `solana`), `ticker` (HL) / `mint` (Solana), `target` allocation, `risk`, `apy`. Exact mint addresses + XAUt ticker are unconfirmed (Phase 3 blocker) — Phase 1 establishes the shape, not the verified values.

### Repo orchestration (SETUP-01)
- **D-08:** Root `package.json` declares a **Bun workspace**: `workspaces: ["layout-builder", "apps-script"]`. One `bun install` provisions both. Root scripts delegate (e.g., `bun run --filter apps-script deploy`).
- **D-09:** Declared dependency **sets stay isolated per package** — `layout-builder` declares `googleapis`; `apps-script` declares `@types/google-apps-script` + clasp tooling. Workspace linking must not pull `googleapis` into the apps-script package's declared deps.

### Deploy + smoke test (SETUP-02)
- **D-10:** `deploy` script = `bun build` (→ `dist/Code.js`) → copy `appsscript.json` into `dist/` → `clasp push`.
- **D-11:** Verification function is **bare global + `Logger.log`**: `hello()` authored as an `export` in a source file, re-exposed on `globalThis` by `entry.ts`, returns a string and `Logger.log`s it. It proves ONLY that the bundle exposes an imported/exported function as a callable Apps Script global.
- **D-12:** **Scopes / PropertiesService / Secret Manager are deliberately deferred to Phase 3.** `hello()` must NOT read a Script Property or hit any scope-gated API — keeping the Phase 1 smoke test scoped to the toolchain, not the data layer.

### Secrets / gitignore (SEC-03)
- **D-13:** `.gitignore` already covers `*.key.json`, `service-account.key.json`, `.clasp.json`, and `dist` (broad). Success criterion requires `apps-script/dist/` ignored — the existing broad `dist` pattern satisfies it; confirm `git status` shows those paths ignored **before** any key file is created.

### Claude's Discretion
- Exact directory/file naming within each runtime (beyond the PascalCase Apps Script / camelCase layout-builder conventions already in CONVENTIONS.md).
- Per-runtime README content/structure (SETUP-01 requires they exist).
- `appsscript.json` minimal contents for Phase 1 (timezone + a minimal/empty scope set is fine since no scope-gated API is called yet; full scopes land in Phase 3).
- clasp auth flow specifics (`clasp login`, script ID provisioning).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase requirements & boundaries
- `.planning/REQUIREMENTS.md` — SETUP-01, SETUP-02, CONFIG-01, SEC-03 (exact acceptance language)
- `.planning/ROADMAP.md` §"Phase 1: Foundation" — goal + 4 success criteria
- `.planning/PROJECT.md` — Constraints (two-runtime boundary, no SDKs, security boundary) and Key Decisions table

### Codebase maps (existing structure to extend)
- `.planning/codebase/STRUCTURE.md` — current scaffold layout and planned sub-project structure
- `.planning/codebase/CONVENTIONS.md` — naming (PascalCase Apps Script, camelCase layout-builder), code style, module-design rules per runtime
- `.planning/codebase/STACK.md` — toolchain, dependency expectations per runtime
- `.planning/codebase/ARCHITECTURE.md` — build-time vs run-time split, global-scope constraint, no-SDK rule
- `CLAUDE.md` (root) — Bun-first tooling rules ("use bun build, not esbuild"), RTK prefix, two-runtime boundary

No external ADRs/specs — requirements fully captured in the planning docs above and the decisions in this file.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- Root `tsconfig.json` (strict mode, `noEmit`, bundler resolution) — base for TS config; the apps-script package will need its own tsconfig variant emitting/targeting the bundle.
- Existing `.gitignore` already satisfies SEC-03 (covers `*.key.json`, `.clasp.json`, `dist`) — verify, don't rewrite.
- `index.ts` is a throwaway `bun init` hello-world — can be removed or repurposed; not load-bearing.

### Established Patterns
- Bun is the root toolchain; `mise.toml` pins bun + node (gitignored, local-only).
- Two-runtime isolation: `layout-builder/` (ESM Node, `googleapis`) vs `apps-script/` (TS → `dist/` via clasp, no npm at runtime).

### Integration Points
- `assets.json` at repo root becomes the shared build-time input for both runtimes (new integration surface introduced this phase, in addition to the Google Sheet at runtime).
- Bun workspace at root links the two sub-packages for install/scripts.

</code_context>

<specifics>
## Specific Ideas

- The `entry.ts` → `globalThis` pattern for exposing trigger globals from a bundled IIFE is the explicit mechanism the user chose; downstream agents should implement and verify exactly this, not fall back to per-file global-scope authoring.
- The user weighs maintainability (single source of truth) over literal interpretation of the "one config per runtime" wording in PROJECT.md/ARCHITECTURE.md — the shared `assets.json` decision supersedes those docs' per-runtime phrasing for this project.

</specifics>

<deferred>
## Deferred Ideas

- Full `appsscript.json` OAuth scope set (`spreadsheets`, `external_request`, `cloud-platform`, `script.scriptapp`) — wired in Phase 3 when the first scope-gated call lands.
- PropertiesService / Secret Manager setup — Phase 3.
- Any data-validation, sheet layout, or formula work — Phases 2 and 5.

None of these are scope creep into Phase 1 — they are explicitly later-phase concerns surfaced while scoping the smoke test.

</deferred>

---

*Phase: 1-Foundation*
*Context gathered: 2026-06-14*
