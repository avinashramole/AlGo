import { X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useMarket } from "../../context/MarketContext";
import { cn } from "../../lib/format";
import {
  INDICATORS,
  OPERATORS,
  PATTERNS,
  SOURCES,
  STRATEGY_SYMBOLS,
  TIMEFRAMES,
  defaultConditions,
  emptyStrategy,
  formatCondition,
  lotForSymbol,
  RUN_MODES,
  type AlgoStrategy,
  type ConditionOp,
  type ConditionSource,
  type StrategyKind,
} from "../../lib/strategies";

type Props = {
  open: boolean;
  algo?: AlgoStrategy | null;
  onClose: () => void;
};

const fieldClass = "mt-1 h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 text-sm font-semibold";

export function StrategyBuilder({ open, algo, onClose }: Props) {
  const { data, saveAlgo } = useMarket();
  const [form, setForm] = useState(emptyStrategy("indicator"));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    if (algo) {
      setForm({ ...emptyStrategy(algo.kind || "indicator"), ...algo });
    } else {
      setForm({ ...emptyStrategy("indicator"), brokerId: data.activeBrokerId || "dhan" });
    }
    setError("");
  }, [open, algo, data.activeBrokerId]);

  const connected = (data.brokers || []).filter((item) => item.connected);
  const kind = (form.kind || "indicator") as StrategyKind;
  const title = algo ? `Edit ${algo.name}` : "Add strategy";

  const lotSize = lotForSymbol(form.symbol);
  const lots = form.lots || 1;
  const preview = useMemo(() => {
    const buy = formatCondition(form.buyLeft, form.buyOp, form.buyRight, form.buyValue);
    const sell = formatCondition(form.sellLeft, form.sellOp, form.sellRight, form.sellValue);
    return `${form.symbol} · ${lots} lot × ${lotSize} = ${lots * lotSize} qty · BUY when ${buy} · SELL when ${sell}`;
  }, [form.buyLeft, form.buyOp, form.buyRight, form.buyValue, form.sellLeft, form.sellOp, form.sellRight, form.sellValue, form.symbol, lotSize, lots]);

  const set = (patch: Partial<AlgoStrategy>) => setForm((current) => ({ ...current, ...patch }));

  const submit = async () => {
    if (!String(form.name || "").trim()) {
      setError("Give the strategy a name.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await saveAlgo({ ...form, id: algo?.id });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save strategy");
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="card max-h-[92vh] w-full max-w-2xl overflow-y-auto p-5">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <div className="text-lg font-bold">{title}</div>
            <div className="text-xs text-slate-400">{preview}</div>
          </div>
          <button type="button" onClick={onClose} className="icon-btn">
            <X size={16} />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <TypeCard
            active={kind === "indicator"}
            title="Indicator based"
            text="RSI, EMA, VWAP with crossover, above, below, <, >"
            onClick={() => set({ kind: "indicator", tag: "Indicator", ...defaultConditions("indicator", form.indicator, form.pattern) })}
          />
          <TypeCard
            active={kind === "price-action"}
            title="Price action based"
            text="ORB, breakout, pin bar, engulfing"
            onClick={() => set({ kind: "price-action", tag: "Price action", ...defaultConditions("price-action", form.indicator, form.pattern) })}
          />
        </div>

        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
          {RUN_MODES.map((mode) => (
            <TypeCard
              key={mode.id}
              active={(form.runMode || "paper") === mode.id}
              title={mode.title}
              text={mode.text}
              onClick={() =>
                set({
                  runMode: mode.id,
                  brokerId: mode.id === "live" ? data.activeBrokerId || "dhan" : "paper",
                })
              }
            />
          ))}
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <label className="text-xs font-semibold text-slate-500">
            Strategy name
            <input className={fieldClass} value={form.name || ""} onChange={(event) => set({ name: event.target.value })} placeholder="My NIFTY VWAP" />
          </label>
          <label className="text-xs font-semibold text-slate-500">
            Underlying
            <select
              className={fieldClass}
              value={form.symbol || "NIFTY"}
              onChange={(event) => {
                const symbol = event.target.value;
                const nextLot = lotForSymbol(symbol);
                const nextLots = form.lots || 1;
                set({ symbol, lots: nextLots, lotSize: nextLot, qty: nextLots * nextLot });
              }}
            >
              {STRATEGY_SYMBOLS.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.id} · 1 lot = {row.lot} qty
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-semibold text-slate-500">
            Side
            <select className={fieldClass} value={form.side || "BUY"} onChange={(event) => set({ side: event.target.value as AlgoStrategy["side"] })}>
              <option value="BUY">BUY</option>
              <option value="SELL">SELL</option>
              <option value="BOTH">BOTH</option>
            </select>
          </label>
          <label className="text-xs font-semibold text-slate-500">
            Lots
            <input
              className={fieldClass}
              type="number"
              min={1}
              value={lots}
              onChange={(event) => {
                const nextLots = Math.max(1, Number(event.target.value) || 1);
                set({ lots: nextLots, lotSize, qty: nextLots * lotSize });
              }}
            />
            <span className="mt-1 block font-medium text-slate-400">
              1 lot = {lotSize} qty · order qty {lots * lotSize}
            </span>
          </label>
          <label className="text-xs font-semibold text-slate-500">
            Timeframe
            <select className={fieldClass} value={form.timeframe || "5m"} onChange={(event) => set({ timeframe: event.target.value })}>
              {TIMEFRAMES.map((row) => (
                <option key={row} value={row}>
                  {row}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-semibold text-slate-500">
            Broker
            <select
              className={fieldClass}
              value={form.runMode === "live" ? form.brokerId || "dhan" : "paper"}
              disabled={form.runMode !== "live"}
              onChange={(event) => set({ brokerId: event.target.value })}
            >
              {(form.runMode === "live" ? connected : connected.filter((item) => item.id === "paper" || item.id === "dhan")).map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
            {form.runMode !== "live" ? (
              <span className="mt-1 block font-medium text-slate-400">Paper uses live quotes. Fills are virtual — they never go to Dhan.</span>
            ) : null}
          </label>
        </div>

        {kind === "indicator" ? (
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <label className="text-xs font-semibold text-slate-500 md:col-span-2">
              Indicator
              <select
                className={fieldClass}
                value={form.indicator || "VWAP"}
                onChange={(event) => {
                  const indicator = event.target.value;
                  set({ indicator, ...defaultConditions("indicator", indicator, form.pattern) });
                }}
              >
                {INDICATORS.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.label}
                  </option>
                ))}
              </select>
            </label>
            {form.indicator === "RSI" ? <NumberField label="RSI period" value={form.period || 14} onChange={(period) => set({ period })} /> : null}
            {form.indicator === "EMA" ? (
              <>
                <NumberField label="Fast EMA" value={form.fast || 9} onChange={(fast) => set({ fast })} />
                <NumberField label="Slow EMA" value={form.slow || 21} onChange={(slow) => set({ slow })} />
              </>
            ) : null}
            {form.indicator === "SUPERTREND" ? (
              <>
                <NumberField label="ATR period" value={form.period || 10} onChange={(period) => set({ period })} />
                <NumberField label="Multiplier" value={form.multiplier || 3} onChange={(multiplier) => set({ multiplier })} />
              </>
            ) : null}
          </div>
        ) : (
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <label className="text-xs font-semibold text-slate-500 md:col-span-2">
              Price action
              <select
                className={fieldClass}
                value={form.pattern || "ORB"}
                onChange={(event) => {
                  const pattern = event.target.value;
                  set({ pattern, ...defaultConditions("price-action", form.indicator, pattern) });
                }}
              >
                {PATTERNS.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.label}
                  </option>
                ))}
              </select>
            </label>
            {form.pattern === "ORB" ? (
              <label className="text-xs font-semibold text-slate-500">
                Opening range
                <select className={fieldClass} value={form.rangeMinutes || 15} onChange={(event) => set({ rangeMinutes: Number(event.target.value) })}>
                  <option value={15}>First 15 minutes</option>
                  <option value={30}>First 30 minutes</option>
                  <option value={60}>First 60 minutes</option>
                </select>
              </label>
            ) : null}
            {form.pattern === "BREAKOUT" || form.pattern === "SR_BOUNCE" ? (
              <NumberField label="Lookback bars" value={form.lookback || 20} onChange={(lookback) => set({ lookback })} />
            ) : null}
          </div>
        )}

        <div className="mt-4 space-y-3">
          <ConditionRow
            label="BUY when"
            left={form.buyLeft || "price"}
            op={form.buyOp || "crosses_above"}
            right={form.buyRight || "vwap"}
            value={form.buyValue || 0}
            onChange={(patch) =>
              set({
                buyLeft: patch.left,
                buyOp: patch.op,
                buyRight: patch.right,
                buyValue: patch.value,
              })
            }
          />
          <ConditionRow
            label="SELL when"
            left={form.sellLeft || "price"}
            op={form.sellOp || "crosses_below"}
            right={form.sellRight || "vwap"}
            value={form.sellValue || 0}
            onChange={(patch) =>
              set({
                sellLeft: patch.left,
                sellOp: patch.op,
                sellRight: patch.right,
                sellValue: patch.value,
              })
            }
          />
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <NumberField label="Stop loss %" value={form.slPct || 0.4} step={0.05} onChange={(slPct) => set({ slPct })} />
          <NumberField label="Target %" value={form.targetPct || 0.8} step={0.05} onChange={(targetPct) => set({ targetPct })} />
        </div>

        {error ? <p className="mt-3 text-sm font-semibold text-down">{error}</p> : null}

        <div className="mt-5 flex gap-2">
          <button type="button" onClick={onClose} className="h-10 flex-1 rounded-xl border border-[var(--border)] text-sm font-semibold">
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void submit()}
            className="h-10 flex-1 rounded-xl bg-brand-500 text-sm font-semibold text-white disabled:opacity-60"
          >
            {busy ? "Saving..." : algo ? "Save changes" : "Add strategy"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ConditionRow({
  label,
  left,
  op,
  right,
  value,
  onChange,
}: {
  label: string;
  left: ConditionSource;
  op: ConditionOp;
  right: ConditionSource;
  value: number;
  onChange: (next: { left: ConditionSource; op: ConditionOp; right: ConditionSource; value: number }) => void;
}) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg)] p-3">
      <div className="mb-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</div>
      <div className="grid gap-2 md:grid-cols-4">
        <select
          className={fieldClass}
          value={left}
          onChange={(event) => onChange({ left: event.target.value as ConditionSource, op, right, value })}
        >
          {SOURCES.filter((row) => row.id !== "value").map((row) => (
            <option key={row.id} value={row.id}>
              {row.label}
            </option>
          ))}
        </select>
        <select className={fieldClass} value={op} onChange={(event) => onChange({ left, op: event.target.value as ConditionOp, right, value })}>
          {OPERATORS.map((row) => (
            <option key={row.id} value={row.id}>
              {row.label}
            </option>
          ))}
        </select>
        <select
          className={fieldClass}
          value={right}
          onChange={(event) => onChange({ left, op, right: event.target.value as ConditionSource, value })}
        >
          {SOURCES.map((row) => (
            <option key={row.id} value={row.id}>
              {row.label}
            </option>
          ))}
        </select>
        {right === "value" ? (
          <input
            className={fieldClass}
            type="number"
            value={value}
            onChange={(event) => onChange({ left, op, right, value: Number(event.target.value) })}
          />
        ) : (
          <div className="flex h-10 items-center text-xs font-semibold text-slate-400">vs {SOURCES.find((row) => row.id === right)?.label}</div>
        )}
      </div>
    </div>
  );
}

function TypeCard({ active, title, text, onClick }: { active: boolean; title: string; text: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-xl border px-3 py-3 text-left",
        active ? "border-brand-500 bg-brand-50/80 dark:bg-brand-500/10" : "border-[var(--border)] bg-[var(--bg)]",
      )}
    >
      <div className="text-sm font-bold">{title}</div>
      <div className="mt-1 text-[11px] text-slate-400">{text}</div>
    </button>
  );
}

function NumberField({
  label,
  value,
  onChange,
  step = 1,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  step?: number;
}) {
  return (
    <label className="text-xs font-semibold text-slate-500">
      {label}
      <input className={fieldClass} type="number" step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}
