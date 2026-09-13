import type { LucideIcon } from "lucide-react";
import {
  Activity,
  BarChart3,
  BookOpen,
  Briefcase,
  Building2,
  ClipboardList,
  Cpu,
  CreditCard,
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
  { to: "/subscriptions", label: "Subscriptions", icon: CreditCard, member: true },
  { to: "/plans", label: "My plan", icon: Wallet, member: true },
  { to: "/markets", label: "Markets", icon: BarChart3, admin: true },
  { to: "/options", label: "Chain", icon: Layers, admin: true },
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
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-[68px] flex-col items-center border-r border-[var(--border)] bg-[var(--card)] py-3 md:flex">
      <NavLink to="/" end title="Trade 2 Smart" className="mb-4 flex h-10 w-10 items-center justify-center">
        <BrandMark variant="emblem" size="md" />
      </NavLink>
      <nav className="flex flex-1 flex-col gap-1">
        {visible.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/"}
            title={item.label}
            className={({ isActive }) =>
              cn(
                "flex h-10 w-10 items-center justify-center rounded-xl transition-colors",
                isActive
                  ? "bg-brand-50 text-brand-500 dark:bg-brand-500/15 dark:text-blue-300"
                  : "text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200",
              )
            }
          >
            <item.icon size={18} />
          </NavLink>
        ))}
      </nav>
      <button
        type="button"
        onClick={toggleTheme}
        className="mb-1 flex h-10 w-10 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
        title="Toggle theme"
      >
        {theme === "light" ? <Sun size={18} /> : <Moon size={18} />}
      </button>
      <div className="mb-1 flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-[10px] text-slate-500 dark:bg-slate-800">
        <Activity size={14} />
      </div>
    </aside>
  );
}
