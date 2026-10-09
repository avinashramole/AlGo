import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getMemberDesk, getMemberQuotes, type MemberCopyAlert, type MemberDesk, type MemberIndexQuote } from "../api/client";
import { DeskTape, TapeCell } from "../components/dashboard/DeskTape";
import { MemberIndexBoard } from "../components/dashboard/MemberIndexBoard";
import { MemberLiveBook } from "../components/desk/MemberLiveBook";
import { useAuth } from "../context/AuthContext";
import { formatInr, formatIst } from "../lib/format";

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
    const id = window.setInterval(load, 2000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, []);

  const report = desk?.report;
  const navigate = useNavigate();
  const brokerName = (id?: string) => desk?.brokers.find((row) => row.id === id)?.name || id || "Paper";
  const balance = memberBalance(desk);

  return (
    <div className="space-y-3">
      <DeskTape kicker="Member" extra={user?.email || ""} testId="member-home">
        <TapeCell title="Account" value={user?.email || "—"} detail="Signed in" />
      </DeskTape>

      <MemberIndexBoard indices={indices} note={quoteNote} />

      <DeskTape kicker="P&L" extra="Live" testId="member-pnl">
        <TapeCell title="Balance" value={formatInr(balance)} tone={balance >= 0 ? "text-up" : "text-down"} />
        <TapeCell title="MTM" value={formatInr(desk?.wallet.mtm || 0)} tone={(desk?.wallet.mtm || 0) >= 0 ? "text-up" : "text-down"} />
        <TapeCell title="P&L" value={formatInr(report?.realizedPnl || 0)} tone={(report?.realizedPnl || 0) >= 0 ? "text-up" : "text-down"} />
        <TapeCell title="Net P&L" value={formatInr(report?.netPnl || 0)} tone={(report?.netPnl || 0) >= 0 ? "text-up" : "text-down"} />
      </DeskTape>
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

      <DeskTape kicker="Desk" extra="Tap" testId="member-links">
        <TapeCell title="Plan" value="MTM" detail="Open my plan" onClick={() => navigate("/plans")} />
        <TapeCell
          title="Alerts"
          value={String((desk?.alerts || []).length || 0)}
          detail={(desk?.alerts || [])[0]?.text || "Open alerts"}
          onClick={() => navigate("/notifications")}
        />
        <TapeCell title="Profile" value="You" detail="Name · broker · IP" onClick={() => navigate("/profile")} />
        <TapeCell title="Admin" value="Desk" detail="Brokers and algos stay admin-only" />
      </DeskTape>
      <CopyAlerts alerts={(desk?.alerts || []).slice(0, 3)} />
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

