import { exchangeSegmentFor } from "../optionChain.js";
import { niftyTest2Config } from "../niftyVwap/config.js";
import { hmToMinutes, istWallTime, sessionKeyIST } from "../niftyVwap/VwapSignalEngine.js";
import { TradeLogger } from "../niftyVwap/TradeLogger.js";
import { inEntryWindow, pickCombo } from "./Test2Engine.js";

function test2State(algo) {
  if (!algo.test2State || typeof algo.test2State !== "object") algo.test2State = {};
  return algo.test2State;
}

function rollSession(state, day, hasOpen) {
  if (state.sessionDate === day) return state;
  const previous = String(state.sessionDate || "");
  state.sessionDate = day;
  state.inFlight = false;
  state.dayPnl = 0;
  if (hasOpen) {
    if (!state.entryDate) state.entryDate = previous || "overnight";
    state.entered = true;
    return state;
  }
  state.entered = false;
  state.lockedDay = false;
  state.entryDate = "";
  state.legs = [];
  return state;
}

function sameContract(left = {}, right = {}) {
  if (left.securityId && right.securityId && String(left.securityId) === String(right.securityId)) return true;
  return Boolean(left.symbol && right.symbol && left.symbol === right.symbol);
}

function pendingSame(orders = [], payload) {
  return (orders || []).some((row) => {
    if (row?.copyUserId) return false;
    if (String(row.strategy || "") !== String(payload.strategy || "")) return false;
    if (String(row.side || "").toUpperCase() !== String(payload.side || "").toUpperCase()) return false;
    const status = String(row.status || "").toUpperCase();
    if (["REJECTED", "CANCELLED", "FAILED", "EXPIRED", "FILLED", "TRADED"].includes(status)) return false;
    return sameContract(row, payload);
  });
}

function openLegs(positions = [], algoName) {
  return (positions || []).filter((row) => Number(row.qty) > 0 && (!row.strategy || row.strategy === algoName));
}

function productOf(config) {
  return String(config.product || "NRML").toUpperCase() === "MIS" ? "MIS" : "NRML";
}

function minutesOf(now) {
  const wall = istWallTime(now);
  return wall.hour * 60 + wall.minute;
}

function shouldSellTomorrow(state, config, today, now) {
  const entryDate = String(state.entryDate || "");
  if (!entryDate || entryDate === today) return false;
  return minutesOf(now) >= hmToMinutes(config.exitTimeIst || config.startTimeIst || "09:35");
}

function closePayload(open, algo, config) {
  const openSide = String(open.side || open.type || "BUY").toUpperCase();
  return {
    symbol: open.symbol,
    side: openSide === "SELL" ? "BUY" : "SELL",
    qty: open.qty || config.qty,
    lots: config.lots,
    lotSize: config.lotSize,
    price: Number(open.ltp || open.avg || 0),
    kind: "option",
    option: open.option,
    strike: open.strike,
    expiry: open.expiry,
    securityId: open.securityId || "",
    product: productOf(config),
    type: "MARKET",
    strategy: algo.name,
    exchangeSegment: exchangeSegmentFor("NIFTY"),
  };
}

function closeOpens(opens, algo, config, adapter, orders) {
  let sent = 0;
  for (const open of opens) {
    const payload = closePayload(open, algo, config);
    if (pendingSame(orders, payload)) continue;
    adapter.place?.(payload);
    sent += 1;
  }
  return sent;
}

