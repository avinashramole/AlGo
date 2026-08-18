import { Bell, LogOut, MessageSquare, Moon, Search, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { BrokerSwitch } from "./BrokerSwitch";
import { useAuth } from "../../context/AuthContext";
import { useMarket } from "../../context/MarketContext";
import { useTheme } from "../../context/ThemeContext";
import { cn, formatIstClock, isNseSessionOpen } from "../../lib/format";

export function Header() {
  const { theme, toggleTheme } = useTheme();
  const { logout, user } = useAuth();
  const { live, data } = useMarket();
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const marketOpen = isNseSessionOpen(now);
  const dhanLive = Boolean(data.dhanFeed?.live);
  const lastTick = data.dhanFeed?.lastTickAt
    ? new Date(data.dhanFeed.lastTickAt).toLocaleTimeString("en-IN", {
        timeZone: "Asia/Kolkata",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      })
    : null;

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
        <BrokerSwitch />
        <div
          className={cn(
            "flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold",
            marketOpen
              ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300"
              : "border-slate-200 bg-slate-100 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300",
          )}
          title={marketOpen ? "NSE cash/F&O session 09:15–15:30 IST" : "NSE is closed. Session 09:15–15:30 IST, Mon–Fri."}
        >
          <span className={cn("h-2 w-2 rounded-full", marketOpen ? "pulse-dot bg-up" : "bg-slate-400")} />
          {marketOpen ? "Market Open" : "Market Closed"}
          {dhanLive ? " · DHAN LIVE" : live ? " · LIVE" : " · DEMO"}
          <span className={cn("font-medium", marketOpen ? "text-emerald-600/80 dark:text-emerald-400" : "text-slate-500")}>
            {formatIstClock(now)}
          </span>
          {dhanLive && lastTick ? <span className="hidden font-medium text-slate-400 lg:inline">· tick {lastTick}</span> : null}
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
        <div className="hidden items-center gap-2 sm:flex" title={user?.email}>
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-500 text-xs font-bold text-white">
            {(user?.name || "T").slice(0, 1).toUpperCase()}
          </div>
          <div className="hidden lg:block">
            <div className="text-xs font-bold leading-tight">{user?.name || "T2S"}</div>
            <div className="text-[10px] font-semibold text-slate-400">{user?.email || ""}</div>
          </div>
        </div>
        <button type="button" onClick={logout} className="icon-btn" title="Log out">
          <LogOut size={17} />
        </button>
      </div>
    </header>
  );
}
