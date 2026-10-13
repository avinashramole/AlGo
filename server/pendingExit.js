function parseTimeMs(value) {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
  const ms = Date.parse(String(value || ""));
  return Number.isFinite(ms) && ms > 0 ? ms : 0;
}

export function rowTimeMs(row = {}) {
  const direct = parseTimeMs(row.lastEntryAt);
  if (direct) return direct;
  for (const key of ["createdAt", "openedAt", "createTime", "orderTimestamp"]) {
    const ms = parseTimeMs(row[key]);
    if (ms) return ms;
  }
  return 0;
}

export function sameExitContract(left = {}, right = {}) {
  const leftId = String(left?.securityId || "").trim();
  const rightId = String(right?.securityId || "").trim();
  if (leftId && leftId !== "0" && rightId && rightId !== "0" && leftId === rightId) return true;
  if (left?.symbol && right?.symbol && left.symbol === right.symbol) return true;
  if (left?.option && right?.option && left.option === right.option && Number(left.strike) === Number(right.strike)) {
    return true;
  }
  return false;
}

/** PENDING SELL leftovers from an earlier SL/TGT on the same strike must not block this lot. */
export function isLeftoverWorkingSell(row = {}, open = {}, state = {}) {
  if (String(row?.side || "").toUpperCase() !== "SELL") return false;
  const opened = rowTimeMs(open) || parseTimeMs(state?.lastEntryAt);
  const placed = rowTimeMs(row);
  return opened > 0 && placed > 0 && placed + 250 < opened;
}

export function isWorkingSell(row = {}) {
  if (row?.copyUserId) return false;
  if (String(row?.side || "").toUpperCase() !== "SELL") return false;
  const status = String(row?.status || "").toUpperCase();
  if (["REJECTED", "CANCELLED", "FAILED", "EXPIRED", "FILLED", "TRADED"].includes(status)) return false;
  const qty = Number(row?.qty) || 0;
  const filled = Number(row?.filledQty) || 0;
  if (qty > 0 && filled >= qty) return false;
  return true;
}

export function pendingExitOnBook(orders = [], open, strategyName, state = {}) {
  return (orders || []).some((row) => {
    if (!isWorkingSell(row)) return false;
    if (strategyName && String(row.strategy || "") !== String(strategyName || "")) return false;
    if (!sameExitContract(row, open || {})) return false;
    if (isLeftoverWorkingSell(row, open, state)) return false;
    return true;
  });
}
