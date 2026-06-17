/**
 * Pure-function tests for the refresh row-sourcing seam (D-08 precedence).
 *
 * `refreshAll()` itself touches Apps Script globals (CacheService, SpreadsheetApp,
 * ScriptApp) and cannot run under `bun test`. The high-risk logic — sourcing each
 * venue's Qty/Price values by precedence (live -> cache last-good -> current sheet)
 * and guaranteeing a failed venue never injects a non-number into a value cell
 * (T-04-01 / D-07) — lives in the PURE `assembleRefreshRows`, exercised here with
 * fixtures (mirrors parsers.test.ts: pure logic is bun-testable, API glue is not).
 *
 * Registry order under test (assets.json): BTC, HYPE, XAUt (hyperliquid) then
 * IVVon, PST, ONyc, USDy (solana). Output rows are [qty, price] in that order
 * (Qty col B, Price col C per D-10).
 */
import { test, expect } from "bun:test";
import { assembleRefreshRows, backfillBlobFromSheet } from "./Refresh";
import { ASSETS } from "./Config";

type VenueMap = Record<string, { price: number; qty: number }>;

const HL_LIVE: VenueMap = {
  BTC: { price: 65000.5, qty: 0.5 },
  HYPE: { price: 42.17, qty: 100 },
  XAUt: { price: 2650.0, qty: 3 },
};
const SOL_LIVE: VenueMap = {
  IVVon: { price: 1.01, qty: 10 },
  PST: { price: 0.99, qty: 20 },
  ONyc: { price: 1.05, qty: 30 },
  USDy: { price: 1.0, qty: 40 },
};

// Last-good cache values (deliberately DIFFERENT from live so precedence is observable).
const HL_CACHE: VenueMap = {
  BTC: { price: 60000, qty: 0.4 },
  HYPE: { price: 40, qty: 90 },
  XAUt: { price: 2600, qty: 2 },
};

// Current sheet values keyed by asset id (cold-start fallback source).
function currentSheet(): Record<string, { price: number; qty: number }> {
  return {
    BTC: { price: 11111, qty: 1.1 },
    HYPE: { price: 22222, qty: 2.2 },
    XAUt: { price: 33333, qty: 3.3 },
    IVVon: { price: 44444, qty: 4.4 },
    PST: { price: 55555, qty: 5.5 },
    ONyc: { price: 66666, qty: 6.6 },
    USDy: { price: 77777, qty: 7.7 },
  };
}

// Find the [qty, price] row for an asset id, given the registry order.
function rowFor(rows: (number | string)[][], id: string): (number | string)[] {
  const idx = ASSETS.findIndex((a) => a.id === id);
  return rows[idx]!;
}

test("both venues live: every row uses live qty+price in ASSETS order", () => {
  const rows = assembleRefreshRows(ASSETS, {
    hyperliquid: { live: HL_LIVE, cache: null },
    solana: { live: SOL_LIVE, cache: null },
  }, currentSheet());

  expect(rows.length).toBe(ASSETS.length);
  expect(rowFor(rows, "BTC")).toEqual([0.5, 65000.5]);
  expect(rowFor(rows, "HYPE")).toEqual([100, 42.17]);
  expect(rowFor(rows, "USDy")).toEqual([40, 1.0]);
});

test("partial degradation: HL live null but HL cache present -> HL uses cache, Solana uses live (D-03)", () => {
  const rows = assembleRefreshRows(ASSETS, {
    hyperliquid: { live: null, cache: HL_CACHE },
    solana: { live: SOL_LIVE, cache: null },
  }, currentSheet());

  // HL rows fall to cache last-good.
  expect(rowFor(rows, "BTC")).toEqual([0.4, 60000]);
  expect(rowFor(rows, "HYPE")).toEqual([90, 40]);
  expect(rowFor(rows, "XAUt")).toEqual([2, 2600]);
  // Solana rows stay live.
  expect(rowFor(rows, "IVVon")).toEqual([10, 1.01]);
  expect(rowFor(rows, "USDy")).toEqual([40, 1.0]);
});

test("cold-start: venue live AND cache both null -> rows fall back to current sheet values verbatim (D-07)", () => {
  const sheet = currentSheet();
  const rows = assembleRefreshRows(ASSETS, {
    hyperliquid: { live: null, cache: null },
    solana: { live: SOL_LIVE, cache: null },
  }, sheet);

  // HL rows untouched: exactly the current sheet values.
  expect(rowFor(rows, "BTC")).toEqual([sheet.BTC!.qty, sheet.BTC!.price]);
  expect(rowFor(rows, "HYPE")).toEqual([sheet.HYPE!.qty, sheet.HYPE!.price]);
  expect(rowFor(rows, "XAUt")).toEqual([sheet.XAUt!.qty, sheet.XAUt!.price]);
  // Solana stays live.
  expect(rowFor(rows, "PST")).toEqual([20, 0.99]);
});

