import { useMarket } from "../../context/MarketContext";
import { cn, formatInr, formatNumber, fundsCaption } from "../../lib/format";

export function PortfolioSummary() {
  const { data } = useMarket();
  const invested = (data.positions || []).reduce((sum, row) => sum + row.avg * row.qty, 0);
  const connected = (data.brokers || []).filter((item) => item.connected);

  return (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-3">
        <Card label="Invested" value={`₹${formatNumber(invested)}`} />
        <Card label="Day P&L" value={formatInr(data.totalPnl)} positive={data.totalPnl >= 0} />
        <Card label="Brokers" value={String(connected.length)} />
      </div>
      {connected.length ? (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          {connected.map((broker) => (
            <div key={broker.id} className="card p-4">
              <div className="text-[11px] font-semibold uppercase text-slate-400">{broker.name}</div>
              <div className={cn("mt-1 text-lg font-bold", (data.pnlByBroker?.[broker.id] || 0) >= 0 ? "text-up" : "text-down")}>
                {formatInr(data.pnlByBroker?.[broker.id] || 0)}
              </div>
              <div className="text-xs text-slate-400">Funds {fundsCaption(broker)}</div>
            </div>
          ))}
        </div>
      ) : null}
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
