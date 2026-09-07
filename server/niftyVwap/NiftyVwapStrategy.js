import { optionEngineConfig } from "./config.js";
import { OptionStrikeSelector } from "./OptionStrikeSelector.js";
import { PositionManager, runtimeState, resetSession } from "./PositionManager.js";
import { RiskManager } from "./RiskManager.js";
import { TradeLogger } from "./TradeLogger.js";
import { TrailingStopManager } from "./TrailingStopManager.js";
import { VwapSignalEngine, sessionKeyIST } from "./VwapSignalEngine.js";

function istMinutesToClose(now = Date.now()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Kolkata",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })
      .formatToParts(new Date(now))
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  const minutes = Number(parts.hour) * 60 + Number(parts.minute);
  return 15 * 60 + 30 - minutes;
}

function fillFromResult(result, fallbackPrice) {
  const price = Number(result?.avg || result?.price || result?.ltp || fallbackPrice);
  return price > 0 ? price : 0;
}

export const NiftyVwapStrategy = {
  manageOpen({ algo, config, signal, open, mark, now, minutesToClose, adapter }) {
    const state = runtimeState(algo);
    if (!(mark > 0) || !(state.fillPrice > 0)) return { action: "hold" };
    const nextStop =
      config.useTrail === false
        ? Number(state.stopPrice || TrailingStopManager.initialStop(state.fillPrice, config.initialSlPct))
        : TrailingStopManager.nextStop({
            entry: state.fillPrice,
            mark,
            prevStop: state.stopPrice,
            initialSlPct: config.initialSlPct,
            activationPct: config.trailingActivationPct,
            stepPct: config.trailingStepPct,
          });
    if (config.useTrail !== false && nextStop > Number(state.stopPrice || 0)) {
      state.stopPrice = nextStop;
      if (TrailingStopManager.profitPct(state.fillPrice, mark) >= config.trailingActivationPct) {
        state.trailActive = true;
      }
    }
    if (state.exitQueued) return { action: "exit-pending" };
    const against = open.option === "PE" ? signal.againstPe : signal.againstCe;
    state.consecutiveAgainst = against;
    let reason = "";
    if (TrailingStopManager.hitStop(mark, state.stopPrice)) reason = "sl";
    else if (TrailingStopManager.hitTarget(mark, state.targetPrice)) reason = "target";
    else if (config.useVwapExit !== false && against >= config.vwapExitCandles) reason = "vwap-exit";
    else if (config.intradayOnly && minutesToClose <= config.eodSquareOffMinutes) reason = "eod";
    if (!reason) return { action: "hold", stop: state.stopPrice };
    const closed = adapter.exit({ ...open, ltp: mark });
    if (closed?.error) {
      TradeLogger.record("exit-failed", { reason: closed.error, message: closed.error });
      return { action: "exit-failed", reason: closed.error };
    }
    if (closed?.queued) {
      state.inFlight = true;
      state.exitQueued = true;
      TradeLogger.record("exit-queued", { reason, mark, strategy: algo.name });
      algo.lastSignal = `EXIT ${reason.toUpperCase()} QUEUED`;
      return { action: "exit-queued", reason, result: closed };
    }
    TradeLogger.record("exit", { reason, mark, stop: state.stopPrice, strategy: algo.name });
    PositionManager.clearOpen(state);
    algo.lastSignal = `EXIT ${reason.toUpperCase()}`;
    return { action: "exit", reason, result: closed };
  },

  maybeEnter({ algo, config, signal, spot, step, expiry, ceLtp, peLtp, positions, adapter }) {
    const state = runtimeState(algo);
    const gate = RiskManager.canEnter({ positions, inFlight: state.inFlight, maxPositions: config.maxPositions });
    if (!gate.ok) return { action: "skip", reason: gate.reason };
    if (!signal.buyCe && !signal.buyPe) return { action: "wait" };
    if (RiskManager.duplicateBar(state.lastEntryBarTime, signal.barTime)) {
      return { action: "skip", reason: "duplicate-bar" };
    }
    const option = signal.buyCe ? "CE" : "PE";
    const ltp = option === "CE" ? Number(ceLtp) : Number(peLtp);
    if (!(ltp > 0)) return { action: "wait", reason: "no-option-ltp" };
    const pick = OptionStrikeSelector.select({
      spot,
      step,
      option,
      symbol: config.symbol,
      locked: state.lockedStrike ? { strike: state.lockedStrike, option: state.lockedOption } : null,
    });
    if (!pick.strike) return { action: "wait", reason: "no-atm" };
    state.inFlight = true;
    state.lastEntryBarTime = signal.barTime;
    state.lastEntryAt = Date.now();
    PositionManager.lockContract(state, pick);
    const payload = {
      symbol: pick.symbol,
      side: "BUY",
      qty: config.qty,
      price: ltp,
      kind: "option",
      option: pick.option,
      strike: pick.strike,
      expiry,
      product: "MIS",
      type: "MARKET",
      strategy: algo.name,
      barTime: signal.barTime,
    };
    const result = adapter.place(payload);
    if (result?.error || String(result?.status || "").toUpperCase() === "REJECTED") {
      state.inFlight = false;
      PositionManager.clearOpen(state);
      TradeLogger.record("rejected", { message: result?.error || "broker-rejected", strategy: algo.name });
      algo.lastSignal = "REJECTED";
      return { action: "rejected", result };
    }
    const fill = fillFromResult(result, ltp);
    if (result?.queued) {
      TradeLogger.record("queued", { symbol: pick.symbol, strategy: algo.name });
      algo.lastSignal = `BUY ${pick.option} QUEUED`;
      return { action: "queued", pick, result };
    }
    if (!(fill > 0)) {
      state.inFlight = false;
      PositionManager.clearOpen(state);
      return { action: "rejected", reason: "no-fill" };
    }
    PositionManager.markFill(
      state,
      fill,
      TrailingStopManager.initialStop(fill, config.initialSlPct),
      TrailingStopManager.targetPrice(fill, config.targetPct),
    );
    TradeLogger.record("entry", { symbol: pick.symbol, fill, strategy: algo.name });
    algo.lastSignal = `BUY ${pick.option}`;
    return { action: "entry", pick, fill, result };
  },

  tick(input = {}) {
    const algo = input.algo;
    if (!algo) return { action: "skip", reason: "no-algo" };
    const config = input.config || optionEngineConfig(algo);
    const now = Number(input.now) || Date.now();
    const state = runtimeState(algo);
    resetSession(state, sessionKeyIST(now));
    state.feedOk = input.feedLive !== false;
    const minutesToClose = Number.isFinite(input.minutesToClose) ? input.minutesToClose : istMinutesToClose(now);

    if (input.feedLive === false && !PositionManager.openFor(input.positions, algo.name, state)) {
      TradeLogger.record("feed-down", { message: "Market data disconnected — entries paused", strategy: algo.name });
      algo.lastSignal = "FEED DOWN";
      return { action: "feed-down" };
    }

    const barMs = (Number(config.barMinutes) || 5) * 60 * 1000;
    const signal =
      config.signalMode === "reversal"
        ? VwapSignalEngine.evaluateReversal({
            futuresBars: input.futuresBars || [],
            now,
            barMs,
          })
        : VwapSignalEngine.evaluate({
            futuresBars: input.futuresBars || [],
            ceBars: input.ceBars || [],
            peBars: input.peBars || [],
            now,
            barMs,
          });
    if (signal.barTime) state.lastProcessedBarTime = signal.barTime;

    const open = PositionManager.openFor(input.positions, algo.name, state);
    if (open) {
      if (!state.fillPrice) {
        PositionManager.markFill(
          state,
          Number(open.avg || open.ltp),
          TrailingStopManager.initialStop(Number(open.avg || open.ltp), config.initialSlPct),
          TrailingStopManager.targetPrice(Number(open.avg || open.ltp), config.targetPct),
        );
        PositionManager.lockContract(state, {
          strike: open.strike,
          option: open.option,
          symbol: open.symbol,
        });
      }
      const mark = Number(
        open.option === "PE" ? input.peLtp || open.ltp : input.ceLtp || open.ltp || open.avg,
      );
      return this.manageOpen({
        algo,
        config,
        signal,
        open,
        mark,
        now,
        minutesToClose,
        adapter: input.adapter,
      });
    }

    if (state.inFlight && !open) {
      if (state.lastEntryAt && now - state.lastEntryAt > 120_000) {
        state.inFlight = false;
        if (!state.fillPrice) PositionManager.clearOpen(state);
        algo.lastSignal = "ORDER TIMEOUT";
      } else {
        return { action: "skip", reason: "in-flight" };
      }
    }

    if (config.intradayOnly && minutesToClose <= config.eodSquareOffMinutes) {
      algo.lastSignal = "EOD FLAT";
      return { action: "eod-flat" };
    }

    if (!signal.ready) return { action: "wait", reason: "need-completed-bar" };

    return this.maybeEnter({
      algo,
      config,
      signal,
      spot: Number(input.spot || signal.futuresClose),
      step: Number(input.step || 50),
      expiry: input.expiry,
      ceLtp: input.ceLtp,
      peLtp: input.peLtp,
      positions: input.positions || [],
      adapter: input.adapter,
    });
  },
};

export function noteBrokerRejection(algo) {
  if (!algo) return;
  const state = runtimeState(algo);
  state.inFlight = false;
  if (!state.fillPrice) PositionManager.clearOpen(state);
  algo.lastSignal = "REJECTED";
  TradeLogger.record("rejected", { strategy: algo.name, message: "broker-rejected" });
}

export function noteFeedReconnect(algo) {
  if (!algo) return;
  runtimeState(algo).feedOk = true;
  TradeLogger.record("feed-up", { strategy: algo.name, message: "Market data reconnected" });
}
