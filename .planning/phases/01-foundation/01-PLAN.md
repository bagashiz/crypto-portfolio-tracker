---
phase: 01-foundation
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - .gitignore
  - package.json
  - assets.json
  - README.md
  - layout-builder/package.json
  - layout-builder/README.md
  - layout-builder/src/config.js
autonomous: true
requirements: [SETUP-01, CONFIG-01, SEC-03]
must_haves:
  truths:
    - "git status shows *.key.json, .clasp.json, and apps-script/dist/ as ignored before any key file is created (SEC-03 / D-13)"
    - "Root package.json declares a Bun workspace covering layout-builder and apps-script (D-08)"
    - "A single assets.json at repo root is the one source of truth for the asset registry (D-04)"
    - "layout-builder/ exists with its own package.json declaring googleapis and a README (SETUP-01)"
    - "Adding/removing an asset is a one-line edit in assets.json — layout-builder imports it as ESM (CONFIG-01 / D-05)"
  artifacts:
    - path: "assets.json"
      provides: "Shared asset registry (single source of truth)"
      contains: "id"
    - path: "package.json"
      provides: "Root Bun workspace + delegating scripts"
      contains: "workspaces"
    - path: "layout-builder/package.json"
      provides: "layout-builder package with isolated googleapis dependency"
      contains: "googleapis"
    - path: "layout-builder/src/config.js"
      provides: "layout-builder config that imports the shared assets.json"
      contains: "assets.json"
    - path: "layout-builder/README.md"
      provides: "Per-runtime README (SETUP-01 requirement)"
    - path: "README.md"
      provides: "Root README describing the two-runtime layout"
  key_links:
    - from: "layout-builder/src/config.js"
      to: "assets.json"
      via: "ESM import of the shared registry"
      pattern: "assets\\.json"
    - from: "package.json"
      to: "layout-builder"
      via: "Bun workspace member"
      pattern: "layout-builder"
---

<objective>
Establish the two-runtime repo foundation: confirm secrets are gitignored BEFORE any key file exists (SEC-03), stand up the root Bun workspace (SETUP-01 / D-08), create the single shared `assets.json` registry (CONFIG-01 / D-04), and scaffold the `layout-builder/` package with its isolated `googleapis` dependency that consumes `assets.json` as ESM (CONFIG-01 / D-05).

Purpose: Nothing in this project can be built or deployed safely until the workspace exists and secrets are provably ignored. This plan delivers the structural skeleton and single-source-of-truth config that Plan 02 (Apps Script toolchain) builds on.
Output: Verified `.gitignore` coverage, root `package.json` workspace, `assets.json`, `layout-builder/` package (package.json + README + src/config.js), root README.
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
@.planning/codebase/STRUCTURE.md
@.planning/codebase/CONVENTIONS.md
@CLAUDE.md
</context>

## Artifacts this phase produces (Plan 01 portion)

- **Files created:** `assets.json` (repo root), `layout-builder/package.json`, `layout-builder/README.md`, `layout-builder/src/config.js`, `README.md` (root, updated).
- **Files modified:** root `package.json` (add `workspaces`, delegating scripts), `.gitignore` (verify only — do NOT rewrite per D-13).
- **`assets.json` schema fields (D-07):** each entry has `id` (string), `venue` (`"hyperliquid" | "solana"`), `ticker` (string, HL venue) OR `mint` (string, solana venue), `target` (number, allocation fraction), `risk` (number), `apy` (number). Exact mint/XAUt values are a Phase 3 blocker — use clearly-marked placeholder strings, not invented real addresses.
- **Root `package.json` keys added:** `workspaces: ["layout-builder", "apps-script"]`, and delegating scripts (e.g. `deploy` delegating to `bun run --filter apps-script deploy`).
- **`layout-builder/src/config.js` export:** an ESM module that imports `assets.json` and re-exports the asset list plus layout-builder-only settings (spreadsheet ID placeholder, sheet name constants). Exact identifier names at executor discretion within camelCase / UPPER_SNAKE_CASE conventions.

<tasks>

