/**
 * Time-driven trigger management (REFRESH-01) — install/remove the scheduled
 * `refreshAll` trigger. Both are editor-callable entry points (Diagnostics.ts
 * entry-fn shape: top-level export returning void).
 *
 * The interval is a COMPILED CONSTANT (D-09): `REFRESH_INTERVAL_MINUTES` from
 * Config.ts. "Configurable" means edit the constant, rebuild, redeploy, re-run
 * `installTrigger()`. No Script Property override — a personal tracker rarely
 * retunes, and one source of truth is simpler.
 *
 * `installTrigger()` is IDEMPOTENT (D-09 / T-04-02): it first removes any
 * existing `refreshAll` trigger, then creates exactly one. Re-installs can never
 * stack duplicate triggers (which would multiply runs and exhaust the daily
 * trigger/runtime quota — a self-inflicted DoS).
 */
import { REFRESH_INTERVAL_MINUTES } from "./Config";

/** The handler function name the time-driven trigger targets (must match Refresh.ts). */
const REFRESH_HANDLER = "refreshAll";

/**
 * Remove every existing project trigger bound to `refreshAll`. Shared by
 * installTrigger (idempotency) and removeTrigger (teardown). Returns the count
 * removed for logging.
 */
function deleteRefreshTriggers(): number {
  const triggers = ScriptApp.getProjectTriggers();
  let removed = 0;
  for (const t of triggers) {
    if (t.getHandlerFunction() === REFRESH_HANDLER) {
      ScriptApp.deleteTrigger(t);
      removed++;
    }
  }
  return removed;
}

/**
 * Install the single time-driven `refreshAll` trigger (REFRESH-01). Idempotent:
 * removes any pre-existing `refreshAll` trigger first so re-installs never stack
 * duplicates (D-09 / T-04-02). Fires every `REFRESH_INTERVAL_MINUTES`.
 */
export function installTrigger(): void {
  const removed = deleteRefreshTriggers();
  ScriptApp.newTrigger(REFRESH_HANDLER)
    .timeBased()
    .everyMinutes(REFRESH_INTERVAL_MINUTES)
    .create();
  Logger.log(
    "installTrigger: removed " +
      removed +
      " existing refreshAll trigger(s); created 1 every " +
      REFRESH_INTERVAL_MINUTES +
      " min.",
  );
}

/**
 * Remove the time-driven `refreshAll` trigger(s) without re-creating one
 * (REFRESH-01 teardown).
 */
export function removeTrigger(): void {
  const removed = deleteRefreshTriggers();
  Logger.log("removeTrigger: removed " + removed + " refreshAll trigger(s).");
}
