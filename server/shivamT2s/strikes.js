export function atmStrike(spot, step) {
  const price = Number(spot);
  const width = Number(step) || 0;
  if (!(price > 0) || !(width > 0)) return 0;
  return Math.round(price / width) * width;
}

export function strikeForPolicy(spot, step, policy = "ATM", offset = 0, option = "CE") {
  const atm = atmStrike(spot, step);
  if (!atm) return 0;
  const n = Math.max(0, Math.round(Number(offset) || 0));
  const width = Number(step) || 0;
  const opt = String(option || "CE").toUpperCase() === "PE" ? "PE" : "CE";
  const kind = String(policy || "ATM").toUpperCase();
  if (kind === "ITM") {
    return opt === "CE" ? atm - n * width : atm + n * width;
  }
  if (kind === "OTM") {
    return opt === "CE" ? atm + n * width : atm - n * width;
  }
  return atm;
}

export function qtyForLots(lots, lotSize) {
  const size = Math.max(1, Math.round(Number(lotSize) || 0));
  const n = Math.max(1, Math.round(Number(lots) || 1));
  if (!(size > 0)) return 0;
  return n * size;
}

export function isLotMultiple(qty, lotSize) {
  const size = Math.max(1, Math.round(Number(lotSize) || 0));
  const n = Number(qty);
  return size > 0 && n > 0 && n % size === 0;
}
