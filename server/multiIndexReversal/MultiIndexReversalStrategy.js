import { multiIndexReversalConfig } from "./config.js";
import { evaluateEntry, lastCompletedBar, lossPct, positionPnl, premiumValue, sameIntervalBar } from "./signals.js";
import { isLotMultiple, reversalQty, strikeForIndexOffset } from "./strikes.js";
import { PHASE, isOpenPhase, mirState, markError, resetCycle, round2, startCycle, transition } from "./state.js";

function fillFrom(result, fallback) {
  const px = Number(result?.avg || result?.price || result?.ltp || fallback);
  return px > 0 ? px : 0;
}

function owned(positions = [], name) {
  return (positions || []).filter(
    (row) => Number(row.qty) > 0 && row.strategy === name && String(row.type || "BUY").toUpperCase() !== "CLOSED",
  );
}

function pendingExit(orders = [], open, name) {
  return (orders || []).some((row) => {
    if (String(row.strategy || "") !== String(name || "")) return false;
    if (String(row.side || "").toUpperCase() !== "SELL") return false;
    const status = String(row.status || "").toUpperCase();
    if (["REJECTED", "CANCELLED", "FAILED", "EXPIRED", "FILLED", "TRADED"].includes(status)) return false;
    if (open?.securityId && row.securityId && String(open.securityId) === String(row.securityId)) return true;
    return Boolean(open?.symbol && row.symbol && open.symbol === row.symbol);
  });
}

function pickLeg(positions, option, name) {
  return owned(positions, name).find((row) => String(row.option || "").toUpperCase() === option) || null;
}

function chargesFor(state, lots, brokerage) {
  state.charges = round2(Number(state.charges || 0) + Number(lots) * Number(brokerage || 0));
}

function combinedTargetAmount(state, config) {
  const original = premiumValue(state.originalAvg, state.originalQty);
  const reversal = premiumValue(state.reversalAvg, state.reversalQty);
  const basis = config.combinedTargetBasis === "combined" ? original + reversal : original;
  return round2(basis * (Number(config.combinedTargetPct) / 100));
}

function combinedNet(state, positions, name) {
  const open = owned(positions, name);
  const unrealized = open.reduce((sum, row) => sum + positionPnl(row.avg, row.ltp || row.avg, row.qty), 0);
  return round2(Number(state.realizedPnl || 0) + unrealized - Number(state.charges || 0));
}

function placeBuy({ adapter, config, option, strike, qty, price, expiry, securityId, barTime, role }) {
  if (!(qty > 0) || !isLotMultiple(qty, config.lotSize)) return { error: "invalid-qty" };
  if (!(price > 0)) return { error: "no-premium" };
  if (!strike) return { error: "no-strike" };
  if (typeof adapter?.checkFunds === "function") {
    const funds = adapter.checkFunds({ qty, price, lots: qty / config.lotSize });
    if (funds === false || funds?.ok === false) return { error: funds?.error || "insufficient-funds" };
  }
  return adapter.place({
    symbol: `${config.symbol} ${strike} ${option}`,
    side: "BUY",
    qty,
    lots: qty / config.lotSize,
    lotSize: config.lotSize,
    price,
    kind: "option",
    option,
    strike,
    expiry,
    securityId: securityId || "",
    product: "MIS",
    type: "MARKET",
    strategy: config.name,
    barTime,
    role,
    exchangeSegment: config.segment,
  });
}

function snapshotCycleConfig(config) {
  return {
    symbol: config.symbol,
    exchange: config.exchange,
    timeframe: config.timeframe,
    barMinutes: config.barMinutes,
    strikeOffset: config.strikeOffset,
    initialTargetPct: config.initialTargetPct,
    reversalLossPct: config.reversalLossPct,
    reversalQtyMultiple: config.reversalQtyMultiple,
    combinedTargetPct: config.combinedTargetPct,
    combinedTargetBasis: config.combinedTargetBasis,
    maxCycleLossPct: config.maxCycleLossPct,
    lots: config.lots,
    lotSize: config.lotSize,
    qty: config.qty,
    brokeragePerLot: config.brokeragePerLot,
  };
}

