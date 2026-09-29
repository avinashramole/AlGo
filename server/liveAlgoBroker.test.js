import assert from "node:assert/strict";
import test from "node:test";
import { drainPendingLiveAlgoOrders, liveAlgoBrokerSignal, onLiveAlgoOrders, queueLiveAlgoOrder } from "./market.js";

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
