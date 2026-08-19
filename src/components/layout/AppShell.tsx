import { Outlet } from "react-router-dom";
import { Header } from "./Header";
import { Sidebar } from "./Sidebar";
import { PreviewDeskBanner } from "../../lib/deskHost";

export function AppShell() {
  return (
    <div className="h-screen overflow-hidden bg-[var(--bg)]">
      <PreviewDeskBanner />
      <Sidebar />
      <div className="flex h-screen flex-col pl-[68px]">
        <Header />
        <main className="min-h-0 flex-1 overflow-auto p-4">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
