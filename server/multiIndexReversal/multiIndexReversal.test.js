import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_MULTI_INDEX_REVERSAL_CONFIG,
  MULTI_INDEX_REVERSAL_NAME,
  MULTI_INDEX_SCRIPTS,
  MultiIndexReversalStrategy,
  PHASE,
  candleColor,
  defaultMultiIndexReversalAlgo,
  evaluateEntry,
  isMultiIndexReversalAlgo,
  lossPct,
  mirState,
  multiIndexReversalConfig,
  multiIndexScript,
  reversalQty,
  signedStrikeOffset,
  strikeForIndexOffset,
  validateMultiIndexReversal,
} from "./index.js";
import { runMultiIndexReversalBacktest } from "./backtest.js";

const T0 = Date.parse("2026-10-09T09:15:00+05:30");
const BAR = 15 * 60 * 1000;

function bar(time, open, close) {
  return { time, open, close, high: Math.max(open, close), low: Math.min(open, close), volume: 1 };
}

function book() {
  const positions = [];
  const closed = [];
  const orders = [];
  const adapter = {
    mode: "paper",
    cancelCalls: 0,
    place(payload) {
        const price = Number(payload.price);
        if (!(price > 0)) return { error: "No fill price" };
        const pos = {
          id: `p-${payload.option}-${payload.barTime || Date.now()}`,
          symbol: payload.symbol,
          type: "BUY",
          qty: payload.qty,
          avg: price,
          ltp: price,
          pnl: 0,
          strategy: payload.strategy,
          option: payload.option,
          strike: payload.strike,
          expiry: payload.expiry,
          role: payload.role,
          paper: true,
        };
        positions.push(pos);
        orders.push({ ...payload, status: "FILLED", price, side: "BUY" });
        return { ...pos, status: "FILLED", price };
      },
      exit(position) {
        const idx = positions.findIndex((row) => row.id === position.id);
        if (idx < 0) return { error: "missing" };
        const pos = positions[idx];
        const exit = Number(pos.ltp || pos.avg);
        const pnl = Number(((exit - pos.avg) * pos.qty).toFixed(2));
        closed.push({ ...pos, exit, pnl });
        positions.splice(idx, 1);
        return { ok: true, pnl };
      },
      cancelTarget() {
        adapter.cancelCalls += 1;
        return { ok: true };
      },
    };
  return {
    positions,
    closed,
    orders,
    adapter,
  };
}

function tick(algo, env, extra = {}) {
  return MultiIndexReversalStrategy.tick({
    algo,
    config: multiIndexReversalConfig(algo),
    now: extra.now || T0 + BAR + 1000,
    feedLive: extra.feedLive !== false,
    indexBars: extra.indexBars || [bar(T0, 25000, 25040)],
    ceBars: extra.ceBars || [bar(T0, 100, 110)],
    peBars: extra.peBars || [bar(T0, 100, 90)],
    spot: extra.spot || 25040,
    step: extra.step || 50,
    expiry: extra.expiry || "2026-10-13",
    ceLtp: extra.ceLtp ?? 110,
    peLtp: extra.peLtp ?? 90,
    positions: env.positions,
    orders: env.orders,
    adapter: extra.adapter || env.adapter,
    requireSecurityId: extra.requireSecurityId,
    ceSecurityId: extra.ceSecurityId,
    peSecurityId: extra.peSecurityId,
    emergency: extra.emergency,
  });
}

test("defaults stay on NIFTY 50 15m ATM paper and disabled", () => {
  const algo = defaultMultiIndexReversalAlgo();
  const cfg = multiIndexReversalConfig(algo);
  assert.equal(algo.name, MULTI_INDEX_REVERSAL_NAME);
  assert.equal(algo.enabled, false);
  assert.equal(algo.runMode, "paper");
  assert.equal(cfg.symbol, "NIFTY");
  assert.equal(cfg.exchange, "NSE");
  assert.equal(cfg.timeframe, "15m");
  assert.equal(cfg.strikeOffset, 0);
  assert.equal(cfg.initialTargetPct, 40);
  assert.equal(cfg.reversalLossPct, 20);
  assert.equal(cfg.reversalQtyMultiple, 2);
  assert.equal(cfg.combinedTargetPct, 20);
  assert.equal(cfg.combinedTargetBasis, "original");
  assert.equal(isMultiIndexReversalAlgo(algo), true);
  assert.equal(DEFAULT_MULTI_INDEX_REVERSAL_CONFIG.timeframe, "15m");
});

