import { useEffect, useState, type FormEvent } from "react";
import {
  confirmEnrollmentPaid,
  getPaymentSettings,
  listEnrollments,
  listWalletTopups,
  savePaymentSettings,
  saveUserContact,
  type Enrollment,
  type WalletTopup,
} from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import { formatRupee } from "../../lib/format";
import { charmPrice, DEFAULT_PLAN_PRICES, TERM_MONTHS, type PlanTerm } from "../../lib/planPrice";

export function MemberEnrollments() {
  const { user, applyUser } = useAuth();
  const [payMobile, setPayMobile] = useState("");
  const [payUpi, setPayUpi] = useState("");
  const [payMonthly, setPayMonthly] = useState(String(DEFAULT_PLAN_PRICES.monthly));
  const [payQuarterly, setPayQuarterly] = useState(String(DEFAULT_PLAN_PRICES.quarterly));
  const [payYearly, setPayYearly] = useState(String(DEFAULT_PLAN_PRICES.yearly));
  const [payName, setPayName] = useState("Trade2Smart");
  const [payNote, setPayNote] = useState("");
  const [payBusy, setPayBusy] = useState(false);
  const [enrolls, setEnrolls] = useState<Enrollment[]>([]);
  const [topups, setTopups] = useState<WalletTopup[]>([]);
  const [confirmBusy, setConfirmBusy] = useState("");

  useEffect(() => {
    void getPaymentSettings()
      .then((row) => {
        setPayMobile(row.payments.mobile || "");
        setPayUpi(row.payments.upiId || "");
        const monthly = row.payments.terms?.monthly || row.payments.amount || DEFAULT_PLAN_PRICES.monthly;
        setPayMonthly(String(monthly));
        setPayQuarterly(String(row.payments.terms?.quarterly || charmPrice(monthly * (DEFAULT_PLAN_PRICES.quarterly / DEFAULT_PLAN_PRICES.monthly))));
        setPayYearly(String(row.payments.terms?.yearly || charmPrice(monthly * (DEFAULT_PLAN_PRICES.yearly / DEFAULT_PLAN_PRICES.monthly))));
        setPayName(row.payments.payeeName || "Trade2Smart");
      })
      .catch(() => undefined);
    void listEnrollments()
      .then((row) => setEnrolls(row.enrollments || []))
      .catch(() => undefined);
    void listWalletTopups()
      .then((row) => setTopups(row.topups || []))
      .catch(() => undefined);
  }, []);

  const onSave = (event: FormEvent) => {
    event.preventDefault();
    setPayBusy(true);
    setPayNote("");
    void savePaymentSettings({
      mobile: payMobile,
      upiId: payUpi,
      amount: Number(payMonthly),
      monthly: Number(payMonthly),
      quarterly: Number(payQuarterly),
      yearly: Number(payYearly),
      payeeName: payName,
    })
      .then(async (row) => {
        setPayMobile(row.payments.mobile);
        setPayUpi(row.payments.upiId);
        setPayMonthly(String(row.payments.terms?.monthly || row.payments.amount));
        setPayQuarterly(String(row.payments.terms?.quarterly || ""));
        setPayYearly(String(row.payments.terms?.yearly || ""));
        setPayName(row.payments.payeeName);
        if (user?.id && row.payments.mobile) {
          try {
            const saved = await saveUserContact(user.id, { name: user.name, mobile: row.payments.mobile });
            applyUser(saved.user);
          } catch {
            // Payment number is already stored even if the profile mobile is taken.
          }
        }
        setPayNote("Payment number saved on the admin account. Member enrollments will send money here.");
      })
      .catch((err) => setPayNote(err instanceof Error ? err.message : "Could not save"))
      .finally(() => setPayBusy(false));
  };

  return (
    <section className="card p-3 sm:p-4">
      <div className="text-sm font-bold">Member enrollments</div>
      <p className="desk-help mt-1 text-xs text-slate-400">
        Edit monthly, quarterly, and yearly plan prices. Longer terms stay discounted so members see the saving versus
        paying month by month. After a member taps I have paid, confirm the transfer here.
      </p>
      <form className="mt-3 grid gap-2 sm:grid-cols-2" onSubmit={onSave}>
        <input
          className="h-10 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 text-sm"
          value={payName}
          onChange={(event) => setPayName(event.target.value)}
          placeholder="Payee name"
        />
        <input
          className="h-10 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 text-sm"
          value={payMobile}
          onChange={(event) => setPayMobile(event.target.value)}
          placeholder="10-digit GPay / PhonePe mobile"
        />
        <input
          className="h-10 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 text-sm"
          value={payUpi}
          onChange={(event) => setPayUpi(event.target.value)}
          placeholder="UPI ID (optional)"
        />
        <label className="block text-xs font-semibold sm:col-span-2">
          Monthly
          <input
            className="mt-1 h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 text-sm font-normal"
            value={payMonthly}
            onChange={(event) => {
              const value = event.target.value;
              setPayMonthly(value);
              const monthly = Number(value);
              if (Number.isFinite(monthly) && monthly >= 1) {
                setPayQuarterly(String(charmPrice(monthly * (DEFAULT_PLAN_PRICES.quarterly / DEFAULT_PLAN_PRICES.monthly))));
                setPayYearly(String(charmPrice(monthly * (DEFAULT_PLAN_PRICES.yearly / DEFAULT_PLAN_PRICES.monthly))));
              }
            }}
            placeholder="Monthly ₹"
          />
        </label>
        <label className="block text-xs font-semibold">
          Quarterly
          <input
            className="mt-1 h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 text-sm font-normal"
            value={payQuarterly}
            onChange={(event) => setPayQuarterly(event.target.value)}
            placeholder="Quarterly ₹"
          />
          <span className="mt-1 block font-normal text-slate-500">{adminTermHint(payMonthly, payQuarterly, "quarterly")}</span>
        </label>
        <label className="block text-xs font-semibold">
          Yearly
          <input
            className="mt-1 h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 text-sm font-normal"
            value={payYearly}
            onChange={(event) => setPayYearly(event.target.value)}
            placeholder="Yearly ₹"
          />
          <span className="mt-1 block font-normal text-slate-500">{adminTermHint(payMonthly, payYearly, "yearly")}</span>
        </label>
        <button type="submit" disabled={payBusy} className="h-10 rounded-xl bg-brand-500 text-sm font-semibold text-white sm:col-span-2">
          {payBusy ? "Saving..." : "Save plan prices"}
        </button>
      </form>
      {payNote ? <p className="mt-2 text-xs font-semibold text-slate-500">{payNote}</p> : null}
      {enrolls.filter((row) => row.status !== "abandoned").length ? (
        <div className="mt-4 overflow-x-auto">
          <div className="mb-2 text-xs font-bold uppercase text-slate-400">Member enrollments</div>
          {enrolls
            .filter((row) => row.status !== "abandoned")
            .slice(0, 12)
            .map((row) => (
              <div key={row.id} className="flex items-center justify-between gap-2 border-t border-[var(--border)] py-2 text-xs">
                <span className="font-semibold">{row.userName || row.userEmail}</span>
                <span className="text-slate-500">
                  {row.strategyName}
                  {row.term ? ` · ${row.term}` : ""}
                  {row.utr ? ` · UTR ${row.utr}` : ""}
                  {row.startedAt ? ` · ${row.startedAt.slice(0, 10)} to ${(row.endsAt || "").slice(0, 10)}` : ""}
                </span>
                <span className="uppercase">{row.status}</span>
                {row.status === "claimed" || row.status === "pending" ? (
                  <button
                    type="button"
                    disabled={Boolean(confirmBusy)}
                    onClick={() => {
                      setConfirmBusy(row.id);
                      void confirmEnrollmentPaid(row.id)
                        .then((next) => {
                          setEnrolls((items) => items.map((item) => (item.id === next.enrollment.id ? next.enrollment : item)));
                        })
                        .catch(() => undefined)
                        .finally(() => setConfirmBusy(""));
                    }}
                    className="h-8 rounded-md bg-brand-500 px-2 text-[11px] font-semibold text-white disabled:opacity-50"
                  >
                    {confirmBusy === row.id ? "Confirming..." : "Confirm payment"}
                  </button>
                ) : null}
              </div>
            ))}
        </div>
      ) : (
        <p className="mt-3 text-xs font-medium text-slate-400">No member enrollments yet.</p>
      )}
      {topups.length ? (
        <div className="mt-4 overflow-x-auto">
          <div className="mb-2 text-xs font-bold uppercase text-slate-400">Wallet top-ups</div>
          {topups.slice(0, 12).map((row) => (
            <div key={row.id} className="flex justify-between gap-2 border-t border-[var(--border)] py-2 text-xs">
              <span className="font-semibold">{row.userName || row.userEmail}</span>
              <span className="text-slate-500">₹{row.amount}</span>
              <span className="uppercase">{row.status}</span>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function adminTermHint(monthlyText: string, priceText: string, term: PlanTerm) {
  const monthly = Number(monthlyText);
  const price = Number(priceText);
  if (!(monthly >= 1) || !(price >= 1) || term === "monthly") return "";
  const full = monthly * TERM_MONTHS[term];
  const save = Math.max(0, full - price);
  if (save <= 0) return `${TERM_MONTHS[term]} months at monthly rate ${formatRupee(full, 0)}`;
  return `${TERM_MONTHS[term]} months at monthly rate ${formatRupee(full, 0)} · save ${formatRupee(save, 0)}`;
}
