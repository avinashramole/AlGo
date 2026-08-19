import { useState } from "react";
import { useMarket } from "../../context/MarketContext";
import { cn, formatNumber, vwapTone } from "../../lib/format";

function futureQuotes(
  row: { parent?: string; root?: string },
  indices: Array<{ symbol: string; future?: number; vwap?: number; futureVwap?: number; price: number }>,
) {
  const index =
    indices.find((item) => item.symbol === row.parent) ||
    indices.find((item) => item.symbol === row.root) ||
    indices.find((item) => row.root === "NIFTY" && item.symbol === "NIFTY 50");
  const ltp = Number(index?.future) > 0 ? Number(index?.future) : Number(index?.price) || 0;
  const vwap = Number(index?.futureVwap || index?.vwap) > 0 ? Number(index?.futureVwap || index?.vwap) : ltp;
  return { ltp, vwap };
}

export function FuturesTape() {
  const { data, order } = useMarket();
  const [busy, setBusy] = useState("");
  const [note, setNote] = useState("");
  const [noteFail, setNoteFail] = useState(false);
  const rows = (data.futures || []).filter((row) => row.front);

  const trade = async (row: (typeof rows)[number], side: "BUY" | "SELL") => {
    const key = `${row.root}-${row.expiry}-${side}`;
    setBusy(key);
    setNote("");
    setNoteFail(false);
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
          ? `${result.afterMarketOrder ? "Queued at Dhan for next open (AMO)" : "Sent to Dhan"} · ${side} ${row.name}`
          : result.warning || `Desk fill · ${side} ${row.name}`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Order failed";
      setNoteFail(true);
      setNote(message);
      window.alert(message);
    } finally {
      setBusy("");
    }
  };

  if (!rows.length) {
    return (
      <section className="card p-4">
        <div className="text-sm font-bold">Index futures</div>
        <p className="mt-2 text-xs text-slate-400">Loading this month’s index futures…</p>
      </section>
    );
  }

  return (
    <section className="card overflow-x-auto p-4">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <div className="text-sm font-bold">Index futures · current month</div>
          <p className="text-xs text-slate-400">
            Front-month contract only. BUY/SELL is 1 lot MIS on Dhan when LIVE. The desk looks up the contract on the
            server.
          </p>
        </div>
        {note ? (
          <div className={`text-xs font-semibold ${noteFail ? "text-down" : "text-slate-500"}`}>{note}</div>
        ) : null}
      </div>
      <table className="w-full min-w-[760px] text-left text-xs">
        <thead className="text-[10px] uppercase tracking-wide text-slate-400">
          <tr>
            <th className="pb-2 font-semibold">Contract</th>
            <th className="pb-2 font-semibold">Expiry</th>
            <th className="pb-2 font-semibold">Segment</th>
            <th className="pb-2 text-right font-semibold">LTP</th>
            <th className="pb-2 text-right font-semibold">VWAP</th>
            <th className="pb-2 text-right font-semibold">Lot</th>
            <th className="pb-2 text-right font-semibold">Trade</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const quotes = futureQuotes(row, data.indices);
            return (
              <tr key={`${row.root}-${row.expiry}`} className="soft-row">
                <td className="py-2 font-semibold">{row.symbol}</td>
                <td className="py-2 text-slate-500">{row.expiry || "—"}</td>
                <td className="py-2 text-slate-500">{row.segment}</td>
                <td className="py-2 text-right font-bold">{formatNumber(quotes.ltp)}</td>
                <td className={cn("py-2 text-right font-semibold", vwapTone(quotes.vwap, quotes.ltp))}>
                  {formatNumber(quotes.vwap)}
                </td>
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
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
