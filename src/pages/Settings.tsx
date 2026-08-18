import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { connectGmail, getGmailStatus } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { useMarket } from "../context/MarketContext";

export function Settings() {
  const { user, logout } = useAuth();
  const { data } = useMarket();
  const [mailConnected, setMailConnected] = useState(false);
  const [mailFrom, setMailFrom] = useState("");
  const [senderEmail, setSenderEmail] = useState("");
  const [appPassword, setAppPassword] = useState("");
  const [mailNote, setMailNote] = useState("");
  const [mailBusy, setMailBusy] = useState(false);
  const rows = [
    ["Name", user?.name || "Avinash"],
    ["Account", user?.email || "demo@t2s.app"],
    ["Desk", user?.desk || "Index Options"],
    ["Gmail mail", mailConnected ? `Sending · ${mailFrom}` : "Not connected — OTP and login mail stay off"],
    ["Default product", data.settings.product || "MIS"],
    ["Order confirmation", data.settings.confirmation || "Enabled"],
    ["Risk guard", data.settings.riskGuard || "Max 2% per trade"],
    ["Active broker", data.brokers?.find((item) => item.active)?.name || "Dhan"],
    ["Dhan feed", data.dhanFeed?.live ? `Live · ${data.dhanFeed.tokenHint || "connected"}` : "Waiting for access token"],
    ["Connected brokers", String((data.brokers || []).filter((item) => item.connected).length)],
    ["Notifications", data.settings.notifications || "Signals + fills"],
  ];

  useEffect(() => {
    void getGmailStatus()
      .then((row) => {
        setMailConnected(Boolean(row.connected));
        setMailFrom(row.user || "");
      })
      .catch(() => undefined);
  }, []);

  const onConnect = async (event: FormEvent) => {
    event.preventDefault();
    setMailBusy(true);
    setMailNote("");
    try {
      const result = await connectGmail(senderEmail, appPassword);
      setMailConnected(Boolean(result.connected));
      setMailFrom(result.user || senderEmail);
      setAppPassword("");
      setMailNote("Gmail connected. OTP codes and login notices will be emailed.");
    } catch (err) {
      setMailNote(err instanceof Error ? err.message : "Gmail connect failed");
    } finally {
      setMailBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-3">
      <h1 className="text-xl font-bold">Settings</h1>
      <section className="card divide-y divide-[var(--border)]">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-center justify-between gap-3 px-4 py-3">
            <span className="text-sm">{label}</span>
            <span className="text-right text-sm font-semibold text-slate-500">{value}</span>
          </div>
        ))}
      </section>
      <section className="card p-4">
        <div className="text-sm font-bold">Gmail mail</div>
        <p className="mt-1 text-xs text-slate-400">
          After login, T2S emails the user Gmail a sign-in notice. OTP codes use the same mailbox. Create an App Password in Google Account → Security → 2-Step Verification → App passwords.
        </p>
        <form onSubmit={onConnect} className="mt-3 grid gap-2 sm:grid-cols-2">
          <input
            className="h-10 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 text-sm"
            value={senderEmail}
            onChange={(event) => setSenderEmail(event.target.value)}
            placeholder="you@gmail.com"
          />
          <input
            type="password"
            className="h-10 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 text-sm"
            value={appPassword}
            onChange={(event) => setAppPassword(event.target.value)}
            placeholder="App Password"
          />
          <button type="submit" disabled={mailBusy} className="h-10 rounded-xl bg-brand-500 text-sm font-semibold text-white sm:col-span-2">
            {mailBusy ? "Connecting..." : mailConnected ? "Update Gmail" : "Connect Gmail"}
          </button>
        </form>
        {mailNote ? <p className="mt-2 text-xs font-semibold text-slate-500">{mailNote}</p> : null}
      </section>
      <Link to="/brokers" className="inline-flex h-10 items-center rounded-xl bg-brand-50 px-4 text-sm font-semibold text-brand-500">
        Open broker hub
      </Link>
      <button type="button" onClick={logout} className="ml-2 h-10 rounded-xl bg-rose-50 px-4 text-sm font-semibold text-down">
        Log out
      </button>
    </div>
  );
}
