import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "t2s-purge-deleted-"));
process.env.T2S_ALGOS_FILE = path.join(dir, "algos.json");
process.env.T2S_MEMBER_DESK_FILE = path.join(dir, "member-desk.json");
process.env.T2S_PAYMENTS_FILE = path.join(dir, "payments.json");
process.env.T2S_ENROLL_FILE = path.join(dir, "enrollments.json");
process.env.T2S_BROKER_SESSIONS_FILE = path.join(dir, "broker-sessions.json");
process.env.T2S_BACKTEST_REPORT_DIR = path.join(dir, "backtests");

fs.writeFileSync(
  process.env.T2S_ALGOS_FILE,
  `${JSON.stringify({
    algos: [
      {
        id: "a4",
        name: "NIFTY VWAP ATM",
        kind: "nifty-vwap",
        symbol: "NIFTY",
        runMode: "live",
        enabled: false,
        status: "PAUSED",
      },
      {
        id: "a10",
        name: "NIFTY 5m first candle",
        kind: "nifty-first-candle",
        symbol: "NIFTY",
        runMode: "live",
        enabled: false,
        status: "PAUSED",
      },
    ],
    removedIds: [],
  })}\n`,
);
fs.writeFileSync(
  process.env.T2S_ENROLL_FILE,
  `${JSON.stringify([
    { id: "e-gone", userId: "u1", strategyId: "a4", strategyName: "NIFTY VWAP ATM", status: "paid" },
    { id: "e-keep", userId: "u1", strategyId: "a10", strategyName: "NIFTY 5m first candle", status: "paid" },
  ])}\n`,
);
fs.writeFileSync(
  process.env.T2S_MEMBER_DESK_FILE,
  `${JSON.stringify({
    u1: {
      brokerToken: "member-token-must-stay",
      mappedStrategy: "NIFTY VWAP ATM",
      orders: [
        { strategy: "NIFTY VWAP ATM", symbol: "NIFTY 24600 CE" },
        { strategy: "NIFTY 5m first candle", symbol: "NIFTY 24700 CE" },
      ],
      positions: [
        { strategy: "NIFTY VWAP ATM", symbol: "NIFTY 24600 CE" },
        { strategy: "NIFTY 5m first candle", symbol: "NIFTY 24700 CE" },
      ],
      alerts: [
        { text: "Copied BUY 65 NIFTY 24600 CE · NIFTY VWAP ATM · FILLED" },
        { text: "Copied BUY 65 NIFTY 24700 CE · NIFTY 5m first candle · FILLED" },
      ],
    },
  })}\n`,
);

const { listAlgos, purgeStrategiesNotOnDesk } = await import("./market.js");
const { listEnrollments } = await import("./subscriptions.js");
const { loadBacktestReport, saveBacktestReport } = await import("./backtestReport.js");
const { TradeLogger } = await import("./niftyVwap/TradeLogger.js");

test("a deleted strategy is removed from the admin catalog and every user desk", () => {
  assert.equal(listAlgos().some((row) => row.name === "NIFTY VWAP ATM"), false);
  assert.equal(listAlgos().some((row) => row.id === "a10"), true);

  const dummy = {
    ranAt: new Date().toISOString(),
    pnl: 1,
    trades: 1,
    wins: 1,
    losses: 0,
    winRate: 100,
    maxDrawdown: 0,
    tradesBook: [{ day: "2026-10-16", side: "BUY", symbol: "NIFTY", entry: 100, exit: 101, qty: 1, pnl: 1 }],
  };
  saveBacktestReport({ id: "a4", name: "NIFTY VWAP ATM", kind: "nifty-vwap", symbol: "NIFTY" }, dummy);
  saveBacktestReport({ id: "gone-ind", name: "My RSI", kind: "indicator", symbol: "NIFTY" }, dummy);
  saveBacktestReport({ id: "a10", name: "NIFTY 5m first candle", kind: "nifty-first-candle", symbol: "NIFTY" }, dummy);
  TradeLogger.record("entry", { strategy: "NIFTY VWAP ATM", symbol: "NIFTY" });
  TradeLogger.record("entry", { strategy: "My RSI", symbol: "NIFTY" });
  TradeLogger.record("entry", { strategy: "NIFTY 5m first candle", symbol: "NIFTY" });
  assert.ok(loadBacktestReport("a4"));
  assert.ok(loadBacktestReport("gone-ind"));
  assert.ok(loadBacktestReport("a10"));

  const result = purgeStrategiesNotOnDesk();
  assert.equal(result.strategies.includes("a10"), true);
  assert.equal(result.strategies.includes("a4"), false);
  assert.equal(loadBacktestReport("a4"), null);
  assert.equal(loadBacktestReport("gone-ind"), null);
  assert.ok(loadBacktestReport("a10"));
  assert.equal(TradeLogger.lines.some((row) => row.strategy === "NIFTY VWAP ATM"), false);
  assert.equal(TradeLogger.lines.some((row) => row.strategy === "My RSI"), false);
  assert.equal(TradeLogger.lines.some((row) => row.strategy === "NIFTY 5m first candle"), true);

  const plans = listEnrollments({ userId: "u1" });
  assert.equal(plans.some((row) => row.strategyName === "NIFTY VWAP ATM"), false);
  assert.equal(plans.some((row) => row.strategyId === "a10"), true);

  const saved = JSON.parse(fs.readFileSync(process.env.T2S_MEMBER_DESK_FILE, "utf8"));
  const desk = saved.u1;
  assert.equal(desk.brokerToken, "member-token-must-stay");
  assert.equal(desk.mappedStrategy, "");
  assert.deepEqual(desk.orders.map((row) => row.symbol), ["NIFTY 24700 CE"]);
  assert.deepEqual(desk.positions.map((row) => row.symbol), ["NIFTY 24700 CE"]);
  assert.equal(desk.alerts.some((row) => String(row.text).includes("NIFTY VWAP ATM")), false);
  assert.equal(desk.alerts.some((row) => String(row.text).includes("NIFTY 5m first candle")), true);

  const stored = JSON.parse(fs.readFileSync(process.env.T2S_ALGOS_FILE, "utf8"));
  assert.equal(stored.algos.some((row) => row.id === "a4"), false);
  assert.equal(stored.algos.some((row) => row.id === "a10"), true);
});
