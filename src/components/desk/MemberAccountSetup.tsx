import { useEffect, useState, type FormEvent } from "react";
import {
  getMemberDesk,
  installMemberBroker,
  saveMemberIp,
  selectMemberBroker,
  type MemberDesk,
} from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import { isAdminUser } from "../../lib/roles";
import {
  credsAfterInstall,
  describeBrokerInstall,
  describeBrokerSave,
  hintsFromInstall,
  installValueForSubmit,
} from "../../lib/formSecrets";
import { cn } from "../../lib/format";
import { BrokerInstallFields } from "./BrokerInstallFields";

export function isGmailMember(user?: { email?: string; authProvider?: string; role?: "admin" | "user" } | null) {
  if (!user || isAdminUser(user)) return false;
  const email = String(user.email || "").trim().toLowerCase();
  return user.authProvider === "google" || email.endsWith("@gmail.com") || email.endsWith("@googlemail.com");
}

export function MemberAccountSetup({ showProfile = true }: { showProfile?: boolean }) {
  const { user, updateProfile } = useAuth();
  const [desk, setDesk] = useState<MemberDesk | null>(null);
  const [name, setName] = useState(user?.name || "");
  const [email, setEmail] = useState(user?.email || "");
  const [mobile, setMobile] = useState(user?.mobile || "");
  const [creds, setCreds] = useState<Record<string, string>>({});
  const [staticIp, setStaticIp] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

  useEffect(() => {
    setName(user?.name || "");
    setEmail(user?.email || "");
    setMobile(user?.mobile || "");
  }, [user]);

  useEffect(() => {
    if (!isGmailMember(user)) return;
    let alive = true;
    void getMemberDesk()
      .then((next) => {
        if (!alive) return;
        setDesk(next);
        setStaticIp((current) => current || next.staticIp || "");
        setCreds((current) => credsAfterInstall(next.install, current, { keepTyped: true }));
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [user]);

  if (!isGmailMember(user)) return null;

  const saveProfile = async (event: FormEvent) => {
    event.preventDefault();
    setBusy("profile");
    setError("");
    setNote("");
    try {
      await updateProfile({ name, email, mobile });
      setNote("Profile saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save profile");
    } finally {
      setBusy("");
    }
  };

  const pickBroker = async (brokerId: string) => {
    setBusy(brokerId);
    setError("");
    setNote("");
    setCreds({});
    try {
      const next = await selectMemberBroker(brokerId);
      const deskNext = await getMemberDesk();
      setDesk({ ...deskNext, brokerId: next.brokerId, install: next.install, brokers: next.brokers });
      setCreds((current) => credsAfterInstall(next.install, current));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not select broker");
    } finally {
      setBusy("");
    }
  };

  const saveBroker = async (event: FormEvent) => {
    event.preventDefault();
    if (!desk || desk.brokerId === "paper") return;
    setBusy("broker");
    setError("");
    setNote("");
    try {
      const hints = hintsFromInstall(desk.install);
      const clientId = installValueForSubmit({ id: "clientId" }, creds, hints);
      const result = await installMemberBroker({
        brokerId: desk.brokerId,
        clientId,
        apiKey: installValueForSubmit({ id: "apiKey", secret: true }, creds, hints),
        accessToken: installValueForSubmit({ id: "accessToken", secret: true }, creds, hints),
        sessionToken: installValueForSubmit({ id: "sessionToken", secret: true }, creds, hints),
        mobile: installValueForSubmit({ id: "mobile", secret: true }, creds, hints),
        mpin: installValueForSubmit({ id: "mpin", secret: true }, creds, hints),
        totpSecret: installValueForSubmit({ id: "totpSecret", secret: true }, creds, hints),
      });
      const next = await getMemberDesk();
      setDesk(next);
      setCreds({ clientId: String(result.install?.accountId || clientId || "").trim() });
      setNote(describeBrokerSave(result.install, desk.brokerId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save broker");
    } finally {
      setBusy("");
    }
  };

  const saveIp = async (event: FormEvent) => {
    event.preventDefault();
    setBusy("ip");
    setError("");
    setNote("");
    try {
      const saved = await saveMemberIp(staticIp.trim());
      setStaticIp(saved.staticIp || "");
      setNote(saved.staticIp ? `Static IP saved · ${saved.staticIp}` : "Static IP cleared.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save IP");
    } finally {
      setBusy("");
    }
  };

  return (
    <section className="card space-y-4 p-5">
      <div>
        <div className="text-xs font-extrabold uppercase tracking-wide text-slate-400">Gmail account</div>
        <h2 className="mt-1 text-lg font-extrabold">Update profile, add broker, add IP</h2>
        <p className="mt-1 text-xs leading-5 text-slate-500">
          Save your name and mobile, install the broker this Gmail account will trade on, and store the static IP that broker should use.
        </p>
      </div>
      {error ? <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-semibold text-down">{error}</p> : null}
      {note ? <p className="text-xs font-semibold text-slate-500">{note}</p> : null}

      {showProfile ? (
        <form onSubmit={saveProfile} className="rounded-xl border border-[var(--border)] bg-[var(--bg)] p-3">
          <div className="text-sm font-bold">Profile</div>
          <label className="mt-3 block text-xs font-semibold">
            Name
            <input className="mt-1 h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 text-sm font-normal" value={name} onChange={(event) => setName(event.target.value)} />
          </label>
          <label className="mt-3 block text-xs font-semibold">
            Gmail
            <input className="mt-1 h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 text-sm font-normal" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@gmail.com" />
          </label>
          <label className="mt-3 block text-xs font-semibold">
            Mobile
            <input
              className="mt-1 h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 text-sm font-normal"
              value={mobile}
              inputMode="numeric"
              maxLength={10}
              placeholder="98xxxxxxxx"
              onChange={(event) => setMobile(event.target.value.replace(/\D/g, "").slice(0, 10))}
            />
          </label>
          <button type="submit" disabled={busy === "profile"} className="mt-3 h-10 rounded-lg bg-brand-500 px-4 text-xs font-semibold text-white disabled:opacity-60">
            {busy === "profile" ? "Saving..." : "Save profile"}
          </button>
        </form>
      ) : null}

      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg)] p-3">
        <div className="text-sm font-bold">Add broker</div>
        <p className="mt-1 text-xs text-slate-500">Pick the broker, then save that broker’s client ID and access token.</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {(desk?.brokers || []).map((row) => (
            <button
              key={row.id}
              type="button"
              disabled={Boolean(busy)}
              onClick={() => void pickBroker(row.id)}
              className={cn(
                "rounded-xl border px-3 py-3 text-left",
                row.selected ? "border-brand-500 bg-brand-50 dark:bg-brand-500/10" : "border-[var(--border)] bg-[var(--card)]",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-extrabold">{row.name}</span>
                {row.selected ? <span className="text-[10px] font-extrabold uppercase text-brand-500">Selected</span> : null}
              </div>
              <div className="mt-1 text-[11px] text-slate-500">
                {row.virtual ? "Virtual paper" : row.installed ? "Token saved" : "Add this broker"}
              </div>
            </button>
          ))}
        </div>
        {desk && desk.brokerId !== "paper" ? (
          <form className="mt-3" onSubmit={saveBroker}>
            {desk.install?.installed ? null : (
              <p className="mb-2 text-xs text-slate-500">{describeBrokerInstall(desk.install, desk.brokerId)}</p>
            )}
            <BrokerInstallFields
              fields={desk.install?.fields || []}
              values={creds}
              hints={hintsFromInstall(desk.install)}
              disabled={busy === "broker"}
              onChange={(id, value) => setCreds((current) => ({ ...current, [id]: value }))}
            />
            <button type="submit" disabled={busy === "broker"} className="mt-3 h-10 rounded-lg bg-brand-500 px-4 text-xs font-semibold text-white disabled:opacity-60">
              {busy === "broker" ? "Saving..." : "Save broker"}
            </button>
          </form>
        ) : null}
      </div>

      <form onSubmit={saveIp} className="rounded-xl border border-[var(--border)] bg-[var(--bg)] p-3">
        <div className="text-sm font-bold">IP address</div>
        <p className="mt-1 text-xs text-slate-500">
          Login IP {user?.loginIp || "appears after this Gmail sign-in"}. Add the static IP your broker account should use.
        </p>
        <label className="mt-3 block text-xs font-semibold">
          Static IP
          <input
            className="mt-1 h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 text-sm font-normal"
            value={staticIp}
            placeholder="150.129.129.108"
            onChange={(event) => setStaticIp(event.target.value)}
          />
        </label>
        <button type="submit" disabled={busy === "ip"} className="mt-3 h-10 rounded-lg bg-brand-500 px-4 text-xs font-semibold text-white disabled:opacity-60">
          {busy === "ip" ? "Saving..." : "Save IP"}
        </button>
      </form>
    </section>
  );
}
