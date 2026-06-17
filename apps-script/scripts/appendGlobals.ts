/**
 * Post-build footer step (D-02/D-03 fix).
 *
 * Apps Script's editor function picker is populated by STATIC analysis of
 * top-level `function name()` declarations. It does NOT see runtime
 * `globalThis.x = x` assignments. Because `bun build --format=iife` wraps every
 * declaration inside a `(() => { ... })()` closure, the bundle alone exposes no
 * top-level `function`, so the picker shows "No functions" and nothing is runnable.
 *
 * This script appends real top-level `function` declarations to dist/Code.js,
 * OUTSIDE the IIFE, one per entry-point global. Each shim delegates to the live
 * implementation that entry.ts placed on `globalThis.__ENTRY__`. The editor picker
 * discovers these statically; at runtime they call through to the bundled impl.
 *
 * Adding a new entry point later (refreshAll / installTrigger / removeTrigger) is a
 * one-line change: add its name to ENTRY_GLOBALS here AND to the __ENTRY__ object
 * in src/entry.ts.
 *
 * dist/ is gitignored and rebuilt — never hand-edit it; this script is the
 * committed, reproducible mechanism.
 */

/**
 * The entry-point globals that must be statically discoverable in the editor.
 * Providers (getHyperliquidData/getJupiterData) are intentionally NOT listed —
 * they are internal (D-12), retained in the bundle but not editor-callable.
 */
const ENTRY_GLOBALS = ["hello", "testApi"] as const;

const OUT_PATH = new URL("../dist/Code.js", import.meta.url);

const bundle = await Bun.file(OUT_PATH).text();

const SENTINEL = "// --- appended top-level entry shims (appendGlobals.ts) ---";
if (bundle.includes(SENTINEL)) {
  // Idempotent: never double-append (e.g. if invoked twice without a clean build).
  console.log("appendGlobals: shims already present, skipping");
} else {
  const shims = ENTRY_GLOBALS.map(
    (name) =>
      `function ${name}() { return globalThis.__ENTRY__.${name}.apply(this, arguments); }`,
  ).join("\n");

  const footer = `\n${SENTINEL}\n${shims}\n`;
  await Bun.write(OUT_PATH, bundle + footer);
  console.log(`appendGlobals: appended ${ENTRY_GLOBALS.length} top-level shim(s): ${ENTRY_GLOBALS.join(", ")}`);
}
