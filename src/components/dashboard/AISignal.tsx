import { ShieldCheck } from "lucide-react";

const metrics = [
  { label: "VWAP", value: 92 },
  { label: "DEPTH", value: 99 },
  { label: "OI", value: 84 },
  { label: "VOLUME", value: 78 },
];

type Props = {
  onReview: () => void;
};

export function AISignal({ onReview }: Props) {
  const dash = 2 * Math.PI * 42;
  const offset = dash * (1 - 0.91);

  return (
    <section className="card flex h-full flex-col p-4">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">AI Signal</div>
      <div className="mt-2 flex items-start justify-between gap-3">
        <div>
          <div className="inline-flex rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-extrabold text-up dark:bg-emerald-950/50">
            BUY
          </div>
          <div className="mt-2 text-lg font-bold leading-tight">NIFTY 24,500 CE</div>
          <div className="mt-1 text-xs text-slate-500">VWAP Depth · Expiry 28 Aug</div>
        </div>
        <div className="relative h-[92px] w-[92px]">
          <svg viewBox="0 0 100 100" className="-rotate-90">
            <circle cx="50" cy="50" r="42" fill="none" stroke="currentColor" className="text-slate-100 dark:text-slate-800" strokeWidth="10" />
            <circle
              cx="50"
              cy="50"
              r="42"
              fill="none"
              stroke="#2f54eb"
              strokeWidth="10"
              strokeDasharray={dash}
              strokeDashoffset={offset}
              strokeLinecap="round"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <div className="text-lg font-extrabold leading-none">91%</div>
            <div className="text-[9px] font-semibold uppercase text-slate-400">Confidence</div>
          </div>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-4 gap-2">
        {metrics.map((item) => (
          <div key={item.label} className="rounded-lg bg-[var(--bg)] px-2 py-2 text-center">
            <div className="text-[10px] font-semibold text-slate-400">{item.label}</div>
            <div className="mt-1 text-sm font-bold text-brand-500">{item.value}%</div>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-2 text-xs font-semibold text-up">
        <ShieldCheck size={14} />
        RISK <span className="rounded bg-emerald-50 px-1.5 py-0.5 dark:bg-emerald-950/40">LOW</span>
      </div>
      <button
        type="button"
        onClick={onReview}
        className="mt-auto h-11 w-full rounded-xl bg-brand-500 text-sm font-semibold text-white hover:bg-brand-600"
      >
        Review Trade
      </button>
    </section>
  );
}
