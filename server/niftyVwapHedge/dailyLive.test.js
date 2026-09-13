import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { defaultNiftyVwapHedgeAlgo } from "./config.js";
import {
  applyHedgeDailyLive,
  hedgeDailyLiveAtYmd,
  isHedgeDailyLiveWindow,
  isNseSessionDay,
  istYmd,
  loadHedgeDailyLiveArmedYmd,
  nextHedgeDailyLiveAt,
  saveHedgeDailyLiveArmedYmd,
  shouldArmHedgeDailyLive,
  startHedgeDailyLiveScheduler,
} from "./dailyLive.js";
import { normalizeAlgo, seedAlgos } from "../strategies.js";

const FRI_0929 = Date.parse("2026-08-21T03:59:00.000Z");
const FRI_0930 = Date.parse("2026-08-21T04:00:00.000Z");
const FRI_0931 = Date.parse("2026-08-21T04:01:00.000Z");
const SAT_0930 = Date.parse("2026-08-22T04:00:00.000Z");
const MON_0930 = Date.parse("2026-08-24T04:00:00.000Z");

function desk(patch = {}) {
  const seeded = seedAlgos();
  return seeded.map((row) => ({ ...row, ...(patch[row.id] || {}) }));
}

test("09:30 IST window is only weekdays at that minute", () => {
  assert.equal(isNseSessionDay(new Date(FRI_0930)), true);
  assert.equal(isNseSessionDay(new Date(SAT_0930)), false);
  assert.equal(isHedgeDailyLiveWindow(FRI_0929), false);
  assert.equal(isHedgeDailyLiveWindow(FRI_0930), true);
  assert.equal(isHedgeDailyLiveWindow(FRI_0931), false);
  assert.equal(isHedgeDailyLiveWindow(SAT_0930), false);
  assert.equal(shouldArmHedgeDailyLive({ now: FRI_0930 }), true);
  assert.equal(shouldArmHedgeDailyLive({ now: FRI_0930, lastArmedYmd: "2026-08-21" }), false);
});

test("next 09:30 IST skips the current instant, weekends, and already-passed slots", () => {
  assert.equal(nextHedgeDailyLiveAt(FRI_0929), FRI_0930);
  assert.equal(nextHedgeDailyLiveAt(FRI_0930), MON_0930);
  assert.equal(nextHedgeDailyLiveAt(FRI_0931), MON_0930);
  assert.equal(nextHedgeDailyLiveAt(SAT_0930), MON_0930);
  assert.equal(hedgeDailyLiveAtYmd("2026-08-24"), MON_0930);
});

test("daily LIVE arms only NIFTY 15m VWAP hedge and leaves other algos paused", () => {
  const algos = desk();
  const result = applyHedgeDailyLive(algos, { now: FRI_0930, feedLive: true });
  assert.equal(result.reason, "armed");
  assert.deepEqual(result.armedIds, ["a6"]);
  assert.equal(result.lastArmedYmd, "2026-08-21");
  assert.equal(result.algos.find((row) => row.id === "a4").enabled, false);
  assert.equal(result.algos.find((row) => row.id === "a5").enabled, false);
  const hedge = result.algos.find((row) => row.id === "a6");
  assert.equal(hedge.enabled, true);
  assert.equal(hedge.status, "LIVE");
});

test("daily LIVE does not arm on boot, after hours, weekends, or without Dhan LIVE", () => {
  const algos = desk();
  assert.equal(applyHedgeDailyLive(algos, { now: FRI_0929, feedLive: true }).reason, "not-window");
  assert.equal(applyHedgeDailyLive(algos, { now: SAT_0930, feedLive: true }).reason, "not-window");
  assert.equal(applyHedgeDailyLive(algos, { now: FRI_0931, feedLive: true }).reason, "not-window");
  const noFeed = applyHedgeDailyLive(algos, { now: FRI_0930, feedLive: false });
  assert.equal(noFeed.reason, "dhan-not-live");
  assert.equal(noFeed.algos.find((row) => row.id === "a6").enabled, false);
  assert.equal(noFeed.lastArmedYmd, "");
});

test("daily LIVE does not re-arm the same IST day after a pause", () => {
  const first = applyHedgeDailyLive(desk(), { now: FRI_0930, feedLive: true });
  const paused = first.algos.map((row) => (row.id === "a6" ? { ...row, enabled: false, status: "PAUSED" } : row));
  const again = applyHedgeDailyLive(paused, {
    now: FRI_0930,
    feedLive: true,
    lastArmedYmd: first.lastArmedYmd,
  });
  assert.equal(again.reason, "already-armed");
  assert.equal(again.algos.find((row) => row.id === "a6").enabled, false);
});

test("paper and backtest hedge algos stay off at 09:30", () => {
  const paper = {
    ...defaultNiftyVwapHedgeAlgo({ name: "Paper hedge", runMode: "paper" }),
    id: "h-paper",
  };
  const backtest = {
    ...defaultNiftyVwapHedgeAlgo({ name: "BT hedge", runMode: "backtest" }),
    id: "h-bt",
    enabled: false,
    status: "BACKTEST",
  };
  const result = applyHedgeDailyLive([paper, backtest], { now: FRI_0930, feedLive: true });
  assert.equal(result.reason, "already-live");
  assert.deepEqual(result.armedIds, []);
  assert.equal(result.algos[0].enabled, false);
  assert.equal(result.algos[1].enabled, false);
});

test("hydrate/normalize still seed the hedge paused — 09:30 is a separate clock", () => {
  const created = normalizeAlgo(defaultNiftyVwapHedgeAlgo({ name: "Hedge Desk", runMode: "live" }));
  assert.equal(created.enabled, false);
  assert.notEqual(created.status, "LIVE");
  const seeded = seedAlgos();
  assert.equal(seeded.find((row) => row.id === "a6").enabled, false);
  const boot = applyHedgeDailyLive(seeded, { now: Date.parse("2026-08-21T02:30:00.000Z"), feedLive: true });
  assert.equal(boot.reason, "not-window");
  assert.equal(boot.algos.find((row) => row.id === "a6").enabled, false);
});

test("armed ymd persists only for a successful 09:30 window", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "t2s-hedge-daily-"));
  const file = path.join(dir, "hedge-daily-live.json");
  process.env.T2S_HEDGE_DAILY_LIVE_FILE = file;
  try {
    assert.equal(loadHedgeDailyLiveArmedYmd(), "");
    assert.equal(saveHedgeDailyLiveArmedYmd(istYmd(new Date(FRI_0930))), "2026-08-21");
    assert.equal(loadHedgeDailyLiveArmedYmd(), "2026-08-21");
  } finally {
    delete process.env.T2S_HEDGE_DAILY_LIVE_FILE;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("scheduler waits for the next 09:30 and does not arm on start", async () => {
  let now = FRI_0929;
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
  assert.equal(timers[0].ms, FRI_0930 - FRI_0929);
  now = FRI_0930;
  await timers[0].fn();
  assert.equal(fires.length, 1);
  assert.equal(timers.length, 2);
  assert.equal(timers[1].ms, MON_0930 - FRI_0930);
  stop();
});
