import { Pencil, Plus, Trash2 } from "lucide-react";
import { type ReactNode, useState } from "react";
import { BacktestRange, type BacktestRangePayload } from "../components/dashboard/BacktestRange";
import { StrategyBuilder } from "../components/dashboard/StrategyBuilder";
import { useMarket } from "../context/MarketContext";
import { brokerName } from "../lib/brokers";
import { cn, formatInr } from "../lib/format";
import { formatCondition, lotForSymbol, type AlgoStrategy } from "../lib/strategies";

function backtestRangeLabel(row?: AlgoStrategy["lastBacktest"]) {
  if (!row) return "";
  if (row.from && row.to) {
    const prefix = row.range === "1y" ? "Last 1 year" : "Custom";
    return `${prefix} ${row.from} → ${row.to}`;
  }
  return row.range === "1y" ? "Last 1 year" : "";
}

export function Algo() {
  const { data, toggle, routeAlgo, removeAlgo, backtest } = useMarket();
  const [filter, setFilter] = useState<"all" | "indicator" | "price-action">("all");
  const [builderOpen, setBuilderOpen] = useState(false);
  const [editing, setEditing] = useState<AlgoStrategy | null>(null);
  const [busyId, setBusyId] = useState("");
  const [rangeFor, setRangeFor] = useState<AlgoStrategy | null>(null);
  const [rangeError, setRangeError] = useState("");
  const connected = (data.brokers || []).filter((item) => item.connected);

  const rows = data.algos.filter((algo) => {
    if (filter === "all") return true;
    return (algo.kind || (algo.tag === "Price action" ? "price-action" : "indicator")) === filter;
  });

  const openAdd = () => {
    setEditing(null);
    setBuilderOpen(true);
  };

  const openEdit = (algo: AlgoStrategy) => {
    setEditing(algo);
    setBuilderOpen(true);
  };

  const remove = async (algo: AlgoStrategy) => {
    if (!window.confirm(`Delete ${algo.name}?`)) return;
    await removeAlgo(algo.id);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Algo Desk</h1>
          <p className="text-sm text-slate-400">
            Paper trade or backtest a strategy first. Backtest last 1 year or custom dates. Live Dhan is only for strategies set to Live.
          </p>
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
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setFilter(id)}
            className={cn(
              "rounded-lg px-3 py-1.5 text-xs font-semibold",
              filter === id ? "bg-brand-500 text-white" : "border border-[var(--border)] bg-[var(--card)]",
            )}
          >
            {label}
          </button>
        ))}
      </div>
      {rows.length ? (
        <div className="grid gap-3 lg:grid-cols-3">
          {rows.map((algo) => {
            const kind = algo.kind || (algo.tag === "Price action" ? "price-action" : "indicator");
            return (
              <section key={algo.id} className="card p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-base font-bold">{algo.name}</div>
                    <div className="text-xs text-slate-400">{algo.summary || algo.tag}</div>
                  </div>
                  <span
                    className={cn(
                      "rounded px-1.5 py-0.5 text-[10px] font-bold",
                      algo.status === "LIVE"
                        ? "bg-emerald-50 text-up dark:bg-emerald-950/40"
                        : algo.status === "PAPER"
                          ? "bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300"
                          : algo.status === "BACKTEST"
                            ? "bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300"
                            : "bg-amber-50 text-amber-600 dark:bg-amber-950/40",
                    )}
                  >
                    {algo.status}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <Badge>{kind === "indicator" ? "Indicator" : "Price action"}</Badge>
                  <Badge>{algo.runMode === "live" ? "Live Dhan" : algo.runMode === "backtest" ? "Backtest" : "Paper"}</Badge>
                  <Badge>{algo.symbol || "NIFTY"}</Badge>
                  <Badge>
                    {algo.lots || 1} lot × {algo.lotSize || lotForSymbol(algo.symbol)} = {algo.qty || (algo.lots || 1) * lotForSymbol(algo.symbol)} qty
                  </Badge>
                  <Badge>{algo.timeframe || "5m"}</Badge>
                  <Badge>{algo.side || "BUY"}</Badge>
                </div>
                <div className="mt-2 space-y-1 text-[11px] font-semibold text-slate-500">
                  <div>BUY when {formatCondition(algo.buyLeft, algo.buyOp, algo.buyRight, algo.buyValue)}</div>
                  <div>SELL when {formatCondition(algo.sellLeft, algo.sellOp, algo.sellRight, algo.sellValue)}</div>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div className="rounded-lg bg-[var(--bg)] p-3">
                    <div className="text-[10px] uppercase text-slate-400">PnL</div>
                    <div className={cn("text-lg font-bold", algo.pnl >= 0 ? "text-up" : "text-down")}>{formatInr(algo.pnl)}</div>
                  </div>
                  <div className="rounded-lg bg-[var(--bg)] p-3">
                    <div className="text-[10px] uppercase text-slate-400">Win rate</div>
                    <div className="text-lg font-bold">{algo.winRate}%</div>
                  </div>
                </div>
                {algo.lastBacktest ? (
                  <div className="mt-3 rounded-lg border border-[var(--border)] bg-[var(--bg)] p-3 text-[11px] font-semibold text-slate-500">
                    Last backtest
                    {backtestRangeLabel(algo.lastBacktest) ? ` · ${backtestRangeLabel(algo.lastBacktest)}` : ""}
                    {" · "}
                    {algo.lastBacktest.timeframe || algo.timeframe || "5m"} · {algo.lastBacktest.bars || 0} bars · {algo.lastBacktest.trades} trades · WR {algo.lastBacktest.winRate}% ·{" "}
                    <span className={(algo.lastBacktest.pnl || 0) >= 0 ? "text-up" : "text-down"}>{formatInr(algo.lastBacktest.pnl || 0)}</span>
                    {algo.lastBacktest.sample ? " · sample bars" : ""} · DD {formatInr(algo.lastBacktest.maxDrawdown || 0)}
                  </div>
                ) : null}
                <label className="mt-3 block text-[10px] font-semibold uppercase text-slate-400">
                  Route to broker
                  <select
                    className="mt-1 h-9 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2 text-sm font-semibold"
                    value={algo.brokerId || "dhan"}
                    onChange={(event) => void routeAlgo(algo.id, event.target.value)}
                  >
                    {connected.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <button type="button" onClick={() => openEdit(algo as AlgoStrategy)} className="inline-flex h-10 items-center justify-center gap-1 rounded-xl border border-[var(--border)] text-xs font-semibold">
                    <Pencil size={13} />
                    Edit
                  </button>
                  <button
                    type="button"
                    disabled={busyId === algo.id}
                    onClick={() => {
                      setRangeError("");
                      setRangeFor(algo as AlgoStrategy);
                    }}
                    className="h-10 rounded-xl border border-[var(--border)] text-xs font-semibold"
                  >
                    {busyId === algo.id ? "Testing..." : "Backtest"}
                  </button>
                  {algo.runMode === "backtest" ? (
                    <button type="button" disabled className="h-10 rounded-xl border border-[var(--border)] text-xs font-semibold text-slate-400">
                      Research only
                    </button>
                  ) : (
                    <button type="button" onClick={() => void toggle(algo.id)} className="h-10 rounded-xl border border-[var(--border)] text-xs font-semibold">
                      {algo.enabled ? "Pause" : algo.runMode === "paper" ? "Start paper" : "Start live"}
                    </button>
                  )}
                  <button type="button" onClick={() => void remove(algo as AlgoStrategy)} className="inline-flex h-10 items-center justify-center gap-1 rounded-xl border border-rose-200 text-xs font-semibold text-down dark:border-rose-900">
                    <Trash2 size={13} />
                    Delete
                  </button>
                </div>
                <div className="mt-2 text-[11px] text-slate-400">Broker {brokerName(data.brokers, algo.brokerId)} · SL {algo.slPct || 0.4}% · Target {algo.targetPct || 0.8}%</div>
              </section>
            );
          })}
        </div>
      ) : (
        <section className="card p-8 text-center">
          <div className="text-base font-bold">No strategies in this view</div>
          <p className="mt-1 text-sm text-slate-400">Add an indicator or price-action strategy to start the desk.</p>
          <button type="button" onClick={openAdd} className="mt-4 h-10 rounded-xl bg-brand-500 px-4 text-sm font-semibold text-white">
            Add strategy
          </button>
        </section>
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
          setRangeFor(null);
          setRangeError("");
        }}
        onRun={(payload: BacktestRangePayload) => {
          if (!rangeFor) return;
          setBusyId(rangeFor.id);
          setRangeError("");
          void backtest(rangeFor.id, payload)
            .then(() => {
              setRangeFor(null);
            })
            .catch((err: unknown) => {
              setRangeError(err instanceof Error ? err.message : "Backtest failed");
            })
            .finally(() => setBusyId(""));
        }}
      />
    </div>
  );
}

function Badge({ children }: { children: ReactNode }) {
  return <span className="rounded-md bg-[var(--bg)] px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">{children}</span>;
}
