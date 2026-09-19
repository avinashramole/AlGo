import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nifty-opt-hist-"));
process.env.T2S_NIFTY_OPTION_HISTORY_DIR = dir;

const {
  downloadOptionHistoryRange,
  listStoredDays,
  loadDay,
  optionBacktestWindow,
  optionExpiryForSession,
  optionHistoryCoverage,
  optionLtpAt,
  recordLiveChainSnapshot,
  slotEpoch,
  wipeOptionHistory,
} = await import("./niftyOptionHistory.js");
const { runNiftyVwapBacktest } = await import("./niftyVwap/BacktestAdapter.js");
const { defaultNiftyVwapAlgo } = await import("./niftyVwap/config.js");
const { runNiftyVwapHedgeBacktest } = await import("./niftyVwapHedge/BacktestAdapter.js");
const { defaultNiftyVwapHedgeAlgo } = await import("./niftyVwapHedge/config.js");

const T0 = Date.parse("2026-08-21T03:45:00.000Z"); // 09:15 IST Friday
const BAR = 5 * 60 * 1000;

function bar(i, close, extras = {}) {
  return {
    time: T0 + i * BAR,
    open: extras.open ?? close - 2,
    high: extras.high ?? close + 3,
    low: extras.low ?? close - 3,
    close,
    volume: extras.volume ?? 1000,
  };
}

test("same 5m IST slot replaces the previous live snapshot", () => {
  wipeOptionHistory();
  const first = recordLiveChainSnapshot({
    symbol: "NIFTY",
    expiry: "2026-08-25",
    spot: 24800,
    rows: [{ strike: 24800, callLtp: 110, putLtp: 90, callId: 111, putId: 222, atm: true }],
    at: T0 + 61_000,
  });
  const second = recordLiveChainSnapshot({
    symbol: "NIFTY",
    expiry: "2026-08-25",
    spot: 24820,
    rows: [{ strike: 24800, callLtp: 125, putLtp: 80, callId: 111, putId: 222, atm: true }],
    at: T0 + 180_000,
  });
  assert.equal(first.slots.length, 1);
  assert.equal(second.slots.length, 1);
  assert.equal(second.slots[0].at, slotEpoch(T0, 5));
  assert.equal(second.slots[0].rows[0].ce, 125);
  assert.equal(optionLtpAt({ symbol: "NIFTY", time: T0 + 120_000, strike: 24800, side: "CE" }), 125);
});

test("backtest download overwrites already stored days in the selected range", async () => {
  wipeOptionHistory();
  recordLiveChainSnapshot({
    symbol: "NIFTY",
    expiry: "2026-08-25",
    spot: 24800,
    rows: [{ strike: 24800, callLtp: 40, putLtp: 40, atm: true }],
    at: T0,
  });
  assert.equal(loadDay("NIFTY", "2026-08-21").source, "snapshot");

  const candles = [bar(0, 24800), bar(1, 24810)];
  const result = await downloadOptionHistoryRange({
    symbol: "NIFTY",
    from: "2026-08-21",
    to: "2026-08-21",
    candles,
    overwrite: true,
    lookupId: async ({ strike, option }) => (option === "CE" ? `ce-${strike}` : `pe-${strike}`),
    fetchBars: async ({ securityId }) => {
      const side = String(securityId).startsWith("ce") ? 210 : 95;
      return [
        { time: T0, open: side, high: side + 1, low: side - 1, close: side, volume: 10 },
        { time: T0 + BAR, open: side, high: side + 2, low: side - 2, close: side + 3, volume: 12 },
      ];
    },
  });

  assert.deepEqual(result.overwritten, ["2026-08-21"]);
  const day = loadDay("NIFTY", "2026-08-21");
  assert.equal(day.source, "dhan-download");
  assert.equal(day.overwritten, true);
  assert.ok(day.contracts.length >= 2);
  assert.equal(optionLtpAt({ symbol: "NIFTY", time: T0, strike: 24800, side: "CE" }), 210);
  assert.notEqual(optionLtpAt({ symbol: "NIFTY", time: T0, strike: 24800, side: "CE" }), 40);
});

test("later strategy backtests reuse stored option days instead of downloading again", async () => {
  wipeOptionHistory();
  recordLiveChainSnapshot({
    symbol: "NIFTY",
    expiry: "2026-08-25",
    spot: 24800,
    rows: [{ strike: 24800, callLtp: 55, putLtp: 44, atm: true }],
    at: T0,
  });
  let fetches = 0;
  const result = await downloadOptionHistoryRange({
    symbol: "NIFTY",
    from: "2026-08-21",
    to: "2026-08-21",
    candles: [bar(0, 24800)],
    overwrite: false,
    lookupId: async () => {
      fetches += 1;
      return "opt-1";
    },
    fetchBars: async () => {
      fetches += 1;
      return [{ time: T0, open: 9, high: 9, low: 9, close: 9, volume: 1 }];
    },
  });
  assert.equal(result.reused, true);
  assert.equal(fetches, 0);
  assert.equal(optionLtpAt({ symbol: "NIFTY", time: T0, strike: 24800, side: "CE" }), 55);
});

