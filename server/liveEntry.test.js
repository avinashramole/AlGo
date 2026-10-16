import assert from "node:assert/strict";
import test from "node:test";
import {
  drainPendingLiveAlgoOrders,
  liveIndicatorSide,
  liveOptionSampleTime,
  minLiveBars,
  queueLiveAlgoOrder,
  replaceDhanBook,
  replaceDhanOrders,
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

test("a mapped user's open lot does not block the admin NIFTY broker order", () => {
  replaceDhanBook([
    {
      id: "copy-pos-user",
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
      copyUserId: "u-nifty-member",
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
});

test("a leftover paper lot does not block the live admin NIFTY broker order", () => {
  replaceDhanBook([
    {
      id: "paper-pos-test",
      symbol: "NIFTY 23100 CE",
      type: "BUY",
      qty: 65,
      avg: 100,
      ltp: 110,
      strategy: "test",
      brokerId: "paper",
      paper: true,
      option: "CE",
      strike: 23100,
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
  assert.equal(result.queued, true);
  const queued = drainPendingLiveAlgoOrders();
  assert.equal(queued.some((row) => row.strategy === "test" && !row.copyUserId && row.brokerId === "dhan"), true);
  replaceDhanBook([]);
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

test("a pending SELL on the book blocks a second close of the same contract", () => {
  replaceDhanBook([]);
  replaceDhanOrders([
    {
      id: "exit-pending-1",
      symbol: "NIFTY 23100 CE",
      side: "SELL",
      status: "PENDING",
      qty: 65,
      strategy: "test",
      brokerId: "dhan",
      option: "CE",
      strike: 23100,
      securityId: "sec-23100-ce",
    },
  ]);
  drainPendingLiveAlgoOrders();
  const result = queueLiveAlgoOrder({
    strategy: "test",
    side: "SELL",
    symbol: "NIFTY 23100 CE",
    qty: 65,
    option: "CE",
    strike: 23100,
    kind: "option",
    brokerId: "dhan",
    securityId: "sec-23100-ce",
  });
  assert.equal(result.queued, false);
  assert.equal(result.duplicate, true);
  const queued = drainPendingLiveAlgoOrders();
  assert.equal(queued.some((row) => row.side === "SELL" && !row.copyUserId), false);
  replaceDhanOrders([]);
});

test("leftover PENDING SELLs from earlier SL hits do not block a new SL close", () => {
  replaceDhanBook([
    {
      id: "crude-open-1",
      symbol: "CRUDEOIL 6100 CE",
      type: "BUY",
      qty: 100,
      avg: 90,
      ltp: 80,
      strategy: "CRUDE OIL",
      brokerId: "dhan",
      option: "CE",
      strike: 6100,
      live: true,
      openedAt: "2026-08-21T04:00:00.000Z",
    },
  ]);
  replaceDhanOrders(
    Array.from({ length: 10 }, (_, i) => ({
      id: `old-sl-${i}`,
      symbol: "CRUDEOIL 6100 CE",
      side: "SELL",
      status: "PENDING",
      qty: 100,
      price: 0,
      strategy: "CRUDE OIL",
      brokerId: "dhan",
      option: "CE",
      strike: 6100,
      securityId: "sec-crude-6100-ce",
      createdAt: "2026-08-21T03:50:00.000Z",
    })),
  );
  drainPendingLiveAlgoOrders();
  const result = queueLiveAlgoOrder({
    strategy: "CRUDE OIL",
    side: "SELL",
    symbol: "CRUDEOIL 6100 CE",
    qty: 100,
    option: "CE",
    strike: 6100,
    kind: "option",
    brokerId: "dhan",
    securityId: "sec-crude-6100-ce",
    role: "sl",
    exitReason: "sl",
  });
  assert.equal(result.queued, true);
  assert.notEqual(result.duplicate, true);
  const queued = drainPendingLiveAlgoOrders();
  assert.equal(queued.some((row) => row.side === "SELL" && row.role === "sl"), true);
  replaceDhanBook([]);
  replaceDhanOrders([]);
});

test("a FILLED SL SELL blocks another close of the same crude contract", () => {
  replaceDhanBook([
    {
      id: "crude-ghost-1",
      symbol: "CRUDEOIL 6100 CE",
      type: "BUY",
      qty: 100,
      avg: 90,
      ltp: 80,
      strategy: "CRUDE OIL",
      brokerId: "dhan",
      option: "CE",
      strike: 6100,
      live: true,
      openedAt: "2026-08-21T04:00:00.000Z",
    },
  ]);
  replaceDhanOrders([
    {
      id: "sl-filled-1",
      symbol: "CRUDEOIL 6100 CE",
      side: "SELL",
      status: "FILLED",
      qty: 100,
      filledQty: 100,
      strategy: "CRUDE OIL",
      brokerId: "dhan",
      option: "CE",
      strike: 6100,
      securityId: "sec-crude-6100-ce",
      createdAt: "2026-08-21T04:05:00.000Z",
    },
  ]);
  drainPendingLiveAlgoOrders();
  const result = queueLiveAlgoOrder({
    strategy: "CRUDE OIL",
    side: "SELL",
    symbol: "CRUDEOIL 6100 CE",
    qty: 100,
    option: "CE",
    strike: 6100,
    kind: "option",
    brokerId: "dhan",
    securityId: "sec-crude-6100-ce",
    role: "sl",
    exitReason: "sl",
  });
  assert.equal(result.queued, false);
  assert.equal(result.duplicate, true);
  assert.equal(result.blocked, true);
  assert.equal(result.status, "FILLED");
  const queued = drainPendingLiveAlgoOrders();
  assert.equal(queued.some((row) => row.side === "SELL" && !row.copyUserId), false);
  replaceDhanBook([]);
  replaceDhanOrders([]);
});

test("NIFTY first candle does not queue a CE while a PE lot is open", () => {
  replaceDhanBook([
    {
      id: "dhan-pos-nifty-pe",
      symbol: "NIFTY 22950 PE",
      type: "BUY",
      qty: 65,
      avg: 126.65,
      ltp: 109.5,
      strategy: "NIFTY",
      brokerId: "dhan",
      option: "PE",
      strike: 22950,
      live: true,
    },
  ]);
  drainPendingLiveAlgoOrders();
  const result = queueLiveAlgoOrder({
    strategy: "NIFTY",
    side: "BUY",
    symbol: "NIFTY 23000 CE",
    qty: 65,
    option: "CE",
    strike: 23000,
    kind: "option",
    brokerId: "dhan",
  });
  assert.equal(result.queued, false);
  assert.equal(result.duplicate, true);
  assert.equal(result.blocked, true);
  const queued = drainPendingLiveAlgoOrders();
  assert.equal(queued.some((row) => !row.copyUserId && row.option === "CE"), false);
  replaceDhanBook([]);
});

test("a first-candle alias lot still blocks the next NIFTY BUY", () => {
  replaceDhanBook([
    {
      id: "dhan-pos-nifty-alias",
      symbol: "NIFTY 22950 PE",
      type: "BUY",
      qty: 65,
      avg: 126.65,
      ltp: 109.5,
      strategy: "NIFTY 5m first candle",
      brokerId: "dhan",
      option: "PE",
      strike: 22950,
      live: true,
    },
  ]);
  drainPendingLiveAlgoOrders();
  const result = queueLiveAlgoOrder({
    strategy: "NIFTY",
    side: "BUY",
    symbol: "NIFTY 23000 CE",
    qty: 65,
    option: "CE",
    strike: 23000,
    kind: "option",
    brokerId: "dhan",
  });
  assert.equal(result.queued, false);
  assert.equal(result.blocked, true);
  replaceDhanBook([]);
  drainPendingLiveAlgoOrders();
});

test("an untagged NIFTY lot still blocks the next first-candle BUY", () => {
  replaceDhanBook([
    {
      id: "dhan-pos-nifty-bare",
      symbol: "NIFTY 22950 PE",
      type: "BUY",
      qty: 65,
      avg: 126.65,
      ltp: 109.5,
      brokerId: "dhan",
      option: "PE",
      strike: 22950,
      live: true,
    },
  ]);
  drainPendingLiveAlgoOrders();
  const result = queueLiveAlgoOrder({
    strategy: "NIFTY",
    side: "BUY",
    symbol: "NIFTY 23000 CE",
    qty: 65,
    option: "CE",
    strike: 23000,
    kind: "option",
    brokerId: "dhan",
  });
  assert.equal(result.queued, false);
  assert.equal(result.blocked, true);
  replaceDhanBook([]);
  drainPendingLiveAlgoOrders();
});

test("allowFreshLiveEntry cannot open a second NIFTY first-candle lot", async () => {
  const { createAlgo, deleteAlgo, withLiveAlgo } = await import("./market.js");
  const created = createAlgo({
    name: `NIFTY fresh ${Date.now()}`,
    kind: "nifty-first-candle",
    runMode: "live",
  });
  try {
    withLiveAlgo(created.id, (algo) => {
      algo.allowFreshLiveEntry = true;
      return algo;
    });
    replaceDhanBook([
      {
        id: "dhan-pos-nifty-fresh",
        symbol: "NIFTY 22950 PE",
        type: "BUY",
        qty: 65,
        avg: 126.65,
        ltp: 109.5,
        strategy: created.name,
        brokerId: "dhan",
        option: "PE",
        strike: 22950,
        live: true,
      },
    ]);
    drainPendingLiveAlgoOrders();
    const result = queueLiveAlgoOrder({
      strategy: created.name,
      side: "BUY",
      symbol: "NIFTY 23000 CE",
      qty: 65,
      option: "CE",
      strike: 23000,
      kind: "option",
      brokerId: "dhan",
    });
    assert.equal(result.queued, false);
    assert.equal(result.blocked, true);
  } finally {
    replaceDhanBook([]);
    drainPendingLiveAlgoOrders();
    deleteAlgo(created.id);
  }
});

test("a hedge BUY can still add the second NIFTY leg", () => {
  replaceDhanBook([
    {
      id: "dhan-pos-hedge-pe",
      symbol: "NIFTY 22950 PE",
      type: "BUY",
      qty: 65,
      avg: 120,
      ltp: 110,
      strategy: "hedge-test",
      brokerId: "dhan",
      option: "PE",
      strike: 22950,
      live: true,
    },
  ]);
  drainPendingLiveAlgoOrders();
  const result = queueLiveAlgoOrder({
    strategy: "hedge-test",
    side: "BUY",
    symbol: "NIFTY 23000 CE",
    qty: 65,
    option: "CE",
    strike: 23000,
    kind: "option",
    brokerId: "dhan",
    allowHedge: true,
    role: "hedge",
  });
  assert.equal(result.queued, true);
  const queued = drainPendingLiveAlgoOrders();
  assert.equal(queued.some((row) => row.strategy === "hedge-test" && row.option === "CE" && !row.copyUserId), true);
  replaceDhanBook([]);
});
