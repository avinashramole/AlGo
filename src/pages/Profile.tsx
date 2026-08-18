import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "../context/AuthContext";
import { formatMobile } from "../lib/format";

export function Profile() {
  const { user, updateProfile, logout } = useAuth();
  const [name, setName] = useState(user?.name || "");
  const [email, setEmail] = useState(user?.email || "");
  const [mobile, setMobile] = useState(user?.mobile || "");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

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
    <div className="mx-auto max-w-xl space-y-3">
      <h1 className="text-xl font-bold">Profile</h1>
      <section className="card p-6">
        <div className="mb-5 flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-500 text-lg font-extrabold text-white">
            {(user?.name || "T").slice(0, 1).toUpperCase()}
          </div>
          <div>
            <div className="text-lg font-extrabold">{user?.name || "Trader"}</div>
            <div className="text-sm text-slate-400">{user?.desk || "Index Options"}</div>
          </div>
        </div>
        <dl className="divide-y divide-[var(--border)] rounded-xl border border-[var(--border)]">
          <Row label="Name" value={user?.name || "—"} />
          <Row label="Email" value={user?.email || "Not added"} />
          <Row label="Mobile no" value={formatMobile(user?.mobile)} />
        </dl>
      </section>
      <section className="card p-5">
        <div className="mb-3 text-sm font-bold">Edit profile</div>
        <form onSubmit={onSave}>
          <label className="mb-3 block text-sm font-semibold">
            Name
            <input className="mt-1 h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 font-normal" value={name} onChange={(event) => setName(event.target.value)} />
          </label>
          <label className="mb-3 block text-sm font-semibold">
            Email
            <input className="mt-1 h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 font-normal" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@gmail.com" />
          </label>
          <label className="mb-3 block text-sm font-semibold">
            Mobile no
            <input className="mt-1 h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 font-normal" value={mobile} onChange={(event) => setMobile(event.target.value)} placeholder="98xxxxxxxx" />
          </label>
          {note ? <p className="mb-3 text-sm font-semibold text-slate-500">{note}</p> : null}
          <button type="submit" disabled={busy} className="h-11 w-full rounded-xl bg-brand-500 text-sm font-semibold text-white disabled:opacity-60">
            {busy ? "Saving..." : "Save profile"}
          </button>
        </form>
      </section>
      <button type="button" onClick={logout} className="h-10 rounded-xl bg-rose-50 px-4 text-sm font-semibold text-down">
        Log out
      </button>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3">
      <dt className="text-sm text-slate-500">{label}</dt>
      <dd className="text-right text-sm font-semibold">{value}</dd>
    </div>
  );
}
