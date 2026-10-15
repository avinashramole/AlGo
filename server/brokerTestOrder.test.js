import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "path";
import test from "node:test";
import { nearestWeeklyExpiry, upcomingExpiries } from "./optionChain.js";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "t2s-broker-test-order-"));
process.env.T2S_ALGOS_FILE = path.join(dir, "algos.json");

const {
  createAlgo,
  deleteAlgo,
  drainPendingLiveAlgoOrders,
  placeStrategyBrokerTestOrder,
  setDhanFeed,
  setOptionDesk,
  strategyTradingStatus,
  toggleAlgo,
} = await import("./market.js");

const EXPIRY = nearestWeeklyExpiry(upcomingExpiries("NIFTY", 12), "NIFTY");

function pinAtmChain() {
  setOptionDesk({
    symbol: "NIFTY",
    expiry: EXPIRY,
    expiries: [EXPIRY],
    spot: 25000,
    source: "dhan",
    rows: [
      {
        strike: 25000,
        atm: true,
        callLtp: 120,
        putLtp: 110,
        callId: "ce-25000",
        putId: "pe-25000",
        lotSize: 65,
      },
    ],
  });
}

test("strategyTradingStatus is LIVE only when enabled and runMode is live", () => {
  setDhanFeed({ live: true });
  const created = createAlgo({
    kind: "shivam-t2s",
    testDesk: true,
    runMode: "live",
    liveAuthorized: true,
    brokerId: "dhan",
  });
  try {
    const paused = strategyTradingStatus(created.id);
    assert.equal(paused.live, false);
    assert.equal(paused.stopped, true);
    assert.equal(paused.status, "STOPPED");
    const started = toggleAlgo(created.id, { enabled: true });
    assert.equal(started.status, "LIVE");
    const live = strategyTradingStatus(created.id);
    assert.equal(live.live, true);
    assert.equal(live.paper, false);
    assert.equal(live.stopped, false);
    assert.equal(live.status, "LIVE");
    assert.equal(live.brokerReady, true);
    const paper = toggleAlgo(created.id, { enabled: false });
    assert.equal(paper.enabled, false);
    assert.equal(strategyTradingStatus(created.id).status, "STOPPED");
  } finally {
    deleteAlgo(created.id);
    setDhanFeed({ live: false });
  }
});

test("Test 1 order queues 1 ATM lot to Dhan and skips member copy", () => {
  setDhanFeed({ live: true });
  pinAtmChain();
  drainPendingLiveAlgoOrders();
  const created = createAlgo({
    kind: "shivam-t2s",
    testDesk: true,
    runMode: "live",
    liveAuthorized: true,
    brokerId: "dhan",
    mappingScope: "both",
    mappedClientIds: ["u-keep"],
  });
  try {
    const preview = placeStrategyBrokerTestOrder(created.id, { confirm: false });
    assert.equal(preview.ok, false);
    assert.match(String(preview.error), /Confirm Test 1 order/);
    assert.equal(drainPendingLiveAlgoOrders().length, 0);
    assert.equal(preview.contract?.lots, 1);
    assert.equal(preview.contract?.qty, 65);
    assert.equal(preview.contract?.option, "CE");
    assert.equal(preview.contract?.strike, 25000);
    assert.equal(preview.contract?.securityId, "ce-25000");
    assert.equal(preview.skipMemberCopy, true);

    const started = toggleAlgo(created.id, { enabled: true });
    assert.equal(started.status, "LIVE");
    const sent = placeStrategyBrokerTestOrder(created.id, { confirm: true });
    assert.equal(sent.ok, true);
    assert.equal(sent.queued, true);
    assert.equal(sent.live, true);
    assert.equal(sent.lots, 1);
    assert.equal(sent.skipMemberCopy, true);
    const queued = drainPendingLiveAlgoOrders();
    assert.equal(queued.length, 1);
    assert.ok(!queued[0].copyUserId);
    assert.equal(queued[0].role, "broker-test");
    assert.equal(queued[0].brokerId, "dhan");
    assert.equal(queued[0].qty, 65);
    assert.equal(queued[0].lots, 1);
    assert.equal(queued[0].option, "CE");
    assert.equal(queued[0].securityId, "ce-25000");
    assert.equal(queued[0].skipMemberCopy, true);
    assert.notEqual(queued[0].brokerId, "paper");
    assert.notEqual(queued[0].paper, true);
  } finally {
    deleteAlgo(created.id);
    drainPendingLiveAlgoOrders();
    setDhanFeed({ live: false });
  }
});

test("Test 1 order still hits Dhan when Shivam is stopped, and refuses when the feed is down", () => {
  pinAtmChain();
  drainPendingLiveAlgoOrders();
  const created = createAlgo({
    kind: "shivam-t2s",
    testDesk: true,
    runMode: "paper",
    liveAuthorized: true,
    brokerId: "paper",
  });
  try {
    setDhanFeed({ live: false });
    const down = placeStrategyBrokerTestOrder(created.id, { confirm: true });
    assert.equal(down.ok, false);
    assert.match(String(down.error), /LIVE/);
    assert.equal(drainPendingLiveAlgoOrders().length, 0);

    setDhanFeed({ live: true });
    const sent = placeStrategyBrokerTestOrder(created.id, { confirm: true });
    assert.equal(sent.ok, true);
    assert.equal(sent.status, "STOPPED");
    assert.equal(sent.live, false);
    assert.equal(sent.queued, true);
    assert.equal(sent.sentLive, true);
    const queued = drainPendingLiveAlgoOrders();
    assert.equal(queued.length, 1);
    assert.equal(queued[0].brokerId, "dhan");
    assert.equal(queued[0].qty, 65);
    assert.equal(queued[0].role, "broker-test");
  } finally {
    deleteAlgo(created.id);
    drainPendingLiveAlgoOrders();
    setDhanFeed({ live: false });
  }
});

test("Algo Test paper cards cannot send a live broker test order", () => {
  setDhanFeed({ live: true });
  pinAtmChain();
  const created = createAlgo({
    name: `Paper Test ${Date.now()}`,
    kind: "nifty-first-candle",
    testDesk: true,
    runMode: "paper",
  });
  try {
    const sent = placeStrategyBrokerTestOrder(created.id, { confirm: true });
    assert.equal(sent.ok, false);
    assert.match(String(sent.error), /paper cards cannot send/);
    assert.equal(drainPendingLiveAlgoOrders().length, 0);
  } finally {
    deleteAlgo(created.id);
    setDhanFeed({ live: false });
  }
});
