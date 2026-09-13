import { Eye, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
  deleteEnrollment,
  getClientDetail,
  type ClientDetail,
  type ClientRow,
} from "../../api/client";
import { SideBadge } from "../desk/Badges";
import { cn, formatInr, formatIst, formatIstDate, formatMobile, formatNumber, formatPlanTerm } from "../../lib/format";

export function UserDetailModal({ row, onClose }: { row: ClientRow; onClose: () => void }) {
  const [detail, setDetail] = useState<ClientDetail | null>(null);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");

  const load = useCallback(async () => {
    try {
      setDetail(await getClientDetail(row.id));
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load user details");
    }
  }, [row.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const onDeleteSub = async (id: string, name: string) => {
    if (!window.confirm(`Delete ${name} subscription for ${row.name}? They can enroll again. This does not start LIVE.`)) return;
    setBusyId(id);
    setError("");
    try {
      await deleteEnrollment(id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete subscription");
    } finally {
      setBusyId("");
    }
  };

  const client = detail?.client || row;
  const report = detail?.report;
  const maxDaily = Math.max(1, ...(report?.daily || []).map((item) => Math.abs(item.pnl)));

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-slate-950/50 p-3 md:items-center">
      <button type="button" className="absolute inset-0" aria-label="Close" onClick={onClose} />
      <div className="relative z-10 flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-xl">
        <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
          <div>
            <div className="text-[11px] font-extrabold uppercase text-slate-400">User details</div>
            <h2 className="text-base font-extrabold">{client.name}</h2>
          </div>
          <button type="button" className="text-slate-400" onClick={onClose} aria-label="Close details">
            <X size={18} />
          </button>
        </div>
        <div className="min-h-0 flex-1 space-y-4 overflow-auto p-4">
          {error ? <div className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-down">{error}</div> : null}
          {!detail ? (
            <p className="text-sm text-slate-400">Loading {row.name}…</p>
          ) : (
            <>
              <section className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <Info label="Mobile" value={formatMobile(client.mobile)} />
                <Info label="Email" value={client.email || "—"} />
                <Info label="Broker" value={`${client.brokerName}${client.accountId ? ` · ${client.accountId}` : ""}`} />
                <Info label="Mode" value={`${client.tradeMode.toUpperCase()} · ${client.status}`} />
                <Info label="Group" value={client.group || "ALL"} />
                <Info label="Joined" value={formatIstDate(client.createdAt)} />
                <Info label="Last login" value={formatIst(client.lastLoginAt)} />
                <Info label="Wallet" value={formatInr(detail.wallet.balance)} />
              </section>

              <section>
                <h3 className="mb-2 text-sm font-bold">Enrolled subscriptions</h3>
                <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
                  <table className="w-full min-w-[720px] text-left text-sm">
                    <thead className="bg-[var(--bg)] text-[10px] font-bold uppercase tracking-wide text-slate-400">
                      <tr>
                        <th className="px-3 py-2">Strategy</th>
                        <th className="px-3 py-2">Term</th>
                        <th className="px-3 py-2">Amount</th>
                        <th className="px-3 py-2">Started</th>
                        <th className="px-3 py-2">Ends</th>
                        <th className="px-3 py-2">Status</th>
                        <th className="px-3 py-2">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.enrollments.filter((item) => item.status !== "abandoned").map((item) => (
                        <tr key={item.id} className="border-t border-[var(--border)]">
                          <td className="px-3 py-2 font-semibold">{item.strategyName}</td>
                          <td className="px-3 py-2">{formatPlanTerm(item.term)}</td>
                          <td className="px-3 py-2">{formatInr(item.amount)}</td>
                          <td className="px-3 py-2 text-xs text-slate-500">{formatIstDate(item.startedAt)}</td>
                          <td className="px-3 py-2 text-xs text-slate-500">{formatIstDate(item.endsAt)}</td>
                          <td className="px-3 py-2 uppercase">{item.status}</td>
                          <td className="px-3 py-2">
                            <button
                              type="button"
                              disabled={Boolean(busyId)}
                              onClick={() => void onDeleteSub(item.id, item.strategyName)}
                              className="inline-flex h-8 items-center gap-1 rounded-md border border-rose-800 px-2 text-[11px] font-semibold text-rose-400 disabled:opacity-50"
                            >
                              <Trash2 size={12} />
                              {busyId === item.id ? "Deleting..." : "Delete"}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {!detail.enrollments.filter((item) => item.status !== "abandoned").length ? (
                    <p className="px-3 py-4 text-xs text-slate-400">No subscriptions yet.</p>
                  ) : null}
                </div>
              </section>

              <section>
                <h3 className="mb-2 text-sm font-bold">Transactions</h3>
                <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
                  <table className="w-full min-w-[640px] text-left text-sm">
                    <thead className="bg-[var(--bg)] text-[10px] font-bold uppercase tracking-wide text-slate-400">
                      <tr>
                        <th className="px-3 py-2">When</th>
                        <th className="px-3 py-2">Type</th>
                        <th className="px-3 py-2">Detail</th>
                        <th className="px-3 py-2">Channel</th>
                        <th className="px-3 py-2 text-right">Amount</th>
                        <th className="px-3 py-2">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.transactions.map((item) => (
                        <tr key={`${item.kind}-${item.id}`} className="border-t border-[var(--border)]">
                          <td className="px-3 py-2 text-xs text-slate-500">{formatIst(item.at)}</td>
                          <td className="px-3 py-2 uppercase">{item.kind}</td>
                          <td className="px-3 py-2 font-semibold">
                            {item.label}
                            {item.term ? ` · ${formatPlanTerm(item.term)}` : ""}
                          </td>
                          <td className="px-3 py-2 uppercase text-slate-500">{item.channel || "—"}</td>
                          <td className="px-3 py-2 text-right font-semibold">{formatInr(item.amount)}</td>
                          <td className="px-3 py-2 uppercase">{item.status}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {!detail.transactions.length ? <p className="px-3 py-4 text-xs text-slate-400">No transactions yet.</p> : null}
                </div>
              </section>

              <section className="grid gap-3 md:grid-cols-4">
                <Stat label="Realized P&L" value={formatInr(report?.realizedPnl || 0)} signed={report?.realizedPnl} />
                <Stat label="Unrealized MTM" value={formatInr(report?.unrealizedPnl || 0)} signed={report?.unrealizedPnl} />
                <Stat label="Net P&L" value={formatInr(report?.netPnl || 0)} signed={report?.netPnl} />
                <Stat label="Win rate" value={`${report?.winRate || 0}%`} />
              </section>

              <section>
                <h3 className="mb-2 text-sm font-bold">Daily trades and P&L</h3>
                <div className="space-y-2 rounded-xl border border-[var(--border)] p-3">
                  {(report?.daily || []).map((item) => (
                    <div key={item.date}>
                      <div className="mb-1 flex justify-between text-xs">
                        <span className="font-semibold">
                          {item.date}
                          {item.trades ? ` · ${item.trades} trades` : ""}
                        </span>
                        <span className={item.pnl >= 0 ? "text-up" : "text-down"}>{formatInr(item.pnl)}</span>
                      </div>
                      <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800">
                        <div
                          className={cn("h-2 rounded-full", item.pnl >= 0 ? "bg-up" : "bg-down")}
                          style={{ width: `${Math.max(6, (Math.abs(item.pnl) / maxDaily) * 100)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section>
                <h3 className="mb-2 text-sm font-bold">Trade book</h3>
                <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
                  <table className="w-full min-w-[760px] text-left text-sm">
                    <thead className="bg-[var(--bg)] text-[10px] font-bold uppercase tracking-wide text-slate-400">
                      <tr>
                        <th className="px-3 py-2">Closed</th>
                        <th className="px-3 py-2">Symbol</th>
                        <th className="px-3 py-2">Side</th>
                        <th className="px-3 py-2 text-right">Qty</th>
                        <th className="px-3 py-2 text-right">Entry</th>
                        <th className="px-3 py-2 text-right">Exit</th>
                        <th className="px-3 py-2 text-right">P&L</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(report?.tradeBook || []).map((item) => (
                        <tr key={item.id} className="border-t border-[var(--border)]">
                          <td className="px-3 py-2 text-xs text-slate-500">{formatIst(item.closedAt)}</td>
                          <td className="px-3 py-2 font-semibold">{item.symbol}</td>
                          <td className="px-3 py-2">
                            <SideBadge side={item.side} />
                          </td>
                          <td className="px-3 py-2 text-right">{item.qty}</td>
                          <td className="px-3 py-2 text-right">{formatNumber(item.entry)}</td>
                          <td className="px-3 py-2 text-right">{formatNumber(item.exit)}</td>
                          <td className={cn("px-3 py-2 text-right font-semibold", item.pnl >= 0 ? "text-up" : "text-down")}>
                            {formatInr(item.pnl)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {!report?.tradeBook?.length ? <p className="px-3 py-4 text-xs text-slate-400">No closed trades yet.</p> : null}
                </div>
              </section>

              <section>
                <h3 className="mb-2 text-sm font-bold">Open positions · MTM</h3>
                <div className="space-y-2">
                  {detail.positions.map((item) => (
                    <div key={item.id} className="flex items-center justify-between rounded-xl border border-[var(--border)] px-3 py-2 text-sm">
                      <div>
                        <div className="font-semibold">{item.symbol}</div>
                        <div className="text-[11px] text-slate-400">
                          {item.strategy} · {item.qty} qty · LTP {formatNumber(item.ltp)}
                        </div>
                      </div>
                      <div className={cn("font-bold", item.pnl >= 0 ? "text-up" : "text-down")}>{formatInr(item.pnl)}</div>
                    </div>
                  ))}
                  {!detail.positions.length ? <p className="text-xs text-slate-400">No open positions.</p> : null}
                </div>
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export function ViewUserButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-8 items-center gap-1 rounded-md border border-[var(--border)] px-2 text-[11px] font-semibold"
    >
      <Eye size={12} />
      View
    </button>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2">
      <div className="text-[10px] font-bold uppercase text-slate-400">{label}</div>
      <div className="mt-0.5 text-sm font-semibold">{value}</div>
    </div>
  );
}

function Stat({ label, value, signed }: { label: string; value: string; signed?: number }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2">
      <div className="text-[10px] font-bold uppercase text-slate-400">{label}</div>
      <div className={cn("mt-0.5 text-lg font-extrabold", signed != null && (signed >= 0 ? "text-up" : "text-down"))}>{value}</div>
    </div>
  );
}
