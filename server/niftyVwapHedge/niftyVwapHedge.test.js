import assert from "node:assert/strict";
import test from "node:test";
import { NiftyVwapHedgeStrategy } from "./NiftyVwapHedgeStrategy.js";
import { defaultNiftyVwapHedgeAlgo, isNiftyVwapHedgeAlgo, niftyVwapHedgeConfig } from "./config.js";
import { hedgeState, PHASE } from "./HedgeState.js";
import { runNiftyVwapHedgeBacktest } from "./BacktestAdapter.js";
import { normalizeAlgo, seedAlgos } from "../strategies.js";

const T0 = Date.parse("2026-08-21T03:45:00.000Z");
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

function bookAdapter() {
  const positions = [];
  const places = [];
  const exits = [];
  return {
    positions,
    places,
    exits,
    adapter: {
      place(payload) {
        places.push(payload);
        if (payload.reject) return { status: "REJECTED", error: payload.error || "broker-rejected" };
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
          role: payload.role,
        };
        positions.push(pos);
        return { ...pos, status: "FILLED", price: payload.price };
      },
      exit(position) {
        exits.push(position);
        const idx = positions.findIndex((row) => row.id === position.id);
        const pos = idx >= 0 ? positions[idx] : position;
        const pnl = Number((((pos.ltp || pos.avg) - pos.avg) * pos.qty).toFixed(2));
        if (idx >= 0) positions.splice(idx, 1);
        return { ok: true, pnl };
      },
      cancelPending() {
        return { ok: true };
      },
    },
  };
}

const ceBars = [bar15(0, 24500, 24500, { high: 24500, low: 24500 }), bar15(1, 24480, 24540, { high: 24550, low: 24470 })];

function tick(algo, book, extra = {}) {
  return NiftyVwapHedgeStrategy.tick({
    algo,
    now: extra.now ?? T0 + 2 * BAR15,
    feedLive: extra.feedLive !== false,
    minutesToClose: 120,
    futuresBars: extra.futuresBars || ceBars,
    spot: extra.spot || 24540,
    step: 50,
    expiry: "2026-08-27",
    ceLtp: extra.ceLtp ?? 100,
    peLtp: extra.peLtp ?? 90,
    capital: extra.capital ?? 10_00_000,
    positions: book.positions,
    orders: extra.orders || [],
    pending: extra.pending || [],
    adapter: book.adapter,
  });
}

test("hedge algo seeds paused and never auto-enables LIVE", () => {
  const created = normalizeAlgo(defaultNiftyVwapHedgeAlgo({ name: "Hedge Desk", runMode: "live" }));
  assert.equal(isNiftyVwapHedgeAlgo(created), true);
  assert.equal(created.enabled, false);
  assert.notEqual(created.status, "LIVE");
  assert.equal(created.timeframe, "15m");
  const cfg = niftyVwapHedgeConfig(created);
  assert.equal(cfg.qty, 65);
  assert.equal(cfg.hedgeQty, 130);
  assert.equal(cfg.primaryTargetPct, 40);
  assert.equal(cfg.hedgeTriggerPct, 20);
  assert.equal(cfg.accountProfitPct, 5);
});

test("seed includes paused NIFTY 15m VWAP hedge", () => {
  const seeded = seedAlgos();
  assert.equal(seeded.length, 3);
  assert.equal(seeded[2].name, "NIFTY 15m VWAP hedge");
  assert.equal(isNiftyVwapHedgeAlgo(seeded[2]), true);
  assert.equal(seeded[2].enabled, false);
  assert.equal(seeded[2].status, "PAUSED");
});

test("CE 15m open below VWAP and close above buys 1 lot after the candle closes", () => {
  const algo = defaultNiftyVwapHedgeAlgo({ name: "Hedge CE" });
  const book = bookAdapter();
  const forming = tick(algo, book, { now: T0 + 2 * BAR15 - 1000 });
  assert.equal(forming.action, "wait");
  assert.equal(book.places.length, 0);
  const entry = tick(algo, book);
  assert.equal(entry.action, "entry");
  assert.equal(book.places[0].option, "CE");
  assert.equal(book.places[0].qty, 65);
  assert.equal(book.places[0].role, "primary");
  assert.equal(hedgeState(algo).primaryEntryPrice, 100);
  assert.equal(hedgeState(algo).primaryTargetPrice, 140);
  assert.equal(hedgeState(algo).hedgeTriggerPrice, 80);
  assert.equal(hedgeState(algo).phase, PHASE.MONITOR_PRIMARY);
});

test("primary has no stop-loss; 10% down still holds", () => {
  const algo = defaultNiftyVwapHedgeAlgo({ name: "Hedge Hold" });
  const book = bookAdapter();
  tick(algo, book);
  book.positions[0].ltp = 90;
  const hold = tick(algo, book, { ceLtp: 90 });
  assert.equal(hold.action, "hold");
  assert.equal(book.exits.length, 0);
  assert.equal(book.places.length, 1);
});

