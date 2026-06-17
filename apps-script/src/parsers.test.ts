/**
 * Deterministic parse-behavior tests for the data-layer providers (D-09/D-10/D-13).
 *
 * The providers' fetch wrappers touch Apps Script globals (`UrlFetchApp`,
 * `PropertiesService`) and cannot run under `bun test`. The high-risk logic —
 * response traversal, ticker/mint keying, and asymmetric fail-loud rules — lives
 * in PURE parse functions that take an already-parsed body and return a map.
 * These tests exercise those pure functions with fixture bodies, verifying:
 *   - D-09: assembly into the keyed map.
 *   - D-10: a tracked id whose PRICE is absent -> throw (config error).
 *   - D-13: a tracked id cleanly absent from a BALANCES body -> qty 0 (no throw);
 *           malformed/unparseable bodies -> throw (transient outage stays loud).
 */
import { test, expect } from "bun:test";
import { parseHlSpotMids, parseHlBalances } from "./HyperliquidApi";
import { parseJupPrices, parseJupBalances } from "./JupiterApi";

// ---------------------------------------------------------------------------
// Hyperliquid: parseHlSpotMids over a [meta, ctxs] fixture.
// ---------------------------------------------------------------------------

/**
 * spotMetaAndAssetCtxs fixture mirroring the REAL API shape: `ctxs` is NOT
 * positionally aligned with `universe` — it is longer (extra/delisted pairs)
 * and in a different order, so the only correct join is pair `name` == ctx
 * `coin`. A naive `ctxs[pairPos]` reads the leading decoy entries and must fail.
 * tokens: USDC=0 (quote), UBTC=1, HYPE=150, XAUT0=297.
 *   universe pairs: @142 = UBTC/USDC, @107 = HYPE/USDC, @182 = XAUT0/USDC.
 */
function hlSpotMetaFixture() {
  return [
    {
      tokens: [
        { name: "USDC", index: 0 },
        { name: "UBTC", index: 1 },
        { name: "HYPE", index: 150 },
        { name: "XAUT0", index: 297 },
      ],
      universe: [
        { tokens: [1, 0], index: 50, name: "@142" },
        { tokens: [150, 0], index: 107, name: "@107" },
        { tokens: [297, 0], index: 199, name: "@182" },
      ],
    },
    // Decoys occupy indexes 0-2 (the positional pairPos of UBTC/HYPE/XAUT0);
    // the real pairs sit further down. Index-based lookup would pick the decoys.
    [
      { coin: "@999", midPx: "0.000068" },
      { coin: "@555", midPx: "0.09286" },
      { coin: "@777", midPx: "0.3965" },
      { coin: "@142", midPx: "65000.5" }, // UBTC
      { coin: "@107", midPx: "42.17" }, // HYPE
      { coin: "@182", midPx: "2650.0" }, // XAUT0
    ],
  ];
}

test("Hl parseHlSpotMids returns finite mids keyed by ticker (HYPE via [tokenIndex,0] pair)", () => {
  const out = parseHlSpotMids(hlSpotMetaFixture(), ["UBTC", "HYPE", "XAUT0"]);
  expect(out["UBTC"]).toBe(65000.5);
  expect(out["HYPE"]).toBe(42.17);
  expect(out["XAUT0"]).toBe(2650.0);
  expect(Number.isFinite(out["HYPE"]!)).toBe(true);
});

test("Hl parseHlSpotMids throws when a tracked ticker is absent from meta.tokens (D-10)", () => {
  expect(() => parseHlSpotMids(hlSpotMetaFixture(), ["UBTC", "MISSING"])).toThrow();
});

test("Hl parseHlSpotMids joins ctxs by coin==pair.name, NOT by array position (regression)", () => {
  // The fixture's ctxs decoys at indexes 0-2 are the wrong (tiny) prices the
  // live feed misalignment surfaced; a positional read would return them.
  const out = parseHlSpotMids(hlSpotMetaFixture(), ["UBTC", "HYPE", "XAUT0"]);
  expect(out["UBTC"]).toBe(65000.5);
  expect(out["UBTC"]).not.toBe(0.000068);
});

test("Hl parseHlSpotMids throws when the matched pair's ctx midPx is null (D-10)", () => {
  const [meta] = hlSpotMetaFixture();
  const body = [meta, [{ coin: "@107", midPx: null }]]; // HYPE pair present but null mid
  expect(() => parseHlSpotMids(body, ["HYPE"])).toThrow();
});

test("Hl parseHlSpotMids throws when no ctx matches the pair name (D-10)", () => {
  const [meta] = hlSpotMetaFixture();
  const body = [meta, [{ coin: "@999", midPx: "1.0" }]]; // no @107 entry for HYPE
  expect(() => parseHlSpotMids(body, ["HYPE"])).toThrow();
});

test("Hl parseHlSpotMids throws when body is not a 2-element array (D-13)", () => {
  expect(() => parseHlSpotMids({ not: "an array" }, ["UBTC"])).toThrow();
  expect(() => parseHlSpotMids([{ tokens: [], universe: [] }], ["UBTC"])).toThrow();
});

