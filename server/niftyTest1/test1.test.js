import assert from "node:assert/strict";
import test from "node:test";
import { defaultNiftyTest1Algo, isNiftyTest1Algo, niftyTest1Config } from "../niftyVwap/config.js";
import { normalizeAlgo, seedAlgos } from "../strategies.js";
import { Test1SignalEngine } from "./Test1SignalEngine.js";
import { Test1Strategy } from "./Test1Strategy.js";

const T0930 = Date.parse("2026-08-21T04:00:00.000Z"); // 09:30 IST
const BAR = 5 * 60 * 1000;

function bar(open, close, extras = {}) {
  const high = extras.high ?? Math.max(open, close);
  const low = extras.low ?? Math.min(open, close);
  return {
    time: extras.time ?? T0930,
    open,
    high,
    low,
    close,
    volume: extras.volume ?? 10,
  };
}

function bookAdapter() {
  const positions = [];
  const places = [];
  return {
    positions,
    places,
    adapter: {
      place(payload) {
        places.push(payload);
        const fill = Number(payload.price);
        const row = {
          id: `p${places.length}`,
          symbol: payload.symbol,
          side: payload.side,
          qty: payload.qty,
          option: payload.option,
          strike: payload.strike,
          avg: fill,
          ltp: fill,
          strategy: payload.strategy,
        };
        positions.push(row);
        return { ok: true, avg: fill, id: row.id };
      },
      exit(position) {
        const idx = positions.findIndex((row) => row.id === position.id);
        if (idx >= 0) positions.splice(idx, 1);
        return { ok: true, id: position.id };
      },
    },
  };
}

test("TEST1 name and ATM-only config stay locked", () => {
  const algo = defaultNiftyTest1Algo({ name: "other", strikeOffset: 2, timeframe: "15m" });
  assert.equal(algo.name, "TEST1");
  assert.equal(algo.kind, "nifty-test1");
  assert.equal(algo.timeframe, "5m");
  assert.equal(algo.strikeOffset, 0);
  assert.equal(isNiftyTest1Algo({ name: "TEST1" }), true);
  const cfg = niftyTest1Config({ minBodyPct: 0.9, maxWickPct: 0.1, lots: 2 });
  assert.equal(cfg.minBodyPct, 0.9);
  assert.equal(cfg.maxWickPct, 0.1);
  assert.equal(cfg.qty, 130);
  assert.equal(cfg.startTimeIst, "09:30");
  assert.equal(cfg.symbol, "NIFTY");
  const crude = niftyTest1Config({ symbol: "CRUDEOIL", lots: 1 });
  assert.equal(crude.symbol, "CRUDEOIL");
  assert.equal(crude.lotSize, 100);
  assert.equal(crude.qty, 100);
  assert.equal(crude.expiryKind, "monthly");
  assert.equal(crude.session, "mcx");
  assert.equal(niftyTest1Config({ symbol: "NATURALGAS" }).lotSize, 1250);
  assert.equal(niftyTest1Config({ symbol: "COPPER" }).lotSize, 2500);
  assert.equal(niftyTest1Config({ symbol: "BANKNIFTY" }).lotSize, 30);
  assert.equal(niftyTest1Config({ symbol: "MIDCPNIFTY" }).step, 25);
  assert.equal(defaultNiftyTest1Algo({ symbol: "CRUDEOIL" }).symbol, "CRUDEOIL");
});

test("seed catalog includes paused TEST1", () => {
  const seeded = seedAlgos();
  const row = seeded.find((item) => item.name === "TEST1");
  assert.equal(row.kind, "nifty-test1");
  assert.equal(row.enabled, false);
  assert.equal(row.status, "PAUSED");
  assert.equal(row.strikeOffset, 0);
  assert.equal(normalizeAlgo({ name: "TEST1" }).name, "TEST1");
  assert.equal(normalizeAlgo({ name: "TEST1" }).kind, "nifty-test1");
});