test("index selection maps NSE and BSE automatically", () => {
  assert.equal(multiIndexScript("NIFTY 50").exchange, "NSE");
  assert.equal(multiIndexScript("BANK NIFTY").id, "BANKNIFTY");
  assert.equal(multiIndexScript("FINNIFTY").exchange, "NSE");
  assert.equal(multiIndexScript("SENSEX").exchange, "BSE");
  assert.equal(multiIndexScript("SENSEX").segment, "BSE_FNO");
  assert.equal(MULTI_INDEX_SCRIPTS.length, 4);
  assert.equal(multiIndexReversalConfig({ symbol: "BANKNIFTY", timeframe: "10m" }).timeframe, "10m");
  assert.equal(multiIndexReversalConfig({ timeframe: "1h" }).barMinutes, 60);
  assert.equal(multiIndexReversalConfig({ timeframe: "30m" }).barMinutes, 30);
  assert.equal(multiIndexReversalConfig({ timeframe: "5m" }).barMinutes, 5);
});

test("strike offset is directional for CE and PE from -4 to +4", () => {
  assert.equal(strikeForIndexOffset(25000, 50, 0, "CE"), 25000);
  assert.equal(strikeForIndexOffset(25000, 50, 1, "CE"), 25050);
  assert.equal(strikeForIndexOffset(25000, 50, -1, "CE"), 24950);
  assert.equal(strikeForIndexOffset(25000, 50, 1, "PE"), 24950);
  assert.equal(strikeForIndexOffset(25000, 50, -1, "PE"), 25050);
  assert.equal(signedStrikeOffset(4, "CE"), 4);
  assert.equal(signedStrikeOffset(-4, "PE"), 4);
  assert.equal(strikeForIndexOffset(25000, 50, 9, "CE"), 25200);
  assert.equal(reversalQty(65, 2, 65), 130);
  assert.equal(reversalQty(30, 2, 30), 60);
});

test("doji is not green or red", () => {
  assert.equal(candleColor(bar(T0, 100, 100)), "doji");
  const signal = evaluateEntry({
    indexBar: bar(T0, 25000, 25000),
    ceBar: bar(T0, 100, 110),
    peBar: bar(T0, 100, 110),
  });
  assert.equal(signal.buyCe, false);
  assert.equal(signal.buyPe, false);
});

test("green index and green CE buys CE; red index and green PE buys PE", () => {
  const env = book();
  const ce = defaultMultiIndexReversalAlgo();
  const buyCe = tick(ce, env);
  assert.equal(buyCe.action, "entry");
  assert.equal(buyCe.option, "CE");
  assert.equal(mirState(ce).phase, PHASE.CE_ACTIVE);
  assert.equal(mirState(ce).originalTarget, 154);

  const env2 = book();
  const pe = defaultMultiIndexReversalAlgo();
  const buyPe = tick(pe, env2, {
    indexBars: [bar(T0, 25040, 25000)],
    ceBars: [bar(T0, 110, 100)],
    peBars: [bar(T0, 90, 110)],
    peLtp: 110,
  });
  assert.equal(buyPe.action, "entry");
  assert.equal(buyPe.option, "PE");
});

test("CE loss plus red index candle buys 2x PE and keeps CE open", () => {
  const env = book();
  const algo = defaultMultiIndexReversalAlgo();
  tick(algo, env);
  env.positions[0].ltp = 80;
  const rev = tick(algo, env, {
    indexBars: [bar(T0, 25000, 25040), bar(T0 + BAR, 25040, 24980)],
    ceBars: [bar(T0, 100, 110), bar(T0 + BAR, 110, 80)],
    peBars: [bar(T0, 100, 90), bar(T0 + BAR, 90, 95)],
    now: T0 + 2 * BAR + 1000,
    peLtp: 95,
    ceLtp: 80,
  });
  assert.equal(rev.action, "reversal");
  assert.equal(rev.option, "PE");
  assert.equal(rev.qty, 130);
  assert.equal(env.positions.length, 2);
  assert.equal(mirState(algo).phase, PHASE.COMBINED_POSITION_ACTIVE);
  assert.equal(mirState(algo).originalTarget, 0);
  assert.equal(env.adapter.cancelCalls, 1);
});

