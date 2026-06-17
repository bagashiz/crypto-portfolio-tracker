/**
 * Editor-callable diagnostics (D-12 entry point). NOT used by the production
 * refresh — a manual smoke test you run from the Apps Script editor function
 * picker to confirm both venue providers return sane live data against your
 * configured Script Properties.
 *
 * Each provider is called in isolation so one venue's failure still shows the
 * other's result (mirrors Phase 4's per-provider try/catch). Logs the assembled
 * {price, qty} maps only — prices and quantities, never the wallet address or
 * the API key.
 */
import { getHyperliquidData } from "./HyperliquidApi";
import { getJupiterData } from "./JupiterApi";

/** Run both providers live and log their D-09 {price, qty} maps for manual review. */
export function testApi(): void {
  try {
    Logger.log("Hyperliquid: " + JSON.stringify(getHyperliquidData()));
  } catch (e) {
    Logger.log("Hyperliquid FAILED: " + (e instanceof Error ? e.message : String(e)));
  }
  try {
    Logger.log("Jupiter: " + JSON.stringify(getJupiterData()));
  } catch (e) {
    Logger.log("Jupiter FAILED: " + (e instanceof Error ? e.message : String(e)));
  }
}
