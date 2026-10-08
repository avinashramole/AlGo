import assert from "node:assert/strict";
import test from "node:test";
import { OptionStrikeSelector } from "./OptionStrikeSelector.js";
import { RiskManager } from "./RiskManager.js";
import { TrailingStopManager } from "./TrailingStopManager.js";
import { NiftyVwapStrategy, noteBrokerRejection, noteFeedReconnect } from "./NiftyVwapStrategy.js";
import { crudeFirstCandleConfig, defaultCrudeFirstCandleAlgo, defaultNiftyFirstCandleAlgo, defaultNiftyVwapAlgo, defaultNiftyVwapReversalAlgo, isCrudeFirstCandleAlgo, isNiftyFirstCandleAlgo, isNiftyOptionEngineAlgo, isNiftyVwapAlgo, isNiftyVwapReversalAlgo, niftyFirstCandleConfig, niftyVwapConfig, niftyVwapReversalConfig } from "./config.js";
import { VwapSignalEngine, completedCandles, firstFuturesBias, lastBarVwapReversal, sessionBarOpenMs, aggregateSessionBars, sessionVwap, nextCandleEntryWindow } from "./VwapSignalEngine.js";
import { normalizeAlgo, seedAlgos } from "../strategies.js";
import { runtimeState, PositionManager } from "./PositionManager.js";
import { parseOptionContract } from "../frontFutures.js";
import { runNiftyVwapBacktest } from "./BacktestAdapter.js";
import { PaperTradingAdapter } from "./PaperTradingAdapter.js";
import { LiveTradingAdapter } from "./LiveTradingAdapter.js";

const T0 = Date.parse("2026-08-21T03:45:00.000Z"); // 09:15 IST
const T0_0900 = Date.parse("2026-08-21T03:30:00.000Z"); // 09:00 IST
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

function risingFutures(count = 8) {
  return Array.from({ length: count }, (_, i) => bar(i, 24500 + i * 20, { volume: 2000 + i * 10 }));
}

function fallingFutures(count = 8) {
  return Array.from({ length: count }, (_, i) => bar(i, 24500 - i * 20, { volume: 2000 + i * 10 }));
}

function optionAboveVwap(count = 8, side = "CE") {
  return Array.from({ length: count }, (_, i) => bar(i, (side === "CE" ? 120 : 110) + i * 4, { volume: 500 }));
}

function bookAdapter() {
  const positions = [];
  const exits = [];
  const places = [];
  return {
    positions,
    exits,
    places,
    adapter: {
      place(payload) {
        places.push(payload);
        if (payload.reject) return { status: "REJECTED", error: "broker-rejected" };
        const pos = {
          id: `p${places.length}`,
          symbol: payload.symbol,
          type: "BUY",
          qty: payload.qty,
          avg: payload.price,
          ltp: payload.price,
          strategy: payload.strategy,
          option: payload.option,
          strike: payload.strike,
          expiry: payload.expiry,
        };
        positions.push(pos);
        return { ...pos, status: "FILLED", price: payload.price };
      },
      exit(position) {
        exits.push(position);
        const idx = positions.findIndex((row) => row.id === position.id);
        if (idx >= 0) positions.splice(idx, 1);
        return { ok: true, pnl: 0 };
      },
    },
  };
}

test("completed candles ignore the forming bar", () => {
  const rows = risingFutures(3);
  const now = rows[2].time + BAR - 1000;
  const done = completedCandles(rows, now);
  assert.equal(done.length, 2);
  assert.equal(done.at(-1).time, rows[1].time);
});

test("first futures close above VWAP is CE bias; below is PE", () => {
  assert.equal(firstFuturesBias(risingFutures(4)).side, "CE");
  assert.equal(firstFuturesBias(fallingFutures(4)).side, "PE");
});

test("BUY CE when futures close above VWAP and ATM CE closes above CE VWAP", () => {
  const signal = VwapSignalEngine.evaluate({
    futuresBars: risingFutures(6),
    ceBars: optionAboveVwap(6, "CE"),
    peBars: optionAboveVwap(6, "PE"),
    now: T0 + 6 * BAR,
  });
  assert.equal(signal.buyCe, true);
  assert.equal(signal.buyPe, false);
});

test("BUY PE when futures close below VWAP and ATM PE closes above PE VWAP", () => {
  const signal = VwapSignalEngine.evaluate({
    futuresBars: fallingFutures(6),
    ceBars: optionAboveVwap(6, "CE"),
    peBars: optionAboveVwap(6, "PE"),
    now: T0 + 6 * BAR,
  });
  assert.equal(signal.buyPe, true);
  assert.equal(signal.buyCe, false);
});

test("no entry when option is not above its VWAP", () => {
  const weakCe = Array.from({ length: 6 }, (_, i) => bar(i, 140 - i * 8, { volume: 500 }));
  const signal = VwapSignalEngine.evaluate({
    futuresBars: risingFutures(6),
    ceBars: weakCe,
    peBars: optionAboveVwap(6, "PE"),
    now: T0 + 6 * BAR,
  });
  assert.equal(signal.buyCe, false);
});

test("initial SL is 20% and target is 40% of fill", () => {
  assert.equal(TrailingStopManager.initialStop(200, 20), 160);
  assert.equal(TrailingStopManager.targetPrice(200, 40), 280);
});

test("Nifty trail moves the stop to the buy price at +20% and then +5% every +10%", () => {
  const args = {
    entry: 100,
    initialSlPct: 20,
    activationPct: 20,
    lockToEntry: true,
    trailEveryPct: 10,
    trailShiftPct: 5,
    prevStop: 80,
  };
  assert.equal(TrailingStopManager.nextStop({ ...args, mark: 119 }), 80);
  assert.equal(TrailingStopManager.nextStop({ ...args, mark: 120 }), 100);
  assert.equal(TrailingStopManager.nextStop({ ...args, mark: 129 }), 100);
  assert.equal(TrailingStopManager.nextStop({ ...args, mark: 130 }), 105);
  assert.equal(TrailingStopManager.nextStop({ ...args, mark: 140 }), 110);
  assert.equal(TrailingStopManager.nextStop({ ...args, mark: 150 }), 115);
  assert.equal(TrailingStopManager.nextStop({ ...args, mark: 125, prevStop: 105 }), 105);
});

test("trailing activates at +10% and steps +3% as in the spec", () => {
  const args = { entry: 200, initialSlPct: 20, activationPct: 10, stepPct: 3, prevStop: 160 };
  assert.equal(TrailingStopManager.nextStop({ ...args, mark: 210 }), 160);
  assert.equal(TrailingStopManager.nextStop({ ...args, mark: 220 }), 180);
  assert.equal(TrailingStopManager.nextStop({ ...args, mark: 226 }), 186);
  assert.equal(TrailingStopManager.nextStop({ ...args, mark: 232 }), 192);
  assert.equal(TrailingStopManager.nextStop({ ...args, mark: 238 }), 198);
  assert.equal(TrailingStopManager.nextStop({ ...args, mark: 244 }), 204);
  assert.equal(TrailingStopManager.hitTarget(280, 280), true);
});

test("strategy trail activates at +10% and holds the ratchet", () => {
  const algo = defaultNiftyVwapAlgo({ name: "Trail Test" });
  const book = bookAdapter();
  const now = T0 + 6 * BAR;
  NiftyVwapStrategy.tick({
    algo,
    now,
    feedLive: true,
    minutesToClose: 120,
    futuresBars: risingFutures(6),
    ceBars: optionAboveVwap(6, "CE"),
    peBars: optionAboveVwap(6, "PE"),
    ceLtp: 200,
    peLtp: 90,
    positions: book.positions,
    adapter: book.adapter,
  });
  assert.equal(algo.vwapState.stopPrice, 160);
  const hold = NiftyVwapStrategy.tick({
    algo,
    now: now + BAR,
    feedLive: true,
    minutesToClose: 110,
    futuresBars: risingFutures(7),
    ceBars: optionAboveVwap(7, "CE"),
    peBars: optionAboveVwap(7, "PE"),
    ceLtp: 226,
    peLtp: 90,
    positions: book.positions,
    adapter: book.adapter,
  });
  assert.equal(hold.action, "hold");
  assert.equal(algo.vwapState.trailActive, true);
  assert.equal(algo.vwapState.stopPrice, 186);
});

test("live exit queues a SELL and does not call paper squareOff", () => {
  const queued = [];
  const live = LiveTradingAdapter({
    queueLiveOrder: (row) => queued.push(row),
    squareOff: () => ({ ok: true, paper: true }),
  });
  const result = live.exit({ id: "dhan-pos-1", symbol: "NIFTY 24500 CE", qty: 65, option: "CE", strike: 24500, brokerId: "dhan" });
  assert.equal(result.queued, true);
  assert.equal(queued[0].side, "SELL");
  assert.equal(queued[0].brokerId, "dhan");
});

test("SL only ratchets upward", () => {
  const up = TrailingStopManager.nextStop({ entry: 200, mark: 232, prevStop: 192, initialSlPct: 20, activationPct: 10, stepPct: 3 });
  const down = TrailingStopManager.nextStop({ entry: 200, mark: 210, prevStop: up, initialSlPct: 20, activationPct: 10, stepPct: 3 });
  assert.equal(down, up);
});

test("hitStop uses fill-based stop", () => {
  assert.equal(TrailingStopManager.hitStop(159, 160), true);
  assert.equal(TrailingStopManager.hitStop(161, 160), false);
});

test("5 consecutive futures closes against VWAP", () => {
  const up = risingFutures(3);
  const down = Array.from({ length: 5 }, (_, i) => bar(3 + i, 24480 - i * 25, { volume: 2000 }));
  const rows = [...up, ...down];
  assert.ok(VwapSignalEngine.consecutiveAgainstVwap(rows, "CE") >= 5);
});

test("RiskManager blocks a second position, averaging, and CE+PE", () => {
  assert.equal(RiskManager.canEnter({ positions: [{ qty: 65 }], maxPositions: 1 }).ok, false);
  assert.equal(RiskManager.canEnter({ inFlight: true }).ok, false);
  assert.equal(RiskManager.rejectAveraging().reason, "no-averaging");
  assert.equal(RiskManager.duplicateBar(100, 100), true);
  assert.equal(RiskManager.canEnter({ positions: [] }).ok, true);
});

test("ATM strike is selected at entry and stays locked", () => {
  const first = OptionStrikeSelector.select({ spot: 24512, step: 50, option: "CE" });
  assert.equal(first.strike, 24500);
  const locked = OptionStrikeSelector.select({ spot: 24680, step: 50, option: "PE", locked: first });
  assert.equal(locked.strike, 24500);
  assert.equal(locked.option, "CE");
});

test("strategy enters CE once and rejects a duplicate bar", () => {
  const algo = defaultNiftyVwapAlgo({ name: "VWAP Test" });
  const book = bookAdapter();
  const now = T0 + 6 * BAR;
  const input = {
    algo,
    now,
    feedLive: true,
    minutesToClose: 120,
    futuresBars: risingFutures(6),
    ceBars: optionAboveVwap(6, "CE"),
    peBars: optionAboveVwap(6, "PE"),
    spot: 24600,
    step: 50,
    expiry: "2026-08-27",
    ceLtp: 140,
    peLtp: 90,
    positions: book.positions,
    adapter: book.adapter,
  };
  const first = NiftyVwapStrategy.tick(input);
  assert.equal(first.action, "entry");
  assert.equal(book.places.length, 1);
  const again = NiftyVwapStrategy.tick({ ...input, positions: book.positions });
  assert.ok(again.action === "hold" || again.action === "skip");
  const flat = defaultNiftyVwapAlgo({ name: "VWAP Test 2" });
  const book2 = bookAdapter();
  NiftyVwapStrategy.tick({ ...input, algo: flat, positions: book2.positions, adapter: book2.adapter });
  const dup = NiftyVwapStrategy.tick({ ...input, algo: flat, positions: [], adapter: book2.adapter });
  assert.equal(dup.reason === "duplicate-bar" || book2.places.length === 1, true);
});

test("SL exit uses actual fill price", () => {
  const algo = defaultNiftyVwapAlgo({ name: "SL Test" });
  const book = bookAdapter();
  const now = T0 + 6 * BAR;
  NiftyVwapStrategy.tick({
    algo,
    now,
    feedLive: true,
    minutesToClose: 120,
    futuresBars: risingFutures(6),
    ceBars: optionAboveVwap(6, "CE"),
    peBars: optionAboveVwap(6, "PE"),
    spot: 24600,
    ceLtp: 200,
    peLtp: 90,
    positions: book.positions,
    adapter: book.adapter,
  });
  assert.equal(book.positions[0].avg, 200);
  const exit = NiftyVwapStrategy.tick({
    algo,
    now: now + BAR,
    feedLive: true,
    minutesToClose: 110,
    futuresBars: risingFutures(7),
    ceBars: optionAboveVwap(7, "CE"),
    peBars: optionAboveVwap(7, "PE"),
    spot: 24600,
    ceLtp: 150,
    peLtp: 90,
    positions: book.positions,
    adapter: book.adapter,
  });
  assert.equal(exit.action, "exit");
  assert.equal(exit.reason, "sl");
});

