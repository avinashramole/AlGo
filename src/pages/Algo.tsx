import { useMarket } from "../context/MarketContext";
import { cn, formatInr } from "../lib/format";

export function Algo() {
  const { data, toggle } = useMarket();

  return (
    <div className="space-y-3">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-xl font-bold">Algo Desk</h1>
          <p className="text-sm text-slate-400">Deploy, pause, and monitor automated strategies</p>
        </div>
        <button type="button" className="h-9 rounded-lg bg-brand-500 px-3 text-xs font-semibold text-white">
          New Strategy
        </button>
      </div>
      <div className="grid gap-3 lg:grid-cols-3">
        {data.algos.map((algo) => (
          <section key={algo.id} className="card p-4">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-base font-bold">{algo.name}</div>
                <div className="text-xs text-slate-400">{algo.tag}</div>
              </div>
              <span
                className={cn(
                  "rounded px-1.5 py-0.5 text-[10px] font-bold",
                  algo.status === "LIVE" ? "bg-emerald-50 text-up dark:bg-emerald-950/40" : "bg-amber-50 text-amber-600 dark:bg-amber-950/40",
                )}
              >
                {algo.status}
              </span>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-[var(--bg)] p-3">
                <div className="text-[10px] uppercase text-slate-400">PnL</div>
                <div className={cn("text-lg font-bold", algo.pnl >= 0 ? "text-up" : "text-down")}>{formatInr(algo.pnl)}</div>
              </div>
              <div className="rounded-lg bg-[var(--bg)] p-3">
                <div className="text-[10px] uppercase text-slate-400">Win rate</div>
                <div className="text-lg font-bold">{algo.winRate}%</div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => void toggle(algo.id)}
              className="mt-4 h-10 w-full rounded-xl border border-[var(--border)] text-sm font-semibold"
            >
              {algo.enabled ? "Pause" : "Start"}
            </button>
          </section>
        ))}
      </div>
    </div>
  );
}
