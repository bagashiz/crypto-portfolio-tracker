---
phase: 01-foundation
plan: 02
type: execute
wave: 2
depends_on: ["01-01"]
files_modified:
  - apps-script/package.json
  - apps-script/tsconfig.json
  - apps-script/README.md
  - apps-script/appsscript.json
  - apps-script/src/Config.ts
  - apps-script/src/Hello.ts
  - apps-script/src/entry.ts
autonomous: false
requirements: [SETUP-02, CONFIG-01]
must_haves:
  truths:
    - "Apps Script source is authored with normal import/export between files (D-01)"
    - "bun build --format=iife bundles all source into one flat apps-script/dist/Code.js (D-02)"
    - "entry.ts imports modules and assigns refreshAll, installTrigger, removeTrigger, hello to globalThis (D-03)"
    - "assets.json is inlined into Code.js by bun build — Apps Script has no runtime file dependency (D-05)"
    - "deploy script runs bun build then copies appsscript.json into dist then clasp push (D-10)"
    - "hello() is a bare global returning a string and Logger.log-ing it, with no scope-gated API or Script Property access (D-11, D-12)"
    - "After clasp push, hello() is callable from the Apps Script editor without errors (SETUP-02)"
  artifacts:
    - path: "apps-script/package.json"
      provides: "apps-script package with isolated clasp/typings deps + build & deploy scripts"
      contains: "@google/clasp"
    - path: "apps-script/src/entry.ts"
      provides: "globalThis trigger-global assignments and module imports"
      contains: "globalThis"
    - path: "apps-script/src/Hello.ts"
      provides: "hello() smoke-test function (export)"
      contains: "hello"
    - path: "apps-script/src/Config.ts"
      provides: "Apps Script asset registry sourced from the shared assets.json"
      contains: "assets"
    - path: "apps-script/appsscript.json"
      provides: "Minimal Apps Script manifest (timezone, minimal scopes)"
      contains: "timeZone"
    - path: "apps-script/tsconfig.json"
      provides: "Apps Script TS config for type-checking source"
  key_links:
    - from: "apps-script/src/entry.ts"
      to: "globalThis"
      via: "global assignment of hello/refreshAll/installTrigger/removeTrigger"
      pattern: "globalThis\\.(hello|refreshAll|installTrigger|removeTrigger)"
    - from: "apps-script/src/Config.ts"
      to: "assets.json"
      via: "import of the shared root registry, inlined by bun build"
      pattern: "assets"
    - from: "apps-script/package.json"
      to: "apps-script/dist/Code.js"
      via: "bun build --format=iife in the build/deploy script"
      pattern: "format=iife"
---

<objective>
Stand up the Apps Script TypeScript toolchain and prove it end-to-end: author source with normal import/export (D-01), bundle to one flat `dist/Code.js` with `bun build --format=iife` (D-02), expose trigger/entry globals via `entry.ts` assigning to `globalThis` (D-03), inline the shared `assets.json` (D-05), wire a `deploy` script (build → copy manifest → `clasp push`, D-10), and verify the deployed `hello()` is callable from the Apps Script editor (SETUP-02, D-11).

Purpose: This is the primary risk of Phase 1 — proving Bun's IIFE bundle actually exposes imported/exported functions as callable Apps Script globals. Everything in Phases 3-5 (`refreshAll`, `installTrigger`, providers) depends on this bundling/deploy pattern working.
Output: `apps-script/` package (package.json, tsconfig.json, appsscript.json, README, src/Config.ts, src/Hello.ts, src/entry.ts), a successful `bun build` producing `dist/Code.js`, and a deployed, editor-callable `hello()`.
</objective>

<execution_context>
@/home/bagashiz/Projects/crypto-portfolio-tracker/.claude/gsd-core/workflows/execute-plan.md
@/home/bagashiz/Projects/crypto-portfolio-tracker/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/01-foundation/01-CONTEXT.md
@.planning/codebase/CONVENTIONS.md
@.planning/codebase/ARCHITECTURE.md
@CLAUDE.md
@assets.json
</context>

## Artifacts this phase produces (Plan 02 portion)

