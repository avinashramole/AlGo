import { pendingExitOnBook } from "../pendingExit.js";
import { shivamT2sConfig } from "./config.js";
import { sizeShivamLots } from "./lots.js";
import { protectivePrices, slIsActive } from "./risk.js";
import { barIsStale, barIsValid, evaluateShivamEntry, lastCompletedBar } from "./signals.js";
import { entryBarKey, noteShivamEvent, resetShivamSession, shivamState } from "./state.js";
import { isLotMultiple, qtyForLots, strikeForPolicy } from "./strikes.js";

function round2(value) {
  return Math.round(Number(value) * 100) / 100;
}

function owned(positions = [], name) {
  return (positions || []).filter(
    (row) =>
      Number(row.qty) > 0 &&
      String(row.type || "BUY").toUpperCase() !== "CLOSED" &&
      (row.strategy === name || !row.strategy),
  );
}

function workingBuy(orders = []) {
  return (orders || []).some((row) => {
    if (String(row.side || "BUY").toUpperCase() === "SELL") return false;
    const status = String(row.status || "").toUpperCase();
    return !["REJECTED", "CANCELLED", "FAILED", "EXPIRED", "FILLED", "TRADED"].includes(status);
  });
}

function markNoTrade(algo, state, reason, extra = {}) {
  state.cardReady = false;
  state.cardSignal = "NO Trade";
  state.lastError = reason || "";
  algo.lastSignal = extra.signal || "NO Trade";
  algo.futureColor = extra.indexColor || state.lastIndexColor || "";
  algo.ceColor = extra.ceColor || state.lastCeColor || "";
  algo.peColor = extra.peColor || state.lastPeColor || "";
  return { action: "no-trade", reason, ...extra };
}

function markReady(algo, state, details) {
  state.cardReady = true;
  state.cardSignal = "● ● ●";
  Object.assign(state, details);
  algo.lastSignal = `BUY ${details.option} ${details.strike}`;
  algo.futureColor = details.indexColor;
  algo.ceColor = details.ceColor;
  algo.peColor = details.peColor;
}

