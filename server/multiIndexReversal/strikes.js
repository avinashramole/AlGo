export function clampOffset(offset) {
  const n = Math.round(Number(offset) || 0);
  if (!Number.isFinite(n)) return 0;
  return Math.max(-4, Math.min(4, n));
}

export function atmStrike(spot, step) {
  const price = Number(spot);
  const width = Number(step) || 0;
  if (!(price > 0) || !(width > 0)) return 0;
  return Math.round(price / width) * width;
}

export function signedStrikeOffset(offset, option) {
  const n = clampOffset(offset);
  return String(option || "").toUpperCase() === "PE" ? -n : n;
}

export function strikeForIndexOffset(spot, step, offset, option) {
  const atm = atmStrike(spot, step);
  if (!atm) return 0;
  return atm + signedStrikeOffset(offset, option) * (Number(step) || 0);
}

export function qtyForLots(lots, lotSize) {
  const size = Math.max(1, Math.round(Number(lotSize) || 1));
  const n = Math.max(1, Math.round(Number(lots) || 1));
  return n * size;
}

export function reversalQty(originalQty, multiple, lotSize) {
  const size = Math.max(1, Math.round(Number(lotSize) || 1));
  const raw = Number(originalQty) * Number(multiple);
  if (!(raw > 0)) return 0;
  const lots = Math.max(1, Math.round(raw / size));
  return lots * size;
}

export function isLotMultiple(qty, lotSize) {
  const size = Math.max(1, Math.round(Number(lotSize) || 1));
  const n = Number(qty);
  return n > 0 && n % size === 0;
}
