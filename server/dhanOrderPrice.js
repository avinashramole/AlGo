function nestedRow(row = {}) {
  const data = row.data && typeof row.data === "object" && !Array.isArray(row.data) ? row.data : {};
  return { ...data, ...row };
}

export function firstPositive(values) {
  for (const value of values) {
    const n = Number(value);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 0;
}

export function roundPrice(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Number(n.toFixed(2)) : 0;
}

export function dhanFilledQty(row = {}) {
  const src = nestedRow(row);
  return Math.max(0, Number(src.filledQty || src.filled_qty || src.filledQuantity || 0) || 0);
}

/** Actual exchange fill. Never use MARKET `price` (0 or send-time LTP). */
export function dhanOrderFillPrice(row = {}) {
  const src = nestedRow(row);
  const fill = firstPositive([
    src.averageTradedPrice,
    src.avgTradedPrice,
    src.average_traded_price,
    src.averagePrice,
    src.avgPrice,
    src.tradedPrice,
    src.traded_price,
  ]);
  if (fill) return roundPrice(fill);

  const orderType = String(src.orderType || src.type || "MARKET").toUpperCase();
  const orderPrice = firstPositive([src.price]);
  if (orderType === "LIMIT" && orderPrice) return roundPrice(orderPrice);
  return 0;
}

export function resolveLiveBookPrice({ type, payloadPrice, livePrice, isPaper, isLive, ltp } = {}) {
  const fill = firstPositive([livePrice]);
  if (fill) return roundPrice(fill);
  if (isPaper) return roundPrice(firstPositive([ltp, payloadPrice]));
  const orderType = String(type || "MARKET").toUpperCase();
  if (orderType === "LIMIT") return roundPrice(firstPositive([payloadPrice]));
  if (isLive) return 0;
  return roundPrice(firstPositive([payloadPrice, ltp]));
}

export function mergeDhanOrderPrice(incoming, existing) {
  const next = firstPositive([incoming?.price]);
  if (next) return roundPrice(next);
  const filled = Number(incoming?.filledQty || existing?.filledQty || 0);
  const prev = firstPositive([existing?.price]);
  if (filled > 0 && prev) return roundPrice(prev);
  return 0;
}
