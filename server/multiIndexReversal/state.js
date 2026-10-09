export const PHASE = {
  IDLE: "IDLE",
  WAITING_FOR_SIGNAL: "WAITING_FOR_SIGNAL",
  CE_ENTRY_PENDING: "CE_ENTRY_PENDING",
  PE_ENTRY_PENDING: "PE_ENTRY_PENDING",
  CE_ACTIVE: "CE_ACTIVE",
  PE_ACTIVE: "PE_ACTIVE",
  CE_TO_PE_REVERSAL_PENDING: "CE_TO_PE_REVERSAL_PENDING",
  PE_TO_CE_REVERSAL_PENDING: "PE_TO_CE_REVERSAL_PENDING",
  COMBINED_POSITION_ACTIVE: "COMBINED_POSITION_ACTIVE",
  EXIT_PENDING: "EXIT_PENDING",
  RECONCILING: "RECONCILING",
  COMPLETED: "COMPLETED",
  ERROR: "ERROR",
};

const EMPTY = {
  phase: PHASE.IDLE,
  cycleId: "",
  lastBarTime: 0,
  lastTransitionAt: 0,
  lastTransitionReason: "",
  originalOption: "",
  originalStrike: 0,
  originalQty: 0,
  originalAvg: 0,
  originalTarget: 0,
  originalOrderId: "",
  reversalOption: "",
  reversalStrike: 0,
  reversalQty: 0,
  reversalAvg: 0,
  reversalOrderId: "",
  reversalDone: false,
  charges: 0,
  realizedPnl: 0,
  retries: 0,
  lastError: "",
  expiry: "",
  symbol: "",
  cycleConfig: null,
};

export function round2(value) {
  return Number((Number(value) || 0).toFixed(2));
}

export function mirState(algo) {
  if (!algo.mirState || typeof algo.mirState !== "object") algo.mirState = { ...EMPTY };
  return algo.mirState;
}

export function transition(state, phase, reason = "", now = Date.now()) {
  if (!state || state.phase === phase) {
    if (state && reason) state.lastTransitionReason = reason;
    return state;
  }
  state.phase = phase;
  state.lastTransitionAt = Number(now) || Date.now();
  state.lastTransitionReason = reason;
  return state;
}

export function resetCycle(state, reason = "reset", now = Date.now()) {
  Object.assign(state, { ...EMPTY });
  transition(state, PHASE.WAITING_FOR_SIGNAL, reason, now);
  return state;
}

export function startCycle(state, now = Date.now()) {
  resetCycle(state, "new-cycle", now);
  state.cycleId = `mir-${now}`;
  return state;
}

export function markError(state, message, now = Date.now()) {
  state.lastError = String(message || "error");
  state.retries = Number(state.retries || 0) + 1;
  transition(state, PHASE.ERROR, state.lastError, now);
  return state;
}

export function isPendingPhase(phase) {
  return (
    phase === PHASE.CE_ENTRY_PENDING ||
    phase === PHASE.PE_ENTRY_PENDING ||
    phase === PHASE.CE_TO_PE_REVERSAL_PENDING ||
    phase === PHASE.PE_TO_CE_REVERSAL_PENDING ||
    phase === PHASE.EXIT_PENDING ||
    phase === PHASE.RECONCILING
  );
}

export function isOpenPhase(phase) {
  return (
    phase === PHASE.CE_ACTIVE ||
    phase === PHASE.PE_ACTIVE ||
    phase === PHASE.COMBINED_POSITION_ACTIVE ||
    isPendingPhase(phase)
  );
}
