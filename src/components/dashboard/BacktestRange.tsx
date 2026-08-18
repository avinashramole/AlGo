import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
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

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/55 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Run backtest"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4">
          <div className="text-lg font-bold">Run backtest</div>
          <div className="text-xs text-slate-400">{name || "Strategy"} · pick a date range</div>
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
            <div className="mt-1 text-[11px] text-slate-400">
              {yearAgoYmd()} → {localYmd()}
            </div>
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
            <div className="mt-1 text-[11px] text-slate-400">Choose from and to</div>
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
    </div>,
    document.body,
  );
}

type InlineProps = {
  busy?: boolean;
  error?: string;
  onCancel: () => void;
  onRun: (payload: BacktestRangePayload) => void;
};

export function BacktestRangeInline({ busy, error, onCancel, onRun }: InlineProps) {
  const [range, setRange] = useState<"1y" | "custom">("1y");
  const [from, setFrom] = useState(yearAgoYmd());
  const [to, setTo] = useState(localYmd());

  return (
    <div className="mt-3 rounded-xl border border-brand-500/50 bg-brand-50/70 p-3 dark:bg-brand-500/10">
      <div className="text-xs font-bold uppercase tracking-wide text-brand-600">Choose backtest range</div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setRange("1y")}
          className={cn(
            "rounded-lg border px-2 py-2 text-left",
            range === "1y" ? "border-brand-500 bg-white dark:bg-[var(--card)]" : "border-[var(--border)] bg-[var(--bg)]",
          )}
        >
          <div className="text-xs font-bold">Last 1 year</div>
          <div className="mt-0.5 text-[10px] text-slate-400">
            {yearAgoYmd()} → {localYmd()}
          </div>
        </button>
        <button
          type="button"
          onClick={() => setRange("custom")}
          className={cn(
            "rounded-lg border px-2 py-2 text-left",
            range === "custom" ? "border-brand-500 bg-white dark:bg-[var(--card)]" : "border-[var(--border)] bg-[var(--bg)]",
          )}
        >
          <div className="text-xs font-bold">Custom dates</div>
          <div className="mt-0.5 text-[10px] text-slate-400">Pick from and to</div>
        </button>
      </div>
      {range === "custom" ? (
        <div className="mt-2 grid grid-cols-2 gap-2">
          <label className="text-[10px] font-semibold uppercase text-slate-500">
            From
            <input
              className="mt-1 h-9 w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-2 text-xs font-semibold"
              type="date"
              value={from}
              max={to}
              onChange={(event) => setFrom(event.target.value)}
            />
          </label>
          <label className="text-[10px] font-semibold uppercase text-slate-500">
            To
            <input
              className="mt-1 h-9 w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-2 text-xs font-semibold"
              type="date"
              value={to}
              min={from}
              max={localYmd()}
              onChange={(event) => setTo(event.target.value)}
            />
          </label>
        </div>
      ) : null}
      {error ? <div className="mt-2 text-xs font-semibold text-down">{error}</div> : null}
      <div className="mt-2 grid grid-cols-2 gap-2">
        <button type="button" onClick={onCancel} className="h-9 rounded-lg border border-[var(--border)] text-xs font-semibold">
          Cancel
        </button>
        <button
          type="button"
          disabled={busy || (range === "custom" && (!from || !to))}
          onClick={() => onRun(range === "custom" ? { range: "custom", from, to } : { range: "1y" })}
          className="h-9 rounded-lg bg-brand-500 text-xs font-semibold text-white disabled:opacity-60"
        >
          {busy ? "Testing..." : "Run backtest"}
        </button>
      </div>
    </div>
  );
}
