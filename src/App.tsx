import { type ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/layout/AppShell";
import { useAuth } from "./context/AuthContext";
import { isAdminUser } from "./lib/roles";
import { Algo } from "./pages/Algo";
import { Analytics } from "./pages/Analytics";
import { Brokers } from "./pages/Brokers";
import { Chat } from "./pages/Chat";
import { Dashboard } from "./pages/Dashboard";
import { Login } from "./pages/Login";
import { Markets } from "./pages/Markets";
import { Notifications } from "./pages/Notifications";
import { Options } from "./pages/Options";
import { Orders } from "./pages/Orders";
import { Portfolio } from "./pages/Portfolio";
import { PositionsDesk } from "./pages/PositionsDesk";
import { Reports } from "./pages/Reports";
import { Profile } from "./pages/Profile";
import { Settings } from "./pages/Settings";
import { IpManagement } from "./pages/IpManagement";
import { Signals } from "./pages/Signals";
import { MemberPlans } from "./pages/MemberPlans";
import { Subscriptions } from "./pages/Subscriptions";
import { UserHome } from "./pages/UserHome";
import { Users } from "./pages/Users";

function PageLoading({ label }: { label: string }) {
  return <div className="p-8 text-sm text-slate-400">{label}</div>;
}

function Guard({ children }: { children: ReactNode }) {
  const { user, ready } = useAuth();
  if (user) return children;
  if (!ready) return <PageLoading label="Loading desk…" />;
  return <Navigate to="/login" replace />;
}

function AdminOnly({ children }: { children: ReactNode }) {
  const { user, ready } = useAuth();
  if (isAdminUser(user)) return children;
  if (!ready) return <PageLoading label="Loading…" />;
  return <Navigate to="/" replace />;
}

function RoleHome() {
  const { user } = useAuth();
  return isAdminUser(user) ? <Dashboard /> : <UserHome />;
}

export default function App() {
  const { user } = useAuth();

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
      <Route
        element={
          <Guard>
            <AppShell />
          </Guard>
        }
      >
        <Route index element={<RoleHome />} />
        <Route path="profile" element={<Profile />} />
        <Route path="subscriptions" element={<Subscriptions />} />
        <Route path="plans" element={<MemberPlans />} />
        <Route path="markets" element={<AdminOnly><Markets /></AdminOnly>} />
        <Route path="options" element={<AdminOnly><Options /></AdminOnly>} />
        <Route path="signals" element={<AdminOnly><Signals /></AdminOnly>} />
        <Route path="algo" element={<AdminOnly><Algo /></AdminOnly>} />
        <Route path="orders" element={<AdminOnly><Orders /></AdminOnly>} />
        <Route path="positions" element={<AdminOnly><PositionsDesk /></AdminOnly>} />
        <Route path="reports" element={<AdminOnly><Reports /></AdminOnly>} />
        <Route path="portfolio" element={<AdminOnly><Portfolio /></AdminOnly>} />
        <Route path="brokers" element={<AdminOnly><Brokers /></AdminOnly>} />
        <Route path="analytics" element={<AdminOnly><Analytics /></AdminOnly>} />
        <Route path="users" element={<AdminOnly><Users /></AdminOnly>} />
        <Route path="settings" element={<AdminOnly><Settings /></AdminOnly>} />
        <Route path="settings/ips" element={<AdminOnly><IpManagement /></AdminOnly>} />
        <Route path="notifications" element={<AdminOnly><Notifications /></AdminOnly>} />
        <Route path="chat" element={<AdminOnly><Chat /></AdminOnly>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
