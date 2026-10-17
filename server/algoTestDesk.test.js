import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { findLiveCopyAlgo, memberCopyPayloads } from "./liveCopy.js";
import { applyFirstCandleDailyLive } from "./niftyVwapHedge/dailyLive.js";
import { isTestDeskAlgo, normalizeAlgo } from "./strategies.js";
import { strategyVisibleToMember } from "./subscriptions.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "t2s-algo-test-desk-"));
process.env.T2S_ALGOS_FILE = path.join(dir, "algos.json");
process.env.T2S_MEMBER_DESK_FILE = path.join(dir, "member-desk.json");
process.env.T2S_PAYMENTS_FILE = path.join(dir, "payments.json");
process.env.T2S_ENROLL_FILE = path.join(dir, "enrollments.json");

const {
  assignAlgoBroker,
  createAlgo,
  deleteAlgo,
  drainPendingLiveAlgoOrders,
  queueLiveAlgoOrder,
  replaceDhanBook,
  setDhanFeed,
  toggleAlgo,
  updateAlgo,
} = await import("./market.js");
const { installMemberBroker, saveClientSettings, selectMemberBroker } = await import("./memberDesk.js");

const FRI_0900 = Date.parse("2026-08-21T03:30:00.000Z");

function liveMappedUser(id = "u-algo-test") {
  const user = { id, name: "Copy", email: `${id}@t2s.app`, role: "user" };
  selectMemberBroker({ user, brokerId: "dhan" });
  installMemberBroker({ user, brokerId: "dhan", clientId: "11008899", accessToken: "member-dhan-token" });
  saveClientSettings(user.id, { copy: true });
  return user;
}

test("Algo Test page, admin menu, and live+copy builder are wired", () => {
  const app = fs.readFileSync(path.join(root, "src/App.tsx"), "utf8");
  const roles = fs.readFileSync(path.join(root, "src/lib/roles.ts"), "utf8");
  const sidebar = fs.readFileSync(path.join(root, "src/components/layout/Sidebar.tsx"), "utf8");
  const mobile = fs.readFileSync(path.join(root, "src/components/layout/MobileNav.tsx"), "utf8");
  const algo = fs.readFileSync(path.join(root, "src/pages/Algo.tsx"), "utf8");
  const builder = fs.readFileSync(path.join(root, "src/components/dashboard/StrategyBuilder.tsx"), "utf8");
  assert.match(app, /path="algo-test"/);
  assert.match(app, /AlgoTest/);
  assert.match(roles, /to: "\/algo-test", label: "Algo Test"/);
  assert.match(sidebar, /to: "\/algo-test", label: "Algo Test"/);
  assert.match(mobile, /to: "\/algo-test", label: "Test"/);
  assert.match(algo, /export function AlgoTest/);
  assert.match(algo, /desk = "live"/);
  assert.match(algo, /data-algo-desk/);
  assert.match(algo, /data-algo-test-tab/);
  assert.match(algo, /navigate\("\/algo-test"\)/);
  assert.doesNotMatch(algo, /Paper test only · no live · no copy/);
  assert.doesNotMatch(algo, /isolated && !shivam/);
  assert.match(algo, /data-shivam-map="true"/);
  assert.match(algo, /data-start-live="true"/);
  assert.match(algo, /Selected clients only/);
  assert.match(algo, /Live orders go to enrolled mapped clients on their own brokers/);
  assert.match(algo, /Latest activity/);
  assert.match(algo, /data-latest-activity="true"/);
  assert.match(algo, /data-shivam-activity/);
  assert.match(algo, /data-test-broker-order="true"/);
  assert.match(algo, /data-shivam-live-check/);
  assert.match(algo, /algo.enabled && algo.runMode === "live"/);
  assert.match(algo, /Live Dhan · admin \+ mapped brokers/);
  assert.match(builder, /Live entries go to the admin broker and mapped user brokers/);
  assert.match(builder, /liveAuthorized: true/);
  assert.match(builder, /testDesk = false/);
  assert.match(builder, /RUN_MODES\.map/);
  assert.doesNotMatch(builder, /RUN_MODES.filter\(\(mode\) => mode.id !== "live"\)/);
  assert.doesNotMatch(builder, /Paper-only test desk/);
  assert.match(builder, /testDesk: true/);
  assert.match(builder, /title="SHIVAM T2S"/);
  assert.doesNotMatch(builder, /Algo Test copy of NIFTY 5m first candle/);
  assert.match(algo, /isNiftyFirstCandleKind\(row\) && \(testDesk \|\| row\.testDesk\)/);
  assert.match(algo, /item\.id === "a16"/);
  assert.match(builder, /data-shivam-capital="true"/);
  assert.match(algo, /Capital management/);
  assert.doesNotMatch(algo, /1–100 filled BUY entries today/);
  assert.doesNotMatch(algo, /Re-entries count\. Rejected orders do not/);
});

