import { Bell, LogOut, MessageSquare, Moon, Search, Sun, User } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useMarket } from "../../context/MarketContext";
import { useTheme } from "../../context/ThemeContext";

export function Header() {
  const { theme, toggleTheme } = useTheme();
  const { logout, user } = useAuth();
  const { live, data } = useMarket();
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const time = now.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-4 border-b border-[var(--border)] bg-[var(--card)] px-5">
      <div className="text-lg font-extrabold tracking-tight text-slate-900 dark:text-white">
        T2S
      </div>
      <div className="relative mx-auto w-full max-w-xl">
        <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
        <input
          className="h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] pl-10 pr-4 text-sm outline-none placeholder:text-slate-400 focus:border-brand-500"
          placeholder="Search NIFTY, BANKNIFTY, Strategy, Order..."
        />
      </div>
      <div className="ml-auto flex items-center gap-3">
        <div className="flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
          <span className="pulse-dot h-2 w-2 rounded-full bg-up" />
          {data.marketStatus === "OPEN" ? "Market Open" : "Market Closed"}
          {live ? " · LIVE" : " · DEMO"}
          <span className="font-medium text-emerald-600/80 dark:text-emerald-400">{time.toUpperCase()}</span>
        </div>
        <Link to="/notifications" className="icon-btn" title="Notifications">
          <Bell size={17} />
        </Link>
        <Link to="/chat" className="icon-btn" title="Chat">
          <MessageSquare size={17} />
        </Link>
        <button type="button" onClick={toggleTheme} className="icon-btn" title="Theme">
          {theme === "light" ? <Moon size={17} /> : <Sun size={17} />}
        </button>
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-500 text-white" title={user?.name}>
          <User size={16} />
        </div>
        <button type="button" onClick={logout} className="icon-btn" title="Log out">
          <LogOut size={17} />
        </button>
      </div>
    </header>
  );
}
