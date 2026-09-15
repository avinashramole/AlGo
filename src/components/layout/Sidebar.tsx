import type { LucideIcon } from "lucide-react";
import {
  Activity,
  BookOpen,
  Briefcase,
  Building2,
  ClipboardList,
  Cpu,
  FileText,
  Home,
  Wallet,
  Layers,
  MessageSquare,
  Moon,
  Network,
  PieChart,
  Settings,
  Sun,
  User,
  Users,
  Zap,
} from "lucide-react";
import { NavLink } from "react-router-dom";
import { BrandMark } from "../BrandMark";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../context/ThemeContext";
import { isAdminUser } from "../../lib/roles";
import { cn } from "../../lib/format";

const items: Array<{ to: string; label: string; icon: LucideIcon; admin?: boolean; member?: boolean }> = [
  { to: "/", label: "Home", icon: Home },
  { to: "/plans", label: "My plan", icon: Wallet, member: true },
  { to: "/options", label: "Option Chain", icon: Layers, admin: true },
  { to: "/signals", label: "Signals", icon: Zap, admin: true },
  { to: "/algo", label: "Algo", icon: Cpu, admin: true },
  { to: "/orders", label: "Orders", icon: ClipboardList, admin: true },
  { to: "/positions", label: "Positions", icon: BookOpen, admin: true },
  { to: "/reports", label: "Reports", icon: FileText, admin: true },
  { to: "/portfolio", label: "Portfolio", icon: Briefcase, admin: true },
  { to: "/brokers", label: "Brokers", icon: Building2, admin: true },
  { to: "/analytics", label: "Analytics", icon: PieChart, admin: true },
  { to: "/users", label: "Users", icon: Users, admin: true },
  { to: "/settings/ips", label: "IP management", icon: Network, admin: true },
  { to: "/chat", label: "Messages", icon: MessageSquare, admin: true },
  { to: "/profile", label: "Profile", icon: User },
  { to: "/settings", label: "Settings", icon: Settings, admin: true },
];

export function Sidebar() {
  const { theme, toggleTheme } = useTheme();
  const { user } = useAuth();
  const admin = isAdminUser(user);
  const visible = items.filter((item) => (admin ? !item.member : !item.admin));

  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-56 flex-col border-r border-[var(--border)] bg-[var(--card)] py-3 md:flex">
      <NavLink to="/" end className="mb-3 flex items-center gap-2.5 px-3" title="Trade 2 Smart">
        <BrandMark variant="emblem" size="md" />
        <span className="truncate text-sm font-extrabold tracking-tight">Trade 2 Smart</span>
      </NavLink>
      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-2">
        {visible.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/"}
            title={item.label}
            className={({ isActive }) =>
              cn(
                "flex h-10 items-center gap-3 rounded-xl px-3 text-sm font-semibold transition-colors",
                isActive
                  ? "bg-brand-50 text-brand-500 dark:bg-brand-500/15 dark:text-blue-300"
                  : "text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200",
              )
            }
          >
            <item.icon size={18} className="shrink-0" />
            <span className="truncate">{item.label}</span>
          </NavLink>
        ))}
      </nav>
      <div className="mt-1 space-y-1 px-2">
        <button
          type="button"
          onClick={toggleTheme}
          className="flex h-10 w-full items-center gap-3 rounded-xl px-3 text-sm font-semibold text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          title="Toggle theme"
        >
          {theme === "light" ? <Sun size={18} className="shrink-0" /> : <Moon size={18} className="shrink-0" />}
          <span>Theme</span>
        </button>
        <div className="flex h-9 items-center gap-3 rounded-xl px-3 text-xs font-semibold text-slate-400">
          <Activity size={14} className="shrink-0" />
          <span>Desk</span>
        </div>
      </div>
    </aside>
  );
}