test("download leaves days outside the selected range untouched", async () => {
  wipeOptionHistory();
  const later = Date.parse("2026-08-24T03:45:00.000Z");
  recordLiveChainSnapshot({
    symbol: "NIFTY",
    expiry: "2026-08-25",
    spot: 24900,
    rows: [{ strike: 24900, callLtp: 77, putLtp: 66, atm: true }],
    at: later,
  });
  await downloadOptionHistoryRange({
    symbol: "NIFTY",
    from: "2026-08-21",
    to: "2026-08-21",
    candles: [bar(0, 24800)],
    overwrite: true,
    lookupId: async () => "opt-1",
    fetchBars: async () => [{ time: T0, open: 15, high: 16, low: 14, close: 15, volume: 1 }],
  });
  assert.equal(loadDay("NIFTY", "2026-08-24").slots[0].rows[0].ce, 77);
  assert.deepEqual(listStoredDays("NIFTY").includes("2026-08-24"), true);
});

test("option expiry on a Friday is the next NIFTY Tuesday", () => {
  assert.equal(optionExpiryForSession("2026-08-21", "NIFTY"), "2026-08-25");
  assert.equal(optionExpiryForSession("2026-08-25", "NIFTY"), "2026-08-25");
});

test("VWAP backtest prefers stored option LTP over synth", () => {
  wipeOptionHistory();
  const candles = [...Array.from({ length: 20 }, (_, i) => bar(i, 24800 + i * 8, { volume: 1800 })), ...Array.from({ length: 12 }, (_, i) => bar(20 + i, 24960 + i * 4, { volume: 2000 }))];
  recordLiveChainSnapshot({
    symbol: "NIFTY",
    expiry: "2026-08-25",
    spot: 24900,
    rows: [
      { strike: 24800, callLtp: 333, putLtp: 222, atm: false },
      { strike: 24850, callLtp: 333, putLtp: 222, atm: true },
      { strike: 24900, callLtp: 333, putLtp: 222, atm: false },
      { strike: 24950, callLtp: 333, putLtp: 222, atm: false },
    ],
    at: T0,
  });
  for (let i = 1; i < candles.length; i += 1) {
    recordLiveChainSnapshot({
      symbol: "NIFTY",
      expiry: "2026-08-25",
      spot: candles[i].close,
      rows: [
        { strike: 24800, callLtp: 333, putLtp: 222 },
        { strike: 24850, callLtp: 333, putLtp: 222, atm: true },
        { strike: 24900, callLtp: 333, putLtp: 222 },
        { strike: 24950, callLtp: 333, putLtp: 222 },
        { strike: 25000, callLtp: 333, putLtp: 222 },
      ],
      at: candles[i].time,
    });
  }
  const result = runNiftyVwapBacktest(defaultNiftyVwapAlgo({ name: "Stored BT" }), candles);
  assert.equal(result.optionSource, "stored");
  assert.ok(result.optionHits > 0);
  if (result.book.length) {
    assert.ok(result.book.every((row) => row.entry === 333 || row.entry === 222));
  }
});

test("hedge backtest uses stored premiums when present", () => {
  wipeOptionHistory();
  const candles = Array.from({ length: 16 }, (_, i) => bar(i * 3, 24800 + (i % 4 === 0 ? -40 : 12)));
  for (const row of candles) {
    recordLiveChainSnapshot({
      symbol: "NIFTY",
      expiry: "2026-08-25",
      spot: row.close,
      rows: [{ strike: 24800, callLtp: 180, putLtp: 70, atm: true }],
      at: row.time,
    });
  }
  const result = runNiftyVwapHedgeBacktest(defaultNiftyVwapHedgeAlgo({ name: "Stored Hedge BT" }), candles);
  assert.ok(result.optionHits > 0);
  assert.ok(result.optionSource === "stored" || result.optionSource === "mixed");
});

test("option backtest window caps 5m replay at 25 days and coverage is synth without files", () => {
  const window = optionBacktestWindow(
    defaultNiftyVwapAlgo({ name: "Cap" }),
    { from: "2025-08-21", to: "2026-08-21", days: 366 },
  );
  assert.equal(window.option, true);
  assert.equal(window.from, "2026-07-28");
  assert.equal(window.to, "2026-08-21");
  wipeOptionHistory();
  assert.equal(optionHistoryCoverage("NIFTY", "2026-08-21", "2026-08-21"), "synth");
});
