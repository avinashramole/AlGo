import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "t2s-toggle-"));
process.env.T2S_ALGOS_FILE = path.join(dir, "algos.json");

const { applyLiveQuotes, backtestAlgo, createAlgo, deleteAlgo, drainPendingLiveAlgoOrders, dropClientFromStrategies, getAlgo, listAlgos, queueLiveAlgoOrder, replaceDhanBook, setDhanFeed, snapshot, syncAlgoClientMaps, toggleAlgo, updateAlgo } = await import("./market.js");
const { hydrateAlgos, seedAlgos } = await import("./strategies.js");

function names(...rows) {
  return rows.map((row) => row.name);
}

test("starting one strategy does not stop another, and a second start click stays LIVE", () => {
  setDhanFeed({ live: true });
  const stamp = Date.now();
  const first = createAlgo({ name: `Toggle One ${stamp}`, kind: "indicator", runMode: "live" });
  const second = createAlgo({ name: `Toggle Two ${stamp}`, kind: "indicator", runMode: "live" });
  try {
    const startedFirst = toggleAlgo(first.id, { enabled: true });
    const startedSecond = toggleAlgo(second.id, { enabled: true });
    assert.equal(startedFirst.enabled, true);
    assert.equal(startedFirst.status, "LIVE");
    assert.equal(startedSecond.enabled, true);
    assert.equal(startedSecond.status, "LIVE");

    const again = toggleAlgo(first.id, { enabled: true });
    assert.equal(again.enabled, true);
    assert.equal(again.status, "LIVE");

    const live = listAlgos();
    assert.equal(live.find((row) => row.id === first.id).enabled, true);
    assert.equal(live.find((row) => row.id === second.id).enabled, true);

    const third = createAlgo({ name: `Toggle Three ${stamp}`, kind: "indicator", runMode: "live" });
    const startedThird = toggleAlgo(third.id, { enabled: true });
    assert.equal(startedThird.enabled, true);
    assert.equal(listAlgos().find((row) => row.id === first.id).enabled, true);
    assert.equal(listAlgos().find((row) => row.id === second.id).enabled, true);

    const stopped = toggleAlgo(first.id, { enabled: false });
    assert.equal(stopped.enabled, false);
    assert.equal(stopped.status, "PAUSED");
    assert.equal(listAlgos().find((row) => row.id === second.id).enabled, true);
    assert.equal(listAlgos().find((row) => row.id === third.id).enabled, true);
  } finally {
    for (const row of listAlgos().filter((item) => item.name.includes(String(stamp)))) {
      deleteAlgo(row.id);
    }
    setDhanFeed({ live: false });
    assert.equal(names(...listAlgos().filter((row) => row.name.includes(String(stamp)))).length, 0);
  }
});

test("all live strategies can start at the same time", () => {
  setDhanFeed({ live: true });
  const stamp = Date.now();
  const created = ["A", "B", "C", "D"].map((label) =>
    createAlgo({ name: `StartAll ${label} ${stamp}`, kind: "indicator", runMode: "live" }),
  );
  try {
    const started = created.map((row) => toggleAlgo(row.id, { enabled: true }));
    assert.equal(started.every((row) => row.enabled === true && row.status === "LIVE"), true);
    const live = listAlgos();
    for (const row of created) {
      assert.equal(live.find((item) => item.id === row.id).enabled, true);
      assert.equal(live.find((item) => item.id === row.id).status, "LIVE");
    }
  } finally {
    for (const row of listAlgos().filter((item) => item.name.includes(String(stamp)))) {
      deleteAlgo(row.id);
    }
    setDhanFeed({ live: false });
  }
});

