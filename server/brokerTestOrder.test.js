import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "path";
import test from "node:test";
import { nearestWeeklyExpiry, upcomingExpiries } from "./optionChain.js";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "t2s-broker-test-order-"));
process.env.T2S_ALGOS_FILE = path.join(dir, "algos.json");
process.env.T2S_MEMBER_DESK_FILE = path.join(dir, "member-desk.json");
process.env.T2S_USERS_FILE = path.join(dir, "users.json");

const {
  createAlgo,
  deleteAlgo,
  drainPendingLiveAlgoOrders,
  placeStrategyBrokerTestOrder,
  queueLiveAlgoOrder,
  replaceDhanBook,
  setDhanFeed,
  setOptionDesk,
  strategyTradingStatus,
  toggleAlgo,
} = await import("./market.js");
const { installMemberBroker, saveClientSettings, selectMemberBroker } = await import("./memberDesk.js");

const EXPIRY = nearestWeeklyExpiry(upcomingExpiries("NIFTY", 12), "NIFTY");

function liveMappedUser(id = "u-copy") {
  const user = { id, name: "Copy", email: `${id}@t2s.app`, role: "user" };
  selectMemberBroker({ user, brokerId: "dhan" });
  installMemberBroker({ user, brokerId: "dhan", clientId: "11008899", accessToken: "member-dhan-token" });
  saveClientSettings(user.id, { copy: true });
  return user;
}

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

