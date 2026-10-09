import assert from "node:assert/strict";
import test from "node:test";
import {
  buildFeaturedSignal,
  buildLiveDna,
  buildLiveSignals,
  emptyFeaturedSignal,
  signalAction,
} from "./liveSignals.js";

test("signalAction reads BUY or SELL from lastSignal text", () => {
  assert.equal(signalAction("BUY CE 24500"), "BUY");
  assert.equal(signalAction("HEDGE BUY PE 24450 2 LOT"), "BUY");
  assert.equal(signalAction("WAIT 15m CLOSE"), "");
  assert.equal(signalAction("HOLD"), "");
});

test("buildLiveSignals uses desk orders and skips rejected rows", () => {
  const rows = buildLiveSignals({
    algos: [{ id: "a6", name: "NIFTY 15m VWAP hedge", lastSignal: "WAIT 15m CLOSE", status: "PAUSED" }],
    orders: [
      {
        id: "o1",
        symbol: "NIFTY 24500 CE",
        side: "BUY",
        status: "FILLED",
        strategy: "NIFTY 15m VWAP hedge",
        createdAt: "2026-09-11T04:00:00.000Z",
      },
      { id: "o2", symbol: "NIFTY 24600 PE", side: "SELL", status: "REJECTED", strategy: "NIFTY 15m VWAP hedge" },
    ],
  });
  assert.equal(rows.filter((row) => row.id.startsWith("ord-")).length, 1);
  assert.equal(rows.some((row) => row.action === "BUY" && row.symbol === "NIFTY 24500 CE"), true);
  assert.equal(rows.some((row) => row.action === "WAIT"), true);
  assert.equal(rows.some((row) => row.action === "SELL"), false);
});

test("nifty test does not show BUY in the signal feed unless that side just fired", () => {
  const quiet = buildLiveSignals({
    algos: [
      { id: "a11", name: "nifty test", kind: "nifty-test", enabled: true, lastSignal: "NO SIGNAL", symbol: "NIFTY" },
      {
        id: "a11b",
        name: "nifty test",
        kind: "nifty-test",
        enabled: false,
        lastSignal: "BUY",
        symbol: "NIFTY",
      },
      {
        id: "a11c",
        name: "nifty test",
        kind: "nifty-test",
        enabled: true,
        lastSignal: "Preview green + break high → BUY NIFTY FUT",
        symbol: "NIFTY",
      },
    ],
  });
  assert.equal(quiet.length, 0);
  const live = buildLiveSignals({
    algos: [{ id: "a11", name: "nifty test", kind: "nifty-test", enabled: true, lastSignal: "BUY", symbol: "NIFTY" }],
  });
  assert.equal(live.length, 1);
  assert.equal(live[0].action, "BUY");
  assert.equal(live[0].strategy, "nifty test");
});

test("algo live book keeps wait hold and every distinct fill", () => {
  const rows = buildLiveSignals({
    algos: [
      { id: "a10", name: "NIFTY", lastSignal: "WAIT 5m CLOSE", symbol: "NIFTY", enabled: true, status: "LIVE" },
      { id: "a12", name: "CRUDE OIL", lastSignal: "HOLD PE 6100", symbol: "CRUDEOIL", enabled: true, status: "LIVE" },
      {
        id: "a15",
        name: "Multi-Index Reversal Strategy",
        lastSignal: "NO TRADE · NIFTY GREEN CE RED PE DOJI",
        symbol: "NIFTY",
        enabled: true,
        status: "PAPER",
      },
    ],
    orders: [
      { id: "o1", symbol: "NIFTY 24500 CE", side: "BUY", status: "FILLED", strategy: "NIFTY", createdAt: "2026-10-09T03:30:00.000Z" },
      { id: "o2", symbol: "NIFTY 24500 CE", side: "BUY", status: "FILLED", strategy: "NIFTY", createdAt: "2026-10-09T04:00:00.000Z" },
      { id: "o3", symbol: "CRUDEOIL 6100 PE", side: "BUY", status: "FILLED", strategy: "CRUDE OIL", createdAt: "2026-10-09T04:05:00.000Z" },
      { id: "o4", symbol: "NIFTY 24600 PE", side: "BUY", status: "PARTIAL", strategy: "TEST1", createdAt: "2026-10-09T04:10:00.000Z" },
      { id: "o5", symbol: "BANKNIFTY 52000 CE", side: "SELL", status: "FILLED", strategy: "TEST2", createdAt: "2026-10-09T04:15:00.000Z" },
    ],
  });
  assert.ok(rows.length >= 8);
  assert.equal(rows.filter((row) => row.id.startsWith("ord-")).length, 5);
  assert.equal(rows.some((row) => row.action === "WAIT"), true);
  assert.equal(rows.some((row) => row.action === "HOLD"), true);
  assert.equal(rows.some((row) => row.note && /NO TRADE/.test(row.note)), true);
});

test("featured signal is empty until a live BUY or SELL exists", () => {
  assert.equal(buildFeaturedSignal([]).symbol, "");
  assert.equal(emptyFeaturedSignal().confidence, 0);
  const featured = buildFeaturedSignal(
    [{ action: "BUY", symbol: "NIFTY 24500 CE", strategy: "NIFTY VWAP ATM", confidence: 90 }],
    { expiryLabel: "Tue, 15 Sep 2026" },
    [{ label: "Trend", value: 62 }],
  );
  assert.equal(featured.symbol, "NIFTY 24500 CE");
  assert.equal(featured.expiry, "Tue, 15 Sep 2026");
  assert.equal(featured.risk, "LOW");
});

test("live DNA stays in 0-100 from index and option tape", () => {
  const dna = buildLiveDna({
    indices: [
      { symbol: "NIFTY 50", change: 80, changePct: 0.4 },
      { symbol: "INDIA VIX", price: 12 },
    ],
    optionChain: [
      { callOi: 100, putOi: 80, callVol: 40, putVol: 20 },
    ],
  });
  assert.equal(dna.length, 6);
  assert.ok(dna.every((row) => row.value >= 0 && row.value <= 100));
});
