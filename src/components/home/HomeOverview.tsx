import { ClipboardList, Cpu, Layers, Wallet } from "lucide-react";
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
  masterTo,
  tape,
  showShortcuts = true,
}: {
  name?: string;
  capital: number;
  available: number;
  pnl: number;
  algosTo: string;
  ordersTo: string;
  positionsTo: string;
  masterTo?: string;
  tape?: ReactNode;
  showShortcuts?: boolean;
}) {
  const first = String(name || "trader").split(/\s+/)[0];

  return (
    <div className="space-y-3" data-home-overview="phone">
      <div>
        <div className="text-lg font-extrabold tracking-tight">Hello, {first}</div>
        <div className="text-xs text-slate-400">Welcome back!</div>
      </div>

      {tape}

      <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-3">
        <MetricTile label="Total capital" value={formatRupee(capital, 0)} />
        <MetricTile label="Available margin" value={formatRupee(available, 0)} />
        <MetricTile label="Today's P&L" value={formatRupee(pnl)} signed={pnl} />
      </div>

      {showShortcuts ? (
        <div
          className={masterTo ? "grid grid-cols-2 gap-2 min-[420px]:grid-cols-4" : "grid grid-cols-3 gap-2"}
          data-home-shortcuts="algos-positions-orders"
        >
          <QuickLink to={algosTo} label="Algos" icon={Cpu} />
          <QuickLink to={positionsTo} label="Position" icon={Wallet} />
          <QuickLink to={ordersTo} label="Orders" icon={Layers} />
          {masterTo ? <QuickLink to={masterTo} label="Master report" icon={ClipboardList} /> : null}
        </div>
      ) : null}
    </div>
  );
}
