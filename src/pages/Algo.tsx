import { Pencil, Plus, Trash2 } from "lucide-react";
import { type ReactNode, useState } from "react";
import { BacktestRange, BacktestRangeInline, type BacktestRangePayload } from "../components/dashboard/BacktestRange";
import { StrategyBuilder } from "../components/dashboard/StrategyBuilder";
import { useMarket } from "../context/MarketContext";
import { brokerName } from "../lib/brokers";
import { cn, formatInr } from "../lib/format";
import { formatConditionGroup, contractLabel, lotForSymbol, isNiftyVwapKind, isNiftyVwapReversalKind, isNiftyOptionEngineKind, type AlgoStrategy } from "../lib/strategies";

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
  const [filter, setFilter] = useState<"all" | "indicator" | "price-action" | "nifty-vwap" | "nifty-vwap-reversal">("all");
  const [builderOpen, setBuilderOpen] = useState(false);
  const [editing, setEditing] = useState<AlgoStrategy | null>(null);
  const [busyId, setBusyId] = useState("");
  const [rangeId, setRangeId] = useState("");
  const [rangeError, setRangeError] = useState("");
  const connected = (data.brokers || []).filter((item) => item.connected);
  const rangeFor = data.algos.find((item) => item.id === rangeId) || null;

  const rows = data.algos.filter((algo) => {
    if (filter === "all") return true;
    if (filter === "nifty-vwap") return isNiftyVwapKind(algo);
    if (filter === "nifty-vwap-reversal") return isNiftyVwapReversalKind(algo);
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
            Paper trade on the live Dhan feed (virtual fills only). Choose Future or Option CE/PE. Backtest last 1 year or custom dates. Live Dhan sends the same contract in NSE hours.
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
            ["nifty-vwap", "NIFTY VWAP ATM"],
            ["nifty-vwap-reversal", "15m VWAP reversal"],
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
            const kind = isNiftyVwapReversalKind(algo)
              ? "nifty-vwap-reversal"
              : isNiftyVwapKind(algo)
                ? "nifty-vwap"
                : algo.kind || (algo.tag === "Price action" ? "price-action" : "indicator");
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
                  <Badge>
                    {kind === "nifty-vwap-reversal"
                      ? "15m VWAP"
                      : kind === "nifty-vwap"
                        ? "NIFTY VWAP"
                        : kind === "indicator"
                          ? "Indicator"
                          : "Price action"}
                  </Badge>
                  <Badge>{algo.runMode === "live" ? "Live Dhan" : algo.runMode === "backtest" ? "Backtest" : "Paper"}</Badge>
                  <Badge>{algo.instrument === "option" ? algo.trade?.label || contractLabel(algo) : `${algo.symbol || "NIFTY"} FUT`}</Badge>
                  <Badge>
                    {algo.lots || 1} lot × {algo.lotSize || lotForSymbol(algo.symbol)} = {algo.qty || (algo.lots || 1) * lotForSymbol(algo.symbol)} qty
                  </Badge>
                  <Badge>{algo.timeframe || "5m"}</Badge>
                  <Badge>{algo.side || "BUY"}</Badge>
                </div>
                <div className="mt-2 space-y-1 text-[11px] font-semibold text-slate-500">
                  {kind === "nifty-vwap-reversal" ? (
                    <>
                      <div>BUY weekly ATM CE when 15m NIFTY future opens below VWAP and closes above VWAP</div>
                      <div>BUY weekly ATM PE when 15m NIFTY future opens above VWAP and closes below VWAP</div>
                      <div>Weekly expiry only (skip monthly) · Entry after 15m close · SL {algo.initialSlPct || 15}% · Target {algo.targetPct || 30}%</div>
                    </>
                  ) : kind === "nifty-vwap" ? (
                    <>
                      <div>BUY when close above VWAP (CE) + ATM CE close above CE VWAP</div>
                      <div>SELL / PE when close below VWAP + ATM PE close above PE VWAP</div>
                      <div>
                        SL {algo.initialSlPct || 20}% · Target {algo.targetPct || 40}% · trail {algo.trailingActivationPct || 10}% / {algo.trailingStepPct || 3}% · VWAP exit {algo.vwapExitCandles || 5}
                      </div>
                    </>
                  ) : (
                    <>
                  <div>
                    BUY when{" "}
                    {formatConditionGroup(algo.buyConditions, {
                      left: algo.buyLeft,
                      op: algo.buyOp,
                      right: algo.buyRight,
                      value: algo.buyValue,
                    })}
                  </div>
                  <div>
                    SELL when{" "}
                    {formatConditionGroup(algo.sellConditions, {
                      left: algo.sellLeft,
                      op: algo.sellOp,
                      right: algo.sellRight,
                      value: algo.sellValue,
                    })}
                  </div>
                    </>
                  )}
                  {algo.instrument === "option" ? (
                    <div className={algo.trade?.ready ? "text-slate-500" : "text-amber-600"}>
                      {algo.trade?.ready
                        ? `Live ${algo.trade.symbol} · LTP ${algo.trade.ltp}`
                        : algo.trade?.hint || "Open Options for live CE/PE"}
                      {algo.lastSignal && algo.enabled ? ` · signal ${algo.lastSignal}` : ""}
                    </div>
                  ) : algo.trade?.ready ? (
                    <div>
                      Live {algo.trade.symbol} · LTP {algo.trade.ltp}
                      {algo.lastSignal && algo.enabled ? ` · signal ${algo.lastSignal}` : ""}
                    </div>
                  ) : null}
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
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      setRangeError("");
                      setRangeId(algo.id);
                    }}
                    className="h-10 rounded-xl border border-brand-500 bg-brand-50 text-xs font-semibold text-brand-700 dark:bg-brand-500/10 dark:text-brand-300"
                  >
                    {busyId === algo.id ? "Testing..." : rangeId === algo.id ? "Pick range below" : "Backtest"}
                  </button>
                  {algo.runMode === "backtest" ? (
                    <button type="button" disabled className="h-10 rounded-xl border border-[var(--border)] text-xs font-semibold text-slate-400">
                      Research only
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        void toggle(algo.id).catch((err: unknown) => {
                          window.alert(err instanceof Error ? err.message : "Could not start");
                        });
                      }}
                      className="h-10 rounded-xl border border-[var(--border)] text-xs font-semibold"
                    >
                      {algo.enabled ? "Pause" : algo.runMode === "paper" ? "Start paper" : "Start live"}
                    </button>
                  )}
                  <button type="button" onClick={() => void remove(algo as AlgoStrategy)} className="inline-flex h-10 items-center justify-center gap-1 rounded-xl border border-rose-200 text-xs font-semibold text-down dark:border-rose-900">
                    <Trash2 size={13} />
                    Delete
                  </button>
                </div>
                <div className="mt-2 text-[11px] text-slate-400">
                  Broker {brokerName(data.brokers, algo.brokerId)} · SL {isNiftyOptionEngineKind(algo) ? algo.initialSlPct || (isNiftyVwapReversalKind(algo) ? 15 : 20) : algo.slPct || 0.4}% · Target {algo.targetPct || (isNiftyVwapReversalKind(algo) ? 30 : isNiftyVwapKind(algo) ? 40 : 0.8)}%
                </div>
                {rangeId === algo.id ? (
                  <BacktestRangeInline
                    busy={busyId === algo.id}
                    error={rangeError}
                    onCancel={() => {
                      if (busyId) return;
                      setRangeId("");
                      setRangeError("");
                    }}
                    onRun={(payload: BacktestRangePayload) => {
                      setBusyId(algo.id);
                      setRangeError("");
                      void backtest(algo.id, payload)
                        .then(() => {
                          setRangeId("");
                        })
                        .catch((err: unknown) => {
                          setRangeError(err instanceof Error ? err.message : "Backtest failed");
                        })
                        .finally(() => setBusyId(""));
                    }}
                  />
                ) : null}
              </section>
            );
          })}
        </div>
      ) : (
        <section className="card p-8 text-center">
          <div className="text-base font-bold">No strategies in this view</div>
          <p className="mt-1 text-sm text-slate-400">Add an indicator, price-action, or NIFTY VWAP ATM strategy to start the desk.</p>
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
          setRangeId("");
          setRangeError("");
        }}
        onRun={(payload: BacktestRangePayload) => {
          if (!rangeFor) return;
          setBusyId(rangeFor.id);
          setRangeError("");
          void backtest(rangeFor.id, payload)
            .then(() => {
              setRangeId("");
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
