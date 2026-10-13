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
import { getMemberDesk } from "../api/client";
import { LoginPasswordCard } from "../components/desk/LoginPasswordCard";
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
  const [brokerName, setBrokerName] = useState("");
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
      setNote("Profile saved.");
    } catch (err) {
      setNote(err instanceof Error ? err.message : "Could not save profile");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="desk-page mx-auto max-w-2xl space-y-2">
      <PhoneCard className="p-4">
        <div className="flex items-center gap-3">
          <Avatar name={user?.name} size="lg" />
          <div className="min-w-0">
            <div className="truncate text-lg font-extrabold">{user?.name || "Trader"}</div>
            <div className="truncate text-sm text-slate-400">{user?.email || formatMobile(user?.mobile)}</div>
          </div>
        </div>
      </PhoneCard>

      <PhoneCard data-member-profile="identity">
        <IdentityRow label="Name" value={user?.name || "—"} />
        <IdentityRow label="Email" value={user?.email || "Not added"} />
        <IdentityRow label="Mobile no" value={formatMobile(user?.mobile)} />
        {!admin ? <IdentityRow label="Broker name" value={brokerName || "—"} /> : null}
      </PhoneCard>

      {!admin ? <LoginPasswordCard /> : null}

      {admin ? (
        <PhoneCard>
          <SettingsRow icon={UserRound} label="My Account" detail={user?.email || formatMobile(user?.mobile)} />
          <SettingsRow icon={Building2} label="Broker Connections" to="/brokers" detail="Desk brokers" />
          <SettingsRow icon={SlidersHorizontal} label="Risk Settings" to="/algo" />
          <SettingsRow icon={CreditCard} label="Subscription Plan" to="/users?tab=enrollments" />
          <SettingsRow icon={Headphones} label="Support" to="/support" detail="support@trade2smart.com" />
          <SettingsRow icon={Shield} label="Security" detail="Password and login devices" />
          <SettingsRow
            icon={theme === "light" ? Moon : Sun}
            label="Theme"
            detail={theme === "light" ? "Light" : "Dark"}
            onClick={toggleTheme}
          />
          <SettingsRow icon={UserRound} label="Users & IP" to="/users" />
          <SettingsRow icon={SlidersHorizontal} label="Settings" to="/settings" detail="Desk settings" />
          <SettingsRow icon={LogOut} label="Logout" danger onClick={logout} />
        </PhoneCard>
      ) : null}

      <section className="card p-4">
        <div className="mb-2 text-sm font-bold">Edit profile</div>
        <form onSubmit={onSave} className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="block text-sm font-semibold">
            Name
            <input className="mt-1 h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 text-sm font-normal" value={name} onChange={(event) => setName(event.target.value)} />
          </label>
          <label className="block text-sm font-semibold">
            Email
            <input className="mt-1 h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 text-sm font-normal" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@gmail.com" />
          </label>
          <label className="block text-sm font-semibold">
            Mobile no
            <input
              className="mt-1 h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 text-sm font-normal"
              value={mobile}
              inputMode="numeric"
              maxLength={10}
              onChange={(event) => setMobile(event.target.value.replace(/\D/g, "").slice(0, 10))}
              placeholder="98xxxxxxxx"
            />
          </label>
          {note ? <p className="text-sm font-semibold text-slate-500 sm:col-span-3">{note}</p> : null}
          <button type="submit" disabled={busy} className="h-10 rounded-lg bg-brand-500 text-sm font-semibold text-white disabled:opacity-60 sm:col-span-3">
            {busy ? "Saving..." : "Save profile"}
          </button>
        </form>
      </section>
    </div>
  );
}

function IdentityRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3 last:border-b-0">
      <span className="text-sm text-slate-400">{label}</span>
      <span className="text-right text-sm font-semibold">{value || "—"}</span>
    </div>
  );
}
