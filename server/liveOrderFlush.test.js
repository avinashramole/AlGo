import assert from "node:assert/strict";
import test from "node:test";
import { sendQueuedLiveOrders } from "./liveOrderFlush.js";

test("admin and mapped-user order requests start together", async () => {
  const started = [];
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const queued = [
    { brokerId: "dhan", strategy: "nifty test", side: "BUY", symbol: "NIFTY FUT", qty: 65 },
    { brokerId: "dhan", strategy: "nifty test", side: "BUY", symbol: "NIFTY FUT", qty: 65, copyUserId: "u-mapped" },
  ];
  const pending = sendQueuedLiveOrders(queued, {
    sendAdmin: async (payload) => {
      started.push(`admin:${payload.strategy}`);
      await gate;
      return { orderId: "admin-1", status: "PENDING" };
    },
    sendCopy: async (payload) => {
      started.push(`user:${payload.copyUserId}`);
      await gate;
      return { id: "member-1", status: "PENDING" };
    },
  });
  await Promise.resolve();
  assert.deepEqual(started, ["admin:nifty test", "user:u-mapped"]);
  release();
  const results = await pending;
  assert.equal(results[0].ok, true);
  assert.equal(results[0].value.orderId, "admin-1");
  assert.equal(results[1].ok, true);
  assert.equal(results[1].value.id, "member-1");
  assert.equal(results[1].payload.copyUserId, "u-mapped");
});

test("one rejected request does not block the other", async () => {
  const results = await sendQueuedLiveOrders(
    [
      { brokerId: "dhan", side: "SELL" },
      { brokerId: "zerodha", side: "SELL", copyUserId: "u2" },
    ],
    {
      sendAdmin: async () => {
        throw new Error("admin token");
      },
      sendCopy: async () => ({ id: "m2", status: "PENDING" }),
    },
  );
  assert.equal(results[0].ok, false);
  assert.match(results[0].error.message, /admin token/);
  assert.equal(results[1].ok, true);
  assert.equal(results[1].brokerId, "zerodha");
});
