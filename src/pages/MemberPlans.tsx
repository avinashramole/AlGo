import { useCallback, useEffect, useRef, useState } from "react";
import {
  abandonEnrollment,
  claimEnrollmentPaid,
  enrollStrategy,
  getMemberDesk,
  installMemberBroker,
  listEnrollments,
  requestMemberUpstoxToken,
  selectMemberBroker,
  strategyCatalog,
  type CatalogStrategy,
  type Enrollment,
  type MemberDesk,
  type PaymentPublic,
  type PlanTerm,
  type UpiLinks,
} from "../api/client";
import { BrokerInstallFields } from "../components/desk/BrokerInstallFields";
import { MemberLiveBook } from "../components/desk/MemberLiveBook";
import { credsAfterInstall, hintsFromInstall, installValueForSubmit } from "../lib/formSecrets";
import { cn, formatInr, formatIst, formatIstDate, formatPlanTerm } from "../lib/format";

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
  const [creds, setCreds] = useState<Record<string, string>>({});
  const [credNote, setCredNote] = useState("");
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
      setCreds((current) => credsAfterInstall(nextDesk.install, current, { keepTyped: true }));
      setError("");
    } catch (err) {
      if (gen !== loadGen.current) return;
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

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("upstox") === "connected") {
      setCredNote("Upstox trading access token saved. Live copy will use this token.");
    }
    if (params.get("upstox") === "error") {
      setError(params.get("message") || "Upstox login failed");
    }
  }, []);

  const pickBroker = async (brokerId: string) => {
    setBusy(brokerId);
    setError("");
    setCredNote("");
    setCreds({});
    try {
      await selectMemberBroker(brokerId);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not select broker");
    } finally {
      setBusy("");
    }
  };

  const requestUpstoxToken = async () => {
    setBusy("upstox-token");
    setError("");
    setCredNote("");
    try {
      const result = await requestMemberUpstoxToken();
      setCredNote(result.message || "Approve today's Upstox trading token in the Upstox app.");
      if (result.loginUrl) window.open(result.loginUrl, "_blank", "noopener,noreferrer");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not request Upstox trading token");
    } finally {
      setBusy("");
    }
  };

  const saveCredentials = async () => {
    if (!desk || desk.brokerId === "paper") return;
    setBusy("creds");
    setError("");
    setCredNote("");
    try {
      const hints = hintsFromInstall(desk.install);
      const clientId = installValueForSubmit({ id: "clientId" }, creds, hints);
      const result = await installMemberBroker({
        brokerId: desk.brokerId,
        clientId,
        apiKey: installValueForSubmit({ id: "apiKey", secret: true }, creds, hints),
        accessToken: installValueForSubmit({ id: "accessToken", secret: true }, creds, hints),
        sessionToken: installValueForSubmit({ id: "sessionToken", secret: true }, creds, hints),
      });
      loadGen.current += 1;
      setDesk((current) =>
        current ? { ...current, brokerId: result.brokerId || current.brokerId, install: result.install } : current,
      );
      setCreds({ clientId: String(result.install?.accountId || clientId || "").trim() });
      await load();
      setCredNote("Client ID and access token updated on this account and on admin Users. Live copy now uses this token. Desk LIVE was not started.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not install broker token");
    } finally {
      setBusy("");
    }
  };

  const termFor = (id: string): PlanTerm => terms[id] || "monthly";
  const feeFor = (row: CatalogStrategy, term: PlanTerm) => row.terms?.[term] ?? row.enrollFee * ({ monthly: 1, quarterly: 3, yearly: 12 }[term]);
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
      <div className="card p-8 text-center">
        <div className="text-base font-bold">Plan report is loading</div>
        <p className="mt-1 text-sm text-slate-400">{error || "Your subscriptions, MTM, and broker will show here."}</p>
      </div>
    );
  }

  const report = desk.report;
  const maxDaily = Math.max(1, ...(report?.daily || []).map((row) => Math.abs(row.pnl)));
  const brokerName = (id?: string) => desk.brokers.find((row) => row.id === id)?.name || id || "Paper";
  const payReady = Boolean(payments?.ready || desk.payments.ready);

  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-xl font-bold">My plan</h1>
        <p className="text-sm text-slate-400">
          Enroll monthly, quarterly, or yearly. After you pay, tap I have paid. Live copy starts only after the desk confirms payment and you install your own broker token.
        </p>
      </div>
      {error ? <div className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-down">{error}</div> : null}

      <div className="grid gap-3 md:grid-cols-3">
        <Stat label="Wallet balance" value={formatInr(desk.wallet.balance)} signed={desk.wallet.balance} />
        <Stat label="Open MTM" value={formatInr(desk.wallet.mtm)} signed={desk.wallet.mtm} />
        <Stat label="Equity" value={formatInr(desk.wallet.equity)} signed={desk.wallet.equity} />
      </div>

      <section className="card p-4">
        <div className="text-sm font-bold">Subscriptions</div>
        <p className="mt-1 text-xs text-slate-400">
          Choose a term and pay the listed amount to the desk GPay / PhonePe number
          {payments?.ready ? ` ${payments.mobileMasked}` : ""}. Closing without payment returns the button to Enroll.
          Live trades use your token and size after an admin confirms the payment.
        </p>
        {payments?.ready ? (
          <p className="mt-2 text-xs text-slate-500">
            Payments go to <span className="font-semibold">{payments.payeeName}</span> · {payments.mobileMasked} · UPI {payments.upiId}
          </p>
        ) : (
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
                  <div className="mt-3 flex flex-wrap gap-2">
                    {TERMS.map((term) => (
                      <button
                        key={term}
                        type="button"
                        onClick={() => setTerms((currentTerms) => ({ ...currentTerms, [row.id]: term }))}
                        className={cn(
                          "rounded-full border px-3 py-1 text-[11px] font-extrabold uppercase",
                          selected === term
                            ? "border-brand-500 bg-brand-50 text-brand-500"
                            : "border-[var(--border)] text-slate-500",
                        )}
                      >
                        {formatPlanTerm(term)} {formatInr(feeFor(row, term))}
                      </button>
                    ))}
                  </div>
                ) : null}
              </article>
            );
          })}
          {!strategies.length ? <p className="text-xs text-slate-400">No strategies published yet.</p> : null}
        </div>
      </section>

      <section className="card p-4">
        <div className="text-sm font-bold">Broker selection</div>
        <p className="mt-1 text-xs text-slate-400">
          Choose the broker used for your live copies. Each live broker keeps its own client ID and access token — selecting
          DHAN does not overwrite UPSTOX. Paper stays on this plan book only. Saving a token does not start desk LIVE.
        </p>
        <p className="mt-2 text-xs font-semibold text-slate-500">
          {desk.copyReady
            ? `Live copy ready · ${brokerName(desk.brokerId)} uses your token on each master signal`
            : desk.autoTrade
              ? `Broker selected · live copy starts after admin confirms payment and your token is installed`
              : "Virtual paper book · copies stay on this plan book"}
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
              <div className="mt-1 text-[11px] text-slate-500">
                {row.virtual
                  ? "Virtual paper"
                  : row.installed
                    ? `Token saved${row.accountId ? ` · ${row.accountId}` : ""}`
                    : "Needs this broker's ID and token"}
              </div>
            </button>
          ))}
        </div>
        {desk.brokerId !== "paper" ? (
          <form
            className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--bg)] p-3"
            onSubmit={(event) => {
              event.preventDefault();
              void saveCredentials();
            }}
          >
            <div className="text-sm font-bold">{desk.brokerId === "upstox" ? "Upstox trading credentials" : "Client ID and access token"}</div>
            <p className="mt-1 text-xs text-slate-400">
              {desk.install?.help || "Install the broker client ID and access token for this account. Admin Users shows the same saved values."}
            </p>
            {desk.install?.installed ? (
              <p className="mt-2 text-xs font-semibold text-slate-500">
                Installed{desk.install.accountId ? ` · ${desk.install.accountId}` : ""}
                {desk.install.tokenHint ? ` · token ${desk.install.tokenHint}` : ""}
                {desk.install.tokenUpdatedAt ? ` · updated ${formatIst(desk.install.tokenUpdatedAt)}` : ""}
                {desk.install.apiKeyHint ? ` · API ${desk.install.apiKeyHint}` : ""}
              </p>
            ) : (
              <p className="mt-2 text-xs font-semibold text-amber-700">No access token installed yet.</p>
            )}
            <div className="mt-3">
              <BrokerInstallFields
                fields={desk.install?.fields || []}
                values={creds}
                hints={hintsFromInstall(desk.install)}
                disabled={busy === "creds"}
                onChange={(id, value) => setCreds((current) => ({ ...current, [id]: value }))}
              />
            </div>
            {credNote ? <p className="mt-2 text-xs font-semibold text-slate-500">{credNote}</p> : null}
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="submit"
                disabled={busy === "creds"}
                className="h-10 rounded-xl bg-brand-500 px-4 text-xs font-semibold text-white disabled:opacity-50"
              >
                {busy === "creds" ? "Saving..." : desk.brokerId === "upstox" ? "Save API key and secret" : "Save client ID and access token"}
              </button>
              {desk.brokerId === "upstox" ? (
                <button
                  type="button"
                  disabled={Boolean(busy)}
                  onClick={() => void requestUpstoxToken()}
                  className="h-10 rounded-xl border border-brand-500 px-4 text-xs font-semibold text-brand-500 disabled:opacity-50"
                >
                  {busy === "upstox-token" ? "Asking Upstox..." : "Get today's trading token"}
                </button>
              ) : null}
            </div>
          </form>
        ) : null}
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
          <p className="mt-1 text-xs text-slate-500">Pick a monthly, quarterly, or yearly term above and complete payment. MTM for that strategy shows here after you pay.</p>
        </section>
      )}

      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        <Stat label="Realized P&L" value={formatInr(report.realizedPnl)} signed={report.realizedPnl} />
        <Stat label="Unrealized MTM" value={formatInr(report.unrealizedPnl)} signed={report.unrealizedPnl} />
        <Stat label="Net P&L" value={formatInr(report.netPnl)} signed={report.netPnl} />
        <Stat label="Win rate" value={`${report.winRate}%`} />
      </div>

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

      <MemberLiveBook
        positions={desk.positions}
        orders={desk.orders || []}
        tradeBook={report.tradeBook}
        brokerName={brokerName}
      />

      {checkout ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-3 sm:items-center">
          <div className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-xl">
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

function Stat({ label, value, signed }: { label: string; value: string; signed?: number }) {
  return (
    <div className="card p-4">
      <div className="text-[11px] font-semibold uppercase text-slate-400">{label}</div>
      <div className={cn("mt-1 text-2xl font-bold", signed != null && (signed >= 0 ? "text-up" : "text-down"))}>{value}</div>
    </div>
  );
}
