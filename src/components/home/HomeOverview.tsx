import { Cpu, FileText, Layers, Wallet } from "lucide-react";
import { Link } from "react-router-dom";
import { cn, formatInr, formatRupee } from "../../lib/format";
import { MetricTile, QuickLink, SectionHead, StatusPill } from "../phone/PhoneUi";

export type HomeStrategy = {
  id: string;
  name: string;
  detail: string;
  pnl: number;
  status: string;
  running?: boolean;
  to?: string;
};

export function HomeOverview({
  name,
  capital,
  available,
  pnl,
  algosTo,
  ordersTo,
  positionsTo,
  reportsTo,
  strategies,
}: {
  name?: string;
  capital: number;
  available: number;
  pnl: number;
  algosTo: string;
  ordersTo: string;
  positionsTo: string;
  reportsTo: string;
  strategies: HomeStrategy[];
}) {
  const first = String(name || "trader").split(/\s+/)[0];

  return (
    <div className="space-y-3" data-home-overview="phone">
      <div>
        <div className="text-lg font-extrabold tracking-tight">Hello, {first}</div>
        <div className="text-xs text-slate-400">Welcome back!</div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <MetricTile label="Total capital" value={formatRupee(capital, 0)} />
        <MetricTile label="Available margin" value={formatRupee(available, 0)} />
        <MetricTile label="Today's P&L" value={formatRupee(pnl)} signed={pnl} />
      </div>

      <div className="grid grid-cols-4 gap-2">
        <QuickLink to={algosTo} label="Algos" icon={Cpu} />
        <QuickLink to={ordersTo} label="Orders" icon={Layers} />
        <QuickLink to={positionsTo} label="Positions" icon={Wallet} />
        <QuickLink to={reportsTo} label="Position and Orders" icon={FileText} />
      </div>

      <SectionHead title="Active Strategies" action="View all" to={algosTo} />
      <div className="space-y-2">
        {strategies.map((row) => (
          <Link
            key={row.id}
            to={row.to || algosTo}
            className="card flex items-center justify-between gap-3 p-3"
          >
            <div className="min-w-0">
              <div className="truncate text-sm font-bold">{row.name}</div>
              <div className="mt-0.5 truncate text-[11px] text-slate-400">{row.detail}</div>
            </div>
            <div className="text-right">
              <div className={cn("text-sm font-extrabold", row.pnl >= 0 ? "text-up" : "text-down")}>
                {formatInr(row.pnl)}
              </div>
              <div className="mt-1">
                <StatusPill label={row.running ? "Running" : row.status} tone={row.running ? "live" : "stop"} />
              </div>
            </div>
          </Link>
        ))}
        {!strategies.length ? (
          <div className="card px-4 py-6 text-center text-xs text-slate-400">No active strategies yet.</div>
        ) : null}
      </div>
    </div>
  );
}
