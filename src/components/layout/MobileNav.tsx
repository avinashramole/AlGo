import type { LucideIcon } from "lucide-react";
import {
  Bell,
  BookOpen,
  Briefcase,
  Building2,
  ClipboardList,
  Cpu,
  CreditCard,
  FileText,
  Home,
  Layers,
  Menu,
  MessageSquare,
  Network,
  Moon,
  PieChart,
  Settings,
  Sun,
  User,
  Wallet,
  X,
  Zap,
  BarChart3,
} from "lucide-react";
import { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../context/ThemeContext";
import { isAdminUser } from "../../lib/roles";
import { cn } from "../../lib/format";

const primary: Array<{ to: string; label: string; icon: LucideIcon; admin?: boolean }> = [
  { to: "/", label: "Home", icon: Home },
  { to: "/options", label: "Chain", icon: Layers, admin: true },
  { to: "/orders", label: "Orders", icon: ClipboardList, admin: true },
  { to: "/positions", label: "Book", icon: BookOpen, admin: true },
];

const moreItems: Array<{ to: string; label: string; icon: LucideIcon; admin?: boolean }> = [
  { to: "/markets", label: "Markets", icon: BarChart3, admin: true },
  { to: "/signals", label: "Signals", icon: Zap, admin: true },
  { to: "/algo", label: "Algo", icon: Cpu, admin: true },
  { to: "/reports", label: "Reports", icon: FileText, admin: true },
  { to: "/portfolio", label: "Portfolio", icon: Briefcase, admin: true },
  { to: "/brokers", label: "Brokers", icon: Building2, admin: true },
  { to: "/analytics", label: "Analytics", icon: PieChart, admin: true },
  { to: "/users", label: "Users", icon: User, admin: true },
  { to: "/settings/ips", label: "IPs", icon: Network, admin: true },
  { to: "/notifications", label: "Alerts", icon: Bell, admin: true },
  { to: "/chat", label: "Messages", icon: MessageSquare, admin: true },
  { to: "/profile", label: "Profile", icon: User },
  { to: "/settings", label: "Settings", icon: Settings, admin: true },
];

export function MobileNav() {
  const location = useLocation();
  const { theme, toggleTheme } = useTheme();
  const { user } = useAuth();
  const admin = isAdminUser(user);
  const [moreOpen, setMoreOpen] = useState(false);
  const visiblePrimary = (
    admin
      ? primary
      : [
          { to: "/", label: "Home", icon: Home },
          { to: "/subscriptions", label: "Plans", icon: CreditCard },
          { to: "/plans", label: "Report", icon: Wallet },
          { to: "/profile", label: "Profile", icon: User },
        ]
  ) as typeof primary;
  const visibleMore = moreItems.filter((item) => admin || !item.admin);
  const moreActive = visibleMore.some((item) => item.to === location.pathname);

  useEffect(() => {
    setMoreOpen(false);
  }, [location.pathname]);

  return (
    <>
      {moreOpen ? (
        <div className="fixed inset-0 z-40 md:hidden">
          <button type="button" className="absolute inset-0 bg-slate-900/40" aria-label="Close menu" onClick={() => setMoreOpen(false)} />
          <div className="absolute inset-x-0 bottom-16 rounded-t-2xl border border-[var(--border)] bg-[var(--card)] p-3 pb-[max(12px,env(safe-area-inset-bottom))] shadow-lg">
            <div className="mb-2 flex items-center justify-between px-1">
              <div className="text-sm font-bold">More</div>
              <button type="button" className="icon-btn" onClick={() => setMoreOpen(false)} aria-label="Close">
                <X size={18} />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {visibleMore.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    cn(
                      "flex flex-col items-center gap-1 rounded-xl px-2 py-3 text-[11px] font-semibold",
                      isActive ? "bg-brand-50 text-brand-500 dark:bg-brand-500/15" : "bg-[var(--bg)] text-slate-500",
                    )
                  }
                >
                  <item.icon size={18} />
                  {item.label}
                </NavLink>
              ))}
              <button
                type="button"
                onClick={toggleTheme}
                className="flex flex-col items-center gap-1 rounded-xl bg-[var(--bg)] px-2 py-3 text-[11px] font-semibold text-slate-500"
              >
                {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
                Theme
              </button>
            </div>
          </div>
        </div>
      ) : null}
      <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-[var(--border)] bg-[var(--card)] pb-[env(safe-area-inset-bottom)] md:hidden">
        <div className={admin ? "grid grid-cols-5" : "grid grid-cols-4"}>
          {visiblePrimary.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) =>
                cn(
                  "flex min-h-12 flex-col items-center justify-center gap-0.5 text-[10px] font-semibold",
                  isActive ? "text-brand-500" : "text-slate-400",
                )
              }
            >
              <item.icon size={18} />
              {item.label}
            </NavLink>
          ))}
          {admin ? (
            <button
              type="button"
              onClick={() => setMoreOpen((value) => !value)}
              className={cn(
                "flex min-h-12 flex-col items-center justify-center gap-0.5 text-[10px] font-semibold",
                moreOpen || moreActive ? "text-brand-500" : "text-slate-400",
              )}
            >
              <Menu size={18} />
              More
            </button>
          ) : null}
        </div>
      </nav>
    </>
  );
}
