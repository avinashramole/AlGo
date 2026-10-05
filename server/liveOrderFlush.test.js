import assert from "node:assert/strict";
import test from "node:test";
import { isRetryableCopyError, sendQueuedLiveOrders } from "./liveOrderFlush.js";

test("admin and the first mapped copies start together", async () => {
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

test("a large copy list does not open every member broker at once", async () => {
  let inFlight = 0;
  let peak = 0;
  const copies = Array.from({ length: 8 }, (_, index) => ({
    brokerId: "dhan",
    side: "BUY",
    qty: 65,
    copyUserId: `u-${index}`,
  }));
  const results = await sendQueuedLiveOrders(copies, {
    sendCopy: async (payload) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 15));
      inFlight -= 1;
      return { id: payload.copyUserId, status: "PENDING" };
    },
  });
  assert.equal(results.length, 8);
  assert.equal(results.every((row) => row.ok), true);
  assert.ok(peak <= 2, `copy peak was ${peak}`);
});

test("a 429 copy is retried and later reaches the broker", async () => {
  let hits = 0;
  const results = await sendQueuedLiveOrders([{ brokerId: "dhan", copyUserId: "u-429", side: "BUY" }], {
    sendCopy: async () => {
      hits += 1;
      if (hits < 2) {
        const error = new Error("Dhan 429 rate limit");
        error.status = 429;
        error.rateLimit = true;
        error.retryAfterMs = 5;
        throw error;
      }
      return { id: "late-fill", status: "PENDING" };
    },
  });
  assert.equal(hits, 2);
  assert.equal(results[0].ok, true);
  assert.equal(results[0].value.id, "late-fill");
});

test("isRetryableCopyError is only for rate limits", () => {
  assert.equal(isRetryableCopyError({ status: 429, rateLimit: true }), true);
  assert.equal(isRetryableCopyError(new Error("Dhan 429 rate limit")), true);
  assert.equal(isRetryableCopyError(new Error("This member has no Dhan Client ID + Access Token.")), false);
});
