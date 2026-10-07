import { exchangeSegmentFor } from "../optionChain.js";
import { liveExitPrice } from "../executionSpeed.js";
import { niftyTest1Config } from "../niftyVwap/config.js";
import { OptionStrikeSelector } from "../niftyVwap/OptionStrikeSelector.js";
import { PositionManager, runtimeState, resetSession } from "../niftyVwap/PositionManager.js";
import { RiskManager } from "../niftyVwap/RiskManager.js";
import { TradeLogger } from "../niftyVwap/TradeLogger.js";
import { TrailingStopManager } from "../niftyVwap/TrailingStopManager.js";
import { sessionKeyIST } from "../niftyVwap/VwapSignalEngine.js";
import { Test1SignalEngine } from "./Test1SignalEngine.js";

function round2(value) {
  return Number(Number(value).toFixed(2));
}

function fillFromResult(result, fallbackPrice) {
  const price = Number(result?.avg || result?.price || result?.ltp || fallbackPrice);
  return price > 0 ? price : 0;
}

function pendingExitOnBook(orders = [], open, strategyName) {
  return (orders || []).some((row) => {
    if (row?.copyUserId) return false;
    if (String(row.strategy || "") !== String(strategyName || "")) return false;
    if (String(row.side || "").toUpperCase() !== "SELL") return false;
    const status = String(row.status || "").toUpperCase();
    if (["REJECTED", "CANCELLED", "FAILED", "EXPIRED", "FILLED", "TRADED"].includes(status)) return false;
    if (open?.securityId && row.securityId && String(open.securityId) === String(row.securityId)) return true;
    if (open?.symbol && row.symbol && open.symbol === row.symbol) return true;
    return false;
  });
}

function targetFromEntry(entry, signal, config) {
  const size = String(config.targetSource || "body") === "range" ? Number(signal.range) : Number(signal.body);
  return round2(Number(entry) + Math.max(0, size) * Number(config.targetMultiple || 1));
}

function applySignalLevels(state, fill, signal, config) {
  state.fillPrice = Number(fill);
  state.stopPrice = round2(Number(signal.low));
  state.targetPrice = targetFromEntry(fill, signal, config);
  state.signalOpen = Number(signal.open);
  state.signalHigh = Number(signal.high);
  state.signalLow = Number(signal.low);
  state.signalClose = Number(signal.close);
  state.signalBody = Number(signal.body);
  state.signalRange = Number(signal.range);
  state.signalBodyPct = Number(signal.bodyPct);
  state.signalWickPct = Number(signal.wickPct);
  state.buyPhase = "open";
  state.inFlight = false;
  return state;
}

