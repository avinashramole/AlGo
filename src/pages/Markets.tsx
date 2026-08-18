import { useMarket } from "../context/MarketContext";
import { cn, formatNumber, formatPct } from "../lib/format";

export function Markets() {
  const { data } = useMarket();
  return (
    <div className="space-y-3">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-xl font-bold">Markets</h1>
          <p className="text-sm text-slate-400">Live watchlist and index movers</p>
        </div>
        <div className="flex gap-2">
          {["All", "Indices", "Nifty 50", "BankNifty"].map((tab, i) => (
            <button
              key={tab}
              type="button"
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-semibold",
                i === 0 ? "bg-brand-500 text-white" : "border border-[var(--border)] bg-[var(--card)]",
              )}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>
      <section className="card overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-[var(--bg)] text-[11px] uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-4 py-3 font-semibold">Symbol</th>
              <th className="px-4 py-3 text-right font-semibold">LTP</th>
              <th className="px-4 py-3 text-right font-semibold">Change</th>
              <th className="px-4 py-3 text-right font-semibold">Volume</th>
              <th className="px-4 py-3 text-right font-semibold">Action</th>
            </tr>
          </thead>
          <tbody>
            {data.marketWatch.map((row) => (
              <tr key={row.symbol} className="soft-row">
                <td className="px-4 py-3 font-semibold">{row.symbol}</td>
                <td className="px-4 py-3 text-right">{formatNumber(row.ltp)}</td>
                <td className={cn("px-4 py-3 text-right font-semibold", row.chg >= 0 ? "text-up" : "text-down")}>
                  {formatPct(row.chg)}
                </td>
                <td className="px-4 py-3 text-right text-slate-500">{row.volume}</td>
                <td className="px-4 py-3 text-right">
                  <button type="button" className="rounded-lg bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-500 dark:bg-brand-500/15">
                    Trade
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
