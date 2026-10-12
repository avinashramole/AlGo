import { CreditCard, Headphones, LogOut, Moon, Shield, SlidersHorizontal, Sun } from "lucide-react";
import { MemberAccountSetup } from "../components/desk/MemberAccountSetup";
import { PhoneCard, SettingsRow } from "../components/phone/PhoneUi";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";

export function MemberSettings() {
  const { logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  return (
    <div className="desk-page mx-auto max-w-3xl space-y-3">
      <div>
        <h1 className="text-xl font-bold">Settings</h1>
        <p className="text-sm text-slate-400">
          Broker, IP, theme, and account options live here. Profile shows only name, email, mobile, and broker name.
        </p>
      </div>
      <MemberAccountSetup showProfile={false} />
      <PhoneCard data-member-settings="menu">
        <SettingsRow icon={SlidersHorizontal} label="Risk Settings" to="/plans" />
        <SettingsRow icon={CreditCard} label="Subscription Plan" to="/plans" />
        <SettingsRow icon={Headphones} label="Support" to="/notifications" />
        <SettingsRow icon={Shield} label="Security" detail="Password and login devices" />
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
