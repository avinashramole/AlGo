import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/layout/AppShell";
import { Algo } from "./pages/Algo";
import { Analytics } from "./pages/Analytics";
import { Chat } from "./pages/Chat";
import { Dashboard } from "./pages/Dashboard";
import { Markets } from "./pages/Markets";
import { Notifications } from "./pages/Notifications";
import { Options } from "./pages/Options";
import { Portfolio } from "./pages/Portfolio";
import { Settings } from "./pages/Settings";
import { Signals } from "./pages/Signals";

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Dashboard />} />
        <Route path="markets" element={<Markets />} />
        <Route path="options" element={<Options />} />
        <Route path="signals" element={<Signals />} />
        <Route path="algo" element={<Algo />} />
        <Route path="portfolio" element={<Portfolio />} />
        <Route path="analytics" element={<Analytics />} />
        <Route path="settings" element={<Settings />} />
        <Route path="notifications" element={<Notifications />} />
        <Route path="chat" element={<Chat />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
