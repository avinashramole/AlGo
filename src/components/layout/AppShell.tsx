import { useEffect } from "react";
import { Outlet } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { loadClientList } from "../../lib/clientsCache";
import { PreviewDeskBanner } from "../../lib/deskHost";
import { isAdminUser } from "../../lib/roles";
import { isNativeHybrid } from "../../lib/hybrid";
import { cn } from "../../lib/format";
import { Header } from "./Header";
import { MobileNav } from "./MobileNav";
import { Sidebar } from "./Sidebar";

export function AppShell() {
  const { user } = useAuth();
  useEffect(() => {
    if (isAdminUser(user)) void loadClientList();
  }, [user]);

  const phone = isNativeHybrid();
  return (
    <div className="h-[100dvh] overflow-hidden bg-[var(--bg)]" data-mobile-app="responsive">
      <PreviewDeskBanner />
      <Sidebar />
      <div className={cn("t2s-shell-main flex h-[100dvh] flex-col pl-0", !phone && "md:pl-56")}>
        <Header />
        <main
          className={cn(
            "min-h-0 min-w-0 max-w-full flex-1 overflow-x-hidden overflow-y-auto p-2.5 pb-[calc(4.75rem+env(safe-area-inset-bottom))]",
            !phone && "md:p-4 md:pb-4",
          )}
        >
          <Outlet />
        </main>
      </div>
      <MobileNav />
    </div>
  );
}