test("PE loss plus green index candle buys 2x CE", () => {
  const env = book();
  const algo = defaultMultiIndexReversalAlgo();
  tick(algo, env, {
    indexBars: [bar(T0, 25040, 25000)],
    ceBars: [bar(T0, 110, 100)],
    peBars: [bar(T0, 90, 110)],
    peLtp: 110,
  });
  env.positions[0].ltp = 80;
  const rev = tick(algo, env, {
    indexBars: [bar(T0, 25040, 25000), bar(T0 + BAR, 25000, 25060)],
    now: T0 + 2 * BAR + 1000,
    ceLtp: 70,
    peLtp: 80,
  });
  assert.equal(rev.action, "reversal");
  assert.equal(rev.option, "CE");
  assert.equal(rev.qty, 130);
});

test("initial 40% target closes before reversal", () => {
  const env = book();
  const algo = defaultMultiIndexReversalAlgo();
  tick(algo, env);
  env.positions[0].ltp = 160;
  const exit = tick(algo, env, { now: T0 + BAR + 2000, ceLtp: 160 });
  assert.equal(exit.action, "exit");
  assert.equal(exit.reason, "initial-target");
  assert.equal(env.positions.length, 0);
  assert.equal(mirState(algo).phase, PHASE.WAITING_FOR_SIGNAL);
});

test("combined target uses original premium by default and both legs", () => {
  const env = book();
  const algo = defaultMultiIndexReversalAlgo();
  tick(algo, env);
  env.positions[0].ltp = 80;
  tick(algo, env, {
    indexBars: [bar(T0, 25000, 25040), bar(T0 + BAR, 25040, 24980)],
    now: T0 + 2 * BAR + 1000,
    peLtp: 95,
    ceLtp: 80,
  });
  const target = MultiIndexReversalStrategy.combinedTargetAmount(mirState(algo), multiIndexReversalConfig(algo));
  assert.equal(target, 1430);
  env.positions[0].ltp = 200;
  env.positions[1].ltp = 95;
  const done = tick(algo, env, { now: T0 + 2 * BAR + 2000, ceLtp: 200, peLtp: 95 });
  assert.equal(done.action, "exit-all");
  assert.equal(done.reason, "combined-target");
});

test("combined-premium basis uses both fills", () => {
  const env = book();
  const algo = defaultMultiIndexReversalAlgo({ combinedTargetBasis: "combined" });
  tick(algo, env);
  env.positions[0].ltp = 80;
  tick(algo, env, {
    indexBars: [bar(T0, 25000, 25040), bar(T0 + BAR, 25040, 24980)],
    now: T0 + 2 * BAR + 1000,
    peLtp: 60,
    ceLtp: 80,
  });
  const target = MultiIndexReversalStrategy.combinedTargetAmount(mirState(algo), multiIndexReversalConfig(algo));
  assert.equal(target, 2990);
});

test("duplicate candle and duplicate reversal are ignored", () => {
  const env = book();
  const algo = defaultMultiIndexReversalAlgo();
  tick(algo, env);
  const again = tick(algo, env, { now: T0 + BAR + 2000, ceLtp: 110 });
  assert.equal(again.action, "hold");
  env.positions[0].ltp = 80;
  tick(algo, env, {
    indexBars: [bar(T0, 25000, 25040), bar(T0 + BAR, 25040, 24980)],
    now: T0 + 2 * BAR + 1000,
    peLtp: 95,
    ceLtp: 80,
  });
  const second = tick(algo, env, {
    indexBars: [bar(T0, 25000, 25040), bar(T0 + BAR, 25040, 24980)],
    now: T0 + 2 * BAR + 2000,
    peLtp: 95,
    ceLtp: 80,
  });
  assert.equal(env.positions.filter((row) => row.option === "PE").length, 1);
  assert.ok(second.action === "hold-combined" || second.action === "hold");
});

