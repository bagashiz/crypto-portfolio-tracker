/**
 * Refresh orchestration (REFRESH-01..04) — the seam that makes Phase 3's
 * fail-loud providers safe and turns the static Dashboard into a self-refreshing
 * live view.
 *
 * `refreshAll()` is the time-driven trigger entry point (installed by
 * Triggers.ts). Every run it fetches BOTH venues live (D-01: the cache is a
 * last-good degradation buffer, NOT a call-reduction cache — we always fetch).
 * Each provider call is wrapped in its OWN try/catch (mirrors Diagnostics.ts) so
 * a Jupiter outage never blanks Hyperliquid (per-venue isolation, D-03). The two
 * venues' rows are sourced by precedence — live -> cache last-good -> current
 * sheet value (D-08) — assembled by the PURE `assembleRefreshRows` (the
 * bun-testable seam; all CacheService/SpreadsheetApp/ScriptApp calls stay OUT of
 * it). The full Zone A Qty/Price block is then written in a SINGLE setValues call
 * (REFRESH-02), and the per-venue LastUpdated/Stale? status pair is updated.
 *
 * A failed venue NEVER writes a non-number into a Qty/Price cell (T-04-01 / D-07)
 * — that would cascade into Phase 5's `Value = Qty x Price` and the allocation
 * math as #VALUE. Worst case a cell keeps an older real number with Stale?=TRUE.
 */
import { ASSETS, type Asset, CACHE_TTL_SECONDS } from "./Config";
import { getHyperliquidData } from "./HyperliquidApi";
import { getJupiterData } from "./JupiterApi";

/** CacheService blob key (D-01/D-02). One key holds both venues' last-good slices. */
export const PRICES_ALL = "PRICES_ALL";

/** A venue's D-09 provider contract: id -> {price, qty}. */
type VenueData = Record<string, { price: number; qty: number }>;

/** One venue's slice of the PRICES_ALL blob (D-02). */
interface VenueSlice {
  data: VenueData;
  lastUpdated: string;
}

/** The per-venue last-good blob persisted in CacheService (D-02). */
interface PricesBlob {
  hyperliquid?: VenueSlice;
  solana?: VenueSlice;
}

/** Per-venue sourcing inputs for the pure assembler. */
interface VenueSources {
  /** This run's live fetch result, or null if the venue failed this run. */
  live: VenueData | null;
  /** The venue's last-good from the cached blob, or null on a cache miss. */
  cache: VenueData | null;
}

/**
 * PURE row-sourcing (D-08). No Apps Script globals — bun-testable.
 *
 * For each asset, in ASSETS registry order, emit a `[qty, price]` row sourced by
 * precedence for that asset's venue:
 *   1. this run's live fetch (if the venue succeeded), else
 *   2. the cache last-good (if present), else
 *   3. the current sheet value read at run start (cold-start fallback, D-07).
 *
 * Guarantees every cell is a finite number (T-04-01): a missing/blank current
 * sheet value degrades to 0, never NaN/null/string that would #VALUE-cascade.
 *
 * @param assets       the ordered registry (single source of row order/venue).
 * @param sources      per-venue {live, cache} maps.
 * @param currentSheet id -> {qty, price} read from the Dashboard at run start.
 * @returns one `[qty, price]` row per asset, in registry order (Qty col B / Price col C, D-10).
 */
export function assembleRefreshRows(
  assets: readonly Asset[],
  sources: { hyperliquid: VenueSources; solana: VenueSources },
  currentSheet: Record<string, { price: number; qty: number }>,
): number[][] {
  return assets.map((asset) => {
    const venue = sources[asset.venue];
    const live = venue.live ? venue.live[asset.id] : undefined;
    const cache = venue.cache ? venue.cache[asset.id] : undefined;
    const sheet = currentSheet[asset.id];

    // Precedence: live -> cache last-good -> current sheet -> 0 (never non-number).
    const source = live ?? cache ?? sheet;
    const qty = toFinite(source?.qty);
    const price = toFinite(source?.price);
    return [qty, price];
  });
}

