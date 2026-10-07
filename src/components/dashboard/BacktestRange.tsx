import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "../../lib/format";

export const DEFAULT_BACKTEST_YEARS = 10;
export const MAX_BACKTEST_YEARS = 10;

export type BacktestRangePayload = {
  range: "years" | "custom";
  years?: number;
  from?: string;
  to?: string;
};

function localYmd(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function clampYears(value: number) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return DEFAULT_BACKTEST_YEARS;
  return Math.max(1, Math.min(MAX_BACKTEST_YEARS, n));
}

function yearsAgoYmd(years = DEFAULT_BACKTEST_YEARS) {
  const date = new Date();
  date.setFullYear(date.getFullYear() - clampYears(years));
  return localYmd(date);
}

type Props = {
  open: boolean;
  name?: string;
  busy?: boolean;
  error?: string;
  onClose: () => void;
  onReset?: () => void;
  onRun: (payload: BacktestRangePayload) => void;
};

export function BacktestRange({ open, name, busy, error, onClose, onReset, onRun }: Props) {
  const [range, setRange] = useState<"years" | "custom">("years");
  const [years, setYears] = useState(DEFAULT_BACKTEST_YEARS);
  const [from, setFrom] = useState(yearsAgoYmd());
  const [to, setTo] = useState(localYmd());

  useEffect(() => {
    if (!open) return;
    setRange("years");
    setYears(DEFAULT_BACKTEST_YEARS);
    setFrom(yearsAgoYmd(DEFAULT_BACKTEST_YEARS));
    setTo(localYmd());
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  const yearsValue = clampYears(years);

  return createPortal(
    <div
      className="desk-overlay z-[200]"
      role="dialog"
      aria-modal="true"
      aria-label="Run backtest"
      onClick={onClose}
    >
      <div
        className="desk-sheet desk-sheet-sm rounded-2xl border border-[var(--border)] bg-[var(--card)] p-3 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4">
          <div className="text-lg font-bold">Run backtest</div>
          <div className="text-xs text-slate-400">{name || "Strategy"} · pick years or dates</div>
          <div className="desk-help mt-1 text-[11px] leading-snug text-slate-500">
            Replay uses the strategy timeframe and runs off the API thread so quotes stay up. Stored Dhan history is reused; a first download for the selected years happens once. Each finished backtest writes a PDF and Excel report on the strategy card.
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setRange("years")}
            className={cn(
              "rounded-xl border px-3 py-3 text-left",
              range === "years" ? "border-brand-500 bg-brand-50/80 dark:bg-brand-500/10" : "border-[var(--border)] bg-[var(--bg)]",
            )}
          >
            <div className="text-sm font-bold">Last years</div>
            <div className="mt-1 text-[11px] text-slate-400">
              {yearsAgoYmd(yearsValue)} → {localYmd()}
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
        {range === "years" ? (
          <label className="mt-3 block text-xs font-semibold text-slate-500">
            Years
            <input
              className="mt-1 h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 text-sm font-semibold"
              type="number"
              min={1}
              max={MAX_BACKTEST_YEARS}
              step={1}
              value={years}
              onChange={(event) => setYears(clampYears(Number(event.target.value)))}
            />
          </label>
        ) : (
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
        )}
        {error ? <div className="mt-3 text-xs font-semibold text-down">{error}</div> : null}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="h-10 rounded-xl border border-[var(--border)] px-4 text-sm font-semibold">
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setRange("years");
              setYears(DEFAULT_BACKTEST_YEARS);
              setFrom(yearsAgoYmd(DEFAULT_BACKTEST_YEARS));
              setTo(localYmd());
              onReset?.();
            }}
            className="h-10 rounded-xl border border-[var(--border)] px-4 text-sm font-semibold disabled:opacity-60"
          >
            Reset
          </button>
          <button
            type="button"
            disabled={busy || (range === "custom" && (!from || !to))}
            onClick={() =>
              onRun(range === "custom" ? { range: "custom", from, to } : { range: "years", years: yearsValue })
            }
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
  onReset?: () => void;
  onRun: (payload: BacktestRangePayload) => void;
};

export function BacktestRangeInline({ busy, error, onCancel, onReset, onRun }: InlineProps) {
  const [range, setRange] = useState<"years" | "custom">("years");
  const [years, setYears] = useState(DEFAULT_BACKTEST_YEARS);
  const [from, setFrom] = useState(yearsAgoYmd());
  const [to, setTo] = useState(localYmd());
  const yearsValue = clampYears(years);

  return (
    <div className="mt-3 rounded-xl border border-brand-500/50 bg-brand-50/70 p-3 dark:bg-brand-500/10">
      <div className="text-xs font-bold uppercase tracking-wide text-brand-600">Choose backtest range</div>
      <div className="mt-1 text-[11px] leading-snug text-slate-500">
        Type how many years to replay, up to 10. Uses stored history when this range is already downloaded.
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setRange("years")}
          className={cn(
            "rounded-lg border px-2 py-2 text-left",
            range === "years" ? "border-brand-500 bg-white dark:bg-[var(--card)]" : "border-[var(--border)] bg-[var(--bg)]",
          )}
        >
          <div className="text-xs font-bold">Last years</div>
          <div className="mt-0.5 text-[10px] text-slate-400">
            {yearsAgoYmd(yearsValue)} → {localYmd()}
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
      {range === "years" ? (
        <label className="mt-2 block text-[10px] font-semibold uppercase text-slate-500">
          Years
          <input
            className="mt-1 h-9 w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-2 text-xs font-semibold"
            type="number"
            min={1}
            max={MAX_BACKTEST_YEARS}
            step={1}
            value={years}
            onChange={(event) => setYears(clampYears(Number(event.target.value)))}
          />
        </label>
      ) : (
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
      )}
      {error ? <div className="mt-2 text-xs font-semibold text-down">{error}</div> : null}
      <div className="mt-2 grid grid-cols-3 gap-2">
        <button type="button" onClick={onCancel} className="h-9 rounded-lg border border-[var(--border)] text-xs font-semibold">
          Cancel
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setRange("years");
            setYears(DEFAULT_BACKTEST_YEARS);
            setFrom(yearsAgoYmd(DEFAULT_BACKTEST_YEARS));
            setTo(localYmd());
            onReset?.();
          }}
          className="h-9 rounded-lg border border-[var(--border)] text-xs font-semibold disabled:opacity-60"
        >
          Reset
        </button>
        <button
          type="button"
          disabled={busy || (range === "custom" && (!from || !to))}
          onClick={() => onRun(range === "custom" ? { range: "custom", from, to } : { range: "years", years: yearsValue })}
          className="h-9 rounded-lg bg-brand-500 text-xs font-semibold text-white disabled:opacity-60"
        >
          {busy ? "Testing..." : "Run backtest"}
        </button>
      </div>
    </div>
  );
}
