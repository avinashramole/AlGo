import assert from "node:assert/strict";
import test from "node:test";
import { OptionStrikeSelector } from "./OptionStrikeSelector.js";
import { RiskManager } from "./RiskManager.js";
import { TrailingStopManager } from "./TrailingStopManager.js";
import { NiftyVwapStrategy, noteBrokerRejection, noteFeedReconnect } from "./NiftyVwapStrategy.js";
import { defaultNiftyVwapAlgo, defaultNiftyVwapReversalAlgo, isNiftyVwapAlgo, isNiftyVwapReversalAlgo, niftyVwapConfig, niftyVwapReversalConfig } from "./config.js";
import { VwapSignalEngine, completedCandles, firstFuturesBias, lastBarVwapReversal, sessionBarOpenMs, aggregateSessionBars, sessionVwap, nextCandleEntryWindow } from "./VwapSignalEngine.js";
import { normalizeAlgo, seedAlgos } from "../strategies.js";
import { runtimeState, PositionManager } from "./PositionManager.js";
import { parseOptionContract } from "../frontFutures.js";
import { runNiftyVwapBacktest } from "./BacktestAdapter.js";
import { PaperTradingAdapter } from "./PaperTradingAdapter.js";
import { LiveTradingAdapter } from "./LiveTradingAdapter.js";

const T0 = Date.parse("2026-08-21T03:45:00.000Z"); // 09:15 IST
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
  }).reason, "in-flight");
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

test("seed includes paused NIFTY VWAP ATM and 15m reversal algos", () => {
  const seeded = seedAlgos();
  assert.equal(seeded.length, 3);
  assert.equal(seeded[0].name, "NIFTY VWAP ATM");
  assert.equal(isNiftyVwapAlgo(seeded[0]), true);
  assert.equal(seeded[0].enabled, false);
  assert.equal(seeded[0].runMode, "live");
  assert.equal(seeded[0].status, "PAUSED");
  assert.equal(seeded[0].brokerId, "dhan");
  assert.equal(seeded[1].name, "NIFTY 15m VWAP reversal");
  assert.equal(isNiftyVwapReversalAlgo(seeded[1]), true);
  assert.equal(seeded[1].enabled, false);
  assert.equal(seeded[1].timeframe, "15m");
  assert.equal(seeded[1].initialSlPct, 15);
  assert.equal(seeded[1].targetPct, 30);
  assert.equal(seeded[1].status, "PAUSED");
  assert.equal(seeded[2].name, "NIFTY 15m VWAP hedge");
  assert.equal(seeded[2].enabled, false);
  assert.equal(seeded[2].status, "PAUSED");
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

test("15m reversal does not chase after the next candle has already closed", () => {
  const futuresBars = [bar15(0, 24500, 24500, { high: 24500, low: 24500 }), bar15(1, 24480, 24540, { high: 24550, low: 24470 })];
  const late = T0 + 3 * BAR15;
  const signal = VwapSignalEngine.evaluateReversal({ futuresBars, now: late, barMs: BAR15 });
  assert.equal(signal.previewFilled, true);
  assert.equal(signal.buyCe, false);
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
  assert.equal(tick.action, "wait");
  assert.equal(tick.reason, "missed-open");
  assert.equal(book.places.length, 0);
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
  assert.equal(PositionManager.isOpenNiftyOption({ symbol: "NIFTY-SEP2026-24500-CE", qty: 65, type: "BUY" }), true);
  assert.equal(PositionManager.isOpenNiftyOption({ symbol: "BANKNIFTY 52000 CE", qty: 65, type: "BUY" }), false);
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
  assert.match(algo.lastSignal, /HOLD 1 LOT/);
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