test("normalizeAlgo keeps Algo Test live plus mapped clients on the test desk", () => {
  const created = normalizeAlgo({
    name: "NIFTY",
    kind: "nifty-first-candle",
    testDesk: true,
    runMode: "live",
    brokerId: "dhan",
    mappingScope: "both",
    mappedClientIds: ["u-1"],
    clientVisible: true,
  });
  assert.equal(created.testDesk, true);
  assert.equal(created.runMode, "live");
  assert.equal(created.brokerId, "dhan");
  assert.equal(created.mappingScope, "both");
  assert.deepEqual(created.mappedClientIds, ["u-1"]);
  assert.equal(created.clientVisible, true);
  assert.equal(isTestDeskAlgo(created), true);

  const kept = normalizeAlgo({ runMode: "live", brokerId: "dhan", testDesk: false, clientVisible: true }, created);
  assert.equal(kept.testDesk, true);
  assert.equal(kept.runMode, "live");
  assert.equal(kept.brokerId, "dhan");
  assert.equal(kept.clientVisible, true);
});

test("main-desk strategies stay off the test desk flag", () => {
  const created = normalizeAlgo({ name: "NIFTY", kind: "nifty-first-candle", runMode: "live" });
  assert.equal(created.testDesk, false);
  assert.equal(created.runMode, "live");
});

test("Shivam T2S live on Algo Test keeps mapped clients", () => {
  const locked = normalizeAlgo({
    name: "Shivam T2S Strategy",
    kind: "shivam-t2s",
    runMode: "live",
    brokerId: "dhan",
  });
  assert.equal(locked.testDesk, true);
  assert.equal(locked.runMode, "paper");
  assert.equal(locked.liveAuthorized, false);

  const created = normalizeAlgo({
    name: "Shivam T2S Strategy",
    kind: "shivam-t2s",
    runMode: "live",
    liveAuthorized: true,
    brokerId: "dhan",
    mappingScope: "both",
    mappedClientIds: ["u-1"],
    clientVisible: true,
  });
  assert.equal(created.testDesk, true);
  assert.equal(created.runMode, "live");
  assert.equal(created.brokerId, "dhan");
  assert.equal(created.liveAuthorized, true);
  assert.equal(created.mappingScope, "both");
  assert.deepEqual(created.mappedClientIds, ["u-1"]);
  assert.equal(created.clientVisible, true);
  assert.equal(isTestDeskAlgo(created), true);
});

test("findLiveCopyAlgo prefers the main-desk card but Algo Test still copies mapped clients", () => {
  const live = { id: "live-n", name: "NIFTY", enabled: true, mappingScope: "both", mappedClientIds: ["u-1"] };
  const testAlgo = {
    id: "test-n",
    name: "NIFTY",
    testDesk: true,
    enabled: true,
    runMode: "live",
    mappingScope: "both",
    mappedClientIds: ["u-1"],
  };
  const found = findLiveCopyAlgo([testAlgo, live], "NIFTY");
  assert.equal(found.id, "live-n");
  assert.equal(findLiveCopyAlgo([testAlgo], "NIFTY").id, "test-n");
  const copies = memberCopyPayloads({ strategy: "NIFTY", qty: 65, lotSize: 65 }, testAlgo);
  assert.equal(copies.length, 1);
  assert.equal(copies[0].copyUserId, "u-1");
  assert.deepEqual(memberCopyPayloads({ strategy: "NIFTY", qty: 65 }, { ...testAlgo, runMode: "paper" }), []);
});

test("findLiveCopyAlgo finds Shivam T2S on Algo Test and mapping still gates copies", () => {
  const shivam = {
    id: "shivam-1",
    name: "Shivam T2S Strategy",
    kind: "shivam-t2s",
    testDesk: true,
    enabled: true,
    mappingScope: "clients",
    mappedClientIds: ["u-1"],
  };
  assert.equal(findLiveCopyAlgo([shivam], "Shivam T2S Strategy").id, "shivam-1");
  assert.equal(findLiveCopyAlgo([shivam], "Shivam T2S").id, "shivam-1");
  assert.equal(findLiveCopyAlgo([shivam], "SHIVAM T2S").id, "shivam-1");
  assert.deepEqual(
    memberCopyPayloads({ strategy: "Shivam T2S Strategy", qty: 65 }, { ...shivam, mappingScope: "master" }),
    [],
  );
  const copies = memberCopyPayloads({ strategy: "Shivam T2S", qty: 65, lotSize: 65 }, shivam);
  assert.equal(copies.length, 1);
  assert.equal(copies[0].copyUserId, "u-1");
});

