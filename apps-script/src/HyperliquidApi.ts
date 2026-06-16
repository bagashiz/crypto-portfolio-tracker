/**
 * Hyperliquid spot provider (DATA-01) — raw `UrlFetchApp` over the public Info
 * endpoint. No SDK; the Apps Script V8 runtime has no module resolution at run
 * time, so all network I/O is `UrlFetchApp.fetch` against raw HTTP.
 *
 * Two reads per refresh (D-08):
 *   1. POST /info {"type":"spotMetaAndAssetCtxs"} -> [meta, ctxs] (all spot mids).
 *   2. POST /info {"type":"spotClearinghouseState","user":WALLET} -> spot balances.
 *
 * Prices come from SPOT, never perp (Pitfall 1): the wallet holds the bridged
 * `UBTC` spot token, NOT the perp `BTC` instrument — never query coin `BTC` for
 * the spot holding. Spot tokens are resolved by name -> token index -> the
 * `universe` pair quoted against USDC (token 0) -> the positionally-aligned
 * `ctxs[pairPos].midPx`. Indexing spot by symbol via `allMids` returns the wrong
 * (perp) mid.
 *
 * Fail-loud rules:
 *   - D-10: a tracked ticker absent from prices, or a null midPx -> throw (config).
 *   - D-13: a tracked ticker cleanly absent from balances -> qty 0 (legitimate
 *           zero holding); any HTTP non-200 or malformed body -> throw (a transient
 *           outage stays loud and self-heals via Phase 4's per-provider try/catch).
 *
 * `getHyperliquidData()` is INTERNAL (D-12) — wired into the bundle in Plan 03,
 * not an editor entry point. Never `Logger.log` the wallet beyond bring-up.
 */
import { ASSETS } from "./Config";
import { getScriptProp } from "./Properties";

const HL_INFO_URL = "https://api.hyperliquid.xyz/info";

/** spotMetaAndAssetCtxs response: `[meta, ctxs]`, positionally aligned by pair. */
interface HlSpotMeta {
  tokens: { name: string; index: number }[];
  universe: { tokens: number[]; index: number }[];
}
type HlSpotCtxs = { midPx: string | null }[];

/** spotClearinghouseState response: spot balances keyed by coin. */
interface HlClearinghouseState {
  balances: { coin: string; total: string }[];
}

/**
 * Pure: extract USD spot mids for each ticker from a `[meta, ctxs]` body.
 *
 * @param body - parsed spotMetaAndAssetCtxs response (a 2-element tuple).
 * @param tickers - tracked HL spot tickers (e.g. UBTC/HYPE/XAUT0).
 * @returns ticker -> mid (finite number).
 * @throws D-13 if body is not a `[meta, ctxs]` shape; D-10 if a ticker is absent
 *         from `meta.tokens`, has no USDC spot pair, or its midPx is null.
 */
export function parseHlSpotMids(body: unknown, tickers: string[]): Record<string, number> {
  if (!Array.isArray(body) || body.length !== 2) {
    throw new Error("HL spotMetaAndAssetCtxs: expected a [meta, ctxs] 2-element array");
  }
  const meta = body[0] as HlSpotMeta | undefined;
  const ctxs = body[1] as HlSpotCtxs | undefined;
  if (!meta || !Array.isArray(meta.tokens) || !Array.isArray(meta.universe) || !Array.isArray(ctxs)) {
    throw new Error("HL spotMetaAndAssetCtxs: malformed meta/ctxs structure");
  }

  const out: Record<string, number> = {};
  for (const ticker of tickers) {
    const tok = meta.tokens.find((t) => t.name === ticker);
    if (!tok) {
      throw new Error('HL: token "' + ticker + '" not in spotMeta.tokens'); // D-10 config error
    }
    // USDC is the quote token (index 0): find the pair [tokenIndex, 0].
    const pairPos = meta.universe.findIndex((u) => u.tokens[0] === tok.index && u.tokens[1] === 0);
    if (pairPos < 0) {
      throw new Error('HL: no USDC spot pair for "' + ticker + '" (token ' + tok.index + ")"); // D-10
    }
    const ctx = ctxs[pairPos];
    const mid = ctx ? ctx.midPx : null;
    if (mid == null) {
      throw new Error('HL: null midPx for "' + ticker + '" (pair ' + pairPos + ")"); // D-10
    }
    out[ticker] = Number(mid);
  }
  return out;
}