<task type="auto">
  <name>Task 1: Verify gitignore coverage and stand up root Bun workspace + shared assets.json</name>
  <files>.gitignore, package.json, assets.json, README.md</files>
  <read_first>
    - .gitignore (current — already covers *.key.json, service-account.key.json, .clasp.json, dist per D-13)
    - package.json (current root — name, module, type:module, private, devDependencies, peerDependencies)
    - .planning/phases/01-foundation/01-CONTEXT.md (D-04, D-05, D-06, D-07, D-08, D-13 decision blocks)
    - .planning/codebase/CONVENTIONS.md (camelCase layout-builder, UPPER_SNAKE_CASE config keys, 2-space/double-quote style)
  </read_first>
  <action>
    SEC-03 / D-13 FIRST (must precede any future key file): Do NOT rewrite `.gitignore` — it already covers `*.key.json`, `service-account.key.json`, `.clasp.json`, and broad `dist`. Confirm coverage by running the verify commands below. The broad `dist` pattern satisfies the `apps-script/dist/` requirement. Only if a verify command proves a path is NOT ignored may you add the missing exact pattern.

    D-08 workspace: Edit root `package.json` to add `workspaces` set to the array of `layout-builder` and `apps-script`. Keep existing `name`, `type` of `module`, `private` true, `devDependencies` (`@types/bun`), `peerDependencies` (`typescript ^5`). Add delegating root scripts under `scripts`: a `deploy` script whose body is `bun run --filter apps-script deploy`, and a `build:apps-script` script whose body is `bun run --filter apps-script build`. The throwaway `index.ts` from `bun init` may be removed (not load-bearing per CONTEXT code_context); if removed, drop or repoint the `module` field of `index.ts` — do not leave a dangling reference.

    D-04 / D-07 registry: Create `assets.json` at repo root as the single source of truth (NOT two per-runtime configs). It is a JSON array of asset objects. Each object has fields: `id`, `venue` (value `hyperliquid` or `solana`), `ticker` (for hyperliquid venue) or `mint` (for solana venue), `target`, `risk`, `apy`. Seed it with the known assets (BTC, HYPE, XAUt on hyperliquid; the four Solana assets IVVon/PST/ONyc/USDy on solana). Per D-07 and the STATE.md Phase 3 blocker, exact mint addresses and the XAUt ticker are UNCONFIRMED — use a clearly-marked placeholder string such as `PLACEHOLDER_MINT_phase3` for each `mint` and a placeholder for the XAUt `ticker`; confirm the shape only. Do NOT invent real-looking addresses. `target`/`risk`/`apy` may be reasonable placeholder numbers. Use 2-space indentation and double quotes (CONVENTIONS.md).

    D-06 boundary note: `assets.json` is build-time static data shared by both runtimes — it does NOT violate the "never mixed dependency sets" rule, which refers to declared npm deps only. Note this one line in the root README.

    Root README: Update `README.md` to describe the two-runtime layout (layout-builder = local Node + googleapis; apps-script = TS bundled to dist via clasp), that `assets.json` is the single shared registry, and that adding/removing an asset is a one-line edit in `assets.json`.
  </action>
  <verify>
    <automated>cd /home/bagashiz/Projects/crypto-portfolio-tracker && git check-ignore foo.key.json .clasp.json apps-script/dist/Code.js layout-builder/service-account.key.json && echo IGNORED_OK && bun -e "const a=require('./assets.json'); if(!Array.isArray(a)||a.length===0) process.exit(1); for(const x of a){for(const k of ['id','venue','target','risk','apy']){if(!(k in x))process.exit(2)}} console.log('ASSETS_OK')" && bun -e "const p=require('./package.json'); if(!Array.isArray(p.workspaces)||!p.workspaces.includes('layout-builder')||!p.workspaces.includes('apps-script'))process.exit(1); console.log('WORKSPACE_OK')"</automated>
  </verify>
  <acceptance_criteria>
    - `git check-ignore foo.key.json .clasp.json apps-script/dist/Code.js layout-builder/service-account.key.json` exits 0 (all four paths ignored) BEFORE any real key file exists (SEC-03 / D-13)
    - `.gitignore` is NOT rewritten — diff shows zero changes unless a verify command proved a gap (D-13)
    - `assets.json` exists at repo root, is a non-empty JSON array, and every entry contains keys `id`, `venue`, `target`, `risk`, `apy` (CONFIG-01 / D-07)
    - Every solana-venue entry uses a clearly-marked placeholder `mint` (no invented real address); every hyperliquid-venue entry has a `ticker` (D-07, Phase 3 blocker respected)
    - Root `package.json` `workspaces` array includes both `layout-builder` and `apps-script` (D-08)
    - Root `package.json` `scripts.deploy` body is `bun run --filter apps-script deploy` (D-08)
    - Root `README.md` documents the two-runtime layout and the single-source `assets.json` registry
  </acceptance_criteria>
  <done>gitignore coverage proven before any key exists; root workspace + shared assets.json + root README in place.</done>
</task>

