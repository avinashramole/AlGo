import { useMarket } from "../../context/MarketContext";

export function IndexIds() {
  const { data } = useMarket();
  const rows = data.contracts?.indices || [];

  if (!rows.length) return null;

  return (
    <section className="card overflow-x-auto p-4">
      <div className="mb-3">
        <div className="text-sm font-bold">Index quote IDs</div>
        <p className="text-xs text-slate-400">
          These Dhan IDs are for live quotes only (IDX_I). Live BUY/SELL uses the future or option ID below.
        </p>
      </div>
      <table className="w-full min-w-[560px] text-left text-xs">
        <thead className="text-[10px] uppercase tracking-wide text-slate-400">
          <tr>
            <th className="pb-2 font-semibold">Index</th>
            <th className="pb-2 font-semibold">Security ID</th>
            <th className="pb-2 font-semibold">Segment</th>
            <th className="pb-2 text-right font-semibold">Lot</th>
            <th className="pb-2 text-right font-semibold">Trade</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.root} className="soft-row">
              <td className="py-2 font-semibold">{row.symbol}</td>
              <td className="py-2 font-mono font-bold">{row.securityId}</td>
              <td className="py-2 text-slate-500">{row.segment}</td>
              <td className="py-2 text-right">{row.lot}</td>
              <td className="py-2 text-right text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                Quotes only
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
