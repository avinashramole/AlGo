import { useCallback, useEffect, useState } from "react";
import {
  confirmEnrollmentPaid,
  enrollStrategy,
  listEnrollments,
  strategyCatalog,
  type CatalogStrategy,
  type Enrollment,
  type PaymentPublic,
  type UpiLinks,
} from "../api/client";
import { formatInr } from "../lib/format";

export function Subscriptions() {
  const [strategies, setStrategies] = useState<CatalogStrategy[]>([]);
  const [payments, setPayments] = useState<PaymentPublic | null>(null);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");
  const [checkout, setCheckout] = useState<{ strategy: CatalogStrategy; enrollment: Enrollment; links: UpiLinks | null; payments: PaymentPublic } | null>(
    null,
  );

  const load = useCallback(async () => {
    try {
      const [catalog, mine] = await Promise.all([strategyCatalog(), listEnrollments()]);
      setStrategies(catalog.strategies || []);
      setPayments(catalog.payments);
      setEnrollments(mine.enrollments || []);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load subscriptions");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const statusFor = (id: string) => enrollments.find((row) => row.strategyId === id);

  const enroll = async (strategy: CatalogStrategy) => {
    setBusyId(strategy.id);
    setError("");
    try {
      const result = await enrollStrategy(strategy.id, "gpay");
      setEnrollments((rows) => {
        const next = rows.filter((row) => row.id !== result.enrollment.id);
        return [result.enrollment, ...next];
      });
      if (result.already) return;
      setCheckout({ strategy, enrollment: result.enrollment, links: result.links, payments: result.payments });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not enroll");
    } finally {
      setBusyId("");
    }
  };

  const confirmPaid = async () => {
    if (!checkout) return;
    setBusyId(checkout.strategy.id);
    try {
      const result = await confirmEnrollmentPaid(checkout.enrollment.id);
      setEnrollments((rows) => rows.map((row) => (row.id === result.enrollment.id ? result.enrollment : row)));
      setCheckout(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not confirm payment");
    } finally {
      setBusyId("");
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-3">
      <div>
        <h1 className="text-xl font-bold">Subscriptions</h1>
        <p className="text-sm text-slate-400">
          Admin strategies you can enroll in. Pay the listed amount to the desk GPay / PhonePe number.
        </p>
      </div>
      {payments?.ready ? (
        <p className="text-sm text-slate-500">
          Payments go to <span className="font-semibold">{payments.payeeName}</span> · {payments.mobileMasked} · UPI {payments.upiId}
        </p>
      ) : (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
          Admin has not set a GPay / PhonePe mobile yet. Ask the desk to add it in Settings.
        </p>
      )}
      {error ? <div className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-down">{error}</div> : null}
      <div className="space-y-3">
        {strategies.map((row) => {
          const current = statusFor(row.id);
          return (
            <article key={row.id} className="card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-extrabold">{row.name}</h2>
                  <p className="mt-1 text-xs text-slate-500">
                    {[row.symbol, row.timeframe, row.tag].filter(Boolean).join(" · ") || "Desk strategy"}
                  </p>
                  {row.summary ? <p className="mt-2 text-sm text-slate-500">{row.summary}</p> : null}
                  <div className="mt-2 text-sm font-bold">{formatInr(row.enrollFee)}</div>
                </div>
                {current?.status === "paid" ? (
                  <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-extrabold uppercase text-up">Enrolled</span>
                ) : (
                  <button
                    type="button"
                    disabled={Boolean(busyId) || !payments?.ready}
                    onClick={() => void enroll(row)}
                    className="h-10 rounded-xl bg-brand-500 px-4 text-xs font-semibold text-white disabled:opacity-50"
                  >
                    {busyId === row.id ? "Opening..." : current?.status === "pending" ? "Pay now" : "Enroll"}
                  </button>
                )}
              </div>
            </article>
          );
        })}
        {!strategies.length ? <div className="card px-4 py-6 text-sm text-slate-400">No strategies published yet.</div> : null}
      </div>

      {checkout ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-3 sm:items-center">
          <div className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-xl">
            <h3 className="text-lg font-extrabold">Deposit {formatInr(checkout.enrollment.amount)}</h3>
            <p className="mt-1 text-sm text-slate-500">
              Pay this amount to the admin GPay or PhonePe number for <strong>{checkout.strategy.name}</strong>.
              <br />
              Name: <strong>{checkout.payments.payeeName}</strong>
              <br />
              Mobile: <strong>{checkout.payments.mobile}</strong>
              <br />
              UPI: <strong>{checkout.payments.upiId}</strong>
            </p>
            {checkout.links?.qr ? (
              <img alt="UPI QR" className="mx-auto mt-3 h-40 w-40 rounded-xl bg-white p-2" src={checkout.links.qr} />
            ) : null}
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