<task type="auto">
  <name>Task 2: Scaffold layout-builder package consuming the shared assets.json</name>
  <files>layout-builder/package.json, layout-builder/README.md, layout-builder/src/config.js</files>
  <read_first>
    - assets.json (created in Task 1 — the registry this config imports)
    - package.json (root — confirm workspace member name matches the glob)
    - .planning/codebase/STRUCTURE.md (planned layout-builder/src layout: index.js, auth.js, dashboardSheet.js, dcaLogSheet.js, config.js)
    - .planning/codebase/CONVENTIONS.md (layout-builder = ESM Node, camelCase filenames, type:module)
    - .planning/phases/01-foundation/01-CONTEXT.md (D-05, D-06, D-09 — isolated deps)
  </read_first>
  <action>
    SETUP-01 / D-09: Create `layout-builder/package.json` as a workspace member. Set `name` to `layout-builder` (must match the root workspace glob), `type` to `module` (ESM Node per CONVENTIONS.md), `private` true. Declare `googleapis` in `dependencies` (latest). Declare NOTHING from the apps-script side here — `googleapis` stays isolated to this package (D-09). Add a `scripts` entry only if trivially useful (e.g. placeholder `build`/`update` scripts that echo "not implemented in Phase 1" — Phase 2 implements the real CLI). Do NOT implement the Sheets API logic this phase.

    CONFIG-01 / D-05: Create `layout-builder/src/config.js` as an ESM module that imports the shared registry via a relative path to the repo-root `assets.json` (e.g. an import of `../../assets.json` with a JSON import attribute; if the import-attribute form is environment-sensitive, fall back to reading the file via Bun.file, but prefer the static import so the dependency is explicit). Re-export the asset list plus layout-builder-only settings: a `SPREADSHEET_ID` placeholder constant (UPPER_SNAKE_CASE per CONVENTIONS.md), and sheet name constants (`DASHBOARD`, `DCA_LOG`). This proves the one-line-change property: assets live ONLY in `assets.json`, never duplicated here.

    SETUP-01: Create `layout-builder/README.md` documenting that this is the LOCAL-ONLY Node runtime, that `service-account.key.json` lives here and is gitignored (never pushed to Apps Script), that it imports the shared root `assets.json`, and that Phase 2 implements the actual `--build`/`--update` CLI.

    Do NOT run a full `bun install` here unless needed to satisfy verification — deps are declared; install/linking is exercised by Plan 02's verification.
  </action>
  <verify>
    <automated>cd /home/bagashiz/Projects/crypto-portfolio-tracker && bun -e "const p=require('./layout-builder/package.json'); if(!p.dependencies||!p.dependencies.googleapis)process.exit(1); if(p.dependencies['@types/google-apps-script']||p.dependencies['@google/clasp'])process.exit(2); console.log('LB_DEPS_OK')" && grep -q 'assets.json' layout-builder/src/config.js && echo CONFIG_IMPORTS_ASSETS && test -f layout-builder/README.md && echo README_OK</automated>
  </verify>
  <acceptance_criteria>
    - `layout-builder/package.json` declares `googleapis` in `dependencies` (SETUP-01)
    - `layout-builder/package.json` declares NONE of the apps-script deps (`@types/google-apps-script`, `@google/clasp`) — dependency sets stay isolated (D-09)
    - `layout-builder/package.json` has `type` of `module` and `name` matching the root workspace glob `layout-builder`
    - `layout-builder/src/config.js` imports/reads the repo-root `assets.json` (grep for `assets.json` matches) and re-exports the asset list — assets are NOT duplicated in config.js (CONFIG-01 / D-05)
    - `layout-builder/src/config.js` exports a `SPREADSHEET_ID` placeholder and sheet-name constants
    - `layout-builder/README.md` exists and documents the local-only runtime + gitignored service-account key (SETUP-01)
  </acceptance_criteria>
  <done>layout-builder package scaffolded with isolated googleapis dep and config importing the single shared assets.json.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| local repo → git remote | A committed secret (service-account key) leaks irreversibly once pushed |
| developer → filesystem | Key files will be created in later phases; must be ignored before they exist |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-01-01 | Information Disclosure | `service-account.key.json`, `*.key.json`, `.clasp.json`, `apps-script/dist/` | mitigate | Verify with `git check-ignore` that all four patterns are ignored BEFORE any key file is created (Task 1, SEC-03 / D-13). Do not rewrite `.gitignore`; only add an exact pattern if a check proves a gap. |
| T-01-02 | Tampering | npm installs (`googleapis`) | accept | `googleapis` is a first-party Google package with a RESEARCH legitimacy expectation; no `[ASSUMED]`/`[SUS]` packages introduced this phase. Install/linking happens via Bun workspace in Plan 02. |
| T-01-SC | Tampering | npm/bun installs | mitigate | No new unvetted packages in this plan; `googleapis` only is declared, not installed here. Legitimacy re-checked at install time in Plan 02. |
</threat_model>

<verification>
- `git check-ignore` proves `*.key.json`, `.clasp.json`, `apps-script/dist/` ignored before any key exists (SEC-03)
- `assets.json` is a valid non-empty array with the D-07 schema fields (CONFIG-01)
- Root `package.json` workspace includes both members (SETUP-01)
- `layout-builder/` has isolated `googleapis` dep + config importing `assets.json` + README (SETUP-01, CONFIG-01)
</verification>

<success_criteria>
- SEC-03: secrets provably gitignored before any key file is created
- SETUP-01 (partial): two-runtime skeleton begun — root workspace + layout-builder package with isolated deps + READMEs
- CONFIG-01: single shared `assets.json` registry; one-line asset change in layout-builder via import
</success_criteria>

<output>
Create `.planning/phases/01-foundation/01-01-SUMMARY.md` when done
</output>
