import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "t2s-index-hist-"));
process.env.T2S_INDEX_HISTORY_DIR = dir;

const {
  aggregateIndexBars,
  ensureIndexHistory,
  ensureReplayBars,
  inferBarTimeframe,
  missingDayWindows,
  saveIndexBars,
  shiftYmd,
  storedIndexCoverage,
  wipeIndexHistory,
} = await import("./indexHistory.js");
const {
  pickBacktestTimeframe,
  backtestAlgo,
  createAlgo,
  deleteAlgo,
  clampBacktestYears,
  clampBacktestMonths,
  resolveBacktestWindow,
  monthStartYmd,
  ymdIST,
  backtestWindowLabel,
} = await import("./market.js");

const T0 = Date.parse("2026-08-21T03:45:00.000Z"); // 09:15 IST
const MIN = 60 * 1000;

function bars(count, stepMin, start = 24800) {
  return Array.from({ length: count }, (_, i) => {
    const close = start + Math.sin(i / 3) * 20 + i * 0.4;
    return {
      time: T0 + i * stepMin * MIN,
      open: close - 2,
      high: close + 3,
      low: close - 3,
      close,
      volume: 1000 + i,
    };
  });
}

test("1 year backtest keeps the strategy timeframe instead of forcing 1H", () => {
  assert.equal(pickBacktestTimeframe("5m", 365), "5m");
  assert.equal(pickBacktestTimeframe("15m", 365), "15m");
  assert.equal(pickBacktestTimeframe("1H", 365), "1H");
  assert.equal(pickBacktestTimeframe("1m", 365), "1m");
  assert.equal(pickBacktestTimeframe("1m", 10), "1m");
  assert.equal(pickBacktestTimeframe("2m", 365), "2m");
  assert.equal(pickBacktestTimeframe("10m", 90), "10m");
  assert.equal(pickBacktestTimeframe("5m", 3650), "5m");
});

test("backtest years input defaults to 10 and rejects more than 10 years", () => {
  assert.equal(clampBacktestYears(), 10);
  assert.equal(clampBacktestYears(3), 3);
  assert.equal(clampBacktestYears(99), 10);
  assert.equal(clampBacktestYears(0), 1);
  const ten = resolveBacktestWindow({ range: "years" });
  assert.equal(ten.years, 10);
  assert.equal(ten.range, "years");
  assert.equal(ten.error, undefined);
  const one = resolveBacktestWindow({ range: "1y" });
  assert.equal(one.years, 1);
  assert.equal(one.range, "1y");
  const three = resolveBacktestWindow({ years: 3 });
  assert.equal(three.years, 3);
  const tooLong = resolveBacktestWindow({ range: "custom", from: "2010-01-01", to: "2026-10-07" });
  assert.match(String(tooLong.error || ""), /10 years/i);
});

test("backtest default window is this calendar month through today", () => {
  const today = ymdIST();
  const month = resolveBacktestWindow({});
  assert.equal(month.range, "month");
  assert.equal(month.from, monthStartYmd(today));
  assert.equal(month.to, today);
  assert.equal(month.years, undefined);
  assert.equal(month.error, undefined);
  assert.match(backtestWindowLabel(month), /this month/);
  const threeMonths = resolveBacktestWindow({ range: "months", months: 3 });
  assert.equal(threeMonths.range, "months");
  assert.equal(threeMonths.months, 3);
  assert.equal(clampBacktestMonths(6), 6);
  assert.equal(clampBacktestMonths(99), 12);
  const oneDay = resolveBacktestWindow({ range: "custom", from: today, to: today });
  assert.equal(oneDay.error, undefined);
  assert.equal(oneDay.days, 1);
});

