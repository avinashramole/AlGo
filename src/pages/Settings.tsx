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
    ["Broker", data.settings.broker || "Paper trading"],
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
      <button type="button" onClick={logout} className="h-10 rounded-xl bg-rose-50 px-4 text-sm font-semibold text-down">
        Log out
      </button>
    </div>
  );
}
