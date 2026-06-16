/**
 * Script Property access for the data layer (SEC-01, SEC-02).
 *
 * Runtime config (wallet addresses + Jupiter API key) lives in the Apps Script
 * Script Property store, NEVER in committed source. Two contracts:
 *   - getScriptProp(name): fail-loud reader. A missing/empty property throws
 *     instead of returning null/"" — a null value silently flowing into an
 *     `x-api-key` header would produce a 401 loop (Pitfall 4), so we fail
 *     immediately and visibly.
 *   - setup(): one-time helper that seeds the three property KEYS with obvious
 *     PLACEHOLDER literals. The user edits these to real values LOCALLY, runs
 *     setup() ONCE from the editor, then reverts — real wallet/key literals must
 *     NEVER be committed (SEC-02). No property value is ever Logger.log'd.
 */

/** Script Property keys consumed at runtime (values set via setup(), not committed). */
const HL_WALLET_ADDRESS = "HL_WALLET_ADDRESS";
const SOL_WALLET_ADDRESS = "SOL_WALLET_ADDRESS";
const JUP_API_KEY = "JUP_API_KEY";

/**
 * Read a Script Property, failing loud when absent.
 *
 * @param name - the Script Property key to read.
 * @returns the non-empty property value.
 * @throws if the property is missing or an empty string (never a silent default).
 */
export function getScriptProp(name: string): string {
  const value = PropertiesService.getScriptProperties().getProperty(name);
  if (value === null || value === "") {
    throw new Error("Missing Script Property: " + name);
  }
  return value;
}

/**
 * Seed the runtime Script Property keys with PLACEHOLDER literals.
 *
 * SEC-02: this ships with fake placeholders ONLY. To configure the data layer,
 * edit the three values to your real wallet addresses + Jupiter key LOCALLY, run
 * setup() ONCE from the Apps Script editor, then REVERT the edits before
 * committing — real secrets must never enter git history.
 */
export function setup(): void {
  PropertiesService.getScriptProperties().setProperties({
    [HL_WALLET_ADDRESS]: "PLACEHOLDER_set_me_in_editor",
    [SOL_WALLET_ADDRESS]: "PLACEHOLDER_set_me_in_editor",
    [JUP_API_KEY]: "PLACEHOLDER_set_me_in_editor",
  });
}
