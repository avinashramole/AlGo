import type { LucideIcon } from "lucide-react";
import { Cpu, FileText, Home, Layers, User } from "lucide-react";
import { NavLink } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { isNativeHybrid } from "../../lib/hybrid";
import { isAdminUser } from "../../lib/roles";
import { cn } from "../../lib/format";

const tabs: Array<{ to: string; label: string; icon: LucideIcon; admin?: boolean; member?: boolean }> = [
  { to: "/", label: "Home", icon: Home },
  { to: "/algo", label: "Algos", icon: Cpu, admin: true },
  { to: "/plans", label: "Algos", icon: Cpu, member: true },
  { to: "/orders", label: "Orders", icon: Layers },
  { to: "/reports", label: "Reports", icon: FileText },
  { to: "/profile", label: "Profile", icon: User },
];

export function MobileNav() {
  const { user } = useAuth();
  const admin = isAdminUser(user);
  const visible = tabs.filter((item) => (admin ? !item.member : !item.admin));

  return (
    <nav
      className={cn(
        "t2s-mobile-nav fixed inset-x-0 bottom-0 z-50 border-t border-[var(--border)] bg-white pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_24px_rgba(15,39,68,0.06)] dark:bg-[var(--card)]",
        isNativeHybrid() ? "" : "md:hidden",
      )}
    >
      <div className="grid grid-cols-5">
        {visible.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/"}
            className={({ isActive }) =>
              cn(
                "flex min-h-12 max-w-full flex-col items-center justify-center gap-0.5 px-0.5 text-center text-[10px] font-semibold leading-tight",
                isActive ? "text-brand-500" : "text-slate-400",
              )
            }
          >
            <item.icon size={18} />
            {item.label}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
