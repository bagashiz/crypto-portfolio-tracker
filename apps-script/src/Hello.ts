/**
 * Phase 1 toolchain smoke test.
 *
 * CRITICAL (D-11, D-12): hello() is a PURE toolchain smoke test. It must NOT:
 *   - read a Script Property (PropertiesService),
 *   - call any scope-gated API (SpreadsheetApp, UrlFetchApp, Secret Manager),
 *   - touch anything that triggers an OAuth authorization prompt.
 * Only `Logger` is used — Logger has no scope gate.
 *
 * Its sole job is to prove that an imported/exported function survives the
 * `bun build --format=iife` bundle and is callable as an Apps Script global
 * (the primary risk of Phase 1).
 */
export function hello(): string {
  const message = "Phase 1 toolchain OK — hello() is callable from the Apps Script editor.";
  Logger.log(message);
  return message;
}
