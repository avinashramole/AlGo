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
  assert.equal(rows.length, 1);
  assert.equal(rows[0].action, "BUY");
  assert.equal(rows[0].symbol, "NIFTY 24500 CE");
  assert.equal(rows.some((row) => row.action === "WAIT"), false);
  assert.equal(rows.some((row) => row.action === "SELL"), false);
});

test("preview wait and hold lastSignals stay off the live book", () => {
  const quiet = buildLiveSignals({
    algos: [
      { id: "a11", name: "nifty test", kind: "nifty-test", enabled: true, lastSignal: "NO SIGNAL", symbol: "NIFTY" },
      {
        id: "a11c",
        name: "NIFTY",
        enabled: true,
        lastSignal: "PREVIEW NIFTY FUT RED PE 22600 GREEN O 22589.00 C 22584.00 · BUY PE 22600",
        symbol: "NIFTY",
      },
      { id: "a12", name: "CRUDE OIL", lastSignal: "WAIT ORDER · PREVIEW CRUDE FUT GREEN", symbol: "CRUDEOIL", status: "LIVE" },
      { id: "a10", name: "TEST1", lastSignal: "WAIT", symbol: "NIFTY", status: "LIVE" },
    ],
  });
  assert.equal(quiet.length, 0);
});

test("algo live book keeps only the two newest BUY or SELL fills", () => {
  const rows = buildLiveSignals({
    algos: [
      { id: "a10", name: "NIFTY", lastSignal: "WAIT 5m CLOSE", symbol: "NIFTY", enabled: true, status: "LIVE" },
      { id: "a12", name: "CRUDE OIL", lastSignal: "HOLD PE 6100", symbol: "CRUDEOIL", enabled: true, status: "LIVE" },
      {
        id: "a15",
        name: "Multi-Index",
        lastSignal: "NO TRADE · NIFTY GREEN CE RED PE DOJI",
        symbol: "NIFTY",
        enabled: true,
        status: "PAPER",
      },
    ],
    orders: [
      { id: "o1", symbol: "NIFTY 24500 CE", side: "BUY", status: "FILLED", strategy: "NIFTY", createdAt: "2026-10-09T03:30:00.000Z" },
      { id: "o2", symbol: "NIFTY 22500 CE", side: "BUY", status: "FILLED", strategy: "NIFTY", createdAt: "2026-10-09T04:00:00.000Z" },
      { id: "o3", symbol: "NIFTY 22600 CE", side: "BUY", status: "FILLED", strategy: "NIFTY", createdAt: "2026-10-09T04:05:00.000Z" },
      { id: "o4", symbol: "NIFTY 22500 PE", side: "SELL", status: "FILLED", strategy: "NIFTY", createdAt: "2026-10-09T04:10:00.000Z" },
      { id: "o5", symbol: "NIFTY 22550 CE", side: "BUY", status: "FILLED", strategy: "NIFTY", createdAt: "2026-10-09T04:15:00.000Z" },
    ],
  });
  assert.equal(rows.length, 2);
  assert.equal(rows[0].symbol, "NIFTY 22550 CE");
  assert.equal(rows[0].action, "BUY");
  assert.equal(rows[1].symbol, "NIFTY 22500 PE");
  assert.equal(rows[1].action, "SELL");
  assert.equal(rows.some((row) => row.action === "WAIT"), false);
  assert.equal(rows.some((row) => row.action === "HOLD"), false);
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
