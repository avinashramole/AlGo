import { useState } from "react";
import { Link } from "react-router-dom";
import { SideBadge, StatusBadge } from "../components/desk/Badges";
import { useMarket } from "../context/MarketContext";
import { brokerName } from "../lib/brokers";
import { cn, formatIst, formatNumber } from "../lib/format";

const FILTERS = ["ALL", "PENDING", "PARTIAL", "FILLED", "REJECTED", "CANCELLED"] as const;

export function Orders() {
  const { data, cancel } = useMarket();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("ALL");
  const [busy, setBusy] = useState("");
  const orders = data.orders || [];
  const rows = orders.filter((row) => filter === "ALL" || row.status === filter);
  const counts = {
    ALL: orders.length,
    PENDING: orders.filter((row) => row.status === "PENDING").length,
    PARTIAL: orders.filter((row) => row.status === "PARTIAL").length,
    FILLED: orders.filter((row) => row.status === "FILLED").length,
    REJECTED: orders.filter((row) => row.status === "REJECTED").length,
    CANCELLED: orders.filter((row) => row.status === "CANCELLED").length,
  };

  const stop = async (id: string) => {
    if (!window.confirm("Cancel this pending order?")) return;
    setBusy(id);
    try {
      await cancel(id);
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Order Book</h1>
          <p className="text-sm text-slate-400">Today’s orders on the connected brokers · pending, filled, rejected</p>
        </div>
        <div className="flex gap-2 text-sm font-semibold">
          <Link to="/positions" className="text-brand-500">
            Positions
          </Link>
          <span className="text-slate-300">·</span>
          <Link to="/reports" className="text-brand-500">
            Report
          </Link>
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-4">
        <Stat label="Orders" value={String(orders.length)} />
        <Stat label="Pending" value={String(counts.PENDING + counts.PARTIAL)} />
        <Stat label="Filled" value={String(counts.FILLED)} />
        <Stat label="Rejected" value={String(counts.REJECTED)} />
      </div>
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => setFilter(id)}
            className={cn(
              "rounded-lg px-3 py-1.5 text-xs font-semibold",
              filter === id ? "bg-brand-500 text-white" : "border border-[var(--border)] bg-[var(--card)]",
            )}
          >
            {id} {counts[id]}
          </button>
        ))}
      </div>
      <section className="card overflow-x-auto">
        {rows.length ? (
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="bg-[var(--bg)] text-[11px] uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-4 py-3 font-semibold">Time</th>
                <th className="px-4 py-3 font-semibold">Symbol</th>
                <th className="px-4 py-3 font-semibold">Side</th>
                <th className="px-4 py-3 text-right font-semibold">Qty</th>
                <th className="px-4 py-3 font-semibold">Type</th>
                <th className="px-4 py-3 text-right font-semibold">Price</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Strategy</th>
                <th className="px-4 py-3 font-semibold">Broker</th>
                <th className="px-4 py-3 text-right font-semibold">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="soft-row">
                  <td className="px-4 py-3 text-xs text-slate-500">{formatIst(row.createdAt)}</td>
                  <td className="px-4 py-3 font-semibold">
                    {row.symbol}
                    <div className="text-[10px] font-medium uppercase text-slate-400">{row.product || "MIS"}</div>
                  </td>
                  <td className="px-4 py-3">
                    <SideBadge side={row.side} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    {row.filledQty || 0}/{row.qty}
                  </td>
                  <td className="px-4 py-3">{row.type || "MARKET"}</td>
                  <td className="px-4 py-3 text-right">{formatNumber(row.price)}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={row.status} />
                    {row.reason ? <div className="mt-1 text-[10px] text-down">{row.reason}</div> : null}
                  </td>
                  <td className="px-4 py-3 text-slate-500">{row.strategy || "—"}</td>
                  <td className="px-4 py-3">{row.brokerName || brokerName(data.brokers, row.brokerId)}</td>
                  <td className="px-4 py-3 text-right">
                    {row.status === "PENDING" || row.status === "PARTIAL" ? (
                      <button
                        type="button"
                        disabled={busy === row.id}
                        onClick={() => void stop(row.id)}
                        className="rounded-lg border border-rose-200 px-3 py-1 text-xs font-semibold text-down disabled:opacity-60 dark:border-rose-900"
                      >
                        {busy === row.id ? "..." : "Cancel"}
                      </button>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="p-8 text-center text-sm text-slate-400">No orders in this view</div>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-4">
      <div className="text-[11px] font-semibold uppercase text-slate-400">{label}</div>
      <div className="mt-1 text-2xl font-bold">{value}</div>
    </div>
  );
}