test("a started strategy stays LIVE after the saved file is reloaded", () => {
  setDhanFeed({ live: true });
  const stamp = Date.now();
  const created = createAlgo({ name: `Persist Live ${stamp}`, kind: "nifty-first-candle", runMode: "live" });
  try {
    const started = toggleAlgo(created.id, { enabled: true });
    assert.equal(started.enabled, true);
    const stored = JSON.parse(fs.readFileSync(process.env.T2S_ALGOS_FILE, "utf8"));
    const saved = (stored.algos || []).find((row) => row.id === created.id);
    assert.equal(saved.enabled, true);
    assert.equal(saved.status, "LIVE");
    const reloaded = hydrateAlgos(stored, seedAlgos());
    const again = reloaded.algos.find((row) => row.id === created.id);
    assert.equal(again.enabled, true);
    assert.equal(again.status, "LIVE");
  } finally {
    deleteAlgo(created.id);
    setDhanFeed({ live: false });
  }
});

test("paper or stopped strategies keep admin and user BUY on paper only", () => {
  setDhanFeed({ live: true });
  const stamp = Date.now();
  const name = `Paper only ${stamp}`;
  const created = createAlgo({ name, kind: "nifty-first-candle", runMode: "live" });
  drainPendingLiveAlgoOrders();
  try {
    const started = toggleAlgo(created.id, { enabled: true });
    assert.equal(started.enabled, true);
    const live = queueLiveAlgoOrder({
      strategy: name,
      side: "BUY",
      qty: 65,
      symbol: "NIFTY 22300 CE",
      option: "CE",
      strike: 22300,
      brokerId: "dhan",
      product: "MIS",
      type: "MARKET",
    });
    assert.equal(live.queued, true);
    const paper = updateAlgo(created.id, { runMode: "paper" });
    assert.equal(paper.runMode, "paper");
    assert.equal(paper.brokerId, "paper");
    assert.equal(paper.holdDailyLive, true);
    const leftover = drainPendingLiveAlgoOrders().filter((row) => row.strategy === name && row.side === "BUY" && row.brokerId !== "paper");
    assert.equal(leftover.length, 0);
    const again = queueLiveAlgoOrder({
      strategy: name,
      side: "BUY",
      qty: 65,
      symbol: "NIFTY 22300 CE",
      option: "CE",
      strike: 22300,
      brokerId: "dhan",
      product: "MIS",
      type: "MARKET",
    });
    assert.equal(again.queued, false);
    assert.equal(again.blocked, true);
    const paperCopy = queueLiveAlgoOrder({
      strategy: name,
      side: "BUY",
      qty: 65,
      symbol: "NIFTY 22300 CE",
      option: "CE",
      strike: 22300,
      brokerId: "paper",
      paper: true,
      product: "MIS",
      type: "MARKET",
    });
    assert.equal(paperCopy.queued, true);
    const stopped = toggleAlgo(created.id, { enabled: false });
    assert.equal(stopped.enabled, false);
    const afterStop = queueLiveAlgoOrder({
      strategy: name,
      side: "BUY",
      qty: 65,
      symbol: "NIFTY 22300 CE",
      option: "CE",
      strike: 22300,
      brokerId: "dhan",
      product: "MIS",
      type: "MARKET",
    });
    assert.equal(afterStop.queued, false);
    assert.equal(afterStop.blocked, true);
  } finally {
    deleteAlgo(created.id);
    drainPendingLiveAlgoOrders();
    setDhanFeed({ live: false });
  }
});