test("strong green 90% body is a TEST1 signal; wick or red is not", () => {
  const strong = bar(100, 109, { high: 110, low: 100 });
  const metrics = Test1SignalEngine.isStrongGreenBody(strong);
  assert.equal(metrics.ok, true);
  assert.equal(metrics.green, true);
  assert.ok(metrics.bodyPct >= 0.9);
  assert.ok(metrics.wickPct <= 0.1);
  assert.equal(Test1SignalEngine.isStrongGreenBody(bar(100, 99, { high: 110, low: 99 })).ok, false);
  assert.equal(Test1SignalEngine.isStrongGreenBody(bar(100, 105, { high: 120, low: 90 })).ok, false);
});

test("TEST1 waits before 09:30 and buys ATM CE once on a completed strong green", () => {
  const ce = bar(100, 109, { high: 110, low: 100, time: T0930 });
  const pe = bar(80, 78, { high: 81, low: 77, time: T0930 });
  const early = Test1SignalEngine.evaluate({
    ceBars: [ce],
    peBars: [pe],
    now: T0930 - 60_000,
  });
  assert.equal(early.waitingEval, true);
  assert.equal(early.buyCe, false);
  const forming = Test1SignalEngine.evaluate({
    ceBars: [ce],
    peBars: [pe],
    now: T0930 + 60_000,
  });
  assert.equal(forming.waitingEval, false);
  assert.equal(forming.buyCe, false);
  const now = T0930 + BAR;
  const signal = Test1SignalEngine.evaluate({
    ceBars: [ce],
    peBars: [pe],
    now,
  });
  assert.equal(signal.buyCe, true);
  assert.equal(signal.buyPe, false);
  const algo = defaultNiftyTest1Algo({ name: "TEST1", enabled: true });
  const book = bookAdapter();
  const tick = Test1Strategy.tick({
    algo,
    now,
    feedLive: true,
    minutesToClose: 300,
    ceBars: [ce],
    peBars: [pe],
    ceLtp: 109,
    peLtp: 78,
    spot: 22680,
    step: 50,
    expiry: "2026-08-27",
    positions: book.positions,
    adapter: book.adapter,
  });
  assert.equal(tick.action, "entry");
  assert.equal(book.places.length, 1);
  assert.equal(book.places[0].option, "CE");
  assert.equal(book.places[0].strike, 22700);
  assert.match(book.places[0].symbol, /^NIFTY 22700 CE$/);
  assert.equal(Number(algo.vwapState.targetPrice), 118);
  assert.equal(Number(algo.vwapState.stopPrice), 100);
  const again = Test1Strategy.tick({
    algo,
    now: now + 30_000,
    feedLive: true,
    minutesToClose: 300,
    ceBars: [ce],
    peBars: [pe],
    ceLtp: 109,
    peLtp: 78,
    spot: 22680,
    step: 50,
    expiry: "2026-08-27",
    positions: book.positions,
    adapter: book.adapter,
  });
  assert.notEqual(again.action, "entry");
  assert.equal(book.places.length, 1);
});

test("TEST1 target uses actual fill and SL is the signal low", () => {
  const ce = bar(50, 59, { high: 60, low: 50, time: T0930 });
  const algo = defaultNiftyTest1Algo({ enabled: true });
  const book = bookAdapter();
  Test1Strategy.tick({
    algo,
    now: T0930 + BAR,
    feedLive: true,
    minutesToClose: 300,
    ceBars: [ce],
    peBars: [bar(40, 39, { high: 41, low: 38, time: T0930 })],
    ceLtp: 62,
    peLtp: 39,
    spot: 22700,
    step: 50,
    expiry: "2026-08-27",
    positions: book.positions,
    adapter: book.adapter,
  });
  assert.equal(Number(algo.vwapState.fillPrice), 62);
  assert.equal(Number(algo.vwapState.targetPrice), 71);
  assert.equal(Number(algo.vwapState.stopPrice), 50);
  const sl = Test1Strategy.tick({
    algo,
    now: T0930 + BAR + 60_000,
    feedLive: true,
    minutesToClose: 300,
    ceBars: [ce],
    peBars: [],
    ceLtp: 49.5,
    peLtp: 39,
    spot: 22700,
    step: 50,
    expiry: "2026-08-27",
    positions: book.positions,
    adapter: book.adapter,
  });
  assert.equal(sl.action, "exit");
  assert.equal(sl.reason, "sl");
});

