import { useState } from "react";
import { SideBadge, StatusBadge } from "../components/desk/Badges";
import { useMarket } from "../context/MarketContext";
import { brokerName } from "../lib/brokers";
import { isEntryWhy, isExitHitReason, orderWhyForBook } from "../lib/exitReason";
import { cn, formatIst, formatNumber, hasDhanQuotes, liveBookCopy, deskStrategyName, whyColClass } from "../lib/format";
import { isLiveBrokerTrade, isPaperTrade } from "../lib/paperBook";

const FILTERS = ["ALL", "PENDING", "PARTIAL", "FILLED", "REJECTED", "FAILED", "CANCELLED"] as const;

export function Orders({ embedded = false, book = "live" }: { embedded?: boolean; book?: "live" | "paper" }) {
  const { data, cancel } = useMarket();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("ALL");
  const [busy, setBusy] = useState("");
  const orders = (data.orders || []).filter(
    (row) => !row.testDesk && (book === "paper" ? isPaperTrade(row) : isLiveBrokerTrade(row)),
  );
  const rows = orders.filter((row) => filter === "ALL" || row.status === filter);
  const counts = {
    ALL: orders.length,
    PENDING: orders.filter((row) => row.status === "PENDING").length,
    PARTIAL: orders.filter((row) => row.status === "PARTIAL").length,
    FILLED: orders.filter((row) => row.status === "FILLED").length,
    REJECTED: orders.filter((row) => row.status === "REJECTED").length,
    FAILED: orders.filter((row) => row.status === "FAILED").length,
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
      {embedded ? null : (
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Orders</h1>
          <p className="text-sm text-slate-400">
            {liveBookCopy(data.dhanFeed?.live, hasDhanQuotes(data))} Price is the Dhan average fill, not the LTP at send. Admin and user trade logs clear daily at 8:00 AM IST.
          </p>
        </div>
      </div>
      )}
      <div className="grid gap-3 md:grid-cols-4">
        <Stat label="Orders" value={String(orders.length)} />
        <Stat label="Pending" value={String(counts.PENDING + counts.PARTIAL)} />
        <Stat label="Filled" value={String(counts.FILLED)} />
        <Stat label="Rejected / failed" value={String(counts.REJECTED + counts.FAILED)} />
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
      <section className="card overflow-hidden p-0">
        {rows.length ? (
          <>
            <div className="divide-y divide-[var(--border)] md:hidden">
              {rows.map((row) => {
                const side = row.side === "SELL" ? "SELL" : "BUY";
                const strategy = deskStrategyName(row.strategy, data.algos);
                return (
                  <div key={row.id} className="px-4 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold">{row.symbol}</div>
                        <div className="text-[11px] text-slate-400">Strategy · {strategy || "—"}</div>
                        {row.copyUserId ? (
                          <div className="text-[11px] font-semibold text-brand-500">Copy · {row.copyUserName || row.copyUserId}</div>
                        ) : null}
                      </div>
                      <StatusBadge status={row.status} />
                    </div>
                    <div className="mt-2">
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Buy / Sell</div>
                      <div className="mt-1">
                        <SideBadge side={side} />
                      </div>
                    </div>
                    <div className="mt-1 text-[11px] text-slate-400">
                      {row.filledQty || 0}/{row.qty} · {row.type || "MARKET"} · {formatNumber(row.price)}
                    </div>
                    <div className={cn("mt-1 text-[11px] font-semibold", reasonTone(row, orders))} data-order-why="true">
                      Why: {orderWhyForBook(row, orders) || "—"}
                    </div>
                    {(row.status === "PENDING" || row.status === "PARTIAL") && !row.copyUserId ? (
                      <button
                        type="button"
                        disabled={busy === row.id}
                        onClick={() => void stop(row.id)}
                        className="mt-2 rounded-lg border border-rose-200 px-3 py-1 text-xs font-semibold text-down disabled:opacity-60 dark:border-rose-900"
                      >
                        {busy === row.id ? "..." : "Cancel"}
                      </button>
                    ) : null}
                  </div>
                );
              })}
            </div>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[1080px] text-left text-sm">
                <thead className="bg-[var(--bg)] text-[11px] uppercase tracking-wide text-slate-400">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Time</th>
                    <th className="px-4 py-3 font-semibold">Symbol</th>
                    <th className="px-4 py-3 font-semibold">Buy / Sell</th>
                    <th className="px-4 py-3 font-semibold">Strategy</th>
                    <th className={cn("px-4 py-3 font-semibold", whyColClass)}>Why</th>
                    <th className="px-4 py-3 text-right font-semibold">Qty</th>
                    <th className="px-4 py-3 font-semibold">Type</th>
                    <th className="px-4 py-3 text-right font-semibold">Avg fill</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold">Broker</th>
                    <th className="px-4 py-3 text-right font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const side = row.side === "SELL" ? "SELL" : "BUY";
                    return (
                      <tr key={row.id} className="soft-row">
                        <td className="px-4 py-3 text-xs text-slate-500">{formatIst(row.createdAt)}</td>
                        <td className="px-4 py-3 font-semibold">
                          {row.symbol}
                          <div className="text-[10px] font-medium uppercase text-slate-400">{row.product || "MIS"}</div>
                        </td>
                        <td className="px-4 py-3">
                          <SideBadge side={side} />
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-bold">{deskStrategyName(row.strategy, data.algos) || "—"}</div>
                          {row.copyUserId ? (
                            <div className="text-[10px] font-semibold text-brand-500">Copy · {row.copyUserName || row.copyUserId}</div>
                          ) : null}
                        </td>
                        <td className={cn("px-4 py-3 text-xs font-semibold", whyColClass, reasonTone(row, orders))} data-order-why="true">
                          {orderWhyForBook(row, orders) || "—"}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {row.filledQty || 0}/{row.qty}
                        </td>
                        <td className="px-4 py-3">{row.type || "MARKET"}</td>
                        <td className="px-4 py-3 text-right">{formatNumber(row.price)}</td>
                        <td className="px-4 py-3">
                          <StatusBadge status={row.status} />
                        </td>
                        <td className="px-4 py-3">{row.brokerName || brokerName(data.brokers, row.brokerId)}</td>
                        <td className="px-4 py-3 text-right">
                          {(row.status === "PENDING" || row.status === "PARTIAL") && !row.copyUserId ? (
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
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div className="p-8 text-center text-sm text-slate-400">
            {book === "paper"
              ? "No paper orders"
              : hasDhanQuotes(data)
                ? "No live broker orders"
                : "No orders in this view"}
          </div>
        )}
      </section>
    </div>
  );
}

function reasonTone(
  row: { status?: string; side?: string; strategy?: string; role?: string; reason?: string; exitReason?: string; symbol?: string; price?: number; copyUserId?: string },
  book: Array<{ side?: string; symbol?: string; price?: number; copyUserId?: string }> = [],
) {
  const text = orderWhyForBook(row, book);
  if (isExitHitReason(text)) return "text-brand-500";
  if (isEntryWhy(text)) return "text-up";
  if (row.status === "REJECTED" || row.status === "FAILED") return "text-down";
  return "text-slate-500";
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-4">
      <div className="text-[11px] font-semibold uppercase text-slate-400">{label}</div>
      <div className="mt-1 text-2xl font-bold">{value}</div>
    </div>
  );
}
