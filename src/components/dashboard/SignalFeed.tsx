import { useMarket } from "../../context/MarketContext";
import { cn } from "../../lib/format";

export function SignalFeed() {
  const { data } = useMarket();
  return (
    <section className="card p-3">
      <div className="mb-1.5 text-xs font-bold">Signals</div>
      <div className="grid gap-1.5">
        {!data.signals.length ? (
          <div className="text-[11px] text-slate-400">No live signals yet.</div>
        ) : null}
        {data.signals.map((signal) => (
          <article key={signal.id} className="flex items-center gap-2 rounded-md border border-[var(--border)] px-2 py-1.5">
            <span
              className={cn(
                "w-10 shrink-0 rounded py-0.5 text-center text-[10px] font-extrabold",
                signal.action === "BUY" ? "bg-emerald-50 text-up dark:bg-emerald-950/40" : "bg-rose-50 text-down dark:bg-rose-950/40",
              )}
            >
              {signal.action}
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-semibold">{signal.symbol}</div>
              <div className="truncate text-[10px] text-slate-400">
                {signal.strategy} · {signal.time}
              </div>
            </div>
            <div className="shrink-0 text-right text-[11px] font-bold text-brand-500">{signal.confidence}%</div>
          </article>
        ))}
      </div>
    </section>
  );
}
