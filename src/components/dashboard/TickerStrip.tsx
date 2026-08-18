import { useState } from "react";
import { cn, formatChange, formatNumber, formatPct } from "../../lib/format";
import { useMarket } from "../../context/MarketContext";
import { Sparkline } from "../charts/Sparkline";

export function TickerStrip() {
  const { data, order } = useMarket();
  const [busy, setBusy] = useState("");

  const tradeFuture = async (item: (typeof data.indices)[number], side: "BUY" | "SELL") => {
    if (!item.futureId) return;
    const key = `${item.futureId}-${side}`;
    const root = item.symbol === "NIFTY 50" ? "NIFTY" : item.symbol;
    setBusy(key);
    try {
      await order({
        symbol: `${root} FUT`,
        kind: "future",
        side,
        qty: item.lot || 65,
        price: item.future || item.price,
        product: "MIS",
        type: "MARKET",
        brokerId: data.activeBrokerId,
        securityId: String(item.futureId),
        expiry: item.futureExpiry,
        exchangeSegment: item.futureSegment,
      });
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Order failed");
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
      {data.indices.map((item) => {
        const up = item.change >= 0;
        const showDeriv = item.symbol !== "INDIA VIX";
        const root = item.symbol === "NIFTY 50" ? "NIFTY" : item.name || item.symbol;
        return (
          <div key={item.symbol} className="card px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{item.symbol}</div>
                <div className="text-[10px] font-mono text-slate-400">Index ID {item.indexId || item.securityId || "—"}</div>
                <div className="mt-1 text-lg font-bold leading-none">{formatNumber(item.price)}</div>
                <div className={cn("mt-1 text-xs font-semibold", up ? "text-up" : "text-down")}>
                  {formatChange(item.change)} ({formatPct(item.changePct)}) today
                </div>
              </div>
              <Sparkline data={item.spark || [item.price]} up={up} />
            </div>
            {showDeriv ? (
              <div className="mt-3 grid grid-cols-2 gap-2 border-t border-[var(--border)] pt-2">
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Future</div>
                  <div className="text-sm font-bold">{formatNumber(item.future || item.price)}</div>
                  <div className="text-[10px] font-mono text-slate-400">FUT ID {item.futureId || "—"}</div>
                </div>
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">VWAP</div>
                  <div className="text-sm font-bold">{formatNumber(item.vwap || item.price)}</div>
                  <div className="text-[10px] text-slate-400">{item.lot ? `1 lot = ${item.lot}` : ""}</div>
                </div>
              </div>
            ) : null}
            {showDeriv && item.futureId ? (
              <div className="mt-2 flex gap-1">
                <button
                  type="button"
                  disabled={Boolean(busy)}
                  onClick={() => void tradeFuture(item, "BUY")}
                  className="h-7 flex-1 rounded-md bg-emerald-500 text-[10px] font-bold text-white disabled:opacity-50"
                >
                  {busy === `${item.futureId}-BUY` ? "..." : `BUY ${root} FUT`}
                </button>
                <button
                  type="button"
                  disabled={Boolean(busy)}
                  onClick={() => void tradeFuture(item, "SELL")}
                  className="h-7 flex-1 rounded-md bg-rose-500 text-[10px] font-bold text-white disabled:opacity-50"
                >
                  {busy === `${item.futureId}-SELL` ? "..." : "SELL"}
                </button>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
