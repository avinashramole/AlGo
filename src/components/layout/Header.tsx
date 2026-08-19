import { Bell, LogOut, MessageSquare, Moon, Search, Sun } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { BrandMark } from "../BrandMark";
import { BrokerSwitch } from "./BrokerSwitch";
import { useAuth } from "../../context/AuthContext";
import { useMarket } from "../../context/MarketContext";
import { useTheme } from "../../context/ThemeContext";
import { cn, formatIstClock, formatMobile, isNseSessionOpen } from "../../lib/format";

export function Header() {
  const { theme, toggleTheme } = useTheme();
  const { logout, user } = useAuth();
  const { live, data } = useMarket();
  const [now, setNow] = useState(() => new Date());
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
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
    <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-[var(--border)] bg-[var(--card)] px-3 md:h-16 md:gap-4 md:px-5">
      <Link to="/" className="shrink-0" title="Trade 2 Smart">
        <BrandMark variant="horizontal" size="md" theme={theme} />
      </Link>
      <div className="relative mx-auto hidden w-full max-w-xl md:block">
        <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
        <input
          className="h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] pl-10 pr-4 text-sm outline-none placeholder:text-slate-400 focus:border-brand-500"
          placeholder="Search NIFTY, BANKNIFTY, Strategy, Order..."
        />
      </div>
      <div className="ml-auto flex min-w-0 items-center gap-1.5 md:gap-3">
        <BrokerSwitch />
        <div
          className={cn(
            "flex max-w-[28vw] shrink items-center gap-1.5 overflow-hidden rounded-full border px-2 py-1 text-[10px] font-semibold sm:max-w-[42vw] md:max-w-none md:gap-2 md:px-3 md:py-1.5 md:text-xs",
            marketOpen
              ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300"
              : "border-slate-200 bg-slate-100 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300",
          )}
          title={marketOpen ? "NSE cash/F&O session 09:15–15:30 IST" : "NSE is closed. Session 09:15–15:30 IST, Mon–Fri."}
        >
          <span className={cn("h-2 w-2 shrink-0 rounded-full", marketOpen ? "pulse-dot bg-up" : "bg-slate-400")} />
          <span className="truncate">{marketOpen ? "Open" : "Closed"}</span>
          <span className="hidden truncate sm:inline">{dhanLive ? " · DHAN" : live ? " · LIVE" : " · DEMO"}</span>
          <span className={cn("hidden font-medium md:inline", marketOpen ? "text-emerald-600/80 dark:text-emerald-400" : "text-slate-500")}>
            {formatIstClock(now)}
          </span>
          {dhanLive && lastTick ? <span className="hidden font-medium text-slate-400 lg:inline">· tick {lastTick}</span> : null}
        </div>
        <Link to="/notifications" className="icon-btn hidden md:flex" title="Notifications">
          <Bell size={17} />
        </Link>
        <Link to="/chat" className="icon-btn hidden md:flex" title="Chat">
          <MessageSquare size={17} />
        </Link>
        <button type="button" onClick={toggleTheme} className="icon-btn hidden md:flex" title="Theme">
          {theme === "light" ? <Moon size={17} /> : <Sun size={17} />}
        </button>
        <div className="relative" ref={menuRef}>
          <button type="button" onClick={() => setOpen((value) => !value)} className="flex items-center gap-2 rounded-full py-1 pl-1 pr-2 hover:bg-slate-100 dark:hover:bg-slate-800" title="Profile">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-500 text-xs font-bold text-white">
              {(user?.name || "T").slice(0, 1).toUpperCase()}
            </div>
            <div className="hidden text-left lg:block">
              <div className="text-xs font-bold leading-tight">{user?.name || "Trader"}</div>
              <div className="text-[10px] font-semibold text-slate-400">{user?.email || formatMobile(user?.mobile)}</div>
            </div>
          </button>
          {open ? (
            <div className="absolute right-0 top-12 z-30 w-[min(18rem,calc(100vw-1.5rem))] rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-lg">
              <div className="mb-3 text-sm font-extrabold">Profile</div>
              <div className="space-y-2 text-sm">
                <p><span className="text-slate-400">Name</span><br /><span className="font-semibold">{user?.name || "—"}</span></p>
                <p><span className="text-slate-400">Email</span><br /><span className="font-semibold">{user?.email || "Not added"}</span></p>
                <p><span className="text-slate-400">Mobile no</span><br /><span className="font-semibold">{formatMobile(user?.mobile)}</span></p>
              </div>
              <Link to="/profile" onClick={() => setOpen(false)} className="mt-4 flex h-10 items-center justify-center rounded-xl bg-brand-50 text-sm font-semibold text-brand-500">
                Open profile
              </Link>
              <button type="button" onClick={logout} className="mt-2 flex h-10 w-full items-center justify-center rounded-xl bg-rose-50 text-sm font-semibold text-down">
                Log out
              </button>
            </div>
          ) : null}
        </div>
        <button type="button" onClick={logout} className="icon-btn hidden md:flex" title="Log out">
          <LogOut size={17} />
        </button>
      </div>
    </header>
  );
}
