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
  assert.equal(seeded.sellPremium, 80);
  assert.equal(seeded.hedgePremium, 20);
  assert.equal(isNiftyTest2Algo({ name: "TEST2" }), true);
  assert.equal(normalizeAlgo({ name: "TEST2", kind: "indicator" }).kind, "nifty-test2");
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
  assert.equal(result.trades, 10);
  assert.equal(Number.isFinite(result.pnl), true);
  assert.equal(niftyTest2Config(algo).sellPremium, 80);
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
