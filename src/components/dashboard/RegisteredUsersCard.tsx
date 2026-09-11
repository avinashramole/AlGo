import { Users } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listUsers, type AuthUser } from "../../api/client";
import { loadClientList } from "../../lib/clientsCache";

export function RegisteredUsersCard() {
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = () => {
      void listUsers()
        .then((result) => {
          setUsers(result.users || []);
          setError("");
        })
        .catch((err) => setError(err instanceof Error ? err.message : "Could not load users"));
      void loadClientList();
    };
    load();
    const id = window.setInterval(load, 8000);
    return () => window.clearInterval(id);
  }, []);

  const members = users.filter((row) => row.registered || row.role !== "admin");
  const latest = members.slice(0, 4);

  return (
    <section className="card p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            <Users size={14} />
            Registered users
          </div>
          <div className="mt-1 text-2xl font-extrabold">{members.length}</div>
          <p className="mt-1 text-xs text-slate-500">Gmail OAuth and Create Account members.</p>
        </div>
        <Link to="/users" className="h-9 rounded-lg bg-brand-500 px-3 text-xs font-semibold leading-9 text-white">
          All clients
        </Link>
      </div>
      {error ? <p className="mt-3 text-xs text-down">{error}</p> : null}
      <ul className="mt-3 space-y-2">
        {latest.map((row) => (
          <li key={row.id || row.email} className="flex items-center justify-between gap-2 text-sm">
            <span className="truncate font-semibold">{row.name}</span>
            <span className="truncate text-xs text-slate-400">{row.mobile || row.email || "Member"}</span>
          </li>
        ))}
        {!latest.length && !error ? <li className="text-sm text-slate-400">No members registered yet.</li> : null}
      </ul>
    </section>
  );
}
