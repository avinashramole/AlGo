import { useState } from "react";
import { Link } from "react-router-dom";
import { SideBadge } from "../components/desk/Badges";
import { useMarket } from "../context/MarketContext";
import { brokerName } from "../lib/brokers";
import { cn, formatInr, formatIst, formatNumber } from "../lib/format";

export function PositionsDesk() {
  const { data, closePosition } = useMarket();
  const [filter, setFilter] = useState("all");
  const [busy, setBusy] = useState("");
  const brokers = [{ id: "all", name: "All brokers" }, ...(data.brokers || []).filter((item) => item.connected)];
  const rows = data.positions.filter((row) => filter === "all" || row.brokerId === filter);
  const invested = rows.reduce((sum, row) => sum + row.avg * row.qty, 0);
  const pnl = rows.reduce((sum, row) => sum + row.pnl, 0);

  const close = async (id: string, symbol: string) => {
    if (!window.confirm(`Square off ${symbol} at LTP?`)) return;
    setBusy(id);
    try {
      await closePosition(id);
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Positions</h1>
          <p className="text-sm text-slate-400">Open F&O book · square off is a market order on the same broker (Dhan when LIVE)</p>
        </div>
        <div className="flex gap-2 text-sm font-semibold">
          <Link to="/orders" className="text-brand-500">
            Order book
          </Link>
          <span className="text-slate-300">·</span>
          <Link to="/reports" className="text-brand-500">
            Report
          </Link>
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-4">
        <Stat label="Open" value={String(rows.length)} />
        <Stat label="Invested" value={`₹${formatNumber(invested, 0)}`} />
        <Stat label="Unrealized P&L" value={formatInr(pnl)} positive={pnl >= 0} />
        <label className="card flex flex-col justify-center p-4 text-xs font-semibold text-slate-500">
          Broker
          <select
            className="mt-1 h-10 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2 text-sm font-semibold text-[var(--text)]"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          >
            {brokers.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <section className="card overflow-x-auto">
        {rows.length ? (
          <table className="w-full min-w-[920px] text-left text-sm">
            <thead className="bg-[var(--bg)] text-[11px] uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-4 py-3 font-semibold">Symbol</th>
                <th className="px-4 py-3 font-semibold">Side</th>
                <th className="px-4 py-3 text-right font-semibold">Qty</th>
                <th className="px-4 py-3 text-right font-semibold">Avg</th>
                <th className="px-4 py-3 text-right font-semibold">LTP</th>
                <th className="px-4 py-3 text-right font-semibold">P&L</th>
                <th className="px-4 py-3 font-semibold">Strategy</th>
                <th className="px-4 py-3 font-semibold">Broker</th>
                <th className="px-4 py-3 text-right font-semibold">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="soft-row">
                  <td className="px-4 py-3 font-semibold">
                    {row.symbol}
                    <div className="text-[10px] font-medium uppercase text-slate-400">
                      {row.product || "MIS"} · {formatIst(row.openedAt)}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <SideBadge side={row.type} />
                  </td>
                  <td className="px-4 py-3 text-right">{row.qty}</td>
                  <td className="px-4 py-3 text-right">{formatNumber(row.avg)}</td>
                  <td className="px-4 py-3 text-right">{formatNumber(row.ltp)}</td>
                  <td className={cn("px-4 py-3 text-right font-semibold", row.pnl >= 0 ? "text-up" : "text-down")}>{formatInr(row.pnl)}</td>
                  <td className="px-4 py-3 text-slate-500">{row.strategy || "—"}</td>
                  <td className="px-4 py-3">{brokerName(data.brokers, row.brokerId)}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      disabled={busy === row.id}
                      onClick={() => void close(row.id, row.symbol)}
                      className="rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                    >
                      {busy === row.id ? "..." : "Square off"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="p-8 text-center text-sm text-slate-400">No open positions</div>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value, positive }: { label: string; value: string; positive?: boolean }) {
  return (
    <div className="card p-4">
      <div className="text-[11px] font-semibold uppercase text-slate-400">{label}</div>
      <div className={cn("mt-1 text-2xl font-bold", positive && "text-up")}>{value}</div>
    </div>
  );
}
