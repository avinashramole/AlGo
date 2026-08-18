import { useState } from "react";
import { useMarket } from "../../context/MarketContext";

export function FuturesTape() {
  const { data, order } = useMarket();
  const [busy, setBusy] = useState("");
  const [note, setNote] = useState("");
  const rows = data.futures || [];

  const trade = async (row: (typeof rows)[number], side: "BUY" | "SELL") => {
    const key = `${row.root}-${row.expiry}-${side}`;
    setBusy(key);
    setNote("");
    try {
      const result = await order({
        symbol: row.symbol,
        name: row.name,
        kind: "future",
        side,
        qty: row.qty || row.lot || 65,
        lots: 1,
        price: data.indices.find((item) => item.symbol === row.parent)?.future,
        product: "MIS",
        type: "MARKET",
        brokerId: data.activeBrokerId,
        expiry: row.expiry,
        exchangeSegment: row.segment,
      });
      setNote(
        result.live
          ? `Sent to Dhan · ${side} ${row.name}`
          : result.warning || `Desk fill · ${side} ${row.name}`,
      );
    } catch (err) {
      setNote(err instanceof Error ? err.message : "Order failed");
    } finally {
      setBusy("");
    }
  };

  if (!rows.length) {
    return (
      <section className="card p-4">
        <div className="text-sm font-bold">Index futures</div>
        <p className="mt-2 text-xs text-slate-400">Loading live index futures…</p>
      </section>
    );
  }

  return (
    <section className="card overflow-x-auto p-4">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <div className="text-sm font-bold">Index futures</div>
          <p className="text-xs text-slate-400">
            Front-month and later contracts. BUY/SELL is 1 lot MIS on Dhan when LIVE. The desk looks up the contract on
            the server.
          </p>
        </div>
        {note ? <div className="text-xs font-semibold text-slate-500">{note}</div> : null}
      </div>
      <table className="w-full min-w-[640px] text-left text-xs">
        <thead className="text-[10px] uppercase tracking-wide text-slate-400">
          <tr>
            <th className="pb-2 font-semibold">Contract</th>
            <th className="pb-2 font-semibold">Expiry</th>
            <th className="pb-2 font-semibold">Segment</th>
            <th className="pb-2 text-right font-semibold">Lot</th>
            <th className="pb-2 text-right font-semibold">Trade</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.root}-${row.expiry}`} className="soft-row">
              <td className="py-2 font-semibold">
                {row.symbol}
                {row.front ? (
                  <span className="ml-2 rounded bg-emerald-50 px-1.5 py-0.5 text-[9px] font-extrabold text-up dark:bg-emerald-950/40">
                    FRONT
                  </span>
                ) : null}
              </td>
              <td className="py-2 text-slate-500">{row.expiry || "—"}</td>
              <td className="py-2 text-slate-500">{row.segment}</td>
              <td className="py-2 text-right">{row.lot}</td>
              <td className="py-2 text-right">
                <div className="inline-flex gap-1">
                  <button
                    type="button"
                    disabled={Boolean(busy)}
                    onClick={() => void trade(row, "BUY")}
                    className="h-7 rounded-md bg-emerald-500 px-2 text-[10px] font-bold text-white disabled:opacity-50"
                  >
                    {busy === `${row.root}-${row.expiry}-BUY` ? "..." : "BUY"}
                  </button>
                  <button
                    type="button"
                    disabled={Boolean(busy)}
                    onClick={() => void trade(row, "SELL")}
                    className="h-7 rounded-md bg-rose-500 px-2 text-[10px] font-bold text-white disabled:opacity-50"
                  >
                    {busy === `${row.root}-${row.expiry}-SELL` ? "..." : "SELL"}
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
