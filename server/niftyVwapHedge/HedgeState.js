export const PHASE = {
  IDLE: "IDLE",
  CE_PRIMARY: "CE_PRIMARY",
  PE_PRIMARY: "PE_PRIMARY",
  MONITOR_PRIMARY: "MONITOR_PRIMARY",
  MONITOR_COMBINED: "MONITOR_COMBINED",
  EXITING: "EXITING",
};

export function emptyHedgeState() {
  return {
    phase: PHASE.IDLE,
    sessionDate: "",
    primarySide: "",
    primaryStrike: 0,
    primaryEntryPrice: 0,
    primaryTargetPrice: 0,
    hedgeTriggerPrice: 0,
    hedgeEntered: false,
    hedgeSide: "",
    hedgeStrike: 0,
    hedgeEntryPrice: 0,
    startingCapital: 0,
    profitTarget: 0,
    realizedPnl: 0,
    charges: 0,
    lastEntryBarTime: 0,
    inFlight: false,
    lastEntryAt: 0,
    pendingRole: "",
    cycleId: "",
    lastOrderId: "",
  };
}

export function hedgeState(algo) {
  if (!algo.hedgeState || typeof algo.hedgeState !== "object") {
    algo.hedgeState = emptyHedgeState();
  }
  return algo.hedgeState;
}

export function resetHedgeCycle(state) {
  const sessionDate = state.sessionDate || "";
  const lastEntryBarTime = Number(state.lastEntryBarTime || 0);
  Object.assign(state, emptyHedgeState(), { sessionDate, lastEntryBarTime });
  return state;
}

export function round2(value) {
  return Number(Number(value).toFixed(2));
}

export function fillPrice(result, fallback) {
  const price = Number(result?.avg || result?.price || result?.ltp || fallback);
  return price > 0 ? round2(price) : 0;
}

export function lotsFromQty(qty, lotSize = 65) {
  const size = Math.max(1, Number(lotSize) || 65);
  return Math.max(0, Math.round(Number(qty) / size));
}

export function isPendingStatus(status) {
  const raw = String(status || "").toUpperCase();
  return raw === "PENDING" || raw === "TRANSIT" || raw === "PARTIAL";
}

export function isMarginError(error) {
  return /margin|insufficient|DH-901|funds/i.test(String(error || ""));
}
