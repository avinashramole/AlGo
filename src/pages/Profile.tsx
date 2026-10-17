import { useEffect, useState, type FormEvent } from "react";
import {
  Building2,
  ClipboardList,
  CreditCard,
  Headphones,
  LogOut,
  SlidersHorizontal,
  UserRound,
} from "lucide-react";
import { getMemberDesk } from "../api/client";
import { LoginPasswordCard } from "../components/desk/LoginPasswordCard";
import { Avatar, PhoneCard, SettingsRow } from "../components/phone/PhoneUi";
import { useAuth } from "../context/AuthContext";
import { memberIdentityLine } from "../lib/format";
import { isAdminUser } from "../lib/roles";

const fieldClass = "mt-1 h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 text-sm font-normal";

export function Profile() {
  const { user, updateProfile, requestLogout } = useAuth();
  const admin = isAdminUser(user);
  const [name, setName] = useState(user?.name || "");
  const [email, setEmail] = useState(user?.email || "");
  const [mobile, setMobile] = useState(user?.mobile || "");
  const [brokerName, setBrokerName] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (dirty) return;
    setName(user?.name || "");
    setEmail(user?.email || "");
    setMobile(user?.mobile || "");
  }, [user, dirty]);

  useEffect(() => {
    if (admin) return;
    let alive = true;
    void getMemberDesk()
      .then((desk) => {
        if (!alive) return;
        const named = desk.owner?.brokerName || desk.brokers?.find((row) => row.id === desk.brokerId)?.name || desk.brokerId || "";
        setBrokerName(named);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [admin]);

  const onSave = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setNote("");
    try {
      await updateProfile({ name, email, mobile });
      setDirty(false);
      setNote("Profile saved.");
    } catch (err) {
      setNote(err instanceof Error ? err.message : "Could not save profile");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="desk-page mx-auto max-w-2xl space-y-3">
      <PhoneCard className="p-4">
        <div className="flex items-center gap-3">
          <Avatar name={user?.name} size="lg" />
          <div className="min-w-0">
            <div className="truncate text-lg font-extrabold">Profile</div>
          </div>
        </div>
      </PhoneCard>

      <section className="card p-4" data-member-profile="identity">
        <div className="desk-kicker">Account</div>
        <div className="mb-4 mt-1 text-lg font-bold leading-snug">
          {memberIdentityLine(name, email, mobile)}
        </div>
        {admin ? (
          <>
            <div className="mb-3 text-sm font-bold">Edit profile</div>
            <form onSubmit={onSave} className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <label className="block text-sm font-semibold">
                Name
                <input className={fieldClass} value={name} onChange={(event) => { setDirty(true); setName(event.target.value); }} />
              </label>
              <label className="block text-sm font-semibold">
                Email
                <input className={fieldClass} value={email} onChange={(event) => { setDirty(true); setEmail(event.target.value); }} placeholder="you@gmail.com" />
              </label>
              <label className="block text-sm font-semibold">
                Mobile no
                <input
                  className={fieldClass}
                  value={mobile}
                  inputMode="numeric"
                  maxLength={10}
                  onChange={(event) => {
                    setDirty(true);
                    setMobile(event.target.value.replace(/\D/g, "").slice(0, 10));
                  }}
                  placeholder="98xxxxxxxx"
                />
              </label>
              {note ? <p className="text-sm font-semibold text-slate-500 sm:col-span-3">{note}</p> : null}
              <div className="desk-save-row sm:col-span-3">
                <button type="submit" disabled={busy} className="desk-save-btn">
                  {busy ? "Saving..." : "Save profile"}
                </button>
              </div>
            </form>
          </>
        ) : (
          <p className="text-sm font-semibold" data-member-profile="broker">
            Broker name <span className="font-bold">{brokerName || "—"}</span>
          </p>
        )}
      </section>

      {!admin ? <LoginPasswordCard /> : null}

      {admin ? (
        <PhoneCard>
          <SettingsRow icon={UserRound} label="My Account" detail="Saved from Edit profile" />
          <SettingsRow icon={Building2} label="Broker Connections" to="/brokers" detail="Desk brokers" />
          <SettingsRow icon={SlidersHorizontal} label="Risk Settings" to="/algo" />
          <SettingsRow icon={ClipboardList} label="Master report" to="/master-report" />
          <SettingsRow icon={CreditCard} label="Subscription Plan" to="/users?tab=enrollments" />
          <SettingsRow icon={Headphones} label="Support" to="/support" detail="support@trade2smart.com" />
          <SettingsRow icon={UserRound} label="Users & IP" to="/users" />
          <SettingsRow icon={SlidersHorizontal} label="Settings" to="/settings" detail="Desk settings" />
          <SettingsRow icon={LogOut} label="Logout" danger onClick={requestLogout} />
        </PhoneCard>
      ) : (
        <PhoneCard data-member-profile="menu">
          <SettingsRow icon={SlidersHorizontal} label="Settings" to="/settings" detail="Fingerprint lock and desk help" />
          <SettingsRow icon={Headphones} label="Support" to="/support" detail="support@trade2smart.com" />
          <SettingsRow icon={LogOut} label="Logout" danger onClick={requestLogout} />
        </PhoneCard>
      )}
    </div>
  );
}