test("members mapped to Shivam T2S can see it", () => {
  assert.equal(
    strategyVisibleToMember(
      {
        id: "a16",
        name: "Shivam T2S Strategy",
        kind: "shivam-t2s",
        testDesk: true,
        clientVisible: true,
        mappingScope: "clients",
        mappedClientIds: ["u-1"],
      },
      { userId: "u-1", role: "user" },
    ),
    true,
  );
  assert.equal(
    strategyVisibleToMember(
      {
        id: "a16",
        name: "Shivam T2S Strategy",
        kind: "shivam-t2s",
        testDesk: true,
        clientVisible: true,
        mappingScope: "clients",
        mappedClientIds: ["u-1"],
      },
      { userId: "u-other", role: "user" },
    ),
    false,
  );
});

test("members see mapped visible Algo Test strategies", () => {
  assert.equal(
    strategyVisibleToMember(
      { id: "t1", name: "NIFTY", testDesk: true, clientVisible: true, mappingScope: "both", mappedClientIds: ["u-1"] },
      { userId: "u-1", role: "user" },
    ),
    true,
  );
  assert.equal(
    strategyVisibleToMember(
      { id: "t1", name: "NIFTY", testDesk: true, clientVisible: true, mappingScope: "both", mappedClientIds: ["u-1"] },
      { userId: "u-other", role: "user" },
    ),
    false,
  );
  assert.equal(
    strategyVisibleToMember(
      { id: "t1", name: "NIFTY", testDesk: true, clientVisible: false, mappingScope: "both", mappedClientIds: ["u-1"] },
      { userId: "u-1", role: "user" },
    ),
    false,
  );
});

test("daily LIVE 09:00 does not arm an Algo Test first-candle card", () => {
  const algos = [
    normalizeAlgo(
      {
        name: "NIFTY",
        kind: "nifty-first-candle",
        testDesk: true,
        runMode: "live",
      },
      { id: "test-fc", enabled: false, status: "PAUSED" },
    ),
  ];
  const result = applyFirstCandleDailyLive(algos, { now: FRI_0900, feedLive: true });
  assert.equal(result.armedIds.includes("test-fc"), false);
  assert.equal(result.algos[0].enabled, false);
  assert.equal(result.algos[0].runMode, "live");
  assert.equal(result.algos[0].testDesk, true);
});

test("create/update/toggle allow non-Shivam Algo Test live Dhan with mapped clients", () => {
  setDhanFeed({ live: true });
  const created = createAlgo({
    name: `Algo Test ${Date.now()}`,
    kind: "nifty-first-candle",
    testDesk: true,
    runMode: "live",
    brokerId: "dhan",
    mappingScope: "clients",
    mappedClientIds: ["u-keep"],
    clientVisible: true,
  });
  try {
    assert.equal(created.testDesk, true);
    assert.equal(created.runMode, "live");
    assert.equal(created.brokerId, "dhan");
    assert.equal(created.mappingScope, "clients");
    assert.deepEqual(created.mappedClientIds, ["u-keep"]);
    assert.equal(created.clientVisible, true);
    const live = updateAlgo(created.id, { runMode: "live", enabled: true, brokerId: "dhan" });
    assert.equal(live.error, undefined);
    assert.equal(live.testDesk, true);
    assert.equal(live.runMode, "live");
    assert.equal(live.brokerId, "dhan");
    assert.equal(live.status, "LIVE");
    const routed = assignAlgoBroker(created.id, "dhan");
    assert.equal(routed.brokerId, "dhan");
    const started = toggleAlgo(created.id, { enabled: true });
    assert.equal(started.runMode, "live");
    assert.equal(started.brokerId, "dhan");
    assert.equal(started.status, "LIVE");
  } finally {
    deleteAlgo(created.id);
    setDhanFeed({ live: false });
  }
});

test("create/update/toggle allow Shivam T2S live Dhan on Algo Test with mapped clients", () => {
  setDhanFeed({ live: true });
  const created = createAlgo({
    kind: "shivam-t2s",
    testDesk: true,
    runMode: "live",
    liveAuthorized: true,
    brokerId: "dhan",
    mappingScope: "clients",
    mappedClientIds: ["u-keep"],
    clientVisible: true,
  });
  try {
    assert.equal(created.testDesk, true);
    assert.equal(created.runMode, "live");
    assert.equal(created.brokerId, "dhan");
    assert.equal(created.liveAuthorized, true);
    assert.equal(created.mappingScope, "clients");
    assert.deepEqual(created.mappedClientIds, ["u-keep"]);
    assert.equal(created.clientVisible, true);
    const live = updateAlgo(created.id, { runMode: "live", enabled: true, brokerId: "dhan", liveAuthorized: true });
    assert.equal(live.error, undefined);
    assert.equal(live.testDesk, true);
    assert.equal(live.runMode, "live");
    assert.equal(live.brokerId, "dhan");
    assert.equal(live.status, "LIVE");
    const routed = assignAlgoBroker(created.id, "dhan");
    assert.equal(routed.brokerId, "dhan");
    const started = toggleAlgo(created.id, { enabled: true });
    assert.equal(started.runMode, "live");
    assert.equal(started.brokerId, "dhan");
    assert.equal(started.liveAuthorized, true);
    assert.equal(started.status, "LIVE");
  } finally {
    deleteAlgo(created.id);
    setDhanFeed({ live: false });
  }
});

