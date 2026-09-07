import { useEffect, useState } from "react";
import { listUsers, type AuthUser } from "../api/client";

export function Users() {
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    void listUsers()
      .then((result) => setUsers(result.users || []))
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load users"));
  }, []);

  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-xl font-bold">Users</h1>
        <p className="text-sm text-slate-400">Gmail OAuth and sign-up accounts stored on this server.</p>
      </div>
      {error ? <div className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-down">{error}</div> : null}
      <section className="card overflow-x-auto p-0">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b border-[var(--border)] text-[11px] uppercase text-slate-400">
            <tr>
              <th className="px-4 py-3 font-semibold">Name</th>
              <th className="px-4 py-3 font-semibold">Email</th>
              <th className="px-4 py-3 font-semibold">Role</th>
              <th className="px-4 py-3 font-semibold">Sign-in</th>
              <th className="px-4 py-3 font-semibold">Added</th>
            </tr>
          </thead>
          <tbody>
            {users.map((row) => (
              <tr key={row.id || row.email} className="border-b border-[var(--border)] last:border-0">
                <td className="px-4 py-3 font-semibold">{row.name}</td>
                <td className="px-4 py-3 text-slate-500">{row.email || "—"}</td>
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
                <td className="px-4 py-3 text-slate-500">
                  {row.createdAt ? new Date(row.createdAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!users.length && !error ? <div className="px-4 py-6 text-sm text-slate-400">No users yet.</div> : null}
      </section>
    </div>
  );
}
