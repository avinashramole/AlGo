import assert from "node:assert/strict";
import test from "node:test";
import {
  bookContractKey,
  exitReasonLabel,
  exitRoleFromReason,
  inferFilledExitLabel,
  isBrokerFillNote,
  keepExitReason,
  sameBookContract,
  stampExitReasons,
} from "./exitReason.js";

test("SL and TGT exit reasons stay readable on the order book", () => {
  assert.equal(exitReasonLabel({ role: "sl" }), "SL HIT");
  assert.equal(exitReasonLabel({ exitReason: "sl" }), "SL HIT");
  assert.equal(exitReasonLabel({ role: "trail" }), "TRAILING SL HIT");
  assert.equal(exitReasonLabel({ exitReason: "trailing-sl" }), "TRAILING SL HIT");
  assert.equal(exitReasonLabel({ role: "target" }), "TGT HIT");
  assert.equal(exitReasonLabel({ exitReason: "target" }), "TGT HIT");
  assert.equal(exitReasonLabel({ exitReason: "TGT DONE" }), "TGT HIT");
  assert.equal(exitReasonLabel({ reason: "UDAPI10005 · Too Many Request Sent" }), "");
  assert.equal(keepExitReason("TGT DONE", "Sent to Dhan (TRADED)"), "TGT HIT");
  assert.equal(keepExitReason("TGT HIT", "TRADE CONFIRMED"), "TGT HIT");
  assert.equal(keepExitReason("SL HIT", "TRADE CONFIRMED"), "SL HIT");
  assert.equal(keepExitReason("", "TRADE CONFIRMED"), "");
  assert.equal(keepExitReason("TRADE CONFIRMED", "TRADE CONFIRMED"), "");
  assert.equal(exitRoleFromReason("sl"), "sl");
  assert.equal(exitRoleFromReason("trail"), "trail");
  assert.equal(exitRoleFromReason("target"), "target");
  assert.equal(exitRoleFromReason("TGT DONE"), "target");
  assert.equal(isBrokerFillNote("TRADE CONFIRMED"), true);
  assert.equal(isBrokerFillNote("Sent to Dhan (TRADED). Order 1"), true);
  assert.equal(isBrokerFillNote("Insufficient funds"), false);
});

test("a cheaper FILLED SELL after the BUY is SL HIT, a richer SELL is TGT HIT", () => {
  const buy = {
    id: "buy-9050",
    symbol: "CRUDEOIL-15Oct2026-9050-PE",
    side: "BUY",
    status: "FILLED",
    price: 116.1,
    reason: "TRADE CONFIRMED",
    createdAt: "2026-10-14T10:41:50.000Z",
  };
  const slSell = {
    id: "sell-9050-sl",
    symbol: "CRUDEOIL-15Oct2026-9050-PE",
    side: "SELL",
    status: "FILLED",
    price: 95.7,
    reason: "TRADE CONFIRMED",
    createdAt: "2026-10-04T11:23:30.000Z",
  };
  const tgtSell = {
    id: "sell-9050-tgt",
    symbol: "CRUDEOIL-15Oct2026-9050-PE",
    side: "SELL",
    status: "FILLED",
    price: 140.5,
    reason: "TRADE CONFIRMED",
    createdAt: "2026-10-14T11:00:00.000Z",
  };
  assert.equal(bookContractKey(buy.symbol), "CRUDEOIL 9050 PE");
  assert.equal(sameBookContract(buy, slSell), true);
  assert.equal(inferFilledExitLabel([buy, slSell], slSell), "SL HIT");
  assert.equal(inferFilledExitLabel([buy, tgtSell], tgtSell), "TGT HIT");
  assert.equal(inferFilledExitLabel([buy, slSell], buy), "");

  const stamped = stampExitReasons([
    { ...buy },
    { ...slSell },
  ]);
  const exit = stamped.find((row) => row.id === "sell-9050-sl");
  const entry = stamped.find((row) => row.id === "buy-9050");
  assert.equal(exit.reason, "SL HIT");
  assert.equal(exit.exitReason, "SL HIT");
  assert.equal(exit.role, "sl");
  assert.equal(entry.reason || "", "");
  assert.equal(entry.exitReason || "", "");
});
