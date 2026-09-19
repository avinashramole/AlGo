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
  inferBarTimeframe,
  saveIndexBars,
  storedIndexCoverage,
  wipeIndexHistory,
} = await import("./indexHistory.js");
const { pickBacktestTimeframe, backtestAlgo, createAlgo, deleteAlgo } = await import("./market.js");

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
  assert.equal(pickBacktestTimeframe("1m", 365), "5m");
  assert.equal(pickBacktestTimeframe("1m", 10), "1m");
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
  assert.equal(storedIndexCoverage("NIFTY", "2026-08-21", "2026-08-21", "5m").fineEnough, true);

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

test("EMA 5m and 15m backtests on the same stored year do not match", () => {
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
    const a = backtestAlgo(ema5.id, {
      range: "custom",
      from: "2026-08-21",
      to: "2026-08-24",
      candles: five,
      candleSource: "stored",
      reused: true,
    });
    const b = backtestAlgo(ema15.id, {
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
