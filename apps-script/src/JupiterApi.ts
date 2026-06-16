/**
 * Jupiter Solana provider (DATA-02 prices, DATA-03 balances) — raw `UrlFetchApp`
 * over the KEYED `api.jup.ag` host (D-06; the keyless `lite-api.jup.ag` shares
 * Google's egress-IP rate-limit bucket and draws neighbor-induced 429s). The
 * Jupiter API key flows ONLY into the `x-api-key` header — never `Logger.log` it
 * (SEC-01 / T-03-07).
 *
 * Two reads per refresh (D-08):
 *   1. GET /price/v3?ids={mints} -> mint-keyed { usdPrice } (all four prices, one call).
 *   2. GET /ultra/v1/balances/{wallet} -> mint-keyed { uiAmount } (decimal-adjusted).
 *
 * Use `ultra/v1/balances`, NOT `portfolio/v1/positions` — the latter returns 0
 * for plainly-held tokens (only Jupiter-platform DeFi positions) and costs 100
 * credits/call. Use the `uiAmount` field, NOT the raw integer-string `amount`.
 *
 * Fail-loud rules:
 *   - D-10: a tracked mint absent from prices, or a non-number usdPrice -> throw.
 *   - D-13: a tracked mint cleanly absent from balances -> qty 0 (legitimate zero
 *           holding); any HTTP non-200 or malformed body -> throw (transient
 *           outage stays loud, self-heals via Phase 4's per-provider try/catch).
 *
 * `getJupiterData()` is INTERNAL (D-12) — wired into the bundle in Plan 03.
 */
import { ASSETS } from "./Config";
import { getScriptProp } from "./Properties";

const JUP_PRICE_URL = "https://api.jup.ag/price/v3";
const JUP_BALANCES_URL = "https://api.jup.ag/ultra/v1/balances";

/** price/v3 response: object keyed by mint. */
type JupPriceBody = Record<string, { usdPrice: number } | undefined>;
/** ultra/v1/balances response: keyed by mint (native SOL keyed by the string "SOL"). */
type JupBalancesBody = Record<string, { uiAmount: number } | undefined>;

/** True only for a plain (non-array) object — the shape both Jupiter endpoints return. */
function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Pure: extract USD prices for each mint from a mint-keyed price/v3 body.
 *
 * @param body - parsed `{ "<mint>": { usdPrice } }` response.
 * @param mints - tracked Solana mint addresses.
 * @returns mint -> usdPrice (finite number).
 * @throws D-13 if body is not a plain object; D-10 if a mint is absent or its
 *         usdPrice is not a number (config error).
 */
export function parseJupPrices(body: unknown, mints: string[]): Record<string, number> {
  if (!isPlainObject(body)) {
    throw new Error("Jupiter price/v3: malformed body (expected a mint-keyed object)");
  }
  const data = body as JupPriceBody;
  const out: Record<string, number> = {};
  for (const mint of mints) {
    const entry = data[mint];
    if (!entry || typeof entry.usdPrice !== "number") {
      throw new Error("Jupiter: no usdPrice for mint " + mint); // D-10 config error
    }
    out[mint] = entry.usdPrice;
  }
  return out;
}

/**
 * Pure: extract balances for each mint from a mint-keyed ultra/v1/balances body.
 *
 * Native SOL is keyed by the literal string "SOL" but is not a tracked mint here.
 *
 * @param body - parsed `{ "<mint>": { uiAmount }, "SOL": {...} }` response.
 * @param mints - tracked Solana mint addresses.
 * @returns mint -> qty (uiAmount); a tracked mint absent from body -> 0 (D-13).
 * @throws D-13 if body is not a plain object (malformed/transient failure).
 */
export function parseJupBalances(body: unknown, mints: string[]): Record<string, number> {
  if (!isPlainObject(body)) {
    throw new Error("Jupiter ultra/v1/balances: malformed body (expected a mint-keyed object)");
  }
  const data = body as JupBalancesBody;
  const out: Record<string, number> = {};
  for (const mint of mints) {
    const entry = data[mint];
    // D-13 SOFTEN: cleanly-absent tracked mint is a legitimate zero holding,
    // NOT a config error — qty 0, no throw. Use uiAmount, NEVER the raw amount.
    out[mint] = entry && typeof entry.uiAmount === "number" ? Number(entry.uiAmount) : 0;
  }
  return out;
}

/** Thin I/O wrapper: GET price/v3, delegate to {@link parseJupPrices}. */
function fetchJupPrices(mints: string[], apiKey: string): Record<string, number> {
  const res = UrlFetchApp.fetch(JUP_PRICE_URL + "?ids=" + mints.join(","), {
    method: "get",
    headers: { "x-api-key": apiKey },
    muteHttpExceptions: true,
  });
  if (res.getResponseCode() !== 200) {
    throw new Error("Jupiter price/v3 " + res.getResponseCode() + ": " + res.getContentText());
  }
  return parseJupPrices(JSON.parse(res.getContentText()), mints);
}

/** Thin I/O wrapper: GET ultra/v1/balances, delegate to {@link parseJupBalances}. */
function fetchJupBalances(wallet: string, mints: string[], apiKey: string): Record<string, number> {
  const res = UrlFetchApp.fetch(JUP_BALANCES_URL + "/" + wallet, {
    method: "get",
    headers: { "x-api-key": apiKey },
    muteHttpExceptions: true,
  });
  if (res.getResponseCode() !== 200) {
    throw new Error("Jupiter ultra/v1/balances " + res.getResponseCode() + ": " + res.getContentText());
  }
  return parseJupBalances(JSON.parse(res.getContentText()), mints);
}

/**
 * Internal: the D-09 contract for the Solana (Jupiter) venue.
 *
 * @returns `Record<id, {price, qty}>` keyed by asset id (IVVon/PST/ONyc/USDy).
 *          The mint->id translation is hidden here (D-09).
 */
export function getJupiterData(): Record<string, { price: number; qty: number }> {
  const apiKey = getScriptProp("JUP_API_KEY");
  const wallet = getScriptProp("SOL_WALLET_ADDRESS");
  const solAssets = ASSETS.filter((a) => a.venue === "solana");
  const mints = solAssets.map((a) => a.mint!);
  const prices = fetchJupPrices(mints, apiKey); // one price call (D-08)
  const qtys = fetchJupBalances(wallet, mints, apiKey); // one balances call (D-08)
  const out: Record<string, { price: number; qty: number }> = {};
  for (const a of solAssets) {
    const mint = a.mint!;
    out[a.id] = { price: prices[mint]!, qty: qtys[mint]! }; // mint->id hidden (D-09)
  }
  return out;
}
