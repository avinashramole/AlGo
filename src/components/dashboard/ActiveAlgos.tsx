import { Link } from "react-router-dom";
import { useMarket } from "../../context/MarketContext";
import { cn, formatInr } from "../../lib/format";
import { contractLabel } from "../../lib/strategies";

export function ActiveAlgos() {
  const { data, toggle } = useMarket();

  return (
    <section className="card p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-sm font-bold">Active Algorithms</div>
        <div className="flex items-center gap-2">
          <div className="text-[11px] font-semibold text-slate-400">{data.algos.filter((a) => a.enabled).length} live</div>
          <Link to="/algo" className="text-[11px] font-semibold text-brand-500">
            Builder →
          </Link>
        </div>
      </div>
      <div className="space-y-2">
        {data.algos.map((algo) => (
          <div key={algo.id} className="flex items-center gap-3 rounded-xl border border-[var(--border)] px-3 py-2.5">
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold">{algo.name}</span>
                <span
                  className={cn(
                    "rounded px-1.5 py-0.5 text-[10px] font-bold",
                    algo.status === "LIVE"
                      ? "bg-emerald-50 text-up dark:bg-emerald-950/40"
                      : algo.status === "PAPER"
                        ? "bg-sky-50 text-sky-700 dark:bg-sky-950/40"
                        : algo.status === "BACKTEST"
                          ? "bg-violet-50 text-violet-700 dark:bg-violet-950/40"
                          : "bg-amber-50 text-amber-600 dark:bg-amber-950/40",
                  )}
                >
                  {algo.status}
                </span>
              </div>
              <div className="mt-1 flex flex-wrap gap-3 text-[11px] text-slate-400">
                <span className={algo.pnl >= 0 ? "text-up" : "text-down"}>{formatInr(algo.pnl)}</span>
                <span>WR {algo.winRate}%</span>
                <span>{algo.trade?.label || contractLabel(algo)}</span>
                <span>{algo.kind === "nifty-vwap-reversal" ? "15m VWAP" : algo.kind === "nifty-vwap" ? "NIFTY VWAP" : algo.kind === "price-action" ? "Price action" : algo.tag}</span>
                <span>{algo.runMode === "paper" ? "Paper" : algo.runMode === "backtest" ? "Backtest" : data.brokers?.find((item) => item.id === algo.brokerId)?.name || "Dhan"}</span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => void toggle(algo.id)}
              className={cn(
                "relative h-6 w-11 rounded-full transition-colors",
                algo.enabled ? "bg-brand-500" : "bg-slate-300 dark:bg-slate-600",
              )}
              aria-label={`Toggle ${algo.name}`}
            >
              <span
                className={cn(
                  "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all",
                  algo.enabled ? "left-5" : "left-0.5",
                )}
              />
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
