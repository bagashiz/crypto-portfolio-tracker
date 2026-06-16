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

// ---------------------------------------------------------------------------
// Hyperliquid: parseHlSpotMids over a [meta, ctxs] fixture.
// ---------------------------------------------------------------------------

/**
 * Minimal spotMetaAndAssetCtxs fixture.
 * tokens: USDC=0 (quote), UBTC=1, HYPE=150, XAUT0=297.
 * universe[i] aligns positionally with ctxs[i].
 *   universe[0] = UBTC/USDC -> ctxs[0].midPx
 *   universe[1] = HYPE/USDC -> ctxs[1].midPx (mirrors HYPE @107 / pair [150,0])
 *   universe[2] = XAUT0/USDC -> ctxs[2].midPx
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
        { tokens: [1, 0], index: 50 },
        { tokens: [150, 0], index: 107 },
        { tokens: [297, 0], index: 199 },
      ],
    },
    [{ midPx: "65000.5" }, { midPx: "42.17" }, { midPx: "2650.0" }],
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

test("Hl parseHlSpotMids throws when the matched pair's ctxs midPx is null (D-10)", () => {
  const [meta] = hlSpotMetaFixture();
  const body = [meta, [{ midPx: "65000.5" }, { midPx: null }, { midPx: "2650.0" }]];
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
