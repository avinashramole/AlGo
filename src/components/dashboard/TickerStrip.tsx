import { cn, formatChange, formatNumber, formatPct } from "../../lib/format";
import { useMarket } from "../../context/MarketContext";
import { Sparkline } from "../charts/Sparkline";

export function TickerStrip() {
  const { data } = useMarket();

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
      {data.indices.map((item) => {
        const up = item.change >= 0;
        return (
          <div key={item.symbol} className="card flex items-center justify-between px-4 py-3">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{item.symbol}</div>
              <div className="mt-1 text-lg font-bold leading-none">{formatNumber(item.price)}</div>
              <div className={cn("mt-1 text-xs font-semibold", up ? "text-up" : "text-down")}>
                {formatChange(item.change)} ({formatPct(item.changePct)})
              </div>
            </div>
            <Sparkline data={item.spark} up={up} />
          </div>
        );
      })}
    </div>
  );
}
