import assert from "node:assert/strict";
import test from "node:test";
import { headerBrokerLabel } from "../src/lib/headerBroker.ts";

test("admin header uses the selected broker, not a hard-coded Dhan label", () => {
  assert.equal(headerBrokerLabel({ brokerId: "dhan", live: true, hasQuotes: true }), "DHAN LIVE");
  assert.equal(headerBrokerLabel({ brokerId: "dhan", live: false, hasQuotes: true }), "DHAN");
  assert.equal(
    headerBrokerLabel({ brokerId: "upstox", brokerName: "Upstox", live: true, hasQuotes: true }),
    "UPSTOX LIVE",
  );
  assert.equal(headerBrokerLabel({ brokerId: "upstox", live: false, hasQuotes: false }), "UPSTOX · wait");
  assert.equal(headerBrokerLabel({ brokerId: "paper" }), "PAPER");
});

test("member header chip follows the member selected broker", () => {
  assert.equal(
    headerBrokerLabel({ brokerId: "upstox", brokerName: "UPSTOX", live: false, hasQuotes: true }),
    "UPSTOX",
  );
  assert.equal(headerBrokerLabel({ brokerId: "zerodha", live: true }), "ZERODHA LIVE");
});
