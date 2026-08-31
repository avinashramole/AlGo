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
  state.ceBars = [];
  state.peBars = [];
  state.ceStrike = 0;
  state.peStrike = 0;
  return state;
}

export const PositionManager = {
  runtimeState,
  resetSession,
  openFor(positions = [], strategyName, state) {
    const rows = (positions || []).filter(
      (row) => Number(row.qty) > 0 && String(row.type || "BUY").toUpperCase() !== "CLOSED",
    );
    const byName = rows.find((row) => row.strategy === strategyName);
    if (byName) return byName;
    if (state?.lockedSymbol) {
      return (
        rows.find(
          (row) =>
            row.symbol === state.lockedSymbol ||
            (Number(row.strike) === Number(state.lockedStrike) && row.option === state.lockedOption),
        ) || null
      );
    }
    return null;
  },
  lockContract(state, pick) {
    state.lockedStrike = Number(pick.strike);
    state.lockedOption = pick.option;
    state.lockedSymbol = pick.symbol;
    return state;
  },
  markFill(state, fillPrice, stopPrice, targetPrice) {
    state.inFlight = false;
    state.fillPrice = Number(fillPrice);
    state.stopPrice = Number(stopPrice);
    state.targetPrice = Number(targetPrice);
    return state;
  },
  clearOpen(state) {
    state.inFlight = false;
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
