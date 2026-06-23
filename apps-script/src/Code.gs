const HL_INFO_URL = "https://api.hyperliquid.xyz/info";
const JUP_PRICE_URL = "https://api.jup.ag/price/v3";
const JUP_BALANCES_URL = "https://api.jup.ag/ultra/v1/balances";

const SOL_USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

const CACHE_KEYS = {
  HL_PRICES: "HL_PRICES",
  HL_BALANCES: "HL_BALANCES",
  JUP_BALANCES: "JUP_BALANCES"
};

/* -------------------------------------------------------------------------- */
/* Properties                                                                 */
/* -------------------------------------------------------------------------- */

function getScriptProp(name) {
  const value = PropertiesService.getScriptProperties().getProperty(name);

  if (!value) {
    throw new Error(`Missing Script Property: ${name}`);
  }

  return value;
}

function getCacheTtlSeconds() {
  const value = PropertiesService.getScriptProperties().getProperty("CACHE_TTL_SECONDS");

  if (!value) {
    return 300;
  }

  const ttl = Number(value);

  if (!Number.isFinite(ttl) || ttl <= 0) {
    throw new Error("CACHE_TTL_SECONDS invalid");
  }

  return ttl;
}

/* -------------------------------------------------------------------------- */
/* Cache                                                                       */
/* -------------------------------------------------------------------------- */

function cacheGet(key) {
  const raw = CacheService.getScriptCache().get(key);

  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
}

function cachePut(key, value) {
  CacheService.getScriptCache().put(key, JSON.stringify(value), getCacheTtlSeconds());
}

/* -------------------------------------------------------------------------- */
/* Stale cache                                                                 */
/* -------------------------------------------------------------------------- */

function staleGet(key) {
  const raw = PropertiesService.getScriptProperties().getProperty("STALE_" + key);

  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
}

function stalePut(key, value) {
  PropertiesService.getScriptProperties().setProperty("STALE_" + key, JSON.stringify(value));
}

/* -------------------------------------------------------------------------- */
/* Locked cached fetch                                                         */
/* -------------------------------------------------------------------------- */

