import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { defaultNiftyFirstCandleAlgo, defaultNiftyVwapReversalAlgo } from "../niftyVwap/config.js";
import { defaultNiftyVwapHedgeAlgo } from "./config.js";
import {
  applyFirstCandleDailyLive,
  applyHedgeDailyLive,
  firstCandleDailyLiveAtYmd,
  hedgeDailyLiveAtYmd,
  isFirstCandleDailyLiveWindow,
  isHedgeDailyLiveWindow,
  isNiftyDailyLiveAlgo,
  isNseSessionDay,
  istYmd,
  loadFirstCandleDailyLiveArmedYmd,
  loadHedgeDailyLiveArmedYmd,
  nextFirstCandleDailyLiveAt,
  nextHedgeDailyLiveAt,
  saveFirstCandleDailyLiveArmedYmd,
  saveHedgeDailyLiveArmedYmd,
  shouldArmFirstCandleDailyLive,
  shouldArmHedgeDailyLive,
  startFirstCandleDailyLiveScheduler,
  startHedgeDailyLiveScheduler,
} from "./dailyLive.js";
import { normalizeAlgo, seedAlgos } from "../strategies.js";

const FRI_0859 = Date.parse("2026-08-21T03:29:00.000Z");
const FRI_0900 = Date.parse("2026-08-21T03:30:00.000Z");
const FRI_0901 = Date.parse("2026-08-21T03:31:00.000Z");
const FRI_0919 = Date.parse("2026-08-21T03:49:00.000Z");
const FRI_0920 = Date.parse("2026-08-21T03:50:00.000Z");
const FRI_0921 = Date.parse("2026-08-21T03:51:00.000Z");
const SAT_0900 = Date.parse("2026-08-22T03:30:00.000Z");
const SAT_0920 = Date.parse("2026-08-22T03:50:00.000Z");
const MON_0900 = Date.parse("2026-08-24T03:30:00.000Z");
const MON_0920 = Date.parse("2026-08-24T03:50:00.000Z");

function desk(patch = {}) {
  const seeded = seedAlgos();
  return seeded.map((row) => ({ ...row, ...(patch[row.id] || {}) }));
}

test("09:20 IST window is only weekdays at that minute", () => {
  assert.equal(isNseSessionDay(new Date(FRI_0920)), true);
  assert.equal(isNseSessionDay(new Date(SAT_0920)), false);
  assert.equal(isHedgeDailyLiveWindow(FRI_0919), false);
  assert.equal(isHedgeDailyLiveWindow(FRI_0920), true);
  assert.equal(isHedgeDailyLiveWindow(FRI_0921), false);
  assert.equal(isHedgeDailyLiveWindow(SAT_0920), false);
  assert.equal(shouldArmHedgeDailyLive({ now: FRI_0920 }), true);
  assert.equal(shouldArmHedgeDailyLive({ now: FRI_0920, lastArmedYmd: "2026-08-21" }), false);
});

test("next 09:20 IST skips the current instant, weekends, and already-passed slots", () => {
  assert.equal(nextHedgeDailyLiveAt(FRI_0919), FRI_0920);
  assert.equal(nextHedgeDailyLiveAt(FRI_0920), MON_0920);
  assert.equal(nextHedgeDailyLiveAt(FRI_0921), MON_0920);
  assert.equal(nextHedgeDailyLiveAt(SAT_0920), MON_0920);
  assert.equal(hedgeDailyLiveAtYmd("2026-08-24"), MON_0920);
});

test("daily LIVE arms NIFTY 15m VWAP hedge and reversal and leaves 5m ATM paused", () => {
  const algos = desk();
  const result = applyHedgeDailyLive(algos, { now: FRI_0920, feedLive: true });
  assert.equal(result.reason, "armed");
  assert.deepEqual(result.armedIds, ["a5", "a6"]);
  assert.equal(result.lastArmedYmd, "2026-08-21");
  assert.equal(result.algos.find((row) => row.id === "a4").enabled, false);
  assert.equal(result.algos.find((row) => row.id === "a10").enabled, false);
  const reversal = result.algos.find((row) => row.id === "a5");
  assert.equal(isNiftyDailyLiveAlgo(reversal), true);
  assert.equal(reversal.enabled, true);
  assert.equal(reversal.status, "LIVE");
  const hedge = result.algos.find((row) => row.id === "a6");
  assert.equal(hedge.enabled, true);
  assert.equal(hedge.status, "LIVE");
});

