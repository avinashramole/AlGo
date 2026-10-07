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

export function MemberEnrollments() {
  const { user, applyUser } = useAuth();
  const [payMobile, setPayMobile] = useState("");
  const [payUpi, setPayUpi] = useState("");
  const [payAmount, setPayAmount] = useState("999");
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
        setPayAmount(String(row.payments.amount || 999));
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
      amount: Number(payAmount),
      payeeName: payName,
    })
      .then(async (row) => {
        setPayMobile(row.payments.mobile);
        setPayUpi(row.payments.upiId);
        setPayAmount(String(row.payments.amount));
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
        Members pay this monthly amount — or 3× quarterly / 12× yearly — to your GPay or PhonePe mobile when they tap
        Enroll. After a member taps I have paid, confirm the transfer here. Live copy starts only after you confirm.
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
        <input
          className="h-10 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 text-sm"
          value={payAmount}
          onChange={(event) => setPayAmount(event.target.value)}
          placeholder="Amount ₹"
        />
        <button type="submit" disabled={payBusy} className="h-10 rounded-xl bg-brand-500 text-sm font-semibold text-white sm:col-span-2">
          {payBusy ? "Saving..." : "Save payment number"}
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
