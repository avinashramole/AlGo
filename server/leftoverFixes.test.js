import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { dropClosedLivePosition, keepLastBookRows, keepLivePositionBook, uniqueOpenContracts } from "../src/lib/deskFeed.ts";
import { memberTapeHasQuotes } from "../src/lib/headerBroker.ts";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "t2s-leftover-"));
process.env.T2S_ALGOS_FILE = path.join(dir, "algos.json");
process.env.T2S_MEMBER_DESK_FILE = path.join(dir, "member-desk.json");
process.env.T2S_PAYMENTS_FILE = path.join(dir, "payments.json");
process.env.T2S_ENROLL_FILE = path.join(dir, "enrollments.json");

const {
  clearSimulatedDesk,
  closeSideForPosition,
  createAlgo,
  deleteAlgo,
  dhanQuotesStalled,
  drainPendingLiveAlgoOrders,
  findDeskPosition,
  getAlgo,
  liveBuyAllowedForStrategy,
  armLiveOrders,
  queueLiveAlgoOrder,
  queueLivePositionExit,
  replaceDhanBook,
  setDhanFeed,
  snapshot,
  strategyAllowsLiveMemberCopies,
  toggleAlgo,
  withLiveAlgo,
} = await import("./market.js");
const { dispatchMemberCopies, findLiveCopyAlgo } = await import("./liveCopy.js");
const { getMemberDesk, saveClientSettings, selectMemberBroker } = await import("./memberDesk.js");

test("clearSimulatedDesk keeps a live Dhan book and drops only simulated rows", () => {
  replaceDhanBook([
    {
      id: "dhan-pos-live-keep",
      symbol: "NIFTY 22700 CE",
      type: "BUY",
      qty: 65,
      avg: 80,
      ltp: 82,
      brokerId: "dhan",
      live: true,
      sim: false,
    },
    {
      id: "dhan-pos-sim-drop",
      symbol: "NIFTY 22600 CE",
      type: "BUY",
      qty: 65,
      avg: 10,
      ltp: 11,
      brokerId: "dhan",
      live: false,
      sim: true,
    },
  ]);
  clearSimulatedDesk();
  const rows = (snapshot().positions || []).filter((row) => String(row.id || "").startsWith("dhan-pos-"));
  assert.equal(rows.some((row) => row.id === "dhan-pos-live-keep"), true);
  assert.equal(rows.some((row) => row.id === "dhan-pos-sim-drop"), false);
  replaceDhanBook([]);
});

test("quote stall is visible while the feed stays live", () => {
  setDhanFeed({
    live: true,
    source: "websocket",
    lastTickAt: Date.now() - 60_000,
    error: "Dhan quotes request failed",
  });
  assert.equal(dhanQuotesStalled(), true);
  assert.equal(snapshot().dhanFeed.live, true);
  assert.equal(snapshot().dhanFeed.stalled, true);
  setDhanFeed({ live: true, source: "websocket", lastTickAt: Date.now(), error: null });
  assert.equal(dhanQuotesStalled(), false);
  assert.equal(snapshot().dhanFeed.stalled, false);
});

test("a 30s empty snapshot merge keeps the last admin book rows", () => {
  const kept = keepLastBookRows(
    [{ id: "dhan-pos-recent", symbol: "NIFTY 22750 PE", qty: 65 }],
    [],
  );
  assert.equal(kept.length, 1);
  assert.equal(kept[0].id, "dhan-pos-recent");
});

