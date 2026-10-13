import { useState, type FormEvent } from "react";
import { useAuth } from "../../context/AuthContext";
import { catchDeskError } from "../../lib/liveSite";

export function LoginPasswordCard() {
  const { changePassword } = useAuth();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const savePassword = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setNote("");
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      await changePassword({ password, confirm });
      setPassword("");
      setConfirm("");
      setNote("Password saved. Sign in with Google or this password.");
    } catch (err) {
      setError(catchDeskError(err, "Could not save password"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card space-y-3 p-4" data-login-password="profile" id="login-password">
      <div>
        <div className="text-[11px] font-extrabold uppercase tracking-wide text-slate-400">Login</div>
        <h2 className="text-base font-extrabold">Password</h2>
        <p className="desk-help mt-1 text-xs leading-5 text-slate-500">
          Sign in with Google or this password. The password stays hidden.
        </p>
      </div>
      {error ? <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-semibold text-down">{error}</p> : null}
      {note ? <p className="text-xs font-semibold text-slate-500">{note}</p> : null}
      <form onSubmit={(event) => void savePassword(event)} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block text-sm font-semibold">
          New password
          <input
            className="mt-1 h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 text-sm font-normal"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Enter a new password"
            autoComplete="new-password"
          />
        </label>
        <label className="block text-sm font-semibold">
          Confirm password
          <input
            className="mt-1 h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 text-sm font-normal"
            type="password"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            placeholder="Re-enter password"
            autoComplete="new-password"
          />
        </label>
        <button type="submit" disabled={busy} className="h-10 rounded-lg bg-brand-500 px-4 text-sm font-semibold text-white disabled:opacity-60 sm:col-span-2">
          {busy ? "Saving..." : "Save password"}
        </button>
      </form>
    </section>
  );
}
