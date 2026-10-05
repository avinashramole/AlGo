import assert from "node:assert/strict";
import test from "node:test";
import { armLiveTarget, drainPendingLiveAlgoOrders, liveAlgoBrokerSignal, onLiveAlgoOrders, queueLiveAlgoOrder } from "./market.js";

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
  await new Promise((resolve) => {
    queueMicrotask(resolve);
  });
  assert.equal(calls, 1);
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