test("40% target exit", () => {
  const algo = defaultNiftyVwapAlgo({ name: "TGT Test" });
  const book = bookAdapter();
  const now = T0 + 6 * BAR;
  NiftyVwapStrategy.tick({
    algo,
    now,
    feedLive: true,
    minutesToClose: 120,
    futuresBars: risingFutures(6),
    ceBars: optionAboveVwap(6, "CE"),
    peBars: optionAboveVwap(6, "PE"),
    spot: 24600,
    ceLtp: 200,
    peLtp: 90,
    positions: book.positions,
    adapter: book.adapter,
  });
  const exit = NiftyVwapStrategy.tick({
    algo,
    now: now + BAR,
    feedLive: true,
    minutesToClose: 110,
    futuresBars: risingFutures(7),
    ceBars: optionAboveVwap(7, "CE"),
    peBars: optionAboveVwap(7, "PE"),
    ceLtp: 280,
    peLtp: 90,
    positions: book.positions,
    adapter: book.adapter,
  });
  assert.equal(exit.reason, "target");
});

test("5-candle VWAP exit", () => {
  const algo = defaultNiftyVwapAlgo({ name: "VWAP Exit" });
  const book = bookAdapter();
  const now = T0 + 6 * BAR;
  NiftyVwapStrategy.tick({
    algo,
    now,
    feedLive: true,
    minutesToClose: 120,
    futuresBars: risingFutures(6),
    ceBars: optionAboveVwap(6, "CE"),
    peBars: optionAboveVwap(6, "PE"),
    ceLtp: 200,
    peLtp: 90,
    positions: book.positions,
    adapter: book.adapter,
  });
  const fut = [
    ...risingFutures(3),
    ...Array.from({ length: 6 }, (_, i) => bar(3 + i, 24470 - i * 30, { volume: 2500 })),
  ];
  const exit = NiftyVwapStrategy.tick({
    algo,
    now: T0 + 10 * BAR,
    feedLive: true,
    minutesToClose: 80,
    futuresBars: fut,
    ceBars: optionAboveVwap(10, "CE"),
    peBars: optionAboveVwap(10, "PE"),
    ceLtp: 205,
    peLtp: 90,
    positions: book.positions,
    adapter: book.adapter,
  });
  assert.equal(exit.reason, "vwap-exit");
});

test("EOD square-off", () => {
  const algo = defaultNiftyVwapAlgo({ name: "EOD Test" });
  const book = bookAdapter();
  NiftyVwapStrategy.tick({
    algo,
    now: T0 + 6 * BAR,
    feedLive: true,
    minutesToClose: 120,
    futuresBars: risingFutures(6),
    ceBars: optionAboveVwap(6, "CE"),
    peBars: optionAboveVwap(6, "PE"),
    ceLtp: 200,
    peLtp: 90,
    positions: book.positions,
    adapter: book.adapter,
  });
  const exit = NiftyVwapStrategy.tick({
    algo,
    now: T0 + 70 * BAR,
    feedLive: true,
    minutesToClose: 5,
    futuresBars: risingFutures(8),
    ceBars: optionAboveVwap(8, "CE"),
    peBars: optionAboveVwap(8, "PE"),
    ceLtp: 210,
    peLtp: 90,
    positions: book.positions,
    adapter: book.adapter,
  });
  assert.equal(exit.reason, "eod");
});

test("duplicate-order prevention while in-flight", () => {
  const algo = defaultNiftyVwapAlgo({ name: "Dup Test" });
  algo.vwapState = { inFlight: true, lastEntryBarTime: 1, sessionDate: "2026-08-21" };
  const gate = RiskManager.canEnter({ positions: [], inFlight: true });
  assert.equal(gate.ok, false);
  assert.equal(NiftyVwapStrategy.tick({
    algo,
    now: T0 + 6 * BAR,
    feedLive: true,
    minutesToClose: 120,
    futuresBars: risingFutures(6),
    ceBars: optionAboveVwap(6, "CE"),
    peBars: optionAboveVwap(6, "PE"),
    ceLtp: 140,
    positions: [],
    adapter: { place: () => ({ queued: true }), exit: () => ({}) },
  }).reason, "buy-active");
});

test("market-data disconnect pauses entries; reconnect clears the flag", () => {
  const algo = defaultNiftyVwapAlgo({ name: "Feed Test" });
  const down = NiftyVwapStrategy.tick({
    algo,
    now: T0 + 6 * BAR,
    feedLive: false,
    minutesToClose: 120,
    futuresBars: risingFutures(6),
    ceBars: optionAboveVwap(6, "CE"),
    peBars: optionAboveVwap(6, "PE"),
    ceLtp: 140,
    positions: [],
    adapter: { place: () => ({ status: "FILLED", price: 140 }), exit: () => ({}) },
  });
  assert.equal(down.action, "feed-down");
  noteFeedReconnect(algo);
  assert.equal(algo.vwapState.feedOk, true);
});

test("broker order rejection does not open a position", () => {
  const algo = defaultNiftyVwapAlgo({ name: "Reject Test" });
  const result = NiftyVwapStrategy.tick({
    algo,
    now: T0 + 6 * BAR,
    feedLive: true,
    minutesToClose: 120,
    futuresBars: risingFutures(6),
    ceBars: optionAboveVwap(6, "CE"),
    peBars: optionAboveVwap(6, "PE"),
    ceLtp: 140,
    positions: [],
    adapter: { place: () => ({ status: "REJECTED", error: "DH-906" }), exit: () => ({}) },
  });
  assert.equal(result.action, "rejected");
  assert.equal(algo.vwapState.inFlight, false);
  noteBrokerRejection(algo);
  assert.equal(algo.lastSignal, "REJECTED");
});

test("a failed buy does not send the same candle again", () => {
  const algo = defaultNiftyVwapAlgo({ name: "Reject Same Bar" });
  const places = [];
  const input = {
    algo,
    now: T0 + 6 * BAR,
    feedLive: true,
    minutesToClose: 120,
    futuresBars: risingFutures(6),
    ceBars: optionAboveVwap(6, "CE"),
    peBars: optionAboveVwap(6, "PE"),
    ceLtp: 140,
    peLtp: 90,
    spot: 24600,
    step: 50,
    expiry: "2026-08-27",
    positions: [],
    adapter: {
      place(payload) {
        places.push(payload);
        return { status: "REJECTED", error: "DH-906" };
      },
      exit() {
        return {};
      },
    },
  };
  assert.equal(NiftyVwapStrategy.tick(input).action, "rejected");
  const again = NiftyVwapStrategy.tick(input);
  assert.equal(again.action, "skip");
  assert.equal(again.reason, "duplicate-bar");
  assert.equal(places.length, 1);
});

test("a rejected first-candle buy stays locked on that bar and can fire on the next bar", () => {
  const algo = defaultNiftyFirstCandleAlgo({ name: "Reject then next bar" });
  const places = [];
  const adapter = {
    place(payload) {
      places.push(payload);
      return { queued: true, status: "PENDING" };
    },
    exit() {
      return { ok: true };
    },
  };
  const tickAt = (n, orders = []) => {
    const time = T0_0900 + n * BAR;
    return NiftyVwapStrategy.tick({
      algo,
      now: time + BAR,
      feedLive: true,
      minutesToClose: 360,
      futuresBars: [{ time, open: 24500, high: 24580, low: 24490, close: 24540 + n, volume: 1000 }],
      ceBars: [{ time, open: 100, high: 140, low: 98, close: 120 + n, volume: 500 }],
      peBars: [firstBar(110, 96)],
      ceLtp: 120,
      peLtp: 96,
      spot: 24540,
      step: 50,
      expiry: "2026-08-27",
      positions: [],
      orders,
      adapter,
    });
  };
  assert.equal(tickAt(0).action, "queued");
  algo.vwapState.inFlight = false;
  const same = tickAt(0, [{ id: "rej-1", strategy: algo.name, side: "BUY", status: "REJECTED", filledQty: 0 }]);
  assert.ok(same.action === "skip" || same.reason === "duplicate-bar");
  assert.equal(places.length, 1);
  const next = tickAt(1, [{ id: "rej-1", strategy: algo.name, side: "BUY", status: "REJECTED", filledQty: 0 }]);
  assert.equal(next.action, "queued");
  assert.equal(places.length, 2);
});

test("new algos start paused — LIVE is not auto-enabled", () => {
  const algo = defaultNiftyVwapAlgo();
  assert.equal(algo.enabled, false);
  assert.equal(algo.runMode, "live");
  assert.equal(algo.brokerId, "dhan");
  assert.notEqual(algo.status, "LIVE");
});

test("paper and live adapters share BUY option payloads", () => {
  const paperOrders = [];
  const liveOrders = [];
  const paper = PaperTradingAdapter({
    placeOrder: (row) => paperOrders.push(row),
    squareOff: () => ({ ok: true }),
  });
  const live = LiveTradingAdapter({
    queueLiveOrder: (row) => liveOrders.push(row),
    squareOff: () => ({ ok: true }),
  });
  const payload = { symbol: "NIFTY 24500 CE", side: "BUY", qty: 65, price: 120, option: "CE", strike: 24500 };
  paper.place(payload);
  live.place(payload);
  assert.equal(paperOrders[0].brokerId, "paper");
  assert.equal(liveOrders[0].brokerId, "dhan");
  assert.equal(paperOrders[0].side, liveOrders[0].side);
  assert.equal(paperOrders[0].strike, liveOrders[0].strike);
});

test("live adapter does not treat a duplicate queue as a new order", () => {
  const live = LiveTradingAdapter({
    queueLiveOrder: () => ({ ok: true, queued: false, duplicate: true, status: "PENDING" }),
  });
  const result = live.place({ symbol: "NIFTY 24500 CE", side: "BUY", qty: 65 });
  assert.equal(result.queued, false);
  assert.equal(result.duplicate, true);
});

test("live exit does not treat a duplicate queue as a new close", () => {
  const live = LiveTradingAdapter({
    queueLiveOrder: () => ({ ok: true, queued: false, duplicate: true, status: "PENDING" }),
  });
  const result = live.exit({
    symbol: "NIFTY 24500 CE",
    qty: 65,
    option: "CE",
    strike: 24500,
    brokerId: "dhan",
    strategy: "NIFTY 5m first candle",
  });
  assert.equal(result.queued, false);
  assert.equal(result.duplicate, true);
});

test("duplicate live queue does not mark the strategy as filled", () => {
  const algo = defaultNiftyVwapAlgo({ name: "Dup Queue" });
  const result = NiftyVwapStrategy.tick({
    algo,
    now: T0 + 6 * BAR,
    feedLive: true,
    minutesToClose: 120,
    futuresBars: risingFutures(6),
    ceBars: optionAboveVwap(6, "CE"),
    peBars: optionAboveVwap(6, "PE"),
    spot: 24500,
    step: 50,
    expiry: "2026-08-27",
    ceLtp: 140,
    peLtp: 110,
    positions: [],
    adapter: { place: () => ({ ok: true, queued: false, duplicate: true, status: "PENDING" }), exit: () => ({}) },
  });
  assert.equal(result.action, "skip");
  assert.equal(result.reason, "buy-active");
  assert.equal(algo.vwapState.buyPhase, "entry");
  assert.equal(Number(algo.vwapState.fillPrice || 0), 0);
  assert.equal(algo.lastSignal, "WAIT ORDER");
});

test("backtest adapter runs without look-ahead (completed 5m bars only)", () => {
  const algo = defaultNiftyVwapAlgo({ name: "BT" });
  const candles = [
    ...risingFutures(20),
    ...Array.from({ length: 10 }, (_, i) => bar(20 + i, 24900 + i * 5, { volume: 1800 })),
  ];
  const result = runNiftyVwapBacktest(algo, candles);
  assert.ok(result.bars >= 30);
  assert.equal(result.timeframe, "5m");
  assert.ok(Number.isFinite(result.pnl));
});

test("session VWAP is volume-weighted and uses only that session", () => {
  const rows = [bar(0, 100, { volume: 1, high: 100, low: 100 }), bar(1, 200, { volume: 3, high: 200, low: 200 })];
  assert.equal(sessionVwap(rows), 175);
});

