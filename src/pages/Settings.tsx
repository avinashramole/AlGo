import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { connectGmail, getGmailStatus, getPaymentSettings, listEnrollments, savePaymentSettings, type Enrollment } from "../api/client";
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
  const [payMobile, setPayMobile] = useState("");
  const [payUpi, setPayUpi] = useState("");
  const [payAmount, setPayAmount] = useState("999");
  const [payName, setPayName] = useState("Trade2Smart");
  const [payNote, setPayNote] = useState("");
  const [payBusy, setPayBusy] = useState(false);
  const [enrolls, setEnrolls] = useState<Enrollment[]>([]);
  const rows = [
    ["Desk", user?.desk || "Index Options"],
    ["Gmail mail", mailConnected ? `Sending · ${mailFrom}` : "Not connected — codes and login mail stay off"],
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
    void getPaymentSettings()
      .then((row) => {
        setPayMobile(row.payments.mobile || "");
        setPayUpi(row.payments.upiId || "");
        setPayAmount(String(row.payments.amount || 999));
        setPayName(row.payments.payeeName || "Trade2Smart");
      })
      .catch(() => undefined);
    void listEnrollments()
      .then((row) => setEnrolls(row.enrollments || []))
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
      setMailNote("Gmail connected. Login codes and notices will be emailed.");
    } catch (err) {
      setMailNote(err instanceof Error ? err.message : "Gmail connect failed");
    } finally {
      setMailBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-3">
      <h1 className="text-xl font-bold">Settings</h1>
      <Link to="/profile" className="card flex items-center justify-between px-4 py-3">
        <span className="text-sm font-semibold">User profile</span>
        <span className="text-sm font-semibold text-brand-500">Name, email, mobile →</span>
      </Link>
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
          After login, T2S emails the user Gmail a sign-in notice. Login codes use the same mailbox. Create an App Password in Google Account → Security → 2-Step Verification → App passwords.
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
      <section className="card p-4">
        <div className="text-sm font-bold">GPay / PhonePe enrollments</div>
        <p className="mt-1 text-xs text-slate-400">
          Members pay this amount to your GPay or PhonePe mobile when they tap Enroll. Use the 10-digit number linked to those apps. Optional UPI ID example: 98xxxxxxxx@ybl (PhonePe) or 98xxxxxxxx@okicici (GPay).
        </p>
        <form
          className="mt-3 grid gap-2 sm:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            setPayBusy(true);
            setPayNote("");
            void savePaymentSettings({
              mobile: payMobile,
              upiId: payUpi,
              amount: Number(payAmount),
              payeeName: payName,
            })
              .then((row) => {
                setPayMobile(row.payments.mobile);
                setPayUpi(row.payments.upiId);
                setPayAmount(String(row.payments.amount));
                setPayName(row.payments.payeeName);
                setPayNote("Payment number saved. Member enrollments will send money here.");
              })
              .catch((err) => setPayNote(err instanceof Error ? err.message : "Could not save"))
              .finally(() => setPayBusy(false));
          }}
        >
          <input className="h-10 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 text-sm" value={payName} onChange={(event) => setPayName(event.target.value)} placeholder="Payee name" />
          <input className="h-10 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 text-sm" value={payMobile} onChange={(event) => setPayMobile(event.target.value)} placeholder="10-digit GPay / PhonePe mobile" />
          <input className="h-10 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 text-sm" value={payUpi} onChange={(event) => setPayUpi(event.target.value)} placeholder="UPI ID (optional)" />
          <input className="h-10 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 text-sm" value={payAmount} onChange={(event) => setPayAmount(event.target.value)} placeholder="Amount ₹" />
          <button type="submit" disabled={payBusy} className="h-10 rounded-xl bg-brand-500 text-sm font-semibold text-white sm:col-span-2">
            {payBusy ? "Saving..." : "Save payment number"}
          </button>
        </form>
        {payNote ? <p className="mt-2 text-xs font-semibold text-slate-500">{payNote}</p> : null}
        {enrolls.length ? (
          <div className="mt-4 overflow-x-auto">
            <div className="mb-2 text-xs font-bold uppercase text-slate-400">Member enrollments</div>
            {enrolls.slice(0, 12).map((row) => (
              <div key={row.id} className="flex justify-between gap-2 border-t border-[var(--border)] py-2 text-xs">
                <span className="font-semibold">{row.userName || row.userEmail}</span>
                <span className="text-slate-500">{row.strategyName}</span>
                <span className="uppercase">{row.status}</span>
              </div>
            ))}
          </div>
        ) : null}
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
