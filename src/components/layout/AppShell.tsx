import { Outlet } from "react-router-dom";
import { Header } from "./Header";
import { MobileNav } from "./MobileNav";
import { Sidebar } from "./Sidebar";
import { PreviewDeskBanner } from "../../lib/deskHost";

export function AppShell() {
  return (
    <div className="h-[100dvh] overflow-hidden bg-[var(--bg)]">
      <PreviewDeskBanner />
      <Sidebar />
      <div className="flex h-[100dvh] flex-col pl-0 md:pl-[68px]">
        <Header />
        <main className="min-h-0 flex-1 overflow-auto p-3 pb-[calc(4.5rem+env(safe-area-inset-bottom))] md:p-4 md:pb-4">
          <Outlet />
        </main>
      </div>
      <MobileNav />
    </div>
  );
}