test("row count and order exactly match the ASSETS registry order", () => {
  const rows = assembleRefreshRows(ASSETS, {
    hyperliquid: { live: HL_LIVE, cache: null },
    solana: { live: SOL_LIVE, cache: null },
  }, currentSheet());

  expect(rows.length).toBe(ASSETS.length);
  // The first three are the hyperliquid assets, the last four solana — registry order.
  const ids = ASSETS.map((a) => a.id);
  expect(ids).toEqual(["BTC", "HYPE", "XAUt", "IVVon", "PST", "ONyc", "USDy"]);
});

test("never injects a non-number: every assembled cell is a number (or passed-through current sheet number)", () => {
  const rows = assembleRefreshRows(ASSETS, {
    hyperliquid: { live: null, cache: null }, // worst case: cold-start failure
    solana: { live: null, cache: null },
  }, currentSheet());

  for (const row of rows) {
    expect(row.length).toBe(2);
    for (const cell of row) {
      expect(typeof cell).toBe("number");
      expect(Number.isFinite(cell as number)).toBe(true);
    }
  }
});

test("missing current-sheet entry on cold-start does not inject NaN/null — falls back to 0", () => {
  // If the sheet read returns a non-number for a cell (blank/empty), the function
  // must still emit a number (0), never NaN/null/string that would cascade to #VALUE.
  const sheet = currentSheet();
  delete (sheet as any).BTC; // simulate a blank/unreadable current cell
  const rows = assembleRefreshRows(ASSETS, {
    hyperliquid: { live: null, cache: null },
    solana: { live: SOL_LIVE, cache: null },
  }, sheet);

  const btc = rowFor(rows, "BTC");
  expect(btc).toEqual([0, 0]);
  for (const cell of btc) {
    expect(typeof cell).toBe("number");
    expect(Number.isFinite(cell as number)).toBe(true);
  }
});

// --- CR-01: cache backfill keeps PRICES_ALL in lockstep with the sheet ----------

test("CR-01: a failed venue with NO cache slice gets backfilled from the written rows", () => {
  // Solana succeeded (its slice already in the blob); Hyperliquid failed this run
  // AND PRICES_ALL had evicted, so the blob has no hyperliquid slice. The rows
  // written to the sheet still carry HL's last-good (from the current-sheet read).
  const rows = assembleRefreshRows(ASSETS, {
    hyperliquid: { live: null, cache: null }, // failed + evicted -> falls to current sheet
    solana: { live: SOL_LIVE, cache: null },
  }, currentSheet());

  const blob: any = { solana: { data: SOL_LIVE, lastUpdated: "2026-06-17 10:00:00" } };
  backfillBlobFromSheet(blob, ASSETS, rows);

  // HL slice is recovered from the written values (== current sheet), so the cache
  // no longer diverges from the display and recovery history survives.
  expect(blob.hyperliquid).toBeDefined();
  expect(blob.hyperliquid.data.BTC).toEqual({ qty: 1.1, price: 11111 });
  expect(blob.hyperliquid.data.XAUt).toEqual({ qty: 3.3, price: 33333 });
  expect(blob.hyperliquid.lastUpdated).toBe("—"); // no reliable time survived eviction
  // The healthy venue's slice is left exactly as-is (timestamp not clobbered).
  expect(blob.solana.lastUpdated).toBe("2026-06-17 10:00:00");
});

test("CR-01: an existing (fresh/preserved) venue slice is never overwritten", () => {
  const rows = assembleRefreshRows(ASSETS, {
    hyperliquid: { live: HL_LIVE, cache: null },
    solana: { live: SOL_LIVE, cache: null },
  }, currentSheet());

  const blob: any = {
    hyperliquid: { data: HL_LIVE, lastUpdated: "2026-06-17 09:00:00" },
    solana: { data: SOL_LIVE, lastUpdated: "2026-06-17 09:00:00" },
  };
  backfillBlobFromSheet(blob, ASSETS, rows);

  // Both slices preserved verbatim — backfill only fills ABSENT slices.
  expect(blob.hyperliquid.data).toEqual(HL_LIVE);
  expect(blob.hyperliquid.lastUpdated).toBe("2026-06-17 09:00:00");
  expect(blob.solana.lastUpdated).toBe("2026-06-17 09:00:00");
});