test("normalizeAlgo keeps NIFTY VWAP paused and never auto-enables LIVE", () => {
  const created = normalizeAlgo(defaultNiftyVwapAlgo({ name: "Desk VWAP", runMode: "live" }));
  assert.equal(isNiftyVwapAlgo(created), true);
  assert.equal(created.enabled, false);
  assert.notEqual(created.status, "LIVE");
  assert.equal(created.timeframe, "5m");
  assert.equal(created.initialSlPct, 20);
  assert.equal(created.targetPct, 40);
  const updated = normalizeAlgo({ name: "Desk VWAP", runMode: "live", initialSlPct: 18 }, created);
  assert.equal(updated.enabled, false);
  assert.equal(updated.initialSlPct, 18);
});

test("seed does not include NIFTY VWAP ATM or 15m reversal algos", () => {
  const seeded = seedAlgos();
  assert.equal(seeded.some((row) => isNiftyVwapAlgo(row) || isNiftyVwapReversalAlgo(row)), false);
  assert.equal(seeded.find((row) => row.id === "a10").name, "NIFTY");
  assert.equal(seeded.find((row) => row.id === "a12").name, "CRUDE OIL");
  assert.equal(seeded.find((row) => row.id === "a10").enabled, false);
});

test("paper/live/backtest share the same config and BUY-only option payload", () => {
  const paper = defaultNiftyVwapAlgo({ runMode: "paper" });
  const live = defaultNiftyVwapAlgo({ runMode: "live" });
  const backtest = defaultNiftyVwapAlgo({ runMode: "backtest" });
  assert.equal(niftyVwapConfig(paper).timeframe, niftyVwapConfig(live).timeframe);
  assert.equal(niftyVwapConfig(live).initialSlPct, niftyVwapConfig(backtest).initialSlPct);
  assert.equal(paper.enabled, false);
  assert.equal(live.enabled, false);
  assert.equal(backtest.enabled, false);
});

test("config stays 5m / 20 / 40 / 10 / 3 / 5 / max 1", () => {
  const cfg = niftyVwapConfig({});
  assert.equal(cfg.timeframe, "5m");
  assert.equal(cfg.initialSlPct, 20);
  assert.equal(cfg.targetPct, 40);
  assert.equal(cfg.trailingActivationPct, 10);
  assert.equal(cfg.trailingStepPct, 3);
  assert.equal(cfg.vwapExitCandles, 5);
  assert.equal(cfg.maxPositions, 1);
});

const BAR15 = 15 * 60 * 1000;

function bar15(i, open, close, extras = {}) {
  return {
    time: T0 + i * BAR15,
    open,
    high: extras.high ?? Math.max(open, close) + 5,
    low: extras.low ?? Math.min(open, close) - 5,
    close,
    volume: extras.volume ?? 1000,
  };
}

test("15m reversal: open below VWAP and close above is BUY CE after the candle closes", () => {
  const futuresBars = [bar15(0, 24500, 24500, { high: 24500, low: 24500 }), bar15(1, 24480, 24540, { high: 24550, low: 24470 })];
  const reversal = lastBarVwapReversal(futuresBars);
  assert.equal(reversal.buyCe, true);
  assert.equal(reversal.buyPe, false);
  const forming = T0 + BAR15 + BAR15 - 1000;
  const formingSignal = VwapSignalEngine.evaluateReversal({ futuresBars, now: forming, barMs: BAR15 });
  assert.equal(formingSignal.buyCe, false);
  const done = T0 + 2 * BAR15;
  const signal = VwapSignalEngine.evaluateReversal({ futuresBars, now: done, barMs: BAR15 });
  assert.equal(signal.buyCe, true);
  assert.equal(signal.buyPe, false);
  assert.equal(signal.previewFilled, true);
  assert.equal(signal.inNewCandle, true);
  const algo = defaultNiftyVwapReversalAlgo({ name: "Rev CE" });
  const book = bookAdapter();
  const tick = NiftyVwapStrategy.tick({
    algo,
    now: done,
    feedLive: true,
    minutesToClose: 120,
    futuresBars,
    spot: 24540,
    step: 50,
    expiry: "2026-08-27",
    ceLtp: 100,
    peLtp: 90,
    positions: book.positions,
    adapter: book.adapter,
  });
  assert.equal(tick.action, "entry");
  assert.equal(book.places[0].option, "CE");
  assert.equal(book.places[0].side, "BUY");
  assert.equal(book.places[0].qty, 65);
});

test("15m reversal: open above VWAP and close below is BUY PE after the candle closes", () => {
  const futuresBars = [bar15(0, 24500, 24500, { high: 24500, low: 24500 }), bar15(1, 24540, 24480, { high: 24550, low: 24470 })];
  const done = T0 + 2 * BAR15;
  const signal = VwapSignalEngine.evaluateReversal({ futuresBars, now: done, barMs: BAR15 });
  assert.equal(signal.buyPe, true);
  assert.equal(signal.buyCe, false);
  const algo = defaultNiftyVwapReversalAlgo({ name: "Rev PE" });
  const book = bookAdapter();
  const tick = NiftyVwapStrategy.tick({
    algo,
    now: done,
    feedLive: true,
    minutesToClose: 120,
    futuresBars,
    spot: 24480,
    step: 50,
    expiry: "2026-08-27",
    ceLtp: 90,
    peLtp: 110,
    positions: book.positions,
    adapter: book.adapter,
  });
  assert.equal(tick.action, "entry");
  assert.equal(book.places[0].option, "PE");
  assert.equal(book.places[0].qty, 65);
});

test("15m reversal ignores the forming preview candle and buys only at the next 15m open", () => {
  const futuresBars = [bar15(0, 24500, 24500, { high: 24500, low: 24500 }), bar15(1, 24480, 24540, { high: 24550, low: 24470 })];
  const preview = T0 + BAR15 + BAR15 - 1;
  const book = bookAdapter();
  const previewTick = NiftyVwapStrategy.tick({
    algo: defaultNiftyVwapReversalAlgo({ name: "Rev Preview" }),
    now: preview,
    feedLive: true,
    minutesToClose: 120,
    futuresBars,
    spot: 24540,
    step: 50,
    expiry: "2026-08-27",
    ceLtp: 100,
    peLtp: 90,
    positions: book.positions,
    adapter: book.adapter,
  });
  assert.equal(previewTick.action, "wait");
  assert.equal(book.places.length, 0);
  const window = nextCandleEntryWindow(T0 + BAR15, T0 + 2 * BAR15, BAR15);
  assert.equal(window.inNewCandle, true);
  assert.equal(window.missedOpen, false);
});

test("15m reversal still sends when the last completed bar is the matched reversal", () => {
  const futuresBars = [bar15(0, 24500, 24500, { high: 24500, low: 24500 }), bar15(1, 24480, 24540, { high: 24550, low: 24470 })];
  const late = T0 + 3 * BAR15;
  const signal = VwapSignalEngine.evaluateReversal({ futuresBars, now: late, barMs: BAR15 });
  assert.equal(signal.previewFilled, true);
  assert.equal(signal.buyCe, true);
  assert.equal(signal.missedOpen, true);
  const algo = defaultNiftyVwapReversalAlgo({ name: "Rev Missed Open" });
  const book = bookAdapter();
  const tick = NiftyVwapStrategy.tick({
    algo,
    now: late,
    feedLive: true,
    minutesToClose: 120,
    futuresBars,
    spot: 24540,
    step: 50,
    expiry: "2026-08-27",
    ceLtp: 100,
    peLtp: 90,
    positions: book.positions,
    adapter: book.adapter,
  });
  assert.equal(tick.action, "entry");
  assert.equal(book.places[0].option, "CE");
  assert.equal(book.places[0].side, "BUY");
});

test("15m IST slots start at 09:15 / 09:30, not clock minutes divisible by 15", () => {
  const slot0915 = Date.parse("2026-08-21T03:45:00.000Z");
  const slot0930 = Date.parse("2026-08-21T04:00:00.000Z");
  assert.equal(sessionBarOpenMs(Date.parse("2026-08-21T03:47:00.000Z"), 15), slot0915);
  assert.equal(sessionBarOpenMs(Date.parse("2026-08-21T04:00:00.000Z"), 15), slot0930);
  assert.equal(sessionBarOpenMs(Date.parse("2026-08-21T04:14:00.000Z"), 15), slot0930);
  assert.equal(
    sessionBarOpenMs(Date.parse("2026-08-21T04:00:00.000Z"), 15, { closeLabeled: true }),
    slot0915,
  );
});

test("Dhan 1m close at 14:30 belongs to the 14:15-14:30 15m bar", () => {
  const slot1415 = Date.parse("2026-08-21T08:45:00.000Z");
  const close1430 = Date.parse("2026-08-21T09:00:00.000Z");
  assert.equal(sessionBarOpenMs(close1430, 15, { closeLabeled: true }), slot1415);
  const ones = [];
  for (let i = 0; i <= 15; i += 1) {
    ones.push({
      time: slot1415 + i * 60_000,
      open: 24500,
      high: 24510,
      low: 24490,
      close: i === 15 ? 24480 : 24500,
      volume: 1,
    });
  }
  const forming = aggregateSessionBars(ones, 15, Date.parse("2026-08-21T08:59:00.000Z"));
  assert.equal(forming.some((bar) => bar.time === slot1415), false);
  const closed = aggregateSessionBars(ones, 15, Date.parse("2026-08-21T09:01:00.000Z"));
  const last = closed[closed.length - 1];
  assert.equal(last.time, slot1415);
  assert.equal(last.close, 24480);
});

test("aggregateSessionBars drops the forming 15m IST bucket before it closes", () => {
  const t0 = Date.parse("2026-08-21T03:45:00.000Z");
  const ones = [];
  for (let i = 0; i < 20; i++) {
    ones.push({ time: t0 + i * 60_000, open: 100, high: 101, low: 99, close: 100.5, volume: 1 });
  }
  const at0929 = Date.parse("2026-08-21T03:59:00.000Z");
  const forming = aggregateSessionBars(ones, 15, at0929);
  assert.equal(forming.length, 0);
  const at0930 = Date.parse("2026-08-21T04:00:00.000Z");
  const closed = aggregateSessionBars(ones, 15, at0930);
  assert.equal(closed.length, 1);
  assert.equal(closed[0].time, t0);
  assert.equal(closed[0].open, 100);
});

test("15m VWAP reversal does not punch when last closed 15m did not cross VWAP", () => {
  const futuresBars = [
    bar15(0, 24500, 24500, { high: 24500, low: 24500 }),
    bar15(1, 24510, 24520, { high: 24530, low: 24500 }),
    bar15(2, 24520, 24530, { high: 24540, low: 24510 }),
    bar15(3, 24530, 24540, { high: 24550, low: 24520 }),
  ];
  const now = T0 + 4 * BAR15;
  const reversal = lastBarVwapReversal(futuresBars);
  assert.equal(reversal.buyCe, false);
  assert.equal(reversal.buyPe, false);
  const algo = defaultNiftyVwapReversalAlgo({ name: "Rev Wait" });
  const book = bookAdapter();
  const result = NiftyVwapStrategy.tick({
    algo,
    now,
    feedLive: true,
    minutesToClose: 240,
    futuresBars,
    spot: 24540,
    step: 50,
    expiry: "2026-08-27",
    ceLtp: 200,
    peLtp: 190,
    positions: book.positions,
    adapter: book.adapter,
  });
  assert.equal(result.action, "wait");
  assert.equal(result.reason, "no-reversal");
  assert.equal(book.places.length, 0);
  assert.match(algo.lastSignal, /WAIT 15m/);
});

test("misaligned 1m groups do not punch; only an IST 15m VWAP cross does", () => {
  const t0 = Date.parse("2026-08-21T03:45:00.000Z");
  const ones = [];
  for (let i = 2; i < 17; i++) {
    const below = i <= 15;
    const px = below ? 24400 : 24600;
    ones.push({ time: t0 + i * 60_000, open: px, high: px + 2, low: px - 2, close: px, volume: 100 });
  }
  const naive = {
    time: ones[0].time,
    open: ones[0].open,
    close: ones[ones.length - 1].close,
  };
  assert.equal(naive.open < 24500 && naive.close > 24500, true);
  const now = Date.parse("2026-08-21T04:02:00.000Z");
  const signal = VwapSignalEngine.evaluateReversal({ futuresBars: ones, now, barMs: BAR15 });
  assert.equal(signal.buyCe, false);
  assert.equal(signal.buyPe, false);
  const algo = defaultNiftyVwapReversalAlgo({ name: "Rev No False Punch" });
  const book = bookAdapter();
  const tick = NiftyVwapStrategy.tick({
    algo,
    now,
    feedLive: true,
    minutesToClose: 240,
    futuresBars: ones,
    spot: 24600,
    step: 50,
    expiry: "2026-08-27",
    ceLtp: 100,
    peLtp: 90,
    positions: book.positions,
    adapter: book.adapter,
  });
  assert.equal(tick.action, "wait");
  assert.equal(book.places.length, 0);
});

