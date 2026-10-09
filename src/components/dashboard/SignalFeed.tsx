import { useMarket } from "../../context/MarketContext";
import { cn } from "../../lib/format";

function actionClass(action: string) {
  if (action === "BUY") return "status-live";
  if (action === "SELL") return "bg-rose-50 text-down dark:bg-rose-950/40";
  if (action === "ALERT") return "bg-amber-50 text-amber-700 dark:bg-amber-950/40";
  if (action === "EXIT") return "bg-sky-50 text-sky-700 dark:bg-sky-950/40";
  return "bg-[var(--card)] text-slate-500";
}

export function SignalFeed() {
  const { data } = useMarket();
  const signals = data.signals || [];
  return (
    <section className="card p-4" data-algo-live-signals="all">
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <div className="desk-kicker">Live book</div>
          <div className="text-sm font-bold">Signals</div>
        </div>
        <div className="text-[11px] font-semibold text-slate-400">{signals.length ? `${signals.length} rows` : "None"}</div>
      </div>
      <div className="grid max-h-[min(70vh,44rem)] gap-2 overflow-y-auto pr-1">
        {!signals.length ? (
          <div className="px-2 py-6 text-center text-sm text-slate-400">
            No live signals yet. Start an algo or wait for a Dhan / paper fill.
          </div>
        ) : null}
        {signals.map((signal) => (
          <article key={signal.id} className="flex items-center gap-4 rounded-lg bg-[var(--card-muted)] px-3 py-2.5">
            <span className={cn("w-14 rounded py-1.5 text-center text-[10px] font-extrabold", actionClass(signal.action))}>
              {signal.action}
            </span>
            <div className="min-w-0 flex-1">
              <div className="font-semibold">{signal.symbol}</div>
              <div className="text-xs text-slate-400">
                {signal.strategy} · Triggered {signal.time}
              </div>
              {signal.note && signal.note !== signal.symbol ? (
                <div className="truncate text-[11px] font-medium text-slate-500">{signal.note}</div>
              ) : null}
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
