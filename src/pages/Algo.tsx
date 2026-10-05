import { Activity, Pencil, Plus, Trash2, Users, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { updateAlgo, type ClientRow } from "../api/client";
import { loadClientList, peekClientList } from "../lib/clientsCache";
import { BacktestRange, BacktestRangeInline, type BacktestRangePayload } from "../components/dashboard/BacktestRange";
import { SignalFeed } from "../components/dashboard/SignalFeed";
import { StrategyBuilder } from "../components/dashboard/StrategyBuilder";
import { useMarket } from "../context/MarketContext";
import { catchDeskError } from "../lib/liveSite";
import { brokerName, defaultBrokers } from "../lib/brokers";
import { cn, formatInr, formatNumber } from "../lib/format";
import {
  contractLabel,
  isCrudeFirstCandleKind,
  isNiftyFirstCandleKind,
  niftyFirstCandleTrail,
  isNiftyTestKind,
  isNiftyVwapHedgeKind,
  isNiftyVwapKind,
  isNiftyVwapReversalKind,
  isRetiredDeskStrategy,
  sortDeskAlgos,
  type AlgoStrategy,
} from "../lib/strategies";

type DeskTab = "copy" | "tradingview";
type Filter = "all" | "nifty-first-candle" | "crudeoil";
type MappingScope = "master" | "clients" | "both";

function rupee(value: number) {
  const n = Number(value) || 0;
  const sign = n < 0 ? "-" : "";
  return `${sign}₹${formatNumber(Math.abs(n), 2)}`;
}

function moneyClass(value: number) {
  if (value > 0) return "text-up";
  if (value < 0) return "text-down";
  return "text-[var(--text)]";
}

function orderActivity(signal: string | undefined, fallback: string) {
  const text = String(signal || "").trim();
  if (!text || /^hold\b/i.test(text)) return fallback;
  return text;
}

function statusLabel(algo: AlgoStrategy) {
  if (algo.runMode === "backtest" || algo.status === "BACKTEST") return "RESEARCH";
  if (algo.enabled && algo.runMode === "paper") return "PAPER";
  if (algo.enabled || algo.status === "LIVE") return "LIVE";
  if (algo.status === "PAPER") return "PAPER";
  return "STOPPED";
}

function kindMeta(algo: AlgoStrategy) {
  if (isNiftyVwapHedgeKind(algo)) {
    return {
      kind: "nifty-vwap-hedge" as const,
      category: "SYSTEMATIC NIFTY HEDGE",
      config: "15m: O<VWAP C>VWAP → CE · O>VWAP C<VWAP → PE · weekly ATM · +40% / −20% hedge · +5% · daily LIVE 09:20 IST",
    };
  }
  if (isNiftyVwapReversalKind(algo)) {
    return {
      kind: "nifty-vwap-reversal" as const,
      category: "SYSTEMATIC NIFTY 15M",
      config: `Weekly ATM · 15m · SL ${algo.initialSlPct || 15}% / TGT ${algo.targetPct || 30}% · daily LIVE 09:20 IST`,
    };
  }
  if (isNiftyTestKind(algo)) {
    const liveSide = algo.enabled && (algo.lastSignal === "BUY" || algo.lastSignal === "SELL") ? algo.lastSignal : "";
    return {
      kind: "nifty-test" as const,
      category: "NIFTY TEST",
      config: `NIFTY FUT · ${algo.timeframe || "5m"} · live feed while started · above open BUY · below open SELL${liveSide ? ` · ${liveSide}` : " · no signal"}`,
    };
  }
  if (isCrudeFirstCandleKind(algo)) {
    const maxTrades = Math.max(1, Math.round(Number(algo.maxTradesPerDay) || 5));
    return {
      kind: "crude-first-candle" as const,
      category: `CRUDE OIL FIRST ${(algo.timeframe || "5m").toUpperCase()}`,
      config: `CRUDE FUT · ${algo.timeframe || "5m"} · monthly ATM · max ${maxTrades} trades/day · MCX until ${algo.endTimeIst || "23:15"} IST`,
    };
  }
  if (isNiftyFirstCandleKind(algo)) {
    const maxTrades = Number(algo.maxTradesPerDay) > 1 ? Number(algo.maxTradesPerDay) : 5;
    const trail = niftyFirstCandleTrail(algo);
    const tf = algo.timeframe || "5m";
    return {
      kind: "nifty-first-candle" as const,
      category: `SYSTEMATIC NIFTY FIRST ${tf.toUpperCase()}`,
      config: `NIFTY FUT · ${tf} · ${algo.expiryKind === "monthly" ? "Monthly" : "Weekly"} ${algo.strikeOffset ? `ATM${algo.strikeOffset > 0 ? "+" : ""}${algo.strikeOffset}` : "ATM"} · up to ${maxTrades} trades · SL ${algo.initialSlPct || 20}% / TGT ${algo.targetPct || 40}% · trailing SL +${trail.activation}% to buy, then +${trail.shift}% every +${trail.every}% · LIVE ${algo.dailyLiveIst || "09:00"} IST`,
    };
  }
  if (isNiftyVwapKind(algo)) {
    return {
      kind: "nifty-vwap" as const,
      category: "SYSTEMATIC NIFTY VWAP",
      config: `ATM options · 5m · SL ${algo.initialSlPct || 20}% / TGT ${algo.targetPct || 40}%`,
    };
  }
  if (algo.kind === "price-action") {
    return {
      kind: "price-action" as const,
      category: "SYSTEMATIC PRICE ACTION",
      config: `${algo.symbol || "NIFTY"} · ${algo.timeframe || "5m"} · ${algo.pattern || "ORB"}`,
    };
  }
  return {
    kind: "indicator" as const,
    category: "SYSTEMATIC INDICATOR",
    config: `${algo.symbol || "NIFTY"} · ${algo.timeframe || "5m"} · ${algo.indicator || "EMA"}`,
  };
}

export function Algo() {
  const { data, toggle, setAll, removeAlgo, backtest, closePosition, refresh } = useMarket();
  const [tab, setTab] = useState<DeskTab>("copy");
  const [filter, setFilter] = useState<Filter>("all");
  const [builderOpen, setBuilderOpen] = useState(false);
  const [editing, setEditing] = useState<AlgoStrategy | null>(null);
  const [busyId, setBusyId] = useState("");
  const [rangeId, setRangeId] = useState("");
  const [rangeError, setRangeError] = useState("");
  const [mapFor, setMapFor] = useState<AlgoStrategy | null>(null);
  const [knownClientIds, setKnownClientIds] = useState<Set<string> | null>(() => {
    const seeded = peekClientList()?.clients || [];
    return seeded.length ? new Set(seeded.map((row) => row.id)) : null;
  });
  useEffect(() => {
    let cancel = false;
    void loadClientList()
      .then((result) => {
        if (cancel) return;
        setKnownClientIds(new Set((result.clients || []).map((row) => row.id)));
      })
      .catch(() => undefined);
    return () => {
      cancel = true;
    };
  }, []);

  const deskAlgos = data.algos.filter((row) => !isRetiredDeskStrategy(row));
  const rangeFor = deskAlgos.find((item) => item.id === rangeId) || null;
  const canStartAll = deskAlgos.some((row) => row.runMode !== "backtest" && !row.enabled);
  const canStopAll = deskAlgos.some((row) => row.enabled);

  const rows = sortDeskAlgos(deskAlgos).filter((algo) => {
    if (filter === "all") return true;
    if (filter === "crudeoil") return String(algo.symbol || "").toUpperCase() === "CRUDEOIL" || isCrudeFirstCandleKind(algo);
    if (isCrudeFirstCandleKind(algo)) return false;
    return isNiftyFirstCandleKind(algo);
  }) as AlgoStrategy[];

  const openAdd = () => {
    setEditing(null);
    setBuilderOpen(true);
  };

  const remove = async (algo: AlgoStrategy) => {
    if (!window.confirm(`Delete ${algo.name}? This removes its orders, positions, and member plans on the admin desk and on user accounts.`)) return;
    await removeAlgo(algo.id);
  };

  const startOrPause = async (algo: AlgoStrategy) => {
    setBusyId(algo.id);
    try {
      await toggle(algo.id, !algo.enabled);
    } catch (err) {
      window.alert(catchDeskError(err, "Could not start"));
    } finally {
      setBusyId("");
    }
  };

  const startOrStopAll = async (enabled: boolean) => {
    setBusyId("all");
    try {
      await setAll(enabled);
    } catch (err) {
      window.alert(catchDeskError(err, enabled ? "Could not start strategies" : "Could not stop strategies"));
    } finally {
      setBusyId("");
    }
  };

  const exitStrategy = async (algo: AlgoStrategy) => {
    const open = (data.positions || []).filter((row) => row.strategy === algo.name);
    if (!open.length) {
      window.alert("No open positions for this strategy.");
      return;
    }
    if (!window.confirm(`Exit ${open.length} open position${open.length === 1 ? "" : "s"} for ${algo.name}?`)) return;
    setBusyId(`exit-${algo.id}`);
    try {
      for (const row of open) {
        await closePosition(row.id);
      }
      await refresh();
    } finally {
      setBusyId("");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <TabChip label="Copy Algos" on={tab === "copy"} onClick={() => setTab("copy")} />
        <TabChip label="TradingView Integration" on={tab === "tradingview"} onClick={() => setTab("tradingview")} />
      </div>

      {tab === "tradingview" ? (
        <section className="card p-8">
          <h1 className="text-xl font-bold">TradingView Integration</h1>
          <p className="mt-1 text-sm text-slate-400">
            Webhook alerts stay on this tab later. Copy Algos on this desk are unchanged. This does not start LIVE.
          </p>
        </section>
      ) : (
        <>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-xl font-bold">Algo</h1>
              <p className="text-sm text-slate-400">Signals, strategies, and live control in one workspace</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busyId === "all" || !canStartAll}
                onClick={() => void startOrStopAll(true)}
                className="h-10 rounded-xl border border-[var(--border)] px-4 text-sm font-semibold disabled:opacity-60"
              >
                Start all
              </button>
              <button
                type="button"
                disabled={busyId === "all" || !canStopAll}
                onClick={() => void startOrStopAll(false)}
                className="h-10 rounded-xl border border-[var(--border)] px-4 text-sm font-semibold disabled:opacity-60"
              >
                Stop all
              </button>
              <button type="button" onClick={openAdd} className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-brand-500 px-4 text-sm font-semibold text-white">
                <Plus size={16} />
                Add strategy
              </button>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["all", "All"],
                ["nifty-first-candle", "5m first candle"],
                ["crudeoil", "CRUDE OIL"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setFilter(id)}
                className={cn(
                  "rounded-full px-3 py-1.5 text-xs font-semibold",
                  filter === id ? "bg-slate-900 text-white dark:bg-white dark:text-slate-950" : "border border-[var(--border)] bg-[var(--card)]",
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <SignalFeed />
          {rows.length ? (
            <div className="flex flex-col gap-4">
              {rows.map((algo) => (
                <AlgoCard
                  key={algo.id}
                  algo={algo}
                  orders={(data.orders || []).filter((row) => row.strategy === algo.name)}
                  clientIds={knownClientIds}
                  positions={(data.positions || []).filter((row) => row.strategy === algo.name)}
                  busy={busyId === algo.id || busyId === `exit-${algo.id}` || busyId === "all"}
                  rangeOpen={rangeId === algo.id}
                  rangeError={rangeId === algo.id ? rangeError : ""}
                  onEdit={() => {
                    setEditing(algo);
                    setBuilderOpen(true);
                  }}
                  onMap={() => setMapFor(algo)}
                  onBacktest={() => {
                    setRangeError("");
                    setRangeId(algo.id);
                  }}
                  onCancelRange={() => {
                    if (busyId) return;
                    setRangeId("");
                    setRangeError("");
                  }}
                  onRunBacktest={(payload) => {
                    setBusyId(algo.id);
                    setRangeError("");
                    void backtest(algo.id, payload)
                      .then(() => setRangeId(""))
                      .catch((err: unknown) => setRangeError(catchDeskError(err, "Backtest failed")))
                      .finally(() => setBusyId(""));
                  }}
                  onStart={() => void startOrPause(algo)}
                  onExit={() => void exitStrategy(algo)}
                  onDelete={() => void remove(algo)}
                />
              ))}
            </div>
          ) : (
            <section className="card p-8 text-center">
              <div className="text-base font-bold">No strategies in this view</div>
              <p className="mt-1 text-sm text-slate-400">Add a NIFTY 5m or CRUDE OIL strategy to start the desk.</p>
              <button type="button" onClick={openAdd} className="mt-4 h-10 rounded-xl bg-brand-500 px-4 text-sm font-semibold text-white">
                Add strategy
              </button>
            </section>
          )}
        </>
      )}

      <StrategyBuilder
        open={builderOpen}
        algo={editing}
        onClose={() => {
          setBuilderOpen(false);
          setEditing(null);
        }}
      />
      <BacktestRange
        open={Boolean(rangeFor)}
        name={rangeFor?.name}
        busy={Boolean(rangeFor && busyId === rangeFor.id)}
        error={rangeError}
        onClose={() => {
          if (busyId) return;
          setRangeId("");
          setRangeError("");
        }}
        onRun={(payload: BacktestRangePayload) => {
          if (!rangeFor) return;
          setBusyId(rangeFor.id);
          setRangeError("");
          void backtest(rangeFor.id, payload)
            .then(() => setRangeId(""))
            .catch((err: unknown) => setRangeError(catchDeskError(err, "Backtest failed")))
            .finally(() => setBusyId(""));
        }}
      />
      {mapFor ? (
        <MapClientsModal
          algo={mapFor}
          onClose={() => setMapFor(null)}
          onSaved={() => setMapFor(null)}
        />
      ) : null}
    </div>
  );
}

function CrudeMaxTrades({ algo }: { algo: AlgoStrategy }) {
  const { refresh } = useMarket();
  const saved = Math.max(1, Math.round(Number(algo.maxTradesPerDay) || 5));
  const [value, setValue] = useState(String(saved));
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    setValue(String(saved));
  }, [algo.id, saved]);

  const save = async () => {
    const next = Math.max(1, Math.min(20, Math.round(Number(value) || saved)));
    setValue(String(next));
    if (next === saved) return;
    setSaving(true);
    try {
      await updateAlgo(algo.id, { maxTradesPerDay: next });
      await refresh();
    } catch (err) {
      window.alert(catchDeskError(err, "Could not save max trades"));
      setValue(String(saved));
    } finally {
      setSaving(false);
    }
  };

  return (
    <label className="mt-2 flex w-full flex-wrap items-center gap-2 text-sm font-bold text-[var(--text)]" data-trade-limit="crude">
      Trade limit
      <input
        type="number"
        min={1}
        max={20}
        inputMode="numeric"
        aria-label="Trade limit"
        className="h-10 w-24 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 text-sm font-bold text-[var(--text)]"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onBlur={() => void save()}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            void save();
          }
        }}
      />
      <span className="font-medium text-slate-400">{saving ? "Saving..." : "Change this number. One signal places one order."}</span>
    </label>
  );
}

