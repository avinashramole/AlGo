import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "../../lib/format";

export const DEFAULT_BACKTEST_YEARS = 10;
export const MAX_BACKTEST_YEARS = 10;
export const MONTH_PRESETS = [1, 3, 6] as const;
export const YEAR_PRESETS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

export type BacktestRangeKind = "month" | "months" | "years" | "custom";

export type BacktestRangePayload = {
  range: BacktestRangeKind;
  months?: number;
  years?: number;
  from?: string;
  to?: string;
};

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

function localYmd(date = new Date()) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

export function monthStartYmd(date = new Date()) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-01`;
}

export function defaultMonthWindow(date = new Date()) {
  const to = localYmd(date);
  const from = monthStartYmd(date);
  return { from, to };
}

function clampYears(value: number) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return DEFAULT_BACKTEST_YEARS;
  return Math.max(1, Math.min(MAX_BACKTEST_YEARS, n));
}

function clampMonths(value: number) {
  const n = Math.round(Number(value));
  if (MONTH_PRESETS.includes(n as (typeof MONTH_PRESETS)[number])) return n;
  if (!Number.isFinite(n)) return 1;
  return Math.max(1, Math.min(12, n));
}

function shiftMonthsYmd(months: number, date = new Date()) {
  const next = new Date(date);
  next.setMonth(next.getMonth() - clampMonths(months));
  return localYmd(next);
}

function yearsAgoYmd(years = DEFAULT_BACKTEST_YEARS, date = new Date()) {
  const next = new Date(date);
  next.setFullYear(next.getFullYear() - clampYears(years));
  return localYmd(next);
}

function windowFor(kind: BacktestRangeKind, months: number, years: number, from: string, to: string) {
  const today = localYmd();
  if (kind === "custom") return { from, to };
  if (kind === "months") return { from: shiftMonthsYmd(months), to: today };
  if (kind === "years") return { from: yearsAgoYmd(years), to: today };
  return defaultMonthWindow();
}

function payloadFor(kind: BacktestRangeKind, months: number, years: number, from: string, to: string): BacktestRangePayload {
  const span = windowFor(kind, months, years, from, to);
  if (kind === "custom") return { range: "custom", from: span.from, to: span.to };
  if (kind === "months") return { range: "months", months: clampMonths(months), from: span.from, to: span.to };
  if (kind === "years") return { range: "years", years: clampYears(years), from: span.from, to: span.to };
  return { range: "month", from: span.from, to: span.to };
}

type PeriodState = {
  kind: BacktestRangeKind;
  months: number;
  years: number;
  from: string;
  to: string;
};

function thisMonthState(): PeriodState {
  const { from, to } = defaultMonthWindow();
  return { kind: "month", months: 1, years: 1, from, to };
}

function Chip({
  label,
  on,
  onClick,
  compact,
}: {
  label: string;
  on: boolean;
  onClick: () => void;
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border font-semibold",
        compact ? "px-2 py-1 text-[10px]" : "px-2.5 py-1.5 text-xs",
        on ? "border-brand-500 bg-brand-500 text-white" : "border-[var(--border)] bg-[var(--bg)] text-[var(--text)]",
      )}
    >
      {label}
    </button>
  );
}

function PeriodFields({
  compact,
  kind,
  months,
  years,
  from,
  to,
  onKind,
  onMonths,
  onYears,
  onFrom,
  onTo,
}: {
  compact?: boolean;
  kind: BacktestRangeKind;
  months: number;
  years: number;
  from: string;
  to: string;
  onKind: (kind: BacktestRangeKind) => void;
  onMonths: (months: number) => void;
  onYears: (years: number) => void;
  onFrom: (from: string) => void;
  onTo: (to: string) => void;
}) {
  const span = windowFor(kind, months, years, from, to);
  return (
    <div>
      <div className={cn("flex flex-wrap", compact ? "gap-1" : "gap-1.5")}>
        <Chip compact={compact} label="This month" on={kind === "month"} onClick={() => onKind("month")} />
        {MONTH_PRESETS.map((value) => (
          <Chip
            key={`m${value}`}
            compact={compact}
            label={value === 1 ? "1 month" : `${value} months`}
            on={kind === "months" && months === value}
            onClick={() => {
              onMonths(value);
              onKind("months");
            }}
          />
        ))}
        <Chip compact={compact} label="Custom" on={kind === "custom"} onClick={() => onKind("custom")} />
      </div>
      <div className={cn("mt-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500", compact ? "" : "mt-3")}>
        Years
      </div>
      <div className={cn("mt-1 flex flex-wrap", compact ? "gap-1" : "gap-1.5")}>
        {YEAR_PRESETS.map((value) => (
          <Chip
            key={`y${value}`}
            compact={compact}
            label={`${value}y`}
            on={kind === "years" && years === value}
            onClick={() => {
              onYears(value);
              onKind("years");
            }}
          />
        ))}
      </div>
      {kind === "custom" ? (
        <div className={cn("grid grid-cols-2 gap-2", compact ? "mt-2" : "mt-3")}>
          <label className={cn("font-semibold text-slate-500", compact ? "text-[10px] uppercase" : "text-xs")}>
            From
            <input
              className={cn(
                "mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 font-semibold",
                compact ? "h-9 bg-[var(--card)] px-2 text-xs" : "h-10 text-sm",
              )}
              type="date"
              value={from}
              max={to}
              onChange={(event) => onFrom(event.target.value)}
            />
          </label>
          <label className={cn("font-semibold text-slate-500", compact ? "text-[10px] uppercase" : "text-xs")}>
            To
            <input
              className={cn(
                "mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 font-semibold",
                compact ? "h-9 bg-[var(--card)] px-2 text-xs" : "h-10 text-sm",
              )}
              type="date"
              value={to}
              min={from}
              max={localYmd()}
              onChange={(event) => onTo(event.target.value)}
            />
          </label>
        </div>
      ) : (
        <div className={cn("text-slate-400", compact ? "mt-2 text-[10px]" : "mt-3 text-[11px]")}>
          {span.from} → {span.to}
          {kind === "month" ? " · current month" : kind === "months" ? ` · last ${months} month${months === 1 ? "" : "s"}` : ` · last ${years} year${years === 1 ? "" : "s"}`}
        </div>
      )}
    </div>
  );
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
  const [state, setState] = useState<PeriodState>(thisMonthState);

  useEffect(() => {
    if (!open) return;
    setState(thisMonthState());
  }, [open]);

  if (!open || typeof document === "undefined") return null;

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
        <div className="mb-3">
          <div className="text-lg font-bold">Run backtest</div>
          <div className="text-xs text-slate-400">{name || "Strategy"} · this month, then 1 / 3 / 6 months or years</div>
          <div className="desk-help mt-1 text-[11px] leading-snug text-slate-500">
            Default is this calendar month through today so a first run stays short. Stored Dhan history is reused. Each finished backtest writes a PDF and Excel report.
          </div>
        </div>
        <PeriodFields
          kind={state.kind}
          months={state.months}
          years={state.years}
          from={state.from}
          to={state.to}
          onKind={(kind) => setState((current) => ({ ...current, kind, ...(kind === "month" ? defaultMonthWindow() : {}) }))}
          onMonths={(months) => setState((current) => ({ ...current, months, kind: "months" }))}
          onYears={(years) => setState((current) => ({ ...current, years, kind: "years" }))}
          onFrom={(from) => setState((current) => ({ ...current, kind: "custom", from }))}
          onTo={(to) => setState((current) => ({ ...current, kind: "custom", to }))}
        />
        {error ? <div className="mt-3 text-xs font-semibold text-down">{error}</div> : null}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="h-10 rounded-xl border border-[var(--border)] px-4 text-sm font-semibold">
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              setState(thisMonthState());
              onReset?.();
            }}
            title="Clears a stuck backtest lock (same as rm -f /opt/t2s/server/data/backtest.busy)"
            className="h-10 rounded-xl border border-[var(--border)] px-4 text-sm font-semibold"
          >
            Reset
          </button>
          <button
            type="button"
            disabled={busy || (state.kind === "custom" && (!state.from || !state.to))}
            onClick={() => onRun(payloadFor(state.kind, state.months, state.years, state.from, state.to))}
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
  const [state, setState] = useState<PeriodState>(thisMonthState);

  return (
    <div className="mt-3 rounded-xl border border-brand-500/50 bg-brand-50/70 p-3 dark:bg-brand-500/10">
      <div className="text-xs font-bold uppercase tracking-wide text-brand-600">Choose backtest range</div>
      <div className="mt-1 text-[11px] leading-snug text-slate-500">
        Default is this month ({monthStartYmd()} → {localYmd()}). Then 1 / 3 / 6 months, or pick years.
      </div>
      <div className="mt-2">
        <PeriodFields
          compact
          kind={state.kind}
          months={state.months}
          years={state.years}
          from={state.from}
          to={state.to}
          onKind={(kind) => setState((current) => ({ ...current, kind, ...(kind === "month" ? defaultMonthWindow() : {}) }))}
          onMonths={(months) => setState((current) => ({ ...current, months, kind: "months" }))}
          onYears={(years) => setState((current) => ({ ...current, years, kind: "years" }))}
          onFrom={(from) => setState((current) => ({ ...current, kind: "custom", from }))}
          onTo={(to) => setState((current) => ({ ...current, kind: "custom", to }))}
        />
      </div>
      {error ? <div className="mt-2 text-xs font-semibold text-down">{error}</div> : null}
      <div className="mt-2 grid grid-cols-3 gap-2">
        <button type="button" onClick={onCancel} className="h-9 rounded-lg border border-[var(--border)] text-xs font-semibold">
          Cancel
        </button>
        <button
          type="button"
          onClick={() => {
            setState(thisMonthState());
            onReset?.();
          }}
          title="Clears a stuck backtest lock (same as rm -f /opt/t2s/server/data/backtest.busy)"
          className="h-9 rounded-lg border border-[var(--border)] text-xs font-semibold"
        >
          Reset
        </button>
        <button
          type="button"
          disabled={busy || (state.kind === "custom" && (!state.from || !state.to))}
          onClick={() => onRun(payloadFor(state.kind, state.months, state.years, state.from, state.to))}
          className="h-9 rounded-lg bg-brand-500 text-xs font-semibold text-white disabled:opacity-60"
        >
          {busy ? "Testing..." : "Run backtest"}
        </button>
      </div>
    </div>
  );
}
