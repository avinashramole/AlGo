import { cn, formatChange, formatNumber, formatPct } from "../../lib/format";
import { useMarket } from "../../context/MarketContext";
import { Sparkline } from "../charts/Sparkline";

export function TickerStrip() {
  const { data } = useMarket();

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
      {data.indices.map((item) => {
        const up = item.change >= 0;
        const showDeriv = item.symbol !== "INDIA VIX";
        return (
          <div key={item.symbol} className="card px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{item.symbol}</div>
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
                </div>
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">VWAP</div>
                  <div className="text-sm font-bold">{formatNumber(item.vwap || item.price)}</div>
                </div>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