test("IST-aggregated 1m bars still BUY CE after the 15m close when open is below VWAP and close is above", () => {
  const t0 = Date.parse("2026-08-21T03:45:00.000Z");
  const ones = [];
  for (let i = 0; i < 15; i++) {
    const open = 24480 + i * 4;
    const close = open + 4;
    ones.push({ time: t0 + i * 60_000, open, high: close + 2, low: open - 2, close, volume: 100 });
  }
  const now = Date.parse("2026-08-21T04:00:00.000Z");
  const signal = VwapSignalEngine.evaluateReversal({ futuresBars: ones, now, barMs: BAR15 });
  assert.equal(signal.buyCe, true);
  assert.equal(signal.buyPe, false);
  const algo = defaultNiftyVwapReversalAlgo({ name: "Rev 1m CE" });
  const book = bookAdapter();
  const tick = NiftyVwapStrategy.tick({
    algo,
    now,
    feedLive: true,
    minutesToClose: 240,
    futuresBars: ones,
    spot: 24540,
    step: 50,
    expiry: "2026-08-27",
    ceLtp: 100,
    peLtp: 90,
    positions: book.positions,
    adapter: book.adapter,
  });
  assert.equal(tick.action, "entry");
  assert.equal(book.places[0].option, "CE");
  assert.equal(book.places[0].qty, 65);
});

test("15m reversal uses 15% stop and 30% target and does not trail", () => {
  const cfg = niftyVwapReversalConfig({});
  assert.equal(cfg.timeframe, "15m");
  assert.equal(cfg.initialSlPct, 15);
  assert.equal(cfg.targetPct, 30);
  assert.equal(cfg.useTrail, false);
  assert.equal(cfg.useVwapExit, false);
  assert.equal(cfg.expiryKind, "weekly");
  assert.equal(TrailingStopManager.initialStop(100, 15), 85);
  assert.equal(TrailingStopManager.targetPrice(100, 30), 130);
  const algo = defaultNiftyVwapReversalAlgo({ name: "Rev SL" });
  const book = bookAdapter();
  const futuresBars = [bar15(0, 24500, 24500, { high: 24500, low: 24500 }), bar15(1, 24480, 24540, { high: 24550, low: 24470 })];
  const now = T0 + 2 * BAR15;
  NiftyVwapStrategy.tick({
    algo,
    now,
    feedLive: true,
    minutesToClose: 120,
    futuresBars,
    spot: 24540,
    ceLtp: 100,
    peLtp: 90,
    positions: book.positions,
    adapter: book.adapter,
  });
  assert.equal(book.positions[0].avg, 100);
  const hold = NiftyVwapStrategy.tick({
    algo,
    now: now + BAR15,
    feedLive: true,
    minutesToClose: 100,
    futuresBars: [...futuresBars, bar15(2, 24540, 24560, { high: 24570, low: 24530 })],
    ceLtp: 125,
    peLtp: 80,
    positions: book.positions,
    adapter: book.adapter,
  });
  assert.equal(hold.action, "hold");
  assert.equal(runtimeState(algo).stopPrice, 85);
  const sl = NiftyVwapStrategy.tick({
    algo,
    now: now + 2 * BAR15,
    feedLive: true,
    minutesToClose: 80,
    futuresBars: [...futuresBars, bar15(2, 24540, 24560, { high: 24570, low: 24530 })],
    ceLtp: 84,
    peLtp: 80,
    positions: book.positions,
    adapter: book.adapter,
  });
  assert.equal(sl.action, "exit");
  assert.equal(sl.reason, "sl");
});

test("normalizeAlgo keeps 15m reversal paused and never auto-enables LIVE", () => {
  const created = normalizeAlgo(defaultNiftyVwapReversalAlgo({ name: "Desk Reversal", runMode: "live" }));
  assert.equal(isNiftyVwapReversalAlgo(created), true);
  assert.equal(created.enabled, false);
  assert.notEqual(created.status, "LIVE");
  assert.equal(created.timeframe, "15m");
  assert.equal(created.initialSlPct, 15);
  assert.equal(created.targetPct, 30);
  assert.equal(niftyVwapReversalConfig(created).expiryKind, "weekly");
});

test("parseOptionContract reads Dhan hyphen symbols and skips BANKNIFTY", () => {
  assert.deepEqual(parseOptionContract("NIFTY 24500 CE"), { root: "NIFTY", strike: 24500, option: "CE" });
  assert.deepEqual(parseOptionContract("NIFTY-SEP2026-24500-CE"), { root: "NIFTY", strike: 24500, option: "CE" });
  assert.deepEqual(parseOptionContract("NIFTY 16 SEP 24500 PE"), { root: "NIFTY", strike: 24500, option: "PE" });
  assert.equal(parseOptionContract("BANKNIFTY 52000 CE").root, "BANKNIFTY");
  assert.deepEqual(parseOptionContract("CRUDEOIL 6100 CE"), { root: "CRUDEOIL", strike: 6100, option: "CE" });
  assert.deepEqual(parseOptionContract("CRUDEOIL-17Sep2026-6100-PE"), { root: "CRUDEOIL", strike: 6100, option: "PE" });
  assert.equal(PositionManager.isOpenNiftyOption({ symbol: "NIFTY-SEP2026-24500-CE", qty: 65, type: "BUY" }), true);
  assert.equal(PositionManager.isOpenNiftyOption({ symbol: "BANKNIFTY 52000 CE", qty: 65, type: "BUY" }), false);
  assert.equal(PositionManager.isOpenNiftyOption({ symbol: "CRUDEOIL 6100 CE", qty: 100, type: "BUY" }), false);
});

test("one NIFTY option at a time — untagged Dhan fill blocks a second BUY", () => {
  const futuresBars = [bar15(0, 24500, 24500, { high: 24500, low: 24500 }), bar15(1, 24480, 24540, { high: 24550, low: 24470 })];
  const now = T0 + 2 * BAR15;
  const algo = defaultNiftyVwapReversalAlgo({ name: "Rev Second Lot" });
  const book = bookAdapter();
  const blocked = NiftyVwapStrategy.tick({
    algo,
    now,
    feedLive: true,
    minutesToClose: 240,
    futuresBars,
    spot: 24540,
    step: 50,
    expiry: "2026-08-27",
    ceLtp: 100,
    peLtp: 90,
    positions: [
      {
        id: "dhan-pos-1",
        symbol: "NIFTY-SEP2026-24500-CE",
        type: "BUY",
        qty: 65,
        avg: 98,
        ltp: 100,
        strategy: "",
        brokerId: "dhan",
        live: true,
      },
    ],
    adapter: book.adapter,
  });
  assert.equal(book.places.length, 0);
  assert.equal(blocked.reason, "already-open");
  assert.equal(algo.lastSignal, "");
});

test("in-flight timeout does not punch a second lot while a NIFTY option is still open", () => {
  const futuresBars = [bar15(0, 24500, 24500, { high: 24500, low: 24500 }), bar15(1, 24480, 24540, { high: 24550, low: 24470 })];
  const algo = defaultNiftyVwapReversalAlgo({ name: "Rev Timeout" });
  algo.vwapState = {
    sessionDate: "2026-08-21",
    inFlight: true,
    lastEntryBarTime: T0 + BAR15,
    lastEntryAt: T0,
    lockedStrike: 24500,
    lockedOption: "CE",
    lockedSymbol: "NIFTY 24500 CE",
    fillPrice: 0,
  };
  const book = bookAdapter();
  const tick = NiftyVwapStrategy.tick({
    algo,
    now: T0 + 2 * BAR15 + 180_000,
    feedLive: true,
    minutesToClose: 240,
    futuresBars,
    spot: 24540,
    step: 50,
    expiry: "2026-08-27",
    ceLtp: 100,
    peLtp: 90,
    positions: [
      {
        symbol: "NIFTY-SEP2026-24500-CE",
        type: "BUY",
        qty: 65,
        avg: 100,
        ltp: 102,
        strategy: "",
      },
    ],
    adapter: book.adapter,
  });
  assert.equal(book.places.length, 0);
  assert.ok(tick.action === "hold" || tick.reason === "already-open");
});

function firstBar(open, close, extras = {}) {
  return {
    time: T0_0900,
    open,
    high: extras.high ?? Math.max(open, close) + 3,
    low: extras.low ?? Math.min(open, close) - 3,
    close,
    volume: extras.volume ?? 1000,
  };
}

test("first candle BUY CE when Nifty first 5m is green and ATM CE first 5m is green", () => {
  const signal = VwapSignalEngine.evaluateFirstCandle({
    futuresBars: [firstBar(24500, 24540)],
    ceBars: [firstBar(100, 118)],
    peBars: [firstBar(110, 96)],
    now: T0_0900 + BAR,
  });
  assert.equal(signal.buyCe, true);
  assert.equal(signal.buyPe, false);
  assert.equal(signal.niftyColor, "green");
  assert.equal(signal.ceColor, "green");
});

test("first candle BUY PE when Nifty first 5m is red and ATM PE first 5m is green", () => {
  const signal = VwapSignalEngine.evaluateFirstCandle({
    futuresBars: [firstBar(24540, 24500)],
    ceBars: [firstBar(118, 100)],
    peBars: [firstBar(96, 110)],
    now: T0_0900 + BAR,
  });
  assert.equal(signal.buyPe, true);
  assert.equal(signal.buyCe, false);
  assert.equal(signal.niftyColor, "red");
  assert.equal(signal.peColor, "green");
});

test("first candle doji or option not green is no trade", () => {
  const doji = VwapSignalEngine.evaluateFirstCandle({
    futuresBars: [firstBar(24500, 24500)],
    ceBars: [firstBar(100, 118)],
    peBars: [firstBar(96, 110)],
    now: T0_0900 + BAR,
  });
  assert.equal(doji.buyCe, false);
  assert.equal(doji.buyPe, false);
  assert.equal(doji.niftyColor, "doji");
  const redCe = VwapSignalEngine.evaluateFirstCandle({
    futuresBars: [firstBar(24500, 24540)],
    ceBars: [firstBar(118, 100)],
    peBars: [firstBar(96, 110)],
    now: T0_0900 + BAR,
  });
  assert.equal(redCe.buyCe, false);
  assert.equal(redCe.buyPe, false);
  const redPe = VwapSignalEngine.evaluateFirstCandle({
    futuresBars: [firstBar(24540, 24500)],
    ceBars: [firstBar(118, 100)],
    peBars: [firstBar(110, 96)],
    now: T0_0900 + BAR,
  });
  assert.equal(redPe.buyCe, false);
  assert.equal(redPe.buyPe, false);
  assert.equal(redPe.niftyColor, "red");
  assert.equal(redPe.peColor, "red");
});

test("first candle strategy buys ATM CE and trails the stop to the buy price at +20%", () => {
  const algo = defaultNiftyFirstCandleAlgo({ name: "First candle CE" });
  const cfg = niftyFirstCandleConfig(algo);
  assert.equal(cfg.signalMode, "first-candle");
  assert.equal(cfg.useTrail, true);
  assert.equal(cfg.lockToEntry, true);
  assert.equal(cfg.trailingActivationPct, 20);
  assert.equal(cfg.trailingEveryPct, 10);
  assert.equal(cfg.trailingShiftPct, 5);
  assert.equal(cfg.useVwapExit, false);
  assert.equal(cfg.initialSlPct, 20);
  assert.equal(cfg.targetPct, 40);
  const book = bookAdapter();
  const result = NiftyVwapStrategy.tick({
    algo,
    now: T0_0900 + BAR,
    feedLive: true,
    minutesToClose: 360,
    futuresBars: [firstBar(24500, 24540)],
    ceBars: [firstBar(100, 118)],
    peBars: [firstBar(110, 96)],
    ceLtp: 118,
    peLtp: 96,
    spot: 24540,
    step: 50,
    expiry: "2026-08-27",
    positions: book.positions,
    adapter: book.adapter,
  });
  assert.equal(result.action, "entry");
  assert.match(algo.lastSignal, /NIFTY FUT GREEN/);
  assert.equal(book.places[0].option, "CE");
  assert.equal(book.places[0].side, "BUY");
  assert.equal(algo.vwapState.stopPrice, TrailingStopManager.initialStop(118, 20));
  assert.equal(algo.vwapState.targetPrice, TrailingStopManager.targetPrice(118, 40));
  assert.equal(algo.vwapState.stopPrice, 94.4);
  assert.equal(algo.vwapState.targetPrice, 165.2);
  const again = NiftyVwapStrategy.tick({
    algo,
    now: T0_0900 + 2 * BAR,
    feedLive: true,
    minutesToClose: 350,
    futuresBars: [firstBar(24500, 24540), bar(1, 24580)],
    ceBars: [firstBar(100, 118), bar(1, 130)],
    peBars: [firstBar(110, 96)],
    ceLtp: 130,
    peLtp: 90,
    positions: book.positions,
    adapter: book.adapter,
  });
  assert.equal(again.action, "hold");
  assert.equal(book.places.length, 1);
});