/**
 * Pure: extract spot balances for each ticker from a spotClearinghouseState body.
 *
 * @param body - parsed `{ balances: [{coin,total}] }` response.
 * @param tickers - tracked HL spot tickers.
 * @returns ticker -> qty; a tracked ticker absent from `balances[]` -> 0 (D-13).
 * @throws D-13 if body has no `balances` array (malformed/transient failure).
 */
export function parseHlBalances(body: unknown, tickers: string[]): Record<string, number> {
  const state = body as HlClearinghouseState | null | undefined;
  if (!state || typeof state !== "object" || !Array.isArray(state.balances)) {
    throw new Error("HL spotClearinghouseState: malformed body (no balances array)");
  }
  const byCoin: Record<string, string> = {};
  for (const b of state.balances) {
    if (b && typeof b.coin === "string") byCoin[b.coin] = b.total;
  }
  const out: Record<string, number> = {};
  for (const ticker of tickers) {
    const total = byCoin[ticker];
    // D-13 SOFTEN: cleanly-absent tracked ticker is a legitimate zero holding,
    // NOT a config error — qty 0, no throw. Only HTTP/parse failures throw.
    out[ticker] = total == null ? 0 : Number(total);
  }
  return out;
}

/** Thin I/O wrapper: POST spotMetaAndAssetCtxs, delegate to {@link parseHlSpotMids}. */
function fetchHlSpotMids(tickers: string[]): Record<string, number> {
  const res = UrlFetchApp.fetch(HL_INFO_URL, {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify({ type: "spotMetaAndAssetCtxs" }),
    muteHttpExceptions: true,
  });
  if (res.getResponseCode() !== 200) {
    throw new Error("HL spotMetaAndAssetCtxs " + res.getResponseCode() + ": " + res.getContentText());
  }
  return parseHlSpotMids(JSON.parse(res.getContentText()), tickers);
}

/** Thin I/O wrapper: POST spotClearinghouseState, delegate to {@link parseHlBalances}. */
function fetchHlBalances(wallet: string, tickers: string[]): Record<string, number> {
  const res = UrlFetchApp.fetch(HL_INFO_URL, {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify({ type: "spotClearinghouseState", user: wallet }),
    muteHttpExceptions: true,
  });
  if (res.getResponseCode() !== 200) {
    throw new Error("HL spotClearinghouseState " + res.getResponseCode() + ": " + res.getContentText());
  }
  return parseHlBalances(JSON.parse(res.getContentText()), tickers);
}

/**
 * Internal: the D-09 contract for the Hyperliquid venue.
 *
 * @returns `Record<id, {price, qty}>` keyed by asset id (BTC/HYPE/XAUt). The
 *          ticker->id translation is hidden here (D-09).
 */
export function getHyperliquidData(): Record<string, { price: number; qty: number }> {
  const wallet = getScriptProp("HL_WALLET_ADDRESS");
  const hlAssets = ASSETS.filter((a) => a.venue === "hyperliquid");
  const tickers = hlAssets.map((a) => a.ticker!);
  const mids = fetchHlSpotMids(tickers);
  const qtys = fetchHlBalances(wallet, tickers);
  const out: Record<string, { price: number; qty: number }> = {};
  for (const a of hlAssets) {
    const ticker = a.ticker!;
    out[a.id] = { price: mids[ticker]!, qty: qtys[ticker]! }; // ticker->id hidden (D-09)
  }
  return out;
}