test("a fresh Crude book drops stale Dhan product-alias ids so Exit sees one lot", () => {
  const previous = [
    { id: "dhan-pos-99-I", symbol: "CRUDEOIL 6100 CE", securityId: "99", qty: 100, live: true, brokerId: "dhan" },
    { id: "dhan-pos-99-INTRADAY", symbol: "CRUDEOIL 6100 CE", securityId: "99", qty: 100, live: true, brokerId: "dhan" },
    { id: "dhan-pos-99-MIS", symbol: "CRUDEOIL 6100 CE", securityId: "99", qty: 100, live: true, brokerId: "dhan" },
    { id: "dhan-pos-99-MARGIN", symbol: "CRUDEOIL 6100 CE", securityId: "99", qty: 100, live: true, brokerId: "dhan" },
  ];
  const incoming = [
    { id: "dhan-pos-99-INTRADAY", symbol: "CRUDEOIL 6100 CE", securityId: "99", qty: 100, live: true, brokerId: "dhan" },
  ];
  const kept = keepLivePositionBook(previous, incoming);
  assert.equal(kept.length, 1);
  assert.equal(kept[0].id, "dhan-pos-99-INTRADAY");
  assert.equal(uniqueOpenContracts(previous).length, 1);
  const flat = keepLivePositionBook(previous, [], { trustEmpty: true });
  assert.equal(flat.some((row) => String(row.id).startsWith("dhan-pos-")), false);
  const dropped = dropClosedLivePosition(previous, { id: "dhan-pos-99-I", securityId: "99" });
  assert.equal(dropped.length, 0);
});

test("Exit finds a stale Dhan id and clears every strategy lot the same way", () => {
  armLiveOrders();
  const nifty = createAlgo({ name: `NIFTY exit ${Date.now()}`, kind: "nifty-first-candle", runMode: "live" });
  const crude = createAlgo({ name: `CRUDE exit ${Date.now()}`, kind: "crude-first-candle", symbol: "CRUDEOIL", runMode: "live" });
  const vwap = createAlgo({ name: `VWAP exit ${Date.now()}`, kind: "nifty-vwap", runMode: "live" });
  const multi = createAlgo({ name: `MULTI exit ${Date.now()}`, kind: "multi-index-reversal", symbol: "BANKNIFTY", runMode: "live" });
  const lots = [
    {
      id: "dhan-pos-11-INTRADAY",
      symbol: "NIFTY 22750 CE",
      type: "BUY",
      qty: 65,
      avg: 80,
      ltp: 90,
      strategy: nifty.name,
      brokerId: "dhan",
      option: "CE",
      strike: 22750,
      securityId: "11",
      live: true,
    },
    {
      id: "dhan-pos-99-INTRADAY",
      symbol: "CRUDEOIL 6100 CE",
      type: "BUY",
      qty: 100,
      avg: 90,
      ltp: 80,
      strategy: crude.name,
      brokerId: "dhan",
      option: "CE",
      strike: 6100,
      securityId: "99",
      live: true,
      lotSize: 100,
    },
    {
      id: "dhan-pos-22-INTRADAY",
      symbol: "NIFTY 22800 PE",
      type: "BUY",
      qty: 65,
      avg: 70,
      ltp: 75,
      strategy: vwap.name,
      brokerId: "dhan",
      option: "PE",
      strike: 22800,
      securityId: "22",
      live: true,
    },
    {
      id: "dhan-pos-33-INTRADAY",
      symbol: "BANKNIFTY 52000 CE",
      type: "BUY",
      qty: 30,
      avg: 120,
      ltp: 130,
      strategy: multi.name,
      brokerId: "dhan",
      option: "CE",
      strike: 52000,
      securityId: "33",
      live: true,
    },
  ];
  try {
    replaceDhanBook(lots);
    assert.equal(findDeskPosition("dhan-pos-11-I")?.securityId, "11");
    assert.equal(findDeskPosition("dhan-pos-99-MIS")?.securityId, "99");
    assert.equal(findDeskPosition("dhan-pos-22-I")?.securityId, "22");
    assert.equal(findDeskPosition("dhan-pos-33-MIS")?.securityId, "33");
    for (const staleId of ["dhan-pos-11-I", "dhan-pos-99-MIS", "dhan-pos-22-I", "dhan-pos-33-MIS"]) {
      assert.equal(queueLivePositionExit(findDeskPosition(staleId)).queued, true);
    }
    const open = snapshot().positions.filter((row) => !row.copyUserId && Number(row.qty) > 0);
    assert.equal(open.some((row) => ["11", "99", "22", "33"].includes(String(row.securityId))), false);
    replaceDhanBook(lots);
    const afterPoll = snapshot().positions.filter((row) => !row.copyUserId && Number(row.qty) > 0);
    assert.equal(afterPoll.some((row) => ["11", "99", "22", "33"].includes(String(row.securityId))), false);
  } finally {
    drainPendingLiveAlgoOrders();
    replaceDhanBook([]);
    deleteAlgo(nifty.id);
    deleteAlgo(crude.id);
    deleteAlgo(vwap.id);
    deleteAlgo(multi.id);
  }
});

