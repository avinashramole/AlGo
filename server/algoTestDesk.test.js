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

const { assignAlgoBroker, createAlgo, deleteAlgo, setDhanFeed, toggleAlgo, updateAlgo } = await import("./market.js");

const FRI_0900 = Date.parse("2026-08-21T03:30:00.000Z");

test("Algo Test page, admin menu, and paper-only builder are wired", () => {
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
  assert.match(algo, /Paper test only · no live · no copy/);
  assert.match(algo, /Algo Test · no member copy/);
  assert.match(algo, /isolated && !shivam/);
  assert.match(builder, /liveAuthorized: true/);
  assert.match(builder, /testDesk = false/);
  assert.match(builder, /RUN_MODES.filter\(\(mode\) => mode.id !== "live"\)/);
  assert.match(builder, /testDesk: true/);
  assert.match(builder, /title="SHIVAM T2S"/);
  assert.match(builder, /data-shivam-capital="true"/);
  assert.match(algo, /Capital management/);
  assert.match(algo, /1–100 filled BUY entries today/);
});

test("normalizeAlgo seals Algo Test strategies to paper with no copy mapping", () => {
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
  assert.equal(created.runMode, "paper");
  assert.equal(created.brokerId, "paper");
  assert.equal(created.mappingScope, "master");
  assert.deepEqual(created.mappedClientIds, []);
  assert.equal(created.clientVisible, false);
  assert.equal(isTestDeskAlgo(created), true);

  const kept = normalizeAlgo({ runMode: "live", brokerId: "dhan", testDesk: false, clientVisible: true }, created);
  assert.equal(kept.testDesk, true);
  assert.equal(kept.runMode, "paper");
  assert.equal(kept.brokerId, "paper");
  assert.equal(kept.clientVisible, false);
});

test("main-desk strategies stay off the test desk flag", () => {
  const created = normalizeAlgo({ name: "NIFTY", kind: "nifty-first-candle", runMode: "live" });
  assert.equal(created.testDesk, false);
  assert.equal(created.runMode, "live");
});

test("Shivam T2S live on Algo Test still has no member copy", () => {
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
  assert.equal(created.mappingScope, "master");
  assert.deepEqual(created.mappedClientIds, []);
  assert.equal(created.clientVisible, false);
  assert.equal(isTestDeskAlgo(created), true);
});

test("findLiveCopyAlgo and member copies skip Algo Test strategies", () => {
  const live = { id: "live-n", name: "NIFTY", enabled: true, mappingScope: "both", mappedClientIds: ["u-1"] };
  const testAlgo = { id: "test-n", name: "NIFTY", testDesk: true, enabled: true, mappingScope: "both", mappedClientIds: ["u-1"] };
  const found = findLiveCopyAlgo([testAlgo, live], "NIFTY");
  assert.equal(found.id, "live-n");
  assert.deepEqual(memberCopyPayloads({ strategy: "NIFTY", qty: 65 }, testAlgo), []);
});

test("members cannot see Algo Test strategies", () => {
  assert.equal(
    strategyVisibleToMember(
      { id: "t1", name: "NIFTY", testDesk: true, clientVisible: true, mappingScope: "both" },
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
  assert.equal(result.algos[0].runMode, "paper");
  assert.equal(result.algos[0].testDesk, true);
});

test("create/update/toggle keep non-Shivam Algo Test paper-only and off live brokers", () => {
  setDhanFeed({ live: true });
  const created = createAlgo({
    name: `Algo Test ${Date.now()}`,
    kind: "nifty-first-candle",
    testDesk: true,
    runMode: "live",
    brokerId: "dhan",
    mappingScope: "clients",
    mappedClientIds: ["u-keep"],
  });
  try {
    assert.equal(created.testDesk, true);
    assert.equal(created.runMode, "paper");
    assert.equal(created.brokerId, "paper");
    assert.equal(created.mappingScope, "master");
    assert.deepEqual(created.mappedClientIds, []);
    const live = updateAlgo(created.id, { runMode: "live", enabled: true, brokerId: "dhan" });
    assert.equal(live.error, undefined);
    assert.equal(live.testDesk, true);
    assert.equal(live.runMode, "paper");
    assert.equal(live.brokerId, "paper");
    const routed = assignAlgoBroker(created.id, "dhan");
    assert.equal(routed.brokerId, "paper");
    const started = toggleAlgo(created.id, { enabled: true });
    assert.equal(started.runMode, "paper");
    assert.equal(started.brokerId, "paper");
    assert.notEqual(started.status, "LIVE");
  } finally {
    deleteAlgo(created.id);
    setDhanFeed({ live: false });
  }
});

test("create/update/toggle allow Shivam T2S live Dhan on Algo Test without copy", () => {
  setDhanFeed({ live: true });
  const created = createAlgo({
    kind: "shivam-t2s",
    testDesk: true,
    runMode: "live",
    liveAuthorized: true,
    brokerId: "dhan",
    mappingScope: "clients",
    mappedClientIds: ["u-keep"],
  });
  try {
    assert.equal(created.testDesk, true);
    assert.equal(created.runMode, "live");
    assert.equal(created.brokerId, "dhan");
    assert.equal(created.liveAuthorized, true);
    assert.equal(created.mappingScope, "master");
    assert.deepEqual(created.mappedClientIds, []);
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
    assert.deepEqual(memberCopyPayloads({ strategy: created.name, qty: 65 }, started), []);
  } finally {
    deleteAlgo(created.id);
    setDhanFeed({ live: false });
  }
});
