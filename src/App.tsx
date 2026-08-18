import { type ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/layout/AppShell";
import { useAuth } from "./context/AuthContext";
import { Algo } from "./pages/Algo";
import { Analytics } from "./pages/Analytics";
import { Brokers } from "./pages/Brokers";
import { Chat } from "./pages/Chat";
import { Dashboard } from "./pages/Dashboard";
import { Login } from "./pages/Login";
import { Markets } from "./pages/Markets";
import { Notifications } from "./pages/Notifications";
import { Options } from "./pages/Options";
import { Portfolio } from "./pages/Portfolio";
import { Settings } from "./pages/Settings";
import { Signals } from "./pages/Signals";

function Guard({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return children;
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
        <Route index element={<Dashboard />} />
        <Route path="markets" element={<Markets />} />
        <Route path="options" element={<Options />} />
        <Route path="signals" element={<Signals />} />
        <Route path="algo" element={<Algo />} />
        <Route path="portfolio" element={<Portfolio />} />
        <Route path="brokers" element={<Brokers />} />
        <Route path="analytics" element={<Analytics />} />
        <Route path="settings" element={<Settings />} />
        <Route path="notifications" element={<Notifications />} />
        <Route path="chat" element={<Chat />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