test("starting NIFTY live sends the admin broker order even if a leftover lot is still on the book", () => {
  setDhanFeed({ live: true });
  const stamp = Date.now();
  const name = `NIFTY admin run ${stamp}`;
  const created = createAlgo({ name, kind: "nifty-first-candle", runMode: "live" });
  drainPendingLiveAlgoOrders();
  try {
    replaceDhanBook([
      {
        id: "dhan-pos-leftover",
        symbol: "NIFTY 23100 CE",
        type: "BUY",
        qty: 65,
        avg: 100,
        ltp: 110,
        strategy: name,
        brokerId: "dhan",
        option: "CE",
        strike: 23100,
        live: true,
      },
    ]);
    const started = toggleAlgo(created.id, { enabled: true });
    assert.equal(started.enabled, true);
    const result = queueLiveAlgoOrder({
      strategy: name,
      side: "BUY",
      qty: 65,
      symbol: "NIFTY 23200 CE",
      option: "CE",
      strike: 23200,
      brokerId: "dhan",
      product: "MIS",
      type: "MARKET",
    });
    assert.equal(result.queued, true);
    const queued = drainPendingLiveAlgoOrders().filter((row) => row.strategy === name && !row.copyUserId);
    assert.equal(queued.length, 1);
    assert.equal(queued[0].brokerId, "dhan");
    assert.equal(queued[0].symbol, "NIFTY 23200 CE");
  } finally {
    deleteAlgo(created.id);
    replaceDhanBook([]);
    drainPendingLiveAlgoOrders();
    setDhanFeed({ live: false });
  }
});

test("stopping NIFTY live drops queued BUY orders and blocks new ones", () => {
  setDhanFeed({ live: true });
  const stamp = Date.now();
  const name = `NIFTY stop no fire ${stamp}`;
  const created = createAlgo({ name, kind: "nifty-first-candle", runMode: "live" });
  drainPendingLiveAlgoOrders();
  try {
    const started = toggleAlgo(created.id, { enabled: true });
    assert.equal(started.enabled, true);
    const queued = queueLiveAlgoOrder({
      strategy: name,
      side: "BUY",
      qty: 65,
      symbol: "NIFTY 22300 CE",
      option: "CE",
      strike: 22300,
      brokerId: "dhan",
      product: "MIS",
      type: "MARKET",
    });
    assert.equal(queued.queued, true);
    const stopped = toggleAlgo(created.id, { enabled: false });
    assert.equal(stopped.enabled, false);
    assert.equal(stopped.holdDailyLive, true);
    assert.equal(stopped.status, "PAUSED");
    const leftover = drainPendingLiveAlgoOrders().filter((row) => row.strategy === name && row.side === "BUY");
    assert.equal(leftover.length, 0);
    const again = queueLiveAlgoOrder({
      strategy: name,
      side: "BUY",
      qty: 65,
      symbol: "NIFTY 22300 CE",
      option: "CE",
      strike: 22300,
      brokerId: "dhan",
      product: "MIS",
      type: "MARKET",
    });
    assert.equal(again.queued, false);
    assert.equal(again.blocked, true);
    assert.equal(drainPendingLiveAlgoOrders().filter((row) => row.strategy === name).length, 0);
    const stored = JSON.parse(fs.readFileSync(process.env.T2S_ALGOS_FILE, "utf8"));
    const reloaded = hydrateAlgos(stored, seedAlgos());
    const held = reloaded.algos.find((row) => row.id === created.id);
    assert.equal(held.enabled, false);
    assert.equal(held.holdDailyLive, true);
  } finally {
    deleteAlgo(created.id);
    drainPendingLiveAlgoOrders();
    setDhanFeed({ live: false });
  }
});

test("starting or stopping a strategy does not stop the Dhan data feed", () => {
  const tickAt = 1_700_000_000_000;
  setDhanFeed({ live: true, source: "websocket", lastTickAt: tickAt, error: null });
  const stamp = Date.now();
  const created = createAlgo({ name: `Feed Stay ${stamp}`, kind: "nifty-first-candle", runMode: "live" });
  try {
    const started = toggleAlgo(created.id, { enabled: true });
    assert.equal(started.enabled, true);
    let feed = snapshot().dhanFeed;
    assert.equal(feed.live, true);
    assert.equal(feed.source, "websocket");
    assert.equal(feed.lastTickAt, tickAt);

    const stopped = toggleAlgo(created.id, { enabled: false });
    assert.equal(stopped.enabled, false);
    feed = snapshot().dhanFeed;
    assert.equal(feed.live, true);
    assert.equal(feed.source, "websocket");
    assert.equal(feed.lastTickAt, tickAt);
    assert.equal(feed.error, null);
  } finally {
    deleteAlgo(created.id);
    setDhanFeed({ live: false, source: "idle", lastTickAt: null });
  }
});