test("TEST1 buys ATM PE when only PE is a strong green and locks a rejected bar", () => {
  const pe = bar(40, 49, { high: 50, low: 40, time: T0930 });
  const ce = bar(80, 79, { high: 82, low: 78, time: T0930 });
  const signal = Test1SignalEngine.evaluate({
    ceBars: [ce],
    peBars: [pe],
    now: T0930 + BAR,
  });
  assert.equal(signal.buyPe, true);
  assert.equal(signal.buyCe, false);
  const both = Test1SignalEngine.evaluate({
    ceBars: [bar(100, 109, { high: 110, low: 100, time: T0930 })],
    peBars: [bar(40, 49.5, { high: 50, low: 40, time: T0930 })],
    now: T0930 + BAR,
  });
  assert.equal(both.buyPe, true);
  assert.ok(both.bodyPct > 0.94);
  const algo = defaultNiftyTest1Algo({ enabled: true });
  const places = [];
  const adapter = {
    place(payload) {
      places.push(payload);
      return { error: "broker-down", status: "REJECTED" };
    },
    exit() {
      return { ok: true };
    },
  };
  const first = Test1Strategy.tick({
    algo,
    now: T0930 + BAR,
    feedLive: true,
    minutesToClose: 300,
    ceBars: [ce],
    peBars: [pe],
    ceLtp: 79,
    peLtp: 49,
    spot: 22680,
    step: 50,
    expiry: "2026-08-27",
    positions: [],
    adapter,
  });
  assert.equal(first.action, "rejected");
  assert.equal(places.length, 1);
  assert.equal(places[0].option, "PE");
  const again = Test1Strategy.tick({
    algo,
    now: T0930 + BAR + 30_000,
    feedLive: true,
    minutesToClose: 300,
    ceBars: [ce],
    peBars: [pe],
    ceLtp: 79,
    peLtp: 49,
    spot: 22680,
    step: 50,
    expiry: "2026-08-27",
    positions: [],
    adapter,
  });
  assert.equal(again.action, "skip");
  assert.equal(again.reason, "duplicate-bar");
  assert.equal(places.length, 1);
});

test("TEST1 exits at target from the actual fill", () => {
  const ce = bar(50, 59, { high: 60, low: 50, time: T0930 });
  const algo = defaultNiftyTest1Algo({ enabled: true });
  const book = bookAdapter();
  Test1Strategy.tick({
    algo,
    now: T0930 + BAR,
    feedLive: true,
    minutesToClose: 300,
    ceBars: [ce],
    peBars: [bar(40, 39, { high: 41, low: 38, time: T0930 })],
    ceLtp: 62,
    peLtp: 39,
    spot: 22700,
    step: 50,
    expiry: "2026-08-27",
    positions: book.positions,
    adapter: book.adapter,
  });
  const tgt = Test1Strategy.tick({
    algo,
    now: T0930 + BAR + 60_000,
    feedLive: true,
    minutesToClose: 300,
    ceBars: [ce],
    peBars: [],
    ceLtp: 71,
    peLtp: 39,
    spot: 22700,
    step: 50,
    expiry: "2026-08-27",
    positions: book.positions,
    adapter: book.adapter,
  });
  assert.equal(tgt.action, "exit");
  assert.equal(tgt.reason, "target");
});

test("TEST1 buys ATM Crude Oil when that script is selected", () => {
  const ce = bar(100, 109, { high: 110, low: 100, time: T0930 });
  const algo = defaultNiftyTest1Algo({ symbol: "CRUDEOIL", enabled: true });
  const book = bookAdapter();
  const tick = Test1Strategy.tick({
    algo,
    now: T0930 + BAR,
    feedLive: true,
    minutesToClose: 300,
    ceBars: [ce],
    peBars: [bar(80, 78, { high: 81, low: 77, time: T0930 })],
    ceLtp: 109,
    peLtp: 78,
    spot: 6124,
    step: 50,
    expiry: "2026-08-19",
    positions: book.positions,
    adapter: book.adapter,
  });
  assert.equal(tick.action, "entry");
  assert.equal(book.places[0].option, "CE");
  assert.equal(book.places[0].strike, 6100);
  assert.equal(book.places[0].symbol, "CRUDEOIL 6100 CE");
  assert.equal(book.places[0].lotSize, 100);
  assert.equal(book.places[0].qty, 100);
});