function withCachedFetch(key, fetcher) {
  const cached = cacheGet(key);

  if (cached) {
    return cached;
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(15000);

  try {
    const secondCheck = cacheGet(key);

    if (secondCheck) {
      return secondCheck;
    }

    try {
      const result = fetcher();
      cachePut(key, result);
      stalePut(key, result);
      return result;
    } catch (err) {
      const stale = staleGet(key);

      if (stale) {
        return stale;
      }

      throw err;
    }
  } finally {
    lock.releaseLock();
  }
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

function normalizeTicker(x) {
  return String(x).trim().toUpperCase();
}

function normalizeMint(x) {
  return String(x).trim();
}

/* -------------------------------------------------------------------------- */
/* Hyperliquid Prices                                                         */
/* -------------------------------------------------------------------------- */

function getHlPrices() {
  return withCachedFetch(CACHE_KEYS.HL_PRICES, function () {
    const res = UrlFetchApp.fetch(HL_INFO_URL, {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify({ type: "spotMetaAndAssetCtxs" }),
      muteHttpExceptions: true
    });

    if (res.getResponseCode() !== 200) {
      throw new Error(res.getContentText());
    }

    const body = JSON.parse(res.getContentText());
    const meta = body[0];
    const ctxs = body[1];

    const ctxMap = {};
    for (const ctx of ctxs) {
      ctxMap[ctx.coin] = ctx;
    }

    const prices = {};
    for (const token of meta.tokens) {
      const pair = meta.universe.find(
        u => u.tokens[0] === token.index && u.tokens[1] === 0
      );

      if (!pair) continue;

      const ctx = ctxMap[pair.name];

      if (!ctx || ctx.midPx == null) {
        continue;
      }

      prices[token.name] = Number(ctx.midPx);
    }

    return prices;
  });
}

/* -------------------------------------------------------------------------- */
/* Hyperliquid Balances                                                       */
/* -------------------------------------------------------------------------- */

function getHlBalances() {
  return withCachedFetch(CACHE_KEYS.HL_BALANCES, function () {
    const wallet = getScriptProp("HL_WALLET_ADDRESS");

    const res = UrlFetchApp.fetch(HL_INFO_URL, {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify({ type: "spotClearinghouseState", user: wallet }),
      muteHttpExceptions: true
    });

    if (res.getResponseCode() !== 200) {
      throw new Error(res.getContentText());
    }

    const body = JSON.parse(res.getContentText());
    const balances = {};

    for (const item of body.balances || []) {
      balances[item.coin] = Number(item.total);
    }

    return balances;
  });
}

/* -------------------------------------------------------------------------- */
/* Jupiter Balances                                                           */
/* -------------------------------------------------------------------------- */

function getJupBalances() {
  return withCachedFetch(CACHE_KEYS.JUP_BALANCES, function () {
    const wallet = getScriptProp("SOL_WALLET_ADDRESS");
    const apiKey = getScriptProp("JUP_API_KEY");

    const res = UrlFetchApp.fetch(`${JUP_BALANCES_URL}/${wallet}`, {
      headers: { "x-api-key": apiKey },
      muteHttpExceptions: true
    });

    if (res.getResponseCode() !== 200) {
      throw new Error(res.getContentText());
    }

    return JSON.parse(res.getContentText());
  });
}

/* -------------------------------------------------------------------------- */
/* Jupiter Prices                                                             */
/* -------------------------------------------------------------------------- */

function getJupPrices(mints) {
  const result = {};
  const missing = [];

  for (const mint of mints) {
    const key = "JUP_PRICE_" + mint;
    const cached = cacheGet(key);

    if (cached !== null) {
      result[mint] = cached;
    } else {
      missing.push(mint);
    }
  }

  if (missing.length > 0) {
    const apiKey = getScriptProp("JUP_API_KEY");

    const res = UrlFetchApp.fetch(`${JUP_PRICE_URL}?ids=${missing.join(",")}`, {
      headers: { "x-api-key": apiKey },
      muteHttpExceptions: true
    });

    if (res.getResponseCode() !== 200) {
      throw new Error(res.getContentText());
    }

    const body = JSON.parse(res.getContentText());

    for (const mint of missing) {
      const price = Number(body[mint]?.usdPrice || 0);
      cachePut("JUP_PRICE_" + mint, price);
      result[mint] = price;
    }
  }

  return result;
}

/* -------------------------------------------------------------------------- */
/* Single Cell Functions                                                      */
/* -------------------------------------------------------------------------- */

/**
 * =HL_PRICE("UBTC")
 */
function HL_PRICE(ticker) {
  ticker = normalizeTicker(ticker);
  const prices = getHlPrices();
  return Number(prices[ticker] || 0);
}

/**
 * =HL_BALANCE("USDC")
 */
function HL_BALANCE(ticker) {
  ticker = normalizeTicker(ticker);
  const balances = getHlBalances();
  return Number(balances[ticker] || 0);
}

/**
 * =JUP_PRICE("mint")
 */
function JUP_PRICE(mint) {
  mint = normalizeMint(mint);
  const prices = getJupPrices([mint]);
  return Number(prices[mint] || 0);
}

/**
 * =JUP_BALANCE("mint")
 */
function JUP_BALANCE(mint) {
  mint = normalizeMint(mint);
  const balances = getJupBalances();
  return Number(balances[mint]?.uiAmount || 0);
}

/* -------------------------------------------------------------------------- */
/* Batch Functions                                                            */
/* -------------------------------------------------------------------------- */

/**
 * =HL_PRICES(A2:A10)
 */
function HL_PRICES(range) {
  const prices = getHlPrices();
  return range.map(row => [Number(prices[normalizeTicker(row[0])] || 0)]);
}

/**
 * =HL_BALANCES(A2:A10)
 */
function HL_BALANCES(range) {
  const balances = getHlBalances();
  return range.map(row => [Number(balances[normalizeTicker(row[0])] || 0)]);
}

/**
 * =JUP_PRICES(A2:A10)
 */
function JUP_PRICES(range) {
  const mints = range.map(r => normalizeMint(r[0]));
  const prices = getJupPrices(mints);
  return mints.map(mint => [Number(prices[mint] || 0)]);
}

/**
 * =JUP_BALANCES(A2:A10)
 */
function JUP_BALANCES(range) {
  const balances = getJupBalances();
  return range.map(row => {
    const mint = normalizeMint(row[0]);
    return [Number(balances[mint]?.uiAmount || 0)];
  });
}

/* -------------------------------------------------------------------------- */
/* Combined Assets                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Hyperliquid USDC + Solana USDC
 *
 * =USDC_BALANCE()
 */
function USDC_BALANCE() {
  return HL_BALANCE("USDC") + JUP_BALANCE(SOL_USDC_MINT);
}

/* -------------------------------------------------------------------------- */
/* Historical snapshots                                                        */
/* -------------------------------------------------------------------------- */

const HOLDINGS_SHEET = "Holdings";
const HISTORY_SHEET = "History";

/**
 * Fresh USD value for one Holdings row, routed by its Network column. Mirrors the
 * Holdings Qty×Price logic but computes live (the cells use custom functions, which can
 * go stale if the sheet isn't open — so a trigger must not just read them).
 */
function valueForHoldingsRow(network, id) {
  switch (network) {
    case "Hyperliquid & Solana": return USDC_BALANCE(); // price = 1
    case "Hyperliquid": return HL_BALANCE(id) * HL_PRICE(id);
    case "Solana": return JUP_BALANCE(id) * JUP_PRICE(id);
    default: return 0;
  }
}

/**
 * Compute portfolio totals. Total Value is fetched FRESH (price/balance are custom
 * functions); Cost Basis and Realized PnL are read from the Holdings columns because those
 * are native SUMIFS formulas over Transactions and always recalc reliably.
 *
 * Holdings columns (1-based): E=5 Network, F=6 Ticker/Mint, J=10 Cost Basis, O=15 Real. PnL.
 */
function computePortfolioTotals() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HOLDINGS_SHEET);
  if (!sheet) throw new Error(`Sheet not found: ${HOLDINGS_SHEET}`);

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) throw new Error("Holdings has no data rows");

  const rows = sheet.getRange(2, 1, lastRow - 1, 15).getValues();

  let totalValue = 0;
  let costBasis = 0;
  let realizedPnl = 0;

  for (const row of rows) {
    if (!row[0]) continue; // no Asset name => not a data row
    const network = String(row[4]);
    const id = String(row[5]);
    totalValue += valueForHoldingsRow(network, id);
    costBasis += Number(row[9]) || 0;
    realizedPnl += Number(row[14]) || 0;
  }

  const unrealizedPnl = totalValue - costBasis;
  const totalPnl = unrealizedPnl + realizedPnl;

  return { totalValue, costBasis, unrealizedPnl, realizedPnl, totalPnl };
}

/**
 * Append one snapshot row to History. Run by the daily time-driven trigger
 * (see setupDailySnapshotTrigger); also safe to run by hand for an on-demand point.
 */
function snapshotPortfolio() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const history = ss.getSheetByName(HISTORY_SHEET);
  if (!history) throw new Error(`Sheet not found: ${HISTORY_SHEET} — build it first (sheet:build history)`);

  const t = computePortfolioTotals();
  history.appendRow([new Date(), t.totalValue, t.costBasis, t.unrealizedPnl, t.realizedPnl, t.totalPnl]);
}

/**
 * One-time setup: install the daily trigger for snapshotPortfolio. Triggers can't be
 * created by pushing code, so RUN THIS ONCE from the Apps Script editor (it will prompt for
 * authorization). Re-running replaces the existing snapshot trigger rather than duplicating.
 * Fires daily around 23:00 in the project timezone (Asia/Jakarta).
 */
function setupDailySnapshotTrigger() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === "snapshotPortfolio")
    .forEach(t => ScriptApp.deleteTrigger(t));

  ScriptApp.newTrigger("snapshotPortfolio")
    .timeBased()
    .everyDays(1)
    .atHour(23)
    .create();
}