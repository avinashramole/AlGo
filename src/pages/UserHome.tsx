import { useEffect, useState } from "react";
import { Bell, Shield, UserRound, Wallet } from "lucide-react";
import { Link } from "react-router-dom";
import { getMemberDesk, getMemberQuotes, type MemberCopyAlert, type MemberDesk, type MemberIndexQuote } from "../api/client";
import { MemberIndexBoard } from "../components/dashboard/MemberIndexBoard";
import { MemberLiveBook } from "../components/desk/MemberLiveBook";
import { useAuth } from "../context/AuthContext";
import { cn, formatInr, formatIst } from "../lib/format";

export function UserHome() {
  const { user } = useAuth();
  const [indices, setIndices] = useState<MemberIndexQuote[]>([]);
  const [quoteNote, setQuoteNote] = useState("");
  const [desk, setDesk] = useState<MemberDesk | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () => {
      void Promise.all([getMemberQuotes(), getMemberDesk()])
        .then(([quotes, nextDesk]) => {
          if (!alive) return;
          setIndices(quotes.indices || []);
          setQuoteNote(quotes.reason || "");
          setDesk(nextDesk);
        })
        .catch(() => undefined);
    };
    load();
    const id = window.setInterval(load, 5000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, []);

  const report = desk?.report;
  const brokerName = (id?: string) => desk?.brokers.find((row) => row.id === id)?.name || id || "Paper";

  return (
    <div className="space-y-4">
      <section className="card p-6">
        <div className="text-xs font-extrabold uppercase tracking-wide text-slate-400">Member dashboard</div>
        <h1 className="mt-1 text-2xl font-extrabold">Welcome, {user?.name || "trader"}</h1>
        <p className="mt-2 text-sm text-slate-500">
          Signed in with {user?.email || "your account"}. Index cards show price and future only — no VWAP. Copied orders,
          open positions, MTM, and your closed trade book are on this page.
        </p>
        <div className="mt-4 inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-bold uppercase text-slate-500 dark:bg-slate-800">
          {user?.role || "user"}
        </div>
      </section>

      <MemberIndexBoard indices={indices} note={quoteNote} />

      <div className="grid gap-3 md:grid-cols-3">
        <Stat label="Open MTM" value={formatInr(desk?.wallet.mtm || 0)} signed={desk?.wallet.mtm} />
        <Stat label="Realized P&L" value={formatInr(report?.realizedPnl || 0)} signed={report?.realizedPnl} />
        <Stat label="Net P&L" value={formatInr(report?.netPnl || 0)} signed={report?.netPnl} />
      </div>

      <MemberLiveBook
        positions={desk?.positions || []}
        orders={desk?.orders || []}
        orderHistory={desk?.orderHistory || []}
        tradeBook={report?.tradeBook}
        brokerName={brokerName}
      />

      <div className="grid gap-3 sm:grid-cols-2">
        <article className="card p-5">
          <Wallet size={18} className="text-brand-500" />
          <h2 className="mt-3 text-sm font-bold">Plan report · MTM</h2>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            Enroll monthly, quarterly, or yearly. After admin confirms payment and you install your token, live copies use your account size.
          </p>
          <Link to="/plans" className="mt-3 inline-flex h-9 items-center rounded-lg bg-brand-500 px-3 text-xs font-semibold text-white">
            Open my plan
          </Link>
        </article>
        <article className="card p-5">
          <Bell size={18} className="text-brand-500" />
          <h2 className="mt-3 text-sm font-bold">Updates</h2>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            Copied admin orders land here and in Alerts. The same order is sent from your selected broker.
          </p>
          <CopyAlerts alerts={(desk?.alerts || []).slice(0, 3)} />
          <Link to="/notifications" className="mt-3 inline-flex h-9 items-center rounded-lg bg-brand-500 px-3 text-xs font-semibold text-white">
            Open alerts
          </Link>
        </article>
        <article className="card p-5">
          <UserRound size={18} className="text-brand-500" />
          <h2 className="mt-3 text-sm font-bold">Your profile</h2>
          <p className="mt-1 text-xs leading-5 text-slate-500">Name, Gmail, and mobile for this account.</p>
          <Link to="/profile" className="mt-3 inline-flex h-9 items-center rounded-lg bg-brand-500 px-3 text-xs font-semibold text-white">
            Open profile
          </Link>
        </article>
        <article className="card p-5">
          <Shield size={18} className="text-brand-500" />
          <h2 className="mt-3 text-sm font-bold">Admin desk</h2>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            Brokers, algos, live orders, and settings are only for admin users.
          </p>
        </article>
      </div>
    </div>
  );
}

function CopyAlerts({ alerts }: { alerts: MemberCopyAlert[] }) {
  if (!alerts.length) {
    return <p className="mt-3 text-xs text-slate-400">No copied orders yet.</p>;
  }
  return (
    <ul className="mt-3 space-y-2">
      {alerts.map((row) => (
        <li key={row.id} className="rounded-lg bg-[var(--bg)] px-3 py-2 text-xs leading-5 text-slate-600 dark:text-slate-300">
          <div className="font-semibold text-slate-800 dark:text-slate-100">{row.text}</div>
          <div className="text-[11px] text-slate-400">{row.createdAt ? formatIst(row.createdAt) : ""}</div>
        </li>
      ))}
    </ul>
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
