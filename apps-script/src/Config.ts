/**
 * Apps Script asset registry — sourced from the single shared root `assets.json`
 * (D-04, D-05, CONFIG-01). `bun build` INLINES this JSON into `dist/Code.js`, so
 * Apps Script has NO runtime file dependency on `assets.json`; adding/removing an
 * asset is a one-line change in the shared registry, never duplicated per-runtime.
 */
import assetsJson from "../../assets.json" with { type: "json" };

/** Where an asset's price/balance is sourced from. */
export type AssetVenue = "hyperliquid" | "solana";

/** One tracked asset in the shared registry. */
export interface Asset {
  /** Stable display/lookup id (e.g. "BTC", "IVVon"). */
  id: string;
  /** Price/balance source. */
  venue: AssetVenue;
  /** Hyperliquid ticker (present when venue === "hyperliquid"). */
  ticker?: string;
  /** Solana SPL mint address (present when venue === "solana"). */
  mint?: string;
  /** Target allocation fraction (0..1). */
  target: number;
  /** Subjective risk score. */
  risk: number;
  /** Expected APY (percent). */
  apy: number;
}

/** The inlined asset registry — the single source of truth for tracked assets. */
export const ASSETS: readonly Asset[] = assetsJson as readonly Asset[];

/** Apps Script data-layer constants (placeholders; tuned in later phases). */
export const REFRESH_INTERVAL_MINUTES = 5;
export const CACHE_TTL_SECONDS = 300;