/** Coerce a possibly-undefined/non-finite value to a finite number (default 0). */
function toFinite(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

// --- Dashboard geometry (mirrors layout-builder/src/dashboardSheet.js) ---------

/** Dashboard tab name (container-bound; matches the layout builder's Sheet 1). */
const DASHBOARD_SHEET = "Dashboard";
/** Zone A header is row 1; per-asset rows start at row 2 (1-based). */
const ZONE_A_FIRST_ASSET_ROW = 2;
/** Qty is column B (2), Price is column C (3) — the only cols this write spans (D-10). */
const QTY_COL = 2;
/** The single setValues block is 2 columns wide: Qty(B), Price(C). */
const VALUE_COLS = 2;

// Status block (D-04/D-06): per-venue 2 lines, top-right, column-anchored.
// Static labels are stamped by the layout builder (Plan 02); refreshAll writes
// only the dynamic LastUpdated (col J) + Stale? (col K) values.
//   I1:K1  headers | I2:K2 Hyperliquid row | I3:K3 Solana row
const STATUS_LASTUPDATED_COL = 10; // J
const STATUS_HL_ROW = 2;
const STATUS_SOL_ROW = 3;

// --- Orchestrator --------------------------------------------------------------

/**
 * Time-driven trigger entry point (also editor-callable for manual testing).
 * Fetches both venues live, degrades per-venue from the PRICES_ALL last-good
 * blob, writes Zone A Qty/Price in one setValues, and updates the status block.
 */
export function refreshAll(): void {
  const cache = CacheService.getScriptCache();
  const blob = readBlob(cache);

  // --- Hyperliquid: independent try/catch (Diagnostics.ts isolation shape) ---
  let hlLive: VenueData | null = null;
  let hlFresh = false;
  try {
    hlLive = getHyperliquidData();
    blob.hyperliquid = { data: hlLive, lastUpdated: nowStamp() };
    hlFresh = true;
  } catch (e) {
    Logger.log("Hyperliquid refresh FAILED: " + (e instanceof Error ? e.message : String(e)));
  }

  // --- Solana / Jupiter: independent try/catch ---
  let solLive: VenueData | null = null;
  let solFresh = false;
  try {
    solLive = getJupiterData();
    blob.solana = { data: solLive, lastUpdated: nowStamp() };
    solFresh = true;
  } catch (e) {
    Logger.log("Jupiter refresh FAILED: " + (e instanceof Error ? e.message : String(e)));
  }

  // Read current Dashboard values FIRST so a failed venue with no cache falls
  // back to whatever the sheet already shows (D-07 cold-start, never blanks).
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(DASHBOARD_SHEET);
  if (!sheet) {
    throw new Error("Dashboard sheet not found: " + DASHBOARD_SHEET);
  }
  const lastAssetRow = ZONE_A_FIRST_ASSET_ROW + ASSETS.length - 1;
  const valueRange = sheet.getRange(ZONE_A_FIRST_ASSET_ROW, QTY_COL, ASSETS.length, VALUE_COLS);
  const currentSheet = readCurrentSheet(valueRange.getValues());

  // Source each venue's rows by precedence and write the single batched block.
  const rows = assembleRefreshRows(
    ASSETS,
    {
      hyperliquid: { live: hlLive, cache: blob.hyperliquid?.data ?? null },
      solana: { live: solLive, cache: blob.solana?.data ?? null },
    },
    currentSheet,
  );
  valueRange.setValues(rows); // SINGLE batched Qty/Price write (REFRESH-02)

  // Per-venue status (D-04): fresh advances LastUpdated + Stale?=FALSE; failed
  // freezes LastUpdated (last-good time) + Stale?=TRUE; cold-start-failed leaves
  // it blank "—". The two contiguous rows (HL row 2, Solana row 3) are written in
  // one batched setValues over the LastUpdated(J)+Stale?(K) block.
  const statusRows = [
    statusPair(hlFresh, blob.hyperliquid?.lastUpdated),
    statusPair(solFresh, blob.solana?.lastUpdated),
  ];
  sheet
    .getRange(STATUS_HL_ROW, STATUS_LASTUPDATED_COL, statusRows.length, 2)
    .setValues(statusRows);

  // Persist the updated last-good blob (TTL only bounds retention, D-02).
  cache.put(PRICES_ALL, JSON.stringify(blob), CACHE_TTL_SECONDS);

  void lastAssetRow; // geometry sanity reference; range already spans the rows.
  void STATUS_SOL_ROW; // row 3 is implied by the 2-row status range start at row 2.
}

/** Read the PRICES_ALL blob; a miss is a normal cold-start (D-07), not an error. */
function readBlob(cache: GoogleAppsScript.Cache.Cache): PricesBlob {
  const raw = cache.get(PRICES_ALL);
  if (!raw) return {};
  try {
    return JSON.parse(raw) as PricesBlob;
  } catch {
    return {}; // corrupt blob == cold-start; never an error path.
  }
}

/** Convert the Dashboard's Qty/Price value grid into an id -> {qty, price} map. */
function readCurrentSheet(values: unknown[][]): Record<string, { price: number; qty: number }> {
  const out: Record<string, { price: number; qty: number }> = {};
  ASSETS.forEach((asset, i) => {
    const row = values[i] ?? [];
    out[asset.id] = { qty: toFinite(row[0]), price: toFinite(row[1]) };
  });
  return out;
}

/**
 * Build one venue's dynamic status pair [LastUpdated, Stale?] (cols J, K).
 * Fresh: advance LastUpdated, Stale?=FALSE. Failed-with-last-good: keep the
 * cached LastUpdated, Stale?=TRUE. Failed-cold-start: blank "—", Stale?=TRUE.
 */
function statusPair(fresh: boolean, lastUpdated: string | undefined): [string, boolean] {
  const stamp = fresh ? lastUpdated ?? nowStamp() : lastUpdated ?? "—";
  return [stamp, !fresh];
}

/** Current time formatted in the spreadsheet's pinned timezone (Asia/Jakarta). */
function nowStamp(): string {
  return Utilities.formatDate(new Date(), "Asia/Jakarta", "yyyy-MM-dd HH:mm:ss");
}
