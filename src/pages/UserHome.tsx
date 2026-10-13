import { useEffect, useState } from "react";
import { getMemberDesk, type MemberDesk } from "../api/client";
import { UserHomeBoard } from "../components/home/UserHomeBoard";
import { useAuth } from "../context/AuthContext";
import { memberDeskFunds } from "../lib/memberFunds";

export function UserHome() {
  const { user } = useAuth();
  const [desk, setDesk] = useState<MemberDesk | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () => {
      void getMemberDesk()
        .then((nextDesk) => {
          if (!alive) return;
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
  const funds = memberDeskFunds(desk);
  const pnl = Number(report?.netPnl || desk?.wallet.mtm || 0);
  const plan = (desk?.plans || [])[0];

  return (
    <div className="space-y-3" data-user-home="true">
      <UserHomeBoard
        name={user?.name}
        capital={funds.capital}
        available={funds.available}
        pnl={pnl}
        plan={plan ? { name: plan.strategyName, status: plan.status, term: plan.term, endsAt: plan.endsAt } : null}
        algosTo="/plans"
      />
    </div>
  );
}

