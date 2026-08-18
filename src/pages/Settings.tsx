import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useMarket } from "../context/MarketContext";

export function Settings() {
  const { user, logout } = useAuth();
  const { data } = useMarket();
  const rows = [
    ["Account", user?.email || "demo@t2s.app"],
    ["Desk", user?.desk || "Index Options"],
    ["Default product", data.settings.product || "MIS"],
    ["Order confirmation", data.settings.confirmation || "Enabled"],
    ["Risk guard", data.settings.riskGuard || "Max 2% per trade"],
    ["Active broker", data.brokers?.find((item) => item.active)?.name || "Paper Trading"],
    ["Connected brokers", String((data.brokers || []).filter((item) => item.connected).length)],
    ["Notifications", data.settings.notifications || "Signals + fills"],
  ];

  return (
    <div className="mx-auto max-w-2xl space-y-3">
      <h1 className="text-xl font-bold">Settings</h1>
      <section className="card divide-y divide-[var(--border)]">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-center justify-between px-4 py-3">
            <span className="text-sm">{label}</span>
            <span className="text-sm font-semibold text-slate-500">{value}</span>
          </div>
        ))}
      </section>
      <Link to="/brokers" className="inline-flex h-10 items-center rounded-xl bg-brand-50 px-4 text-sm font-semibold text-brand-500">
        Open broker hub
      </Link>
      <button type="button" onClick={logout} className="ml-2 h-10 rounded-xl bg-rose-50 px-4 text-sm font-semibold text-down">
        Log out
      </button>
    </div>
  );
}