export const Test1Strategy = {
  manageOpen({ algo, config, signal, open, mark, minutesToClose, adapter, targetResting, orders = [] }) {
    const state = runtimeState(algo);
    if (!(mark > 0) || !(state.fillPrice > 0)) return { action: "hold" };
    const live = liveExitPrice({
      chain: mark,
      tick: open.ltp,
      avg: open.avg || state.fillPrice,
      ticked: open.ticked === true,
    });
    const trailMark = live || Number(mark);
    if (state.exitQueued || pendingExitOnBook(orders, open, algo.name)) {
      algo.lastSignal = "EXIT PENDING";
      return { action: "exit-pending" };
    }
    let reason = "";
    if (TrailingStopManager.hitStop(trailMark, state.stopPrice)) reason = "sl";
    else if (TrailingStopManager.hitTarget(trailMark, state.targetPrice)) reason = "target";
    else if (config.intradayOnly && minutesToClose <= config.eodSquareOffMinutes) reason = "eod";
    if (!reason) {
      algo.lastSignal = `HOLD ${open.option || ""} ${open.strike || ""} @ ${Number(trailMark).toFixed(2)} TGT ${state.targetPrice} SL ${state.stopPrice}`;
      return { action: "hold", stop: state.stopPrice, target: state.targetPrice };
    }
    if (reason === "target" && targetResting) {
      algo.lastSignal = "EXIT TARGET AT BROKER";
      return { action: "exit-pending", reason: "target" };
    }
    const closed = adapter.exit({ ...open, ltp: trailMark });
    if (closed?.error) {
      TradeLogger.record("exit-failed", { reason: closed.error, strategy: algo.name });
      return { action: "exit-failed", reason: closed.error };
    }
    if (closed?.duplicate || closed?.queued === false) {
      state.exitQueued = true;
      algo.lastSignal = "EXIT PENDING";
      return { action: "exit-pending", reason };
    }
    TradeLogger.record("exit", {
      reason,
      mark: trailMark,
      stop: state.stopPrice,
      target: state.targetPrice,
      orderId: closed?.orderId || closed?.id || open?.orderId || "",
      strategy: algo.name,
    });
    if (closed?.queued) {
      state.inFlight = true;
      state.exitQueued = true;
      algo.lastSignal = `EXIT ${reason.toUpperCase()} QUEUED`;
      return { action: "exit-queued", reason, result: closed };
    }
    PositionManager.clearOpen(state);
    algo.lastSignal = `EXIT ${reason.toUpperCase()}`;
    return { action: "exit", reason, result: closed };
  },

  maybeEnter({ algo, config, signal, spot, step, expiry, ceLtp, peLtp, ceSecurityId, peSecurityId, positions, adapter }) {
    const state = runtimeState(algo);
    const gate = RiskManager.canEnter({ positions, inFlight: state.inFlight, maxPositions: 1 });
    if (!gate.ok) return { action: "skip", reason: gate.reason };
    if (RiskManager.duplicateBar(state.lastEntryBarTime, signal.barTime) || RiskManager.duplicateBar(state.sentSignalBarTime, signal.barTime)) {
      algo.lastSignal = "HOLD 1 SIGNAL";
      return { action: "skip", reason: "duplicate-bar" };
    }
    if (signal.waitingEval) {
      algo.lastSignal = `WAIT ${config.startTimeIst || "09:30"} ATM 5m`;
      return { action: "wait", reason: "wait-start" };
    }
    if (!signal.buyCe && !signal.buyPe) {
      if (!signal.ready) {
        algo.lastSignal = "WAIT ATM 5m";
        return { action: "wait", reason: "wait-bar" };
      }
      algo.lastSignal = `NO TRADE · ATM ${signal.green ? "GREEN" : "NOT GREEN"} BODY ${(signal.bodyPct * 100).toFixed(1)}% WICK ${(signal.wickPct * 100).toFixed(1)}%`;
      return { action: "wait", reason: "no-signal" };
    }
    const option = signal.buyCe ? "CE" : "PE";
    const ltp = option === "CE" ? Number(ceLtp) : Number(peLtp);
    if (!(ltp > 0)) {
      algo.lastSignal = "WAIT OPTION LTP";
      return { action: "wait", reason: "no-option-ltp" };
    }
    const pick = OptionStrikeSelector.select({
      spot,
      step,
      option,
      symbol: config.symbol || "NIFTY",
      strikeOffset: 0,
    });
    if (!pick.strike) {
      algo.lastSignal = "WAIT ATM";
      return { action: "wait", reason: "no-atm" };
    }
    state.inFlight = true;
    state.lastEntryBarTime = signal.barTime;
    state.sentSignalBarTime = signal.barTime;
    state.lastEntryAt = Date.now();
    PositionManager.lockContract(state, pick);
    const payload = {
      symbol: pick.symbol,
      side: "BUY",
      qty: config.qty,
      lots: config.lots,
      lotSize: config.lotSize,
      price: ltp,
      kind: "option",
      option: pick.option,
      strike: pick.strike,
      expiry,
      securityId: option === "PE" ? peSecurityId || "" : ceSecurityId || "",
      product: "MIS",
      type: "MARKET",
      strategy: algo.name,
      barTime: signal.barTime,
      exchangeSegment: exchangeSegmentFor(pick.symbol),
    };
    TradeLogger.record("test1-signal", {
      strategy: algo.name,
      option,
      strike: pick.strike,
      open: signal.open,
      high: signal.high,
      low: signal.low,
      close: signal.close,
      bodyPct: signal.bodyPct,
      wickPct: signal.wickPct,
      entry: ltp,
      target: targetFromEntry(ltp, signal, config),
      sl: signal.low,
    });
    const result = adapter.place(payload);
    if (result?.error || String(result?.status || "").toUpperCase() === "REJECTED") {
      state.inFlight = false;
      PositionManager.clearOpen(state);
      state.lastEntryBarTime = signal.barTime;
      state.sentSignalBarTime = signal.barTime;
      TradeLogger.record("rejected", { message: result?.error || "broker-rejected", strategy: algo.name, barTime: signal.barTime });
      algo.lastSignal = "REJECTED";
      return { action: "rejected", result };
    }
    if (result?.duplicate || result?.queued === false) {
      state.buyPhase = "entry";
      state.inFlight = true;
      algo.lastSignal = "WAIT ORDER";
      return { action: "skip", reason: "buy-active" };
    }
    const fill = fillFromResult(result, ltp);
    if (result?.queued) {
      state.buyPhase = "entry";
      applySignalLevels(state, ltp, signal, config);
      state.buyPhase = "entry";
      state.inFlight = true;
      TradeLogger.record("queued", {
        symbol: pick.symbol,
        strategy: algo.name,
        entry: ltp,
        target: state.targetPrice,
        sl: state.stopPrice,
        orderId: result?.orderId || result?.id || "",
      });
      algo.lastSignal = `BUY ${pick.strike} ${pick.option} SENDING`;
      return { action: "queued", pick, result };
    }
    if (!(fill > 0)) {
      state.inFlight = false;
      PositionManager.clearOpen(state);
      return { action: "rejected", reason: "no-fill" };
    }
    applySignalLevels(state, fill, signal, config);
    TradeLogger.record("entry", {
      symbol: pick.symbol,
      fill,
      target: state.targetPrice,
      sl: state.stopPrice,
      bodyPct: signal.bodyPct,
      wickPct: signal.wickPct,
      open: signal.open,
      high: signal.high,
      low: signal.low,
      close: signal.close,
      orderId: result?.orderId || result?.id || "",
      strategy: algo.name,
    });
    algo.lastSignal = `BUY ${pick.strike} ${pick.option} @ ${fill.toFixed(2)} TGT ${state.targetPrice} SL ${state.stopPrice}`;
    return { action: "entry", pick, fill, result };
  },

  tick(input = {}) {
    const algo = input.algo;
    if (!algo) return { action: "skip", reason: "no-algo" };
    const config = input.config || niftyTest1Config(algo);
    const now = Number(input.now) || Date.now();
    const state = runtimeState(algo);
    resetSession(state, sessionKeyIST(now));
    state.feedOk = input.feedLive !== false;
    const minutesToClose = Number.isFinite(input.minutesToClose) ? input.minutesToClose : 0;
    if (input.feedLive === false && !PositionManager.openFor(input.positions, algo.name, state)) {
      algo.lastSignal = "FEED DOWN";
      return { action: "feed-down" };
    }
    const signal = Test1SignalEngine.evaluate({
      ceBars: input.ceBars || [],
      peBars: input.peBars || [],
      now,
      barMs: (Number(config.barMinutes) || 5) * 60 * 1000,
      startTimeIst: config.startTimeIst,
      endTimeIst: config.endTimeIst,
      minBodyPct: config.minBodyPct,
      maxWickPct: config.maxWickPct,
    });
    const open = PositionManager.openFor(input.positions, algo.name, state);
    if (open) {
      if (!state.fillPrice) {
        applySignalLevels(state, Number(open.avg || open.ltp), signal.barTime ? signal : { ...signal, low: state.signalLow || open.avg, body: state.signalBody, range: state.signalRange }, config);
        PositionManager.lockContract(state, {
          strike: open.strike,
          option: open.option,
          symbol: open.symbol,
        });
      } else if (Number(open.avg) > 0 && Number(open.avg) !== Number(state.fillPrice)) {
        applySignalLevels(state, Number(open.avg), {
          open: state.signalOpen,
          high: state.signalHigh,
          low: state.signalLow,
          close: state.signalClose,
          body: state.signalBody,
          range: state.signalRange,
        }, config);
      }
      const mark = Number((open.option === "PE" ? input.peLtp : input.ceLtp) || open.ltp || open.avg);
      return this.manageOpen({
        algo,
        config,
        signal,
        open,
        mark,
        minutesToClose,
        adapter: input.adapter,
        targetResting: input.targetResting === true,
        orders: input.orders || [],
      });
    }
    if (state.buyPhase === "entry" && !open) {
      const buys = (input.orders || []).filter(
        (row) => !row?.copyUserId && String(row.strategy || "") === algo.name && String(row.side || "BUY").toUpperCase() !== "SELL",
      );
      const working = buys.some((row) => {
        const status = String(row.status || "").toUpperCase();
        return !["REJECTED", "CANCELLED", "FAILED", "EXPIRED", "FILLED", "TRADED"].includes(status);
      });
      if (working) {
        algo.lastSignal = "WAIT ORDER";
        return { action: "skip", reason: "buy-active" };
      }
      state.buyPhase = "";
      state.inFlight = false;
    }
    return this.maybeEnter({
      algo,
      config,
      signal,
      spot: input.spot,
      step: input.step,
      expiry: input.expiry,
      ceLtp: input.ceLtp,
      peLtp: input.peLtp,
      ceSecurityId: input.ceSecurityId,
      peSecurityId: input.peSecurityId,
      positions: input.positions,
      adapter: input.adapter,
    });
  },
};
