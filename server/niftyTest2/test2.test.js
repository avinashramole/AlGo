import assert from "node:assert/strict";
import test from "node:test";
import { buildSyntheticChain } from "../optionChain.js";
import { defaultNiftyTest2Algo, isNiftyTest2Algo, niftyTest2Config } from "../niftyVwap/config.js";
import { normalizeAlgo, seedAlgos } from "../strategies.js";
import { pickCombo, runTest2Backtest, strikeByMinPremium } from "./Test2Engine.js";
import { Test2Strategy } from "./Test2Strategy.js";

const T0935 = Date.parse("2026-10-07T04:05:00.000Z");

test("TEST2 seed and name lock", () => {
  const seeded = seedAlgos().find((row) => row.id === "a14");
  assert.equal(seeded.name, "TEST2");
  assert.equal(seeded.kind, "nifty-test2");
  assert.equal(seeded.startTimeIst, "09:35");
  assert.equal(seeded.endTimeIst, "15:15");
  assert.equal(seeded.exitTimeIst, "09:35");
  assert.equal(seeded.intradayOnly, false);
  assert.equal(seeded.product, "NRML");
  assert.equal(seeded.sellPremium, 80);
  assert.equal(seeded.hedgePremium, 20);
  assert.equal(isNiftyTest2Algo({ name: "TEST2" }), true);
  assert.equal(normalizeAlgo({ name: "TEST2" }).kind, "nifty-test2");
  assert.equal(defaultNiftyTest2Algo({ name: "other" }).name, "TEST2");
});

test("premium >= picks the cheapest qualifying strike", () => {
  const rows = buildSyntheticChain(24500, 50, 8);
  const sellCe = strikeByMinPremium(rows, "CE", 80);
  const hedgeCe = strikeByMinPremium(rows, "CE", 20);
  assert.equal(sellCe.premium >= 80, true);
  assert.equal(hedgeCe.premium >= 20, true);
  const combo = pickCombo({ monthlyRows: rows, weeklyRows: rows, sellPremium: 80, hedgePremium: 20 });
  assert.equal(combo.legs.length, 4);
  assert.equal(combo.legs[0].side, "SELL");
  assert.equal(combo.legs[0].option, "CE");
  assert.equal(combo.legs[2].side, "BUY");
});

test("TEST2 enters four legs after 09:35 and does not retry a reject", () => {
  const algo = defaultNiftyTest2Algo();
  const rows = buildSyntheticChain(24500, 50, 8);
  const places = [];
  const first = Test2Strategy.tick({
    algo,
    now: T0935,
    feedLive: true,
    minutesToClose: 340,
    monthlyRows: rows,
    weeklyRows: rows,
    expiries: { monthly: "2026-10-27", weekly: "2026-10-13" },
    adapter: {
      place: (payload) => {
        places.push(payload);
        return { queued: true, status: "PENDING" };
      },
    },
    positions: [],
    orders: [],
  });
  assert.equal(first.action, "entry");
  assert.equal(places.length, 4);
  assert.equal(places.every((row) => row.product === "NRML"), true);
  assert.deepEqual(
    places.map((row) => `${row.side} ${row.option}`),
    ["SELL CE", "SELL PE", "BUY CE", "BUY PE"],
  );
  const again = Test2Strategy.tick({
    algo,
    now: T0935 + 60_000,
    feedLive: true,
    minutesToClose: 339,
    monthlyRows: rows,
    weeklyRows: rows,
    adapter: { place: (payload) => places.push(payload) },
    positions: [],
    orders: [],
  });
  assert.equal(again.action, "skip");
  assert.equal(places.length, 4);
});

