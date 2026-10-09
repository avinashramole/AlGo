import type { LucideIcon } from "lucide-react";
import {
  Activity,
  Bell,
  Building2,
  Cpu,
  FileText,
  Home,
  Wallet,
  Layers,
  MessageSquare,
  Moon,
  PieChart,
  Settings,
  Sun,
  User,
  Users,
} from "lucide-react";
import { NavLink } from "react-router-dom";
import { BrandMark } from "../BrandMark";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../context/ThemeContext";
import { isNativeHybrid } from "../../lib/hybrid";
import { isAdminUser } from "../../lib/roles";
import { cn } from "../../lib/format";

const items: Array<{ to: string; label: string; icon: LucideIcon; admin?: boolean; member?: boolean }> = [
  { to: "/", label: "Home", icon: Home },
  { to: "/plans", label: "My plan", icon: Wallet, member: true },
  { to: "/notifications", label: "Alerts", icon: Bell, member: true },
  { to: "/options", label: "Option Chain", icon: Layers, admin: true },
  { to: "/algo", label: "Algo", icon: Cpu, admin: true },
  { to: "/reports", label: "Reports", icon: FileText, admin: true },
  { to: "/brokers", label: "Brokers", icon: Building2, admin: true },
  { to: "/analytics", label: "Analytics", icon: PieChart, admin: true },
  { to: "/users", label: "User & IP Manager", icon: Users, admin: true },
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
    <aside className={cn("desk-chrome fixed inset-y-0 left-0 z-30 w-56 flex-col py-3", isNativeHybrid() ? "hidden" : "hidden md:flex")}>
      <NavLink to="/" end className="mb-4 flex items-center gap-2.5 px-3" title="Trade 2 Smart">
        <BrandMark variant="emblem" size="md" />
        <span className="min-w-0">
          <span className="block truncate text-[13px] font-extrabold tracking-tight text-white">Trade 2 Smart</span>
          <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45">
            {admin ? "Admin desk" : "Member desk"}
          </span>
        </span>
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
                "flex h-10 items-center gap-3 rounded-xl px-3 text-[13px] font-semibold transition-colors",
                isActive
                  ? "bg-white/10 text-white shadow-[inset_3px_0_0_#fd6b01]"
                  : "text-white/55 hover:bg-white/5 hover:text-white",
              )
            }
          >
            <item.icon size={17} className="shrink-0" />
            <span className="truncate">{item.label}</span>
          </NavLink>
        ))}
      </nav>
      <div className="mt-1 space-y-1 px-2">
        <button
          type="button"
          onClick={toggleTheme}
          className="flex h-10 w-full items-center gap-3 rounded-xl px-3 text-[13px] font-semibold text-white/55 hover:bg-white/5 hover:text-white"
          title="Toggle theme"
        >
          {theme === "light" ? <Sun size={17} className="shrink-0" /> : <Moon size={17} className="shrink-0" />}
          <span>Theme</span>
        </button>
        <div className="flex h-9 items-center gap-3 rounded-xl px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/35">
          <Activity size={13} className="shrink-0" />
          <span>Live desk</span>
        </div>
      </div>
    </aside>
  );
}
