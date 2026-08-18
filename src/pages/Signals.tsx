import { recentSignals } from "../data/mock";
import { cn } from "../lib/format";

export function Signals() {
  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-xl font-bold">Signals</h1>
        <p className="text-sm text-slate-400">AI and strategy alerts across indices and options</p>
      </div>
      <div className="grid gap-3">
        {recentSignals.concat(recentSignals).map((signal, i) => (
          <article key={`${signal.id}-${i}`} className="card flex items-center gap-4 p-4">
            <span
              className={cn(
                "w-14 rounded-lg py-2 text-center text-xs font-extrabold",
                signal.action === "BUY" ? "bg-emerald-50 text-up dark:bg-emerald-950/40" : "bg-rose-50 text-down dark:bg-rose-950/40",
              )}
            >
              {signal.action}
            </span>
            <div className="flex-1">
              <div className="font-semibold">{signal.symbol}</div>
              <div className="text-xs text-slate-400">
                {signal.strategy} · Triggered {signal.time}
              </div>
            </div>
            <div className="text-right">
              <div className="text-sm font-bold text-brand-500">{signal.confidence}%</div>
              <div className="text-[11px] text-slate-400">confidence</div>
            </div>
            <button type="button" className="h-9 rounded-lg bg-brand-500 px-3 text-xs font-semibold text-white">
              Review
            </button>
          </article>
        ))}
      </div>
    </div>
  );
}
