import { lazy, Suspense, type ComponentType, type ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/layout/AppShell";
import { useAuth } from "./context/AuthContext";
import { isAdminUser } from "./lib/roles";
import { Login } from "./pages/Login";

function lazyPage<M extends Record<string, ComponentType>>(loader: () => Promise<M>, name: keyof M) {
  return lazy(() => loader().then((mod) => ({ default: mod[name] })));
}

const Dashboard = lazyPage(() => import("./pages/Dashboard"), "Dashboard");
const UserHome = lazyPage(() => import("./pages/UserHome"), "UserHome");
const Profile = lazyPage(() => import("./pages/Profile"), "Profile");
const Subscriptions = lazyPage(() => import("./pages/Subscriptions"), "Subscriptions");
const MemberPlans = lazyPage(() => import("./pages/MemberPlans"), "MemberPlans");
const Markets = lazyPage(() => import("./pages/Markets"), "Markets");
const Options = lazyPage(() => import("./pages/Options"), "Options");
const Signals = lazyPage(() => import("./pages/Signals"), "Signals");
const Algo = lazyPage(() => import("./pages/Algo"), "Algo");
const Orders = lazyPage(() => import("./pages/Orders"), "Orders");
const PositionsDesk = lazyPage(() => import("./pages/PositionsDesk"), "PositionsDesk");
const Reports = lazyPage(() => import("./pages/Reports"), "Reports");
const Portfolio = lazyPage(() => import("./pages/Portfolio"), "Portfolio");
const Brokers = lazyPage(() => import("./pages/Brokers"), "Brokers");
const Analytics = lazyPage(() => import("./pages/Analytics"), "Analytics");
const Users = lazyPage(() => import("./pages/Users"), "Users");
const Settings = lazyPage(() => import("./pages/Settings"), "Settings");
const IpManagement = lazyPage(() => import("./pages/IpManagement"), "IpManagement");
const Notifications = lazyPage(() => import("./pages/Notifications"), "Notifications");
const Chat = lazyPage(() => import("./pages/Chat"), "Chat");

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
    <Suspense fallback={<PageLoading label="Loading desk…" />}>
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
    </Suspense>
  );
}
