import assert from "node:assert/strict";
import test from "node:test";
import { evaluateSignals } from "./backtest.js";

const BAR = 5 * 60 * 1000;
const T0 = Date.parse("2026-08-21T03:45:00.000Z");

function bar(i, close, extras = {}) {
  return {
    time: T0 + i * BAR,
    open: extras.open ?? close - 2,
    high: extras.high ?? close + 3,
    low: extras.low ?? close - 3,
    close,
    volume: extras.volume ?? 1000,
  };
}

const closeAlgo = {
  timeframe: "5m",
  buyLeft: "price",
  buyOp: "close_above",
  buyRight: "vwap",
  sellLeft: "price",
  sellOp: "close_below",
  sellRight: "vwap",
};

test("close above VWAP is a BUY on a completed bar", () => {
  const candles = [bar(0, 100), bar(1, 101), bar(2, 140, { high: 142, low: 138, volume: 10 })];
  const nowComplete = T0 + 3 * BAR;
  const orig = Date.now;
  Date.now = () => nowComplete;
  try {
    const signal = evaluateSignals(candles, 2, closeAlgo);
    assert.equal(signal.buy, true);
    assert.equal(signal.sell, false);
  } finally {
    Date.now = orig;
  }
});

test("close below VWAP is a SELL on a completed bar", () => {
  const candles = [bar(0, 140), bar(1, 138), bar(2, 90, { high: 92, low: 88, volume: 10 })];
  const nowComplete = T0 + 3 * BAR;
  const orig = Date.now;
  Date.now = () => nowComplete;
  try {
    const signal = evaluateSignals(candles, 2, closeAlgo);
    assert.equal(signal.sell, true);
    assert.equal(signal.buy, false);
  } finally {
    Date.now = orig;
  }
});

test("close above ignores the still-forming bar", () => {
  const candles = [bar(0, 140), bar(1, 138), bar(2, 200, { high: 202, low: 198, volume: 10 })];
  const forming = T0 + 2 * BAR + 30_000;
  const orig = Date.now;
  Date.now = () => forming;
  try {
    const signal = evaluateSignals(candles, 2, closeAlgo);
    assert.equal(signal.buy, false);
  } finally {
    Date.now = orig;
  }
});
