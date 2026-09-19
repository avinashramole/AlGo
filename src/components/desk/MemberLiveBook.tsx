import { SideBadge } from "./Badges";
import type { DeskOrder, DeskReport, MemberPosition } from "../../api/client";
import { cn, formatInr, formatIst, formatNumber } from "../../lib/format";

export function MemberLiveBook({
  positions,
  orders,
  tradeBook,
  brokerName,
}: {
  positions: MemberPosition[];
  orders?: DeskOrder[];
  tradeBook?: DeskReport["tradeBook"];
  brokerName?: (id?: string) => string;
}) {
  const closed = tradeBook || [];
  const copied = (orders || []).slice(0, 20);
  const nameOf = brokerName || ((id?: string) => id || "Paper");

  return (
    <>
      <section className="card p-4">
        <div className="mb-3 text-sm font-bold">Open positions · MTM</div>
        <div className="space-y-2">
          {positions.map((row) => (
            <div key={row.id} className="flex items-center justify-between rounded-lg bg-[var(--bg)] px-3 py-2 text-sm">
              <div>
                <div className="font-semibold">{row.symbol}</div>
                <div className="text-[11px] text-slate-400">
                  {row.strategy} · {row.qty} qty · LTP {formatNumber(row.ltp)}
                </div>
              </div>
              <div className={cn("font-bold", row.pnl >= 0 ? "text-up" : "text-down")}>{formatInr(row.pnl)}</div>
            </div>
          ))}
          {!positions.length ? <p className="text-xs text-slate-400">No open positions.</p> : null}
        </div>
      </section>

      <section className="card overflow-x-auto">
        <div className="px-4 pt-4 text-sm font-bold">Copied orders</div>
        <p className="px-4 pt-1 text-xs text-slate-400">
          Same side and contract as the admin desk, sized and sent from this account when Copy is on.
        </p>
        <table className="mt-2 w-full min-w-[640px] text-left text-sm">
          <thead className="bg-[var(--bg)] text-[11px] uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-4 py-3 font-semibold">Time</th>
              <th className="px-4 py-3 font-semibold">Symbol</th>
              <th className="px-4 py-3 font-semibold">Side</th>
              <th className="px-4 py-3 text-right font-semibold">Qty</th>
              <th className="px-4 py-3 text-right font-semibold">Price</th>
              <th className="px-4 py-3 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody>
            {copied.map((row) => (
              <tr key={row.id} className="soft-row">
                <td className="px-4 py-3 text-xs text-slate-500">{row.createdAt ? formatIst(row.createdAt) : "—"}</td>
                <td className="px-4 py-3 font-semibold">{row.symbol}</td>
                <td className="px-4 py-3">
                  <SideBadge side={row.side} />
                </td>
                <td className="px-4 py-3 text-right">{row.qty}</td>
                <td className="px-4 py-3 text-right">{formatNumber(row.price)}</td>
                <td className="px-4 py-3 text-xs font-bold uppercase">{row.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!copied.length ? <p className="px-4 pb-4 text-xs text-slate-400">No copied orders yet.</p> : null}
      </section>

      <section className="card overflow-x-auto">
        <div className="px-4 pt-4 text-sm font-bold">Trade book</div>
        <p className="px-4 pt-1 text-xs text-slate-400">Closed trades with entry, exit, and P&L.</p>
        <table className="mt-2 w-full min-w-[760px] text-left text-sm">
          <thead className="bg-[var(--bg)] text-[11px] uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-4 py-3 font-semibold">Closed</th>
              <th className="px-4 py-3 font-semibold">Symbol</th>
              <th className="px-4 py-3 font-semibold">Side</th>
              <th className="px-4 py-3 text-right font-semibold">Qty</th>
              <th className="px-4 py-3 text-right font-semibold">Entry</th>
              <th className="px-4 py-3 text-right font-semibold">Exit</th>
              <th className="px-4 py-3 text-right font-semibold">P&L</th>
              <th className="px-4 py-3 font-semibold">Broker</th>
            </tr>
          </thead>
          <tbody>
            {closed.map((row) => (
              <tr key={row.id} className="soft-row">
                <td className="px-4 py-3 text-xs text-slate-500">{formatIst(row.closedAt)}</td>
                <td className="px-4 py-3 font-semibold">{row.symbol}</td>
                <td className="px-4 py-3">
                  <SideBadge side={row.side} />
                </td>
                <td className="px-4 py-3 text-right">{row.qty}</td>
                <td className="px-4 py-3 text-right">{formatNumber(row.entry)}</td>
                <td className="px-4 py-3 text-right">{formatNumber(row.exit)}</td>
                <td className={cn("px-4 py-3 text-right font-semibold", row.pnl >= 0 ? "text-up" : "text-down")}>
                  {formatInr(row.pnl)}
                </td>
                <td className="px-4 py-3">{nameOf(row.brokerId)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!closed.length ? <p className="px-4 pb-4 text-xs text-slate-400">No closed trades yet.</p> : null}
      </section>
    </>
  );
}
