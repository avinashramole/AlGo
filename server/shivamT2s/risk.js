export function roundToTick(price, tickSize = 0.05) {
  const px = Number(price);
  const tick = Number(tickSize) > 0 ? Number(tickSize) : 0.05;
  if (!(px > 0)) return 0;
  return Math.round(px / tick) * tick;
}

export function protectivePrices({ entryPremium, slMode, slValue, targetMode, targetValue, tickSize = 0.05 } = {}) {
  const entry = Number(entryPremium);
  if (!(entry > 0)) return { ok: false, reason: "no-entry" };
  const slAmt =
    String(slMode) === "points" ? Number(slValue) : entry * (Number(slValue) / 100);
  const tgtAmt =
    String(targetMode) === "points" ? Number(targetValue) : entry * (Number(targetValue) / 100);
  if (!(slAmt > 0) || !(tgtAmt > 0)) return { ok: false, reason: "invalid-levels" };
  const slPrice = roundToTick(entry - slAmt, tickSize);
  const targetPrice = roundToTick(entry + tgtAmt, tickSize);
  if (!(slPrice > 0) || slPrice >= entry) return { ok: false, reason: "sl-not-below-entry" };
  if (!(targetPrice > entry)) return { ok: false, reason: "target-not-above-entry" };
  return { ok: true, slPrice, targetPrice, slAmt, tgtAmt, entry };
}

export function averageFillPrice(fills = []) {
  const rows = (fills || []).filter((row) => Number(row.qty) > 0 && Number(row.price) > 0);
  const qty = rows.reduce((sum, row) => sum + Number(row.qty), 0);
  if (!(qty > 0)) return 0;
  return rows.reduce((sum, row) => sum + Number(row.qty) * Number(row.price), 0) / qty;
}

export function slIsActive(status) {
  return status === "confirmed" || status === "paper-managed";
}
