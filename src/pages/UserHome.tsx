import { useEffect, useState } from "react";
import { getMemberDesk, getMemberQuotes, type MemberDesk, type MemberIndexQuote } from "../api/client";
import { HomeOverview } from "../components/home/HomeOverview";
import { DeskTape, TapeCell } from "../components/dashboard/DeskTape";
import { MemberIndexBoard } from "../components/dashboard/MemberIndexBoard";
import { useAuth } from "../context/AuthContext";
import { formatInr } from "../lib/format";
import { isNativeHybrid } from "../lib/hybrid";

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
  const balance = memberBalance(desk);
  const available = Number(desk?.wallet.balance) || 0;
  const pnl = Number(report?.netPnl || desk?.wallet.mtm || 0);

  return (
    <div className="space-y-3" data-user-home="true">
      <HomeOverview
        name={user?.name}
        capital={balance}
        available={available}
        pnl={pnl}
        algosTo="/plans"
        ordersTo="/reports?tab=orders"
        positionsTo="/reports?tab=positions"
        showShortcuts={!isNativeHybrid()}
        tape={<MemberIndexBoard indices={indices} note={quoteNote} />}
      />

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
    </div>
  );
}

function memberBalance(desk: MemberDesk | null) {
  const broker = Number(desk?.wallet.brokerBalance);
  if (Number.isFinite(broker)) return broker;
  return Number(desk?.wallet.balance) || 0;
}