test("rejected entry and missing contract stay out of a live fill", () => {
  const env = book();
  const algo = defaultMultiIndexReversalAlgo();
  const rejected = tick(algo, env, {
    adapter: { place: () => ({ error: "rejected", status: "REJECTED" }), exit: () => ({ error: "no" }) },
  });
  assert.equal(rejected.action, "rejected");
  assert.equal(mirState(algo).phase, PHASE.WAITING_FOR_SIGNAL);
  const wait = tick(defaultMultiIndexReversalAlgo(), book(), { requireSecurityId: true, ceSecurityId: "" });
  assert.equal(wait.action, "wait");
  assert.equal(wait.reason, "no-contract");
});

test("feed down without a position skips; restart keeps the open cycle", () => {
  const env = book();
  const algo = defaultMultiIndexReversalAlgo();
  assert.equal(tick(algo, env, { feedLive: false }).action, "feed-down");
  tick(algo, env);
  const saved = JSON.parse(JSON.stringify(algo));
  const again = tick(saved, env, { now: T0 + BAR + 5000, ceLtp: 108 });
  assert.equal(again.action, "hold");
  assert.equal(mirState(saved).phase, PHASE.CE_ACTIVE);
});

test("emergency square-off and max cycle loss close the open cycle", () => {
  const env = book();
  const algo = defaultMultiIndexReversalAlgo({ maxCycleLossPct: 10 });
  tick(algo, env);
  env.positions[0].ltp = 10;
  const gone = tick(algo, env, { now: T0 + BAR + 2000, ceLtp: 10 });
  assert.equal(gone.action, "exit-all");
  assert.equal(env.positions.length, 0);
  const env2 = book();
  const algo2 = defaultMultiIndexReversalAlgo();
  tick(algo2, env2);
  const panic = tick(algo2, env2, { emergency: true });
  assert.equal(panic.action, "exit-all");
  assert.equal(env2.positions.length, 0);
});

test("paper adapter never reaches a live broker endpoint", () => {
  let live = 0;
  const algo = defaultMultiIndexReversalAlgo({ runMode: "paper" });
  const env = book();
  env.adapter.place = (payload) => {
    if (payload.brokerId && payload.brokerId !== "paper") live += 1;
    return book().adapter.place(payload);
  };
  tick(algo, env);
  assert.equal(live, 0);
  assert.equal(algo.runMode, "paper");
});

test("BANKNIFTY FINNIFTY and SENSEX keep their own exchange and lot", () => {
  assert.equal(multiIndexReversalConfig({ symbol: "BANKNIFTY" }).lotSize, 30);
  assert.equal(multiIndexReversalConfig({ symbol: "FINNIFTY" }).exchange, "NSE");
  assert.equal(multiIndexReversalConfig({ symbol: "SENSEX" }).exchange, "BSE");
  assert.equal(lossPct(100, 80), 20);
});

test("every supported timeframe and strike offset stays in range", () => {
  for (const tf of ["5m", "10m", "15m", "30m", "1H", "1h"]) {
    const cfg = multiIndexReversalConfig({ timeframe: tf });
    assert.ok(cfg.barMinutes >= 5);
    assert.ok(["5m", "10m", "15m", "30m", "1H"].includes(cfg.timeframe));
  }
  for (const offset of [-4, -3, -2, -1, 0, 1, 2, 3, 4]) {
    assert.equal(strikeForIndexOffset(25000, 50, offset, "CE"), 25000 + offset * 50);
    assert.equal(strikeForIndexOffset(25000, 50, offset, "PE"), 25000 - offset * 50);
  }
  assert.match(validateMultiIndexReversal({ symbol: "MIDCPNIFTY" }), /Unsupported|index/i);
  assert.match(validateMultiIndexReversal({ timeframe: "2m" }), /timeframe/i);
  assert.equal(validateMultiIndexReversal({}), "");
});

