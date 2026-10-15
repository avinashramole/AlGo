import { qtyForLots } from "./strikes.js";

function round2(value) {
  return Math.round(Number(value) * 100) / 100;
}

export function approvedAllocation({ capitalMode, capitalValue, availableFunds } = {}) {
  const funds = Math.max(0, Number(availableFunds) || 0);
  const configured = Math.max(0, Number(capitalValue) || 0);
  const allocation = String(capitalMode || "amount") === "percent" ? funds * (configured / 100) : configured;
  return round2(Math.min(allocation, funds));
}

export function estimateOrderCost({ premium, lotSize, lots, brokeragePerLot = 0 } = {}) {
  const px = Number(premium);
  const size = Math.max(0, Math.round(Number(lotSize) || 0));
  const n = Math.max(0, Math.round(Number(lots) || 0));
  const brokerage = Math.max(0, Number(brokeragePerLot) || 0);
  if (!(px > 0) || !(size > 0) || !(n > 0)) {
    return { orderValue: 0, requiredFunds: 0, qty: 0 };
  }
  const qty = qtyForLots(n, size);
  const orderValue = round2(px * qty);
  return { orderValue, requiredFunds: round2(orderValue + brokerage * n), qty };
}

export function maxAffordableLots({
  premium,
  lotSize,
  availableFunds,
  capitalMode,
  capitalValue,
  brokeragePerLot = 0,
} = {}) {
  const size = Math.max(0, Math.round(Number(lotSize) || 0));
  const px = Number(premium);
  const approved = approvedAllocation({ capitalMode, capitalValue, availableFunds });
  if (!(px > 0) || !(size > 0) || !(approved > 0)) return 0;
  const perLot = px * size + Math.max(0, Number(brokeragePerLot) || 0);
  if (!(perLot > 0)) return 0;
  return Math.max(0, Math.floor(approved / perLot));
}

export function sizeShivamLots({
  requestedLots,
  premium,
  lotSize,
  availableFunds,
  capitalMode,
  capitalValue,
  brokeragePerLot = 0,
  autoSizeLots = false,
} = {}) {
  const requested = Math.max(1, Math.round(Number(requestedLots) || 1));
  const instrumentLotSize = Math.max(0, Math.round(Number(lotSize) || 0));
  const maxLots = maxAffordableLots({
    premium,
    lotSize: instrumentLotSize,
    availableFunds,
    capitalMode,
    capitalValue,
    brokeragePerLot,
  });
  const allocation = approvedAllocation({ capitalMode, capitalValue, availableFunds });
  if (!(instrumentLotSize > 0)) {
    return {
      ok: false,
      reason: "missing-lot-size",
      requested,
      approvedLots: 0,
      maxLots: 0,
      lotSize: 0,
      allocation,
      orderValue: 0,
      requiredFunds: 0,
      qty: 0,
    };
  }
  if (!(Number(premium) > 0)) {
    return {
      ok: false,
      reason: "missing-premium",
      requested,
      approvedLots: 0,
      maxLots,
      lotSize: instrumentLotSize,
      allocation,
      orderValue: 0,
      requiredFunds: 0,
      qty: 0,
    };
  }
  if (!(maxLots >= 1)) {
    return {
      ok: false,
      reason: "insufficient-funds",
      requested,
      approvedLots: 0,
      maxLots: 0,
      lotSize: instrumentLotSize,
      allocation,
      ...estimateOrderCost({ premium, lotSize: instrumentLotSize, lots: requested, brokeragePerLot }),
    };
  }
  if (requested > maxLots && autoSizeLots !== true) {
    return {
      ok: false,
      reason: "lots-exceed-max",
      requested,
      approvedLots: 0,
      maxLots,
      lotSize: instrumentLotSize,
      allocation,
      ...estimateOrderCost({ premium, lotSize: instrumentLotSize, lots: requested, brokeragePerLot }),
    };
  }
  const lots = requested > maxLots ? maxLots : requested;
  return {
    ok: true,
    reason: requested > maxLots ? "auto-sized" : "ok",
    requested,
    approvedLots: lots,
    maxLots,
    lotSize: instrumentLotSize,
    allocation,
    ...estimateOrderCost({ premium, lotSize: instrumentLotSize, lots, brokeragePerLot }),
  };
}
