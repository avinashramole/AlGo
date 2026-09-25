import assert from "node:assert/strict";
import test from "node:test";
import { evaluateSignals, precomputeSources, runBacktest } from "./backtest.js";

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

test("AND requires every BUY condition", () => {
  const candles = [bar(0, 100), bar(1, 101), bar(2, 140)];
  const nowComplete = T0 + 3 * BAR;
  const orig = Date.now;
  Date.now = () => nowComplete;
  try {
    const both = evaluateSignals(candles, 2, {
      timeframe: "5m",
      buyConditions: {
        join: "and",
        rows: [
          { left: "price", op: "gt", right: "value", value: 50 },
          { left: "price", op: "lt", right: "value", value: 200 },
        ],
      },
      sellConditions: { join: "and", rows: [{ left: "price", op: "lt", right: "value", value: 0 }] },
    });
    assert.equal(both.buy, true);
    const miss = evaluateSignals(candles, 2, {
      timeframe: "5m",
      buyConditions: {
        join: "and",
        rows: [
          { left: "price", op: "gt", right: "value", value: 50 },
          { left: "price", op: "gt", right: "value", value: 150 },
        ],
      },
      sellConditions: { join: "and", rows: [{ left: "price", op: "lt", right: "value", value: 0 }] },
    });
    assert.equal(miss.buy, false);
  } finally {
    Date.now = orig;
  }
});

test("OR fires when any BUY condition is true", () => {
  const candles = [bar(0, 100), bar(1, 101), bar(2, 90)];
  const nowComplete = T0 + 3 * BAR;
  const orig = Date.now;
  Date.now = () => nowComplete;
  try {
    const signal = evaluateSignals(candles, 2, {
      timeframe: "5m",
      buyConditions: {
        join: "or",
        rows: [
          { left: "price", op: "gt", right: "value", value: 150 },
          { left: "price", op: "lt", right: "value", value: 100 },
        ],
      },
      sellConditions: { join: "and", rows: [{ left: "price", op: "gt", right: "value", value: 999 }] },
    });
    assert.equal(signal.buy, true);
  } finally {
    Date.now = orig;
  }
});

test("close_above in an AND group still ignores the forming bar", () => {
  const candles = [bar(0, 140), bar(1, 138), bar(2, 200, { high: 202, low: 198, volume: 10 })];
  const forming = T0 + 2 * BAR + 30_000;
  const orig = Date.now;
  Date.now = () => forming;
  try {
    const signal = evaluateSignals(candles, 2, {
      timeframe: "5m",
      buyConditions: {
        join: "and",
        rows: [
          { left: "price", op: "close_above", right: "vwap" },
          { left: "price", op: "gt", right: "value", value: 50 },
        ],
      },
      sellConditions: { join: "and", rows: [{ left: "price", op: "lt", right: "value", value: 0 }] },
    });
    assert.equal(signal.buy, false);
  } finally {
    Date.now = orig;
  }
});

test("precomputed sources match live EMA/VWAP reads", () => {
  const candles = [bar(0, 100), bar(1, 110), bar(2, 90), bar(3, 130, { volume: 20 })];
  const algo = { timeframe: "5m", fast: 3, slow: 4, lookback: 5 };
  const cache = precomputeSources(candles, algo);
  const live = evaluateSignals(candles, 3, { ...algo, buyLeft: "ema_fast", buyOp: "gt", buyRight: "ema_slow", sellLeft: "price", sellOp: "lt", sellRight: "value", sellValue: 0 });
  const cached = evaluateSignals(candles, 3, { ...algo, buyLeft: "ema_fast", buyOp: "gt", buyRight: "ema_slow", sellLeft: "price", sellOp: "lt", sellRight: "value", sellValue: 0 }, cache);
  assert.equal(cached.buy, live.buy);
  assert.equal(cached.price, live.price);
});

test("1-year 5m EMA backtest finishes without blocking the event loop", () => {
  const candles = Array.from({ length: 18_000 }, (_, i) => bar(i, 24500 + Math.sin(i / 12) * 40 + i * 0.02));
  const started = Date.now();
  const result = runBacktest(
    { timeframe: "5m", indicator: "EMA", fast: 9, slow: 21, side: "BOTH", qty: 65, slPct: 0.4, targetPct: 0.8 },
    candles,
  );
  assert.ok(Date.now() - started < 2000, `backtest took ${Date.now() - started}ms`);
  assert.equal(result.bars, 18_000);
  assert.equal(typeof result.pnl, "number");
});

test("close above uses today's session VWAP, not the previous day", () => {
  const day1 = Date.parse("2026-08-20T03:45:00.000Z");
  const day2 = Date.parse("2026-08-21T03:45:00.000Z");
  const candles = [0, 1, 2].map((i) => ({
    time: day1 + i * BAR,
    open: 200,
    high: 202,
    low: 198,
    close: 200,
    volume: 1000,
  }));
  candles.push(
    { time: day2, open: 100, high: 102, low: 98, close: 100, volume: 10 },
    { time: day2 + BAR, open: 100, high: 102, low: 98, close: 100, volume: 10 },
    { time: day2 + 2 * BAR, open: 120, high: 132, low: 118, close: 130, volume: 10 },
  );
  const orig = Date.now;
  Date.now = () => day2 + 3 * BAR;
  try {
    const signal = evaluateSignals(candles, candles.length - 1, closeAlgo);
    assert.equal(signal.buy, true);
    assert.equal(signal.sell, false);
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
