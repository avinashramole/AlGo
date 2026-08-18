export function Settings() {
  return (
    <div className="mx-auto max-w-2xl space-y-3">
      <h1 className="text-xl font-bold">Settings</h1>
      <section className="card divide-y divide-[var(--border)]">
        {[
          ["Default product", "MIS"],
          ["Order confirmation", "Enabled"],
          ["Risk guard", "Max 2% per trade"],
          ["Broker", "Paper trading"],
          ["Notifications", "Signals + fills"],
        ].map(([label, value]) => (
          <div key={label} className="flex items-center justify-between px-4 py-3">
            <span className="text-sm">{label}</span>
            <span className="text-sm font-semibold text-slate-500">{value}</span>
          </div>
        ))}
      </section>
    </div>
  );
}
