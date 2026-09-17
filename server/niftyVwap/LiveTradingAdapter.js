export function LiveTradingAdapter({ queueLiveOrder, squareOff } = {}) {
  return {
    mode: "live",
    place(payload) {
      if (typeof queueLiveOrder !== "function") return { error: "Live queue missing" };
      const queued = queueLiveOrder({
        ...payload,
        brokerId: payload.brokerId || "dhan",
        type: "MARKET",
        product: "MIS",
      });
      if (queued && typeof queued === "object") {
        const isQueued = queued.queued !== false && queued.duplicate !== true;
        return { ok: true, status: queued.status || "PENDING", ...queued, queued: isQueued };
      }
      return { ok: true, queued: true, status: "PENDING" };
    },
    exit(position) {
      if ((position?.paper || position?.brokerId === "paper") && position?.id && typeof squareOff === "function") {
        return squareOff(position.id);
      }
      if (typeof queueLiveOrder === "function") {
        queueLiveOrder({
          symbol: position.symbol,
          side: "SELL",
          qty: position.qty,
          strike: position.strike,
          option: position.option,
          expiry: position.expiry,
          kind: "option",
          product: "MIS",
          type: "MARKET",
          strategy: position.strategy,
          brokerId: position.brokerId || "dhan",
        });
        return { ok: true, queued: true };
      }
      return { error: "Cannot square off live position" };
    },
  };
}