test("first candle trail uses a saved shift and keeps the old 10/3 row on 20/10/5", () => {
  const saved = niftyFirstCandleConfig({
    trailingActivationPct: 25,
    trailingEveryPct: 8,
    trailingShiftPct: 4,
  });
  assert.equal(saved.useTrail, true);
  assert.equal(saved.lockToEntry, true);
  assert.equal(saved.trailingActivationPct, 25);
  assert.equal(saved.trailingEveryPct, 8);
  assert.equal(saved.trailingShiftPct, 4);
  assert.equal(saved.trailingStepPct, 4);
  assert.equal(TrailingStopManager.nextStop({
    entry: 100,
    mark: 133,
    prevStop: 80,
    initialSlPct: saved.initialSlPct,
    activationPct: saved.trailingActivationPct,
    lockToEntry: saved.lockToEntry,
    trailEveryPct: saved.trailingEveryPct,
    trailShiftPct: saved.trailingShiftPct,
  }), 104);
  const legacy = niftyFirstCandleConfig({ trailingActivationPct: 10, trailingStepPct: 3 });
  assert.equal(legacy.trailingActivationPct, 20);
  assert.equal(legacy.trailingEveryPct, 10);
  assert.equal(legacy.trailingShiftPct, 5);
  assert.equal(crudeFirstCandleConfig({ trailingActivationPct: 25, trailingEveryPct: 8, trailingShiftPct: 4 }).useTrail, false);
  const normalized = normalizeAlgo({
    name: "Desk first candle",
    kind: "nifty-first-candle",
    trailingActivationPct: 25,
    trailingEveryPct: 8,
    trailingShiftPct: 4,
  });
  assert.equal(normalized.trailingActivationPct, 25);
  assert.equal(normalized.trailingEveryPct, 8);
  assert.equal(normalized.trailingShiftPct, 4);
  assert.match(normalized.summary, /trailing SL \+25% to buy, then \+4% every \+8%/);
  const leftover = normalizeAlgo({
    name: "Desk first candle",
    kind: "nifty-first-candle",
    trailingActivationPct: 10,
    trailingStepPct: 3,
  });
  assert.equal(leftover.trailingActivationPct, 20);
  assert.equal(leftover.trailingEveryPct, 10);
  assert.equal(leftover.trailingShiftPct, 5);
});

test("normalizeAlgo keeps first candle paused and editable SL/TGT", () => {
  const created = normalizeAlgo(defaultNiftyFirstCandleAlgo({ name: "Desk first candle", runMode: "live" }));
  assert.equal(isNiftyFirstCandleAlgo(created), true);
  assert.equal(created.enabled, false);
  assert.notEqual(created.status, "LIVE");
  assert.equal(created.dailyLiveIst, "09:00");
  assert.equal(created.firstBarStartIst, "09:00");
  assert.equal(created.entryEvaluationIst, "09:05");
  assert.equal(created.endTimeIst, "15:15");
  assert.equal(created.eodSquareOffMinutes, 15);
  assert.equal(created.expiryKind, "weekly");
  assert.equal(created.maxTradesPerDay, 5);
  assert.equal(created.strikeOffset, 0);
  const oldCap = normalizeAlgo({ ...created, maxTradesPerDay: 1 }, created);
  assert.equal(oldCap.maxTradesPerDay, 5);
  const updated = normalizeAlgo(
    {
      name: "Desk first candle",
      runMode: "live",
      initialSlPct: 18,
      targetPct: 35,
      lots: 2,
      timeframe: "15m",
      dailyLiveIst: "09:05",
      firstBarStartIst: "09:00",
      entryEvaluationIst: "09:05",
      endTimeIst: "15:10",
      expiryKind: "monthly",
      strikeOffset: 1,
      maxTradesPerDay: 2,
    },
    created,
  );
  assert.equal(updated.enabled, false);
  assert.equal(updated.initialSlPct, 18);
  assert.equal(updated.targetPct, 35);
  assert.equal(updated.lots, 2);
  assert.equal(updated.qty, 130);
  assert.equal(updated.timeframe, "15m");
  assert.equal(updated.dailyLiveIst, "09:05");
  assert.equal(updated.entryEvaluationIst, "09:15");
  assert.equal(niftyFirstCandleConfig(updated).barMinutes, 15);
  assert.match(updated.summary, /preview 15m/);
  assert.match(updated.summary, /09:00–09:15/);
  const customClock = normalizeAlgo(
    { name: "Desk first candle", timeframe: "15m", entryEvaluationIst: "09:20" },
    created,
  );
  assert.equal(customClock.timeframe, "15m");
  assert.equal(customClock.entryEvaluationIst, "09:20");
  assert.equal(niftyFirstCandleConfig(customClock).barMinutes, 15);
  const backToFive = normalizeAlgo(
    { name: "Desk first candle", timeframe: "5m", entryEvaluationIst: "09:15" },
    updated,
  );
  assert.equal(backToFive.timeframe, "5m");
  assert.equal(backToFive.entryEvaluationIst, "09:05");
  assert.equal(niftyFirstCandleConfig(backToFive).barMinutes, 5);
  assert.equal(updated.endTimeIst, "15:10");
  assert.equal(updated.eodSquareOffMinutes, 20);
  assert.equal(updated.expiryKind, "monthly");
  assert.equal(updated.strikeOffset, 1);
  assert.equal(updated.maxTradesPerDay, 2);
});

test("first candle checks every later 5m candle and allows five trades a day", () => {
  const laterGreen = {
    time: T0_0900 + BAR,
    open: 24540,
    high: 24580,
    low: 24530,
    close: 24570,
    volume: 1000,
  };
  const laterCe = {
    time: T0_0900 + BAR,
    open: 118,
    high: 140,
    low: 116,
    close: 138,
    volume: 500,
  };
  const signal = VwapSignalEngine.evaluateFirstCandle({
    futuresBars: [firstBar(24500, 24500), laterGreen],
    ceBars: [firstBar(100, 90), laterCe],
    peBars: [firstBar(110, 96)],
    now: T0_0900 + 2 * BAR,
    firstBarStartIst: "09:00",
  });
  assert.equal(signal.niftyColor, "green");
  assert.equal(signal.ceColor, "green");
  assert.equal(signal.buyCe, true);
  assert.equal(signal.barTime, laterGreen.time);
  const algo = defaultNiftyFirstCandleAlgo({ name: "First candle cap" });
  assert.equal(niftyFirstCandleConfig(algo).maxTradesPerDay, 5);
  const book = bookAdapter();
  for (let n = 0; n < 5; n += 1) {
    const time = T0_0900 + n * BAR;
    const fut = { time, open: 24500, high: 24580, low: 24490, close: 24540 + n, volume: 1000 };
    const ce = { time, open: 100, high: 140, low: 98, close: 120 + n, volume: 500 };
    const tick = NiftyVwapStrategy.tick({
      algo,
      now: time + BAR,
      feedLive: true,
      minutesToClose: 360 - n,
      futuresBars: [fut],
      ceBars: [ce],
      peBars: [firstBar(110, 96)],
      ceLtp: 120 + n,
      peLtp: 96,
      spot: 24540,
      step: 50,
      expiry: "2026-08-27",
      positions: book.positions,
      adapter: book.adapter,
    });
    assert.equal(tick.action, "entry");
    book.adapter.exit(book.positions[0]);
    PositionManager.clearOpen(algo.vwapState);
    algo.vwapState.lastEntryBarTime = 0;
  }
  assert.equal(algo.vwapState.sessionTrades, 5);
  assert.equal(book.places.length, 5);
  const sixth = NiftyVwapStrategy.tick({
    algo,
    now: T0_0900 + 6 * BAR,
    feedLive: true,
    minutesToClose: 300,
    futuresBars: [laterGreen],
    ceBars: [laterCe],
    peBars: [firstBar(110, 96)],
    ceLtp: 138,
    peLtp: 90,
    spot: 24570,
    step: 50,
    expiry: "2026-08-27",
    positions: book.positions,
    adapter: book.adapter,
  });
  assert.equal(sixth.reason, "max-trades");
  assert.equal(book.places.length, 5);
});

test("first candle ATM offset is applied to the strike", () => {
  const pick = OptionStrikeSelector.select({ spot: 24540, step: 50, option: "CE", strikeOffset: 1 });
  assert.equal(pick.strike, 24600);
  assert.equal(OptionStrikeSelector.strikeForOffset(22720, 50, 0), 22700);
  assert.equal(OptionStrikeSelector.strikeForOffset(22720, 50, 2), 22800);
  assert.equal(OptionStrikeSelector.strikeForOffset(22720, 50, -2), 22600);
  assert.equal(OptionStrikeSelector.strikeForOffset(22720, 50, 5), 22950);
  assert.equal(OptionStrikeSelector.strikeForOffset(22720, 50, -5), 22450);
  assert.equal(OptionStrikeSelector.strikeForOffset(22720, 50, 9), 22950);
  assert.equal(niftyFirstCandleConfig({ strikeOffset: 5 }).strikeOffset, 5);
  assert.equal(niftyFirstCandleConfig({ strikeOffset: -5 }).strikeOffset, -5);
});

test("first candle ATM+2 and ATM-2 orders use that strike, not ATM", () => {
  const plus = defaultNiftyFirstCandleAlgo({ name: "First candle plus two", strikeOffset: 2 });
  const plusBook = bookAdapter();
  const plusTick = NiftyVwapStrategy.tick({
    algo: plus,
    now: T0_0900 + BAR,
    feedLive: true,
    minutesToClose: 360,
    futuresBars: [firstBar(22680, 22720)],
    ceBars: [firstBar(80, 96)],
    peBars: [firstBar(110, 90)],
    ceLtp: 96,
    peLtp: 90,
    ceSecurityId: "ce-22800",
    peSecurityId: "pe-22800",
    spot: 22720,
    step: 50,
    expiry: "2026-08-27",
    positions: plusBook.positions,
    adapter: plusBook.adapter,
  });
  assert.equal(plusTick.action, "entry");
  assert.equal(plusBook.places[0].strike, 22800);
  assert.equal(plusBook.places[0].symbol, "NIFTY 22800 CE");
  assert.equal(plusBook.places[0].securityId, "ce-22800");
  assert.match(plus.lastSignal, /BUY 22800 CE/);

  const minus = defaultNiftyFirstCandleAlgo({ name: "First candle minus two", strikeOffset: -2 });
  const minusBook = bookAdapter();
  const minusTick = NiftyVwapStrategy.tick({
    algo: minus,
    now: T0_0900 + BAR,
    feedLive: true,
    minutesToClose: 360,
    futuresBars: [firstBar(22720, 22680)],
    ceBars: [firstBar(90, 70)],
    peBars: [firstBar(80, 110)],
    ceLtp: 70,
    peLtp: 110,
    ceSecurityId: "ce-22600",
    peSecurityId: "pe-22600",
    spot: 22720,
    step: 50,
    expiry: "2026-08-27",
    positions: minusBook.positions,
    adapter: minusBook.adapter,
  });
  assert.equal(minusTick.action, "entry");
  assert.equal(minusBook.places[0].strike, 22600);
  assert.equal(minusBook.places[0].option, "PE");
  assert.equal(minusBook.places[0].symbol, "NIFTY 22600 PE");
  assert.equal(minusBook.places[0].securityId, "pe-22600");
});

test("a live option tick at the target exits while the chain price is still behind", () => {
  const algo = defaultNiftyFirstCandleAlgo({ name: "Target tick" });
  const book = bookAdapter();
  const entry = NiftyVwapStrategy.tick({
    algo,
    now: T0_0900 + BAR,
    feedLive: true,
    minutesToClose: 360,
    futuresBars: [firstBar(24500, 24540)],
    ceBars: [firstBar(100, 103.5)],
    peBars: [firstBar(110, 96)],
    ceLtp: 103.5,
    peLtp: 96,
    spot: 24540,
    step: 50,
    expiry: "2026-08-27",
    positions: book.positions,
    adapter: book.adapter,
  });
  assert.equal(entry.action, "entry");
  algo.vwapState.targetPrice = 145;
  book.positions[0].ltp = 145;
  book.positions[0].ticked = true;
  book.positions[0].securityId = "ce-24500";
  const hit = NiftyVwapStrategy.tick({
    algo,
    now: T0_0900 + 2 * BAR,
    feedLive: true,
    minutesToClose: 350,
    futuresBars: [firstBar(24500, 24540), bar(1, 24580)],
    ceBars: [firstBar(100, 103.5), bar(1, 120)],
    peBars: [firstBar(110, 96)],
    ceLtp: 120,
    peLtp: 90,
    positions: book.positions,
    adapter: book.adapter,
  });
  assert.equal(hit.action, "exit");
  assert.equal(hit.reason, "target");
  assert.equal(book.exits.length, 1);
});

