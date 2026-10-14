import assert from "node:assert/strict";
import test from "node:test";
import { adminLiveTape, headerBrokerLabel, memberTapeHasQuotes } from "../src/lib/headerBroker.ts";
import { brokerSelectLabel, canActivateBroker, uniqueBrokers } from "../src/lib/brokers.ts";
import fs from "node:fs";

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

test("member header chip is wait when index cards have no price", () => {
  assert.equal(memberTapeHasQuotes({ indices: [{ price: 0 }] }), false);
  assert.equal(headerBrokerLabel({ brokerId: "upstox", live: false, hasQuotes: memberTapeHasQuotes({ indices: [{ price: 0 }] }) }), "UPSTOX · wait");
  assert.equal(headerBrokerLabel({ brokerId: "upstox", live: false, hasQuotes: memberTapeHasQuotes({ indices: [{ price: 25111 }] }) }), "UPSTOX");
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

test("admin broker dropdown marks only the selected broker ACTIVE", () => {
  assert.equal(brokerSelectLabel({ name: "Dhan", active: true, liveFeed: true }), "Dhan · ACTIVE · ON");
  assert.equal(brokerSelectLabel({ name: "Upstox", active: false, connected: false }), "Upstox · INACTIVE");
  assert.equal(canActivateBroker({ id: "dhan" }), true);
  assert.equal(canActivateBroker({ id: "paper" }), true);
  assert.equal(canActivateBroker({ id: "upstox", connected: true }), true);
  assert.equal(canActivateBroker({ id: "upstox", connected: false, liveFeed: false }), false);
});

test("admin Brokers page keeps one broker list and drops a second copy", () => {
  const page = fs.readFileSync(new URL("../src/pages/Brokers.tsx", import.meta.url), "utf8");
  const header = fs.readFileSync(new URL("../src/components/layout/Header.tsx", import.meta.url), "utf8");
  assert.equal((page.match(/data-broker-list=/g) || []).length, 1);
  assert.equal(header.includes("BrokerSwitch"), false);
  assert.equal(header.includes("<select"), false);
  assert.match(header, /data-broker-active="header"/);
  const once = uniqueBrokers([
    { id: "dhan", name: "Dhan" },
    { id: "dhan", name: "Dhan copy" },
    { id: "upstox", name: "Upstox" },
    { id: "upstox", name: "Upstox again" },
  ]);
  assert.deepEqual(once.map((row) => row.id), ["dhan", "upstox"]);
});

test("admin live chip uses Kotak only when that tape owns quotes", () => {
  const tape = adminLiveTape({
    dhanFeed: { live: true, source: "kotak", hasQuotes: true, lastTickAt: 9 },
  });
  assert.equal(tape.brokerId, "kotak");
  assert.equal(headerBrokerLabel(tape), "KOTAK LIVE");
});
