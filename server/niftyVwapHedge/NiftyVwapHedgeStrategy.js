import { OptionStrikeSelector } from "../niftyVwap/OptionStrikeSelector.js";
import { sessionBars, lastBarVwapReversal, aggregateSessionBars } from "../niftyVwap/VwapSignalEngine.js";
import { niftyVwapHedgeConfig } from "./config.js";
import {
  PHASE,
  hedgeState,
  resetHedgeCycle,
  round2,
  fillPrice,
  lotsFromQty,
  isPendingStatus,
  isMarginError,
} from "./HedgeState.js";

function cyclePnl(state, positions = []) {
  const unrealized = (positions || []).reduce((sum, row) => {
    const avg = Number(row.avg || 0);
    const ltp = Number(row.ltp || row.avg || 0);
    const qty = Number(row.qty || 0);
    const dir = String(row.type || "BUY").toUpperCase() === "SELL" ? -1 : 1;
    return sum + (ltp - avg) * qty * dir;
  }, 0);
  return round2(Number(state.realizedPnl || 0) + unrealized - Number(state.charges || 0));
}

function owned(positions = [], algoName) {
  return (positions || []).filter(
    (row) => Number(row.qty) > 0 && String(row.type || "BUY").toUpperCase() !== "CLOSED" && row.strategy === algoName,
  );
}

function pendingBuys(orders = [], pending = [], algoName) {
  const live = (pending || []).filter((row) => row.strategy === algoName && (row.side === "SELL" ? "SELL" : "BUY") === "BUY");
  const book = (orders || []).filter(
    (row) => row.strategy === algoName && row.side === "BUY" && isPendingStatus(row.status),
  );
  return [...live, ...book];
}

function totalLots(positions, lotSize) {
  return (positions || []).reduce((sum, row) => sum + lotsFromQty(row.qty, lotSize), 0);
}

function markCharges(state, lots, brokeragePerLot) {
  state.charges = round2(Number(state.charges || 0) + Number(lots) * Number(brokeragePerLot || 0));
}

function attachFill(state, role, fill, option) {
  if (role === "hedge") {
    state.hedgeEntered = true;
    state.hedgeEntryPrice = fill;
    state.hedgeSide = option;
    state.phase = PHASE.MONITOR_COMBINED;
    state.inFlight = false;
    state.pendingRole = "";
    return;
  }
  state.primarySide = option;
  state.primaryEntryPrice = fill;
  state.primaryTargetPrice = round2(fill * 1.4);
  state.hedgeTriggerPrice = round2(fill * 0.8);
  state.phase = option === "PE" ? PHASE.PE_PRIMARY : PHASE.CE_PRIMARY;
  state.inFlight = false;
  state.pendingRole = "";
}

function startCycle(state, capital, accountProfitPct) {
  const start = Number(capital) > 0 ? Number(capital) : 10_00_000;
  state.startingCapital = start;
  state.profitTarget = round2(start * (Number(accountProfitPct) || 5) / 100);
  state.realizedPnl = 0;
  state.charges = 0;
  state.hedgeEntered = false;
  state.hedgeEntryPrice = 0;
  state.hedgeSide = "";
  state.cycleId = `c${Date.now()}`;
}

