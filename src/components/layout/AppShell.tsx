import { useEffect } from "react";
import { Outlet } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { loadClientList } from "../../lib/clientsCache";
import { PreviewDeskBanner } from "../../lib/deskHost";
import { isAdminUser, isUserDesk, markUserDeskDocument } from "../../lib/roles";
import { cn } from "../../lib/format";
import { Header } from "./Header";
import { MobileNav } from "./MobileNav";
import { Sidebar } from "./Sidebar";

export function AppShell() {
  const { user } = useAuth();
  const userDesk = isUserDesk(user);
  useEffect(() => {
    if (isAdminUser(user)) void loadClientList();
  }, [user]);
  useEffect(() => {
    markUserDeskDocument(user);
    return () => {
      markUserDeskDocument(null);
    };
  }, [user]);

  return (
    <div
      className="h-[100dvh] max-w-[100vw] overflow-hidden bg-[var(--bg)]"
      data-mobile-app="responsive"
      data-layout="fluid"
      data-user-desk={userDesk ? "true" : undefined}
    >
      <PreviewDeskBanner />
      <Sidebar />
      <div className={cn("t2s-shell-main flex h-[100dvh] min-w-0 flex-col pl-0 md:pl-56")}>
        <Header />
        <main className="min-h-0 min-w-0 max-w-full flex-1 overflow-x-hidden overflow-y-auto p-2.5 pb-[calc(4.75rem+env(safe-area-inset-bottom))] md:p-4 md:pb-4">
          <Outlet />
        </main>
      </div>
      <MobileNav />
    </div>
  );
}