function brokerFilledOrder(row: { status?: string; filledQty?: number }) {
  const status = String(row.status || "").toUpperCase();
  if (Number(row.filledQty || 0) > 0) return true;
  return status === "FILLED" || status === "TRADED";
}

function AlgoCard({
  algo,
  clientIds,
  orders,
  positions,
  busy,
  rangeOpen,
  rangeError,
  onEdit,
  onMap,
  onBacktest,
  onCancelRange,
  onRunBacktest,
  onStart,
  onExit,
  onDelete,
}: {
  algo: AlgoStrategy;
  clientIds: Set<string> | null;
  orders: Array<{ id: string; status?: string; filledQty?: number }>;
  positions: Array<{ type?: string; pnl?: number; live?: boolean; brokerId?: string }>;
  busy: boolean;
  rangeOpen: boolean;
  rangeError: string;
  onEdit: () => void;
  onMap: () => void;
  onBacktest: () => void;
  onCancelRange: () => void;
  onRunBacktest: (payload: BacktestRangePayload) => void;
  onStart: () => void;
  onExit: () => void;
  onDelete: () => void;
}) {
  const meta = kindMeta(algo);
  const liveMtm = positions.reduce((sum, row) => sum + Number(row.pnl || 0), 0);
  const mappedIds = algo.mappedClientIds || [];
  const mapped = clientIds ? mappedIds.filter((id) => clientIds.has(id)).length : mappedIds.length;
  const brokerMtm = positions.some((row) => row.live || row.brokerId === "dhan");
  const positionLabel = !positions.length
    ? "FLAT"
    : positions.every((row) => row.type === "SELL")
      ? "SHORT"
      : positions.every((row) => row.type !== "SELL")
        ? "LONG"
        : "MIXED";
  const filledOrders = orders.filter(brokerFilledOrder);
  const trades = Number(algo.lastBacktest?.trades || 0);
  const winRate = Number(algo.lastBacktest?.winRate ?? algo.winRate ?? 0);
  const drawdown = Number(algo.lastBacktest?.maxDrawdown || 0);
  const bookPnl = Number(algo.lastBacktest?.pnl ?? algo.pnl ?? 0);
  const activity = isNiftyVwapHedgeKind(algo)
    ? orderActivity(algo.enabled ? algo.lastSignal : "", algo.trade?.hint || "15m: O<VWAP C>VWAP → BUY CE · O>VWAP C<VWAP → BUY PE")
    : isNiftyTestKind(algo)
      ? algo.enabled && (algo.lastSignal === "BUY" || algo.lastSignal === "SELL")
        ? algo.lastSignal
        : "No signal"
    : isCrudeFirstCandleKind(algo) || isNiftyFirstCandleKind(algo)
      ? orderActivity(algo.lastSignal, "Waiting for the next signal")
      : orderActivity(algo.enabled ? algo.lastSignal : "", "Waiting for the next signal");
  const status = statusLabel(algo);
  const contract = algo.instrument === "option" ? algo.trade?.label || contractLabel(algo) : `${algo.symbol || "NIFTY"} FUT`;

  return (
    <section className="card flex w-full flex-col p-4" data-strategy-card={algo.id}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--bg)] text-slate-400">
            <Activity size={16} />
          </div>
          <div className="min-w-0">
            <h2 className="truncate text-lg font-bold">{algo.name}</h2>
            {isCrudeFirstCandleKind(algo) ? <CrudeMaxTrades algo={algo} /> : null}
            <div className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{meta.category}</div>
            <div className="mt-2 text-sm text-slate-400">{meta.config}</div>
            {algo.runMode === "live" ? (
              <div className="mt-1 text-[11px] font-semibold text-slate-500">
                Live broker: {brokerName(defaultBrokers, algo.brokerId || "dhan")}
              </div>
            ) : null}
            <div className="mt-1 text-[11px] text-slate-500">{contract}</div>
            {isNiftyVwapHedgeKind(algo) && algo.trade?.hint && algo.trade.hint !== contract ? (
              <div className="mt-0.5 text-[11px] leading-snug text-slate-400">{algo.trade.hint}</div>
            ) : null}
          </div>
        </div>
        <span
          className={cn(
            "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold",
            status === "LIVE"
              ? "bg-emerald-50 text-up dark:bg-emerald-950/40"
              : status === "PAPER"
                ? "bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300"
                : "bg-[var(--bg)] text-slate-400",
          )}
        >
          {status}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric label="Live MTM" value={rupee(liveMtm)} tone={moneyClass(liveMtm)} hint={positions.length ? `${brokerMtm ? "Dhan · " : ""}${positions.length} open` : "No open position"} />
        <Metric label="Total orders" value={String(filledOrders.length)} hint={filledOrders.length ? "Filled at the broker" : "No filled orders"} />
        <Metric label="Mapped clients" value={String(mapped)} hint={mapped ? "Eligible copy accounts" : "No accounts"} />
        <Metric label="Position" value={positionLabel} hint={positions.length ? `${positions.length} open` : "No exposure"} />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric label="P&L" value={formatInr(bookPnl)} tone={moneyClass(bookPnl)} />
        <Metric label="Trades" value={String(trades)} />
        <Metric label="Win rate" value={`${formatNumber(winRate, 1)}%`} />
        <Metric label="Drawdown" value={rupee(drawdown)} tone={moneyClass(-Math.abs(drawdown))} />
      </div>

      <div className="mt-4 text-xs text-slate-400">
        <span className="font-bold uppercase tracking-[0.12em] text-slate-500">Latest activity</span>
        <div className="mt-1">{activity}</div>
        {algo.lastBacktest?.timeframe || algo.lastBacktest?.optionSource ? (
          <div className="mt-1 text-[11px] text-slate-500">
            {algo.lastBacktest.timeframe ? `Replay ${algo.lastBacktest.timeframe}` : ""}
            {algo.lastBacktest.reused ? " · reused stored Dhan history" : ""}
            {algo.lastBacktest.optionSource
              ? `${algo.lastBacktest.timeframe ? " · " : ""}option premiums: ${
                  algo.lastBacktest.optionSource === "stored"
                    ? "stored Dhan history"
                    : algo.lastBacktest.optionSource === "mixed"
                      ? "stored Dhan history + synth gaps"
                      : "synthesized from index"
                }`
              : ""}
            {algo.lastBacktest.optionHistory?.overwritten?.length
              ? ` · replaced ${algo.lastBacktest.optionHistory.overwritten.length} day${algo.lastBacktest.optionHistory.overwritten.length === 1 ? "" : "s"}`
              : ""}
          </div>
        ) : null}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button type="button" onClick={onEdit} className="inline-flex h-9 items-center gap-1 rounded-full border border-[var(--border)] px-3 text-xs font-semibold">
          <Pencil size={12} />
          Edit
        </button>
        <button type="button" onClick={onBacktest} className="h-9 rounded-full border border-[var(--border)] px-3 text-xs font-semibold">
          {busy && rangeOpen ? "Testing..." : "Backtest"}
        </button>
        <button type="button" onClick={onDelete} className="inline-flex h-9 items-center gap-1 rounded-full border border-rose-200 px-3 text-xs font-semibold text-down dark:border-rose-900">
          <Trash2 size={12} />
          Delete
        </button>
      </div>

      {rangeOpen ? (
        <div className="mt-3">
          <BacktestRangeInline busy={busy} error={rangeError} onCancel={onCancelRange} onRun={onRunBacktest} />
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border)] pt-3">
        <button type="button" onClick={onMap} className="inline-flex h-10 items-center gap-1.5 text-sm font-semibold">
          <Users size={15} />
          Map clients
        </button>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={busy} onClick={onExit} className="h-10 rounded-xl px-3 text-sm font-semibold text-down disabled:opacity-60">
            Exit position
          </button>
          {algo.runMode === "backtest" ? (
            <button type="button" disabled className="h-10 rounded-xl bg-slate-200 px-4 text-sm font-semibold text-slate-500 dark:bg-slate-800">
              Research only
            </button>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={onStart}
              className="h-10 rounded-xl bg-brand-500 px-4 text-sm font-semibold text-white disabled:opacity-60"
            >
              {algo.enabled ? "Stop strategy" : "Start strategy"}
            </button>
          )}
        </div>
      </div>
      {isNiftyVwapHedgeKind(algo) || isNiftyVwapReversalKind(algo) ? (
        <div className="mt-2 text-[11px] text-slate-500">
          Saving or mapping clients does not start LIVE. LIVE arms automatically at 09:20 IST on session days.
        </div>
      ) : null}
    </section>
  );
}