test("primary +40% closes the CE and returns to IDLE", () => {
  const algo = defaultNiftyVwapHedgeAlgo({ name: "Hedge TGT" });
  const book = bookAdapter();
  tick(algo, book);
  book.positions[0].ltp = 140;
  const done = tick(algo, book, { ceLtp: 140 });
  assert.equal(done.action, "exit-primary");
  assert.equal(book.positions.length, 0);
  assert.equal(hedgeState(algo).phase, PHASE.IDLE);
});

test("20% loss buys opposite 2 lots once and never doubles again", () => {
  const algo = defaultNiftyVwapHedgeAlgo({ name: "Hedge Once" });
  const book = bookAdapter();
  tick(algo, book);
  book.positions[0].ltp = 80;
  const hedge = tick(algo, book, { ceLtp: 80, peLtp: 95 });
  assert.equal(hedge.action, "hedge");
  assert.equal(book.places[1].option, "PE");
  assert.equal(book.places[1].qty, 130);
  assert.equal(book.places[1].role, "hedge");
  assert.equal(hedgeState(algo).hedgeEntered, true);
  book.positions[0].ltp = 70;
  const again = tick(algo, book, { ceLtp: 70, peLtp: 110 });
  assert.equal(book.places.length, 2);
  assert.ok(again.action === "hold" || again.reason === "combined");
});

test("combined +5% of starting capital exits every position", () => {
  const algo = defaultNiftyVwapHedgeAlgo({ name: "Hedge 5pct" });
  const book = bookAdapter();
  tick(algo, book, { capital: 10_00_000 });
  book.positions[0].ltp = 80;
  tick(algo, book, { ceLtp: 80, peLtp: 95, capital: 10_00_000 });
  assert.equal(book.positions.length, 2);
    book.positions[0].ltp = 500;
    book.positions[1].ltp = 500;
    const exit = tick(algo, book, { ceLtp: 500, peLtp: 500, capital: 10_00_000 });
  assert.equal(exit.action, "exit-all");
  assert.equal(book.positions.length, 0);
  assert.equal(hedgeState(algo).phase, PHASE.IDLE);
});

test("duplicate 15m bar does not open a second primary", () => {
  const algo = defaultNiftyVwapHedgeAlgo({ name: "Hedge Dup" });
  const book = bookAdapter();
  tick(algo, book);
  book.positions.length = 0;
  hedgeState(algo).phase = PHASE.IDLE;
  hedgeState(algo).primaryEntryPrice = 0;
  hedgeState(algo).inFlight = false;
  const dup = tick(algo, book);
  assert.equal(dup.reason, "duplicate-bar");
  assert.equal(book.places.length, 1);
});

test("PE 15m open above VWAP and close below buys 1 lot after the candle closes", () => {
  const algo = defaultNiftyVwapHedgeAlgo({ name: "Hedge PE" });
  const book = bookAdapter();
  const peBars = [bar15(0, 24500, 24500, { high: 24500, low: 24500 }), bar15(1, 24540, 24480, { high: 24550, low: 24470 })];
  const entry = tick(algo, book, { futuresBars: peBars, spot: 24480, peLtp: 100, ceLtp: 90 });
  assert.equal(entry.action, "entry");
  assert.equal(book.places[0].option, "PE");
  assert.equal(book.places[0].qty, 65);
  assert.equal(hedgeState(algo).primaryEntryPrice, 100);
  assert.equal(hedgeState(algo).primarySide, "PE");
});

test("timed-out order does not resubmit while Dhan status is still pending", () => {
  const algo = defaultNiftyVwapHedgeAlgo({ name: "Hedge Wait" });
  const book = bookAdapter();
  const first = tick(algo, book);
  assert.equal(first.action, "entry");
  book.positions.length = 0;
  hedgeState(algo).inFlight = true;
  hedgeState(algo).primaryEntryPrice = 0;
  hedgeState(algo).lastEntryAt = T0;
  const wait = tick(algo, book, {
    now: T0 + 2 * BAR15 + 130_000,
    pending: [{ strategy: "Hedge Wait", side: "BUY", status: "PENDING" }],
  });
  assert.equal(wait.reason, "order-status");
  assert.equal(book.places.length, 1);
});

test("same 15m bar does not re-enter after +40% books the primary", () => {
  const algo = defaultNiftyVwapHedgeAlgo({ name: "Hedge Once Bar" });
  const book = bookAdapter();
  tick(algo, book);
  book.positions[0].ltp = 140;
  tick(algo, book, { ceLtp: 140 });
  const again = tick(algo, book, { ceLtp: 100 });
  assert.equal(again.reason, "duplicate-bar");
  assert.equal(book.places.length, 1);
});

test("hedge backtest runs without enabling LIVE", () => {
  const algo = defaultNiftyVwapHedgeAlgo({ name: "Hedge BT", runMode: "backtest" });
  const candles = Array.from({ length: 40 }, (_, i) => bar15(i, 24500 + (i % 4 === 0 ? -30 : 10), 24500 + (i % 4 === 0 ? 40 : -5)));
  const result = runNiftyVwapHedgeBacktest(algo, candles);
  assert.equal(result.timeframe, "15m");
  assert.ok(Number.isFinite(result.pnl));
  assert.equal(algo.enabled, false);
});