export const NiftyVwapHedgeStrategy = {
  emergencyExit({ algo, positions, adapter, orders = [] }) {
    const state = hedgeState(algo);
    state.phase = PHASE.EXITING;
    state.inFlight = true;
    const open = owned(positions, algo.name);
    const results = [];
    for (const row of open) {
      const closed = adapter.exit(row);
      if (closed?.ok && Number.isFinite(Number(closed.pnl))) {
        state.realizedPnl = round2(state.realizedPnl + Number(closed.pnl));
      }
      results.push(closed);
    }
    if (typeof adapter.cancelPending === "function") {
      adapter.cancelPending({ strategy: algo.name, orders });
    }
    const remaining = owned(positions, algo.name);
    if (remaining.length) {
      algo.lastSignal = "EXIT ALL QUEUED";
      return { action: "exit-all", queued: true, results };
    }
    resetHedgeCycle(state);
    algo.lastSignal = "EXIT ALL · IDLE";
    return { action: "exit-all", results };
  },

  tick(input = {}) {
    const algo = input.algo;
    if (!algo) return { action: "skip", reason: "no-algo" };
    const config = input.config || niftyVwapHedgeConfig(algo);
    const now = Number(input.now) || Date.now();
    const state = hedgeState(algo);
    const positions = owned(input.positions, algo.name);
    const orders = input.orders || [];
    const pending = input.pending || [];
    const barMs = 15 * 60 * 1000;

    if (input.feedLive === false && !positions.length) {
      algo.lastSignal = "FEED DOWN";
      return { action: "feed-down" };
    }

    if (state.inFlight && positions.length) {
      const newest = [...positions].reverse().find((row) => {
        if (state.pendingRole === "hedge") return (row.role || "") === "hedge" || row.option === (state.primarySide === "PE" ? "CE" : "PE");
        return (row.role || "") === "primary" || row.option === state.primarySide || !state.hedgeEntered;
      }) || positions[0];
      const fill = fillPrice(newest, newest.avg);
      if (fill > 0 && state.pendingRole === "hedge" && !state.hedgeEntered) {
        markCharges(state, config.hedgeLots, config.brokeragePerLot);
        attachFill(state, "hedge", fill, newest.option || (state.primarySide === "PE" ? "CE" : "PE"));
      } else if (fill > 0 && !state.primaryEntryPrice) {
        markCharges(state, config.lots, config.brokeragePerLot);
        attachFill(state, "primary", fill, newest.option || state.primarySide || "CE");
        state.phase = PHASE.MONITOR_PRIMARY;
      } else {
        state.inFlight = false;
        state.pendingRole = "";
      }
    }

    if (state.inFlight && state.lastEntryAt && now - state.lastEntryAt > 120_000) {
      const stillPending = pendingBuys(orders, pending, algo.name).length > 0;
      if (stillPending) {
        algo.lastSignal = "ORDER STATUS WAIT";
        return { action: "skip", reason: "order-status" };
      }
      state.inFlight = false;
      state.pendingRole = "";
      algo.lastSignal = "ORDER TIMEOUT";
    }

    if (state.inFlight && !positions.length) {
      return { action: "skip", reason: "in-flight" };
    }

    if (state.phase === PHASE.EXITING) {
      if (positions.length) {
        return this.emergencyExit({ algo, positions: input.positions, adapter: input.adapter, orders });
      }
      if (pendingBuys(orders, pending, algo.name).length) {
        algo.lastSignal = "EXIT PENDING";
        return { action: "skip", reason: "exit-pending" };
      }
      resetHedgeCycle(state);
      algo.lastSignal = "EXIT ALL · IDLE";
      return { action: "exit-all" };
    }

    if (state.phase === PHASE.IDLE && !positions.length) {
      if (pendingBuys(orders, pending, algo.name).length) {
        state.inFlight = true;
        algo.lastSignal = "ORDER STATUS WAIT";
        return { action: "skip", reason: "order-status" };
      }
    }

    if (positions.length && state.primaryEntryPrice > 0 && state.phase === PHASE.IDLE) {
      state.phase = state.primarySide === "PE" ? PHASE.PE_PRIMARY : PHASE.CE_PRIMARY;
    }
    if (positions.length && state.hedgeEntered) state.phase = PHASE.MONITOR_COMBINED;
    else if (positions.length && state.primaryEntryPrice > 0) state.phase = PHASE.MONITOR_PRIMARY;

    const pnl = cyclePnl(state, positions);
    if (positions.length && state.profitTarget > 0 && pnl >= state.profitTarget) {
      return this.emergencyExit({ algo, positions: input.positions, adapter: input.adapter, orders });
    }

    const primaryPos = positions.find((row) => (row.role || "") === "primary") ||
      positions.find((row) => (row.option || "") === state.primarySide) ||
      positions[0];
    const hedgePos =
      positions.find((row) => (row.role || "") === "hedge") ||
      positions.find((row) => state.hedgeSide && row.option === state.hedgeSide);

    if (primaryPos && state.primaryEntryPrice > 0) {
      const mark = Number(primaryPos.ltp || primaryPos.avg);
      if (mark >= state.primaryTargetPrice) {
        const closed = input.adapter.exit(primaryPos);
        if (closed?.queued) {
          state.inFlight = true;
          algo.lastSignal = `EXIT PRIMARY +40% QUEUED`;
          return { action: "exit-queued", reason: "primary-target" };
        }
        if (closed?.ok && Number.isFinite(Number(closed.pnl))) {
          state.realizedPnl = round2(state.realizedPnl + Number(closed.pnl));
        }
        algo.lastSignal = `EXIT PRIMARY +40%`;
        if (state.hedgeEntered || hedgePos) {
          state.phase = PHASE.MONITOR_COMBINED;
          return { action: "exit-primary", reason: "primary-target" };
        }
        resetHedgeCycle(state);
        return { action: "exit-primary", reason: "primary-target" };
      }
      if (!state.hedgeEntered && !hedgePos && mark <= state.hedgeTriggerPrice && !state.inFlight) {
        if (totalLots(positions, config.lotSize) + config.hedgeLots > config.maxTotalLots) {
          algo.lastSignal = "MAX 3 LOTS";
          return { action: "skip", reason: "max-lots" };
        }
        if (pendingBuys(orders, pending, algo.name).some((row) => row.role === "hedge")) {
          return { action: "skip", reason: "hedge-pending" };
        }
        return this.placeHedge({ algo, config, input, state, now });
      }
    }

    if (state.hedgeEntered || hedgePos) {
      algo.lastSignal = `MONITOR COMBINED P&L ${pnl} / ${state.profitTarget}`;
      return { action: "hold", reason: "combined", pnl };
    }

    if (primaryPos) {
      algo.lastSignal = `MONITOR ${state.primarySide} ${Number(primaryPos.ltp || 0).toFixed(2)} TGT ${state.primaryTargetPrice} HEDGE ${state.hedgeTriggerPrice}`;
      return { action: "hold", reason: "primary" };
    }

    if (state.phase !== PHASE.IDLE && !positions.length && !state.inFlight) {
      resetHedgeCycle(state);
    }

    const futCompleted = aggregateSessionBars(sessionBars(input.futuresBars || [], now), 15, now);
    const reversal = lastBarVwapReversal(futCompleted);
    const preview = futCompleted[futCompleted.length - 1];
    if (!preview || !(reversal.vwap > 0)) {
      algo.lastSignal = "WAIT 15m CLOSE";
      return { action: "wait", reason: "need-completed-bar" };
    }
    if (now < Number(preview.time) + barMs) {
      algo.lastSignal = "WAIT 15m CLOSE";
      return { action: "wait", reason: "forming-bar" };
    }
    if (!reversal.buyCe && !reversal.buyPe) {
      algo.lastSignal = `WAIT 15m O ${reversal.open.toFixed(2)} C ${reversal.close.toFixed(2)} VWAP ${reversal.vwap.toFixed(2)}`;
      return { action: "wait", reason: "no-reversal" };
    }
    if (state.lastEntryBarTime && Number(state.lastEntryBarTime) === Number(preview.time)) {
      return { action: "skip", reason: "duplicate-bar" };
    }
    if (pendingBuys(orders, pending, algo.name).length || state.inFlight) {
      return { action: "skip", reason: "order-in-flight" };
    }
    if (positions.length) return { action: "skip", reason: "already-open" };

    const option = reversal.buyCe ? "CE" : "PE";
    const ltp = option === "CE" ? Number(input.ceLtp) : Number(input.peLtp);
    if (!(ltp > 0)) return { action: "wait", reason: "no-option-ltp" };
    if (input.requireSecurityId) {
      const sid = option === "PE" ? input.peSecurityId : input.ceSecurityId;
      if (!sid) return { action: "wait", reason: "no-security-id" };
    }
    const pick = OptionStrikeSelector.select({
      spot: Number(input.spot || reversal.close),
      step: Number(input.step || 50),
      option,
      symbol: "NIFTY",
    });
    if (!pick.strike) return { action: "wait", reason: "no-atm" };

    startCycle(state, input.capital, config.accountProfitPct);
    state.inFlight = true;
    state.lastEntryAt = now;
    state.lastEntryBarTime = Number(preview.time);
    state.pendingRole = "primary";
    state.primarySide = option;
    const result = input.adapter.place({
      symbol: pick.symbol,
      side: "BUY",
      qty: config.qty,
      price: ltp,
      kind: "option",
      option: pick.option,
      strike: pick.strike,
      expiry: input.expiry,
      product: "MIS",
      type: "MARKET",
      strategy: algo.name,
      role: "primary",
      allowHedge: false,
      barTime: preview.time,
      securityId: option === "PE" ? input.peSecurityId : input.ceSecurityId,
    });
    if (result?.duplicate) {
      state.inFlight = true;
      algo.lastSignal = "DUPLICATE BLOCKED";
      return { action: "skip", reason: "duplicate-order" };
    }
    if (result?.error || String(result?.status || "").toUpperCase() === "REJECTED") {
      state.inFlight = false;
      state.pendingRole = "";
      if (isMarginError(result?.error)) {
        algo.lastSignal = "MARGIN";
        return { action: "rejected", reason: "margin", result };
      }
      algo.lastSignal = "REJECTED";
      return { action: "rejected", result };
    }
    if (result?.queued) {
      algo.lastSignal = `BUY ${option} 1 LOT QUEUED`;
      return { action: "queued", pick, result };
    }
    const fill = fillPrice(result, ltp);
    if (!(fill > 0)) {
      state.inFlight = false;
      return { action: "rejected", reason: "no-fill" };
    }
    markCharges(state, config.lots, config.brokeragePerLot);
    attachFill(state, "primary", fill, option);
    state.phase = PHASE.MONITOR_PRIMARY;
    algo.lastSignal = `BUY ${option} 1 LOT @ ${fill} TGT ${state.primaryTargetPrice} HEDGE ${state.hedgeTriggerPrice}`;
    return { action: "entry", pick, fill, result };
  },

  placeHedge({ algo, config, input, state, now }) {
    const option = state.primarySide === "PE" ? "CE" : "PE";
    const ltp = option === "CE" ? Number(input.ceLtp) : Number(input.peLtp);
    if (!(ltp > 0)) return { action: "wait", reason: "no-hedge-ltp" };
    if (input.requireSecurityId) {
      const sid = option === "PE" ? input.peSecurityId : input.ceSecurityId;
      if (!sid) return { action: "wait", reason: "no-security-id" };
    }
    const pick = OptionStrikeSelector.select({
      spot: Number(input.spot || 0),
      step: Number(input.step || 50),
      option,
      symbol: "NIFTY",
    });
    if (!pick.strike) return { action: "wait", reason: "no-atm" };
    if (state.hedgeEntered) return { action: "skip", reason: "hedge-once" };
    state.inFlight = true;
    state.lastEntryAt = now;
    state.pendingRole = "hedge";
    const result = input.adapter.place({
      symbol: pick.symbol,
      side: "BUY",
      qty: config.hedgeQty,
      price: ltp,
      kind: "option",
      option: pick.option,
      strike: pick.strike,
      expiry: input.expiry,
      product: "MIS",
      type: "MARKET",
      strategy: algo.name,
      role: "hedge",
      allowHedge: true,
      securityId: option === "PE" ? input.peSecurityId : input.ceSecurityId,
    });
    if (result?.duplicate) {
      algo.lastSignal = "HEDGE DUPLICATE BLOCKED";
      return { action: "skip", reason: "duplicate-order" };
    }
    if (result?.error || String(result?.status || "").toUpperCase() === "REJECTED") {
      state.inFlight = false;
      state.pendingRole = "";
      if (isMarginError(result?.error)) {
        algo.lastSignal = "MARGIN";
        return { action: "rejected", reason: "margin", result };
      }
      algo.lastSignal = "HEDGE REJECTED";
      return { action: "rejected", result };
    }
    if (result?.queued) {
      algo.lastSignal = `BUY ${option} 2 LOT HEDGE QUEUED`;
      return { action: "queued", pick, result, role: "hedge" };
    }
    const fill = fillPrice(result, ltp);
    if (!(fill > 0)) {
      state.inFlight = false;
      state.pendingRole = "";
      return { action: "rejected", reason: "no-fill" };
    }
    markCharges(state, config.hedgeLots, config.brokeragePerLot);
    attachFill(state, "hedge", fill, option);
    algo.lastSignal = `HEDGE BUY ${option} 2 LOT @ ${fill}`;
    return { action: "hedge", pick, fill, result };
  },
};

export function noteHedgeBrokerRejection(algo) {
  if (!algo) return;
  const state = hedgeState(algo);
  state.inFlight = false;
  state.pendingRole = "";
  algo.lastSignal = "REJECTED";
}
