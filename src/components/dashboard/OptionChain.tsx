import { Link } from "react-router-dom";
import { useMarket } from "../../context/MarketContext";
import { cn, formatNumber, formatPct } from "../../lib/format";

export function OptionChain() {
  const { data } = useMarket();
  const rows = (data.optionChain || []).filter((_row, index, list) => {
    const atm = list.findIndex((item) => item.atm);
    if (atm < 0) return index < 5;
    return Math.abs(index - atm) <= 2;
  });
  const spot = data.optionMeta?.spot || data.indices[0]?.price || 0;

  return (
    <section className="card overflow-hidden p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-sm font-bold">Option Chain</div>
        <Link to="/options" className="text-[11px] font-semibold text-brand-500">
          {data.optionMeta?.symbol || "NIFTY"} · {data.optionMeta?.expiryLabel || data.optionMeta?.expiry || "expiry"} · Spot{" "}
          {formatNumber(spot, 0)} →
        </Link>
      </div>
      <table className="w-full text-left text-xs">
        <thead className="text-[10px] uppercase tracking-wide text-slate-400">
          <tr>
            <th className="pb-2 font-semibold">Call</th>
            <th className="pb-2 text-center font-semibold">Strike</th>
            <th className="pb-2 text-right font-semibold">Put</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.strike} className={cn("soft-row", row.atm && "bg-brand-50/70 dark:bg-brand-500/10")}>
              <td className="py-2.5">
                <div className="font-semibold">{formatNumber(row.callLtp)}</div>
                <div className={cn("text-[10px]", row.callChg >= 0 ? "text-up" : "text-down")}>{formatPct(row.callChg)}</div>
              </td>
              <td className="py-2.5 text-center">
                <div className="inline-flex rounded-md bg-[var(--bg)] px-2 py-1 font-bold">{row.strike}</div>
              </td>
              <td className="py-2.5 text-right">
                <div className="font-semibold">{formatNumber(row.putLtp)}</div>
                <div className={cn("text-[10px]", row.putChg >= 0 ? "text-up" : "text-down")}>{formatPct(row.putChg)}</div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
