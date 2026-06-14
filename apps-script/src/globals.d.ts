/**
 * Ambient declarations for the Apps Script trigger/entry globals that `entry.ts`
 * assigns onto `globalThis`. These let the `globalThis.<fn> = <fn>` assignments
 * type-check under `strict` while documenting the full set of entry points that
 * later phases will surface.
 */
declare global {
  // eslint-disable-next-line no-var
  var hello: () => string;
  // Reserved for later phases (assigned in entry.ts as they land):
  // var refreshAll: () => void;
  // var installTrigger: () => void;
  // var removeTrigger: () => void;
}

export {};
