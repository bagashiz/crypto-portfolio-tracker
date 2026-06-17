/**
 * Ambient declarations for the Apps Script trigger/entry globals that `entry.ts`
 * assigns onto `globalThis`. These let the `globalThis.<fn> = <fn>` assignments
 * type-check under `strict` while documenting the full set of entry points that
 * later phases will surface.
 */
import type { Asset } from "./Config";

declare global {
  // The inlined shared asset registry (D-05), exposed for provider/refresh code.
  // eslint-disable-next-line no-var
  var ASSETS: readonly Asset[];
  // Phase 4 refresh + trigger entry points (assigned in entry.ts).
  // refreshAll() is also the time-driven trigger handler (D-09).
  // eslint-disable-next-line no-var
  var refreshAll: () => void;
  // eslint-disable-next-line no-var
  var installTrigger: () => void;
  // eslint-disable-next-line no-var
  var removeTrigger: () => void;
}

export {};
