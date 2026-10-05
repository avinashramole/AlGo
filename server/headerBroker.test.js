import assert from "node:assert/strict";
import test from "node:test";
import { adminLiveTape, headerBrokerLabel } from "../src/lib/headerBroker.ts";

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

test("admin live chip keeps Dhan when Kotak is only the order broker", () => {
  const tape = adminLiveTape({
    dhanFeed: { live: true, source: "websocket", hasQuotes: true, lastTickAt: 1_700_000_000_000 },
  });
  assert.equal(tape.brokerId, "dhan");
  assert.equal(tape.live, true);
  assert.equal(tape.lastTickAt, 1_700_000_000_000);
  assert.equal(headerBrokerLabel(tape), "DHAN LIVE");
});

test("admin live chip uses Kotak only when that tape owns quotes", () => {
  const tape = adminLiveTape({
    dhanFeed: { live: true, source: "kotak", hasQuotes: true, lastTickAt: 9 },
  });
  assert.equal(tape.brokerId, "kotak");
  assert.equal(headerBrokerLabel(tape), "KOTAK LIVE");
});
