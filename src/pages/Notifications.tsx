import { useEffect, useState } from "react";
import { getMemberDesk, type MemberCopyAlert } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { useMarket } from "../context/MarketContext";
import { isAdminUser } from "../lib/roles";
import { formatIst } from "../lib/format";

export function Notifications() {
  const { user } = useAuth();
  if (isAdminUser(user)) return <AdminNotifications />;
  return <MemberNotifications />;
}

function AdminNotifications() {
  const { data } = useMarket();
  const items = data.notifications || [];
  return (
    <div className="desk-page mx-auto max-w-2xl space-y-2">
      <h1 className="text-xl font-bold">Notifications</h1>
      {!items.length ? (
        <div className="card px-4 py-8 text-center text-sm text-slate-400">
          No live desk alerts yet. Fills, strategy changes, and Dhan notices show here.
        </div>
      ) : null}
      {items.map((item) => (
        <div key={item} className="card px-4 py-3 text-sm">
          {item}
        </div>
      ))}
    </div>
  );
}

function isTradeAlert(row: MemberCopyAlert) {
  const kind = String(row.kind || "copy_order").toLowerCase();
  return kind === "copy_order" || kind === "copy_rejected";
}

function MemberNotifications() {
  const [alerts, setAlerts] = useState<MemberCopyAlert[]>([]);

  useEffect(() => {
    let alive = true;
    const load = () => {
      void getMemberDesk()
        .then((desk) => {
          if (!alive) return;
          setAlerts((desk.alerts || []).filter((row) => !isTradeAlert(row)));
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

  return (
    <div className="desk-page mx-auto max-w-2xl space-y-2">
      <h1 className="text-xl font-bold">Alerts</h1>
      <p className="desk-help text-sm text-slate-500">
        Account and token notices show here. Copied trade fills stay on Position & Orders, not this book.
      </p>
      {!alerts.length ? (
        <div className="card px-4 py-8 text-center text-sm text-slate-400">
          No alerts today.
        </div>
      ) : null}
      {alerts.map((item) => (
        <div key={item.id} className="card px-4 py-3 text-sm">
          <div className="font-semibold">{item.text}</div>
          <div className="mt-1 text-xs text-slate-400">
            {item.createdAt ? formatIst(item.createdAt) : ""}
            {item.status ? ` · ${item.status}` : ""}
          </div>
        </div>
      ))}
    </div>
  );
}
