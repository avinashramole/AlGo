import { Activity, Cpu } from "lucide-react";
import { Link } from "react-router-dom";
import { cn, formatPct, formatPlanTerm, formatRupee, greetingIst } from "../../lib/format";
import { StatusPill } from "../phone/PhoneUi";

export type UserHomePlan = {
  name: string;
  status?: string;
  term?: string;
  endsAt?: string;
};

export function UserHomeBoard({
  name,
  capital,
  available,
  pnl,
  plan,
  algosTo,
}: {
  name?: string;
  capital: number;
  available: number;
  pnl: number;
  plan?: UserHomePlan | null;
  algosTo: string;
}) {
  const first = String(name || "Investor").split(/\s+/)[0];
  const used = Math.max(0, capital - available);
  const utilized = capital > 0 ? Math.min(100, (used / capital) * 100) : 0;
  const ret = capital > 0 ? (pnl / capital) * 100 : 0;
  const active = Boolean(plan?.name) && !/abandon|cancel|expired/i.test(String(plan?.status || ""));
  const planName = plan?.name || "No plan yet";
  const planDetail = plan?.name
    ? `${formatPlanTerm(plan.term)}${plan.endsAt ? ` · till ${String(plan.endsAt).slice(0, 10)}` : ""}`
    : "Enroll a strategy on Algos.";

  return (
    <div className="space-y-4" data-home-overview="member">
      <div>
        <div className="truncate text-lg font-extrabold tracking-tight">
          {greetingIst()}, {first}!
        </div>
        <div className="text-xs text-slate-400">Trade2Smart. Stay Disciplined.</div>
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-extrabold">Portfolio Overview</h2>
        <div className="grid grid-cols-2 gap-2">
          <Metric label="Total Portfolio Value" value={formatRupee(capital, 0)} />
          <Metric label="Available Margin" value={formatRupee(available, 0)} />
          <Metric label="Today's P&L" value={formatRupee(pnl)} signed={pnl} />
          <Metric label="Overall Return" value={formatPct(ret)} signed={ret} />
        </div>
      </section>

      <section className="card space-y-2 p-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-extrabold">Capital Utilization</h2>
          <span className="text-sm font-extrabold">{Math.round(utilized)}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
          <div className="h-full rounded-full bg-brand-500" style={{ width: `${utilized}%` }} />
        </div>
        <p className="text-xs text-slate-400">
          {formatRupee(used, 0)} utilized out of {formatRupee(capital, 0)}
        </p>
      </section>

      <section className="card space-y-1 p-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-extrabold">Your Subscription Plan</h2>
          <StatusPill label={active ? "Active" : "Off"} tone={active ? "live" : "muted"} />
        </div>
        <div className="text-base font-extrabold">{planName}</div>
        <p className="text-xs text-slate-400">{planDetail}</p>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-extrabold">Trading Workspace</h2>
        <div className="grid grid-cols-2 gap-2" data-home-workspace="algos-tape">
          <WorkspaceLink to={algosTo} icon={Cpu} title="Algorithmic Strategies" detail="Manage & monitor strategies" />
          <WorkspaceLink to="/tape" icon={Activity} title="Market tape" detail="Live market activity" />
        </div>
      </section>
    </div>
  );
}

function Metric({ label, value, signed }: { label: string; value: string; signed?: number }) {
  const tone = signed == null ? "" : signed > 0 ? "text-up" : signed < 0 ? "text-down" : "text-[var(--text)]";
  return (
    <div className="card min-w-0 p-4">
      <div className="text-[11px] font-semibold text-slate-400">{label}</div>
      <div className={cn("mt-2 truncate text-lg font-extrabold", tone)}>{value}</div>
    </div>
  );
}

function WorkspaceLink({
  to,
  icon: Icon,
  title,
  detail,
}: {
  to: string;
  icon: typeof Cpu;
  title: string;
  detail: string;
}) {
  return (
    <Link to={to} className="card flex flex-col items-start gap-2 p-4">
      <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-brand-50 text-brand-500">
        <Icon size={18} />
      </span>
      <span className="text-sm font-extrabold">{title}</span>
      <span className="text-xs text-slate-400">{detail}</span>
    </Link>
  );
}
