/**
 * Single `bun build --format=iife` entry point (D-02, D-03).
 *
 * Apps Script links files by global scope, but its editor function picker is
 * populated by STATIC analysis of top-level `function name()` declarations only —
 * it does NOT see runtime `globalThis.x = x` assignments. Bun's `--format=iife`
 * bundle wraps every declaration inside a `(() => { ... })()` closure, so there is
 * no top-level `function hello()` for the picker to discover; with the bundle
 * alone, the editor shows "No functions" and nothing is runnable (the exact
 * D-02/D-03 primary-risk failure this phase exists to catch).
 *
 * Fix (deviation from D-03's bare-globalThis mechanism): expose the live
 * implementations on a single NAMESPACED global (`globalThis.__ENTRY__`) from
 * inside the IIFE, then a committed post-build footer step (scripts/appendGlobals.ts)
 * appends real top-level `function` declarations OUTSIDE the IIFE that delegate to
 * that namespace. The top-level shims are statically discoverable by the editor
 * picker; at runtime they call through to the bundled implementations. Adding a
 * new entry point later (refreshAll / installTrigger / removeTrigger) is a one-line
 * change in BOTH this namespace object and the footer script's name array.
 *
 * Importing `Config` here ensures the inlined asset registry is included in the
 * bundle even though nothing calls it yet this phase.
 */
import { hello } from "./Hello";
import { ASSETS } from "./Config";
import { testApi } from "./Diagnostics";
import { getHyperliquidData } from "./HyperliquidApi";
import { getJupiterData } from "./JupiterApi";

// hello() and testApi() are the editor-callable entry points this phase (D-12).
// Expose live implementations on a single namespaced global. The post-build
// footer (scripts/appendGlobals.ts) adds top-level `function hello()` /
// `function testApi()` shims that the editor picker discovers and that delegate
// here at runtime. testApi() runs both providers live and logs their results so
// the deployed data layer can be smoke-tested from the editor.
(globalThis as any).__ENTRY__ = { hello, testApi };

// Keep the bare-name global too — harmless, and preserves the D-03 contract that
// the function is reachable via globalThis (the editor picker just can't see it
// here; the top-level shim is what makes it selectable).
globalThis.hello = hello;

// Expose the inlined shared asset registry as a global so the bundler retains it
// (D-05) — proves assets.json is inlined into Code.js with no runtime file
// dependency, and makes the registry available to future provider/refresh code.
globalThis.ASSETS = ASSETS;

// Retain the providers in the bundle WITHOUT making them editor entry points
// (D-12: providers stay INTERNAL). `bun build` tree-shakes anything unreachable
// from this entry module (Pitfall 5), so reference both on a non-picker namespace
// (`__PROVIDERS__`, distinct from `__ENTRY__`). They are NOT added to ENTRY_GLOBALS,
// so appendGlobals.ts emits no top-level shim for them — they ship as bundled
// functions only. Phase 4's refreshAll() will call them from inside the bundle.
(globalThis as any).__PROVIDERS__ = { getHyperliquidData, getJupiterData };

// TODO(Phase 4 — refresh): expose the real trigger entry point.
// Add `refreshAll` to the __ENTRY__ object above AND to the name array in
// scripts/appendGlobals.ts so the editor picker discovers its top-level shim.
// refreshAll() will read from __PROVIDERS__ (getHyperliquidData/getJupiterData).
// (globalThis as any).__ENTRY__.refreshAll = refreshAll;
// TODO(Phase 4 — triggers): expose install/remove of the time-driven trigger.
// Same one-line pattern for installTrigger / removeTrigger.
// (globalThis as any).__ENTRY__.installTrigger = installTrigger;
// (globalThis as any).__ENTRY__.removeTrigger = removeTrigger;
