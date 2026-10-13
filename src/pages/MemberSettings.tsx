import { Headphones, LogOut, Moon, Sun } from "lucide-react";
import { MemberAccountSetup } from "../components/desk/MemberAccountSetup";
import { PhoneCard, SettingsRow } from "../components/phone/PhoneUi";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";

export function MemberSettings() {
  const { logout } = useAuth();
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="mx-auto max-w-2xl space-y-2">
      <div>
        <h1 className="text-xl font-bold">Settings</h1>
        <p className="text-sm text-slate-400">Broker, theme, and support live here. Password is on Profile.</p>
      </div>
      <MemberAccountSetup showProfile={false} />
      <PhoneCard data-member-settings="menu">
        <SettingsRow icon={Headphones} label="Support" to="/support" detail="support@trade2smart.com" />
        <SettingsRow
          icon={theme === "light" ? Moon : Sun}
          label="Theme"
          detail={theme === "light" ? "Light" : "Dark"}
          onClick={toggleTheme}
        />
        <SettingsRow icon={LogOut} label="Logout" danger onClick={logout} />
      </PhoneCard>
    </div>
  );
}