test("a target already resting at the broker is not sold a second time", () => {
  const algo = defaultNiftyFirstCandleAlgo({ name: "Target resting" });
  const book = bookAdapter();
  NiftyVwapStrategy.tick({
    algo,
    now: T0_0900 + BAR,
    feedLive: true,
    minutesToClose: 360,
    futuresBars: [firstBar(24500, 24540)],
    ceBars: [firstBar(100, 103.5)],
    peBars: [firstBar(110, 96)],
    ceLtp: 103.5,
    peLtp: 96,
    spot: 24540,
    step: 50,
    expiry: "2026-08-27",
    positions: book.positions,
    adapter: book.adapter,
  });
  algo.vwapState.targetPrice = 145;
  book.positions[0].ltp = 145;
  const hit = NiftyVwapStrategy.tick({
    algo,
    now: T0_0900 + 2 * BAR,
    feedLive: true,
    minutesToClose: 350,
    futuresBars: [firstBar(24500, 24540), bar(1, 24580)],
    ceBars: [firstBar(100, 103.5), bar(1, 145)],
    peBars: [firstBar(110, 96)],
    ceLtp: 145,
    peLtp: 90,
    positions: book.positions,
    adapter: book.adapter,
    targetResting: true,
  });
  assert.equal(hit.action, "exit-pending");
  assert.equal(hit.reason, "target");
  assert.equal(book.exits.length, 0);
  assert.equal(book.positions.length, 1);
});

test("a pending market SELL on the book does not close the same position again", () => {
  const algo = defaultNiftyFirstCandleAlgo({ name: "Pending SELL" });
  const book = bookAdapter();
  NiftyVwapStrategy.tick({
    algo,
    now: T0_0900 + BAR,
    feedLive: true,
    minutesToClose: 360,
    futuresBars: [firstBar(24500, 24540)],
    ceBars: [firstBar(100, 103.5)],
    peBars: [firstBar(110, 96)],
    ceLtp: 103.5,
    peLtp: 96,
    spot: 24540,
    step: 50,
    expiry: "2026-08-27",
    positions: book.positions,
    adapter: book.adapter,
  });
  algo.vwapState.targetPrice = 145;
  algo.vwapState.exitQueued = false;
  book.positions[0].ltp = 145;
  const hit = NiftyVwapStrategy.tick({
    algo,
    now: T0_0900 + 2 * BAR,
    feedLive: true,
    minutesToClose: 350,
    futuresBars: [firstBar(24500, 24540), bar(1, 24580)],
    ceBars: [firstBar(100, 103.5), bar(1, 145)],
    peBars: [firstBar(110, 96)],
    ceLtp: 145,
    peLtp: 90,
    positions: book.positions,
    adapter: book.adapter,
    orders: [
      {
        strategy: algo.name,
        side: "SELL",
        status: "PENDING",
        symbol: book.positions[0].symbol,
        option: book.positions[0].option,
        strike: book.positions[0].strike,
      },
    ],
  });
  assert.equal(hit.action, "exit-pending");
  assert.equal(book.exits.length, 0);
  assert.equal(book.positions.length, 1);
});

test("live exit keeps the contract id so the broker send does not wait on a lookup", () => {
  const queued = [];
  const live = LiveTradingAdapter({
    queueLiveOrder: (row) => {
      queued.push(row);
      return { ok: true, queued: true, status: "PENDING" };
    },
  });
  const result = live.exit({
    symbol: "NIFTY 24500 CE",
    qty: 65,
    strike: 24500,
    option: "CE",
    expiry: "2026-08-27",
    securityId: "998877",
    strategy: "NIFTY 5m first candle",
    brokerId: "dhan",
  });
  assert.equal(result.queued, true);
  assert.equal(queued[0].securityId, "998877");
  assert.equal(queued[0].type, "MARKET");
  assert.equal(queued[0].cancelArmedTarget, true);
});

test("first candle 20% SL is 80 and 40% target is 140 on a 100 fill", () => {
  assert.equal(TrailingStopManager.initialStop(100, 20), 80);
  assert.equal(TrailingStopManager.targetPrice(100, 40), 140);
});

test("first candle WAIT CE prints the selected strike on the preview line", () => {
  const algo = defaultNiftyFirstCandleAlgo({ name: "Wait CE strike" });
  const book = bookAdapter();
  const tick = NiftyVwapStrategy.tick({
    algo,
    now: T0_0900 + 2 * BAR,
    feedLive: true,
    minutesToClose: 360,
    futuresBars: [firstBar(22510.6, 22523.6)],
    ceBars: [],
    peBars: [],
    ceLtp: 0,
    peLtp: 0,
    spot: 22523.6,
    step: 50,
    expiry: "2026-08-27",
    positions: book.positions,
    adapter: book.adapter,
  });
  assert.equal(tick.action, "wait");
  assert.equal(tick.reason, "wait-ce");
  assert.match(algo.lastSignal, /WAIT · PREVIEW NIFTY FUT GREEN CE 22500 O 22510\.60 C 22523\.60/);
  assert.match(algo.lastSignal, /09:00–09:05 IST/);
  assert.match(algo.lastSignal, /WAIT CE 22500/);
});

test("first candle no-trade line prints the Nifty future candle", () => {
  const algo = defaultNiftyFirstCandleAlgo({ name: "Fut OHLC" });
  const book = bookAdapter();
  const tick = NiftyVwapStrategy.tick({
    algo,
    now: T0_0900 + 2 * BAR,
    feedLive: true,
    minutesToClose: 360,
    futuresBars: [firstBar(22663, 22647.5)],
    ceBars: [firstBar(100, 90)],
    peBars: [firstBar(120, 100)],
    ceLtp: 90,
    peLtp: 100,
    spot: 22647.5,
    step: 50,
    expiry: "2026-08-27",
    positions: book.positions,
    adapter: book.adapter,
  });
  assert.equal(tick.action, "wait");
  assert.equal(tick.reason, "pe-not-green");
  assert.equal(book.places.length, 0);
  assert.match(algo.lastSignal, /NO TRADE · PREVIEW NIFTY FUT RED PE 22650 RED O 22663\.00 C 22647\.50/);
  assert.match(algo.lastSignal, /09:00–09:05 IST/);
  assert.doesNotMatch(algo.lastSignal, /22678/);
});

test("preview candle is checked when the current candle opens, not from the current close", () => {
  assert.equal(sessionBarOpenMs(Date.parse("2026-08-21T03:32:00.000Z"), 5, { sessionOpenMinutes: 9 * 60 }), T0_0900);
  assert.equal(sessionBarOpenMs(Date.parse("2026-08-21T03:32:00.000Z"), 5), null);
  const early = VwapSignalEngine.evaluateFirstCandle({
    futuresBars: [firstBar(24500, 24540)],
    ceBars: [firstBar(100, 118)],
    peBars: [firstBar(110, 96)],
    now: T0_0900 + BAR - 1000,
  });
  assert.equal(early.waitingEval, true);
  assert.equal(early.buyCe, false);
  assert.equal(early.buyPe, false);
  const laterOnly = VwapSignalEngine.evaluateFirstCandle({
    futuresBars: [
      {
        time: T0,
        open: 24500,
        high: 24580,
        low: 24490,
        close: 24570,
        volume: 1000,
      },
    ],
    ceBars: [
      {
        time: T0,
        open: 100,
        high: 140,
        low: 98,
        close: 138,
        volume: 500,
      },
    ],
    peBars: [firstBar(110, 96)],
    now: T0 + BAR,
    firstBarStartIst: "09:00",
    entryEvaluationIst: "09:05",
  });
  assert.equal(laterOnly.buyCe, true);
  assert.equal(laterOnly.niftyColor, "green");
  assert.equal(laterOnly.futuresOpen, 24500);
  assert.equal(laterOnly.futuresClose, 24570);
  assert.equal(laterOnly.onCurrentOpen, true);
});

test("matched first-candle still sends after the next 5m window has already opened", () => {
  const now = T0_0900 + 2 * BAR + 30_000;
  const signal = VwapSignalEngine.evaluateFirstCandle({
    futuresBars: [firstBar(22663, 22680)],
    ceBars: [firstBar(100, 118)],
    peBars: [firstBar(110, 96)],
    now,
  });
  assert.equal(signal.buyCe, true);
  assert.equal(signal.onCurrentOpen, false);
  assert.equal(signal.niftyColor, "green");
  assert.equal(signal.ceColor, "green");
  const algo = defaultNiftyFirstCandleAlgo({ name: "Late CE" });
  const book = bookAdapter();
  const tick = NiftyVwapStrategy.tick({
    algo,
    now,
    feedLive: true,
    minutesToClose: 360,
    futuresBars: [firstBar(22663, 22680)],
    ceBars: [firstBar(100, 118)],
    peBars: [firstBar(110, 96)],
    ceLtp: 118,
    peLtp: 96,
    spot: 22680,
    step: 50,
    expiry: "2026-08-27",
    positions: book.positions,
    adapter: book.adapter,
  });
  assert.equal(tick.action, "entry");
  assert.equal(book.places[0].option, "CE");
  assert.equal(book.places[0].side, "BUY");
  assert.match(algo.lastSignal, /BUY 22700 CE/);
});

test("crude keeps checking every 5m candle until a signal is found", () => {
  const laterDoji = { time: T0_0900 + BAR, open: 6120, high: 6122, low: 6118, close: 6120, volume: 100 };
  const laterCe = { time: T0_0900 + BAR, open: 90, high: 91, low: 88, close: 89, volume: 50 };
  const now = T0_0900 + 2 * BAR;
  const latestOnly = VwapSignalEngine.evaluateFirstCandle({
    futuresBars: [firstBar(6100, 6120), laterDoji],
    ceBars: [firstBar(80, 90), laterCe],
    peBars: [firstBar(70, 60)],
    now,
    endTimeIst: "23:15",
  });
  assert.equal(latestOnly.buyCe, false);
  const scan = VwapSignalEngine.evaluateFirstCandle({
    futuresBars: [firstBar(6100, 6120), laterDoji],
    ceBars: [firstBar(80, 90), laterCe],
    peBars: [firstBar(70, 60)],
    now,
    endTimeIst: "23:15",
    scanUntilSignal: true,
  });
  assert.equal(scan.buyCe, true);
  assert.equal(scan.barTime, T0_0900);
  const algo = defaultCrudeFirstCandleAlgo({ name: "CRUDE every 5m" });
  const book = bookAdapter();
  const tick = NiftyVwapStrategy.tick({
    algo,
    now,
    feedLive: true,
    minutesToClose: 800,
    futuresBars: [firstBar(6100, 6120), laterDoji],
    ceBars: [firstBar(80, 90), laterCe],
    peBars: [firstBar(70, 60)],
    ceLtp: 90,
    peLtp: 60,
    spot: 6120,
    step: 50,
    expiry: "2026-10-19",
    positions: book.positions,
    adapter: book.adapter,
  });
  assert.equal(tick.action, "entry");
  assert.equal(book.places[0].option, "CE");
  assert.equal(book.places[0].symbol, "CRUDEOIL 6100 CE");
});

test("matched crude first-candle still sends one order after the next 5m window", () => {
  const now = T0_0900 + 2 * BAR + 30_000;
  const signal = VwapSignalEngine.evaluateFirstCandle({
    futuresBars: [firstBar(6100, 6120)],
    ceBars: [firstBar(80, 90)],
    peBars: [firstBar(70, 60)],
    now,
    endTimeIst: "23:15",
    firstBarStartIst: "09:00",
    entryEvaluationIst: "09:05",
  });
  assert.equal(signal.buyCe, true);
  assert.equal(signal.onCurrentOpen, false);
  assert.equal(signal.niftyColor, "green");
  assert.equal(signal.ceColor, "green");
  const algo = defaultCrudeFirstCandleAlgo({ name: "CRUDE late CE" });
  const book = bookAdapter();
  const tick = NiftyVwapStrategy.tick({
    algo,
    now,
    feedLive: true,
    minutesToClose: 800,
    futuresBars: [firstBar(6100, 6120)],
    ceBars: [firstBar(80, 90)],
    peBars: [firstBar(70, 60)],
    ceLtp: 90,
    peLtp: 60,
    spot: 6120,
    step: 50,
    expiry: "2026-10-19",
    positions: book.positions,
    adapter: book.adapter,
  });
  assert.equal(tick.action, "entry");
  assert.equal(book.places[0].option, "CE");
  assert.equal(book.places[0].side, "BUY");
  assert.equal(book.places[0].symbol, "CRUDEOIL 6100 CE");
  assert.match(algo.lastSignal, /PREVIEW CRUDE FUT GREEN \+ CE 6100 GREEN/);
  const again = NiftyVwapStrategy.tick({
    algo,
    now: now + 60_000,
    feedLive: true,
    minutesToClose: 800,
    futuresBars: [firstBar(6100, 6120)],
    ceBars: [firstBar(80, 90)],
    peBars: [firstBar(70, 60)],
    ceLtp: 90,
    peLtp: 60,
    spot: 6120,
    step: 50,
    expiry: "2026-10-19",
    positions: book.positions,
    adapter: book.adapter,
  });
  assert.notEqual(again.action, "entry");
  assert.equal(book.places.length, 1);
});

