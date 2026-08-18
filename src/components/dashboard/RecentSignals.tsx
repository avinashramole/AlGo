import { useMarket } from "../../context/MarketContext";
import { cn } from "../../lib/format";

export function RecentSignals() {
  const { data } = useMarket();
  return (
    <section className="card p-4">
      <div className="mb-3 text-sm font-bold">Recent Signals</div>
      <div className="space-y-2">
        {data.signals.map((signal) => (
          <div key={signal.id} className="flex items-center gap-3 rounded-xl border border-[var(--border)] px-3 py-2">
            <span
              className={cn(
                "w-10 rounded-md py-1 text-center text-[10px] font-extrabold",
                signal.action === "BUY" ? "bg-emerald-50 text-up dark:bg-emerald-950/40" : "bg-rose-50 text-down dark:bg-rose-950/40",
              )}
            >
              {signal.action}
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-semibold">{signal.symbol}</div>
              <div className="text-[10px] text-slate-400">
                {signal.strategy} · {signal.time}
              </div>
            </div>
            <div className="text-xs font-bold text-brand-500">{signal.confidence}%</div>
          </div>
        ))}
      </div>
    </section>
  );
}
