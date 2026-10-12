import assert from "node:assert/strict";
import test from "node:test";
import { exitReasonLabel, exitRoleFromReason, keepExitReason } from "./exitReason.js";

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
