import { Cpu, Layers, Wallet } from "lucide-react";
import type { ReactNode } from "react";
import { formatRupee } from "../../lib/format";
import { MetricTile, QuickLink } from "../phone/PhoneUi";

export function HomeOverview({
  name,
  capital,
  available,
  pnl,
  algosTo,
  ordersTo,
  positionsTo,
  tape,
}: {
  name?: string;
  capital: number;
  available: number;
  pnl: number;
  algosTo: string;
  ordersTo: string;
  positionsTo: string;
  tape?: ReactNode;
}) {
  const first = String(name || "trader").split(/\s+/)[0];

  return (
    <div className="space-y-3" data-home-overview="phone">
      <div>
        <div className="text-lg font-extrabold tracking-tight">Hello, {first}</div>
        <div className="text-xs text-slate-400">Welcome back!</div>
      </div>

      {tape}

      <div className="grid grid-cols-3 gap-2">
        <MetricTile label="Total capital" value={formatRupee(capital, 0)} />
        <MetricTile label="Available margin" value={formatRupee(available, 0)} />
        <MetricTile label="Today's P&L" value={formatRupee(pnl)} signed={pnl} />
      </div>

      <div className="grid grid-cols-3 gap-2" data-home-shortcuts="algos-orders-positions">
        <QuickLink to={algosTo} label="Algos" icon={Cpu} />
        <QuickLink to={ordersTo} label="Orders" icon={Layers} />
        <QuickLink to={positionsTo} label="Positions" icon={Wallet} />
      </div>
    </div>
  );
}
