import { exchangeSegmentFor } from "../optionChain.js";
import { niftyTest2Config } from "../niftyVwap/config.js";
import { sessionKeyIST } from "../niftyVwap/VwapSignalEngine.js";
import { TradeLogger } from "../niftyVwap/TradeLogger.js";
import { inEntryWindow, pickCombo } from "./Test2Engine.js";

function round2(value) {
  return Number(Number(value).toFixed(2));
}

function test2State(algo) {
  if (!algo.test2State || typeof algo.test2State !== "object") algo.test2State = {};
  return algo.test2State;
}

function resetDay(state, day) {
  if (state.sessionDate === day) return state;
  state.sessionDate = day;
  state.entered = false;
  state.lockedDay = false;
  state.inFlight = false;
  state.dayPnl = 0;
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

function markFor(leg, marks = {}) {
  const key = `${leg.option}${leg.expiryKind === "monthly" ? "M" : "W"}`;
  return Number(marks[key] || marks[`${leg.side}${leg.option}`] || marks[leg.option] || 0);
}

export const Test2Strategy = {
  manageOpen({ algo, config, opens = [], marks = {}, minutesToClose, adapter, orders = [] }) {
    const state = test2State(algo);
    if (!opens.length) {
      if (state.entered) {
        algo.lastSignal = "FLAT";
        return { action: "flat" };
      }
      return { action: "hold" };
    }
    const eod = config.intradayOnly && minutesToClose <= config.eodSquareOffMinutes;
    let dayPnl = 0;
    for (const open of opens) {
      const fill = Number(open.avg || open.ltp || 0);
      const mark = Number(open.ltp || fill);
      const dir = String(open.side || open.type || "BUY").toUpperCase() === "SELL" ? -1 : 1;
      if (fill > 0 && mark > 0) dayPnl += (mark - fill) * Number(open.qty || config.qty) * dir;
    }
    state.dayPnl = Number(dayPnl.toFixed(2));
    if (config.overallTarget > 0 && dayPnl >= config.overallTarget) {
      adapter.squareOff?.({ strategy: algo.name, reason: "overall-target" });
      algo.lastSignal = `EXIT TARGET ₹${dayPnl.toFixed(0)}`;
      return { action: "exit", reason: "overall-target" };
    }
    if (config.overallSl > 0 && dayPnl <= -config.overallSl) {
      adapter.squareOff?.({ strategy: algo.name, reason: "overall-sl" });
      algo.lastSignal = `EXIT SL ₹${dayPnl.toFixed(0)}`;
      return { action: "exit", reason: "overall-sl" };
    }
    if (eod) {
      adapter.squareOff?.({ strategy: algo.name, reason: "eod" });
      algo.lastSignal = "EXIT EOD 15:15";
      return { action: "exit", reason: "eod" };
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
        product: "MIS",
        type: "MARKET",
        strategy: algo.name,
        exchangeSegment: exchangeSegmentFor("NIFTY"),
      });
      algo.lastSignal = `HEDGE SL ${open.option} ${open.strike} @ ${mark.toFixed(2)}`;
    }
    algo.lastSignal = algo.lastSignal || `HOLD TEST2 ${opens.length} legs · ₹${dayPnl.toFixed(0)}`;
    return { action: "hold", pnl: dayPnl };
  },

  maybeEnter({ algo, config, combo, expiries = {}, marks = {}, adapter, orders = [] }) {
    const state = test2State(algo);
    if (state.entered || state.lockedDay || state.inFlight) {
      algo.lastSignal = state.lockedDay ? "WAIT NEXT DAY" : "HOLD TEST2";
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
        product: "MIS",
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
    state.legs = placed;
    TradeLogger.record("test2-signal", {
      strategy: algo.name,
      legs: placed.map((leg) => `${leg.side} ${leg.strike} ${leg.option}`),
    });
    algo.lastSignal = placed.map((leg) => `${leg.side} ${leg.strike} ${leg.option}`).join(" · ");
    return { action: "entry", legs: placed };
  },

  tick(input = {}) {
    const algo = input.algo;
    if (!algo) return { action: "skip", reason: "no-algo" };
    const config = input.config || niftyTest2Config(algo);
    const now = Number(input.now) || Date.now();
    const state = resetDay(test2State(algo), sessionKeyIST(now));
    const minutesToClose = Number.isFinite(input.minutesToClose) ? input.minutesToClose : 0;
    if (input.feedLive === false) {
      algo.lastSignal = "FEED DOWN";
      return { action: "feed-down" };
    }
    const opens = openLegs(input.positions, algo.name);
    if (opens.length) {
      return this.manageOpen({
        algo,
        config,
        opens,
        marks: input.marks || {},
        minutesToClose,
        adapter: input.adapter,
        orders: input.orders || [],
      });
    }
    if (!inEntryWindow(now, config.startTimeIst, config.endTimeIst)) {
      algo.lastSignal = now && !state.entered ? "WAIT 09:35" : "WAIT SESSION";
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
      adapter: input.adapter,
      orders: input.orders || [],
    });
  },
};
