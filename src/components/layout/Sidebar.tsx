import type { LucideIcon } from "lucide-react";
import {
  Activity,
  BarChart3,
  Briefcase,
  Cpu,
  Home,
  Layers,
  Moon,
  PieChart,
  Settings,
  Sun,
  Zap,
} from "lucide-react";
import { NavLink } from "react-router-dom";
import { useTheme } from "../../context/ThemeContext";
import { cn } from "../../lib/format";

const items: Array<{ to: string; label: string; icon: LucideIcon }> = [
  { to: "/", label: "Home", icon: Home },
  { to: "/markets", label: "Markets", icon: BarChart3 },
  { to: "/options", label: "Options", icon: Layers },
  { to: "/signals", label: "Signals", icon: Zap },
  { to: "/algo", label: "Algo", icon: Cpu },
  { to: "/portfolio", label: "Portfolio", icon: Briefcase },
  { to: "/analytics", label: "Analytics", icon: PieChart },
  { to: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar() {
  const { theme, toggleTheme } = useTheme();

  return (
    <aside className="fixed inset-y-0 left-0 z-30 flex w-[68px] flex-col items-center border-r border-[var(--border)] bg-[var(--card)] py-3">
      <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-brand-500 text-sm font-extrabold text-white shadow-card">
        T2
      </div>
      <nav className="flex flex-1 flex-col gap-1">
        {items.map((item) => (
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
