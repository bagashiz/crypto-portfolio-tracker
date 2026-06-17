/**
 * Script Property access for the data layer (SEC-01, SEC-02).
 *
 * Runtime config (wallet addresses + Jupiter API key) lives in the Apps Script
 * Script Property store, NEVER in committed source. Set the three keys
 * (HL_WALLET_ADDRESS, SOL_WALLET_ADDRESS, JUP_API_KEY) once in Project Settings
 * -> Script Properties; they persist across deploys.
 *
 *   - getScriptProp(name): fail-loud reader. A missing/empty property throws
 *     instead of returning null/"" — a null value silently flowing into an
 *     `x-api-key` header would produce a 401 loop (Pitfall 4), so we fail
 *     immediately and visibly. No property value is ever Logger.log'd.
 */

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