test("stored 5m bars aggregate to 15m and a second backtest reuses disk", async () => {
  wipeIndexHistory();
  const raw = bars(75, 5);
  saveIndexBars("NIFTY", raw, { overwrite: true });
  assert.equal(inferBarTimeframe(raw), "5m");
  const first = await ensureIndexHistory({
    symbol: "NIFTY",
    from: "2026-08-21",
    to: "2026-08-21",
    timeframe: "15m",
    overwrite: false,
    fetchRange: async () => {
      throw new Error("should not fetch when stored");
    },
  });
  assert.equal(first.reused, true);
  assert.equal(first.source, "stored");
  assert.ok(first.candles.length > 0);
  assert.ok(first.candles.length < raw.length);
  assert.equal((await storedIndexCoverage("NIFTY", "2026-08-21", "2026-08-21", "5m")).fineEnough, true);

  let fetches = 0;
  const second = await ensureIndexHistory({
    symbol: "NIFTY",
    from: "2026-08-21",
    to: "2026-08-21",
    timeframe: "5m",
    overwrite: false,
    fetchRange: async () => {
      fetches += 1;
      return raw;
    },
  });
  assert.equal(fetches, 0);
  assert.equal(second.reused, true);
  assert.equal(second.candles.length, raw.length);
});

test("90-day first download uses 30-day chunks then the next backtest reuses disk", async () => {
  wipeIndexHistory();
  let calls = 0;
  const inflight = { now: 0, peak: 0 };
  const first = await ensureIndexHistory({
    symbol: "NIFTY",
    from: "2026-01-05",
    to: "2026-04-04",
    timeframe: "5m",
    overwrite: false,
    fetchRange: async ({ from, to }) => {
      calls += 1;
      inflight.now += 1;
      inflight.peak = Math.max(inflight.peak, inflight.now);
      await new Promise((resolve) => setImmediate(resolve));
      inflight.now -= 1;
      const rows = [];
      let cur = from;
      while (cur <= to) {
        const weekday = new Date(`${cur}T12:00:00+05:30`).getUTCDay();
        if (weekday !== 0 && weekday !== 6) {
          for (let i = 0; i < 6; i += 1) {
            rows.push({
              time: Date.parse(`${cur}T03:45:00.000Z`) + i * 5 * 60_000,
              open: 24000 + i,
              high: 24010 + i,
              low: 23990 + i,
              close: 24005 + i,
              volume: 1000,
            });
          }
        }
        cur = shiftYmd(cur, 1);
      }
      return rows;
    },
  });
  assert.equal(calls, 3);
  assert.ok(inflight.peak >= 2);
  assert.equal(first.reused, false);
  assert.ok(first.candles.length > 0);
  let extra = 0;
  const second = await ensureIndexHistory({
    symbol: "NIFTY",
    from: "2026-01-05",
    to: "2026-04-04",
    timeframe: "15m",
    overwrite: false,
    fetchRange: async () => {
      extra += 1;
      throw new Error("should reuse stored 5m");
    },
  });
  assert.equal(extra, 0);
  assert.equal(second.reused, true);
  assert.equal((await storedIndexCoverage("NIFTY", "2026-01-05", "2026-04-04", "5m")).fineEnough, true);
});

test("EMA 5m and 15m backtests on the same stored year do not match", async () => {
  wipeIndexHistory();
  const raw = bars(240, 5);
  const five = aggregateIndexBars(raw, "5m");
  const fifteen = aggregateIndexBars(raw, "15m");
  assert.ok(fifteen.length < five.length);
  const stamp = Date.now();
  const ema5 = createAlgo({
    name: `EMA 5 ${stamp}`,
    kind: "indicator",
    indicator: "EMA",
    timeframe: "5m",
    runMode: "backtest",
    fast: 9,
    slow: 21,
  });
  const ema15 = createAlgo({
    name: `EMA 15 ${stamp}`,
    kind: "indicator",
    indicator: "EMA",
    timeframe: "15m",
    runMode: "backtest",
    fast: 9,
    slow: 21,
  });
  try {
    const a = await backtestAlgo(ema5.id, {
      range: "custom",
      from: "2026-08-21",
      to: "2026-08-24",
      candles: five,
      candleSource: "stored",
      reused: true,
    });
    const b = await backtestAlgo(ema15.id, {
      range: "custom",
      from: "2026-08-21",
      to: "2026-08-24",
      candles: fifteen,
      candleSource: "stored",
      reused: true,
    });
    assert.equal(a.ok, true);
    assert.equal(b.ok, true);
    assert.equal(a.backtest.timeframe, "5m");
    assert.equal(b.backtest.timeframe, "15m");
    assert.notEqual(a.backtest.bars, b.backtest.bars);
    assert.equal(
      a.backtest.pnl === b.backtest.pnl && a.backtest.trades === b.backtest.trades,
      false,
    );
  } finally {
    deleteAlgo(ema5.id);
    deleteAlgo(ema15.id);
  }
});

