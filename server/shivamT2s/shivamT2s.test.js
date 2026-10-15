import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_SHIVAM_T2S_CONFIG,
  SHIVAM_T2S_NAME,
  ShivamT2sStrategy,
  atmStrike,
  averageFillPrice,
  buildShivamReport,
  candleColor,
  clampShivamDailyTradeLimit,
  defaultShivamT2sAlgo,
  evaluateShivamEntry,
  isShivamT2sAlgo,
  maxAffordableLots,
  protectivePrices,
  renderShivamExcel,
  renderShivamPdf,
  resolveShivamTimeframe,
  shivamT2sConfig,
  sizeShivamLots,
  strikeForPolicy,
  validateShivamT2s,
} from "./index.js";

const T0 = Date.parse("2026-10-15T09:15:00+05:30");
const BAR = 5 * 60 * 1000;

function bar(time, open, close) {
  return { time, open, close, high: Math.max(open, close), low: Math.min(open, close), volume: 1 };
}

function book() {
  const positions = [];
  const closed = [];
  const orders = [];
  const adapter = {
    mode: "paper",
    place(payload) {
      if (adapter.reject) return { error: "broker-reject", status: "REJECTED" };
      const price = Number(payload.price);
      if (!(price > 0)) return { error: "No fill price" };
      const pos = {
        id: `p-${payload.option}-${payload.barTime || Date.now()}`,
        symbol: payload.symbol,
        type: "BUY",
        qty: payload.qty,
        lots: payload.lots,
        lotSize: payload.lotSize,
        avg: price,
        ltp: price,
        pnl: 0,
        strategy: payload.strategy,
        option: payload.option,
        strike: payload.strike,
        expiry: payload.expiry,
        securityId: payload.securityId,
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
  };
  return { positions, closed, orders, adapter };
}

function tick(algo, env, extra = {}) {
  return ShivamT2sStrategy.tick({
    algo,
    config: shivamT2sConfig(algo),
    now: extra.now || T0 + BAR + 1000,
    sessionDate: extra.sessionDate || "2026-10-15",
    feedLive: extra.feedLive !== false,
    authorized: extra.authorized !== false,
    availableFunds: extra.availableFunds ?? 80_000,
    indexBars: extra.indexBars || [bar(T0, 25000, 25040)],
    ceBars: extra.ceBars || [bar(T0, 100, 110)],
    peBars: extra.peBars || [bar(T0, 100, 90)],
    spot: extra.spot || 25040,
    step: extra.step || 50,
    lotSize: extra.lotSize ?? 75,
    expiry: extra.expiry || "2026-10-20",
    ceLtp: extra.ceLtp ?? 110,
    peLtp: extra.peLtp ?? 90,
    ceSecurityId: extra.ceSecurityId || "CE-1",
    peSecurityId: extra.peSecurityId || "PE-1",
    quoteAgeMs: extra.quoteAgeMs ?? 400,
    positions: env.positions,
    orders: env.orders,
    adapter: extra.adapter || env.adapter,
    requireSecurityId: extra.requireSecurityId,
    minutesToClose: extra.minutesToClose,
  });
}

test("defaults stay paper, disabled, and named Shivam T2S Strategy", () => {
  const algo = defaultShivamT2sAlgo();
  const cfg = shivamT2sConfig(algo);
  assert.equal(algo.name, SHIVAM_T2S_NAME);
  assert.equal(algo.enabled, false);
  assert.equal(algo.runMode, "paper");
  assert.equal(algo.liveAuthorized, false);
  assert.equal(algo.testDesk, true);
  assert.equal(cfg.symbol, "NIFTY");
  assert.equal(cfg.ceConfirmColor, "GREEN");
  assert.equal(cfg.peConfirmColor, "GREEN");
  assert.equal(cfg.strikePolicy, "ATM");
  assert.equal(isShivamT2sAlgo(algo), true);
});

test("live runMode stays paper until liveAuthorized", () => {
  const locked = shivamT2sConfig({ runMode: "live" });
  assert.equal(locked.runMode, "paper");
  assert.equal(locked.liveAuthorized, false);
  const live = shivamT2sConfig({ runMode: "live", liveAuthorized: true, brokerId: "dhan" });
  assert.equal(live.runMode, "live");
  assert.equal(live.liveAuthorized, true);
  const algo = defaultShivamT2sAlgo({ runMode: "live", liveAuthorized: true, brokerId: "dhan" });
  assert.equal(algo.testDesk, true);
  assert.equal(algo.runMode, "live");
  assert.equal(algo.liveAuthorized, true);
  assert.equal(algo.brokerId, "dhan");
  assert.equal(validateShivamT2s({ runMode: "live", liveAuthorized: true }), "");
});

test("candle colors treat equal open/close as doji, not green or red", () => {
  assert.equal(candleColor(bar(T0, 100, 110)), "green");
  assert.equal(candleColor(bar(T0, 100, 90)), "red");
  assert.equal(candleColor(bar(T0, 100, 100)), "doji");
  assert.equal(candleColor(null), "");
});

test("BUY CE needs index green and CE green; doji blocks both sides", () => {
  const ce = evaluateShivamEntry({
    indexBar: bar(T0, 25000, 25040),
    ceBar: bar(T0, 100, 110),
    peBar: bar(T0, 100, 90),
  });
  assert.equal(ce.buyCe, true);
  assert.equal(ce.buyPe, false);
  const pe = evaluateShivamEntry({
    indexBar: bar(T0, 25040, 25000),
    ceBar: bar(T0, 100, 90),
    peBar: bar(T0, 100, 110),
  });
  assert.equal(pe.buyCe, false);
  assert.equal(pe.buyPe, true);
  const doji = evaluateShivamEntry({
    indexBar: bar(T0, 25000, 25000),
    ceBar: bar(T0, 100, 110),
    peBar: bar(T0, 100, 110),
  });
  assert.equal(doji.buyCe, false);
  assert.equal(doji.buyPe, false);
  assert.equal(doji.indexColor, "doji");
});

test("stale or incomplete candles do not qualify", () => {
  const algo = defaultShivamT2sAlgo({ enabled: true });
  const env = book();
  const stale = tick(algo, env, { now: T0 + BAR * 8 });
  assert.equal(stale.reason, "stale");
  assert.equal(algo.shivamState.cardSignal, "NO Trade");
  const incomplete = tick(defaultShivamT2sAlgo({ enabled: true }), book(), { indexBars: [], ceBars: [], peBars: [] });
  assert.ok(["stale", "incomplete"].includes(incomplete.reason));
});

test("ATM / ITM / OTM strikes use the official step, not a hardcoded NIFTY lot", () => {
  assert.equal(atmStrike(25040, 50), 25050);
  assert.equal(strikeForPolicy(25040, 50, "ATM", 0, "CE"), 25050);
  assert.equal(strikeForPolicy(25040, 50, "ITM", 1, "CE"), 25000);
  assert.equal(strikeForPolicy(25040, 50, "ITM", 1, "PE"), 25100);
  assert.equal(strikeForPolicy(25040, 50, "OTM", 2, "CE"), 25150);
  assert.equal(strikeForPolicy(25040, 50, "OTM", 2, "PE"), 24950);
});

test("capital allocation never exceeds funds and does not silently reduce lots", () => {
  const sized = sizeShivamLots({
    requestedLots: 2,
    premium: 100,
    lotSize: 75,
    availableFunds: 80_000,
    capitalMode: "amount",
    capitalValue: 50_000,
    brokeragePerLot: 40,
  });
  assert.equal(sized.ok, true);
  assert.equal(sized.lotSize, 75);
  assert.equal(sized.approvedLots, 2);
  assert.equal(sized.qty, 150);
  const tooMany = sizeShivamLots({
    requestedLots: 20,
    premium: 100,
    lotSize: 75,
    availableFunds: 80_000,
    capitalMode: "amount",
    capitalValue: 50_000,
    autoSizeLots: false,
  });
  assert.equal(tooMany.ok, false);
  assert.equal(tooMany.reason, "lots-exceed-max");
  assert.ok(tooMany.maxLots >= 1);
  const auto = sizeShivamLots({
    requestedLots: 20,
    premium: 100,
    lotSize: 75,
    availableFunds: 80_000,
    capitalMode: "amount",
    capitalValue: 50_000,
    autoSizeLots: true,
  });
  assert.equal(auto.ok, true);
  assert.equal(auto.approvedLots, auto.maxLots);
  assert.ok(auto.approvedLots < 20);
  assert.equal(maxAffordableLots({ premium: 100, lotSize: 75, availableFunds: 1000, capitalMode: "amount", capitalValue: 50_000 }), 0);
});

test("percentage and points SL/target are computed from average fill", () => {
  const pct = protectivePrices({ entryPremium: 100, slMode: "percentage", slValue: 20, targetMode: "percentage", targetValue: 40 });
  assert.equal(pct.ok, true);
  assert.equal(pct.slPrice, 80);
  assert.equal(pct.targetPrice, 140);
  const pts = protectivePrices({ entryPremium: 100, slMode: "points", slValue: 15, targetMode: "points", targetValue: 25, tickSize: 0.05 });
  assert.equal(pts.slPrice, 85);
  assert.equal(pts.targetPrice, 125);
  assert.equal(averageFillPrice([{ qty: 65, price: 100 }, { qty: 65, price: 110 }]), 105);
});

test("daily trade limit is 1-100 and rejected orders do not count", () => {
  assert.equal(clampShivamDailyTradeLimit(0), 1);
  assert.equal(clampShivamDailyTradeLimit(101), 100);
  assert.equal(clampShivamDailyTradeLimit(7), 7);
  const algo = defaultShivamT2sAlgo({ enabled: true, maxTradesPerDay: 1, lots: 1, capitalValue: 50_000 });
  const env = book();
  const first = tick(algo, env);
  assert.equal(first.action, "entered");
  assert.equal(algo.shivamState.sessionTrades, 1);
  env.positions.length = 0;
  const blocked = tick(algo, env, {
    now: T0 + BAR * 2 + 1000,
    indexBars: [bar(T0, 25000, 25040), bar(T0 + BAR, 25040, 25080)],
    ceBars: [bar(T0, 100, 110), bar(T0 + BAR, 110, 120)],
    peBars: [bar(T0, 100, 90), bar(T0 + BAR, 90, 80)],
  });
  assert.equal(blocked.reason, "daily-limit");
  const rejectAlgo = defaultShivamT2sAlgo({ enabled: true, maxTradesPerDay: 2 });
  const rejectEnv = book();
  rejectEnv.adapter.reject = true;
  const rejected = tick(rejectAlgo, rejectEnv);
  assert.equal(rejected.reason, "rejected");
  assert.equal(rejectAlgo.shivamState.sessionTrades, 0);
});

test("BUY CE places against the resolved contract and BUY PE on index red + PE green", () => {
  const ceAlgo = defaultShivamT2sAlgo({ enabled: true, capitalValue: 50_000 });
  const ceEnv = book();
  const ce = tick(ceAlgo, ceEnv, { lotSize: 65, ceSecurityId: "111", requireSecurityId: true });
  assert.equal(ce.action, "entered");
  assert.equal(ce.option, "CE");
  assert.equal(ceEnv.orders[0].securityId, "111");
  assert.equal(ceAlgo.shivamState.cardSignal, "● ● ●");
  const peAlgo = defaultShivamT2sAlgo({ enabled: true, capitalValue: 50_000 });
  const peEnv = book();
  const pe = tick(peAlgo, peEnv, {
    indexBars: [bar(T0, 25040, 25000)],
    ceBars: [bar(T0, 100, 90)],
    peBars: [bar(T0, 100, 120)],
    peLtp: 120,
    lotSize: 65,
  });
  assert.equal(pe.action, "entered");
  assert.equal(pe.option, "PE");
});

test("duplicate signal on the same completed candle is blocked", () => {
  const algo = defaultShivamT2sAlgo({ enabled: true, capitalValue: 50_000, maxTradesPerDay: 5 });
  const env = book();
  tick(algo, env);
  env.positions.length = 0;
  const again = tick(algo, env);
  assert.equal(again.reason, "duplicate");
});

test("feed down and missing live lot size block new entries", () => {
  const down = tick(defaultShivamT2sAlgo({ enabled: true }), book(), { feedLive: false });
  assert.equal(down.reason, "feed-down");
  const noLot = tick(defaultShivamT2sAlgo({ enabled: true }), book(), { lotSize: 0 });
  assert.equal(noLot.reason, "missing-lot-size");
});

test("partial fills recompute SL from average price", () => {
  const avg = averageFillPrice([
    { qty: 75, price: 100 },
    { qty: 75, price: 120 },
  ]);
  const levels = protectivePrices({ entryPremium: avg, slMode: "percentage", slValue: 20, targetMode: "percentage", targetValue: 40 });
  assert.equal(avg, 110);
  assert.equal(levels.slPrice, 88);
});

test("reports strip secrets and stay tenant-scoped", () => {
  const algo = defaultShivamT2sAlgo({ enabled: true });
  algo.id = "a-shivam";
  algo.shivamState = { sessionTrades: 1, sessionDate: "2026-10-15", riskEvents: [{ kind: "rejected", at: Date.now(), token: "secret-token" }] };
  const report = buildShivamReport({
    algo,
    user: { id: "admin", role: "admin", accessToken: "nope" },
    orders: [
      { strategy: SHIVAM_T2S_NAME, side: "BUY", status: "FILLED", qty: 75, accessToken: "abc" },
      { strategy: SHIVAM_T2S_NAME, side: "BUY", status: "REJECTED", copyUserId: "u2", qty: 75 },
    ],
    closed: [{ strategy: SHIVAM_T2S_NAME, option: "CE", strike: 25050, qty: 75, pnl: 150, avg: 100, exit: 102 }],
  });
  assert.equal(report.userId, "admin");
  assert.equal(report.orders.length, 1);
  assert.equal(report.orders[0].accessToken, undefined);
  assert.equal(report.summary.tradesUsed, 1);
  const pdf = renderShivamPdf(report);
  const xlsx = renderShivamExcel(report);
  assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
  assert.equal(xlsx.subarray(0, 2).toString("utf8"), "PK");
});

test("Shivam T2S keeps 5m 15m 30m 1H and custom 1-60 minutes including 17 and 19", () => {
  assert.equal(resolveShivamTimeframe("5m"), "5m");
  assert.equal(resolveShivamTimeframe("15m"), "15m");
  assert.equal(resolveShivamTimeframe("30m"), "30m");
  assert.equal(resolveShivamTimeframe("1hr"), "1H");
  assert.equal(resolveShivamTimeframe("17m"), "17m");
  assert.equal(resolveShivamTimeframe("19"), "19m");
  const cfg = shivamT2sConfig({ ceTimeframe: "17m", peTimeframe: "19m", indexTimeframe: "1H" });
  assert.equal(cfg.ceTimeframe, "17m");
  assert.equal(cfg.peTimeframe, "19m");
  assert.equal(cfg.indexTimeframe, "1H");
  assert.equal(cfg.timeframe, "1H");
  assert.equal(cfg.ceBarMinutes, 17);
  assert.equal(cfg.peBarMinutes, 19);
  assert.equal(cfg.indexBarMinutes, 60);
  assert.equal(validateShivamT2s({ ceTimeframe: "17m", peTimeframe: "19m", indexTimeframe: "30m" }), "");
  assert.match(validateShivamT2s({ ceTimeframe: "90m" }), /CE candle timeframe/);
});

test("daily limit and capital fields validate on the backend", () => {
  assert.equal(validateShivamT2s({ symbol: "FOO" }), "Unsupported index. Pick NIFTY, BANKNIFTY, FINNIFTY, MIDCPNIFTY, or SENSEX.");
  assert.match(validateShivamT2s({ slValue: 0 }), /Stop-loss/);
  assert.equal(shivamT2sConfig({ maxTradesPerDay: 100 }).maxTradesPerDay, 100);
  assert.equal(DEFAULT_SHIVAM_T2S_CONFIG.liveAuthorized, false);
});