function activeConfig(algo, input, state) {
  const live = input.config || multiIndexReversalConfig(algo);
  if (state.cycleConfig && isOpenPhase(state.phase)) {
    return { ...live, ...state.cycleConfig, name: live.name, segment: live.segment };
  }
  return live;
}

function attachOriginal(state, option, strike, qty, fill, orderId, config) {
  state.originalOption = option;
  state.originalStrike = strike;
  state.originalQty = qty;
  state.originalAvg = fill;
  state.originalTarget = round2(fill * (1 + Number(config.initialTargetPct) / 100));
  state.originalOrderId = orderId || "";
  state.cycleConfig = snapshotCycleConfig(config);
  transition(state, option === "PE" ? PHASE.PE_ACTIVE : PHASE.CE_ACTIVE, "original-fill");
}

function attachReversal(state, option, strike, qty, fill, orderId) {
  state.reversalOption = option;
  state.reversalStrike = strike;
  state.reversalQty = qty;
  state.reversalAvg = fill;
  state.reversalOrderId = orderId || "";
  state.reversalDone = true;
  state.originalTarget = 0;
  transition(state, PHASE.COMBINED_POSITION_ACTIVE, "reversal-fill");
}

export const MultiIndexReversalStrategy = {
  evaluateSignal(input = {}) {
    const config = input.config || multiIndexReversalConfig(input.algo || {});
    const barMs = config.barMinutes * 60 * 1000;
    const indexBar = lastCompletedBar(input.indexBars || [], barMs, input.now);
    if (!indexBar) return { ready: false, buyCe: false, buyPe: false };
    const ceBar = sameIntervalBar(input.ceBars || [], indexBar.time);
    const peBar = sameIntervalBar(input.peBars || [], indexBar.time);
    return { ready: true, ...evaluateEntry({ indexBar, ceBar, peBar }) };
  },

  combinedTargetAmount,
  combinedNet,
  lossPct,

  tick(input = {}) {
    const algo = input.algo;
    if (!algo) return { action: "skip", reason: "no-algo" };
    const state = mirState(algo);
    const config = activeConfig(algo, input, state);
    const now = Number(input.now) || Date.now();
    if (!state.phase || state.phase === PHASE.IDLE || state.phase === PHASE.COMPLETED) {
      startCycle(state, now);
    }
    if (input.emergency) {
      return this.emergencyExit(input);
    }
    const positions = input.positions || [];
    const orders = input.orders || [];
    const name = algo.name || config.name;
    const open = owned(positions, name);
    if (input.feedLive === false && !open.length) {
      algo.lastSignal = "FEED DOWN";
      return { action: "feed-down" };
    }

    const signal = this.evaluateSignal({ ...input, config });
    if (signal.barTime) {
      state.lastIndexColor = signal.indexColor;
      state.lastCeColor = signal.ceColor;
      state.lastPeColor = signal.peColor;
    }

    if (state.phase === PHASE.EXIT_PENDING || state.phase === PHASE.RECONCILING) {
      return this.finishExit(input, open);
    }

    if (state.phase === PHASE.CE_ACTIVE || state.phase === PHASE.PE_ACTIVE) {
      const original = pickLeg(positions, state.originalOption, name) || open[0];
      if (!original) {
        resetCycle(state, "original-closed", now);
        algo.lastSignal = "CYCLE CLOSED";
        return { action: "completed" };
      }
      const mark = Number(original.ltp || input[state.originalOption === "PE" ? "peLtp" : "ceLtp"] || original.avg);
      if (state.originalTarget > 0 && mark >= state.originalTarget) {
        return this.exitOne(input, original, "initial-target");
      }
      const invested = premiumValue(state.originalAvg || original.avg, state.originalQty || original.qty);
      if (config.maxCycleLossPct > 0 && combinedNet(state, positions, name) <= -round2(invested * config.maxCycleLossPct / 100)) {
        return this.emergencyExit({ ...input, reason: "max-cycle-loss" });
      }
      const loss = lossPct(state.originalAvg || original.avg, mark);
      const wantReversal =
        !state.reversalDone &&
        loss >= Number(config.reversalLossPct) &&
        ((state.originalOption === "CE" && signal.indexColor === "red") || (state.originalOption === "PE" && signal.indexColor === "green"));
      if (wantReversal && signal.barTime && signal.barTime !== state.lastBarTime) {
        return this.enterReversal(input, original, signal);
      }
      algo.lastSignal = `HOLD ${state.originalOption} ${state.originalStrike} @ ${Number(mark).toFixed(2)} TGT ${state.originalTarget} LOSS ${loss.toFixed(1)}%`;
      return { action: "hold" };
    }

    if (state.phase === PHASE.COMBINED_POSITION_ACTIVE) {
      const target = combinedTargetAmount(state, config);
      const net = combinedNet(state, positions, name);
      if (config.maxCycleLossPct > 0) {
        const invested = premiumValue(state.originalAvg, state.originalQty);
        if (net <= -round2(invested * config.maxCycleLossPct / 100)) {
          return this.emergencyExit({ ...input, reason: "max-cycle-loss" });
        }
      }
      if (net >= target) {
        return this.exitAll(input, "combined-target");
      }
      algo.lastSignal = `COMBINED NET ${net} TGT ${target}`;
      return { action: "hold-combined", net, target };
    }

    if (isOpenPhase(state.phase) && state.phase !== PHASE.WAITING_FOR_SIGNAL) {
      algo.lastSignal = String(state.phase || "").replace(/_/g, " ");
      return { action: "pending", phase: state.phase };
    }

    if (!signal.ready || !signal.barTime) {
      algo.lastSignal = `WAIT ${config.timeframe} CLOSE`;
      return { action: "wait", reason: "no-bar" };
    }
    const barMs = (config.barMinutes || 15) * 60 * 1000;
    if (now - signal.barTime > barMs * 2.5) {
      algo.lastSignal = "STALE CANDLE";
      return { action: "skip", reason: "stale-bar" };
    }
    if (signal.barTime === state.lastBarTime) {
      algo.lastSignal = "HOLD SAME CANDLE";
      return { action: "skip", reason: "duplicate-bar" };
    }
    if (open.length) {
      algo.lastSignal = "WAIT CYCLE CLOSE";
      return { action: "skip", reason: "cycle-open" };
    }
    if (signal.buyCe) return this.enterOriginal(input, signal, "CE");
    if (signal.buyPe) return this.enterOriginal(input, signal, "PE");
    algo.lastSignal = `NO TRADE · ${config.symbol} ${String(signal.indexColor || "").toUpperCase()} CE ${String(signal.ceColor || "—").toUpperCase()} PE ${String(signal.peColor || "—").toUpperCase()}`;
    state.lastBarTime = signal.barTime;
    return { action: "wait", reason: "no-signal", signal };
  },

  enterOriginal(input, signal, option) {
    const algo = input.algo;
    const state = mirState(algo);
    const config = activeConfig(algo, input, state);
    const strike = strikeForIndexOffset(input.spot, input.step, config.strikeOffset, option);
    const ltp = option === "PE" ? Number(input.peLtp) : Number(input.ceLtp);
    const securityId = option === "PE" ? input.peSecurityId : input.ceSecurityId;
    if (input.requireSecurityId && !securityId) {
      algo.lastSignal = `WAIT ${option} CONTRACT`;
      return { action: "wait", reason: "no-contract" };
    }
    transition(state, option === "PE" ? PHASE.PE_ENTRY_PENDING : PHASE.CE_ENTRY_PENDING, "entry");
    const result = placeBuy({
      adapter: input.adapter,
      config,
      option,
      strike,
      qty: config.qty,
      price: ltp,
      expiry: input.expiry,
      securityId,
      barTime: signal.barTime,
      role: "original",
    });
    if (result?.error || String(result?.status || "").toUpperCase() === "REJECTED") {
      markError(state, result?.error || "rejected");
      algo.lastSignal = `REJECTED ${option}`;
      resetCycle(state, "entry-rejected", input.now);
      return { action: "rejected", result };
    }
    if (result?.duplicate || result?.queued === false) {
      algo.lastSignal = `WAIT ${option} ORDER`;
      return { action: "queued" };
    }
    const fill = fillFrom(result, ltp);
    if (result?.queued && !(fill > 0)) {
      algo.lastSignal = `BUY ${option} SENDING`;
      state.lastBarTime = signal.barTime;
      return { action: "queued", result };
    }
    if (!(fill > 0)) {
      resetCycle(state, "no-fill", input.now);
      return { action: "rejected", reason: "no-fill" };
    }
    const filledQty = Number(result.qty || result.filledQty || config.qty);
    if (!(filledQty > 0) || !isLotMultiple(filledQty, config.lotSize)) {
      resetCycle(state, "partial-fill-invalid", input.now);
      return { action: "rejected", reason: "invalid-fill-qty" };
    }
    chargesFor(state, filledQty / config.lotSize, config.brokeragePerLot);
    attachOriginal(state, option, strike, filledQty, fill, result?.orderId || result?.id, config);
    state.lastBarTime = signal.barTime;
    state.expiry = input.expiry || "";
    state.symbol = config.symbol;
    algo.lastSignal = `BUY ${strike} ${option} @ ${fill.toFixed(2)} TGT ${state.originalTarget}`;
    return { action: "entry", option, strike, fill, result };
  },

  enterReversal(input, original, signal) {
    const algo = input.algo;
    const state = mirState(algo);
    const config = activeConfig(algo, input, state);
    const option = state.originalOption === "PE" ? "CE" : "PE";
    const strike = strikeForIndexOffset(input.spot, input.step, config.strikeOffset, option);
    const qty = reversalQty(state.originalQty || original.qty, config.reversalQtyMultiple, config.lotSize);
    if (!qty || !isLotMultiple(qty, config.lotSize)) {
      markError(state, "invalid-reversal-qty");
      algo.lastSignal = "REVERSAL QTY INVALID";
      return { action: "error", reason: "invalid-qty" };
    }
    const ltp = option === "PE" ? Number(input.peLtp) : Number(input.ceLtp);
    const securityId = option === "PE" ? input.peSecurityId : input.ceSecurityId;
    transition(state, state.originalOption === "CE" ? PHASE.CE_TO_PE_REVERSAL_PENDING : PHASE.PE_TO_CE_REVERSAL_PENDING, "reversal");
    if (typeof input.adapter?.cancelTarget === "function") {
      const cancelled = input.adapter.cancelTarget(original);
      if (cancelled && cancelled.ok === false) {
        state.lastError = cancelled.error || "target-cancel-unverified";
        algo.lastSignal = "TARGET CANCEL UNVERIFIED";
        if (cancelled.block) {
          transition(state, state.originalOption === "PE" ? PHASE.PE_ACTIVE : PHASE.CE_ACTIVE, "target-cancel-failed");
          return { action: "target-cancel-failed", result: cancelled };
        }
      }
    }
    state.originalTarget = 0;
    const result = placeBuy({
      adapter: input.adapter,
      config,
      option,
      strike,
      qty,
      price: ltp,
      expiry: input.expiry || original.expiry,
      securityId,
      barTime: signal.barTime,
      role: "reversal",
    });
    if (result?.error || String(result?.status || "").toUpperCase() === "REJECTED") {
      transition(state, state.originalOption === "PE" ? PHASE.PE_ACTIVE : PHASE.CE_ACTIVE, "reversal-rejected");
      state.lastError = result?.error || "reversal-rejected";
      algo.lastSignal = `REVERSAL REJECTED · HOLD ${state.originalOption}`;
      return { action: "reversal-rejected", result };
    }
    if (result?.queued && !(Number(result.avg || result.price) > 0)) {
      algo.lastSignal = `BUY ${option} REVERSAL SENDING`;
      state.lastBarTime = signal.barTime;
      return { action: "queued", result };
    }
    const fill = fillFrom(result, ltp);
    if (!(fill > 0)) {
      transition(state, state.originalOption === "PE" ? PHASE.PE_ACTIVE : PHASE.CE_ACTIVE, "reversal-no-fill");
      return { action: "reversal-rejected", reason: "no-fill" };
    }
    const filledQty = Number(result.qty || result.filledQty || qty);
    if (!(filledQty > 0) || !isLotMultiple(filledQty, config.lotSize)) {
      transition(state, state.originalOption === "PE" ? PHASE.PE_ACTIVE : PHASE.CE_ACTIVE, "reversal-qty-invalid");
      state.lastError = "invalid-reversal-fill-qty";
      return { action: "reversal-rejected", reason: "invalid-fill-qty" };
    }
    chargesFor(state, filledQty / config.lotSize, config.brokeragePerLot);
    attachReversal(state, option, strike, filledQty, fill, result?.orderId || result?.id);
    state.lastBarTime = signal.barTime;
    algo.lastSignal = `REVERSAL BUY ${strike} ${option} ×${filledQty} @ ${fill.toFixed(2)}`;
    return { action: "reversal", option, strike, qty: filledQty, fill, result };
  },

  exitOne(input, open, reason) {
    const algo = input.algo;
    const state = mirState(algo);
    if (pendingExit(input.orders, open, algo.name)) {
      transition(state, PHASE.EXIT_PENDING, reason);
      algo.lastSignal = "EXIT PENDING";
      return { action: "exit-pending" };
    }
    const closed = input.adapter.exit(open);
    if (closed?.error) {
      markError(state, closed.error);
      return { action: "exit-failed", reason: closed.error };
    }
    if (closed?.duplicate || closed?.queued === false) {
      transition(state, PHASE.EXIT_PENDING, reason);
      algo.lastSignal = "EXIT PENDING";
      return { action: "exit-pending" };
    }
    if (Number.isFinite(Number(closed?.pnl))) state.realizedPnl = round2(Number(state.realizedPnl || 0) + Number(closed.pnl));
    resetCycle(state, reason, input.now);
    algo.lastSignal = `EXIT ${reason}`;
    return { action: "exit", reason, result: closed };
  },

  exitAll(input, reason) {
    const algo = input.algo;
    const state = mirState(algo);
    const name = algo.name;
    const open = owned(input.positions, name);
    transition(state, PHASE.EXIT_PENDING, reason);
    const results = [];
    for (const row of open) {
      if (pendingExit(input.orders, row, name)) continue;
      const closed = input.adapter.exit(row);
      results.push(closed);
      if (closed?.ok && Number.isFinite(Number(closed.pnl))) {
        state.realizedPnl = round2(Number(state.realizedPnl || 0) + Number(closed.pnl));
      }
    }
    if (owned(input.positions, name).length && results.every((row) => row?.queued || row?.duplicate)) {
      algo.lastSignal = "EXIT PENDING";
      return { action: "exit-pending", results };
    }
    transition(state, PHASE.RECONCILING, reason);
    if (!owned(input.positions, name).length) {
      transition(state, PHASE.COMPLETED, reason);
      resetCycle(state, reason, input.now);
    }
    algo.lastSignal = `EXIT ${reason}`;
    return { action: "exit-all", reason, results };
  },

  finishExit(input, open) {
    const algo = input.algo;
    const state = mirState(algo);
    if (open.length) {
      algo.lastSignal = "RECONCILING";
      return this.exitAll(input, state.lastTransitionReason || "reconcile");
    }
    transition(state, PHASE.COMPLETED, "closed");
    resetCycle(state, "closed", input.now);
    algo.lastSignal = "CYCLE CLOSED";
    return { action: "completed" };
  },

  emergencyExit(input) {
    const algo = input.algo;
    const state = mirState(algo);
    algo.lastSignal = "EMERGENCY EXIT";
    return this.exitAll({ ...input, algo }, input.reason || "emergency");
  },
};
