import { useMarket } from "../../context/MarketContext";
import { cn } from "../../lib/format";

export function SignalFeed() {
  const { data } = useMarket();
  return (
    <section className="card p-4">
      <div className="mb-3">
        <div className="desk-kicker">Live book</div>
        <div className="text-sm font-bold">Signals</div>
      </div>
      <div className="grid gap-2">
        {!data.signals.length ? (
          <div className="px-2 py-6 text-center text-sm text-slate-400">
            No live signals yet. Start an algo or wait for a Dhan / paper fill.
          </div>
        ) : null}
        {data.signals.map((signal) => (
          <article key={signal.id} className="flex items-center gap-4 rounded-lg bg-[var(--card-muted)] px-3 py-2.5">
            <span
              className={cn(
                "w-14 rounded py-1.5 text-center text-xs font-extrabold",
                signal.action === "BUY" ? "status-live" : "bg-rose-50 text-down dark:bg-rose-950/40",
              )}
            >
              {signal.action}
            </span>
            <div className="min-w-0 flex-1">
              <div className="font-semibold">{signal.symbol}</div>
              <div className="text-xs text-slate-400">
                {signal.strategy} · Triggered {signal.time}
              </div>
            </div>
            <div className="text-right">
              <div className="text-sm font-bold text-brand-500">{signal.confidence}%</div>
              <div className="text-[11px] text-slate-400">confidence</div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
