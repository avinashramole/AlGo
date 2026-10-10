import { liveExitPrice } from "../executionSpeed.js";
import { isSaneOptionLtp } from "../positionMark.js";
import { exchangeSegmentFor } from "../optionChain.js";
import { optionEngineConfig } from "./config.js";
import { OptionStrikeSelector } from "./OptionStrikeSelector.js";
import { PositionManager, runtimeState, resetSession } from "./PositionManager.js";
import { RiskManager } from "./RiskManager.js";
import { TradeLogger } from "./TradeLogger.js";
import { TrailingStopManager } from "./TrailingStopManager.js";
import { VwapSignalEngine, istWallTime, sessionKeyIST } from "./VwapSignalEngine.js";

function pad2(value) {
  return String(value).padStart(2, "0");
}

function candleWindowIst(barTime, barMinutes) {
  const time = Number(barTime);
  if (!(time > 0)) return "";
  const wall = istWallTime(time);
  const start = wall.hour * 60 + wall.minute;
  const end = start + Math.max(1, Number(barMinutes) || 5);
  return `${pad2(wall.hour)}:${pad2(wall.minute)}–${pad2(Math.floor(end / 60) % 24)}:${pad2(end % 60)} IST`;
}

function futTapeLabel(config) {
  return String(config?.symbol || "").toUpperCase() === "CRUDEOIL" ? "CRUDE FUT" : "NIFTY FUT";
}

function niftyFutCandleText(signal, config) {
  const open = Number(signal.futuresOpen || 0).toFixed(2);
  const close = Number(signal.futuresClose || 0).toFixed(2);
  const clock = candleWindowIst(signal.barTime, config.barMinutes || 5);
  return { open, close, clock: clock ? ` · ${clock}` : "" };
}

function trackedOptionStrike(state, spot, step, strikeOffset, option) {
  if (state?.lockedOption === option && Number(state.lockedStrike) > 0) return Number(state.lockedStrike);
  return OptionStrikeSelector.strikeForOffset(spot, step, strikeOffset);
}

function optionColorText(option, color, strike) {
  const price = Number(strike) > 0 ? ` ${Number(strike)}` : "";
  return `${option}${price} ${String(color || "").toUpperCase()}`;
}

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

function holdLevelsText(open, state, mark) {
  const strike = Number(open?.strike || state?.lockedStrike) || "";
  const option = open?.option || state?.lockedOption || "";
  const px = Number(mark) > 0 ? Number(mark).toFixed(2) : "";
  const sl = Number(state?.stopPrice) > 0 ? Number(state.stopPrice).toFixed(2) : "";
  const tgt = Number(state?.targetPrice) > 0 ? Number(state.targetPrice).toFixed(2) : "";
  const head = [option, strike].filter(Boolean).join(" ");
  const levels = [px ? `@ ${px}` : "", sl ? `SL ${sl}` : "", tgt ? `TGT ${tgt}` : ""].filter(Boolean).join(" ");
  return `HOLD${head ? ` ${head}` : ""}${levels ? ` · ${levels}` : ""}`;
}

function brokerConfirmPx(open = {}) {
  if (open.ticked === true && Number(open.ltp) > 0) return Number(open.ltp);
  if (Number(open.avg) > 0) return Number(open.avg);
  return Number(open.ltp) || 0;
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
    if (open?.option && row.option && open.option === row.option && Number(open.strike) === Number(row.strike)) return true;
    return false;
  });
}

