import assert from "node:assert/strict";
import test from "node:test";
import { niftyTestSide, setNiftyFutureChartCandles } from "./market.js";

const algo = {
  kind: "nifty-test",
  name: "Nifty Test",
  side: "BOTH",
  timeframe: "5m",
};

test("nifty test has no BUY or SELL until the live future candle has an open", () => {
  setNiftyFutureChartCandles([]);
  assert.equal(niftyTestSide(algo), "");
});

test("nifty test buys when the live current candle is above its open and sells when it is below", () => {
  const now = Date.now();
  const start = now - (now % (5 * 60 * 1000));
  setNiftyFutureChartCandles([
    { time: start, open: 22663, high: 22680, low: 22660, close: 22680, volume: 1 },
  ]);
  assert.equal(niftyTestSide(algo), "BUY");
  setNiftyFutureChartCandles([
    { time: start, open: 22680, high: 22690, low: 22647.5, close: 22647.5, volume: 1 },
  ]);
  assert.equal(niftyTestSide(algo), "SELL");
  setNiftyFutureChartCandles([
    { time: start, open: 22663, high: 22670, low: 22660, close: 22663, volume: 1 },
  ]);
  assert.equal(niftyTestSide(algo), "");
  setNiftyFutureChartCandles([]);
});
