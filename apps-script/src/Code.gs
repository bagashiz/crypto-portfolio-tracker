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