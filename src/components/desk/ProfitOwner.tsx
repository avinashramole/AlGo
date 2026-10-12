import { formatMobile } from "../../lib/format";

export function ProfitOwnerCard({
  name,
  email,
  mobile,
  brokerName,
  position,
}: {
  name?: string;
  email?: string;
  mobile?: string;
  brokerName?: string;
  position?: string;
}) {
  return (
    <section className="card p-4" data-profit-owner={position || "User"}>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Field label="Name" value={name} />
        <Field label="Email" value={email} />
        <Field label="Mobile" value={formatMobile(mobile)} />
        <Field label="Broker" value={brokerName} />
        <Field label="Position" value={position === "Admin" ? "Admin" : "User"} />
      </div>
    </section>
  );
}

function Field({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">{label}</div>
      <div className="mt-1 truncate text-sm font-semibold">{value || "—"}</div>
    </div>
  );
}
