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
    <div className="space-y-2.5">
      <section className="card px-3 py-2">
        <div className="text-[10px] font-extrabold uppercase tracking-wide text-slate-400">Member dashboard</div>
        <h1 className="truncate text-sm font-extrabold">{user?.email || ""}</h1>
      </section>

      <MemberIndexBoard indices={indices} note={quoteNote} />

      <div className="grid gap-3 md:grid-cols-4">
        <Stat label="Balance" value={formatInr(memberBalance(desk))} signed={memberBalance(desk)} />
        <Stat label="MTM" value={formatInr(desk?.wallet.mtm || 0)} signed={desk?.wallet.mtm} />
        <Stat label="P&L" value={formatInr(report?.realizedPnl || 0)} signed={report?.realizedPnl} />
        <Stat label="Net P&L" value={formatInr(report?.netPnl || 0)} signed={report?.netPnl} />
      </div>
      {desk?.brokerId === "kotak" && !Number.isFinite(Number(desk.wallet.brokerBalance)) ? (
        <p className="text-xs text-slate-500">
          Balance, MTM, and P&L use this Kotak account after the trade login (mobile, MPIN, and TOTP) or the Neo sid and today's session token are saved on Profile.
        </p>
      ) : null}

      <MemberLiveBook
        positions={desk?.positions || []}
        orders={desk?.orders || []}
        orderHistory={desk?.orderHistory || []}
        tradeBook={report?.tradeBook}
        brokerName={brokerName}
      />

      <div className="grid gap-3 sm:grid-cols-2">
        <article className="card p-3">
          <Wallet size={16} className="text-brand-500" />
          <h2 className="mt-1.5 text-sm font-bold">Plan report · MTM</h2>
          <p className="mt-0.5 text-xs leading-4 text-slate-500">
            Enroll a term. After payment and token, copies use this account.
          </p>
          <Link to="/plans" className="mt-2 inline-flex h-8 items-center rounded-md bg-brand-500 px-3 text-xs font-semibold text-white">
            Open my plan
          </Link>
        </article>
        <article className="card p-3">
          <Bell size={16} className="text-brand-500" />
          <h2 className="mt-1.5 text-sm font-bold">Updates</h2>
          <p className="mt-0.5 text-xs leading-4 text-slate-500">Copied admin orders land here and in Alerts.</p>
          <CopyAlerts alerts={(desk?.alerts || []).slice(0, 3)} />
          <Link to="/notifications" className="mt-2 inline-flex h-8 items-center rounded-md bg-brand-500 px-3 text-xs font-semibold text-white">
            Open alerts
          </Link>
        </article>
        <article className="card p-3">
          <UserRound size={16} className="text-brand-500" />
          <h2 className="mt-1.5 text-sm font-bold">Your profile</h2>
          <p className="mt-0.5 text-xs leading-4 text-slate-500">Name, Gmail, mobile, broker, and static IP.</p>
          <Link to="/profile" className="mt-2 inline-flex h-8 items-center rounded-md bg-brand-500 px-3 text-xs font-semibold text-white">
            Open profile
          </Link>
        </article>
        <article className="card p-3">
          <Shield size={16} className="text-brand-500" />
          <h2 className="mt-1.5 text-sm font-bold">Admin desk</h2>
          <p className="mt-0.5 text-xs leading-4 text-slate-500">Brokers, algos, live orders, and settings are admin-only.</p>
        </article>
      </div>
    </div>
  );
}

function CopyAlerts({ alerts }: { alerts: MemberCopyAlert[] }) {
  if (!alerts.length) {
    return <p className="mt-3 text-xs text-slate-400">No copied orders today.</p>;
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

function memberBalance(desk: MemberDesk | null) {
  const broker = Number(desk?.wallet.brokerBalance);
  if (Number.isFinite(broker)) return broker;
  return Number(desk?.wallet.balance) || 0;
}

function Stat({ label, value, signed }: { label: string; value: string; signed?: number }) {
  return (
    <div className="card px-3 py-2">
      <div className="text-[10px] font-semibold uppercase text-slate-400">{label}</div>
      <div className={cn("mt-0.5 text-base font-bold", signed != null && (signed >= 0 ? "text-up" : "text-down"))}>{value}</div>
    </div>
  );
}