test("preview candle open and close buy CE when the next candle opens", () => {
  const forming = VwapSignalEngine.evaluateFirstCandle({
    futuresBars: [firstBar(22663, 22680)],
    ceBars: [firstBar(100, 118)],
    peBars: [firstBar(110, 96)],
    now: T0_0900 + 60_000,
  });
  assert.equal(forming.buyCe, false);
  const now = T0_0900 + BAR;
  const signal = VwapSignalEngine.evaluateFirstCandle({
    futuresBars: [firstBar(22663, 22680)],
    ceBars: [firstBar(100, 118)],
    peBars: [firstBar(110, 96)],
    now,
  });
  assert.equal(signal.buyCe, true);
  assert.equal(signal.niftyColor, "green");
  assert.equal(signal.ceColor, "green");
  assert.equal(signal.futuresOpen, 22663);
  assert.equal(signal.futuresClose, 22680);
  const algo = defaultNiftyFirstCandleAlgo({ name: "Preview CE" });
  const book = bookAdapter();
  const tick = NiftyVwapStrategy.tick({
    algo,
    now,
    feedLive: true,
    minutesToClose: 360,
    futuresBars: [firstBar(22663, 22680)],
    ceBars: [firstBar(100, 118)],
    peBars: [firstBar(110, 96)],
    ceLtp: 118,
    peLtp: 96,
    spot: 22680,
    step: 50,
    expiry: "2026-08-27",
    positions: book.positions,
    adapter: book.adapter,
  });
  assert.equal(tick.action, "entry");
  assert.equal(book.places[0].option, "CE");
  assert.equal(book.places[0].side, "BUY");
  assert.match(algo.lastSignal, /PREVIEW NIFTY FUT GREEN \+ CE 22700 GREEN O 22663\.00 C 22680\.00/);
});

test("preview candle open and close buy PE at the next open, and the current close is ignored", () => {
  const preview = {
    time: T0_0900 + BAR,
    open: 22680,
    high: 22690,
    low: 22640,
    close: 22647.5,
    volume: 1000,
  };
  const cePreview = {
    time: T0_0900 + BAR,
    open: 118,
    high: 120,
    low: 90,
    close: 100,
    volume: 500,
  };
  const pePreview = {
    time: T0_0900 + BAR,
    open: 80,
    high: 110,
    low: 78,
    close: 105,
    volume: 500,
  };
  const whileCurrentForms = VwapSignalEngine.evaluateFirstCandle({
    futuresBars: [firstBar(24500, 24500), preview],
    ceBars: [firstBar(118, 100), cePreview],
    peBars: [firstBar(110, 96), pePreview],
    now: T0_0900 + BAR + 60_000,
  });
  assert.equal(whileCurrentForms.buyPe, false);
  assert.equal(whileCurrentForms.barTime, T0_0900);
  const now = T0_0900 + 2 * BAR;
  const signal = VwapSignalEngine.evaluateFirstCandle({
    futuresBars: [firstBar(24500, 24540), preview],
    ceBars: [firstBar(100, 118), cePreview],
    peBars: [firstBar(110, 96), pePreview],
    now,
  });
  assert.equal(signal.buyPe, true);
  assert.equal(signal.buyCe, false);
  assert.equal(signal.peColor, "green");
  assert.equal(signal.niftyColor, "red");
  assert.equal(signal.barTime, preview.time);
  assert.equal(signal.futuresOpen, 22680);
  assert.equal(signal.futuresClose, 22647.5);
  const algo = defaultNiftyFirstCandleAlgo({ name: "Preview PE" });
  const book = bookAdapter();
  const tick = NiftyVwapStrategy.tick({
    algo,
    now,
    feedLive: true,
    minutesToClose: 360,
    futuresBars: [firstBar(24500, 24540), preview],
    ceBars: [firstBar(100, 118), cePreview],
    peBars: [firstBar(110, 96), pePreview],
    ceLtp: 100,
    peLtp: 105,
    spot: 22647.5,
    step: 50,
    expiry: "2026-08-27",
    positions: book.positions,
    adapter: book.adapter,
  });
  assert.equal(tick.action, "entry");
  assert.equal(book.places[0].option, "PE");
  assert.equal(book.places[0].side, "BUY");
  assert.match(algo.lastSignal, /PREVIEW NIFTY FUT RED \+ PE 22650 GREEN O 22680\.00 C 22647\.50/);
});

test("first candle duplicate bar and restart do not place a second order", () => {
  const algo = defaultNiftyFirstCandleAlgo({ name: "First candle once" });
  const book = bookAdapter();
  const input = {
    algo,
    now: T0_0900 + BAR,
    feedLive: true,
    minutesToClose: 360,
    futuresBars: [firstBar(24500, 24540)],
    ceBars: [firstBar(100, 118)],
    peBars: [firstBar(110, 96)],
    ceLtp: 118,
    peLtp: 96,
    spot: 24540,
    step: 50,
    expiry: "2026-08-27",
    positions: book.positions,
    adapter: book.adapter,
  };
  assert.equal(NiftyVwapStrategy.tick(input).action, "entry");
  const dup = NiftyVwapStrategy.tick(input);
  assert.ok(dup.action === "hold" || dup.reason === "duplicate-bar" || dup.reason === "already-open");
  assert.equal(book.places.length, 1);
  const restored = defaultNiftyFirstCandleAlgo({ name: "First candle once" });
  restored.vwapState = JSON.parse(JSON.stringify(algo.vwapState));
  const afterRestart = NiftyVwapStrategy.tick({
    ...input,
    algo: restored,
    positions: book.positions,
  });
  assert.ok(afterRestart.action === "hold" || afterRestart.reason === "duplicate-bar" || afterRestart.reason === "already-open");
  assert.equal(book.places.length, 1);
});

test("only one buy is sent until that order is squared off", () => {
  const algo = defaultNiftyFirstCandleAlgo({ name: "One buy at a time" });
  const places = [];
  const adapter = {
    place(payload) {
      places.push(payload);
      return { queued: true, status: "PENDING" };
    },
    exit() {
      return { queued: true };
    },
  };
  const tickAt = (n, extra = {}) => {
    const time = T0_0900 + n * BAR;
    return NiftyVwapStrategy.tick({
      algo,
      now: time + BAR,
      feedLive: true,
      minutesToClose: 360,
      futuresBars: [{ time, open: 24500, high: 24580, low: 24490, close: 24540 + n, volume: 1000 }],
      ceBars: [{ time, open: 100, high: 140, low: 98, close: 120 + n, volume: 500 }],
      peBars: [firstBar(110, 96)],
      ceLtp: 120 + n,
      peLtp: 96,
      spot: 24540,
      step: 50,
      expiry: "2026-08-27",
      positions: extra.positions || [],
      orders: extra.orders || [],
      adapter,
    });
  };
  const first = tickAt(0);
  assert.equal(first.action, "queued");
  assert.equal(places.length, 1);
  assert.equal(algo.vwapState.buyPhase, "entry");
  algo.vwapState.inFlight = false;
  algo.vwapState.lastEntryAt = T0_0900;
  const second = tickAt(1, {
    orders: [{ id: "b1", strategy: algo.name, side: "BUY", status: "PENDING" }],
  });
  assert.equal(second.reason, "buy-active");
  assert.equal(places.length, 1);
  assert.equal(algo.lastSignal, "WAIT ORDER");
  const held = tickAt(2, {
    positions: [
      {
        symbol: "NIFTY 24550 CE",
        type: "BUY",
        qty: 65,
        avg: 120,
        ltp: 122,
        strategy: algo.name,
        option: "CE",
        strike: 24550,
      },
    ],
    orders: [{ id: "b1", strategy: algo.name, side: "BUY", status: "FILLED", filledQty: 65 }],
  });
  assert.equal(places.length, 1);
  assert.ok(held.action === "hold" || held.reason === "already-open");
  assert.equal(algo.vwapState.buyPhase, "open");
  const stillOpen = tickAt(3, {
    positions: [
      {
        symbol: "NIFTY 24550 CE",
        type: "BUY",
        qty: 65,
        avg: 120,
        ltp: 122,
        strategy: algo.name,
        option: "CE",
        strike: 24550,
      },
    ],
  });
  assert.equal(places.length, 1);
  assert.ok(stillOpen.action === "hold" || stillOpen.reason === "already-open");
  PositionManager.clearOpen(algo.vwapState);
  const afterSquareOff = tickAt(4, {
    orders: [
      { id: "s1", strategy: algo.name, side: "SELL", status: "FILLED", filledQty: 65 },
      { id: "b1", strategy: algo.name, side: "BUY", status: "FILLED", filledQty: 65 },
    ],
  });
  assert.equal(afterSquareOff.action, "queued");
  assert.equal(places.length, 2);
});

test("a new session drops yesterday's buy lock and can send a new order", () => {
  const algo = defaultNiftyFirstCandleAlgo({ name: "New session record" });
  algo.vwapState = {
    sessionDate: "2026-08-20",
    buyPhase: "entry",
    inFlight: true,
    lastEntryAt: Date.parse("2026-08-20T04:00:00.000Z"),
    lastEntryBarTime: Date.parse("2026-08-20T04:00:00.000Z"),
    sessionTrades: 3,
    fillPrice: 40,
    lockedStrike: 22600,
    lockedOption: "PE",
  };
  const book = bookAdapter();
  const tick = NiftyVwapStrategy.tick({
    algo,
    now: T0_0900 + BAR,
    feedLive: true,
    minutesToClose: 360,
    futuresBars: [firstBar(24500, 24540)],
    ceBars: [firstBar(100, 118)],
    peBars: [firstBar(110, 96)],
    ceLtp: 118,
    peLtp: 96,
    spot: 24540,
    step: 50,
    expiry: "2026-08-27",
    positions: [],
    orders: [{ id: "old", strategy: algo.name, side: "BUY", status: "PENDING" }],
    adapter: book.adapter,
  });
  assert.equal(algo.vwapState.sessionDate, "2026-08-21");
  assert.notEqual(tick.reason, "buy-active");
  assert.equal(tick.action, "entry");
  assert.equal(book.places.length, 1);
  assert.equal(algo.vwapState.sessionTrades, 1);
});

test("an already-rolled session still releases yesterday's entry when nothing is open", () => {
  const algo = defaultNiftyFirstCandleAlgo({ name: "Rolled stale lock" });
  algo.vwapState = {
    sessionDate: "2026-08-21",
    buyPhase: "entry",
    inFlight: false,
    lastEntryAt: Date.parse("2026-08-20T04:00:00.000Z"),
    lastEntryBarTime: Date.parse("2026-08-20T04:00:00.000Z"),
    sessionTrades: 1,
  };
  const book = bookAdapter();
  const tick = NiftyVwapStrategy.tick({
    algo,
    now: T0_0900 + BAR,
    feedLive: true,
    minutesToClose: 360,
    futuresBars: [firstBar(24500, 24540)],
    ceBars: [firstBar(100, 118)],
    peBars: [firstBar(110, 96)],
    ceLtp: 118,
    peLtp: 96,
    spot: 24540,
    step: 50,
    expiry: "2026-08-27",
    positions: [],
    orders: [],
    adapter: book.adapter,
  });
  assert.notEqual(tick.reason, "buy-active");
  assert.equal(tick.action, "entry");
  assert.equal(book.places.length, 1);
  assert.equal(algo.vwapState.sessionTrades, 2);
});

test("same-day entry lock stays while the order book is still empty", () => {
  const algo = defaultNiftyFirstCandleAlgo({ name: "Same day lock" });
  algo.vwapState = {
    sessionDate: "2026-08-21",
    buyPhase: "entry",
    inFlight: false,
    lastEntryAt: T0_0900,
    lastEntryBarTime: T0_0900,
  };
  const tick = NiftyVwapStrategy.tick({
    algo,
    now: T0_0900 + 2 * BAR,
    feedLive: true,
    minutesToClose: 360,
    futuresBars: [firstBar(24500, 24540), { time: T0_0900 + BAR, open: 24540, high: 24580, low: 24520, close: 24560, volume: 1000 }],
    ceBars: [firstBar(100, 118), { time: T0_0900 + BAR, open: 118, high: 140, low: 110, close: 130, volume: 500 }],
    peBars: [firstBar(110, 96)],
    ceLtp: 130,
    peLtp: 96,
    spot: 24560,
    step: 50,
    expiry: "2026-08-27",
    positions: [],
    orders: [],
    adapter: { place: () => ({ queued: true, status: "PENDING" }), exit: () => ({}) },
  });
  assert.equal(tick.reason, "buy-active");
  assert.equal(algo.lastSignal, "WAIT ORDER");
  assert.equal(algo.vwapState.buyPhase, "entry");
});