test("Algo Test paper strategy does not fire a second trade while its lot is open", () => {
  const created = createAlgo({
    name: `Algo Test paper ${Date.now()}`,
    kind: "nifty-first-candle",
    testDesk: true,
    runMode: "paper",
  });
  const other = createAlgo({
    name: `Algo Test paper other ${Date.now()}`,
    kind: "nifty-first-candle",
    testDesk: true,
    runMode: "paper",
  });
  try {
    replaceDhanBook([
      {
        id: "paper-pos-test-desk",
        symbol: "NIFTY 23100 CE",
        type: "BUY",
        qty: 65,
        avg: 100,
        ltp: 110,
        strategy: created.name,
        brokerId: "paper",
        paper: true,
        testDesk: true,
        option: "CE",
        strike: 23100,
      },
    ]);
    drainPendingLiveAlgoOrders();
    const blocked = queueLiveAlgoOrder({
      strategy: created.name,
      strategyId: created.id,
      testDesk: true,
      paper: true,
      side: "BUY",
      symbol: "NIFTY 23200 CE",
      qty: 65,
      option: "CE",
      strike: 23200,
      kind: "option",
      brokerId: "paper",
    });
    assert.equal(blocked.queued, false);
    assert.equal(blocked.duplicate, true);
    const otherQueued = queueLiveAlgoOrder({
      strategy: other.name,
      strategyId: other.id,
      testDesk: true,
      paper: true,
      side: "BUY",
      symbol: "NIFTY 23300 CE",
      qty: 65,
      option: "CE",
      strike: 23300,
      kind: "option",
      brokerId: "paper",
    });
    assert.equal(otherQueued.queued, true);
  } finally {
    replaceDhanBook([]);
    drainPendingLiveAlgoOrders();
    deleteAlgo(created.id);
    deleteAlgo(other.id);
  }
});

test("Algo Test live first-candle queues admin Dhan and mapped user copy", () => {
  setDhanFeed({ live: true });
  drainPendingLiveAlgoOrders();
  const user = liveMappedUser("u-test-live");
  const created = createAlgo({
    name: `Algo Test live ${Date.now()}`,
    kind: "nifty-first-candle",
    testDesk: true,
    runMode: "live",
    brokerId: "dhan",
    mappingScope: "both",
    mappedClientIds: [user.id],
    clientVisible: true,
  });
  try {
    const started = toggleAlgo(created.id, { enabled: true });
    assert.equal(started.status, "LIVE");
    const sent = queueLiveAlgoOrder({
      strategy: created.name,
      strategyId: created.id,
      kind: "nifty-first-candle",
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
    });
    assert.equal(sent.queued, true);
    assert.notEqual(sent.status, "FEED_DOWN");
    const queued = drainPendingLiveAlgoOrders();
    const admin = queued.find((row) => !row.copyUserId && row.strategy === created.name);
    const copy = queued.find((row) => row.copyUserId === user.id);
    assert.ok(admin);
    assert.ok(copy);
    assert.equal(admin.brokerId, "dhan");
    assert.notEqual(admin.paper, true);
    assert.equal(admin.testDesk, true);
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

test("Algo Test clients-only skips the admin broker and still copies the mapped user", () => {
  setDhanFeed({ live: true });
  drainPendingLiveAlgoOrders();
  const user = liveMappedUser("u-test-clients");
  const created = createAlgo({
    name: `Algo Test clients ${Date.now()}`,
    kind: "nifty-first-candle",
    testDesk: true,
    runMode: "live",
    brokerId: "dhan",
    mappingScope: "clients",
    mappedClientIds: [user.id],
    clientVisible: true,
  });
  try {
    toggleAlgo(created.id, { enabled: true });
    const sent = queueLiveAlgoOrder({
      strategy: created.name,
      strategyId: created.id,
      kind: "nifty-first-candle",
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
    });
    assert.equal(sent.skippedAdmin, true);
    const queued = drainPendingLiveAlgoOrders();
    assert.equal(queued.some((row) => !row.copyUserId && row.strategy === created.name), false);
    const copy = queued.find((row) => row.copyUserId === user.id);
    assert.ok(copy);
    assert.equal(copy.brokerId, "dhan");
  } finally {
    deleteAlgo(created.id);
    drainPendingLiveAlgoOrders();
    setDhanFeed({ live: false });
  }
});