function MapClientsModal({ algo, onClose, onSaved }: { algo: AlgoStrategy; onClose: () => void; onSaved: () => void }) {
  const { refresh } = useMarket();
  const seeded = peekClientList();
  const [clients, setClients] = useState<ClientRow[]>(seeded?.clients || []);
  const [scope, setScope] = useState<MappingScope>(algo.mappingScope || "both");
  const [picked, setPicked] = useState<string[]>(algo.mappedClientIds || []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(Boolean(seeded?.clients.length));

  const load = useCallback(async () => {
    try {
      const result = await loadClientList(true);
      setClients(result.clients || []);
      setError("");
    } catch (err) {
      setError(catchDeskError(err, "Could not load clients"));
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!loaded) return;
    const live = new Set(clients.map((row) => row.id));
    setPicked((current) => current.filter((id) => live.has(id)));
  }, [loaded, clients]);

  const toggleId = (id: string) => {
    setPicked((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  };

  const save = async () => {
    setBusy(true);
    setError("");
    try {
      await updateAlgo(algo.id, { mappedClientIds: picked, mappingScope: scope });
      await refresh();
      onSaved();
    } catch (err) {
      setError(catchDeskError(err, "Could not save mapping"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-slate-950/50 p-3 md:items-center">
      <button type="button" className="absolute inset-0" aria-label="Close" onClick={onClose} />
      <div className="relative z-10 flex max-h-[88dvh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] p-3 shadow-xl">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-bold">Map clients · {algo.name}</h2>
          <button type="button" className="text-slate-400" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto">
          <section className="overflow-hidden rounded-xl border border-[var(--border)]">
            <div className="bg-[var(--bg)] px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">Scope</div>
            <label className="flex items-center gap-3 border-t border-[var(--border)] px-3 py-1.5">
              <span className="w-[6.25rem] shrink-0 text-xs text-slate-500">Mapping</span>
              <select
                className="h-8 min-w-0 flex-1 rounded-md border border-[var(--border)] bg-[var(--bg)] px-2.5 text-[13px] font-semibold"
                value={scope}
                onChange={(event) => setScope(event.target.value as MappingScope)}
              >
                <option value="both">Master + selected clients</option>
                <option value="master">Master only</option>
                <option value="clients">Selected clients only</option>
              </select>
            </label>
            <div className="bg-[var(--bg)] px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">Clients</div>
            {clients.map((row) => {
              const checked = picked.includes(row.id);
              return (
                <label
                  key={row.id}
                  className="flex cursor-pointer items-center gap-2 border-t border-[var(--border)] px-3 py-1.5"
                >
                  <input type="checkbox" checked={checked} onChange={() => toggleId(row.id)} />
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-sky-600 text-[10px] font-bold text-white">
                    {(row.name || "?").trim().charAt(0).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold">{row.name}</span>
                    <span className="block text-[11px] text-slate-400">
                      {row.brokerName} · {row.linked || row.tradeMode === "real" ? "Active" : "Paper"}
                    </span>
                  </span>
                </label>
              );
            })}
            {!clients.length ? (
              <p className="border-t border-[var(--border)] px-3 py-4 text-center text-xs text-slate-400">
                {loaded ? "No clients yet. Add one on Users first." : "Loading…"}
              </p>
            ) : null}
          </section>
          {error ? <p className="mt-2 text-xs font-semibold text-down">{error}</p> : null}
        </div>
        <div className="mt-2 flex gap-2">
          <button type="button" onClick={onClose} className="h-8 flex-1 rounded-md border border-[var(--border)] text-sm font-semibold">
            Cancel
          </button>
          <button type="button" disabled={busy} onClick={() => void save()} className="h-8 flex-1 rounded-md bg-brand-500 text-sm font-semibold text-white disabled:opacity-60">
            {busy ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

function TabChip({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "h-9 rounded-full px-3 text-xs font-semibold",
        on ? "bg-slate-900 text-white dark:bg-white dark:text-slate-950" : "border border-[var(--border)] bg-[var(--card)] text-slate-500",
      )}
    >
      {label}
    </button>
  );
}

function Metric({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: string }) {
  return (
    <div>
      <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">{label}</div>
      <div className={cn("mt-1 text-sm font-bold", tone)}>{value}</div>
      {hint ? <div className="text-[10px] text-slate-500">{hint}</div> : null}
    </div>
  );
}
