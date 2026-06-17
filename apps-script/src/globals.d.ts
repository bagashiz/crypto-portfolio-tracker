/**
 * Ambient declarations for the Apps Script trigger/entry globals that `entry.ts`
 * assigns onto `globalThis`. These let the `globalThis.<fn> = <fn>` assignments
 * type-check under `strict` while documenting the full set of entry points that
 * later phases will surface.
 */
import type { Asset } from "./Config";

declare global {
  // eslint-disable-next-line no-var
  var hello: () => string;
  // testApi() runs both providers live and logs their {price, qty} maps (D-12).
  // eslint-disable-next-line no-var
  var testApi: () => void;
  // The inlined shared asset registry (D-05), exposed for provider/refresh code.
  // eslint-disable-next-line no-var
  var ASSETS: readonly Asset[];
  // Reserved for later phases (assigned in entry.ts as they land):
  // var refreshAll: () => void;
  // var installTrigger: () => void;
  // var removeTrigger: () => void;
}

export {};
