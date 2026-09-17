import { useMarket } from "../../context/MarketContext";
import { cn } from "../../lib/format";

export function SignalFeed() {
  const { data } = useMarket();
  return (
    <section className="card p-4">
      <div className="mb-3">
        <div className="text-sm font-bold">Signals</div>
        <p className="text-xs text-slate-400">AI and strategy alerts across indices and options</p>
      </div>
      <div className="grid gap-3">
        {!data.signals.length ? (
          <div className="px-2 py-6 text-center text-sm text-slate-400">
            No live signals yet. Start an algo or wait for a Dhan / paper fill.
          </div>
        ) : null}
        {data.signals.map((signal) => (
          <article key={signal.id} className="flex items-center gap-4 rounded-xl border border-[var(--border)] p-3">
            <span
              className={cn(
                "w-14 rounded-lg py-2 text-center text-xs font-extrabold",
                signal.action === "BUY" ? "bg-emerald-50 text-up dark:bg-emerald-950/40" : "bg-rose-50 text-down dark:bg-rose-950/40",
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
