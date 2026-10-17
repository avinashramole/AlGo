import type { LucideIcon } from "lucide-react";
import { Briefcase, Building2, Cpu, FileText, FlaskConical, Home, LogOut, User } from "lucide-react";
import { NavLink } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { isNativeHybrid } from "../../lib/hybrid";
import { isAdminUser } from "../../lib/roles";
import { cn } from "../../lib/format";

const tabs: Array<{ to: string; label: string; icon: LucideIcon; admin?: boolean; member?: boolean }> = [
  { to: "/", label: "Home", icon: Home },
  { to: "/algo", label: "Algos", icon: Cpu, admin: true },
  { to: "/algo-test", label: "Test", icon: FlaskConical, admin: true },
  { to: "/plans", label: "Algos", icon: Cpu, member: true },
  { to: "/reports", label: "Position & Orders", icon: FileText, admin: true },
  { to: "/positions", label: "Position", icon: Briefcase, member: true },
  { to: "/orders", label: "Orders", icon: FileText, member: true },
  { to: "/broker", label: "Broker", icon: Building2, member: true },
  { to: "/profile", label: "Profile", icon: User, admin: true },
];

const apkMemberTabs: Array<{ to: string; label: string; icon: LucideIcon }> = [
  { to: "/", label: "Home", icon: Home },
  { to: "/positions", label: "Position", icon: Briefcase },
  { to: "/orders", label: "Orders", icon: FileText },
  { to: "/broker", label: "Broker", icon: Building2 },
];

function NavItems({ items }: { items: Array<{ to: string; label: string; icon: LucideIcon }> }) {
  return (
    <>
      {items.map((item) => (
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
    </>
  );
}

export function MobileNav() {
  const { user, requestLogout } = useAuth();
  const admin = isAdminUser(user);
  const apkMember = isNativeHybrid() && !admin;
  const visible = tabs.filter((item) => (admin ? !item.member : !item.admin));

  if (apkMember) {
    return (
      <nav
        className="t2s-mobile-nav t2s-apk-member-nav fixed inset-x-0 bottom-0 z-50 border-t border-[var(--border)] bg-white pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_24px_rgba(15,39,68,0.06)] dark:bg-[var(--card)] md:hidden"
        data-apk-nav="member"
      >
        <div className="grid grid-cols-5">
          <NavItems items={apkMemberTabs} />
          <button
            type="button"
            data-apk-logout="true"
            onClick={requestLogout}
            className="flex min-h-12 max-w-full flex-col items-center justify-center gap-0.5 px-0.5 text-center text-[10px] font-semibold leading-tight text-down"
          >
            <LogOut size={18} />
            Logout
          </button>
        </div>
      </nav>
    );
  }

  return (
    <nav
      className={cn(
        "t2s-mobile-nav fixed inset-x-0 bottom-0 z-50 border-t border-[var(--border)] bg-white pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_24px_rgba(15,39,68,0.06)] dark:bg-[var(--card)] md:hidden",
      )}
    >
      <div
        className={
          visible.length <= 3 ? "grid grid-cols-3" : visible.length === 4 ? "grid grid-cols-4" : "grid grid-cols-5"
        }
      >
        <NavItems items={visible} />
      </div>
    </nav>
  );
}
