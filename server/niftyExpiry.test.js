import assert from "node:assert/strict";
import test from "node:test";
import { seedOptionScripForTests } from "./frontFutures.js";
import { nearestWeeklyExpiry, upcomingExpiries } from "./optionChain.js";
import {
  drainPendingLiveAlgoOrders,
  expiryForNiftyVwap,
  optionLegId,
  peekOptionChain,
  queueLiveAlgoOrder,
  replaceDhanBook,
  setOptionDesk,
} from "./market.js";

const WEEKLY = nearestWeeklyExpiry(upcomingExpiries("NIFTY", 12), "NIFTY");
const NOV3 = "2026-11-03";

const firstCandle = {
  name: "NIFTY",
  kind: "nifty-first-candle",
  expiryKind: "weekly",
};

function pinNov3Desk() {
  setOptionDesk({
    symbol: "NIFTY",
    expiry: NOV3,
    expiries: [NOV3, "2026-11-10", "2026-11-17"],
    rows: [
      { strike: 25000, callId: "nov3-ce-25000", putId: "nov3-pe-25000", callLtp: 120, putLtp: 110, atm: true },
    ],
    source: "dhan",
    expiryPinned: true,
  });
}

test("NIFTY nearest-expiry ATM uses this week's weekly, not the pinned 3 Nov desk", () => {
  pinNov3Desk();
  const expiry = expiryForNiftyVwap(firstCandle, peekOptionChain("NIFTY"));
  assert.equal(expiry, WEEKLY);
  if (WEEKLY < NOV3) assert.notEqual(expiry, NOV3);
});

test("NIFTY live admin order uses this week's contract, not the 3 Nov desk id", () => {
  pinNov3Desk();
  seedOptionScripForTests([
    { root: "NIFTY", expiry: WEEKLY, strike: 25000, option: "CE", securityId: "weekly-ce-25000" },
  ]);
  assert.equal(optionLegId(25000, "CE", "NIFTY", WEEKLY), "weekly-ce-25000");
  assert.notEqual(optionLegId(25000, "CE", "NIFTY", WEEKLY), "nov3-ce-25000");
  replaceDhanBook([]);
  drainPendingLiveAlgoOrders();
  const result = queueLiveAlgoOrder({
    strategy: "nifty-nearest-expiry-test",
    side: "BUY",
    symbol: "NIFTY 25000 CE",
    qty: 65,
    option: "CE",
    strike: 25000,
    expiry: WEEKLY,
    securityId: "nov3-ce-25000",
    kind: "option",
    brokerId: "dhan",
  });
  assert.equal(result.queued, true);
  const queued = drainPendingLiveAlgoOrders();
  const admin = queued.find((row) => !row.copyUserId);
  assert.ok(admin, "admin Dhan order must queue");
  assert.equal(admin.expiry, WEEKLY);
  assert.equal(admin.brokerId, "dhan");
  assert.equal(admin.securityId, "weekly-ce-25000");
});
