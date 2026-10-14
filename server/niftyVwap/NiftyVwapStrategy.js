import { liveExitPrice } from "../executionSpeed.js";
import { filledExitOnBook, pendingExitOnBook } from "../pendingExit.js";
import { isSaneOptionLtp } from "../positionMark.js";
import { exchangeSegmentFor } from "../optionChain.js";
import { optionEngineConfig } from "./config.js";
import { OptionStrikeSelector } from "./OptionStrikeSelector.js";
import { PositionManager, runtimeState, resetSession } from "./PositionManager.js";
import { RiskManager } from "./RiskManager.js";
import { TradeLogger } from "./TradeLogger.js";
import { TrailingStopManager } from "./TrailingStopManager.js";
import { VwapSignalEngine, istWallTime, sessionKeyIST } from "./VwapSignalEngine.js";

/** After this, SENDING / WAIT ORDER with no book is treated as a lost flush and can retry. */
export const STALE_LIVE_SEND_MS = 20_000;

function isDeadBuy(row) {
  const status = String(row?.status || "").toUpperCase();
  return ["REJECTED", "CANCELLED", "FAILED", "EXPIRED"].includes(status) && !(Number(row?.filledQty) > 0);
}

function isWorkingBuy(row) {
  const status = String(row?.status || "").toUpperCase();
  return !["REJECTED", "CANCELLED", "FAILED", "EXPIRED", "FILLED", "TRADED"].includes(status);
}

function holdInFlightSignal(algo) {
  const text = String(algo?.lastSignal || "");
  if (/\b(?:WAIT ORDER|SENDING)\b/i.test(text)) return text;
  return "BUY SENDING";
}

function shouldReleaseEntryLock(state, { buys = [], now, pending = false, lastSignal = "" } = {}) {
  const marginHold =
    Number(state?.marginHoldBarTime || 0) > 0 || /MARGIN|insufficient funds/i.test(String(lastSignal || ""));
  if (marginHold) return { release: true, clearBar: false };
  const working = pending || (buys || []).some(isWorkingBuy);
  if (working) return { release: false, clearBar: false };
  const rejected = (buys || []).length > 0 && (buys || []).every(isDeadBuy);
  const entryMs = Number(state?.lastEntryAt) || 0;
  const entryDay = entryMs > 0 ? sessionKeyIST(entryMs) : "";
  const previousDay = Boolean(entryDay) && entryDay < sessionKeyIST(now);
  const waitOrderMiss = /\bWAIT ORDER\b/i.test(String(lastSignal || ""));
  const lostEmpty = !(entryMs > 0) && (waitOrderMiss || String(state?.buyPhase || "") === "entry");
  const staleEmpty = lostEmpty || (entryMs > 0 && now - entryMs >= STALE_LIVE_SEND_MS);
  if (rejected || previousDay || staleEmpty || waitOrderMiss) {
    return { release: true, clearBar: previousDay || staleEmpty || waitOrderMiss };
  }
  return { release: false, clearBar: false };
}

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

function sessionCloseMinutes(symbol) {
  return String(symbol || "").toUpperCase() === "CRUDEOIL" ? 23 * 60 + 30 : 15 * 60 + 30;
}

