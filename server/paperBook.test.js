import assert from "node:assert/strict";
import test from "node:test";
import { hasPaperActivity, isLiveBrokerTrade, isPaperTrade, isSimTrade, memberIsPaperTrade } from "../src/lib/paperBook.ts";

test("paper book helpers keep live broker rows off the paper tab", () => {
  assert.equal(isPaperTrade({ paper: true }), true);
  assert.equal(isPaperTrade({ brokerId: "paper" }), true);
  assert.equal(isPaperTrade({ brokerId: "dhan" }), false);
  assert.equal(isSimTrade({ sim: true, brokerId: "dhan" }), true);
  assert.equal(isSimTrade({ sim: true, paper: true }), false);
  assert.equal(isLiveBrokerTrade({ brokerId: "dhan", live: true }), true);
  assert.equal(isLiveBrokerTrade({ paper: true }), false);
  assert.equal(isLiveBrokerTrade({ sim: true, brokerId: "dhan" }), false);
  assert.equal(memberIsPaperTrade({ brokerId: "dhan" }, { tradeMode: "paper" }), true);
  assert.equal(memberIsPaperTrade({ brokerId: "dhan", live: true }, { tradeMode: "paper" }), false);
  assert.equal(hasPaperActivity({ orders: [{ brokerId: "dhan" }] }), false);
  assert.equal(hasPaperActivity({ orders: [{ paper: true }] }), true);
  assert.equal(hasPaperActivity({ algos: [{ enabled: true, runMode: "paper" }] }), true);
  assert.equal(hasPaperActivity({ algos: [{ enabled: true, runMode: "paper", testDesk: true }] }), false);
  assert.equal(hasPaperActivity({ orders: [{ paper: true, testDesk: true }] }), false);
  assert.equal(hasPaperActivity({ tradeMode: "paper" }), true);
});
