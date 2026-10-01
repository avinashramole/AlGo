import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "t2s-intraday-"));
process.env.T2S_ALGOS_FILE = path.join(dir, "algos.json");
process.env.T2S_MEMBER_DESK_FILE = path.join(dir, "member-desk.json");
process.env.T2S_PAYMENTS_FILE = path.join(dir, "payments.json");
process.env.T2S_ENROLL_FILE = path.join(dir, "enrollments.json");
process.env.T2S_BROKER_SESSIONS_FILE = path.join(dir, "broker-sessions.json");

const strategyId = "fc-fresh";
const strategyName = "NIFTY fresh record";
const userId = "u-fresh";
const istDay = (ms) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms));
const todayKey = istDay(Date.now());
const yesterdayKey = istDay(Date.now() - 24 * 60 * 60 * 1000);
const yesterday = `${yesterdayKey}T04:00:00.000Z`;
const today = `${todayKey}T04:00:00.000Z`;

fs.writeFileSync(
  process.env.T2S_ALGOS_FILE,
  `${JSON.stringify({
    removedIds: [],
    algos: [
      {
        id: strategyId,
        name: strategyName,
        kind: "nifty-first-candle",
        indicator: "NIFTY_FIRST_CANDLE",
        symbol: "NIFTY",
        runMode: "paper",
        enabled: false,
        status: "PAUSED",
        vwapState: {
          sessionDate: todayKey,
          buyPhase: "entry",
          inFlight: true,
          exitQueued: true,
          lastEntryAt: Date.parse(yesterday),
          lastEntryBarTime: Date.parse(yesterday),
          sentSignalBarTime: Date.parse(yesterday),
          processedFirstBarTime: Date.parse(yesterday),
          sessionTrades: 2,
          fillPrice: 40,
          lockedStrike: 22600,
          lockedOption: "PE",
          lockedSymbol: "NIFTY 22600 PE",
        },
      },
    ],
  })}\n`,
);

fs.writeFileSync(
  process.env.T2S_MEMBER_DESK_FILE,
  `${JSON.stringify({
    [userId]: {
      positions: [
        { strategy: strategyName, strategyId, symbol: "NIFTY 22600 PE", qty: 65, openedAt: yesterday },
        { strategy: strategyName, strategyId, symbol: "NIFTY 22700 CE", qty: 65, openedAt: today },
        { strategy: "Other book", symbol: "NIFTY", qty: 1, openedAt: yesterday },
      ],
      closedTrades: [
        { strategy: strategyName, symbol: "NIFTY 22600 PE", closedAt: yesterday },
        { strategy: strategyName, symbol: "NIFTY 22700 CE", closedAt: today },
      ],
      orders: [{ strategy: strategyName, strategyId, side: "BUY", status: "PENDING", createdAt: yesterday }],
      orderHistory: [{ strategy: strategyName, strategyId, side: "BUY", status: "FILLED", createdAt: yesterday }],
      alerts: [
        { text: `Copied BUY 65 NIFTY 22600 PE · ${strategyName} · PENDING`, createdAt: yesterday },
        { text: `Copied BUY 65 NIFTY 22700 CE · ${strategyName} · FILLED`, createdAt: today },
      ],
    },
  })}\n`,
);

const { deleteAlgo, listAlgos, setDhanFeed, toggleAlgo } = await import("./market.js");

function desk() {
  return JSON.parse(fs.readFileSync(process.env.T2S_MEMBER_DESK_FILE, "utf8"))[userId];
}

test("stop then start begins a new record and drops the previous intraday book", () => {
  setDhanFeed({ live: true });
  try {
    const started = toggleAlgo(strategyId, { enabled: true });
    assert.equal(started.enabled, true);
    assert.equal(started.lastSignal, "WAIT");
    assert.equal(started.vwapState.buyPhase, "");
    assert.equal(started.vwapState.inFlight, false);
    assert.equal(started.vwapState.exitQueued, false);
    assert.equal(started.vwapState.lastEntryAt, 0);
    assert.equal(started.vwapState.lastEntryBarTime, 0);
    assert.equal(started.vwapState.sentSignalBarTime, 0);
    assert.equal(started.vwapState.fillPrice, 0);
    assert.equal(started.vwapState.lockedStrike, 0);
    assert.equal(started.vwapState.sessionTrades, 2);

    const saved = listAlgos().find((row) => row.id === strategyId);
    assert.equal(saved.vwapState.buyPhase, "");
    assert.equal(saved.vwapState.sessionTrades, 2);

    const book = desk();
    assert.equal(book.positions.filter((row) => row.strategy === strategyName).length, 1);
    assert.equal(book.positions.find((row) => row.strategy === strategyName).symbol, "NIFTY 22700 CE");
    assert.equal(book.positions.filter((row) => row.strategy === "Other book").length, 1);
    assert.equal(book.closedTrades.filter((row) => row.strategy === strategyName).length, 1);
    assert.equal(book.closedTrades[0].symbol, "NIFTY 22700 CE");
    assert.equal([...(book.orders || []), ...(book.orderHistory || [])].filter((row) => row.strategy === strategyName).length, 0);
    assert.equal(book.alerts.length, 1);
    assert.match(book.alerts[0].text, /22700 CE/);
  } finally {
    deleteAlgo(strategyId);
    setDhanFeed({ live: false });
  }
});
