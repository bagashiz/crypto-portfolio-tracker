/**
 * Single `bun build --format=iife` entry point (D-02, D-03).
 *
 * Apps Script links files by global scope — a trigger/entry function is only
 * callable from the editor if it exists as a top-level global. Bun's IIFE bundle
 * wraps everything in a closure, so we must explicitly re-export the functions we
 * want callable by assigning them onto `globalThis`. This is the pattern every
 * future trigger entry point (refreshAll, installTrigger, removeTrigger) will use.
 *
 * Importing `Config` here ensures the inlined asset registry is included in the
 * bundle even though nothing calls it yet this phase.
 */
import { hello } from "./Hello";
import "./Config";

// Phase 1: only hello() is live and must be editor-callable (SETUP-02, D-03).
globalThis.hello = hello;

// TODO(Phase 3 — providers/refresh): expose the real trigger entry point.
// globalThis.refreshAll = refreshAll;
// TODO(Phase 4 — triggers): expose install/remove of the time-driven trigger.
// globalThis.installTrigger = installTrigger;
// globalThis.removeTrigger = removeTrigger;
