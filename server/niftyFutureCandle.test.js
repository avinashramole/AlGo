import assert from "node:assert/strict";
import test from "node:test";
import {
  applyLiveQuotes,
  niftyFutureSignalBars,
  peekNiftyFutureBars,
  setLiveCandles,
  setNiftyFutureChartCandles,
} from "./market.js";

const OPEN_0915 = Date.parse("2026-09-29T03:45:00.000Z");
const FIVE = 5 * 60 * 1000;

function minute(i, open, close) {
  return {
    time: OPEN_0915 + i * 60_000,
    open,
    high: Math.max(open, close) + 1,
    low: Math.min(open, close) - 1,
    close,
    volume: 10,
  };
}

test("first candle uses the Nifty future 5m candle, not the index tape", () => {
  const futureMinutes = [
    minute(0, 22663, 22658),
    minute(1, 22658, 22655),
    minute(2, 22655, 22652),
    minute(3, 22652, 22650),
    minute(4, 22650, 22647.5),
    minute(5, 22647.5, 22640),
  ];
  setNiftyFutureChartCandles(futureMinutes);
  setLiveCandles(
    [
      {
        time: OPEN_0915,
        open: 22678.6,
        high: 22690,
        low: 22660,
        close: 22668.5,
        volume: 1,
      },
    ],
    "NIFTY",
    "INDEX",
  );
  const closed = niftyFutureSignalBars("5m", OPEN_0915 + FIVE);
  assert.equal(closed.length, 1);
  assert.equal(closed[0].time, OPEN_0915);
  assert.equal(closed[0].open, 22663);
  assert.equal(closed[0].close, 22647.5);

  applyLiveQuotes([
    { symbol: "NIFTY 50", parent: "NIFTY 50", kind: "index", ltp: 22678.6, open: 22678.6, high: 22690, low: 22660 },
  ]);
  const afterIndex = niftyFutureSignalBars("5m", OPEN_0915 + FIVE);
  assert.equal(afterIndex[0].open, 22663);
  assert.equal(afterIndex[0].close, 22647.5);
  setNiftyFutureChartCandles([]);
  setLiveCandles([{ time: Date.now(), open: 1, high: 1, low: 1, close: 1, volume: 1 }], "NIFTY");
});

test("official Nifty future 5m open stays put when the index and the future tick", () => {
  const now = Date.now();
  const start = now - (now % FIVE) - FIVE;
  const official = [
    { time: start, open: 22663, high: 22670, low: 22647.5, close: 22647.5, volume: 20 },
    { time: start + FIVE, open: 22647.5, high: 22655, low: 22640, close: 22650, volume: 20 },
  ];
  setNiftyFutureChartCandles(official);
  setLiveCandles(official, "NIFTY", "FUTIDX");
  applyLiveQuotes([
    { symbol: "NIFTY 50", parent: "NIFTY 50", kind: "index", ltp: 22678.6, open: 22678.6 },
  ]);
  const afterIndex = peekNiftyFutureBars();
  assert.equal(afterIndex[0].open, 22663);
  assert.equal(afterIndex[0].close, 22647.5);
  assert.equal(afterIndex[1].open, 22647.5);

  applyLiveQuotes([
    { symbol: "NIFTY FUT", parent: "NIFTY 50", kind: "future", ltp: 22652, securityId: "58072" },
  ]);
  const afterFuture = peekNiftyFutureBars();
  assert.equal(afterFuture[1].open, 22647.5);
  assert.equal(afterFuture.length, 2);
  const printed = niftyFutureSignalBars("5m", now);
  const shown = printed.find((bar) => bar.time === start);
  assert.equal(shown.open, 22663);
  assert.equal(shown.close, 22647.5);
  setNiftyFutureChartCandles([]);
  setLiveCandles([{ time: Date.now(), open: 1, high: 1, low: 1, close: 1, volume: 1 }], "NIFTY");
});
