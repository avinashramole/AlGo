import assert from "node:assert/strict";
import test from "node:test";
import {
  atr,
  bollinger,
  ema,
  heikinAshi,
  rsi,
  sessionPivots,
  sessionVwap,
  sma,
  stochastic,
  supertrend,
  wma,
} from "./chartIndicators.ts";

test("sma waits for a full window then rolls", () => {
  assert.deepEqual(sma([2, 4, 6, 8], 2), [null, 3, 5, 7]);
});

test("ema seeds from the first SMA then follows closes", () => {
  const values = [10, 12, 11, 13, 14];
  const out = ema(values, 3);
  assert.equal(out[0], null);
  assert.equal(out[1], null);
  assert.equal(out[2], 11);
  assert.ok(Math.abs(out[3] - 12) < 1e-9);
  assert.ok(Math.abs(out[4] - 13) < 1e-9);
});

test("wma weights recent closes more", () => {
  assert.deepEqual(wma([1, 2, 3], 3), [null, null, 14 / 6]);
});

test("session VWAP resets on a new IST day", () => {
  const candles = [
    { time: Date.parse("2026-04-06T03:45:00Z"), high: 100, low: 100, close: 100, volume: 10 },
    { time: Date.parse("2026-04-06T04:00:00Z"), high: 110, low: 110, close: 110, volume: 10 },
    { time: Date.parse("2026-04-06T18:45:00Z"), high: 200, low: 200, close: 200, volume: 10 },
  ];
  const out = sessionVwap(candles);
  assert.equal(out[0], 100);
  assert.equal(out[1], 105);
  assert.equal(out[2], 200);
});

test("RSI is 100 on a straight-up series", () => {
  const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
  const out = rsi(values, 14);
  assert.equal(out[14], 100);
});

test("Bollinger mid equals SMA and bands sit around it", () => {
  const values = [10, 12, 11, 13, 12];
  const { mid, upper, lower } = bollinger(values, 5, 2);
  assert.equal(mid[4], sma(values, 5)[4]);
  assert.ok(upper[4] > mid[4]);
  assert.ok(lower[4] < mid[4]);
});

test("ATR is positive after the seed window", () => {
  const candles = [
    { time: 1, open: 10, high: 12, low: 9, close: 11, volume: 1 },
    { time: 2, open: 11, high: 13, low: 10, close: 12, volume: 1 },
    { time: 3, open: 12, high: 14, low: 11, close: 13, volume: 1 },
  ];
  const out = atr(candles, 2);
  assert.ok(out[2] > 0);
});

test("Supertrend stays on the live series after ATR seeds", () => {
  const candles = Array.from({ length: 12 }, (_, i) => ({
    time: i,
    open: 100 + i,
    high: 102 + i,
    low: 99 + i,
    close: 101 + i,
    volume: 10,
  }));
  const { line, dir } = supertrend(candles, 3, 2);
  assert.ok(line[11] != null);
  assert.equal(dir[11], 1);
});

test("Heikin Ashi close is the OHLC average", () => {
  const [first] = heikinAshi([{ time: 1, open: 10, high: 16, low: 8, close: 14, volume: 2 }]);
  assert.equal(first.close, 12);
});

test("Stochastic %K is 100 at the lookback high close", () => {
  const candles = [
    { time: 1, open: 10, high: 12, low: 8, close: 9, volume: 1 },
    { time: 2, open: 9, high: 15, low: 8, close: 15, volume: 1 },
  ];
  const { k } = stochastic(candles, 2, 1);
  assert.equal(k[1], 100);
});

test("session pivots use the prior IST day when present", () => {
  const candles = [
    { time: Date.parse("2026-04-06T05:00:00Z"), high: 120, low: 80, close: 100, volume: 1, open: 90 },
    { time: Date.parse("2026-04-07T05:00:00Z"), high: 130, low: 90, close: 110, volume: 1, open: 100 },
  ];
  const pivots = sessionPivots(candles);
  assert.ok(pivots);
  assert.equal(pivots.p, 100);
  assert.equal(pivots.r1, 120);
  assert.equal(pivots.s1, 80);
});