export const Test2Strategy = {
  manageOpen({ algo, config, opens = [], marks = {}, now, adapter, orders = [] }) {
    const state = test2State(algo);
    const today = sessionKeyIST(now || Date.now());
    if (!opens.length) {
      if (state.entered || state.entryDate) {
        state.entered = false;
        state.lockedDay = false;
        state.entryDate = "";
        state.legs = [];
        algo.lastSignal = "FLAT";
        return { action: "flat" };
      }
      return { action: "hold" };
    }
    let dayPnl = 0;
    for (const open of opens) {
      const fill = Number(open.avg || open.ltp || 0);
      const mark = Number(open.ltp || fill);
      const dir = String(open.side || open.type || "BUY").toUpperCase() === "SELL" ? -1 : 1;
      if (fill > 0 && mark > 0) dayPnl += (mark - fill) * Number(open.qty || config.qty) * dir;
    }
    state.dayPnl = Number(dayPnl.toFixed(2));
    if (config.overallTarget > 0 && dayPnl >= config.overallTarget) {
      closeOpens(opens, algo, config, adapter, orders);
      algo.lastSignal = `EXIT TARGET ₹${dayPnl.toFixed(0)}`;
      return { action: "exit", reason: "overall-target" };
    }
    if (config.overallSl > 0 && dayPnl <= -config.overallSl) {
      closeOpens(opens, algo, config, adapter, orders);
      algo.lastSignal = `EXIT SL ₹${dayPnl.toFixed(0)}`;
      return { action: "exit", reason: "overall-sl" };
    }
    if (shouldSellTomorrow(state, config, today, now || Date.now())) {
      closeOpens(opens, algo, config, adapter, orders);
      algo.lastSignal = `EXIT BTST ${config.exitTimeIst || "09:35"}`;
      return { action: "exit", reason: "btst" };
    }
    for (const open of opens) {
      const side = String(open.side || open.type || "BUY").toUpperCase();
      if (side !== "BUY") continue;
      const fill = Number(open.avg || 0);
      const mark = Number(open.ltp || fill);
      if (!(fill > 0) || !(mark > 0)) continue;
      const sl = fill * (1 - config.hedgeSlPct / 100);
      if (mark > sl) continue;
      if (pendingSame(orders, { strategy: algo.name, side: "SELL", symbol: open.symbol, securityId: open.securityId })) continue;
      adapter.place({
        symbol: open.symbol,
        side: "SELL",
        qty: open.qty || config.qty,
        lots: config.lots,
        lotSize: config.lotSize,
        price: mark,
        kind: "option",
        option: open.option,
        strike: open.strike,
        expiry: open.expiry,
        securityId: open.securityId || "",
        product: productOf(config),
        type: "MARKET",
        strategy: algo.name,
        exchangeSegment: exchangeSegmentFor("NIFTY"),
      });
      algo.lastSignal = `HEDGE SL ${open.option} ${open.strike} @ ${mark.toFixed(2)}`;
    }
    algo.lastSignal = algo.lastSignal || `HOLD BTST ${opens.length} legs · ₹${dayPnl.toFixed(0)}`;
    return { action: "hold", pnl: dayPnl };
  },

  maybeEnter({ algo, config, combo, expiries = {}, marks = {}, now, adapter, orders = [] }) {
    const state = test2State(algo);
    if (state.entered || state.lockedDay || state.inFlight) {
      algo.lastSignal = state.lockedDay ? "HOLD BTST" : "HOLD TEST2";
      return { action: "skip", reason: state.lockedDay ? "locked" : "open" };
    }
    if (!combo?.legs?.length) {
      algo.lastSignal = "WAIT PREMIUM";
      return { action: "wait", reason: "no-combo" };
    }
    state.inFlight = true;
    state.lockedDay = true;
    const placed = [];
    for (const leg of combo.legs) {
      const expiry = leg.expiryKind === "monthly" ? expiries.monthly : expiries.weekly;
      const payload = {
        symbol: `NIFTY ${leg.strike} ${leg.option}`,
        side: leg.side,
        qty: config.qty,
        lots: config.lots,
        lotSize: config.lotSize,
        price: Number(marks[`${leg.side}${leg.option}`] || leg.premium),
        kind: "option",
        option: leg.option,
        strike: leg.strike,
        expiry,
        securityId: "",
        product: productOf(config),
        type: "MARKET",
        strategy: algo.name,
        exchangeSegment: exchangeSegmentFor("NIFTY"),
      };
      if (pendingSame(orders, payload)) {
        algo.lastSignal = "WAIT ORDER";
        continue;
      }
      const result = adapter.place(payload);
      if (result?.error || String(result?.status || "").toUpperCase() === "REJECTED") {
        TradeLogger.record("rejected", { message: result?.error || "broker-rejected", strategy: algo.name, symbol: payload.symbol });
        algo.lastSignal = "REJECTED";
        state.inFlight = false;
        return { action: "rejected", result };
      }
      placed.push({ ...leg, expiry, result });
    }
    state.entered = true;
    state.inFlight = false;
    state.entryDate = sessionKeyIST(now || Date.now());
    state.legs = placed;
    TradeLogger.record("test2-signal", {
      strategy: algo.name,
      style: "btst",
      legs: placed.map((leg) => `${leg.side} ${leg.strike} ${leg.option}`),
    });
    algo.lastSignal = `BTST ${placed.map((leg) => `${leg.side} ${leg.strike} ${leg.option}`).join(" · ")}`;
    return { action: "entry", legs: placed };
  },

  tick(input = {}) {
    const algo = input.algo;
    if (!algo) return { action: "skip", reason: "no-algo" };
    const config = input.config || niftyTest2Config(algo);
    const now = Number(input.now) || Date.now();
    const opens = openLegs(input.positions, algo.name);
    const state = rollSession(test2State(algo), sessionKeyIST(now), opens.length > 0);
    if (input.feedLive === false) {
      algo.lastSignal = "FEED DOWN";
      return { action: "feed-down" };
    }
    if (opens.length) {
      return this.manageOpen({
        algo,
        config,
        opens,
        marks: input.marks || {},
        now,
        adapter: input.adapter,
        orders: input.orders || [],
      });
    }
    if (!inEntryWindow(now, config.startTimeIst, config.endTimeIst)) {
      algo.lastSignal = !state.entered ? "WAIT 09:35" : "WAIT SESSION";
      return { action: "wait", reason: "session" };
    }
    const combo = pickCombo({
      monthlyRows: input.monthlyRows || [],
      weeklyRows: input.weeklyRows || input.monthlyRows || [],
      sellPremium: config.sellPremium,
      hedgePremium: config.hedgePremium,
    });
    return this.maybeEnter({
      algo,
      config,
      combo,
      expiries: input.expiries || {},
      marks: input.marks || {},
      now,
      adapter: input.adapter,
      orders: input.orders || [],
    });
  },
};
