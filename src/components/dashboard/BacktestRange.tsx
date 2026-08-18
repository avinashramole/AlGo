import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "../../lib/format";

export type BacktestRangePayload = {
  range: "1y" | "custom";
  from?: string;
  to?: string;
};

function localYmd(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function yearAgoYmd() {
  const date = new Date();
  date.setFullYear(date.getFullYear() - 1);
  return localYmd(date);
}

type Props = {
  open: boolean;
  name?: string;
  busy?: boolean;
  error?: string;
  onClose: () => void;
  onRun: (payload: BacktestRangePayload) => void;
};

export function BacktestRange({ open, name, busy, error, onClose, onRun }: Props) {
  const [range, setRange] = useState<"1y" | "custom">("1y");
  const [from, setFrom] = useState(yearAgoYmd());
  const [to, setTo] = useState(localYmd());

  useEffect(() => {
    if (!open) return;
    setRange("1y");
    setFrom(yearAgoYmd());
    setTo(localYmd());
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="card w-full max-w-md p-5">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <div className="text-lg font-bold">Run backtest</div>
            <div className="text-xs text-slate-400">{name || "Strategy"} · last 1 year or custom dates</div>
          </div>
          <button type="button" onClick={onClose} className="icon-btn" aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setRange("1y")}
            className={cn(
              "rounded-xl border px-3 py-3 text-left",
              range === "1y" ? "border-brand-500 bg-brand-50/80 dark:bg-brand-500/10" : "border-[var(--border)] bg-[var(--bg)]",
            )}
          >
            <div className="text-sm font-bold">Last 1 year</div>
            <div className="mt-1 text-[11px] text-slate-400">From {yearAgoYmd()} to today</div>
          </button>
          <button
            type="button"
            onClick={() => setRange("custom")}
            className={cn(
              "rounded-xl border px-3 py-3 text-left",
              range === "custom" ? "border-brand-500 bg-brand-50/80 dark:bg-brand-500/10" : "border-[var(--border)] bg-[var(--bg)]",
            )}
          >
            <div className="text-sm font-bold">Custom dates</div>
            <div className="mt-1 text-[11px] text-slate-400">Pick from and to</div>
          </button>
        </div>
        {range === "custom" ? (
          <div className="mt-3 grid grid-cols-2 gap-2">
            <label className="text-xs font-semibold text-slate-500">
              From
              <input
                className="mt-1 h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 text-sm font-semibold"
                type="date"
                value={from}
                max={to}
                onChange={(event) => setFrom(event.target.value)}
              />
            </label>
            <label className="text-xs font-semibold text-slate-500">
              To
              <input
                className="mt-1 h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 text-sm font-semibold"
                type="date"
                value={to}
                min={from}
                max={localYmd()}
                onChange={(event) => setTo(event.target.value)}
              />
            </label>
          </div>
        ) : null}
        {error ? <div className="mt-3 text-xs font-semibold text-down">{error}</div> : null}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="h-10 rounded-xl border border-[var(--border)] px-4 text-sm font-semibold">
            Cancel
          </button>
          <button
            type="button"
            disabled={busy || (range === "custom" && (!from || !to))}
            onClick={() => onRun(range === "custom" ? { range: "custom", from, to } : { range: "1y" })}
            className="h-10 rounded-xl bg-brand-500 px-4 text-sm font-semibold text-white disabled:opacity-60"
          >
            {busy ? "Testing..." : "Run backtest"}
          </button>
        </div>
      </div>
    </div>
  );
}
