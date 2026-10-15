import assert from "node:assert/strict";
import test from "node:test";
import { exitReasonLabel, exitRoleFromReason, keepExitReason, orderWhyLabel, preferOrderRole } from "./exitReason.js";

test("SL and TGT exit reasons stay readable on the order book", () => {
  assert.equal(exitReasonLabel({ role: "sl" }), "SL HIT");
  assert.equal(exitReasonLabel({ exitReason: "sl" }), "SL HIT");
  assert.equal(exitReasonLabel({ role: "trail" }), "TRAILING SL HIT");
  assert.equal(exitReasonLabel({ exitReason: "trailing-sl" }), "TRAILING SL HIT");
  assert.equal(exitReasonLabel({ role: "target" }), "TGT DONE");
  assert.equal(exitReasonLabel({ exitReason: "target" }), "TGT DONE");
  assert.equal(exitReasonLabel({ reason: "UDAPI10005 · Too Many Request Sent" }), "");
  assert.equal(keepExitReason("TGT DONE", "Sent to Dhan (TRADED)"), "TGT DONE");
  assert.equal(exitRoleFromReason("sl"), "sl");
  assert.equal(exitRoleFromReason("trail"), "trail");
  assert.equal(exitRoleFromReason("target"), "target");
});

test("order why shows strategy entry and SL, not Dhan TRADE CONFIRMED", () => {
  assert.equal(
    orderWhyLabel({ side: "BUY", strategy: "CRUDE OIL", reason: "TRADE CONFIRMED", role: "entry" }),
    "ENTRY",
  );
  assert.equal(
    orderWhyLabel({ side: "BUY", strategy: "CRUDE OIL", reason: "TRADE CONFIRMED" }),
    "ENTRY",
  );
  assert.equal(
    orderWhyLabel({ side: "SELL", strategy: "CRUDE OIL", role: "sl", reason: "TRADE CONFIRMED" }),
    "SL HIT",
  );
  assert.equal(
    orderWhyLabel({ side: "SELL", strategy: "CRUDE OIL", reason: "TRADE CONFIRMED" }),
    "EXIT",
  );
  assert.equal(keepExitReason("ENTRY", "TRADE CONFIRMED"), "ENTRY");
  assert.equal(keepExitReason("TRADE CONFIRMED", "SL HIT"), "SL HIT");
  assert.equal(keepExitReason("SL HIT", "TRADE CONFIRMED"), "SL HIT");
  assert.equal(keepExitReason("ENTRY", "Insufficient funds"), "Insufficient funds");
  assert.equal(orderWhyLabel({ reason: "TRADE CONFIRMED" }), "");
  assert.equal(
    orderWhyLabel({
      side: "BUY",
      strategy: "Shivam T2S Strategy",
      role: "entry",
      reason: "Not sent to Dhan. Connect a live Access Token on Brokers, then BUY/SELL again.",
    }),
    "ENTRY",
  );
  assert.equal(orderWhyLabel({ status: "REJECTED", reason: "RMS rejected" }), "RMS rejected");
  assert.equal(orderWhyLabel({ status: "REJECTED", reason: "TRADE CONFIRMED", strategy: "CRUDE OIL", side: "BUY" }), "");
  assert.equal(preferOrderRole("exit", "sl"), "sl");
  assert.equal(preferOrderRole("sl", "exit"), "sl");
  assert.equal(
    orderWhyLabel({
      side: "SELL",
      strategy: "Shivam T2S Strategy",
      role: preferOrderRole("exit", "sl"),
      reason: "TRADE CONFIRMED",
    }),
    "SL HIT",
  );
});
