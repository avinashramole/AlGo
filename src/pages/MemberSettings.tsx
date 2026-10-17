import { Headphones, LogOut } from "lucide-react";
import { FingerprintLockRow } from "../components/desk/FingerprintLockRow";
import { MemberAccountSetup } from "../components/desk/MemberAccountSetup";
import { PhoneCard, SettingsRow } from "../components/phone/PhoneUi";
import { useAuth } from "../context/AuthContext";

export function MemberSettings() {
  const { requestLogout } = useAuth();

  return (
    <div className="mx-auto max-w-2xl space-y-2">
      <div>
        <h1 className="text-xl font-bold">Settings</h1>
        <p className="text-sm text-slate-400">Broker and support live here. Password is on Profile.</p>
      </div>
      <MemberAccountSetup showProfile={false} />
      <FingerprintLockRow />
      <PhoneCard data-member-settings="menu">
        <SettingsRow icon={Headphones} label="Support" to="/support" detail="support@trade2smart.com" />
        <SettingsRow icon={LogOut} label="Logout" danger onClick={requestLogout} />
      </PhoneCard>
    </div>
  );
}
