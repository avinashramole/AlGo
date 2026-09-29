import assert from "node:assert/strict";
import test from "node:test";
import {
  applyLiveQuotes,
  formatLiveFuturePreview,
  niftyFuturePreviewBar,
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

test("live preview candle keeps its own open and close while the 5m bar is still forming", () => {
  const start = OPEN_0915;
  const now = start + FIVE + 60_000;
  setNiftyFutureChartCandles([
    { time: start, open: 22678.6, high: 22690, low: 22660, close: 22668.5, volume: 20 },
    { time: start + FIVE, open: 22663, high: 22670, low: 22647.5, close: 22647.5, volume: 12 },
  ]);
  const preview = niftyFuturePreviewBar("5m", now);
  assert.equal(preview.open, 22663);
  assert.equal(preview.close, 22647.5);
  assert.equal(
    formatLiveFuturePreview(preview, 5),
    "LIVE NIFTY FUT RED O 22663.00 C 22647.50 · 09:20–09:25 IST · WAIT PE",
  );
  assert.equal(
    formatLiveFuturePreview(
      preview,
      5,
      {
        ce: { open: 120, close: 100 },
        pe: { open: 80, close: 95 },
      },
    ),
    "LIVE NIFTY FUT RED CE RED PE GREEN O 22663.00 C 22647.50 · 09:20–09:25 IST · BUY PE",
  );
  const closed = niftyFutureSignalBars("5m", now);
  assert.equal(closed.length, 1);
  assert.equal(closed[0].open, 22678.6);
  assert.equal(closed[0].close, 22668.5);
  setNiftyFutureChartCandles([]);
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

test("a Dhan 15:05 stamp is the 15:00-15:05 candle, and the buy uses the current 15:05 candle", () => {
  const close0920 = OPEN_0915 + FIVE;
  const close1505 = Date.parse("2026-09-29T09:35:00.000Z");
  const open1500 = close1505 - FIVE;
  const open1505 = close1505;
  const now = Date.parse("2026-09-29T09:37:00.000Z");
  const realNow = Date.now;
  Date.now = () => now;
  try {
    setNiftyFutureChartCandles([
      { time: close0920, open: 22600, high: 22620, low: 22590, close: 22610, volume: 10 },
      { time: close1505, open: 22665, high: 22680, low: 22660, close: 22672.4, volume: 12 },
    ]);
    const stored = peekNiftyFutureBars();
    assert.equal(stored[1].time, open1500);
    assert.equal(stored[1].open, 22665);
    assert.equal(stored[1].close, 22672.4);
    applyLiveQuotes([
      { symbol: "NIFTY FUT", parent: "NIFTY 50", kind: "future", ltp: 22660, securityId: "58072" },
    ]);
    applyLiveQuotes([
      { symbol: "NIFTY FUT", parent: "NIFTY 50", kind: "future", ltp: 22655, securityId: "58072" },
    ]);
    const preview = niftyFuturePreviewBar("5m", now);
    assert.equal(preview.time, open1505);
    assert.equal(preview.open, 22660);
    assert.equal(preview.close, 22655);
    const text = formatLiveFuturePreview(preview, 5);
    assert.match(text, /NIFTY FUT RED/);
    assert.match(text, /15:05–15:10 IST/);
    assert.doesNotMatch(text, /BUY CE/);
    const previous = peekNiftyFutureBars().find((bar) => bar.time === open1500);
    assert.equal(previous.open, 22665);
    assert.equal(previous.close, 22672.4);
  } finally {
    Date.now = realNow;
    setNiftyFutureChartCandles([]);
    setLiveCandles([{ time: Date.now(), open: 1, high: 1, low: 1, close: 1, volume: 1 }], "NIFTY");
  }
});