test("TEST2 is BTST: holds past 15:15 and sells tomorrow", () => {
  const algo = defaultNiftyTest2Algo();
  const rows = buildSyntheticChain(24500, 50, 8);
  const opens = [
    { symbol: "NIFTY 24600 CE", side: "SELL", qty: 65, avg: 80, ltp: 78, option: "CE", strike: 24600 },
    { symbol: "NIFTY 24400 PE", side: "SELL", qty: 65, avg: 80, ltp: 79, option: "PE", strike: 24400 },
    { symbol: "NIFTY 24700 CE", side: "BUY", qty: 65, avg: 20, ltp: 21, option: "CE", strike: 24700 },
    { symbol: "NIFTY 24300 PE", side: "BUY", qty: 65, avg: 20, ltp: 19, option: "PE", strike: 24300 },
  ];
  Test2Strategy.tick({
    algo,
    now: T0935,
    feedLive: true,
    monthlyRows: rows,
    weeklyRows: rows,
    adapter: { place: () => ({ queued: true, status: "PENDING" }) },
    positions: [],
    orders: [],
  });
  const closes = [];
  const sameDay = Test2Strategy.tick({
    algo,
    now: Date.parse("2026-10-07T09:50:00.000Z"),
    feedLive: true,
    adapter: { place: (payload) => closes.push(payload) },
    positions: opens,
    orders: [],
  });
  assert.equal(sameDay.action, "hold");
  assert.equal(closes.length, 0);
  const nextMorning = Test2Strategy.tick({
    algo,
    now: Date.parse("2026-10-08T04:05:00.000Z"),
    feedLive: true,
    adapter: { place: (payload) => closes.push(payload) },
    positions: opens,
    orders: [],
  });
  assert.equal(nextMorning.action, "exit");
  assert.equal(nextMorning.reason, "btst");
  assert.equal(closes.length, 4);
  assert.equal(closes.every((row) => row.product === "NRML"), true);
  assert.deepEqual(
    closes.map((row) => `${row.side} ${row.option}`),
    ["BUY CE", "BUY PE", "SELL CE", "SELL PE"],
  );
});

test("TEST2 backtest walks each session day", () => {
  const algo = defaultNiftyTest2Algo();
  const day = Date.parse("2026-09-01T04:05:00.000Z");
  const candles = Array.from({ length: 10 }, (_, i) => ({
    time: day + i * 86_400_000,
    open: 24500,
    high: 24580,
    low: 24420,
    close: 24500 + (i % 2 ? 40 : -30),
    volume: 1,
  }));
  const result = runTest2Backtest(algo, candles);
  assert.equal(result.combos, 9);
  assert.equal(result.trades, 36);
  assert.equal(Number(result.winRate) > 0, true);
  assert.equal(Number.isFinite(result.pnl), true);
  assert.equal(niftyTest2Config(algo).sellPremium, 80);
});

test("TEST2 backtest uses the full session, not only the first 5m bar", () => {
  const algo = defaultNiftyTest2Algo();
  const open = Date.parse("2026-09-01T04:05:00.000Z");
  const quiet = [
    ...Array.from({ length: 12 }, (_, i) => ({
      time: open + i * 5 * 60 * 1000,
      open: 24500,
      high: 24520,
      low: 24480,
      close: 24505,
      volume: 1,
    })),
    ...Array.from({ length: 12 }, (_, i) => ({
      time: open + 86_400_000 + i * 5 * 60 * 1000,
      open: 24510,
      high: 24530,
      low: 24490,
      close: 24515,
      volume: 1,
    })),
  ];
  const quietBook = runTest2Backtest(algo, quiet);
  assert.equal(quietBook.combos, 1);
  assert.equal(quietBook.trades, 4);
  assert.equal(quietBook.pnl > 0, true);
  const trend = [
    { time: open, open: 24500, high: 24510, low: 24490, close: 24500, volume: 1 },
    { time: open + 86_400_000, open: 25100, high: 25200, low: 24780, close: 25100, volume: 1 },
  ];
  const trendBook = runTest2Backtest(algo, trend);
  assert.equal(trendBook.combos, 1);
  assert.notEqual(trendBook.pnl, quietBook.pnl);
});

test("reset backtest clears stored TEST2 result", async () => {
  const { backtestAlgo, createAlgo, deleteAlgo, resetBacktestAlgo } = await import("../market.js");
  const created = createAlgo({
    name: "TEST2",
    kind: "nifty-test2",
    runMode: "backtest",
  });
  try {
    const replay = await backtestAlgo(created.id, {
      candles: Array.from({ length: 10 }, (_, i) => ({
        time: Date.parse("2026-09-01T04:05:00.000Z") + i * 86_400_000,
        open: 24500,
        high: 24580,
        low: 24420,
        close: 24500 + (i % 2 ? 40 : -30),
        volume: 1,
      })),
    });
    assert.equal(Number(replay.algo.lastBacktest?.trades || 0) > 0, true);
    const reset = resetBacktestAlgo(created.id);
    assert.equal(reset.ok, true);
    assert.equal(reset.algo.lastBacktest, null);
    assert.equal(reset.algo.pnl, 0);
    assert.equal(reset.algo.winRate, 0);
  } finally {
    deleteAlgo(created.id);
  }
});
