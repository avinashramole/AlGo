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
  assert.match(mobile, /to: "\/algo-test", label: "Algo Test"/);
  assert.match(algo, /export function AlgoTest/);
  assert.match(algo, /desk = "live"/);
  assert.match(algo, /data-algo-desk/);
  assert.match(algo, /Paper test only · no live · no copy/);
  assert.match(builder, /testDesk = false/);
  assert.match(builder, /RUN_MODES.filter\(\(mode\) => mode.id !== "live"\)/);
  assert.match(builder, /testDesk: true/);
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

test("create/update/toggle keep Algo Test paper-only and off live brokers", () => {
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
