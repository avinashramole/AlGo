import { positions } from "../../data/mock";
import { cn, formatInr, formatNumber } from "../../lib/format";

export function Positions() {
  const total = positions.reduce((sum, row) => sum + row.pnl, 0);

  return (
    <section className="card overflow-hidden p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-sm font-bold">Positions</div>
        <div className="text-[11px] font-semibold text-slate-400">{positions.length} open</div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-left text-xs">
          <thead className="text-[10px] uppercase tracking-wide text-slate-400">
            <tr>
              <th className="pb-2 font-semibold">Symbol</th>
              <th className="pb-2 font-semibold">Type</th>
              <th className="pb-2 text-right font-semibold">Qty</th>
              <th className="pb-2 text-right font-semibold">Avg</th>
              <th className="pb-2 text-right font-semibold">LTP</th>
              <th className="pb-2 text-right font-semibold">P&L</th>
            </tr>
          </thead>
          <tbody>
            {positions.map((row) => (
              <tr key={row.id} className="soft-row">
                <td className="py-2.5 font-semibold">{row.symbol}</td>
                <td className="py-2.5">
                  <span
                    className={cn(
                      "rounded px-1.5 py-0.5 text-[10px] font-bold",
                      row.type === "BUY" ? "bg-emerald-50 text-up dark:bg-emerald-950/40" : "bg-rose-50 text-down dark:bg-rose-950/40",
                    )}
                  >
                    {row.type}
                  </span>
                </td>
                <td className="py-2.5 text-right">{row.qty}</td>
                <td className="py-2.5 text-right">{formatNumber(row.avg)}</td>
                <td className="py-2.5 text-right">{formatNumber(row.ltp)}</td>
                <td className={cn("py-2.5 text-right font-semibold", row.pnl >= 0 ? "text-up" : "text-down")}>
                  {formatInr(row.pnl)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex items-center justify-between rounded-lg bg-[var(--bg)] px-3 py-2 text-sm">
        <span className="text-xs font-semibold text-slate-400">Total P&L</span>
        <span className="font-extrabold text-up">{formatInr(total)}</span>
      </div>
    </section>
  );
}