function istMinutesToClose(now = Date.now(), symbol = "NIFTY") {
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
  return sessionCloseMinutes(symbol) - minutes;
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

function bookedFillPrice(open, state) {
  const avg = Number(open?.avg);
  if (avg > 0 && avg < 2000) return avg;
  const stored = Number(state?.fillPrice);
  return stored > 0 && stored < 2000 ? stored : 0;
}

function targetHitMark(trailMark, open, fill) {
  const marks = [Number(trailMark), Number(open?.ltp)].filter((px) => px > 0 && isSaneOptionLtp(px, fill));
  return marks.length ? Math.max(...marks) : 0;
}

function stopHitMark(trailMark, open, fill, chain) {
  const marks = [Number(trailMark), Number(chain)];
  const tick = Number(open?.ltp);
  if (tick > 0 && (open?.ticked === true || Math.abs(tick - Number(fill || 0)) > 0.05)) marks.push(tick);
  const broker = Number(open?.brokerLtp);
  if (broker > 0) marks.push(broker);
  const sane = marks.filter((px) => px > 0 && isSaneOptionLtp(px, fill));
  return sane.length ? Math.min(...sane) : Number(trailMark) || 0;
}

function brokerConfirmPx(open = {}) {
  if (open.ticked === true && Number(open.ltp) > 0) return Number(open.ltp);
  if (Number(open.avg) > 0) return Number(open.avg);
  return Number(open.ltp) || 0;
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
    const stopMark = stopHitMark(trailMark, open, state.fillPrice, mark);
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
    if (filledExitOnBook(orders, open, algo.name, state)) {
      PositionManager.clearOpen(state);
      algo.lastSignal = "EXIT DONE";
      return { action: "exit", reason: "already-filled" };
    }
    if (pendingExitOnBook(orders, open, algo.name, state)) {
      algo.lastSignal = "EXIT PENDING";
      return { action: "exit-pending" };
    }
    if (state.exitQueued) {
      const queuedAt = Number(state.exitQueuedAt || 0);
      if (queuedAt > 0 && now - queuedAt < STALE_LIVE_SEND_MS) {
        algo.lastSignal = "EXIT PENDING";
        return { action: "exit-pending" };
      }
      state.exitQueued = false;
      state.exitQueuedAt = 0;
    }
    const against = open.option === "PE" ? signal.againstPe : signal.againstCe;
    state.consecutiveAgainst = against;
    const tgtMark = targetHitMark(trailMark, open, state.fillPrice);
    let reason = "";
    if (TrailingStopManager.hitStop(stopMark, state.stopPrice)) reason = "sl";
    else if (
      TrailingStopManager.reachedTarget({
        mark: tgtMark || trailMark,
        target: state.targetPrice,
        entry: state.fillPrice,
        targetPct: config.targetPct,
      })
    ) {
      reason = "target";
    } else if (config.useVwapExit !== false && against >= config.vwapExitCandles) reason = "vwap-exit";
    else if (config.intradayOnly && minutesToClose <= config.eodSquareOffMinutes) reason = "eod";
    if (reason === "sl" && state.trailActive) reason = "trail";
    if (reason === "sl") {
      const brokerPx = brokerConfirmPx(open);
      if (
        !isSaneOptionLtp(stopMark, state.fillPrice) &&
        brokerPx > Number(state.stopPrice) &&
        open.ticked !== true
      ) {
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
    const closed = adapter.exit({
      ...open,
      ltp: trailMark,
      role: reason === "trail" ? "trail" : reason === "sl" ? "sl" : reason === "target" ? "target" : "exit",
      exitReason: reason,
    });
    if (closed?.error) {
      TradeLogger.record("exit-failed", { reason: closed.error, message: closed.error });
      return { action: "exit-failed", reason: closed.error };
    }
    if (closed?.duplicate || closed?.queued === false) {
      state.exitQueued = true;
      state.exitQueuedAt = Number(now) || Date.now();
      algo.lastSignal = "EXIT PENDING";
      return { action: "exit-pending", reason };
    }
    if (closed?.queued) {
      state.inFlight = true;
      state.exitQueued = true;
      state.exitQueuedAt = Number(now) || Date.now();
      TradeLogger.record("exit-queued", { reason, mark, strategy: algo.name });
      algo.lastSignal = `EXIT ${reason.toUpperCase()} QUEUED`;
      return { action: "exit-queued", reason, result: closed };
    }
    TradeLogger.record("exit", { reason, mark, stop: state.stopPrice, strategy: algo.name });
    PositionManager.clearOpen(state);
    algo.lastSignal = `EXIT ${reason.toUpperCase()}`;
    return { action: "exit", reason, result: closed };
  },

  maybeEnter({ algo, config, signal, spot, step, expiry, ceLtp, peLtp, ceSecurityId, peSecurityId, positions, adapter, now }) {
    const state = runtimeState(algo);
    if (state.exitQueued) {
      const queuedAt = Number(state.exitQueuedAt || 0);
      if (!queuedAt || Number(now || Date.now()) - queuedAt < STALE_LIVE_SEND_MS) {
        algo.lastSignal = "EXIT PENDING";
        return { action: "skip", reason: "exit-queued" };
      }
      state.exitQueued = false;
      state.exitQueuedAt = 0;
    }
    const gate = RiskManager.canEnter({ positions, inFlight: state.inFlight, maxPositions: config.maxPositions });
    if (!gate.ok) return { action: "skip", reason: gate.reason };
    const crudeSignal = String(config.symbol || "").toUpperCase() === "CRUDEOIL" && config.signalMode === "first-candle";
    const maxTrades = Math.max(1, Number(config.maxTradesPerDay) || 5);
    if (Number(state.sessionTrades || 0) >= maxTrades) {
      algo.lastSignal = "MAX TRADES";
      return { action: "skip", reason: "max-trades" };
    }
    if (Number(state.marginHoldBarTime || 0) > 0 && RiskManager.duplicateBar(state.marginHoldBarTime, signal.barTime)) {
      if (!/MARGIN/i.test(String(algo.lastSignal || ""))) algo.lastSignal = "MARGIN · insufficient funds";
      return { action: "skip", reason: "margin-hold" };
    }
    if (crudeSignal && RiskManager.duplicateBar(state.sentSignalBarTime, signal.barTime)) {
      algo.lastSignal = "HOLD 1 SIGNAL";
      return { action: "skip", reason: "duplicate-bar" };
    }
    if (!signal.buyCe && !signal.buyPe) {
      if (config.signalMode === "first-candle") {
        if (signal.waitingEval && !signal.previewLive) {
          algo.lastSignal = "WAIT 09:05 FIRST 5m CLOSE";
          return { action: "wait", reason: "wait-eval" };
        }
        if (
          signal.missedOpen &&
          ((signal.niftyColor === "green" && signal.ceColor === "green" && (!crudeSignal || signal.peColor === "red")) ||
            (crudeSignal
              ? signal.niftyColor === "green" && signal.peColor === "green" && signal.ceColor === "red"
              : signal.niftyColor === "red" && signal.peColor === "green"))
        ) {
          const clock = niftyFutCandleText(signal, config).clock.replace(/^ · /, "");
          algo.lastSignal = clock ? `MISSED ${clock}` : "MISSED CANDLE";
          return { action: "wait", reason: "missed-open" };
        }
        const ceTrack = trackedOptionStrike(state, spot, step, config.strikeOffset, "CE");
        const peTrack = trackedOptionStrike(state, spot, step, config.strikeOffset, "PE");
        if (signal.niftyColor === "doji") {
          return { action: "wait", reason: "first-doji" };
        }
        if (signal.niftyColor === "green" && signal.ceColor !== "green") {
          if (!signal.ceColor) {
            algo.lastSignal = ceTrack ? `WAIT CE ${ceTrack} 5m` : "WAIT CE 5m";
          }
          return { action: "wait", reason: signal.ceColor ? "ce-not-green" : "wait-ce" };
        }
        if (signal.niftyColor === "red" && signal.peColor !== "green") {
          if (!signal.peColor) {
            algo.lastSignal = peTrack ? `WAIT PE ${peTrack} 5m` : "WAIT PE 5m";
          }
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
    if (String(result?.status || "").toUpperCase() === "MARGIN") {
      state.inFlight = false;
      state.buyPhase = "";
      state.lastEntryBarTime = signal.barTime;
      state.marginHoldBarTime = signal.barTime;
      if (crudeSignal) state.sentSignalBarTime = signal.barTime;
      PositionManager.clearOpen(state);
      if (!/MARGIN/i.test(String(algo.lastSignal || ""))) algo.lastSignal = "MARGIN · insufficient funds";
      return { action: "skip", reason: "margin-hold", result };
    }
    if (result?.error || String(result?.status || "").toUpperCase() === "REJECTED") {
      state.inFlight = false;
      state.lastEntryBarTime = signal.barTime;
      if (crudeSignal) state.sentSignalBarTime = signal.barTime;
      PositionManager.clearOpen(state);
      TradeLogger.record("rejected", { message: result?.error || "broker-rejected", strategy: algo.name });
      algo.lastSignal = "REJECTED";
      return { action: "rejected", result };
    }
    if (result?.duplicate || result?.queued === false) {
      state.inFlight = true;
      state.buyPhase = "entry";
      state.lastEntryBarTime = signal.barTime;
      if (crudeSignal) state.sentSignalBarTime = signal.barTime;
      state.lastEntryAt = Number(now) || Date.now();
      algo.lastSignal = `BUY ${pick.option} SENDING`;
      return { action: "skip", reason: "buy-active", pick, result };
    }
    state.inFlight = true;
    state.lastEntryBarTime = signal.barTime;
    if (crudeSignal) state.sentSignalBarTime = signal.barTime;
    state.lastEntryAt = Number(now) || Date.now();
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
    state.sessionTrades = Number(state.sessionTrades || 0) + 1;
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
    const minutesToClose = Number.isFinite(input.minutesToClose)
      ? input.minutesToClose
      : istMinutesToClose(now, config.symbol);

    if (input.feedLive === false && !PositionManager.openFor(input.positions, algo.name, state, config.symbol)) {
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
              oppositeConfirm: String(config.symbol || "").toUpperCase() === "CRUDEOIL",
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

    const open = PositionManager.openFor(input.positions, algo.name, state, config.symbol);
    if (open) {
      if (filledExitOnBook(input.orders || [], open, algo.name, state)) {
        PositionManager.clearOpen(state);
        algo.lastSignal = "EXIT DONE";
        return { action: "exit", reason: "already-filled" };
      }
      state.buyPhase = "open";
      const fill = bookedFillPrice(open, state);
      if (fill > 0 && !Number(state.fillPrice)) {
        const leg = PositionManager.optionLeg(open) || PositionManager.niftyOptionLeg(open) || {};
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
        if (!Number(state.lastEntryAt)) {
          const opened = Date.parse(String(open.openedAt || open.createdAt || ""));
          state.lastEntryAt = Number.isFinite(opened) && opened > 0 ? opened : now;
        }
      }
      const leg = PositionManager.optionLeg(open) || PositionManager.niftyOptionLeg(open) || {};
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

    if (!open && state.exitQueued) {
      const queuedAt = Number(state.exitQueuedAt || 0);
      if (!queuedAt || now - queuedAt < STALE_LIVE_SEND_MS) {
        algo.lastSignal = "EXIT PENDING";
        return { action: "exit-pending" };
      }
      state.exitQueued = false;
      state.exitQueuedAt = 0;
    }

    if (state.buyPhase === "entry" && !open) {
      const buys = (input.orders || []).filter(
        (row) => !row?.copyUserId && String(row.strategy || "") === algo.name && String(row.side || "BUY").toUpperCase() !== "SELL",
      );
      const decision = shouldReleaseEntryLock(state, {
        buys,
        now,
        pending: input.pending === true,
        lastSignal: algo.lastSignal,
      });
      if (decision.release) {
        state.buyPhase = "";
        state.inFlight = false;
        if (decision.clearBar) {
          state.lastEntryBarTime = 0;
          state.lastEntryAt = 0;
          state.sentSignalBarTime = 0;
        }
        if (decision.clearBar || !state.fillPrice) PositionManager.clearOpen(state);
      } else {
        algo.lastSignal = holdInFlightSignal(algo);
        return { action: "skip", reason: "buy-active" };
      }
    }

    if (state.buyPhase === "open" && !open) {
      state.buyPhase = "";
      state.inFlight = false;
      PositionManager.clearOpen(state);
    }

    if (state.inFlight && !open) {
      const buys = (input.orders || []).filter(
        (row) => !row?.copyUserId && String(row.strategy || "") === algo.name && String(row.side || "BUY").toUpperCase() !== "SELL",
      );
      const decision = shouldReleaseEntryLock(state, {
        buys,
        now,
        pending: input.pending === true,
        lastSignal: algo.lastSignal,
      });
      if (decision.release) {
        state.inFlight = false;
        state.buyPhase = "";
        if (decision.clearBar) {
          state.lastEntryBarTime = 0;
          state.lastEntryAt = 0;
          state.sentSignalBarTime = 0;
        }
        if (!state.fillPrice) PositionManager.clearOpen(state);
      } else {
        algo.lastSignal = holdInFlightSignal(algo);
        return { action: "skip", reason: "buy-active" };
      }
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
      now,
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
