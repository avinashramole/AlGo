import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  confirmWalletTopup,
  getMemberDesk,
  selectMemberBroker,
  startWalletTopup,
  type MemberDesk,
  type PaymentPublic,
  type UpiLinks,
  type WalletTopup,
} from "../api/client";
import { SideBadge } from "../components/desk/Badges";
import { cn, formatInr, formatIst, formatNumber } from "../lib/format";

export function MemberPlans() {
  const [desk, setDesk] = useState<MemberDesk | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [amount, setAmount] = useState("5000");
  const [checkout, setCheckout] = useState<{ topup: WalletTopup; payments: PaymentPublic; links: UpiLinks | null } | null>(null);

  const load = useCallback(async () => {
    try {
      setDesk(await getMemberDesk());
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load plan report");
    }
  }, []);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => {
      void load();
    }, 8000);
    return () => window.clearInterval(id);
  }, [load]);

  const pickBroker = async (brokerId: string) => {
    setBusy(brokerId);
    setError("");
    try {
      const result = await selectMemberBroker(brokerId);
      setDesk((row) => (row ? { ...row, brokerId: result.brokerId, brokers: result.brokers } : row));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not select broker");
    } finally {
      setBusy("");
    }
  };

  const addBalance = async (channel: "gpay" | "phonepe") => {
    setBusy("topup");
    setError("");
    try {
      const result = await startWalletTopup(Number(amount), channel);
      setCheckout(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add balance");
    } finally {
      setBusy("");
    }
  };

  const confirmPaid = async () => {
    if (!checkout) return;
    setBusy("paid");
    try {
      await confirmWalletTopup(checkout.topup.id);
      setCheckout(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not confirm top-up");
    } finally {
      setBusy("");
    }
  };

  if (!desk) {
    return (
      <div className="card p-8 text-center">
        <div className="text-base font-bold">Plan report is loading</div>
        <p className="mt-1 text-sm text-slate-400">{error || "Your MTM, wallet, and broker will show here."}</p>
      </div>
    );
  }

  const report = desk.report;
  const maxDaily = Math.max(1, ...(report?.daily || []).map((row) => Math.abs(row.pnl)));
  const brokerName = (id?: string) => desk.brokers.find((row) => row.id === id)?.name || id || "Paper";

  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-xl font-bold">My plan</h1>
        <p className="text-sm text-slate-400">MTM on enrolled strategies, add wallet balance, and pick the broker for this account.</p>
      </div>
      {error ? <div className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-down">{error}</div> : null}

      <div className="grid gap-3 md:grid-cols-3">
        <Stat label="Wallet balance" value={formatInr(desk.wallet.balance)} signed={desk.wallet.balance} />
        <Stat label="Open MTM" value={formatInr(desk.wallet.mtm)} signed={desk.wallet.mtm} />
        <Stat label="Equity" value={formatInr(desk.wallet.equity)} signed={desk.wallet.equity} />
      </div>

      <section className="card p-4">
        <div className="text-sm font-bold">Balance adder</div>
        <p className="mt-1 text-xs text-slate-400">
          Add money via GPay or PhonePe. It is deposited to the admin number
          {desk.payments.ready ? ` ${desk.payments.mobileMasked}` : ""}.
        </p>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <label className="text-xs font-semibold text-slate-500">
            Amount ₹
            <input
              className="mt-1 block h-10 w-36 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 text-sm font-semibold"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              inputMode="numeric"
            />
          </label>
          <button
            type="button"
            disabled={busy === "topup" || !desk.payments.ready}
            onClick={() => void addBalance("gpay")}
            className="h-10 rounded-xl bg-brand-500 px-4 text-xs font-semibold text-white disabled:opacity-50"
          >
            {busy === "topup" ? "Opening..." : "Add via GPay"}
          </button>
          <button
            type="button"
            disabled={busy === "topup" || !desk.payments.ready}
            onClick={() => void addBalance("phonepe")}
            className="h-10 rounded-xl bg-[#5f259f] px-4 text-xs font-semibold text-white disabled:opacity-50"
          >
            Add via PhonePe
          </button>
        </div>
        {!desk.payments.ready ? (
          <p className="mt-2 text-xs font-semibold text-amber-700">Admin has not set a GPay / PhonePe mobile yet.</p>
        ) : null}
        {desk.topups.length ? (
          <div className="mt-4 space-y-1">
            <div className="text-[11px] font-bold uppercase text-slate-400">Recent top-ups</div>
            {desk.topups.slice(0, 5).map((row) => (
              <div key={row.id} className="flex justify-between text-xs">
                <span className="font-semibold">{formatInr(row.amount)}</span>
                <span className="uppercase text-slate-500">{row.status}</span>
              </div>
            ))}
          </div>
        ) : null}
      </section>

      <section className="card p-4">
        <div className="text-sm font-bold">Broker selection</div>
        <p className="mt-1 text-xs text-slate-400">
          Choose the broker used on your plan book. Paper is virtual. Other brokers are desk-managed — you do not enter API keys here.
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {desk.brokers.map((row) => (
            <button
              key={row.id}
              type="button"
              disabled={Boolean(busy)}
              onClick={() => void pickBroker(row.id)}
              className={cn(
                "rounded-xl border px-3 py-3 text-left",
                row.selected ? "border-brand-500 bg-brand-50 dark:bg-brand-500/10" : "border-[var(--border)] bg-[var(--bg)]",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-extrabold">{row.name}</span>
                {row.selected ? <span className="text-[10px] font-extrabold uppercase text-brand-500">Selected</span> : null}
              </div>
              <div className="mt-1 text-[11px] text-slate-500">{row.virtual ? "Virtual paper" : "Desk managed"}</div>
            </button>
          ))}
        </div>
      </section>

      {desk.plans.length ? (
        <section className="grid gap-3 md:grid-cols-2">
          {desk.plans.map((row) => (
            <article key={row.strategyId} className="card p-4">
              <div className="text-[11px] font-extrabold uppercase text-slate-400">Enrolled plan</div>
              <h2 className="mt-1 text-base font-extrabold">{row.strategyName}</h2>
              <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                <div>
                  <div className="text-[11px] uppercase text-slate-400">Realized</div>
                  <div className={row.realizedPnl >= 0 ? "font-bold text-up" : "font-bold text-down"}>{formatInr(row.realizedPnl)}</div>
                </div>
                <div>
                  <div className="text-[11px] uppercase text-slate-400">MTM</div>
                  <div className={row.unrealizedPnl >= 0 ? "font-bold text-up" : "font-bold text-down"}>{formatInr(row.unrealizedPnl)}</div>
                </div>
              </div>
            </article>
          ))}
        </section>
      ) : (
        <section className="card p-5">
          <div className="text-sm font-bold">No enrolled plan yet</div>
          <p className="mt-1 text-xs text-slate-500">Enroll on Subscriptions. After you pay, MTM for that strategy shows here.</p>
          <Link to="/subscriptions" className="mt-3 inline-flex h-9 items-center rounded-lg bg-brand-500 px-3 text-xs font-semibold text-white">
            View subscriptions
          </Link>
        </section>
      )}

      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        <Stat label="Realized P&L" value={formatInr(report.realizedPnl)} signed={report.realizedPnl} />
        <Stat label="Unrealized MTM" value={formatInr(report.unrealizedPnl)} signed={report.unrealizedPnl} />
        <Stat label="Net P&L" value={formatInr(report.netPnl)} signed={report.netPnl} />
        <Stat label="Win rate" value={`${report.winRate}%`} />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <section className="card p-4">
          <div className="mb-3 text-sm font-bold">Daily P&L</div>
          <div className="space-y-2">
            {(report.daily || []).map((row) => (
              <div key={row.date}>
                <div className="mb-1 flex justify-between text-xs">
                  <span className="font-semibold">{row.date}</span>
                  <span className={row.pnl >= 0 ? "text-up" : "text-down"}>{formatInr(row.pnl)}</span>
                </div>
                <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800">
                  <div
                    className={cn("h-2 rounded-full", row.pnl >= 0 ? "bg-up" : "bg-down")}
                    style={{ width: `${Math.max(6, (Math.abs(row.pnl) / maxDaily) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>
        <section className="card p-4">
          <div className="mb-3 text-sm font-bold">Open positions · MTM</div>
          <div className="space-y-2">
            {desk.positions.map((row) => (
              <div key={row.id} className="flex items-center justify-between rounded-lg bg-[var(--bg)] px-3 py-2 text-sm">
                <div>
                  <div className="font-semibold">{row.symbol}</div>
                  <div className="text-[11px] text-slate-400">
                    {row.strategy} · {row.qty} qty · LTP {formatNumber(row.ltp)}
                  </div>
                </div>
                <div className={cn("font-bold", row.pnl >= 0 ? "text-up" : "text-down")}>{formatInr(row.pnl)}</div>
              </div>
            ))}
            {!desk.positions.length ? <p className="text-xs text-slate-400">No open plan positions.</p> : null}
          </div>
        </section>
      </div>

      <section className="card overflow-x-auto">
        <div className="px-4 pt-4 text-sm font-bold">Trade book</div>
        <table className="mt-2 w-full min-w-[760px] text-left text-sm">
          <thead className="bg-[var(--bg)] text-[11px] uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-4 py-3 font-semibold">Closed</th>
              <th className="px-4 py-3 font-semibold">Symbol</th>
              <th className="px-4 py-3 font-semibold">Side</th>
              <th className="px-4 py-3 text-right font-semibold">Qty</th>
              <th className="px-4 py-3 text-right font-semibold">Entry</th>
              <th className="px-4 py-3 text-right font-semibold">Exit</th>
              <th className="px-4 py-3 text-right font-semibold">P&L</th>
              <th className="px-4 py-3 font-semibold">Broker</th>
            </tr>
          </thead>
          <tbody>
            {(report.tradeBook || []).map((row) => (
              <tr key={row.id} className="soft-row">
                <td className="px-4 py-3 text-xs text-slate-500">{formatIst(row.closedAt)}</td>
                <td className="px-4 py-3 font-semibold">{row.symbol}</td>
                <td className="px-4 py-3">
                  <SideBadge side={row.side} />
                </td>
                <td className="px-4 py-3 text-right">{row.qty}</td>
                <td className="px-4 py-3 text-right">{formatNumber(row.entry)}</td>
                <td className="px-4 py-3 text-right">{formatNumber(row.exit)}</td>
                <td className={cn("px-4 py-3 text-right font-semibold", row.pnl >= 0 ? "text-up" : "text-down")}>{formatInr(row.pnl)}</td>
                <td className="px-4 py-3">{brokerName(row.brokerId)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {checkout ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-3 sm:items-center">
          <div className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-xl">
            <h3 className="text-lg font-extrabold">Add {formatInr(checkout.topup.amount)}</h3>
            <p className="mt-1 text-sm text-slate-500">
              Pay this amount to the admin GPay or PhonePe number.
              <br />
              Name: <strong>{checkout.payments.payeeName}</strong>
              <br />
              Mobile: <strong>{checkout.payments.mobile}</strong>
              <br />
              UPI: <strong>{checkout.payments.upiId}</strong>
            </p>
            {checkout.links?.qr ? <img alt="UPI QR" className="mx-auto mt-3 h-40 w-40 rounded-xl bg-white p-2" src={checkout.links.qr} /> : null}
            <div className="mt-4 grid gap-2">
              {checkout.links ? (
                <>
                  <a href={checkout.links.gpay} className="flex h-11 items-center justify-center rounded-xl bg-brand-500 text-sm font-semibold text-white">
                    Open GPay
                  </a>
                  <a href={checkout.links.phonepe} className="flex h-11 items-center justify-center rounded-xl bg-[#5f259f] text-sm font-semibold text-white">
                    Open PhonePe
                  </a>
                </>
              ) : null}
              <button type="button" onClick={() => void confirmPaid()} className="h-11 rounded-xl border border-[var(--border)] text-sm font-semibold">
                I have paid
              </button>
              <button type="button" onClick={() => setCheckout(null)} className="h-10 text-sm font-semibold text-slate-500">
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Stat({ label, value, signed }: { label: string; value: string; signed?: number }) {
  return (
    <div className="card p-4">
      <div className="text-[11px] font-semibold uppercase text-slate-400">{label}</div>
      <div className={cn("mt-1 text-2xl font-bold", signed != null && (signed >= 0 ? "text-up" : "text-down"))}>{value}</div>
    </div>
  );
}