test("Test 1 order queues 1 ATM lot to Dhan and copies mapped clients", () => {
  setDhanFeed({ live: true });
  pinAtmChain();
  drainPendingLiveAlgoOrders();
  const user = liveMappedUser("u-keep");
  const created = createAlgo({
    kind: "shivam-t2s",
    testDesk: true,
    runMode: "live",
    liveAuthorized: true,
    brokerId: "dhan",
    mappingScope: "both",
    mappedClientIds: [user.id],
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
    assert.equal(preview.skipMemberCopy, false);

    const started = toggleAlgo(created.id, { enabled: true });
    assert.equal(started.status, "LIVE");
    const sent = placeStrategyBrokerTestOrder(created.id, { confirm: true });
    assert.equal(sent.ok, true);
    assert.equal(sent.queued, true);
    assert.equal(sent.live, true);
    assert.equal(sent.lots, 1);
    assert.equal(sent.skipMemberCopy, false);
    const queued = drainPendingLiveAlgoOrders();
    assert.equal(queued.length, 2);
    const admin = queued.find((row) => !row.copyUserId);
    const copy = queued.find((row) => row.copyUserId === user.id);
    assert.ok(admin);
    assert.ok(copy);
    assert.equal(admin.role, "broker-test");
    assert.equal(admin.brokerId, "dhan");
    assert.equal(admin.qty, 65);
    assert.equal(admin.lots, 1);
    assert.equal(admin.option, "CE");
    assert.equal(admin.securityId, "ce-25000");
    assert.notEqual(admin.brokerId, "paper");
    assert.notEqual(admin.paper, true);
    assert.equal(copy.role, "broker-test");
    assert.equal(copy.brokerId, "dhan");
    assert.equal(copy.qty, 65);
    assert.equal(copy.lots, 1);
    assert.equal(copy.account?.accessToken, "member-dhan-token");
    assert.notEqual(copy.paper, true);
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

function tickStyleShivamEntry(algo, extra = {}) {
  return queueLiveAlgoOrder({
    strategy: extra.strategy || algo.name,
    strategyId: extra.strategyId === undefined ? algo.id : extra.strategyId,
    kind: extra.kind || "shivam-t2s",
    testDesk: true,
    paper: false,
    brokerId: "dhan",
    side: "BUY",
    symbol: "NIFTY 25000 CE",
    qty: 65,
    lots: 1,
    lotSize: 65,
    option: "CE",
    strike: 25000,
    securityId: "ce-25000",
    product: "MIS",
    type: "MARKET",
    role: "shivam-entry",
    ...extra.payload,
  });
}

test("Shivam live tick queues admin Dhan and mapped user copy without forceLiveBroker", () => {
  setDhanFeed({ live: true });
  pinAtmChain();
  drainPendingLiveAlgoOrders();
  const user = liveMappedUser("u-tick");
  const created = createAlgo({
    kind: "shivam-t2s",
    testDesk: true,
    runMode: "live",
    liveAuthorized: true,
    brokerId: "dhan",
    mappingScope: "both",
    mappedClientIds: [user.id],
  });
  try {
    const started = toggleAlgo(created.id, { enabled: true });
    assert.equal(started.status, "LIVE");
    const sent = tickStyleShivamEntry(created);
    assert.equal(sent.queued, true);
    assert.notEqual(sent.status, "FEED_DOWN");
    const queued = drainPendingLiveAlgoOrders();
    const admin = queued.find((row) => !row.copyUserId);
    const copy = queued.find((row) => row.copyUserId === user.id);
    assert.ok(admin, "admin Dhan order missing");
    assert.ok(copy, "mapped user copy missing");
    assert.equal(admin.brokerId, "dhan");
    assert.notEqual(admin.paper, true);
    assert.equal(admin.qty, 65);
    assert.equal(copy.brokerId, "dhan");
    assert.equal(copy.qty, 65);
    assert.equal(copy.account?.accessToken, "member-dhan-token");
    assert.notEqual(copy.paper, true);
  } finally {
    deleteAlgo(created.id);
    drainPendingLiveAlgoOrders();
    setDhanFeed({ live: false });
  }
});

test("Shivam alias Shivam T2S still queues admin Dhan and mapped user copy", () => {
  setDhanFeed({ live: true });
  pinAtmChain();
  drainPendingLiveAlgoOrders();
  const user = liveMappedUser("u-alias");
  const created = createAlgo({
    kind: "shivam-t2s",
    testDesk: true,
    runMode: "live",
    liveAuthorized: true,
    brokerId: "dhan",
    mappingScope: "both",
    mappedClientIds: [user.id],
  });
  try {
    toggleAlgo(created.id, { enabled: true });
    const sent = tickStyleShivamEntry(created, { strategy: "Shivam T2S", strategyId: "" });
    assert.equal(sent.queued, true);
    const queued = drainPendingLiveAlgoOrders();
    const admin = queued.find((row) => !row.copyUserId);
    const copy = queued.find((row) => row.copyUserId === user.id);
    assert.ok(admin, "admin Dhan order missing for alias");
    assert.ok(copy, "mapped user copy missing for alias");
    assert.equal(admin.brokerId, "dhan");
    assert.notEqual(admin.paper, true);
    assert.equal(copy.brokerId, "dhan");
    assert.equal(copy.account?.accessToken, "member-dhan-token");
  } finally {
    deleteAlgo(created.id);
    drainPendingLiveAlgoOrders();
    setDhanFeed({ live: false });
  }
});

test("Shivam mapped clients receive the user-broker copy when admin entry queues", () => {
  setDhanFeed({ live: true });
  pinAtmChain();
  drainPendingLiveAlgoOrders();
  const user = liveMappedUser("u-shivam-map");
  const created = createAlgo({
    kind: "shivam-t2s",
    testDesk: true,
    runMode: "live",
    liveAuthorized: true,
    brokerId: "dhan",
    mappingScope: "both",
    mappedClientIds: [user.id],
  });
  try {
    toggleAlgo(created.id, { enabled: true });
    const sent = tickStyleShivamEntry(created);
    assert.equal(sent.queued, true);
    const queued = drainPendingLiveAlgoOrders();
    const admin = queued.find((row) => !row.copyUserId);
    const copy = queued.find((row) => row.copyUserId === user.id);
    assert.ok(admin);
    assert.ok(copy);
    assert.equal(admin.brokerId, "dhan");
    assert.equal(copy.brokerId, "dhan");
    assert.equal(copy.account?.accessToken, "member-dhan-token");
    assert.equal(copy.account?.clientId, "11008899");
    assert.notEqual(copy.paper, true);
  } finally {
    deleteAlgo(created.id);
    drainPendingLiveAlgoOrders();
    setDhanFeed({ live: false });
  }
});

test("clients-only mapping skips the admin broker and sends the user copy", () => {
  setDhanFeed({ live: true });
  pinAtmChain();
  drainPendingLiveAlgoOrders();
  const user = liveMappedUser("u-clients-only");
  const created = createAlgo({
    kind: "shivam-t2s",
    testDesk: true,
    runMode: "live",
    liveAuthorized: true,
    brokerId: "dhan",
    mappingScope: "clients",
    mappedClientIds: [user.id],
  });
  try {
    toggleAlgo(created.id, { enabled: true });
    const sent = tickStyleShivamEntry(created);
    assert.equal(sent.queued, true);
    assert.equal(sent.skippedAdmin, true);
    assert.equal(sent.status, "COPIED");
    const queued = drainPendingLiveAlgoOrders();
    assert.equal(queued.some((row) => !row.copyUserId), false);
    const copy = queued.find((row) => row.copyUserId === user.id);
    assert.ok(copy, "mapped user copy missing");
    assert.equal(copy.brokerId, "dhan");
    assert.equal(copy.account?.accessToken, "member-dhan-token");
    assert.notEqual(copy.paper, true);
  } finally {
    deleteAlgo(created.id);
    drainPendingLiveAlgoOrders();
    setDhanFeed({ live: false });
  }
});

test("master-only mapping sends admin Dhan and no user copy", () => {
  setDhanFeed({ live: true });
  pinAtmChain();
  drainPendingLiveAlgoOrders();
  const user = liveMappedUser("u-master-only");
  const created = createAlgo({
    kind: "shivam-t2s",
    testDesk: true,
    runMode: "live",
    liveAuthorized: true,
    brokerId: "dhan",
    mappingScope: "master",
    mappedClientIds: [user.id],
  });
  try {
    toggleAlgo(created.id, { enabled: true });
    const sent = tickStyleShivamEntry(created);
    assert.equal(sent.queued, true);
    const queued = drainPendingLiveAlgoOrders();
    const admin = queued.find((row) => !row.copyUserId);
    assert.ok(admin);
    assert.equal(admin.brokerId, "dhan");
    assert.equal(queued.some((row) => row.copyUserId === user.id), false);
  } finally {
    deleteAlgo(created.id);
    drainPendingLiveAlgoOrders();
    setDhanFeed({ live: false });
  }
});

test("clients-only still copies when admin already has a leftover lot on this strategy", () => {
  setDhanFeed({ live: true });
  pinAtmChain();
  drainPendingLiveAlgoOrders();
  const user = liveMappedUser("u-clients-leftover");
  const created = createAlgo({
    kind: "shivam-t2s",
    testDesk: true,
    runMode: "live",
    liveAuthorized: true,
    brokerId: "dhan",
    mappingScope: "clients",
    mappedClientIds: [user.id],
  });
  try {
    toggleAlgo(created.id, { enabled: true });
    replaceDhanBook([
      {
        id: "dhan-pos-admin-leftover",
        symbol: "NIFTY 25000 CE",
        type: "BUY",
        qty: 65,
        avg: 110,
        ltp: 112,
        strategy: created.name,
        brokerId: "dhan",
        option: "CE",
        strike: 25000,
        live: true,
      },
    ]);
    const sent = tickStyleShivamEntry(created);
    assert.equal(sent.queued, true);
    assert.equal(sent.skippedAdmin, true);
    const queued = drainPendingLiveAlgoOrders();
    assert.equal(queued.some((row) => !row.copyUserId), false);
    assert.equal(queued.some((row) => row.copyUserId === user.id), true);
    replaceDhanBook([]);
  } finally {
    deleteAlgo(created.id);
    drainPendingLiveAlgoOrders();
    setDhanFeed({ live: false });
  }
});

test("clients-only does not send a second user BUY while that user lot is open", () => {
  setDhanFeed({ live: true });
  pinAtmChain();
  drainPendingLiveAlgoOrders();
  const user = liveMappedUser("u-clients-open");
  const created = createAlgo({
    kind: "shivam-t2s",
    testDesk: true,
    runMode: "live",
    liveAuthorized: true,
    brokerId: "dhan",
    mappingScope: "clients",
    mappedClientIds: [user.id],
  });
  try {
    toggleAlgo(created.id, { enabled: true });
    replaceDhanBook([
      {
        id: "copy-pos-user-open",
        symbol: "NIFTY 25000 CE",
        type: "BUY",
        qty: 65,
        avg: 110,
        ltp: 112,
        strategy: created.name,
        brokerId: "dhan",
        option: "CE",
        strike: 25000,
        live: true,
        copyUserId: user.id,
      },
    ]);
    tickStyleShivamEntry(created);
    const queued = drainPendingLiveAlgoOrders();
    assert.equal(queued.some((row) => row.copyUserId === user.id && row.side === "BUY"), false);
    replaceDhanBook([]);
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
