function emptyState() {
  return {
    sessionDate: "",
    sessionTrades: 0,
    inFlight: false,
    lastIndexBarTime: 0,
    lastFutureBarTime: 0,
    lastCeBarTime: 0,
    lastPeBarTime: 0,
    lastEntryBarKey: "",
    lastIndexColor: "",
    lastFutureColor: "",
    lastCeColor: "",
    lastPeColor: "",
    cardReady: false,
    cardSignal: "NO Trade",
    lastError: "",
    option: "",
    strike: 0,
    atmStrike: 0,
    expiry: "",
    securityId: "",
    symbol: "",
    premium: 0,
    quoteAt: 0,
    requestedLots: 0,
    approvedLots: 0,
    maxLots: 0,
    lotSize: 0,
    orderValue: 0,
    requiredFunds: 0,
    slPrice: 0,
    targetPrice: 0,
    slStatus: "",
    targetStatus: "",
    fillAvg: 0,
    fillQty: 0,
    riskEvents: [],
    audit: [],
  };
}

export function shivamState(algo = {}) {
  if (!algo.shivamState || typeof algo.shivamState !== "object") {
    algo.shivamState = emptyState();
  }
  return algo.shivamState;
}

export function resetShivamSession(state, sessionDate) {
  state.sessionDate = sessionDate;
  state.sessionTrades = 0;
  state.inFlight = false;
  state.lastEntryBarKey = "";
  state.lastError = "";
}

export function noteShivamEvent(state, kind, detail = {}) {
  const row = { kind, at: Date.now(), ...detail };
  state.riskEvents = [...(state.riskEvents || []), row].slice(-80);
  state.audit = [...(state.audit || []), row].slice(-80);
  return row;
}

export function entryBarKey(option, barTime) {
  return `${String(option || "").toUpperCase()}:${Number(barTime) || 0}`;
}
