import { useEffect, useState, type FormEvent } from "react";
import {
  Building2,
  CreditCard,
  Headphones,
  LogOut,
  Moon,
  Shield,
  SlidersHorizontal,
  Sun,
  UserRound,
} from "lucide-react";
import { isGmailMember, MemberAccountSetup } from "../components/desk/MemberAccountSetup";
import { Avatar, PhoneCard, SettingsRow } from "../components/phone/PhoneUi";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { isAdminUser } from "../lib/roles";
import { formatMobile } from "../lib/format";

export function Profile() {
  const { user, updateProfile, refreshMe, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const admin = isAdminUser(user);
  const [name, setName] = useState(user?.name || "");
  const [email, setEmail] = useState(user?.email || "");
  const [mobile, setMobile] = useState(user?.mobile || "");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void refreshMe().catch(() => undefined);
  }, [refreshMe]);

  useEffect(() => {
    setName(user?.name || "");
    setEmail(user?.email || "");
    setMobile(user?.mobile || "");
  }, [user]);

  const onSave = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setNote("");
    try {
      await updateProfile({ name, email, mobile });
      setNote("Profile saved.");
    } catch (err) {
      setNote(err instanceof Error ? err.message : "Could not save profile");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="desk-page mx-auto max-w-3xl space-y-3">
      <PhoneCard className="p-4">
        <div className="flex items-center gap-3">
          <Avatar name={user?.name} size="lg" />
          <div className="min-w-0">
            <div className="truncate text-lg font-extrabold">{user?.name || "Trader"}</div>
            <div className="truncate text-sm text-slate-400">{user?.email || formatMobile(user?.mobile)}</div>
            <div className="mt-1 text-[11px] font-semibold uppercase text-slate-400">
              {admin ? "Admin" : "Member"} · {user?.desk || "Index Options"}
            </div>
          </div>
        </div>
      </PhoneCard>

      <PhoneCard>
        <SettingsRow icon={UserRound} label="My Account" detail={user?.email || formatMobile(user?.mobile)} />
        <SettingsRow icon={Building2} label="Broker Connections" to={admin ? "/brokers" : "/plans"} detail={admin ? "Desk brokers" : "Install your token on My plan"} />
        <SettingsRow icon={SlidersHorizontal} label="Risk Settings" to={admin ? "/algo" : "/plans"} />
        <SettingsRow icon={CreditCard} label="Subscription Plan" to={admin ? "/users?tab=enrollments" : "/plans"} />
        <SettingsRow icon={Headphones} label="Support" to="/notifications" />
        <SettingsRow icon={Shield} label="Security" detail="Password and login devices" />
        <SettingsRow
          icon={theme === "light" ? Moon : Sun}
          label="Theme"
          detail={theme === "light" ? "Light" : "Dark"}
          onClick={toggleTheme}
        />
        {admin ? (
          <>
            <SettingsRow icon={UserRound} label="Users & IP" to="/users" />
            <SettingsRow icon={SlidersHorizontal} label="Settings" to="/settings" />
          </>
        ) : null}
        <SettingsRow icon={LogOut} label="Logout" danger onClick={logout} />
      </PhoneCard>

      <MemberAccountSetup />

      {isGmailMember(user) ? null : (
        <section className="card p-3">
          <div className="mb-2 text-sm font-bold">Edit profile</div>
          <form onSubmit={onSave} className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <label className="block text-xs font-semibold">
              Name
              <input className="mt-0.5 h-8 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 text-xs font-normal" value={name} onChange={(event) => setName(event.target.value)} />
            </label>
            <label className="block text-xs font-semibold">
              Email
              <input className="mt-0.5 h-8 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 text-xs font-normal" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@gmail.com" />
            </label>
            <label className="block text-xs font-semibold">
              Mobile no
              <input
                className="mt-0.5 h-8 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 text-xs font-normal"
                value={mobile}
                inputMode="numeric"
                maxLength={10}
                onChange={(event) => setMobile(event.target.value.replace(/\D/g, "").slice(0, 10))}
                placeholder="98xxxxxxxx"
              />
            </label>
            {note ? <p className="text-xs font-semibold text-slate-500 sm:col-span-3">{note}</p> : null}
            <button type="submit" disabled={busy} className="h-8 rounded-lg bg-brand-500 text-xs font-semibold text-white disabled:opacity-60 sm:col-span-3">
              {busy ? "Saving..." : "Save profile"}
            </button>
          </form>
        </section>
      )}
    </div>
  );
}
