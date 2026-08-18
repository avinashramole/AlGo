import { Link } from "react-router-dom";
import { SideBadge } from "../components/desk/Badges";
import { useMarket } from "../context/MarketContext";
import { brokerName } from "../lib/brokers";
import { cn, formatInr, formatIst, formatNumber, liveBookCopy } from "../lib/format";

export function Reports() {
  const { data } = useMarket();
  const report = data.report;
  const maxDaily = Math.max(1, ...(report?.daily || []).map((row) => Math.abs(row.pnl)));

  const download = () => {
    if (!report) return;
    const rows = [
      ["Symbol", "Side", "Qty", "Entry", "Exit", "P&L", "Strategy", "Broker", "Closed"],
      ...report.tradeBook.map((row) => [
        row.symbol,
        row.side,
        row.qty,
        row.entry,
        row.exit,
        row.pnl,
        row.strategy || "",
        brokerName(data.brokers, row.brokerId),
        formatIst(row.closedAt),
      ]),
    ];
    const csv = rows.map((line) => line.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `t2s-report-${report.date}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  if (!report) {
    return (
      <div className="card p-8 text-center">
        <div className="text-base font-bold">Report is loading</div>
        <p className="mt-1 text-sm text-slate-400">Connect the API to see P&L, trade book, and strategy contribution.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Report</h1>
          <p className="text-sm text-slate-400">
            {liveBookCopy(data.dhanFeed?.live)}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link to="/orders" className="text-sm font-semibold text-brand-500">
            Order book
          </Link>
          <Link to="/positions" className="text-sm font-semibold text-brand-500">
            Positions
          </Link>
          <button type="button" onClick={download} className="h-10 rounded-xl bg-brand-500 px-4 text-sm font-semibold text-white">
            Download CSV
          </button>
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        <Stat label="Realized P&L" value={formatInr(report.realizedPnl)} signed={report.realizedPnl} />
        <Stat label="Unrealized P&L" value={formatInr(report.unrealizedPnl)} signed={report.unrealizedPnl} />
        <Stat label="Charges" value={`₹${formatNumber(report.charges)}`} />
        <Stat label="Net P&L" value={formatInr(report.netPnl)} signed={report.netPnl} />
      </div>
      <div className="grid gap-3 md:grid-cols-4">
        <Stat label="Closed trades" value={String(report.trades)} />
        <Stat label="Win rate" value={`${report.winRate}%`} />
        <Stat label="Wins / losses" value={`${report.wins} / ${report.losses}`} />
        <Stat label="Turnover" value={`₹${formatNumber(report.turnover, 0)}`} />
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <section className="card p-4">
          <div className="mb-3 text-sm font-bold">Daily P&L</div>
          <div className="space-y-2">
            {(report.daily || []).map((row) => (
              <div key={row.date}>
                <div className="mb-1 flex justify-between text-xs">
                  <span className="font-semibold">{row.date}</span>
                  <span className={row.pnl >= 0 ? "text-up" : "text-down"}>{formatInr(row.pnl)}</span>
                </div>
                <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800">
                  <div
                    className={cn("h-2 rounded-full", row.pnl >= 0 ? "bg-up" : "bg-down")}
                    style={{ width: `${Math.max(6, (Math.abs(row.pnl) / maxDaily) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>
        <section className="card p-4">
          <div className="mb-3 text-sm font-bold">By strategy</div>
          <div className="space-y-2">
            {(report.byStrategy || []).map((row) => (
              <div key={row.name} className="flex items-center justify-between rounded-lg bg-[var(--bg)] px-3 py-2 text-sm">
                <div>
                  <div className="font-semibold">{row.name}</div>
                  <div className="text-[11px] text-slate-400">
                    {row.trades} trades · {row.winRate}% win
                  </div>
                </div>
                <div className={cn("font-bold", row.pnl >= 0 ? "text-up" : "text-down")}>{formatInr(row.pnl)}</div>
              </div>
            ))}
          </div>
        </section>
      </div>
      <section className="card overflow-x-auto">
        <div className="px-4 pt-4 text-sm font-bold">Trade book</div>
        <table className="mt-2 w-full min-w-[860px] text-left text-sm">
          <thead className="bg-[var(--bg)] text-[11px] uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-4 py-3 font-semibold">Closed</th>
              <th className="px-4 py-3 font-semibold">Symbol</th>
              <th className="px-4 py-3 font-semibold">Side</th>
              <th className="px-4 py-3 text-right font-semibold">Qty</th>
              <th className="px-4 py-3 text-right font-semibold">Entry</th>
              <th className="px-4 py-3 text-right font-semibold">Exit</th>
              <th className="px-4 py-3 text-right font-semibold">P&L</th>
              <th className="px-4 py-3 font-semibold">Strategy</th>
              <th className="px-4 py-3 font-semibold">Broker</th>
            </tr>
          </thead>
          <tbody>
            {(report.tradeBook || []).map((row) => (
              <tr key={row.id} className="soft-row">
                <td className="px-4 py-3 text-xs text-slate-500">{formatIst(row.closedAt)}</td>
                <td className="px-4 py-3 font-semibold">{row.symbol}</td>
                <td className="px-4 py-3">
                  <SideBadge side={row.side} />
                </td>
                <td className="px-4 py-3 text-right">{row.qty}</td>
                <td className="px-4 py-3 text-right">{formatNumber(row.entry)}</td>
                <td className="px-4 py-3 text-right">{formatNumber(row.exit)}</td>
                <td className={cn("px-4 py-3 text-right font-semibold", row.pnl >= 0 ? "text-up" : "text-down")}>{formatInr(row.pnl)}</td>
                <td className="px-4 py-3 text-slate-500">{row.strategy || "—"}</td>
                <td className="px-4 py-3">{brokerName(data.brokers, row.brokerId)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function Stat({ label, value, signed }: { label: string; value: string; signed?: number }) {
  return (
    <div className="card p-4">
      <div className="text-[11px] font-semibold uppercase text-slate-400">{label}</div>
      <div className={cn("mt-1 text-2xl font-bold", signed != null && (signed >= 0 ? "text-up" : "text-down"))}>{value}</div>
    </div>
  );
}
