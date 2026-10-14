import { exchangeSegmentFor, getUnderlying, underlyingIdFromSymbol } from "../optionChain.js";

export function LiveTradingAdapter({ queueLiveOrder, squareOff } = {}) {
  return {
    mode: "live",
    place(payload) {
      if (typeof queueLiveOrder !== "function") return { error: "Live queue missing" };
      const queued = queueLiveOrder({
        ...payload,
        brokerId: payload.brokerId || "dhan",
        type: "MARKET",
        product: payload.product || "MIS",
      });
      if (queued && typeof queued === "object") {
        const isQueued = queued.queued !== false && queued.duplicate !== true;
        return { ok: true, status: queued.status || "PENDING", ...queued, queued: isQueued };
      }
      return { ok: true, queued: true, status: "PENDING" };
    },
    exit(position) {
      if ((position?.paper || position?.brokerId === "paper") && position?.id && typeof squareOff === "function") {
        return squareOff(position.id, { role: position.role, exitReason: position.exitReason || position.role });
      }
      if (typeof queueLiveOrder === "function") {
        const lotSize =
          Number(position.lotSize) > 0
            ? Number(position.lotSize)
            : getUnderlying(underlyingIdFromSymbol(position.symbol)).lot;
        const queued = queueLiveOrder({
          symbol: position.symbol,
          side: "SELL",
          qty: position.qty,
          lots: Number(position.lots) > 0 ? Number(position.lots) : undefined,
          lotSize,
          strike: position.strike,
          option: position.option,
          expiry: position.expiry,
          securityId: position.securityId,
          exchangeSegment: position.exchangeSegment || exchangeSegmentFor(position.symbol),
          kind: "option",
          product: position.product || "MIS",
          type: "MARKET",
          strategy: position.strategy,
          brokerId: position.brokerId || "dhan",
          cancelArmedTarget: true,
          role: position.role || position.exitReason || "exit",
          exitReason: position.exitReason || position.role || "",
        });
        if (queued && typeof queued === "object") {
          const isQueued = queued.queued !== false && queued.duplicate !== true;
          return { ok: true, status: queued.status || "PENDING", ...queued, queued: isQueued };
        }
        return { ok: true, queued: true, status: "PENDING" };
      }
      return { error: "Cannot square off live position" };
    },
  };
}