test("daily LIVE does not arm on boot, after hours, weekends, or without Dhan LIVE", () => {
  const algos = desk();
  assert.equal(applyHedgeDailyLive(algos, { now: FRI_0919, feedLive: true }).reason, "not-window");
  assert.equal(applyHedgeDailyLive(algos, { now: SAT_0920, feedLive: true }).reason, "not-window");
  assert.equal(applyHedgeDailyLive(algos, { now: FRI_0921, feedLive: true }).reason, "not-window");
  const noFeed = applyHedgeDailyLive(algos, { now: FRI_0920, feedLive: false });
  assert.equal(noFeed.reason, "dhan-not-live");
  assert.equal(noFeed.algos.find((row) => row.id === "a5").enabled, false);
  assert.equal(noFeed.algos.find((row) => row.id === "a6").enabled, false);
  assert.equal(noFeed.lastArmedYmd, "");
});

test("daily LIVE does not re-arm the same IST day after a pause", () => {
  const first = applyHedgeDailyLive(desk(), { now: FRI_0920, feedLive: true });
  const paused = first.algos.map((row) =>
    row.id === "a5" || row.id === "a6" ? { ...row, enabled: false, status: "PAUSED" } : row,
  );
  const again = applyHedgeDailyLive(paused, {
    now: FRI_0920,
    feedLive: true,
    lastArmedYmd: first.lastArmedYmd,
  });
  assert.equal(again.reason, "already-armed");
  assert.equal(again.algos.find((row) => row.id === "a5").enabled, false);
  assert.equal(again.algos.find((row) => row.id === "a6").enabled, false);
});

test("paper and backtest hedge and reversal algos stay off at 09:20", () => {
  const paperHedge = {
    ...defaultNiftyVwapHedgeAlgo({ name: "Paper hedge", runMode: "paper" }),
    id: "h-paper",
  };
  const backtestHedge = {
    ...defaultNiftyVwapHedgeAlgo({ name: "BT hedge", runMode: "backtest" }),
    id: "h-bt",
    enabled: false,
    status: "BACKTEST",
  };
  const paperReversal = {
    ...defaultNiftyVwapReversalAlgo({ name: "Paper reversal", runMode: "paper" }),
    id: "r-paper",
  };
  const result = applyHedgeDailyLive([paperHedge, backtestHedge, paperReversal], { now: FRI_0920, feedLive: true });
  assert.equal(result.reason, "already-live");
  assert.deepEqual(result.armedIds, []);
  assert.equal(result.algos[0].enabled, false);
  assert.equal(result.algos[1].enabled, false);
  assert.equal(result.algos[2].enabled, false);
});

test("hydrate/normalize still seed hedge and reversal paused — 09:20 is a separate clock", () => {
  const createdHedge = normalizeAlgo(defaultNiftyVwapHedgeAlgo({ name: "Hedge Desk", runMode: "live" }));
  const createdReversal = normalizeAlgo(defaultNiftyVwapReversalAlgo({ name: "Reversal Desk", runMode: "live" }));
  assert.equal(createdHedge.enabled, false);
  assert.equal(createdReversal.enabled, false);
  assert.notEqual(createdHedge.status, "LIVE");
  assert.notEqual(createdReversal.status, "LIVE");
  const seeded = seedAlgos();
  assert.equal(seeded.find((row) => row.id === "a5").enabled, false);
  assert.equal(seeded.find((row) => row.id === "a6").enabled, false);
  const boot = applyHedgeDailyLive(seeded, { now: Date.parse("2026-08-21T02:30:00.000Z"), feedLive: true });
  assert.equal(boot.reason, "not-window");
  assert.equal(boot.algos.find((row) => row.id === "a5").enabled, false);
  assert.equal(boot.algos.find((row) => row.id === "a6").enabled, false);
});