test("Exit close sends SELL only and blocks a new BUY on every strategy", () => {
  armLiveOrders();
  const nifty = createAlgo({ name: `NIFTY sell ${Date.now()}`, kind: "nifty-first-candle", runMode: "live" });
  const crude = createAlgo({ name: `CRUDE sell ${Date.now()}`, kind: "crude-first-candle", symbol: "CRUDEOIL", runMode: "live" });
  try {
    assert.equal(closeSideForPosition({ type: "BUY", qty: 100 }), "SELL");
    assert.equal(closeSideForPosition({ type: "LONG", qty: 100 }), "SELL");
    assert.equal(closeSideForPosition({ qty: 100 }), "SELL");
    assert.equal(closeSideForPosition({ type: "SELL", qty: 100 }), "BUY");
    assert.equal(closeSideForPosition({ type: "SHORT", qty: 1 }), "BUY");
    replaceDhanBook([
      {
        id: "dhan-pos-77-INTRADAY",
        symbol: "CRUDEOIL 6100 CE",
        type: "LONG",
        qty: 100,
        avg: 90,
        ltp: 80,
        strategy: crude.name,
        brokerId: "dhan",
        option: "CE",
        strike: 6100,
        securityId: "77",
        live: true,
        lotSize: 100,
      },
      {
        id: "dhan-pos-88-INTRADAY",
        symbol: "NIFTY 22750 CE",
        qty: 65,
        avg: 80,
        ltp: 90,
        strategy: nifty.name,
        brokerId: "dhan",
        option: "CE",
        strike: 22750,
        securityId: "88",
        live: true,
      },
    ]);
    const crudeExit = queueLivePositionExit(findDeskPosition("dhan-pos-77-I"));
    const niftyExit = queueLivePositionExit(findDeskPosition("dhan-pos-88-MIS"));
    assert.equal(crudeExit.queued, true);
    assert.equal(niftyExit.queued, true);
    const pending = drainPendingLiveAlgoOrders();
    const admin = pending.filter((row) => !row.copyUserId);
    assert.equal(admin.every((row) => row.side === "SELL"), true);
    assert.equal(admin.some((row) => row.side === "BUY"), false);
    assert.equal(liveBuyAllowedForStrategy(crude.name), false);
    assert.equal(liveBuyAllowedForStrategy(nifty.name), false);
    const blocked = queueLiveAlgoOrder({
      strategy: crude.name,
      side: "BUY",
      qty: 100,
      symbol: "CRUDEOIL 6100 CE",
      securityId: "77",
      option: "CE",
      strike: 6100,
      brokerId: "dhan",
    });
    assert.equal(blocked.queued, false);
    assert.equal(blocked.blocked, true);
  } finally {
    drainPendingLiveAlgoOrders();
    replaceDhanBook([]);
    deleteAlgo(nifty.id);
    deleteAlgo(crude.id);
  }
});