- **Files created:** `apps-script/package.json`, `apps-script/tsconfig.json`, `apps-script/appsscript.json`, `apps-script/README.md`, `apps-script/src/Config.ts`, `apps-script/src/Hello.ts`, `apps-script/src/entry.ts`. Build output `apps-script/dist/Code.js` (gitignored).
- **Functions:** `hello()` (exported from `Hello.ts`) — returns a string and `Logger.log`s it; pure toolchain smoke test, no scope-gated API, no Script Property read (D-11, D-12). Phase 3/4 will add `refreshAll`, `installTrigger`, `removeTrigger`.
- **`entry.ts` globalThis assignments (D-03):** `globalThis.hello = hello` now; placeholder / TODO references for `globalThis.refreshAll`, `globalThis.installTrigger`, `globalThis.removeTrigger` are noted here as the trigger entry points land in later phases. Only `hello` must be live and callable this phase.
- **`apps-script/package.json` scripts:** `build` (body: `bun build src/entry.ts --format=iife --outfile=dist/Code.js`), `deploy` (body: build → copy `appsscript.json` into `dist/` → `clasp push`). Exact copy mechanism at executor discretion (e.g. a small Bun/`cp` step).
- **`Config.ts`:** imports the shared root `assets.json` (inlined by bun build, D-05) and exposes the registry to Apps Script code — one-line asset change, no per-runtime duplication (CONFIG-01).

<tasks>

