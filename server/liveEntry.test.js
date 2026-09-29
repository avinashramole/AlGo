import assert from "node:assert/strict";
import test from "node:test";
import {
  drainPendingLiveAlgoOrders,
  liveIndicatorSide,
  liveOptionSampleTime,
  minLiveBars,
  queueLiveAlgoOrder,
  replaceDhanBook,
} from "./market.js";

const BAR = 5 * 60 * 1000;
const T0 = Date.parse("2026-08-21T03:45:00.000Z");

function bar(i, close) {
  return {
    time: T0 + i * BAR,
    open: close - 1,
    high: close + 2,
    low: close - 2,
    close,
    volume: 100,
  };
}

const vwapBuy = {
  name: "test",
  side: "BUY",
  timeframe: "5m",
  symbol: "NIFTY",
  instrument: "option",
  optionType: "CE",
  period: 10,
  buyConditions: { join: "and", rows: [{ left: "price", op: "close_above", right: "vwap", value: 0 }] },
  sellConditions: { join: "and", rows: [{ left: "price", op: "close_below", right: "supertrend", value: 0 }] },
};

test("a BUY close-above-VWAP strategy does not wait for the sell indicator's bar count", () => {
  assert.equal(minLiveBars(vwapBuy), 3);
});

test("indicator BUY fires from a short tape once the completed close is above session VWAP", () => {
  const candles = [bar(0, 100), bar(1, 101), bar(2, 102), bar(3, 140)];
  const now = T0 + 4 * BAR;
  const early = liveIndicatorSide(vwapBuy, candles.slice(0, 2), now);
  assert.equal(early.reason, "candles");
  assert.equal(early.side, "");
  const hit = liveIndicatorSide(vwapBuy, candles, now);
  assert.equal(hit.side, "BUY");
  assert.equal(hit.reason, "signal");
});

test("first-candle option samples use the forming 09:15 bar, not the previous completed bar", () => {
  const during = Date.parse("2026-08-21T03:47:00.000Z");
  assert.equal(liveOptionSampleTime(during, 5, "09:00"), T0);
});

test("an open NIFTY option on another strategy does not block this strategy's order", () => {
  replaceDhanBook([
    {
      id: "dhan-pos-other",
      symbol: "NIFTY 23100 CE",
      type: "BUY",
      qty: 65,
      avg: 100,
      ltp: 110,
      strategy: "NIFTY 5m first candle",
      brokerId: "dhan",
      option: "CE",
      strike: 23100,
      live: true,
    },
  ]);
  drainPendingLiveAlgoOrders();
  const result = queueLiveAlgoOrder({
    strategy: "test",
    side: "BUY",
    symbol: "NIFTY 23100 CE",
    qty: 65,
    option: "CE",
    strike: 23100,
    kind: "option",
    brokerId: "dhan",
  });
  assert.equal(result.queued, true);
  const queued = drainPendingLiveAlgoOrders();
  assert.equal(queued.some((row) => row.strategy === "test" && !row.copyUserId), true);
  replaceDhanBook([]);
  drainPendingLiveAlgoOrders();
});

test("the same strategy does not queue a second NIFTY option while its lot is open", () => {
  replaceDhanBook([
    {
      id: "dhan-pos-test",
      symbol: "NIFTY 23100 CE",
      type: "BUY",
      qty: 65,
      avg: 100,
      ltp: 110,
      strategy: "test",
      brokerId: "dhan",
      option: "CE",
      strike: 23100,
      live: true,
    },
  ]);
  drainPendingLiveAlgoOrders();
  const result = queueLiveAlgoOrder({
    strategy: "test",
    side: "BUY",
    symbol: "NIFTY 23200 CE",
    qty: 65,
    option: "CE",
    strike: 23200,
    kind: "option",
    brokerId: "dhan",
  });
  assert.equal(result.queued, false);
  assert.equal(result.duplicate, true);
  const queued = drainPendingLiveAlgoOrders();
  assert.equal(queued.some((row) => row.strategy === "test" && !row.copyUserId), false);
  replaceDhanBook([]);
});
