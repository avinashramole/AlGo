import { Link } from "react-router-dom";
import { useMarket } from "../context/MarketContext";
import { brokerName } from "../lib/brokers";
import { cn, formatInr, formatNumber } from "../lib/format";

export function Portfolio() {
  const { data } = useMarket();
  const invested = data.positions.reduce((sum, row) => sum + row.avg * row.qty, 0);
  const connected = (data.brokers || []).filter((item) => item.connected);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-xl font-bold">Portfolio</h1>
        <div className="flex flex-wrap gap-3 text-sm font-semibold">
          <Link to="/orders" className="text-brand-500">
            Order book
          </Link>
          <Link to="/positions" className="text-brand-500">
            Positions
          </Link>
          <Link to="/reports" className="text-brand-500">
            Report
          </Link>
          <Link to="/brokers" className="text-brand-500">
            Brokers
          </Link>
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <Card label="Invested" value={`₹${formatNumber(invested)}`} />
        <Card label="Day P&L" value={formatInr(data.totalPnl)} positive={data.totalPnl >= 0} />
        <Card label="Brokers" value={String(connected.length)} />
      </div>
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        {connected.map((broker) => (
          <div key={broker.id} className="card p-4">
            <div className="text-[11px] font-semibold uppercase text-slate-400">{broker.name}</div>
            <div className={cn("mt-1 text-lg font-bold", (data.pnlByBroker?.[broker.id] || 0) >= 0 ? "text-up" : "text-down")}>
              {formatInr(data.pnlByBroker?.[broker.id] || 0)}
            </div>
            <div className="text-xs text-slate-400">Funds ₹{formatNumber(broker.funds, 0)}</div>
          </div>
        ))}
      </div>
      <section className="card overflow-x-auto">
        <table className="w-full min-w-[700px] text-left text-sm">
          <thead className="bg-[var(--bg)] text-[11px] uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-4 py-3 font-semibold">Symbol</th>
              <th className="px-4 py-3 font-semibold">Broker</th>
              <th className="px-4 py-3 font-semibold">Side</th>
              <th className="px-4 py-3 text-right font-semibold">Qty</th>
              <th className="px-4 py-3 text-right font-semibold">Avg</th>
              <th className="px-4 py-3 text-right font-semibold">LTP</th>
              <th className="px-4 py-3 text-right font-semibold">P&L</th>
            </tr>
          </thead>
          <tbody>
            {data.positions.map((row) => (
              <tr key={row.id} className="soft-row">
                <td className="px-4 py-3 font-semibold">{row.symbol}</td>
                <td className="px-4 py-3">{brokerName(data.brokers, row.brokerId)}</td>
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
