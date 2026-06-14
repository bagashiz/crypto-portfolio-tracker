# apps-script — Google Apps Script data layer

The scheduled data layer for the crypto portfolio tracker. Authored in TypeScript
with normal `import`/`export` between files, bundled to a single flat `dist/Code.js`,
and pushed to Google Apps Script via `clasp`.

This is a **separate runtime** from `layout-builder/`: it runs on Google's V8 (no npm,
no module resolution at runtime) and reaches external services only via `UrlFetchApp`.
It declares **none** of `layout-builder`'s dependencies (no `googleapis`).

## Build — bundle to one flat file

```sh
bun run build      # bun build src/entry.ts --format=iife --outfile=dist/Code.js
```

Apps Script links source files by **global scope** — a function is only callable from
the editor if it exists as a top-level global. Bun's `--format=iife` wraps the bundle
in a closure, so `src/entry.ts` explicitly re-exposes callable functions by assigning
them onto `globalThis`:

```ts
// src/entry.ts
import { hello } from "./Hello";
globalThis.hello = hello;   // now `hello` is a callable Apps Script global
```

`bun build` also **inlines** the shared root `assets.json` (imported by `Config.ts`),
so the deployed bundle has no runtime file dependency on it.

## Deploy — build, copy manifest, push

```sh
bun run deploy     # build → cp appsscript.json dist/ → clasp push
```

`clasp push` uploads `dist/` (the bundled `Code.js` plus the copied `appsscript.json`)
to the bound Apps Script project.

## One-time human setup

`clasp` auth and script-ID provisioning are a one-time manual step:

```sh
bunx clasp login                                   # authenticate with Google
bunx clasp create --type standalone --rootDir dist # or: clasp clone <script-id> --rootDir dist
```

This generates `.clasp.json` (the script ID), which is **gitignored** — it is never
committed. `dist/` is gitignored too (build output).

## Smoke test (`hello`)

`hello()` is a pure toolchain smoke test: it returns a string and `Logger.log`s it,
and touches **no** scope-gated API (no `SpreadsheetApp`, `PropertiesService`,
`UrlFetchApp`, or Secret Manager). After `clasp push`, select `hello` in the editor's
function dropdown and Run — it should log its string with **no** authorization prompt.
That proves the IIFE bundle exposes imported/exported functions as callable globals,
which everything in later phases (`refreshAll`, triggers, providers) depends on.