test("a throwing live strategy tick still applies the next Dhan quote", () => {
  setDhanFeed({ live: true, source: "websocket", lastTickAt: Date.now() });
  const stamp = Date.now();
  const created = createAlgo({ name: `Feed Quote ${stamp}`, kind: "nifty-first-candle", runMode: "live" });
  try {
    const started = toggleAlgo(created.id, { enabled: true });
    assert.equal(started.enabled, true);
    const live = getAlgo(created.id);
    live.vwapState = new Proxy(
      {},
      {
        get() {
          throw new Error("strategy tick must not kill the tape");
        },
      },
    );
    applyLiveQuotes([{ symbol: "NIFTY 50", parent: "NIFTY 50", kind: "index", ltp: 25111 }]);
    const nifty = snapshot().indices.find((row) => row.symbol === "NIFTY 50");
    assert.equal(nifty?.price, 25111);
    assert.equal(snapshot().dhanFeed.live, true);
    assert.equal(snapshot().dhanFeed.source, "websocket");
  } finally {
    deleteAlgo(created.id);
    setDhanFeed({ live: false, source: "idle", lastTickAt: null });
  }
});

test("indicator Run backtest uses runBacktest instead of throwing not defined", async () => {
  const stamp = Date.now();
  const created = createAlgo({
    name: `Indicator BT ${stamp}`,
    kind: "indicator",
    indicator: "VWAP",
    runMode: "backtest",
    timeframe: "5m",
  });
  try {
    const result = await backtestAlgo(created.id, { range: "custom", from: "2026-08-01", to: "2026-08-21" });
    assert.equal(result.error, undefined);
    assert.equal(result.ok, true);
    assert.ok(result.backtest.bars >= 32);
    assert.equal(typeof result.backtest.pnl, "number");
  } finally {
    deleteAlgo(created.id);
  }
});

test("a deleted client is removed from every strategy map", () => {
  const stamp = Date.now();
  const created = createAlgo({
    name: `Map Drop ${stamp}`,
    kind: "indicator",
    mappedClientIds: ["u-keep", "u-gone"],
  });
  try {
    assert.deepEqual(listAlgos().find((row) => row.id === created.id).mappedClientIds, ["u-keep", "u-gone"]);
    assert.equal(dropClientFromStrategies("u-gone"), true);
    assert.deepEqual(listAlgos().find((row) => row.id === created.id).mappedClientIds, ["u-keep"]);
    syncAlgoClientMaps();
    const left = listAlgos().find((row) => row.id === created.id).mappedClientIds || [];
    assert.equal(left.includes("u-gone"), false);
    const saved = updateAlgo(created.id, { mappedClientIds: ["u-keep", "u-gone", "u-missing"] });
    assert.equal((saved.mappedClientIds || []).includes("u-gone"), false);
    assert.equal((saved.mappedClientIds || []).includes("u-missing"), false);
  } finally {
    deleteAlgo(created.id);
  }
});

test("paper to live with enabled starts LIVE in one write", () => {
  setDhanFeed({ live: true });
  const created = createAlgo({
    name: `Paper Live Shift ${Date.now()}`,
    kind: "nifty-first-candle",
    runMode: "paper",
  });
  try {
    const live = updateAlgo(created.id, { runMode: "live", enabled: true, brokerId: "dhan" });
    assert.equal(live.runMode, "live");
    assert.equal(live.enabled, true);
    assert.equal(live.status, "LIVE");
    assert.equal(live.brokerId, "dhan");
    assert.equal(live.holdDailyLive, false);
    assert.equal(live.allowFreshLiveEntry, true);
  } finally {
    deleteAlgo(created.id);
    setDhanFeed({ live: false });
  }
});
