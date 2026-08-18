import { optionChain } from "../data/mock";
import { cn, formatNumber, formatPct } from "../lib/format";

const strikes = [24200, 24300, 24400, 24500, 24600, 24700, 24800].map((strike) => {
  const row = optionChain.find((item) => item.strike === strike);
  const dist = (strike - 24580) / 80;
  return {
    strike,
    callOi: Math.round(18_40_000 - dist * 1_20_000),
    callLtp: row?.callLtp ?? Math.max(12, 142 - dist * 28),
    callChg: row?.callChg ?? 4.2 - dist,
    putLtp: row?.putLtp ?? Math.max(12, 62 + dist * 22),
    putChg: row?.putChg ?? -6.1 + dist,
    putOi: Math.round(16_20_000 + dist * 90_000),
    atm: strike === 24500,
  };
});

export function Options() {
  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-xl font-bold">Options</h1>
        <p className="text-sm text-slate-400">NIFTY option chain · Expiry 28 Aug 2026</p>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="PCR" value="0.86" />
        <Stat label="Max Pain" value="24,500" />
        <Stat label="ATM IV" value="12.4%" />
        <Stat label="Spot" value="24,580.25" />
      </div>
      <section className="card overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-xs">
          <thead className="bg-[var(--bg)] text-[10px] uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-4 py-3 font-semibold">Call OI</th>
              <th className="px-4 py-3 font-semibold">Call LTP</th>
              <th className="px-4 py-3 font-semibold">Chg</th>
              <th className="px-4 py-3 text-center font-semibold">Strike</th>
              <th className="px-4 py-3 text-right font-semibold">Chg</th>
              <th className="px-4 py-3 text-right font-semibold">Put LTP</th>
              <th className="px-4 py-3 text-right font-semibold">Put OI</th>
            </tr>
          </thead>
          <tbody>
            {strikes.map((row) => (
              <tr key={row.strike} className={cn("soft-row", row.atm && "bg-brand-50/80 dark:bg-brand-500/10")}>
                <td className="px-4 py-3">{row.callOi.toLocaleString("en-IN")}</td>
                <td className="px-4 py-3 font-semibold">{formatNumber(row.callLtp)}</td>
                <td className={cn("px-4 py-3", row.callChg >= 0 ? "text-up" : "text-down")}>{formatPct(row.callChg)}</td>
                <td className="px-4 py-3 text-center font-bold">{row.strike}</td>
                <td className={cn("px-4 py-3 text-right", row.putChg >= 0 ? "text-up" : "text-down")}>{formatPct(row.putChg)}</td>
                <td className="px-4 py-3 text-right font-semibold">{formatNumber(row.putLtp)}</td>
                <td className="px-4 py-3 text-right">{row.putOi.toLocaleString("en-IN")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card px-4 py-3">
      <div className="text-[11px] font-semibold uppercase text-slate-400">{label}</div>
      <div className="mt-1 text-lg font-bold">{value}</div>
    </div>
  );
}
