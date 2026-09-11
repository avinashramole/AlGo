import { Activity, Pencil, Plus, Trash2, Users, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { updateAlgo, type ClientRow } from "../api/client";
import { loadClientList, peekClientList } from "../lib/clientsCache";
import { BacktestRange, BacktestRangeInline, type BacktestRangePayload } from "../components/dashboard/BacktestRange";
import { StrategyBuilder } from "../components/dashboard/StrategyBuilder";
import { useMarket } from "../context/MarketContext";
import { brokerName, defaultBrokers } from "../lib/brokers";
import { cn, formatInr, formatNumber } from "../lib/format";
import {
  contractLabel,
  isNiftyOptionEngineKind,
  isNiftyVwapHedgeKind,
  isNiftyVwapKind,
  isNiftyVwapReversalKind,
  type AlgoStrategy,
} from "../lib/strategies";

type DeskTab = "copy" | "tradingview";
type Filter = "all" | "indicator" | "price-action" | "nifty-vwap" | "nifty-vwap-reversal" | "nifty-vwap-hedge";
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

function statusLabel(algo: AlgoStrategy) {
  if (algo.status === "LIVE") return "LIVE";
  if (algo.status === "PAPER") return "PAPER";
  if (algo.status === "BACKTEST") return "RESEARCH";
  return "STOPPED";
}

function kindMeta(algo: AlgoStrategy) {
  if (isNiftyVwapHedgeKind(algo)) {
    return {
      kind: "nifty-vwap-hedge" as const,
      category: "SYSTEMATIC NIFTY HEDGE",
      config: "15m: O<VWAP C>VWAP → CE · O>VWAP C<VWAP → PE · weekly ATM · +40% / −20% hedge · +5% · daily LIVE 09:30 IST",
    };
  }
  if (isNiftyVwapReversalKind(algo)) {
    return {
      kind: "nifty-vwap-reversal" as const,
      category: "SYSTEMATIC NIFTY 15M",
      config: `Weekly ATM · 15m · SL ${algo.initialSlPct || 15}% / TGT ${algo.targetPct || 30}%`,
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
  const { data, toggle, removeAlgo, backtest, closePosition, refresh } = useMarket();
  const [tab, setTab] = useState<DeskTab>("copy");
  const [filter, setFilter] = useState<Filter>("all");
  const [builderOpen, setBuilderOpen] = useState(false);
  const [editing, setEditing] = useState<AlgoStrategy | null>(null);
  const [busyId, setBusyId] = useState("");
  const [rangeId, setRangeId] = useState("");
  const [rangeError, setRangeError] = useState("");
  const [mapFor, setMapFor] = useState<AlgoStrategy | null>(null);
  const rangeFor = data.algos.find((item) => item.id === rangeId) || null;

  const rows = data.algos.filter((algo) => {
    if (filter === "all") return true;
    if (filter === "nifty-vwap") return isNiftyVwapKind(algo);
    if (filter === "nifty-vwap-reversal") return isNiftyVwapReversalKind(algo);
    if (filter === "nifty-vwap-hedge") return isNiftyVwapHedgeKind(algo);
    return (algo.kind || (algo.tag === "Price action" ? "price-action" : "indicator")) === filter;
  }) as AlgoStrategy[];

  const openAdd = () => {
    setEditing(null);
    setBuilderOpen(true);
  };

  const remove = async (algo: AlgoStrategy) => {
    if (!window.confirm(`Delete ${algo.name}?`)) return;
    await removeAlgo(algo.id);
  };

  const startOrPause = async (algo: AlgoStrategy) => {
    try {
      await toggle(algo.id);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Could not start");
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
              <h1 className="text-xl font-bold">Algo trading</h1>
              <p className="text-sm text-slate-400">Create, monitor and control automated trading strategies from one workspace</p>
            </div>
            <button type="button" onClick={openAdd} className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-brand-500 px-4 text-sm font-semibold text-white">
              <Plus size={16} />
              Add strategy
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["all", "All"],
                ["indicator", "Indicator based"],
                ["price-action", "Price action based"],
                ["nifty-vwap", "NIFTY VWAP ATM"],
                ["nifty-vwap-reversal", "15m VWAP reversal"],
                ["nifty-vwap-hedge", "15m VWAP hedge"],
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
          {rows.length ? (
            <div className="grid gap-3 xl:grid-cols-2">
              {rows.map((algo) => (
                <AlgoCard
                  key={algo.id}
                  algo={algo}
                  orders={(data.orders || []).filter((row) => row.strategy === algo.name)}
                  positions={(data.positions || []).filter((row) => row.strategy === algo.name)}
                  busy={busyId === algo.id || busyId === `exit-${algo.id}`}
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
                      .catch((err: unknown) => setRangeError(err instanceof Error ? err.message : "Backtest failed"))
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
              <p className="mt-1 text-sm text-slate-400">Add an indicator, price-action, or NIFTY VWAP strategy to start the desk.</p>
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
            .catch((err: unknown) => setRangeError(err instanceof Error ? err.message : "Backtest failed"))
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

function AlgoCard({
  algo,
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
  orders: Array<{ id: string }>;
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
  const mapped = (algo.mappedClientIds || []).length;
  const brokerMtm = positions.some((row) => row.live || row.brokerId === "dhan");
  const positionLabel = !positions.length
    ? "FLAT"
    : positions.every((row) => row.type === "SELL")
      ? "SHORT"
      : positions.every((row) => row.type !== "SELL")
        ? "LONG"
        : "MIXED";
  const trades = Number(algo.lastBacktest?.trades || 0);
  const winRate = Number(algo.lastBacktest?.winRate ?? algo.winRate ?? 0);
  const drawdown = Number(algo.lastBacktest?.maxDrawdown || 0);
  const bookPnl = Number(algo.lastBacktest?.pnl ?? algo.pnl ?? 0);
  const activity = isNiftyVwapHedgeKind(algo)
    ? algo.enabled && algo.lastSignal
      ? algo.lastSignal
      : algo.trade?.hint || "15m: O<VWAP C>VWAP → BUY CE · O>VWAP C<VWAP → BUY PE"
    : algo.lastSignal && algo.enabled
      ? algo.lastSignal
      : "Waiting for the next signal";
  const status = statusLabel(algo);
  const contract = algo.instrument === "option" ? algo.trade?.label || contractLabel(algo) : `${algo.symbol || "NIFTY"} FUT`;

  return (
    <section className="card flex flex-col p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--bg)] text-slate-400">
            <Activity size={16} />
          </div>
          <div className="min-w-0">
            <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">{meta.category}</div>
            <div className="truncate text-base font-bold">{algo.name}</div>
            <div className="text-xs text-slate-400">{meta.config}</div>
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
        <Metric label="Total orders" value={String(orders.length)} hint={orders.length ? "Desk orders" : "No orders"} />
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
      {isNiftyOptionEngineKind(algo) ? (
        <div className="mt-2 text-[11px] text-slate-500">
          Saving or mapping clients does not start LIVE.
          {isNiftyVwapHedgeKind(algo) ? " Hedge arms automatically at 09:30 IST on session days." : ""}
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
      setError(err instanceof Error ? err.message : "Could not load clients");
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

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
      setError(err instanceof Error ? err.message : "Could not save mapping");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-slate-950/60 p-3 md:items-center">
      <button type="button" className="absolute inset-0" aria-label="Close" onClick={onClose} />
      <div className="relative z-10 flex max-h-[88dvh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-xl">
        <div className="flex items-center justify-between px-5 py-4">
          <h2 className="text-base font-bold">Map clients to strategy</h2>
          <button type="button" className="text-slate-400" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="min-h-0 flex-1 space-y-4 overflow-auto px-5 pb-4">
          <div className="flex items-center gap-3 rounded-xl bg-[var(--bg)] px-4 py-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--card)] text-slate-400">
              <Users size={16} />
            </div>
            <div>
              <div className="text-sm font-bold">{algo.name}</div>
              <div className="text-xs text-slate-400">Choose where this strategy will execute</div>
            </div>
          </div>
          <label className="grid gap-1 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
            Mapping scope
            <select
              className="h-11 rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 text-sm font-semibold normal-case tracking-normal text-[var(--text)]"
              value={scope}
              onChange={(event) => setScope(event.target.value as MappingScope)}
            >
              <option value="both">Master + selected clients</option>
              <option value="master">Master only</option>
              <option value="clients">Selected clients only</option>
            </select>
          </label>
          <div className="space-y-2">
            {clients.map((row) => {
              const checked = picked.includes(row.id);
              return (
                <label
                  key={row.id}
                  className="flex cursor-pointer items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5"
                >
                  <input type="checkbox" checked={checked} onChange={() => toggleId(row.id)} />
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-sky-600 text-xs font-bold text-white">
                    {(row.name || "?").trim().charAt(0).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold">{row.name}</span>
                    <span className="block text-[11px] text-slate-400">
                      {row.brokerName} · {row.linked || row.tradeMode === "real" ? "Active account" : "Paper account"}
                    </span>
                  </span>
                </label>
              );
            })}
            {!clients.length ? (
              <p className="py-6 text-center text-sm text-slate-400">
                {loaded ? "No clients yet. Add one on All clients first." : "Loading clients…"}
              </p>
            ) : null}
          </div>
          {error ? <p className="text-xs font-semibold text-down">{error}</p> : null}
        </div>
        <div className="flex justify-end gap-2 border-t border-[var(--border)] px-5 py-4">
          <button type="button" onClick={onClose} className="h-10 rounded-xl px-4 text-sm font-semibold">
            Cancel
          </button>
          <button type="button" disabled={busy} onClick={() => void save()} className="h-10 rounded-xl bg-brand-500 px-4 text-sm font-semibold text-white disabled:opacity-60">
            {busy ? "Saving..." : "Save mapping"}
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