<task type="auto">
  <name>Task 1: Author Apps Script package, source modules, and entry.ts globalThis wiring</name>
  <files>apps-script/package.json, apps-script/tsconfig.json, apps-script/appsscript.json, apps-script/README.md, apps-script/src/Config.ts, apps-script/src/Hello.ts, apps-script/src/entry.ts</files>
  <read_first>
    - assets.json (repo root — the registry Config.ts imports; created by Plan 01)
    - .planning/phases/01-foundation/01-CONTEXT.md (D-01, D-02, D-03, D-05, D-09, D-10, D-11, D-12 — bundling/deploy/smoke-test decisions)
    - .planning/codebase/CONVENTIONS.md (PascalCase apps-script filenames, camelCase functions, verbatimModuleSyntax → import type)
    - .planning/codebase/ARCHITECTURE.md (global-scope constraint, no-SDK rule, entry points refreshAll/installTrigger)
    - tsconfig.json (root — base strict flags to extend for the apps-script tsconfig)
  </read_first>
  <action>
    SETUP-02 / D-09: Create `apps-script/package.json` as a workspace member. `name` of `apps-script` (matches root glob), `type` of `module`, `private` true. Declare in `devDependencies`: `@types/google-apps-script` and `@google/clasp` (latest). Declare NOTHING from layout-builder (no `googleapis`) — dependency sets stay isolated (D-09). Add `scripts`: `build` with body `bun build src/entry.ts --format=iife --outfile=dist/Code.js`, and `deploy` with body that runs build, then copies `appsscript.json` into `dist/`, then runs `clasp push` (D-10). The copy step may chain via `&&` or a tiny Bun script; keep it in this package's scripts so the root `deploy` delegate (`bun run --filter apps-script deploy`) resolves to it.

    D-01 source with normal import/export: Create `apps-script/src/Hello.ts` exporting a `hello()` function (camelCase) that returns a fixed string (e.g. a "Phase 1 toolchain OK" message) AND calls `Logger.log` with that string. D-11/D-12 CRITICAL: `hello()` must NOT read a Script Property, must NOT call any scope-gated API (no SpreadsheetApp, no PropertiesService, no Secret Manager, no UrlFetchApp) — it is a pure toolchain smoke test. `Logger` is allowed (no scope gate).

    CONFIG-01 / D-05: Create `apps-script/src/Config.ts` that imports the shared root `assets.json` (relative import `../../assets.json` with a JSON import attribute) and exports the asset registry (and any apps-script-only constants like refresh interval / cache TTL placeholders if trivial). Because `bun build` inlines JSON, Apps Script has NO runtime file dependency on `assets.json` (D-05). Use `import type` for any type-only imports (verbatimModuleSyntax).

    D-03 entry.ts: Create `apps-script/src/entry.ts` that imports `hello` from `./Hello` (and imports `Config` so it is included in the bundle), then assigns `globalThis.hello = hello`. Also add commented-out / TODO placeholder assignments for `globalThis.refreshAll`, `globalThis.installTrigger`, `globalThis.removeTrigger` referencing the future phase that lands them — only `hello` is live this phase. This file is the single `bun build` entry point.

    tsconfig: Create `apps-script/tsconfig.json` extending the root strict flags but suited to apps-script — set `types` to include `google-apps-script` (so `Logger`, `GoogleAppsScript` globals type-check) and drop `bun`. Keep `strict`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`, `allowImportingTsExtensions`, and JSON-import support (`resolveJsonModule`) so the `assets.json` import type-checks. `noEmit` true (Bun bundles; tsc is type-check only).

    appsscript.json (Claude's Discretion per CONTEXT): Create `apps-script/appsscript.json` with a `timeZone` and `runtimeVersion` of `V8`. Use a MINIMAL or empty `oauthScopes` set — no scope-gated API is called in Phase 1 (full scopes land in Phase 3 per the deferred list). Do NOT add `spreadsheets`/`cloud-platform`/`external_request` scopes yet.

    README: Create `apps-script/README.md` documenting the build (`bun build --format=iife` → flat `dist/Code.js`), the `entry.ts` → `globalThis` pattern for exposing trigger globals, the deploy flow (build → copy manifest → `clasp push`), and that clasp auth + script ID provisioning are a one-time human setup (`clasp login`, `.clasp.json` gitignored).
  </action>
  <verify>
    <automated>cd /home/bagashiz/Projects/crypto-portfolio-tracker && bun -e "const p=require('./apps-script/package.json'); const d={...p.dependencies,...p.devDependencies}; if(!d['@google/clasp']||!d['@types/google-apps-script'])process.exit(1); if(d.googleapis)process.exit(2); if(!p.scripts||!/format=iife/.test(p.scripts.build||''))process.exit(3); console.log('AS_PKG_OK')" && grep -Eq 'globalThis\.hello' apps-script/src/entry.ts && echo ENTRY_OK && grep -q 'assets.json' apps-script/src/Config.ts && echo CONFIG_OK && bun -e "const m=require('./apps-script/appsscript.json'); if(!m.timeZone)process.exit(1); console.log('MANIFEST_OK')"</automated>
  </verify>
  <acceptance_criteria>
    - `apps-script/package.json` declares `@google/clasp` and `@types/google-apps-script` and does NOT declare `googleapis` (D-09)
    - `apps-script/package.json` `scripts.build` body contains `bun build src/entry.ts --format=iife --outfile=dist/Code.js` (D-02)
    - `apps-script/package.json` `scripts.deploy` runs build, copies `appsscript.json` into `dist/`, then `clasp push` (D-10)
    - `apps-script/src/Hello.ts` exports `hello()` returning a string and calling `Logger.log`; it references NONE of: PropertiesService, SpreadsheetApp, UrlFetchApp, Secret Manager (D-11, D-12)
    - `apps-script/src/entry.ts` imports `hello` and assigns `globalThis.hello = hello` (D-03); grep `globalThis\.hello` matches
    - `apps-script/src/Config.ts` imports the root `assets.json` (grep `assets.json` matches) — registry not duplicated (CONFIG-01 / D-05)
    - `apps-script/appsscript.json` has a `timeZone`, `runtimeVersion` of `V8`, and a minimal/empty `oauthScopes` (no spreadsheets/cloud-platform scopes — deferred to Phase 3)
    - `apps-script/tsconfig.json` exists with `strict` and google-apps-script types
  </acceptance_criteria>
  <done>apps-script package + source + entry.ts globalThis wiring authored; isolated deps; minimal manifest.</done>
</task>

<task type="auto">
  <name>Task 2: Install workspace, build the IIFE bundle, and assert globals/inlining in dist/Code.js</name>
  <files>apps-script/dist/Code.js</files>
  <read_first>
    - apps-script/package.json (the build script created in Task 1)
    - apps-script/src/entry.ts (the bundle entry point)
    - apps-script/src/Hello.ts (the function that must survive into the bundle)
    - .planning/phases/01-foundation/01-CONTEXT.md (D-02, D-03, D-05, D-08, D-09 — build + workspace isolation)
  </read_first>
  <action>
    SETUP-01 / D-08 / D-09: Run `bun install` at the repo root to link the Bun workspace (both `layout-builder` and `apps-script`). Then assert isolation: `googleapis` must NOT appear in `apps-script/package.json` declared deps, and the apps-script package's declared deps must not include layout-builder's. (Workspace linking is allowed to hoist into the root `node_modules`; the assertion is about DECLARED deps per package, not the hoisted tree — D-09.)

    D-02 build: Run the apps-script build (`bun run --filter apps-script build`, which runs `bun build src/entry.ts --format=iife --outfile=dist/Code.js`). Confirm it exits 0 and produces `apps-script/dist/Code.js` as ONE flat file.

    D-03 globals assertion: Assert the built `dist/Code.js` contains a `globalThis.hello` assignment so the IIFE exposes `hello` as a callable Apps Script global. This is the primary-risk check — the bundle must surface the imported/exported function on `globalThis`.

    D-05 inlining assertion: Assert that the asset registry from `assets.json` is INLINED into `dist/Code.js` (grep for a known asset id such as `BTC` or `HYPE` that came from `assets.json`), proving Apps Script has no runtime file dependency on `assets.json`.

    Do NOT run `clasp push` in this task — that requires human auth and happens in the checkpoint (Task 3). This task is the local, automatable proof that the bundle is correct before deploy.
  </action>
  <verify>
    <automated>cd /home/bagashiz/Projects/crypto-portfolio-tracker && bun install && bun run --filter apps-script build && test -f apps-script/dist/Code.js && grep -Eq 'globalThis\.hello' apps-script/dist/Code.js && echo GLOBAL_IN_BUNDLE && grep -Eq 'BTC|HYPE' apps-script/dist/Code.js && echo ASSETS_INLINED && bun -e "const p=require('./apps-script/package.json'); if((p.dependencies&&p.dependencies.googleapis)||(p.devDependencies&&p.devDependencies.googleapis))process.exit(1); console.log('DEPS_ISOLATED')"</automated>
  </verify>
  <acceptance_criteria>
    - `bun install` at root links the workspace without error; `apps-script/package.json` declared deps contain NO `googleapis` (D-09)
    - `bun run --filter apps-script build` exits 0 and produces `apps-script/dist/Code.js` as a single flat file (D-02)
    - `apps-script/dist/Code.js` contains a `globalThis.hello` assignment — `grep -E 'globalThis\.hello' apps-script/dist/Code.js` exits 0 (D-03, primary risk)
    - `apps-script/dist/Code.js` contains an inlined asset id from `assets.json` (`grep -E 'BTC|HYPE'` exits 0) — no runtime file dependency (D-05)
    - `git check-ignore apps-script/dist/Code.js` exits 0 — the build output is ignored (SEC-03 carry-over)
  </acceptance_criteria>
  <done>Workspace linked with isolated deps; IIFE bundle built; globals + assets inlining proven in dist/Code.js locally.</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 3: Deploy via clasp and verify hello() is callable from the Apps Script editor</name>
  <files>apps-script/.clasp.json, apps-script/dist/Code.js, apps-script/dist/appsscript.json</files>
  <what-built>
    The Apps Script toolchain is complete locally: `apps-script/src/entry.ts` assigns `globalThis.hello`, `bun build --format=iife` produced `apps-script/dist/Code.js` (verified to contain the `globalThis.hello` global and inlined assets), and the `deploy` script (build → copy `appsscript.json` into `dist/` → `clasp push`) is wired. This checkpoint proves the deployed bundle exposes `hello()` as a callable Apps Script global — the primary risk of Phase 1 (D-03, SETUP-02).
  </what-built>
  <action>
    This is a human-verify checkpoint — Claude has already automated the build (Task 1-2). The human performs the one-time clasp auth and runs the deploy + editor smoke test described in `<how-to-verify>`. No further code changes are made unless `hello` fails to appear as a global, in which case revisit the `entry.ts` → `globalThis` pattern and the `--format=iife` output.
  </action>
  <how-to-verify>
    One-time setup (if not already done): run `bunx clasp login` to authenticate, and provision a script ID (`bunx clasp create --type standalone --rootDir dist` or `bunx clasp clone <existing-script-id> --rootDir dist`). The generated `.clasp.json` is already gitignored (SEC-03).
    1. From `apps-script/`, run the deploy: `bun run deploy` (build → copy `appsscript.json` into `dist/` → `clasp push`). Confirm `clasp push` reports the pushed files (including `Code.js` and `appsscript.json`) with no errors.
    2. Open the Apps Script editor (`bunx clasp open` or the script URL).
    3. In the editor's function dropdown, select `hello` and click Run.
    4. Open Executions / View > Logs and confirm the `Logger.log` line from `hello()` appears, and the run completes with NO authorization prompt and NO error (because `hello()` touches no scope-gated API — D-11/D-12).

    Expected: `hello` appears as a selectable top-level function, runs cleanly, and logs its string. If `hello` is NOT in the function list, the IIFE did not expose the global — that is the exact failure this phase exists to catch; report it.
  </how-to-verify>
  <verify>
    <human-check>hello() is selectable and runs from the Apps Script editor, logs its string, and completes with no authorization prompt or error (D-03, D-11, D-12, SETUP-02)</human-check>
  </verify>
  <acceptance_criteria>
    - `clasp push` of `dist/` (containing `Code.js` + `appsscript.json`) completes without error (SETUP-02)
    - `hello` is selectable as a top-level function in the Apps Script editor and runs without an authorization prompt or error (D-03, D-11, D-12)
    - The `Logger.log` output from `hello()` is visible in the execution log (D-11)
  </acceptance_criteria>
  <done>Deployed bundle exposes hello() as a callable Apps Script global that logs cleanly with no scope prompt.</done>
  <resume-signal>Type "approved" if hello() ran and logged from the editor, or describe the failure (e.g. "hello not in function list").</resume-signal>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| local build → Apps Script (clasp push) | Pushed `dist/` becomes executable in Google's runtime; only intended files should ship |
| local repo → git remote | `.clasp.json` (script ID) and `dist/` must never be committed |
| Apps Script function → Google APIs | `hello()` must not cross any scope boundary this phase (deferred to Phase 3) |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-01-03 | Information Disclosure | `.clasp.json` (script ID), `apps-script/dist/` | mitigate | Both are already gitignored (verified in Plan 01, SEC-03). Task 2 asserts `git check-ignore apps-script/dist/Code.js` exits 0 before any push. |
| T-01-04 | Elevation of Privilege | `appsscript.json` oauthScopes | mitigate | Ship a minimal/empty `oauthScopes` set in Phase 1; `hello()` calls no scope-gated API (D-11/D-12). Scopes are added only when a real call needs them (Phase 3), following least privilege. |
| T-01-05 | Spoofing | clasp auth (`clasp login`) | accept | One-time interactive Google auth in the human-verify checkpoint; credentials handled by clasp/Google, not stored in repo. |
| T-01-SC | Tampering | npm/bun installs (`@google/clasp`, `@types/google-apps-script`) | mitigate | First-party Google tooling/typings; no `[ASSUMED]`/`[SUS]` packages. `bun install` linking is exercised in Task 2; surface any unexpected transitive install in the SUMMARY. |
</threat_model>

<verification>
- `apps-script/package.json`: isolated clasp/typings deps + `bun build --format=iife` build script + deploy script (SETUP-02, D-09)
- `dist/Code.js` built from `entry.ts` contains `globalThis.hello` and inlined assets (D-02, D-03, D-05)
- Deployed `hello()` is callable from the Apps Script editor and logs cleanly with no scope prompt (SETUP-02, D-11, D-12)
- `Config.ts` sources the registry from the shared `assets.json` (CONFIG-01)
</verification>

<success_criteria>
- SETUP-02: Apps Script TS toolchain compiles `src/` to flat `dist/Code.js`; `clasp push` works; the deployed `hello()` is globally callable; `deploy` wires build + push
- CONFIG-01: Apps Script reads the asset registry from the single shared `assets.json` (one-line asset change, inlined at build)
</success_criteria>

<output>
Create `.planning/phases/01-foundation/01-02-SUMMARY.md` when done
</output>