export const NiftyVwapStrategy = {
  manageOpen({ algo, config, signal, open, mark, now, minutesToClose, adapter, targetResting, orders = [] }) {
    const state = runtimeState(algo);
    if (!(state.fillPrice > 0)) return { action: "hold" };
    const live = liveExitPrice({
      chain: mark,
      tick: open.ltp,
      avg: open.avg || state.fillPrice,
      ticked: open.ticked === true,
    });
    const trailMark = live > 0 ? live : isSaneOptionLtp(mark, state.fillPrice) ? Number(mark) : 0;
    if (!(trailMark > 0)) {
      if (config.signalMode === "first-candle") algo.lastSignal = holdLevelsText(open, state, 0);
      return { action: "hold", reason: "wait-mark" };
    }
    const stopMark = trailMark;
    const nextStop =
      config.useTrail === false
        ? Number(state.stopPrice || TrailingStopManager.initialStop(state.fillPrice, config.initialSlPct))
          : TrailingStopManager.nextStop({
            entry: state.fillPrice,
            mark: trailMark,
            prevStop: state.stopPrice,
            initialSlPct: config.initialSlPct,
            activationPct: config.trailingActivationPct,
            stepPct: config.trailingStepPct,
            lockToEntry: config.lockToEntry === true,
            trailEveryPct: config.trailingEveryPct,
            trailShiftPct: config.trailingShiftPct,
          });
    if (config.useTrail !== false && nextStop > Number(state.stopPrice || 0)) {
      state.stopPrice = nextStop;
      if (TrailingStopManager.profitPct(state.fillPrice, trailMark) >= config.trailingActivationPct) {
        state.trailActive = true;
      }
    }
    if (state.exitQueued || pendingExitOnBook(orders, open, algo.name)) {
      algo.lastSignal = "EXIT PENDING";
      return { action: "exit-pending" };
    }
    const against = open.option === "PE" ? signal.againstPe : signal.againstCe;
    state.consecutiveAgainst = against;
    let reason = "";
    if (TrailingStopManager.hitStop(stopMark, state.stopPrice)) reason = "sl";
    else if (TrailingStopManager.hitTarget(trailMark, state.targetPrice)) reason = "target";
    else if (config.useVwapExit !== false && against >= config.vwapExitCandles) reason = "vwap-exit";
    else if (config.intradayOnly && minutesToClose <= config.eodSquareOffMinutes) reason = "eod";
    if (reason === "sl") {
      const brokerPx = brokerConfirmPx(open);
      if (brokerPx > Number(state.stopPrice) && trailMark / Math.max(brokerPx, trailMark) < 0.7 && open.ticked !== true) {
        reason = "";
      }
    }
    if (!reason) {
      if (config.signalMode === "first-candle") algo.lastSignal = holdLevelsText(open, state, trailMark);
      return { action: "hold", stop: state.stopPrice, target: state.targetPrice };
    }
    if (reason === "target" && targetResting) {
      algo.lastSignal = "EXIT TARGET AT BROKER";
      return { action: "exit-pending", reason: "target" };
    }
    const closed = adapter.exit({ ...open, ltp: trailMark });
    if (closed?.error) {
      TradeLogger.record("exit-failed", { reason: closed.error, message: closed.error });
      return { action: "exit-failed", reason: closed.error };
    }
    if (closed?.duplicate || closed?.queued === false) {
      state.exitQueued = true;
      algo.lastSignal = "EXIT PENDING";
      return { action: "exit-pending", reason };
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

  maybeEnter({ algo, config, signal, spot, step, expiry, ceLtp, peLtp, ceSecurityId, peSecurityId, positions, adapter }) {
    const state = runtimeState(algo);
    const gate = RiskManager.canEnter({ positions, inFlight: state.inFlight, maxPositions: config.maxPositions });
    if (!gate.ok) return { action: "skip", reason: gate.reason };
    const crudeSignal = String(config.symbol || "").toUpperCase() === "CRUDEOIL" && config.signalMode === "first-candle";
    if (config.signalMode === "first-candle") {
      const maxTrades = Math.max(1, Number(config.maxTradesPerDay) || 5);
      if (Number(state.sessionTrades || 0) >= maxTrades) {
        algo.lastSignal = "MAX TRADES";
        return { action: "skip", reason: "max-trades" };
      }
    }
    if (crudeSignal && RiskManager.duplicateBar(state.sentSignalBarTime, signal.barTime)) {
      algo.lastSignal = "HOLD 1 SIGNAL";
      return { action: "skip", reason: "duplicate-bar" };
    }
    if (!signal.buyCe && !signal.buyPe) {
      if (config.signalMode === "first-candle") {
        const tape = niftyFutCandleText(signal, config);
        const preview = signal.previewCandle || signal.previewLive ? "PREVIEW " : "";
        if (signal.waitingEval && !signal.previewLive) {
          algo.lastSignal = "WAIT 09:05 FIRST 5m CLOSE";
          return { action: "wait", reason: "wait-eval" };
        }
        const fut = futTapeLabel(config);
        const ceTrack = trackedOptionStrike(state, spot, step, config.strikeOffset, "CE");
        const peTrack = trackedOptionStrike(state, spot, step, config.strikeOffset, "PE");
        const strikeNote = ceTrack && ceTrack === peTrack ? ` · STRIKE ${ceTrack}` : "";
        if (signal.niftyColor === "doji") {
          algo.lastSignal = `NO TRADE · ${preview}${fut} DOJI O ${tape.open} C ${tape.close}${tape.clock}${strikeNote} · next 5m`;
          return { action: "wait", reason: "first-doji" };
        }
        if (signal.niftyColor === "green" && signal.ceColor !== "green") {
          algo.lastSignal = signal.ceColor
            ? `NO TRADE · ${preview}${fut} GREEN ${optionColorText("CE", signal.ceColor, ceTrack)} O ${tape.open} C ${tape.close}${tape.clock} · next 5m`
            : ceTrack
              ? `WAIT CE ${ceTrack} 5m`
              : "WAIT CE 5m";
          return { action: "wait", reason: signal.ceColor ? "ce-not-green" : "wait-ce" };
        }
        if (signal.niftyColor === "red" && signal.peColor !== "green") {
          algo.lastSignal = signal.peColor
            ? `NO TRADE · ${preview}${fut} RED ${optionColorText("PE", signal.peColor, peTrack)} O ${tape.open} C ${tape.close}${tape.clock} · next 5m`
            : peTrack
              ? `WAIT PE ${peTrack} 5m`
              : "WAIT PE 5m";
          return { action: "wait", reason: signal.peColor ? "pe-not-green" : "wait-pe" };
        }
        algo.lastSignal = "WAIT NEXT 5m";
        return { action: "wait", reason: "wait-first-candle" };
      }
      if (config.signalMode === "reversal") {
        const open = Number(signal.futuresOpen || 0).toFixed(2);
        const close = Number(signal.futuresClose || 0).toFixed(2);
        const vwap = Number(signal.futuresVwap || 0).toFixed(2);
        algo.lastSignal = `WAIT ${config.barMinutes || 15}m O ${open} C ${close} VWAP ${vwap}`;
        return { action: "wait", reason: "no-reversal" };
      }
      algo.lastSignal = "WAIT OPTION VWAP";
      return { action: "wait", reason: "no-signal" };
    }
    if (RiskManager.duplicateBar(state.lastEntryBarTime, signal.barTime)) {
      return { action: "skip", reason: "duplicate-bar" };
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
      symbol: config.symbol,
      strikeOffset: config.strikeOffset,
      locked: state.lockedStrike ? { strike: state.lockedStrike, option: state.lockedOption } : null,
    });
    if (!pick.strike) {
      algo.lastSignal = "WAIT ATM";
      return { action: "wait", reason: "no-atm" };
    }
    state.inFlight = true;
    state.lastEntryBarTime = signal.barTime;
    if (crudeSignal) state.sentSignalBarTime = signal.barTime;
    state.lastEntryAt = Date.now();
    state.fillPrice = 0;
    state.stopPrice = 0;
    state.targetPrice = 0;
    state.trailActive = false;
    state.exitQueued = false;
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
    const result = adapter.place(payload);
    if (result?.error || String(result?.status || "").toUpperCase() === "REJECTED") {
      state.inFlight = false;
      PositionManager.clearOpen(state);
      TradeLogger.record("rejected", { message: result?.error || "broker-rejected", strategy: algo.name });
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
      TradeLogger.record("queued", { symbol: pick.symbol, strategy: algo.name });
      algo.lastSignal = `BUY ${pick.option} SENDING`;
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
    if (config.signalMode === "first-candle") {
      state.sessionTrades = Number(state.sessionTrades || 0) + 1;
    }
    TradeLogger.record("entry", {
      symbol: pick.symbol,
      fill,
      strategy: algo.name,
      open: signal.futuresOpen,
      close: signal.futuresClose,
      vwap: signal.futuresVwap,
    });
    algo.lastSignal =
      config.signalMode === "first-candle"
        ? `BUY ${pick.strike} ${pick.option} · ${signal.previewCandle || signal.previewLive ? "PREVIEW " : ""}${futTapeLabel(config)} ${String(signal.niftyColor || "").toUpperCase()} + ${optionColorText(pick.option, "GREEN", pick.strike)} O ${Number(signal.futuresOpen || 0).toFixed(2)} C ${Number(signal.futuresClose || 0).toFixed(2)}${niftyFutCandleText(signal, config).clock}`
        : `BUY ${pick.option} O ${Number(signal.futuresOpen || 0).toFixed(2)} C ${Number(signal.futuresClose || 0).toFixed(2)} VWAP ${Number(signal.futuresVwap || 0).toFixed(2)}`;
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
        : config.signalMode === "first-candle"
          ? VwapSignalEngine.evaluateFirstCandle({
              futuresBars: input.futuresBars || [],
              ceBars: input.ceBars || [],
              peBars: input.peBars || [],
              now,
              barMs,
              firstBarStartIst: config.firstBarStartIst || "09:00",
              entryEvaluationIst: config.entryEvaluationIst || "09:05",
              endTimeIst: config.endTimeIst || "15:15",
              scanUntilSignal: String(config.symbol || "").toUpperCase() === "CRUDEOIL",
              afterBarTime: Math.max(Number(state.lastEntryBarTime || 0), Number(state.sentSignalBarTime || 0)),
            })
          : VwapSignalEngine.evaluate({
              futuresBars: input.futuresBars || [],
              ceBars: input.ceBars || [],
              peBars: input.peBars || [],
              now,
              barMs,
            });
    if (signal.barTime) state.lastProcessedBarTime = signal.barTime;
    const buyLocked = state.buyPhase === "entry" || state.buyPhase === "open" || state.inFlight;
    if (
      config.signalMode === "first-candle" &&
      signal.ready &&
      signal.barTime &&
      state.processedFirstBarTime !== signal.barTime &&
      !(buyLocked && (signal.buyCe || signal.buyPe))
    ) {
      state.processedFirstBarTime = signal.barTime;
      TradeLogger.record("first-candle-signal", {
        strategy: algo.name,
        niftyColor: signal.niftyColor,
        ceColor: signal.ceColor,
        peColor: signal.peColor,
        signal: signal.buyCe ? "BUY CE" : signal.buyPe ? "BUY PE" : "NO TRADE",
        open: signal.futuresOpen,
        close: signal.futuresClose,
      });
    }

    const open = PositionManager.openFor(input.positions, algo.name, state);
    if (open) {
      state.buyPhase = "open";
      const fill = Number(open.avg || open.ltp);
      const staleFill =
        fill > 0 &&
        Number(state.fillPrice) > 0 &&
        Math.abs(fill - Number(state.fillPrice)) / Math.max(fill, Number(state.fillPrice)) > 0.15;
      if (fill > 0 && (!state.fillPrice || (staleFill && state.trailActive !== true))) {
        const leg = PositionManager.niftyOptionLeg(open) || {};
        PositionManager.markFill(
          state,
          fill,
          TrailingStopManager.initialStop(fill, config.initialSlPct),
          TrailingStopManager.targetPrice(fill, config.targetPct),
        );
        PositionManager.lockContract(state, {
          strike: open.strike || leg.strike,
          option: open.option || leg.option,
          symbol: open.symbol,
        });
      }
      const leg = PositionManager.niftyOptionLeg(open);
      const mark = Number(
        (leg?.option || open.option) === "PE" ? input.peLtp || open.ltp : input.ceLtp || open.ltp || open.avg,
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
        targetResting: input.targetResting === true,
        orders: input.orders || [],
      });
    }

    if (!open && (input.positions || []).some((row) => PositionManager.isOpenNiftyOption(row))) {
      algo.lastSignal = "";
      return { action: "skip", reason: "already-open" };
    }

    if (state.buyPhase === "entry" && !open) {
      const buys = (input.orders || []).filter(
        (row) => !row?.copyUserId && String(row.strategy || "") === algo.name && String(row.side || "BUY").toUpperCase() !== "SELL",
      );
      const rejected =
        buys.length > 0 &&
        buys.every((row) => {
          const status = String(row.status || "").toUpperCase();
          return (status === "REJECTED" || status === "CANCELLED" || status === "FAILED" || status === "EXPIRED") && !(Number(row.filledQty) > 0);
        });
      const entryMs = Number(state.lastEntryAt) || 0;
      const entryDay = entryMs > 0 ? sessionKeyIST(entryMs) : "";
      const previousDay = !entryDay || entryDay < sessionKeyIST(now);
      if ((rejected || previousDay) && !state.inFlight) {
        state.buyPhase = "";
        state.inFlight = false;
        if (previousDay) {
          state.lastEntryBarTime = 0;
          state.lastEntryAt = 0;
          state.sentSignalBarTime = 0;
        }
        if (previousDay || !state.fillPrice) PositionManager.clearOpen(state);
      } else {
        algo.lastSignal = "WAIT ORDER";
        return { action: "skip", reason: "buy-active" };
      }
    }

    if (state.buyPhase === "open" && !open) {
      state.buyPhase = "";
      state.inFlight = false;
      PositionManager.clearOpen(state);
    }

    if (state.inFlight && !open) {
      algo.lastSignal = "WAIT ORDER";
      return { action: "skip", reason: "buy-active" };
    }

    if (config.intradayOnly && minutesToClose <= config.eodSquareOffMinutes) {
      algo.lastSignal = "EOD FLAT";
      return { action: "eod-flat" };
    }

    if (!signal.ready) {
      algo.lastSignal = `WAIT ${config.barMinutes || 5}m BAR`;
      return { action: "wait", reason: "need-completed-bar" };
    }

    return this.maybeEnter({
      algo,
      config,
      signal,
      spot: Number(input.spot || signal.futuresClose),
      step: Number(input.step || 50),
      expiry: input.expiry,
      ceLtp: input.ceLtp,
      peLtp: input.peLtp,
      ceSecurityId: input.ceSecurityId || "",
      peSecurityId: input.peSecurityId || "",
      positions: input.positions || [],
      adapter: input.adapter,
    });
  },
};

export function noteBrokerRejection(algo) {
  if (!algo) return;
  const state = runtimeState(algo);
  state.inFlight = false;
  if (!state.fillPrice && state.buyPhase !== "open") PositionManager.clearOpen(state);
  algo.lastSignal = "REJECTED";
  TradeLogger.record("rejected", { strategy: algo.name, message: "broker-rejected" });
}

export function noteFeedReconnect(algo) {
  if (!algo) return;
  runtimeState(algo).feedOk = true;
  TradeLogger.record("feed-up", { strategy: algo.name, message: "Market data reconnected" });
}
