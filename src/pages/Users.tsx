import { RefreshCw, Users as UsersIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { listUsers, type AuthUser } from "../api/client";
import { formatMobile } from "../lib/format";

function formatWhen(value?: string) {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
}

export function Users() {
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const result = await listUsers();
      setUsers(result.users || []);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load users");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => {
      void load();
    }, 8000);
    return () => window.clearInterval(id);
  }, [load]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return users;
    return users.filter((row) =>
      [row.name, row.email, row.mobile, row.role, row.authProvider].some((value) =>
        String(value || "").toLowerCase().includes(needle),
      ),
    );
  }, [query, users]);

  const members = filtered.filter((row) => row.registered || row.role !== "admin");
  const admins = filtered.filter((row) => row.role === "admin" && !row.registered);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Users</h1>
          <p className="text-sm text-slate-400">
            Every Gmail OAuth and Create Account signup is stored here. Members appear as soon as they register.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={busy}
          className="inline-flex h-10 items-center gap-2 rounded-xl border border-[var(--border)] px-3 text-sm font-semibold disabled:opacity-60"
        >
          <RefreshCw size={14} className={busy ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Registered members" value={users.filter((row) => row.registered || row.role !== "admin").length} />
        <Stat label="Admins" value={users.filter((row) => row.role === "admin").length} />
        <Stat label="Total accounts" value={users.length} />
      </div>
      <input
        className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 text-sm"
        placeholder="Search name, Gmail, mobile..."
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      {error ? <div className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-down">{error}</div> : null}
      <UserTable
        title="Registered members"
        empty="No registered members yet. They show here after Continue with Google or Create Account."
        users={members}
      />
      <UserTable title="Admin accounts" empty="No admin accounts." users={admins} />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <section className="card px-4 py-3">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</div>
      <div className="mt-1 flex items-center gap-2 text-2xl font-extrabold">
        <UsersIcon size={18} className="text-brand-500" />
        {value}
      </div>
    </section>
  );
}

function UserTable({ title, empty, users }: { title: string; empty: string; users: AuthUser[] }) {
  return (
    <section className="card overflow-x-auto p-0">
      <div className="border-b border-[var(--border)] px-4 py-3 text-sm font-bold">{title}</div>
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead className="border-b border-[var(--border)] text-[11px] uppercase text-slate-400">
          <tr>
            <th className="px-4 py-3 font-semibold">Name</th>
            <th className="px-4 py-3 font-semibold">Email</th>
            <th className="px-4 py-3 font-semibold">Mobile</th>
            <th className="px-4 py-3 font-semibold">Role</th>
            <th className="px-4 py-3 font-semibold">Sign-in</th>
            <th className="px-4 py-3 font-semibold">Registered</th>
            <th className="px-4 py-3 font-semibold">Last login</th>
          </tr>
        </thead>
        <tbody>
          {users.map((row) => (
            <tr key={row.id || row.email} className="border-b border-[var(--border)] last:border-0">
              <td className="px-4 py-3 font-semibold">{row.name}</td>
              <td className="px-4 py-3 text-slate-500">{row.email || "—"}</td>
              <td className="px-4 py-3 text-slate-500">{formatMobile(row.mobile)}</td>
              <td className="px-4 py-3">
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase ${
                    row.role === "admin"
                      ? "bg-emerald-50 text-up dark:bg-emerald-950/40"
                      : "bg-slate-100 text-slate-500 dark:bg-slate-800"
                  }`}
                >
                  {row.role || "user"}
                </span>
              </td>
              <td className="px-4 py-3 text-slate-500">{row.authProvider || "—"}</td>
              <td className="px-4 py-3 text-slate-500">{formatWhen(row.createdAt)}</td>
              <td className="px-4 py-3 text-slate-500">{formatWhen(row.lastLoginAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!users.length ? <div className="px-4 py-6 text-sm text-slate-400">{empty}</div> : null}
    </section>
  );
}