export const ShivamT2sStrategy = {
  evaluate(input = {}) {
    const config = input.config || shivamT2sConfig(input.algo || {});
    const now = Number(input.now) || Date.now();
    const indexBar = lastCompletedBar(input.indexBars || [], config.indexBarMinutes * 60 * 1000, now);
    const ceBar = lastCompletedBar(input.ceBars || [], config.ceBarMinutes * 60 * 1000, now);
    const peBar = lastCompletedBar(input.peBars || [], config.peBarMinutes * 60 * 1000, now);
    const stale =
      !indexBar ||
      !ceBar ||
      !peBar ||
      barIsStale(indexBar, config.indexBarMinutes * 60 * 1000, now) ||
      barIsStale(ceBar, config.ceBarMinutes * 60 * 1000, now) ||
      barIsStale(peBar, config.peBarMinutes * 60 * 1000, now);
    const incomplete = !barIsValid(indexBar) || (!barIsValid(ceBar) && !barIsValid(peBar));
    return {
      stale,
      incomplete,
      indexBar,
      ceBar,
      peBar,
      ...evaluateShivamEntry({ indexBar, ceBar, peBar }),
    };
  },

  tick(input = {}) {
    const algo = input.algo;
    if (!algo) return { action: "skip", reason: "no-algo" };
    const config = input.config || shivamT2sConfig(algo);
    const state = shivamState(algo);
    const now = Number(input.now) || Date.now();
    const sessionDate = String(input.sessionDate || "");
    if (sessionDate && state.sessionDate && state.sessionDate !== sessionDate) {
      resetShivamSession(state, sessionDate);
    } else if (sessionDate && !state.sessionDate) {
      state.sessionDate = sessionDate;
    }

    const positions = input.positions || [];
    const orders = input.orders || [];
    const name = algo.name || config.name;
    const open = owned(positions, name);
    const authorized = input.authorized !== false && (config.enabled || input.evaluateOnly === true);
    const liveOk = config.runMode !== "live" || config.liveAuthorized === true;

    if (open[0] && Number(open[0].avg) > 0 && !(state.fillAvg > 0)) {
      state.fillAvg = Number(open[0].avg);
      state.fillQty = Number(open[0].qty) || 0;
      state.option = String(open[0].option || state.option || "").toUpperCase();
      state.strike = Number(open[0].strike || state.strike) || 0;
      const levels = protectivePrices({
        entryPremium: state.fillAvg,
        slMode: config.slMode,
        slValue: config.slValue,
        targetMode: config.targetMode,
        targetValue: config.targetValue,
        tickSize: config.tickSize,
      });
      if (levels.ok) {
        state.slPrice = levels.slPrice;
        state.targetPrice = levels.targetPrice;
        if (input.adapter?.mode === "paper") {
          state.slStatus = "paper-managed";
          state.targetStatus = "paper-managed";
        } else if (!slIsActive(state.slStatus)) {
          state.slStatus = "planned";
          state.targetStatus = "planned";
        }
      }
    }

    if (open.length) {
      const row = open[0];
      const mark = Number(row.ltp || input[state.option === "PE" ? "peLtp" : "ceLtp"] || row.avg);
      if (pendingExitOnBook(orders, row, name, state)) {
        return markNoTrade(algo, state, "exit-pending");
      }
      if (config.intradayOnly !== false) {
        const minutesToClose = Number(input.minutesToClose);
        if (Number.isFinite(minutesToClose) && minutesToClose <= Number(config.eodSquareOffMinutes || 15)) {
          return this.exitOpen(input, row, "eod");
        }
      }
      if (state.slPrice > 0 && mark > 0 && mark <= state.slPrice) {
        return this.exitOpen(input, row, "stop-loss");
      }
      if (state.targetPrice > 0 && mark > 0 && mark >= state.targetPrice) {
        return this.exitOpen(input, row, "target");
      }
      algo.lastSignal = `HOLD ${state.option || row.option} ${state.strike || row.strike}`;
      state.cardReady = false;
      state.cardSignal = "NO Trade";
      return { action: "hold", mark };
    }

    if (input.feedLive === false) {
      noteShivamEvent(state, "feed-down");
      return markNoTrade(algo, state, "feed-down");
    }
    if (!liveOk) {
      return markNoTrade(algo, state, "live-locked");
    }

    const signal = this.evaluate({ ...input, config, now });
    state.lastIndexColor = signal.indexColor;
    state.lastCeColor = signal.ceColor;
    state.lastPeColor = signal.peColor;
    state.lastIndexBarTime = signal.indexBarTime;
    state.lastCeBarTime = signal.ceBarTime;
    state.lastPeBarTime = signal.peBarTime;
    algo.futureColor = signal.indexColor;
    algo.ceColor = signal.ceColor;
    algo.peColor = signal.peColor;

    if (signal.stale || signal.incomplete || !signal.indexBar) {
      return markNoTrade(algo, state, signal.stale ? "stale" : "incomplete", signal);
    }
    if (!signal.buyCe && !signal.buyPe) {
      return markNoTrade(algo, state, "no-setup", signal);
    }

    const option = signal.buyCe ? "CE" : "PE";
    const barTime = option === "PE" ? signal.peBarTime : signal.ceBarTime;
    const key = entryBarKey(option, barTime);
    if (state.lastEntryBarKey === key) {
      return markNoTrade(algo, state, "duplicate", signal);
    }
    if (workingBuy(orders) || state.inFlight) {
      return markNoTrade(algo, state, "in-flight", signal);
    }
    if (Number(state.sessionTrades || 0) >= Number(config.maxTradesPerDay)) {
      noteShivamEvent(state, "daily-limit", { used: state.sessionTrades, limit: config.maxTradesPerDay });
      return markNoTrade(algo, state, "daily-limit", signal);
    }

    const premium = option === "PE" ? Number(input.peLtp) : Number(input.ceLtp);
    const securityId = option === "PE" ? input.peSecurityId : input.ceSecurityId;
    const lotSize = Math.max(0, Math.round(Number(input.lotSize) || 0));
    const strike = strikeForPolicy(input.spot, input.step, config.strikePolicy, config.strikeOffset, option);
    if (!(strike > 0) || !(premium > 0) || (input.requireSecurityId && !securityId)) {
      noteShivamEvent(state, "contract", { strike, premium, securityId: securityId || "" });
      return markNoTrade(algo, state, "contract", signal);
    }
    const quoteAge = Number(input.quoteAgeMs);
    if (Number.isFinite(quoteAge) && quoteAge > 15_000) {
      return markNoTrade(algo, state, "stale-premium", signal);
    }

    const sized = sizeShivamLots({
      requestedLots: config.lots,
      premium,
      lotSize,
      availableFunds: input.availableFunds,
      capitalMode: config.capitalMode,
      capitalValue: config.capitalValue,
      brokeragePerLot: config.brokeragePerLot,
      autoSizeLots: config.autoSizeLots,
    });
    if (!sized.ok) {
      noteShivamEvent(state, "lots", sized);
      return markNoTrade(algo, state, sized.reason, signal);
    }

    const planned = protectivePrices({
      entryPremium: premium,
      slMode: config.slMode,
      slValue: config.slValue,
      targetMode: config.targetMode,
      targetValue: config.targetValue,
      tickSize: config.tickSize,
    });
    if (!planned.ok) {
      noteShivamEvent(state, "risk-levels", planned);
      return markNoTrade(algo, state, planned.reason, signal);
    }

    const details = {
      option,
      strike,
      expiry: input.expiry || "",
      securityId: securityId || "",
      symbol: `${config.symbol} ${strike} ${option}`,
      premium,
      quoteAt: now,
      requestedLots: sized.requested,
      approvedLots: sized.approvedLots,
      maxLots: sized.maxLots,
      lotSize: sized.lotSize,
      orderValue: sized.orderValue,
      requiredFunds: sized.requiredFunds,
      slPrice: planned.slPrice,
      targetPrice: planned.targetPrice,
      indexColor: signal.indexColor,
      ceColor: signal.ceColor,
      peColor: signal.peColor,
      indexBarTime: signal.indexBarTime,
      ceBarTime: signal.ceBarTime,
      peBarTime: signal.peBarTime,
      futuresInstrument: config.futuresInstrument,
      indexLabel: config.indexLabel,
    };

    const riskApproved = Boolean(input.riskApproved !== false && sized.ok && planned.ok && liveOk);
    if (!riskApproved || !authorized || !config.enabled) {
      if (config.enabled && authorized && riskApproved) markReady(algo, state, details);
      else {
        Object.assign(state, details);
        markNoTrade(algo, state, !config.enabled ? "disabled" : "not-authorized", signal);
      }
      if (!config.enabled || input.evaluateOnly) return { action: "preview", details };
      return { action: "no-trade", reason: "not-armed", details };
    }

    markReady(algo, state, details);
    if (input.evaluateOnly) return { action: "ready", details };

    state.inFlight = true;
    state.sessionTrades = Number(state.sessionTrades || 0) + 1;
    const qty = qtyForLots(sized.approvedLots, sized.lotSize);
    if (!isLotMultiple(qty, sized.lotSize)) {
      state.inFlight = false;
      state.sessionTrades = Math.max(0, Number(state.sessionTrades) - 1);
      return markNoTrade(algo, state, "invalid-qty", signal);
    }

    const result = input.adapter?.place?.({
      symbol: details.symbol,
      side: "BUY",
      qty,
      lots: sized.approvedLots,
      lotSize: sized.lotSize,
      price: premium,
      kind: "option",
      option,
      strike,
      expiry: details.expiry,
      securityId: details.securityId,
      product: "MIS",
      type: "MARKET",
      strategy: name,
      barTime,
      role: "shivam-entry",
      exchangeSegment: config.segment,
    });
    const rejected = !result || result.error || ["REJECTED", "FAILED", "CANCELLED"].includes(String(result.status || "").toUpperCase());
    if (rejected) {
      state.inFlight = false;
      state.sessionTrades = Math.max(0, Number(state.sessionTrades) - 1);
      noteShivamEvent(state, "rejected", { error: result?.error || result?.status || "rejected" });
      return markNoTrade(algo, state, "rejected", signal);
    }
    state.inFlight = false;
    state.lastEntryBarKey = key;
    state.fillAvg = Number(result.avg || result.price || premium);
    state.fillQty = Number(result.qty || qty);
    const levels = protectivePrices({
      entryPremium: state.fillAvg,
      slMode: config.slMode,
      slValue: config.slValue,
      targetMode: config.targetMode,
      targetValue: config.targetValue,
      tickSize: config.tickSize,
    });
    if (levels.ok) {
      state.slPrice = levels.slPrice;
      state.targetPrice = levels.targetPrice;
      state.slStatus = input.adapter?.mode === "paper" ? "paper-managed" : "planned";
      state.targetStatus = state.slStatus;
    }
    noteShivamEvent(state, "entry", { option, strike, qty, avg: state.fillAvg });
    algo.lastSignal = `BUY ${option} ${strike}`;
    return { action: "entered", option, strike, qty, result, details };
  },

  exitOpen(input, position, reason) {
    const algo = input.algo;
    const state = shivamState(algo);
    const result = input.adapter?.exit?.({ ...position, exitReason: reason, role: reason });
    if (result?.error) {
      state.slStatus = "rejected";
      noteShivamEvent(state, "exit-failed", { reason, error: result.error });
      algo.lastSignal = "EXIT FAILED";
      return { action: "exit-failed", reason, error: result.error };
    }
    state.cardReady = false;
    state.cardSignal = "NO Trade";
    state.slStatus = "";
    state.targetStatus = "";
    noteShivamEvent(state, "exit", { reason });
    algo.lastSignal = `EXIT ${reason}`;
    return { action: "exited", reason, result };
  },
};