test("armed ymd persists only for a successful 09:20 window", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "t2s-hedge-daily-"));
  const file = path.join(dir, "hedge-daily-live.json");
  process.env.T2S_HEDGE_DAILY_LIVE_FILE = file;
  try {
    assert.equal(loadHedgeDailyLiveArmedYmd(), "");
    assert.equal(saveHedgeDailyLiveArmedYmd(istYmd(new Date(FRI_0920))), "2026-08-21");
    assert.equal(loadHedgeDailyLiveArmedYmd(), "2026-08-21");
  } finally {
    delete process.env.T2S_HEDGE_DAILY_LIVE_FILE;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("scheduler waits for the next 09:20 and does not arm on start", async () => {
  let now = FRI_0919;
  const fires = [];
  const timers = [];
  const stop = startHedgeDailyLiveScheduler({
    getNow: () => now,
    arm: () => {
      fires.push(now);
      return applyHedgeDailyLive(desk(), { now, feedLive: true });
    },
    setTimeoutFn: (fn, ms) => {
      timers.push({ fn, ms });
      return timers.length;
    },
    clearTimeoutFn: () => undefined,
  });
  assert.equal(fires.length, 0);
  assert.equal(timers.length, 1);
  assert.equal(timers[0].ms, FRI_0920 - FRI_0919);
  now = FRI_0920;
  await timers[0].fn();
  assert.equal(fires.length, 1);
  assert.equal(timers.length, 2);
  assert.equal(timers[1].ms, MON_0920 - FRI_0920);
  stop();
});

test("09:00 IST window is only weekdays at that minute and does not share the 09:20 armed day", () => {
  assert.equal(isFirstCandleDailyLiveWindow(FRI_0859), false);
  assert.equal(isFirstCandleDailyLiveWindow(FRI_0900), true);
  assert.equal(isFirstCandleDailyLiveWindow(FRI_0901), false);
  assert.equal(isFirstCandleDailyLiveWindow(FRI_0920), false);
  assert.equal(isFirstCandleDailyLiveWindow(SAT_0900), false);
  assert.equal(shouldArmFirstCandleDailyLive({ now: FRI_0900 }), true);
  assert.equal(shouldArmFirstCandleDailyLive({ now: FRI_0900, lastArmedYmd: "2026-08-21" }), false);
  assert.equal(nextFirstCandleDailyLiveAt(FRI_0859), FRI_0900);
  assert.equal(nextFirstCandleDailyLiveAt(FRI_0900), MON_0900);
  assert.equal(firstCandleDailyLiveAtYmd("2026-08-24"), MON_0900);
});

test("daily LIVE 09:00 arms NIFTY 5m first candle and leaves VWAP/hedge paused", () => {
  const result = applyFirstCandleDailyLive(desk(), { now: FRI_0900, feedLive: true });
  assert.equal(result.reason, "armed");
  assert.deepEqual(result.armedIds, ["a10"]);
  assert.equal(result.lastArmedYmd, "2026-08-21");
  const first = result.algos.find((row) => row.id === "a10");
  assert.equal(first.enabled, true);
  assert.equal(first.status, "LIVE");
  assert.equal(result.algos.find((row) => row.id === "a4").enabled, false);
  assert.equal(result.algos.find((row) => row.id === "a5").enabled, false);
  assert.equal(result.algos.find((row) => row.id === "a6").enabled, false);
});

test("first candle daily LIVE does not arm on boot, after hours, weekends, or without Dhan LIVE", () => {
  const algos = desk();
  assert.equal(applyFirstCandleDailyLive(algos, { now: FRI_0859, feedLive: true }).reason, "not-window");
  assert.equal(applyFirstCandleDailyLive(algos, { now: SAT_0900, feedLive: true }).reason, "not-window");
  assert.equal(applyFirstCandleDailyLive(algos, { now: FRI_0901, feedLive: true }).reason, "not-window");
  const noFeed = applyFirstCandleDailyLive(algos, { now: FRI_0900, feedLive: false });
  assert.equal(noFeed.reason, "dhan-not-live");
  assert.equal(noFeed.algos.find((row) => row.id === "a10").enabled, false);
  assert.equal(noFeed.lastArmedYmd, "");
});

test("first candle daily LIVE does not re-arm the same IST day after a pause", () => {
  const first = applyFirstCandleDailyLive(desk(), { now: FRI_0900, feedLive: true });
  const paused = first.algos.map((row) => (row.id === "a10" ? { ...row, enabled: false, status: "PAUSED" } : row));
  const again = applyFirstCandleDailyLive(paused, {
    now: FRI_0900,
    feedLive: true,
    lastArmedYmd: first.lastArmedYmd,
  });
  assert.equal(again.reason, "already-armed");
  assert.equal(again.algos.find((row) => row.id === "a10").enabled, false);
});

test("paper and backtest first candle algos stay off at 09:00", () => {
  const paper = { ...defaultNiftyFirstCandleAlgo({ name: "Paper first", runMode: "paper" }), id: "fc-paper" };
  const backtest = {
    ...defaultNiftyFirstCandleAlgo({ name: "BT first", runMode: "backtest" }),
    id: "fc-bt",
    enabled: false,
    status: "BACKTEST",
  };
  const result = applyFirstCandleDailyLive([paper, backtest], { now: FRI_0900, feedLive: true });
  assert.equal(result.reason, "already-live");
  assert.deepEqual(result.armedIds, []);
  assert.equal(result.algos[0].enabled, false);
  assert.equal(result.algos[1].enabled, false);
});

test("hydrate/normalize still seed first candle paused — 09:00 is a separate clock", () => {
  const created = normalizeAlgo(defaultNiftyFirstCandleAlgo({ name: "First Desk", runMode: "live" }));
  assert.equal(created.enabled, false);
  assert.notEqual(created.status, "LIVE");
  const seeded = seedAlgos();
  assert.equal(seeded.find((row) => row.id === "a10").enabled, false);
  const boot = applyFirstCandleDailyLive(seeded, { now: Date.parse("2026-08-21T02:30:00.000Z"), feedLive: true });
  assert.equal(boot.reason, "not-window");
  assert.equal(boot.algos.find((row) => row.id === "a10").enabled, false);
});

test("first candle armed ymd persists separately from 09:20 hedge/reversal", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "t2s-first-candle-daily-"));
  const file = path.join(dir, "hedge-daily-live.json");
  process.env.T2S_HEDGE_DAILY_LIVE_FILE = file;
  try {
    assert.equal(saveHedgeDailyLiveArmedYmd(istYmd(new Date(FRI_0920))), "2026-08-21");
    assert.equal(saveFirstCandleDailyLiveArmedYmd(istYmd(new Date(FRI_0900))), "2026-08-21");
    assert.equal(loadHedgeDailyLiveArmedYmd(), "2026-08-21");
    assert.equal(loadFirstCandleDailyLiveArmedYmd(), "2026-08-21");
  } finally {
    delete process.env.T2S_HEDGE_DAILY_LIVE_FILE;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("first candle scheduler waits for the next 09:00 and does not arm on start", async () => {
  let now = FRI_0859;
  const fires = [];
  const timers = [];
  const stop = startFirstCandleDailyLiveScheduler({
    getNow: () => now,
    arm: () => {
      fires.push(now);
      return applyFirstCandleDailyLive(desk(), { now, feedLive: true });
    },
    setTimeoutFn: (fn, ms) => {
      timers.push({ fn, ms });
      return timers.length;
    },
    clearTimeoutFn: () => undefined,
  });
  assert.equal(fires.length, 0);
  assert.equal(timers.length, 1);
  assert.equal(timers[0].ms, FRI_0900 - FRI_0859);
  now = FRI_0900;
  await timers[0].fn();
  assert.equal(fires.length, 1);
  assert.equal(timers.length, 2);
  assert.equal(timers[1].ms, MON_0900 - FRI_0900);
  stop();
});
