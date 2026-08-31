export const RiskManager = {
  canEnter({ positions = [], inFlight = false, maxPositions = 1 } = {}) {
    if (inFlight) return { ok: false, reason: "order-in-flight" };
    const open = (positions || []).filter((row) => Number(row.qty) > 0);
    if (open.length >= maxPositions) return { ok: false, reason: "max-positions" };
    if (open.some((row) => row.option === "CE") && open.some((row) => row.option === "PE")) {
      return { ok: false, reason: "ce-and-pe" };
    }
    if (open.length) return { ok: false, reason: "already-open" };
    return { ok: true, reason: "" };
  },
  rejectAveraging() {
    return { ok: false, reason: "no-averaging" };
  },
  rejectMartingale() {
    return { ok: false, reason: "no-martingale" };
  },
  duplicateBar(lastEntryBarTime, barTime) {
    return Boolean(lastEntryBarTime && barTime && Number(lastEntryBarTime) === Number(barTime));
  },
};
