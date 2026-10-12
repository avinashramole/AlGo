import { useCallback, useEffect, useRef, useState } from "react";
import {
  abandonEnrollment,
  claimEnrollmentPaid,
  enrollStrategy,
  getMemberDesk,
  listEnrollments,
  strategyCatalog,
  type CatalogStrategy,
  type Enrollment,
  type MemberDesk,
  type PaymentPublic,
  type PlanTerm,
  type UpiLinks,
} from "../api/client";
import { cn, formatInr, formatIstDate, formatPlanTerm, formatRupee } from "../lib/format";
import { bestPlanSave, planOffer } from "../lib/planPrice";

const TERMS: PlanTerm[] = ["monthly", "quarterly", "yearly"];

export function MemberPlans() {
  const [desk, setDesk] = useState<MemberDesk | null>(null);
  const [strategies, setStrategies] = useState<CatalogStrategy[]>([]);
  const [payments, setPayments] = useState<PaymentPublic | null>(null);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [terms, setTerms] = useState<Record<string, PlanTerm>>({});
  const [checkout, setCheckout] = useState<{
    strategy: CatalogStrategy;
    enrollment: Enrollment;
    links: UpiLinks | null;
    payments: PaymentPublic;
  } | null>(null);
  const [utr, setUtr] = useState("");
  const loadGen = useRef(0);

  const load = useCallback(async () => {
    const gen = ++loadGen.current;
    try {
      const [nextDesk, catalog, mine] = await Promise.all([getMemberDesk(), strategyCatalog(), listEnrollments()]);
      if (gen !== loadGen.current) return;
      setDesk(nextDesk);
      setStrategies(catalog.strategies || []);
      setPayments(catalog.payments);
      setEnrollments(mine.enrollments || []);
      setError("");
    } catch (err) {
      if (gen !== loadGen.current) return;
      setError(err instanceof Error ? err.message : "Could not load plan report");
    }
  }, []);

  useEffect(() => {
    void load();
    const deskId = window.setInterval(() => {
      void getMemberDesk()
        .then((next) => {
          setDesk(next);
        })
        .catch(() => undefined);
    }, 2000);
    const fullId = window.setInterval(() => {
      void load();
    }, 12000);
    return () => {
      window.clearInterval(deskId);
      window.clearInterval(fullId);
    };
  }, [load]);

  const termFor = (id: string): PlanTerm => terms[id] || "monthly";
  const feeFor = (row: CatalogStrategy, term: PlanTerm) => planOffer(row, term).price;
  const activeFor = (id: string) => enrollments.find((row) => row.strategyId === id && row.status === "paid" && row.active !== false);
  const claimedFor = (id: string) => enrollments.find((row) => row.strategyId === id && row.status === "claimed");

  const enroll = async (strategy: CatalogStrategy) => {
    setBusy(strategy.id);
    setError("");
    try {
      const result = await enrollStrategy(strategy.id, "gpay", termFor(strategy.id));
      setEnrollments((rows) => {
        const next = rows.filter((row) => row.id !== result.enrollment.id);
        return [result.enrollment, ...next];
      });
      if (result.already) return;
      setUtr("");
      setCheckout({ strategy, enrollment: result.enrollment, links: result.links, payments: result.payments });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not enroll");
    } finally {
      setBusy("");
    }
  };

  const claimPaid = async () => {
    if (!checkout) return;
    setBusy(checkout.strategy.id);
    try {
      await claimEnrollmentPaid(checkout.enrollment.id, utr);
      setCheckout(null);
      setUtr("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send payment claim");
    } finally {
      setBusy("");
    }
  };

  const closeCheckout = async () => {
    const current = checkout;
    setCheckout(null);
    setUtr("");
    if (!current || current.enrollment.status === "paid" || current.enrollment.status === "claimed") return;
    setBusy(current.strategy.id);
    try {
      await abandonEnrollment(current.enrollment.id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not cancel enrollment");
    } finally {
      setBusy("");
    }
  };

  if (!desk) {
    return (
      <div className="space-y-3">
        <h1 className="text-xl font-bold">Algo Strategies</h1>
        <div className="card p-8 text-center">
          <div className="text-base font-bold">{error ? "No strategies yet" : "Plan report is loading"}</div>
          <p className="mt-1 text-sm text-slate-400">
            {error ? "Enroll a plan to start. If this stays empty, check your connection." : "Your subscriptions will show here."}
          </p>
        </div>
      </div>
    );
  }

  const payReady = Boolean(payments?.ready || desk.payments.ready);

  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-xl font-bold">Algo Strategies</h1>
      </div>
      {error ? <div className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-down">{error}</div> : null}

      <section className="card p-4">
        <div className="text-sm font-bold">Subscriptions</div>
        {payments?.ready ? null : (
          <p className="mt-2 text-xs font-semibold text-amber-700">Admin has not set a GPay / PhonePe mobile yet.</p>
        )}
        <div className="mt-3 space-y-3">
          {strategies.map((row) => {
            const current = activeFor(row.id);
            const waiting = claimedFor(row.id);
            const selected = termFor(row.id);
            return (
              <article key={row.id} className="rounded-xl border border-[var(--border)] bg-[var(--bg)] p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-base font-extrabold">{row.name}</h2>
                    {current ? (
                      <p className="mt-1 text-xs text-slate-500">
                        {formatPlanTerm(current.term)} · started {formatIstDate(current.startedAt)} · ends {formatIstDate(current.endsAt)}
                      </p>
                    ) : waiting ? (
                      <p className="mt-1 text-xs text-amber-700">
                        Payment claimed{waiting.utr ? ` · UTR ${waiting.utr}` : ""}. Waiting for the desk to confirm.
                      </p>
                    ) : (
                      <p className="mt-1 text-xs font-semibold text-slate-500">{formatInr(feeFor(row, selected))} · {formatPlanTerm(selected)}</p>
                    )}
                  </div>
                  {current ? (
                    <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-extrabold uppercase text-up">Enrolled</span>
                  ) : waiting ? (
                    <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-extrabold uppercase text-amber-700">Waiting for admin</span>
                  ) : (
                    <button
                      type="button"
                      disabled={Boolean(busy) || !payReady}
                      onClick={() => void enroll(row)}
                      className="h-10 rounded-xl bg-brand-500 px-4 text-xs font-semibold text-white disabled:opacity-50"
                    >
                      {busy === row.id ? "Opening..." : "Enroll"}
                    </button>
                  )}
                </div>
                {!current && !waiting ? (
                  <div className="mt-3 space-y-2">
                    <div className="flex flex-wrap gap-2">
                      {TERMS.map((term) => {
                        const offer = planOffer(row, term);
                        return (
                          <button
                            key={term}
                            type="button"
                            onClick={() => setTerms((currentTerms) => ({ ...currentTerms, [row.id]: term }))}
                            className={cn(
                              "rounded-xl border px-3 py-2 text-left",
                              selected === term
                                ? "border-brand-500 bg-brand-50 text-brand-500"
                                : "border-[var(--border)] text-slate-500",
                            )}
                          >
                            <div className="text-[11px] font-extrabold uppercase">{formatPlanTerm(term)}</div>
                            <div className="text-sm font-extrabold">{formatInr(offer.price)}</div>
                            {offer.save > 0 ? (
                              <div className="text-[11px] font-semibold text-up">Save {formatRupee(offer.save)}</div>
                            ) : (
                              <div className="text-[11px] font-semibold text-slate-400">{formatRupee(offer.perMonth, 0)}/mo</div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                    {bestPlanSave(row) > 0 ? (
                      <p className="text-xs font-semibold text-emerald-700">
                        Yearly saves {formatRupee(bestPlanSave(row))} versus 12 monthly payments.
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </article>
            );
          })}
          {!strategies.length ? <p className="text-xs text-slate-400">No strategies assigned to this account yet.</p> : null}
        </div>
      </section>

      {desk.plans.length ? (
        <section className="grid gap-3 md:grid-cols-2">
          {desk.plans.map((row) => (
            <article key={row.strategyId} className="card p-4">
              <div className="text-[11px] font-extrabold uppercase text-slate-400">Enrolled plan</div>
              <h2 className="mt-1 text-base font-extrabold">{row.strategyName}</h2>
              <p className="mt-1 text-xs text-slate-500">
                {formatPlanTerm(row.term)} · started {formatIstDate(row.startedAt)} · ends {formatIstDate(row.endsAt)}
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                <div>
                  <div className="text-[11px] font-semibold uppercase text-slate-400">Realized</div>
                  <div className={row.realizedPnl >= 0 ? "text-xl font-extrabold text-up" : "text-xl font-extrabold text-down"}>{formatInr(row.realizedPnl)}</div>
                </div>
                <div>
                  <div className="text-[11px] font-semibold uppercase text-slate-400">MTM</div>
                  <div className={row.unrealizedPnl >= 0 ? "text-xl font-extrabold text-up" : "text-xl font-extrabold text-down"}>{formatInr(row.unrealizedPnl)}</div>
                </div>
              </div>
            </article>
          ))}
        </section>
      ) : (
        <section className="card p-5">
          <div className="text-sm font-bold">No enrolled plan yet</div>
          <p className="mt-1 text-xs text-slate-500">Pick a monthly, quarterly, or yearly term above and complete payment. MTM for that strategy shows here after you pay.</p>
        </section>
      )}

      {checkout ? (
        <div className="desk-overlay">
          <div className="desk-sheet desk-sheet-sm rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-xl">
            <h3 className="text-lg font-extrabold">Deposit {formatInr(checkout.enrollment.amount)}</h3>
            <p className="mt-1 text-sm text-slate-500">
              Pay this {formatPlanTerm(checkout.enrollment.term).toLowerCase()} amount to the admin GPay or PhonePe number for{" "}
              <strong>{checkout.strategy.name}</strong>.
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
              <input
                className="h-11 rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 text-sm"
                value={utr}
                onChange={(event) => setUtr(event.target.value)}
                placeholder="UTR / UPI reference (optional)"
              />
              <button type="button" onClick={() => void claimPaid()} className="h-11 rounded-xl border border-[var(--border)] text-sm font-semibold">
                I have paid
              </button>
              <button type="button" onClick={() => void closeCheckout()} className="h-10 text-sm font-semibold text-slate-500">
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