test("every strategy keeps a custom daily trade limit and blocks extra BUY", () => {
  armLiveOrders();
  const specs = [
    { kind: "nifty-first-candle", name: `NIFTY limit ${Date.now()}` },
    { kind: "crude-first-candle", name: `CRUDE limit ${Date.now()}`, symbol: "CRUDEOIL" },
    { kind: "nifty-vwap", name: `VWAP limit ${Date.now()}` },
    { kind: "nifty-vwap-reversal", name: `REV limit ${Date.now()}` },
    { kind: "nifty-vwap-hedge", name: `HEDGE limit ${Date.now()}` },
    { kind: "multi-index-reversal", name: `MULTI limit ${Date.now()}`, symbol: "BANKNIFTY" },
    { kind: "nifty-test1", name: `TEST1 limit ${Date.now()}` },
    { kind: "nifty-test2", name: `TEST2 limit ${Date.now()}` },
    { kind: "nifty-test", name: `TEST limit ${Date.now()}` },
    { kind: "indicator", name: `IND limit ${Date.now()}`, indicator: "VWAP" },
    { kind: "price-action", name: `PA limit ${Date.now()}`, pattern: "ORB" },
  ];
  const created = [];
  try {
    for (const spec of specs) {
      const algo = createAlgo({ ...spec, runMode: "live", maxTradesPerDay: 2 });
      created.push(algo);
      assert.equal((getAlgo(algo.id) || algo).maxTradesPerDay, 2, spec.kind);
    }
    const probe = createAlgo({ name: `VWAP daily ${Date.now()}`, kind: "nifty-vwap", runMode: "live", maxTradesPerDay: 1 });
    created.push(probe);
    withLiveAlgo(probe.id, (algo) => {
      algo.vwapState = { ...(algo.vwapState || {}), sessionTrades: 1 };
    });
    const live = getAlgo(probe.id) || probe;
    const blocked = queueLiveAlgoOrder({
      strategy: live.name,
      side: "BUY",
      qty: 65,
      symbol: "NIFTY 22700 CE",
      option: "CE",
      strike: 22700,
      brokerId: "dhan",
    });
    assert.equal(blocked.queued, false);
    assert.equal(blocked.status, "MAX_TRADES");
    const hedge = queueLiveAlgoOrder({
      strategy: live.name,
      side: "BUY",
      qty: 65,
      symbol: "NIFTY 22700 PE",
      option: "PE",
      strike: 22700,
      role: "hedge",
      brokerId: "dhan",
    });
    assert.notEqual(hedge.status, "MAX_TRADES");
    const algoSrc = fs.readFileSync(new URL("../src/pages/Algo.tsx", import.meta.url), "utf8");
    assert.match(algoSrc, /data-trade-limit="daily"/);
    assert.match(algoSrc, /data-sl-tgt="crude"/);
    const builder = fs.readFileSync(new URL("../src/components/dashboard/StrategyBuilder.tsx", import.meta.url), "utf8");
    assert.match(builder, /data-trade-limit="daily"/);
  } finally {
    drainPendingLiveAlgoOrders();
    for (const algo of created) deleteAlgo(algo.id);
  }
});

test("member header quotes require a live flag or a real price, not an empty card list", () => {
  assert.equal(memberTapeHasQuotes({ indices: [{ price: 0 }, { price: 0 }] }), false);
  assert.equal(memberTapeHasQuotes({ live: false, indices: [{ symbol: "NIFTY 50" }] }), false);
  assert.equal(memberTapeHasQuotes({ live: true, indices: [] }), true);
  assert.equal(memberTapeHasQuotes({ indices: [{ price: 25111 }] }), true);
  assert.equal(memberTapeHasQuotes({ hasQuotes: true, indices: [] }), true);
});

