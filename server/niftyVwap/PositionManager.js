import { parseOptionContract } from "../frontFutures.js";

function normalizeOptionRoot(value) {
  const raw = String(value || "")
    .toUpperCase()
    .replace(/\s+/g, "");
  if (raw === "CRUDE" || raw === "CRUDEOIL") return "CRUDEOIL";
  if (raw === "NG" || raw === "NATGAS" || raw === "NATURALGAS") return "NATURALGAS";
  return raw;
}

export function optionLeg(row = {}) {
  const option = row.option === "PE" || row.option === "CE" ? row.option : "";
  const strike = Number(row.strike);
  const parsed = parseOptionContract(row.symbol);
  if (option && strike > 0) {
    return { root: parsed?.root || "", strike, option, symbol: row.symbol };
  }
  return parsed;
}

export function niftyOptionLeg(row = {}) {
  const leg = optionLeg(row);
  if (!leg) return null;
  if (leg.root && normalizeOptionRoot(leg.root) !== "NIFTY") return null;
  return { root: "NIFTY", strike: leg.strike, option: leg.option };
}

export function isOpenOption(row, symbol) {
  if (!row || !(Number(row.qty) > 0)) return false;
  const type = String(row.type || row.side || "BUY").toUpperCase();
  if (type === "CLOSED" || type === "SELL") return false;
  const leg = optionLeg(row);
  if (!leg?.option) return false;
  if (!symbol) return true;
  const root = normalizeOptionRoot(leg.root);
  const want = normalizeOptionRoot(symbol);
  return !root || root === want;
}

export function isOpenNiftyOption(row) {
  return isOpenOption(row, "NIFTY");
}

function legsMatch(left, right) {
  return Boolean(left && right && Number(left.strike) === Number(right.strike) && left.option === right.option);
}

export function runtimeState(algo) {
  if (!algo.vwapState || typeof algo.vwapState !== "object") {
    algo.vwapState = {
      sessionDate: "",
      inFlight: false,
      lastEntryBarTime: 0,
      lastProcessedBarTime: 0,
      consecutiveAgainst: 0,
      lockedStrike: 0,
      lockedOption: "",
      lockedSymbol: "",
      fillPrice: 0,
      stopPrice: 0,
      targetPrice: 0,
      trailActive: false,
      feedOk: true,
      exitQueued: false,
      lastEntryAt: 0,
      sessionTrades: 0,
      executedOrderIds: [],
      buyPhase: "",
      sentSignalBarTime: 0,
      processedFirstBarTime: 0,
      ceBars: [],
      peBars: [],
      ceStrike: 0,
      peStrike: 0,
    };
  }
  return algo.vwapState;
}

export function resetSession(state, sessionDate) {
  if (state.sessionDate === sessionDate) return state;
  state.sessionDate = sessionDate;
  state.inFlight = false;
  state.lastEntryBarTime = 0;
  state.lastProcessedBarTime = 0;
  state.consecutiveAgainst = 0;
  state.lockedStrike = 0;
  state.lockedOption = "";
  state.lockedSymbol = "";
  state.fillPrice = 0;
  state.stopPrice = 0;
  state.targetPrice = 0;
  state.trailActive = false;
  state.exitQueued = false;
  state.lastEntryAt = 0;
  state.sessionTrades = 0;
  state.executedOrderIds = [];
  state.buyPhase = "";
  state.sentSignalBarTime = 0;
  state.processedFirstBarTime = 0;
  state.ceBars = [];
  state.peBars = [];
  state.ceStrike = 0;
  state.peStrike = 0;
  return state;
}

export const PositionManager = {
  runtimeState,
  resetSession,
  niftyOptionLeg,
  optionLeg,
  isOpenOption,
  isOpenNiftyOption,
  openFor(positions = [], strategyName, state, symbol) {
    const rows = (positions || []).filter((row) => isOpenOption(row, symbol));
    const byName = rows.find((row) => strategyName && row.strategy === strategyName);
    if (byName) return byName;
    const lockedLeg = optionLeg({
      symbol: state?.lockedSymbol,
      strike: state?.lockedStrike,
      option: state?.lockedOption,
    });
    const byLock = rows.find((row) => {
      if (row.strategy && strategyName && row.strategy !== strategyName) return false;
      if (state?.lockedSymbol && row.symbol === state.lockedSymbol) return true;
      return legsMatch(optionLeg(row), lockedLeg);
    });
    if (byLock) return byLock;
    return rows.find((row) => !row.strategy || row.strategy === strategyName) || null;
  },
  lockContract(state, pick) {
    state.lockedStrike = Number(pick.strike);
    state.lockedOption = pick.option;
    state.lockedSymbol = pick.symbol;
    return state;
  },
  markFill(state, fillPrice, stopPrice, targetPrice) {
    state.inFlight = false;
    state.buyPhase = "open";
    state.fillPrice = Number(fillPrice);
    state.stopPrice = Number(stopPrice);
    state.targetPrice = Number(targetPrice);
    return state;
  },
  clearOpen(state) {
    state.inFlight = false;
    state.buyPhase = "";
    state.lockedStrike = 0;
    state.lockedOption = "";
    state.lockedSymbol = "";
    state.fillPrice = 0;
    state.stopPrice = 0;
    state.targetPrice = 0;
    state.trailActive = false;
    state.consecutiveAgainst = 0;
    state.exitQueued = false;
    return state;
  },
};
