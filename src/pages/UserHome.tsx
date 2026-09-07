import { Bell, Shield, UserRound, CreditCard, Wallet } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export function UserHome() {
  const { user } = useAuth();

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <section className="card p-6">
        <div className="text-xs font-extrabold uppercase tracking-wide text-slate-400">Member dashboard</div>
        <h1 className="mt-1 text-2xl font-extrabold">Welcome, {user?.name || "trader"}</h1>
        <p className="mt-2 text-sm text-slate-500">
          Signed in with {user?.email || "your account"}. Open My plan for MTM, add wallet balance, and pick a broker.
        </p>
        <div className="mt-4 inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-bold uppercase text-slate-500 dark:bg-slate-800">
          {user?.role || "user"}
        </div>
      </section>
      <div className="grid gap-3 sm:grid-cols-2">
        <article className="card p-5">
          <CreditCard size={18} className="text-brand-500" />
          <h2 className="mt-3 text-sm font-bold">Subscriptions</h2>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            See admin strategies and enroll with GPay or PhonePe. Money goes to the desk mobile number.
          </p>
          <Link to="/subscriptions" className="mt-3 inline-flex h-9 items-center rounded-lg bg-brand-500 px-3 text-xs font-semibold text-white">
            View plans
          </Link>
        </article>
        <article className="card p-5">
          <Wallet size={18} className="text-brand-500" />
          <h2 className="mt-3 text-sm font-bold">Plan report · MTM</h2>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            Realized P&L and open MTM for enrolled strategies, plus wallet add and broker selection.
          </p>
          <Link to="/plans" className="mt-3 inline-flex h-9 items-center rounded-lg bg-brand-500 px-3 text-xs font-semibold text-white">
            Open my plan
          </Link>
        </article>
        <article className="card p-5">
          <Bell size={18} className="text-brand-500" />
          <h2 className="mt-3 text-sm font-bold">Updates</h2>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            Desk alerts for members will land here. Admin trading tools stay on the admin portal.
          </p>
        </article>
        <article className="card p-5">
          <UserRound size={18} className="text-brand-500" />
          <h2 className="mt-3 text-sm font-bold">Your profile</h2>
          <p className="mt-1 text-xs leading-5 text-slate-500">Name, Gmail, and mobile for this account.</p>
          <Link to="/profile" className="mt-3 inline-flex h-9 items-center rounded-lg bg-brand-500 px-3 text-xs font-semibold text-white">
            Open profile
          </Link>
        </article>
        <article className="card p-5">
          <Shield size={18} className="text-brand-500" />
          <h2 className="mt-3 text-sm font-bold">Admin desk</h2>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            Brokers, algos, live orders, and settings are only for admin users.
          </p>
        </article>
      </div>
    </div>
  );
}
