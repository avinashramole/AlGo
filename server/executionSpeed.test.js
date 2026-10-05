import assert from "node:assert/strict";
import test from "node:test";
import {
  crossBuyLimit,
  exitMarks,
  marketableBuyLimit,
  needsScripMasterLookup,
  planTargetExit,
  setLivePriceReader,
} from "./executionSpeed.js";

test("a buy limit crosses a target print instead of sitting behind it", () => {
  assert.equal(marketableBuyLimit(140, 145), 145.05);
  assert.equal(marketableBuyLimit(140, 130), 140);
  assert.equal(marketableBuyLimit(140, 0), 140);
  assert.equal(marketableBuyLimit(100, 160), 110);
});

test("crossBuyLimit uses the latest price and leaves sells alone", () => {
  setLivePriceReader((symbol) => (symbol === "NIFTY 22650 CE" ? 145 : 0));
  const buy = crossBuyLimit({ side: "BUY", type: "LIMIT", symbol: "NIFTY 22650 CE", price: 140 });
  assert.equal(buy.price, 145.05);
  const sell = crossBuyLimit({ side: "SELL", type: "LIMIT", symbol: "NIFTY 22650 CE", price: 145 });
  assert.equal(sell.price, 145);
  const market = crossBuyLimit({ side: "BUY", type: "MARKET", symbol: "NIFTY 22650 CE", price: 140 });
  assert.equal(market.price, 140);
  setLivePriceReader(() => 0);
});

test("a known security id skips the scrip master lookup", () => {
  assert.equal(needsScripMasterLookup({ securityId: "54321", expiry: "2026-10-06" }), false);
  assert.equal(needsScripMasterLookup({ securityId: "0", expiry: "2026-10-06" }), true);
  assert.equal(needsScripMasterLookup({ expiry: "2026-10-06" }), true);
  assert.equal(needsScripMasterLookup({ securityId: "" }), false);
});

test("target uses the live tick when the chain snapshot is still behind", () => {
  const marks = exitMarks({ chain: 140, tick: 145, avg: 100, ticked: true });
  assert.equal(marks.mark, 145);
  const chain = exitMarks({ chain: 145, tick: 100, avg: 100, ticked: false });
  assert.equal(chain.mark, 145);
  const insane = exitMarks({ chain: 25000, tick: 145, avg: 100, ticked: true });
  assert.equal(insane.mark, 145);
});

test("after a buy the target is tracked until TGT is hit, not parked as a limit sell", () => {
  assert.deepEqual(planTargetExit({ mark: 111.45, target: 161.28, resting: false }), { action: "track" });
  assert.deepEqual(planTargetExit({ mark: 144.5, target: 145, resting: false }), { action: "track" });
  assert.equal(planTargetExit({ mark: 145, target: 145, resting: false }).action, "market");
  assert.equal(planTargetExit({ mark: 80, target: 145, resting: false }).action, "track");
  assert.equal(planTargetExit({ mark: 145, target: 145, resting: true }).action, "wait-resting");
  assert.equal(planTargetExit({ mark: 144, target: 145, resting: true }).action, "resting");
  assert.equal(planTargetExit({ mark: 0, target: 145 }).action, "none");
});
