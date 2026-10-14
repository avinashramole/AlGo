import assert from "node:assert/strict";
import test from "node:test";
import {
  armLiveTarget,
  drainPendingLiveAlgoOrders,
  kickLiveAlgoFlush,
  liveAlgoBrokerSignal,
  onLiveAlgoOrders,
  queueLiveAlgoOrder,
  releaseStaleLiveSend,
  requeueLiveAlgoOrders,
} from "./market.js";
import { STALE_LIVE_SEND_MS } from "./niftyVwap/index.js";

test("broker accept is AT BROKER and a reject names the reason", () => {
  const accepted = liveAlgoBrokerSignal({
    payload: { side: "BUY", option: "CE" },
    live: { orderId: "OID1", status: "TRANSIT" },
  });
  assert.equal(accepted.accepted, true);
  assert.equal(accepted.lastSignal, "BUY CE AT BROKER OID1");
  const rejected = liveAlgoBrokerSignal({
    payload: { side: "BUY", option: "CE" },
    live: { status: "REJECTED" },
    error: new Error("Dhan is not LIVE. Connect Access Token on Brokers."),
  });
  assert.equal(rejected.accepted, false);
  assert.match(rejected.lastSignal, /^BROKER · Dhan is not LIVE/);
});

test("a buy uses one limit price so the admin and user books match", () => {
  drainPendingLiveAlgoOrders();
  queueLiveAlgoOrder({
    strategy: "NIFTY 5m first candle",
    side: "BUY",
    option: "CE",
    strike: 22650,
    qty: 65,
    price: 232.47,
    symbol: "NIFTY 22650 CE",
    brokerId: "dhan",
    type: "MARKET",
  });
  const [order] = drainPendingLiveAlgoOrders();
  assert.equal(order.type, "LIMIT");
  assert.equal(order.price, 232.45);
  queueLiveAlgoOrder({
    strategy: "NIFTY 5m first candle",
    side: "SELL",
    option: "CE",
    qty: 65,
    price: 232.45,
    symbol: "NIFTY 22650 CE",
    brokerId: "dhan",
  });
  const [exit] = drainPendingLiveAlgoOrders();
  assert.equal(exit.side, "SELL");
  assert.notEqual(exit.type, "LIMIT");
  assert.equal(exit.price, 232.45);
});

test("a strategy order asks for the broker send immediately", async () => {
  drainPendingLiveAlgoOrders();
  let calls = 0;
  onLiveAlgoOrders(() => {
    calls += 1;
  });
  const queued = queueLiveAlgoOrder({
    strategy: "NIFTY 5m first candle",
    side: "BUY",
    option: "CE",
    strike: 22650,
    qty: 65,
    symbol: "NIFTY 22650 CE",
    brokerId: "dhan",
  });
  assert.equal(queued.queued, true);
  assert.ok(calls >= 1);
  await new Promise((resolve) => {
    queueMicrotask(resolve);
  });
  assert.ok(calls >= 1);
  onLiveAlgoOrders(() => {});
  drainPendingLiveAlgoOrders();
});

test("stale SENDING with no pending or book is released so admin and user can send again", () => {
  drainPendingLiveAlgoOrders();
  const algo = {
    name: "NIFTY",
    allowFreshLiveEntry: false,
    lastSignal: "BUY CE SENDING · PREVIEW NIFTY FUT GREEN CE 22800",
    vwapState: {
      buyPhase: "entry",
      inFlight: true,
      lastEntryAt: Date.now() - STALE_LIVE_SEND_MS - 1_000,
      lastEntryBarTime: Date.now() - STALE_LIVE_SEND_MS - 1_000,
      lockedStrike: 22800,
      lockedOption: "CE",
    },
  };
  assert.equal(releaseStaleLiveSend(algo), true);
  assert.equal(algo.vwapState.buyPhase, "");
  assert.equal(algo.vwapState.inFlight, false);
  assert.equal(algo.vwapState.lastEntryBarTime, 0);
  assert.equal(algo.allowFreshLiveEntry, true);
});

test("a fresh SENDING is held while the flush can still run", () => {
  const algo = {
    name: "NIFTY",
    vwapState: {
      buyPhase: "entry",
      inFlight: true,
      lastEntryAt: Date.now(),
      lastEntryBarTime: Date.now(),
    },
  };
  assert.equal(releaseStaleLiveSend(algo), false);
  assert.equal(algo.vwapState.buyPhase, "entry");
  assert.equal(algo.vwapState.inFlight, true);
});

test("a drained send is put back when the broker flush throws", () => {
  drainPendingLiveAlgoOrders();
  queueLiveAlgoOrder({
    strategy: "NIFTY 5m first candle",
    side: "BUY",
    option: "CE",
    strike: 22800,
    qty: 65,
    symbol: "NIFTY 22800 CE",
    brokerId: "dhan",
  });
  const drained = drainPendingLiveAlgoOrders();
  assert.ok(drained.length >= 1);
  assert.equal(drainPendingLiveAlgoOrders().length, 0);
  assert.ok(requeueLiveAlgoOrders(drained) >= 1);
  const again = drainPendingLiveAlgoOrders();
  assert.equal(again.length, drained.length);
  assert.equal(again[0].option, "CE");
  assert.equal(again[0].strike, 22800);
});

test("tick kick asks for the broker send without waiting for a later microtask", () => {
  drainPendingLiveAlgoOrders();
  let calls = 0;
  onLiveAlgoOrders(() => {
    calls += 1;
  });
  queueLiveAlgoOrder({
    strategy: "NIFTY 5m first candle",
    side: "BUY",
    option: "CE",
    strike: 22800,
    qty: 65,
    symbol: "NIFTY 22800 CE",
    brokerId: "dhan",
  });
  assert.ok(calls >= 1);
  const before = calls;
  kickLiveAlgoFlush();
  assert.ok(calls > before);
  onLiveAlgoOrders(() => {});
  drainPendingLiveAlgoOrders();
});

test("after a live buy no TGT limit is sent until the mark hits target or stop", () => {
  drainPendingLiveAlgoOrders();
  const open = {
    id: "p-22500pe",
    symbol: "NIFTY 22500 PE",
    qty: 65,
    avg: 111.45,
    ltp: 111.45,
    product: "MIS",
    securityId: "sec-22500pe",
    strike: 22500,
    option: "PE",
    expiry: "2026-10-06",
    brokerId: "dhan",
  };
  const resting = armLiveTarget({
    algo: { name: "NIFTY 5m first candle" },
    open,
    target: 155.99,
    mark: 111.45,
    mode: "live",
  });
  assert.equal(resting, false);
  const queued = drainPendingLiveAlgoOrders();
  assert.equal(queued.length, 0);
  assert.equal(
    queued.some((row) => row.side === "SELL" && row.role === "target"),
    false,
  );
});