test("short NIFTY still follows the first-candle card on/off for admin and user copies", () => {
  const created = createAlgo({ name: `NIFTY 5m first candle leftover ${Date.now()}`, kind: "nifty-first-candle", runMode: "live" });
  drainPendingLiveAlgoOrders();
  try {
    toggleAlgo(created.id, { enabled: true });
    assert.equal(findLiveCopyAlgo([created], "NIFTY").name, created.name);
    assert.equal(liveBuyAllowedForStrategy(created.name), true);
    assert.equal(strategyAllowsLiveMemberCopies(created.name), true);
    const queued = queueLiveAlgoOrder({
      strategy: created.name,
      side: "BUY",
      qty: 65,
      symbol: "NIFTY 22350 CE",
      option: "CE",
      strike: 22350,
      brokerId: "dhan",
      product: "MIS",
      type: "MARKET",
    });
    assert.equal(queued.queued, true);
    toggleAlgo(created.id, { enabled: false });
    assert.equal(liveBuyAllowedForStrategy(created.name), false);
    assert.equal(strategyAllowsLiveMemberCopies(created.name), false);
    const leftover = drainPendingLiveAlgoOrders().filter((row) => row.strategy === created.name && row.side === "BUY");
    assert.equal(leftover.length, 0);
    const again = queueLiveAlgoOrder({
      strategy: created.name,
      side: "BUY",
      qty: 65,
      symbol: "NIFTY 22350 CE",
      option: "CE",
      strike: 22350,
      brokerId: "dhan",
      product: "MIS",
      type: "MARKET",
    });
    assert.equal(again.queued, false);
    assert.equal(again.blocked, true);
  } finally {
    deleteAlgo(created.id);
    drainPendingLiveAlgoOrders();
  }
});

test("a disabled strategy does not book a paper copy for a mapped user", () => {
  const user = { id: "u-off-paper", name: "Off Paper", email: "offpaper@t2s.app", role: "user" };
  selectMemberBroker({ user, brokerId: "paper" });
  saveClientSettings(user.id, { copy: false, tradeMode: "paper", brokerId: "paper", subscriptionUntil: "2026-12-31" });
  const algo = {
    id: "a-off-paper",
    name: "NIFTY 5m first candle",
    enabled: false,
    holdDailyLive: true,
    mappingScope: "clients",
    mappedClientIds: [user.id],
  };
  dispatchMemberCopies(
    { strategy: algo.name, side: "BUY", symbol: "NIFTY 22800 CE", qty: 65, price: 40, brokerId: "dhan" },
    algo,
  );
  const desk = getMemberDesk({ user, enrollments: [], algos: [algo], quote: () => 0 });
  assert.equal(desk.positions.some((row) => row.symbol === "NIFTY 22800 CE"), false);
});

test("Start data feed warms user desks; Brokers shows stall without stopping LIVE", () => {
  const dhanSrc = fs.readFileSync(new URL("./dhan.js", import.meta.url), "utf8");
  assert.match(dhanSrc, /ensureMemberDataFeedsRunning\("live-start"\)/);
  const marketSrc = fs.readFileSync(new URL("./market.js", import.meta.url), "utf8");
  assert.match(marketSrc, /export function dhanQuotesStalled/);
  assert.match(marketSrc, /stalled: dhanQuotesStalled\(feed\)/);
  assert.match(marketSrc, /isPaperRow\(row\) \|\| \(!isSimRow\(row\)/);
  assert.match(marketSrc, /findLiveCopyAlgo\(state\.algos/);
  assert.match(marketSrc, /export function dhanOrdersLive/);
  assert.match(dhanSrc, /armLiveOrders\(false\)/);
  const header = fs.readFileSync(new URL("../src/components/layout/Header.tsx", import.meta.url), "utf8");
  assert.match(header, /memberTapeHasQuotes\(quotes\)/);
  const brokers = fs.readFileSync(new URL("../src/pages/Brokers.tsx", import.meta.url), "utf8");
  assert.match(brokers, /DHAN LIVE · stalled/);
  const webDesk = fs.readFileSync(new URL("../src/context/MarketContext.tsx", import.meta.url), "utf8");
  assert.match(webDesk, /keepLivePositionBook\(current\.positions/);
});
