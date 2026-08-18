import { positions } from "../data/mock";
import { cn, formatInr, formatNumber } from "../lib/format";

export function Portfolio() {
  const total = positions.reduce((sum, row) => sum + row.pnl, 0);
  const invested = positions.reduce((sum, row) => sum + row.avg * row.qty, 0);

  return (
    <div className="space-y-3">
      <h1 className="text-xl font-bold">Portfolio</h1>
      <div className="grid gap-3 md:grid-cols-3">
        <Card label="Invested" value={`₹${formatNumber(invested)}`} />
        <Card label="Day P&L" value={formatInr(total)} positive />
        <Card label="Open positions" value={String(positions.length)} />
      </div>
      <section className="card overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="bg-[var(--bg)] text-[11px] uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-4 py-3 font-semibold">Symbol</th>
              <th className="px-4 py-3 font-semibold">Side</th>
              <th className="px-4 py-3 text-right font-semibold">Qty</th>
              <th className="px-4 py-3 text-right font-semibold">Avg</th>
              <th className="px-4 py-3 text-right font-semibold">LTP</th>
              <th className="px-4 py-3 text-right font-semibold">P&L</th>
            </tr>
          </thead>
          <tbody>
            {positions.map((row) => (
              <tr key={row.id} className="soft-row">
                <td className="px-4 py-3 font-semibold">{row.symbol}</td>
                <td className="px-4 py-3">{row.type}</td>
                <td className="px-4 py-3 text-right">{row.qty}</td>
                <td className="px-4 py-3 text-right">{formatNumber(row.avg)}</td>
                <td className="px-4 py-3 text-right">{formatNumber(row.ltp)}</td>
                <td className={cn("px-4 py-3 text-right font-semibold", row.pnl >= 0 ? "text-up" : "text-down")}>
                  {formatInr(row.pnl)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function Card({ label, value, positive }: { label: string; value: string; positive?: boolean }) {
  return (
    <div className="card p-4">
      <div className="text-[11px] font-semibold uppercase text-slate-400">{label}</div>
      <div className={cn("mt-1 text-2xl font-bold", positive && "text-up")}>{value}</div>
    </div>
  );
}