test("a rejected buy is resolved and the next buy can be sent", () => {
  const algo = defaultNiftyFirstCandleAlgo({ name: "Rejected buy can retry" });
  const places = [];
  const adapter = {
    place(payload) {
      places.push(payload);
      return { queued: true, status: "PENDING" };
    },
    exit() {
      return { ok: true };
    },
  };
  const tickAt = (n, orders = []) => {
    const time = T0_0900 + n * BAR;
    return NiftyVwapStrategy.tick({
      algo,
      now: time + BAR,
      feedLive: true,
      minutesToClose: 360,
      futuresBars: [{ time, open: 24500, high: 24580, low: 24490, close: 24540 + n, volume: 1000 }],
      ceBars: [{ time, open: 100, high: 140, low: 98, close: 120 + n, volume: 500 }],
      peBars: [firstBar(110, 96)],
      ceLtp: 120,
      peLtp: 96,
      spot: 24540,
      step: 50,
      expiry: "2026-08-27",
      positions: [],
      orders,
      adapter,
    });
  };
  assert.equal(tickAt(0).action, "queued");
  algo.vwapState.inFlight = false;
  const released = tickAt(1, [{ id: "rej-1", strategy: algo.name, side: "BUY", status: "REJECTED", filledQty: 0 }]);
  assert.equal(released.action, "queued");
  assert.equal(places.length, 2);
  assert.equal(algo.vwapState.buyPhase, "entry");
});

test("normalizeAlgo rematerializes first candle even if kind was saved as indicator", () => {
  const restored = normalizeAlgo({
    id: "a10",
    name: "NIFTY 5m first candle",
    kind: "indicator",
    indicator: "NIFTY_FIRST_CANDLE",
    runMode: "live",
  });
  assert.equal(isNiftyFirstCandleAlgo(restored), true);
  assert.equal(restored.kind, "nifty-first-candle");
  assert.equal(restored.enabled, false);
});

test("crude oil preview candle uses the same buy and leaves the nifty strategy unchanged", () => {
  const nifty = defaultNiftyFirstCandleAlgo({ name: "NIFTY 5m first candle" });
  const crude = defaultCrudeFirstCandleAlgo({ name: "CRUDE OIL 5m first candle", enabled: true });
  assert.equal(nifty.name, "NIFTY");
  assert.equal(crude.name, "CRUDE OIL");
  assert.equal(isNiftyFirstCandleAlgo({ name: "NIFTY" }), true);
  assert.equal(isCrudeFirstCandleAlgo({ name: "CRUDE OIL" }), true);
  assert.equal(isNiftyFirstCandleAlgo(nifty), true);
  assert.equal(isCrudeFirstCandleAlgo(nifty), false);
  assert.equal(isNiftyOptionEngineAlgo(nifty), true);
  assert.equal(isCrudeFirstCandleAlgo(crude), true);
  assert.equal(isNiftyFirstCandleAlgo(crude), false);
  assert.equal(isNiftyOptionEngineAlgo(crude), false);
  assert.equal(isCrudeFirstCandleAlgo({ name: "CRUDE OIL 5 m first candle", kind: "indicator", symbol: "CRUDEOIL" }), true);
  assert.equal(isNiftyOptionEngineAlgo({ name: "CRUDE OIL 5 m first candle", kind: "indicator", symbol: "CRUDEOIL" }), false);
  assert.equal(isNiftyFirstCandleAlgo({ name: "CRUDE OIL 5 m first candle", kind: "indicator" }), false);
  assert.equal(isCrudeFirstCandleAlgo({ name: "CRUDE OIL VWAP ATM", kind: "indicator", symbol: "CRUDEOIL" }), false);
  assert.equal(crude.enabled, false);
  const cfg = crudeFirstCandleConfig(crude);
  assert.equal(cfg.symbol, "CRUDEOIL");
  assert.equal(cfg.lotSize, 100);
  assert.equal(cfg.qty, 100);
  assert.equal(cfg.expiryKind, "monthly");
  assert.equal(cfg.endTimeIst, "23:15");
  assert.equal(cfg.signalMode, "first-candle");
  assert.equal(niftyFirstCandleConfig(nifty).symbol, "NIFTY");
  assert.equal(niftyFirstCandleConfig(nifty).endTimeIst, "15:15");
  assert.equal(niftyFirstCandleConfig(nifty).lotSize, 65);

  const now = T0_0900 + BAR;
  const book = bookAdapter();
  const tick = NiftyVwapStrategy.tick({
    algo: crude,
    now,
    feedLive: true,
    minutesToClose: 800,
    futuresBars: [firstBar(6100, 6120)],
    ceBars: [firstBar(80, 90)],
    peBars: [firstBar(70, 60)],
    ceLtp: 90,
    peLtp: 60,
    spot: 6120,
    step: 50,
    expiry: "2026-10-19",
    positions: book.positions,
    adapter: book.adapter,
  });
  assert.equal(tick.action, "entry");
  assert.match(crude.lastSignal, /PREVIEW CRUDE FUT GREEN \+ CE 6100 GREEN/);
  assert.equal(book.places[0].symbol, "CRUDEOIL 6100 CE");
  assert.equal(book.places[0].qty, 100);
  assert.equal(book.places[0].lots, 1);
  assert.equal(book.places[0].lotSize, 100);
  assert.equal(book.places[0].exchangeSegment, "MCX_COMM");

  const niftyBook = bookAdapter();
  const niftyAlgo = defaultNiftyFirstCandleAlgo({ name: "NIFTY 5m first candle" });
  const niftyTick = NiftyVwapStrategy.tick({
    algo: niftyAlgo,
    now,
    feedLive: true,
    minutesToClose: 360,
    futuresBars: [firstBar(22663, 22680)],
    ceBars: [firstBar(100, 118)],
    peBars: [firstBar(110, 96)],
    ceLtp: 118,
    peLtp: 96,
    spot: 22680,
    step: 50,
    expiry: "2026-10-06",
    positions: niftyBook.positions,
    adapter: niftyBook.adapter,
  });
  assert.equal(niftyTick.action, "entry");
  assert.match(niftyAlgo.lastSignal, /PREVIEW NIFTY FUT GREEN \+ CE 22700 GREEN/);
  assert.match(niftyBook.places[0].symbol, /^NIFTY \d+ CE$/);
  assert.equal(niftyBook.places[0].qty, 65);
  assert.equal(niftyBook.places[0].lots, 1);
  assert.equal(niftyBook.places[0].lotSize, 65);
  assert.equal(niftyBook.places[0].exchangeSegment, "NSE_FNO");
  assert.equal(niftyBook.places[0].product, "MIS");
  assert.equal(niftyBook.places[0].side, book.places[0].side);
  assert.equal(niftyBook.places[0].type, book.places[0].type);

  const forming = defaultCrudeFirstCandleAlgo({ name: "CRUDE forming" });
  const formingBook = bookAdapter();
  const skipped = NiftyVwapStrategy.tick({
    algo: forming,
    now: T0_0900 + 60_000,
    feedLive: true,
    minutesToClose: 800,
    futuresBars: [firstBar(6100, 6120)],
    ceBars: [firstBar(80, 90)],
    peBars: [firstBar(70, 60)],
    ceLtp: 90,
    peLtp: 60,
    spot: 6120,
    step: 50,
    expiry: "2026-10-19",
    positions: formingBook.positions,
    adapter: formingBook.adapter,
  });
  assert.notEqual(skipped.action, "entry");
  assert.equal(formingBook.places.length, 0);

  const evening = T0_0900 + 12 * 60 * 60 * 1000;
  const eveningBar = { time: evening, open: 6100, high: 6130, low: 6090, close: 6120, volume: 20 };
  const eveningCe = { time: evening, open: 40, high: 48, low: 39, close: 46, volume: 8 };
  const eveningPe = { time: evening, open: 40, high: 42, low: 30, close: 32, volume: 8 };
  const mcx = VwapSignalEngine.evaluateFirstCandle({
    futuresBars: [eveningBar],
    ceBars: [eveningCe],
    peBars: [eveningPe],
    now: evening + BAR,
    endTimeIst: "23:15",
    firstBarStartIst: "09:00",
    entryEvaluationIst: "09:05",
  });
  assert.equal(mcx.buyCe, true);
  const nseHours = VwapSignalEngine.evaluateFirstCandle({
    futuresBars: [eveningBar],
    ceBars: [eveningCe],
    peBars: [eveningPe],
    now: evening + BAR,
    endTimeIst: "15:15",
  });
  assert.equal(nseHours.buyCe, false);
});

test("crude max trades input is kept, and one signal places one order", () => {
  assert.equal(crudeFirstCandleConfig({ maxTradesPerDay: 1 }).maxTradesPerDay, 1);
  assert.equal(crudeFirstCandleConfig({ maxTradesPerDay: 3 }).maxTradesPerDay, 3);
  assert.equal(crudeFirstCandleConfig({}).maxTradesPerDay, 5);
  assert.equal(niftyFirstCandleConfig({ maxTradesPerDay: 1 }).maxTradesPerDay, 5);
  const saved = normalizeAlgo(
    { maxTradesPerDay: 2 },
    defaultCrudeFirstCandleAlgo({ name: "CRUDE OIL 5m first candle", maxTradesPerDay: 5 }),
  );
  assert.equal(saved.maxTradesPerDay, 2);
  assert.equal(saved.kind, "crude-first-candle");

  const algo = defaultCrudeFirstCandleAlgo({ name: "CRUDE one signal", maxTradesPerDay: 5 });
  const book = bookAdapter();
  const bar = firstBar(6100, 6120);
  const input = {
    algo,
    now: T0_0900 + BAR,
    feedLive: true,
    minutesToClose: 800,
    futuresBars: [bar],
    ceBars: [firstBar(80, 90)],
    peBars: [firstBar(70, 60)],
    ceLtp: 90,
    peLtp: 60,
    spot: 6120,
    step: 50,
    expiry: "2026-10-19",
    positions: book.positions,
    adapter: book.adapter,
  };
  assert.equal(NiftyVwapStrategy.tick(input).action, "entry");
  noteBrokerRejection(algo);
  book.positions.length = 0;
  algo.vwapState.lastEntryBarTime = 0;
  algo.vwapState.inFlight = false;
  for (let n = 0; n < 4; n += 1) {
    const again = NiftyVwapStrategy.tick({ ...input, positions: book.positions });
    assert.notEqual(again.action, "entry");
    assert.ok(again.reason === "duplicate-bar" || again.action === "wait");
  }
  assert.equal(book.places.length, 1);

  const capped = defaultCrudeFirstCandleAlgo({ name: "CRUDE max 2", maxTradesPerDay: 2 });
  const capBook = bookAdapter();
  for (let n = 0; n < 2; n += 1) {
    const time = T0_0900 + n * BAR;
    const tick = NiftyVwapStrategy.tick({
      algo: capped,
      now: time + BAR,
      feedLive: true,
      minutesToClose: 800,
      futuresBars: [{ time, open: 6100, high: 6130, low: 6090, close: 6120, volume: 10 }],
      ceBars: [{ time, open: 80, high: 95, low: 78, close: 90, volume: 5 }],
      peBars: [firstBar(70, 60)],
      ceLtp: 90,
      peLtp: 60,
      spot: 6120,
      step: 50,
      expiry: "2026-10-19",
      positions: capBook.positions,
      adapter: capBook.adapter,
    });
    assert.equal(tick.action, "entry");
    capBook.adapter.exit(capBook.positions[0]);
    PositionManager.clearOpen(capped.vwapState);
    capped.vwapState.lastEntryBarTime = 0;
  }
  assert.equal(capBook.places.length, 2);
  const third = NiftyVwapStrategy.tick({
    algo: capped,
    now: T0_0900 + 3 * BAR,
    feedLive: true,
    minutesToClose: 800,
    futuresBars: [{ time: T0_0900 + 2 * BAR, open: 6100, high: 6130, low: 6090, close: 6120, volume: 10 }],
    ceBars: [{ time: T0_0900 + 2 * BAR, open: 80, high: 95, low: 78, close: 90, volume: 5 }],
    peBars: [firstBar(70, 60)],
    ceLtp: 90,
    peLtp: 60,
    spot: 6120,
    step: 50,
    expiry: "2026-10-19",
    positions: capBook.positions,
    adapter: capBook.adapter,
  });
  assert.equal(third.reason, "max-trades");
  assert.equal(capBook.places.length, 2);
});