test("stored 1m bars build 2m 5m 10m and 15m and a later replay reuses disk", async () => {
  wipeIndexHistory();
  const raw = bars(75, 1);
  saveIndexBars("NIFTY", raw, { overwrite: true });
  assert.equal(inferBarTimeframe(raw), "1m");
  const two = aggregateIndexBars(raw, "2m");
  const five = aggregateIndexBars(raw, "5m");
  const ten = aggregateIndexBars(raw, "10m");
  const fifteen = aggregateIndexBars(raw, "15m");
  assert.ok(two.length < raw.length);
  assert.ok(five.length < two.length);
  assert.ok(ten.length < five.length);
  assert.ok(fifteen.length <= ten.length);
  let fetches = 0;
  const replay = await ensureReplayBars({
    symbol: "NIFTY",
    from: "2026-08-21",
    to: "2026-08-21",
    timeframe: "5m",
    fetchRange: async () => {
      fetches += 1;
      throw new Error("should reuse stored 1m");
    },
  });
  assert.equal(fetches, 0);
  assert.equal(replay.reused, true);
  assert.equal(replay.storedTf, "1m");
  assert.equal(replay.candles.length, five.length);
  assert.equal((await storedIndexCoverage("NIFTY", "2026-08-21", "2026-08-21", "1m")).fineEnough, true);
});

test("1m download uses 30-day chunks for a 40-day gap", async () => {
  wipeIndexHistory();
  let calls = 0;
  const first = await ensureIndexHistory({
    symbol: "BANKNIFTY",
    from: "2026-01-05",
    to: "2026-02-13",
    timeframe: "1m",
    overwrite: false,
    fetchRange: async ({ from, to, timeframe }) => {
      calls += 1;
      assert.equal(timeframe, "1m");
      const span = Math.round((Date.parse(`${to}T12:00:00+05:30`) - Date.parse(`${from}T12:00:00+05:30`)) / 86_400_000) + 1;
      assert.ok(span <= 30, `chunk ${from} ${to} was ${span} days`);
      return bars(30, 1);
    },
  });
  assert.equal(calls, 2);
  assert.equal(first.reused, false);
  assert.ok(first.written.length > 0);
});

test("missing 1m days are fetched in 30-day windows and complete days stay on disk", async () => {
  wipeIndexHistory();
  saveIndexBars(
    "NIFTY",
    [0, 1].map((i) => ({
      time: Date.parse("2026-01-05T03:45:00.000Z") + i * 60_000,
      open: 24000 + i,
      high: 24010 + i,
      low: 23990 + i,
      close: 24005 + i,
      volume: 10,
    })),
    { overwrite: true },
  );
  const windows = missingDayWindows(["2026-01-06", "2026-01-07", "2026-02-10"], 30);
  assert.equal(windows.length, 2);
  assert.equal(windows[0].from, "2026-01-06");
  assert.equal(windows[1].from, "2026-02-10");
  let calls = 0;
  await ensureIndexHistory({
    symbol: "NIFTY",
    from: "2026-01-05",
    to: "2026-01-07",
    timeframe: "1m",
    overwrite: false,
    fetchRange: async ({ from, to }) => {
      calls += 1;
      assert.notEqual(from, "2026-01-05");
      return [0, 1].map((i) => ({
        time: Date.parse(`${from}T03:45:00.000Z`) + i * 60_000,
        open: 24100 + i,
        high: 24110 + i,
        low: 24090 + i,
        close: 24105 + i,
        volume: 8,
      }));
    },
  });
  assert.equal(calls, 1);
});