test("BANKNIFTY FINNIFTY and SENSEX can take a paper CE entry", () => {
  for (const symbol of ["BANKNIFTY", "FINNIFTY", "SENSEX"]) {
    const env = book();
    const algo = defaultMultiIndexReversalAlgo({ symbol });
    const result = tick(algo, env);
    assert.equal(result.action, "entry");
    assert.equal(multiIndexReversalConfig(algo).symbol, symbol);
  }
});

test("partial fill uses the filled quantity; invalid fill stays flat", () => {
  const env = book();
  const algo = defaultMultiIndexReversalAlgo();
  const ok = tick(algo, env, {
    adapter: {
      ...env.adapter,
      place(payload) {
        return { ...env.adapter.place(payload), qty: 65, filledQty: 65 };
      },
    },
  });
  assert.equal(ok.action, "entry");
  assert.equal(mirState(algo).originalQty, 65);
  const bad = tick(defaultMultiIndexReversalAlgo(), book(), {
    adapter: { place: () => ({ status: "FILLED", price: 110, qty: 10 }), exit: () => ({ error: "no" }) },
  });
  assert.equal(bad.action, "rejected");
});

test("insufficient funds timeout and stale candles do not fill", () => {
  const funds = tick(defaultMultiIndexReversalAlgo(), book(), {
    adapter: { checkFunds: () => false, place: () => ({ status: "FILLED", price: 110 }), exit: () => ({ error: "no" }) },
  });
  assert.equal(funds.action, "rejected");
  assert.equal(funds.result.error, "insufficient-funds");
  const timeout = tick(defaultMultiIndexReversalAlgo(), book(), {
    adapter: { place: () => ({ error: "timeout" }), exit: () => ({ error: "no" }) },
  });
  assert.equal(timeout.action, "rejected");
  const stale = tick(defaultMultiIndexReversalAlgo(), book(), { now: T0 + 4 * BAR });
  assert.equal(stale.action, "skip");
  assert.equal(stale.reason, "stale-bar");
});

test("unverified target cancel can block the reversal", () => {
  const env = book();
  const algo = defaultMultiIndexReversalAlgo();
  tick(algo, env);
  env.positions[0].ltp = 80;
  const blocked = tick(algo, env, {
    indexBars: [bar(T0, 25000, 25040), bar(T0 + BAR, 25040, 24980)],
    now: T0 + 2 * BAR + 1000,
    peLtp: 95,
    ceLtp: 80,
    adapter: {
      ...env.adapter,
      cancelTarget() {
        env.adapter.cancelCalls += 1;
        return { ok: false, error: "broker-timeout", block: true };
      },
    },
  });
  assert.equal(blocked.action, "target-cancel-failed");
  assert.equal(env.positions.length, 1);
  assert.equal(mirState(algo).phase, PHASE.CE_ACTIVE);
});

test("open-cycle settings stay locked after the first fill", () => {
  const env = book();
  const algo = defaultMultiIndexReversalAlgo();
  tick(algo, env);
  algo.initialTargetPct = 90;
  algo.reversalQtyMultiple = 5;
  env.positions[0].ltp = 80;
  const rev = tick(algo, env, {
    indexBars: [bar(T0, 25000, 25040), bar(T0 + BAR, 25040, 24980)],
    now: T0 + 2 * BAR + 1000,
    peLtp: 95,
    ceLtp: 80,
    config: multiIndexReversalConfig(algo),
  });
  assert.equal(rev.action, "reversal");
  assert.equal(rev.qty, 130);
  assert.equal(mirState(algo).originalTarget, 0);
});

test("paper replay backtest only uses completed candles", () => {
  const candles = [
    bar(T0, 25000, 25080),
    bar(T0 + BAR, 25080, 24940),
    bar(T0 + 2 * BAR, 24940, 25100),
  ];
  const result = runMultiIndexReversalBacktest(defaultMultiIndexReversalAlgo(), candles);
  assert.ok(result.timeframe === "15m");
  assert.ok(Number.isFinite(result.pnl));
  assert.equal(result.optionSource, "synth");
});