test("Hl parseHlSpotMids throws when no USDC spot pair exists for a tracked ticker (D-10)", () => {
  const body = [
    {
      tokens: [{ name: "USDC", index: 0 }, { name: "UBTC", index: 1 }],
      universe: [{ tokens: [1, 5], index: 50 }], // UBTC quoted against token 5, not USDC(0)
    },
    [{ midPx: "65000.5" }],
  ];
  expect(() => parseHlSpotMids(body, ["UBTC"])).toThrow();
});

// ---------------------------------------------------------------------------
// Hyperliquid: parseHlBalances over a { balances: [{coin,total}] } fixture.
// ---------------------------------------------------------------------------

function hlBalancesFixture() {
  return {
    balances: [
      { coin: "UBTC", total: "0.5" },
      { coin: "HYPE", total: "120.0" },
      { coin: "USDC", total: "10.0" }, // untracked, ignored
    ],
  };
}

test("Hl parseHlBalances returns each present coin -> Number(total)", () => {
  const out = parseHlBalances(hlBalancesFixture(), ["UBTC", "HYPE"]);
  expect(out["UBTC"]).toBe(0.5);
  expect(out["HYPE"]).toBe(120.0);
});

test("Hl parseHlBalances returns 0 (no throw) for a tracked ticker absent from balances[] (D-13)", () => {
  const out = parseHlBalances(hlBalancesFixture(), ["UBTC", "XAUT0"]);
  expect(out["UBTC"]).toBe(0.5);
  expect(out["XAUT0"]).toBe(0); // cleanly absent -> legitimate zero holding
});

test("Hl parseHlBalances throws when body has no balances array / malformed (D-13)", () => {
  expect(() => parseHlBalances({ nope: true }, ["UBTC"])).toThrow();
  expect(() => parseHlBalances({ balances: "not-an-array" }, ["UBTC"])).toThrow();
  expect(() => parseHlBalances(null, ["UBTC"])).toThrow();
});

// ---------------------------------------------------------------------------
// Jupiter: parseJupPrices over a mint-keyed { "<mint>": { usdPrice } } fixture.
// ---------------------------------------------------------------------------

const MINT_A = "CqW2pd6dCPG9xKZfAsTovzDsMmAGKJSDBNcwM96ondo"; // IVVon
const MINT_B = "59obFNBzyTBGowrkif5uK7ojS58vsuWz3ZCvg6tfZAGw"; // PST

function jupPricesFixture() {
  return {
    [MINT_A]: { usdPrice: 102.5, decimals: 6 },
    [MINT_B]: { usdPrice: 1.0, decimals: 6 },
  };
}

test("Jup parseJupPrices returns each mint -> finite usdPrice", () => {
  const out = parseJupPrices(jupPricesFixture(), [MINT_A, MINT_B]);
  expect(out[MINT_A]).toBe(102.5);
  expect(out[MINT_B]).toBe(1.0);
  expect(Number.isFinite(out[MINT_A]!)).toBe(true);
});

test("Jup parseJupPrices throws when a tracked mint is absent (D-10)", () => {
  expect(() => parseJupPrices(jupPricesFixture(), [MINT_A, "MISSING_MINT"])).toThrow();
});

test("Jup parseJupPrices throws when usdPrice is not a number (D-10)", () => {
  const body = { [MINT_A]: { usdPrice: "not-a-number" as unknown as number } };
  expect(() => parseJupPrices(body, [MINT_A])).toThrow();
});

test("Jup parseJupPrices throws when body is not an object / malformed (D-13)", () => {
  expect(() => parseJupPrices(null, [MINT_A])).toThrow();
  expect(() => parseJupPrices("nope", [MINT_A])).toThrow();
  expect(() => parseJupPrices([1, 2, 3], [MINT_A])).toThrow();
});

// ---------------------------------------------------------------------------
// Jupiter: parseJupBalances over a mint-keyed { "<mint>": { uiAmount } } fixture.
// ---------------------------------------------------------------------------

function jupBalancesFixture() {
  return {
    SOL: { amount: "0", uiAmount: 0, slot: 1, isFrozen: false }, // native SOL, untracked
    [MINT_A]: { amount: "12500000", uiAmount: 12.5, slot: 1, isFrozen: false },
  };
}

test("Jup parseJupBalances returns each present mint -> uiAmount (not amount)", () => {
  const out = parseJupBalances(jupBalancesFixture(), [MINT_A]);
  expect(out[MINT_A]).toBe(12.5); // uiAmount, NOT the raw "12500000" amount
});

test("Jup parseJupBalances returns 0 (no throw) for a tracked mint absent from body (D-13)", () => {
  const out = parseJupBalances(jupBalancesFixture(), [MINT_A, MINT_B]);
  expect(out[MINT_A]).toBe(12.5);
  expect(out[MINT_B]).toBe(0); // cleanly absent -> legitimate zero holding
});

test("Jup parseJupBalances throws when body is malformed / not an object (D-13)", () => {
  expect(() => parseJupBalances(null, [MINT_A])).toThrow();
  expect(() => parseJupBalances("nope", [MINT_A])).toThrow();
  expect(() => parseJupBalances([1, 2, 3], [MINT_A])).toThrow();
});
